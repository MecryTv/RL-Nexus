import { BLOCK_LABELS, normalScope, type Block } from "../../shared/security.ts";
import { checkMember } from "../access.ts";
import { audit } from "../audit.ts";
import { botLeave, botSecurityReload } from "../bot.ts";
import type { IConfig } from "../config.ts";
import { query, withTransaction } from "../db.ts";
import { PublicError } from "../errors.ts";
import { publish } from "../events.ts";
import { markLeft } from "../servers/store.ts";
import { lookupUser } from "../users.ts";
import { personBase } from "../userdata/flow.ts";
import { banDmKind, sendBanDm } from "./dm.ts";
import * as store from "./store.ts";

/**
 * Sperren, ändern, aufheben (W-0057, Spec Teil 4). Jede Änderung steht in
 * security_ban_changes und im Protokoll, die Person bekommt genau eine DM,
 * der Bot lädt danach seine Sperrliste neu. „Bot verlässt“ nutzt
 * server_blocks aus W-0064.
 */

export interface ISecurityActor {
    readonly id: string;
    readonly name: string;
    readonly role: "Developer" | "Administrator";
}

export interface IBanInput {
    readonly userId: string;
    readonly scope: readonly Block[];
    readonly reasons: readonly string[];
    readonly note: string;
    /** Server der Person, die der Bot verlässt (E2). */
    readonly leave: readonly string[];
    /** Verdachtskonten mit derselben Sperre. */
    readonly linked: readonly string[];
    /** Aus einem Verdachtsfall: die bestehende Sperre, auf die diese verweist. */
    readonly ref?: number | null;
}

const scopeText = (scope: readonly Block[]): string => scope.map((block) => BLOCK_LABELS[block]).join(", ") || "nichts";

/** Team (Administrator, Developer) lässt sich nicht sperren. */
export async function isTeam(config: IConfig, userId: string, force = false): Promise<boolean> {
    if (config.devUserIds.includes(userId)) return true;

    const row = (await query<{ group_name: string }[]>("SELECT group_name FROM dashboard_groups WHERE user_id = ?", [userId]).catch(() => []))[0];
    if (row?.group_name === "administrator") return true;

    // Admin und Developer im Admin Dashboard sind Discord-Rollen (access.ts). Antwortet Discord nicht, wirft das: dann lieber nicht sperren.
    return (await checkMember(config, userId, { name: userId, avatar: null }, { force })).role !== null;
}

/** Server, die der Person gehören. Nur dort darf „Bot verlässt“ greifen (E2). */
async function ownedGuilds(userId: string): Promise<Set<string>> {
    return new Set((await query<{ guild_id: string }[]>("SELECT guild_id FROM server_invites WHERE owner_id = ?", [userId])).map((row) => row.guild_id));
}

async function change(banId: number, action: "ban" | "change" | "lift" | "server" | "dm", before: string | null, after: string | null, note: string | null, actor: { readonly id: string; readonly name: string }): Promise<void> {
    await query("INSERT INTO security_ban_changes (ban_id, action, before_val, after_val, note, by_id, by_name) VALUES (?, ?, ?, ?, ?, ?, ?)", [
        banId,
        action,
        before?.slice(0, 200) ?? null,
        after?.slice(0, 200) ?? null,
        note?.slice(0, 500) ?? null,
        actor.id,
        actor.name.slice(0, 100),
    ]);
}

async function dm(config: IConfig, banId: number, userId: string, before: Block[] | null, after: Block[] | null, actor: ISecurityActor): Promise<string | null> {
    const person = await personBase(config, userId, null);
    const error = await sendBanDm(config, userId, { kind: banDmKind(before, after), person, scope: after ?? [], at: new Date() });

    await change(banId, "dm", null, null, error ? `nicht zugestellt: ${error}` : "zugestellt", actor);

    return error;
}

/** „Bot verlässt“ an: Sperrliste, dann verlassen (Log-Kanal bekommt den Satz). */
async function leaveServer(config: IConfig, banId: number, guildId: string, actor: ISecurityActor): Promise<void> {
    // IGNORE: Eine Sperre aus W-0064 (Entfernen) bleibt, wie sie ist, und fällt beim Aufheben nicht mit weg.
    await query("INSERT IGNORE INTO server_blocks (guild_id, blocked_by, by_name, reason, origin, ban_id) VALUES (?, ?, ?, 'Besitzer gesperrt', 'ban', ?)", [guildId, actor.id, actor.name.slice(0, 100), banId]);

    // Neutral (Nutzer, 03.11.): Alle Mitglieder lesen den Satz im Log-Kanal.
    const left = await botLeave(config, guildId, "RL Nexus verlässt diesen Server. Das hat das Team von RL Nexus entschieden.", actor.id);

    if (left !== false) await markLeft(guildId, "blocked");
    await change(banId, "server", null, guildId, left === false ? "Bot verlässt, aber der Bot antwortet nicht (der Abgleich holt es nach)" : "Bot verlässt", actor);
}

/** „Bot verlässt“ aus: Der Server darf den Bot wieder einladen, der Bot tritt nicht von selbst bei. */
async function allowServer(banId: number, guildId: string, actor: ISecurityActor): Promise<void> {
    await query("DELETE FROM server_blocks WHERE guild_id = ? AND origin = 'ban' AND ban_id = ?", [guildId, banId]);
    await change(banId, "server", guildId, null, "Bot darf wieder", actor);
}

export async function banPeople(config: IConfig, input: IBanInput, actor: ISecurityActor): Promise<{ readonly banIds: number[]; readonly undelivered: number }> {
    const scope = normalScope(input.scope);
    const people = [input.userId, ...input.linked.filter((id) => id !== input.userId)];

    if (scope.length === 0) throw new PublicError(400, "Mindestens ein Baustein muss gesperrt sein.");
    if (input.reasons.length === 0 && !input.note.trim()) throw new PublicError(400, "Bitte einen Grund wählen oder dazuschreiben.");

    for (const userId of people) {
        if (await isTeam(config, userId, true)) throw new PublicError(409, "Mitglieder des Teams lassen sich nicht sperren.");
        if (await store.activeBanOf(userId)) throw new PublicError(409, `${userId} ist schon gesperrt. Ändere die Sperre im Profil.`);
    }

    const banIds: number[] = [];

    for (const userId of people) {
        const name = (await lookupUser(config, userId).catch(() => null))?.name ?? null;
        const linkedTo = banIds[0] ?? input.ref ?? null;

        const id = await withTransaction(async (tx) => {
            const result = await tx<{ insertId: number | bigint }>(
                "INSERT INTO security_bans (user_id, user_name, scope, reasons, note, linked_to, created_by, created_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                [userId, name?.slice(0, 100) ?? null, scope.join(","), input.reasons.join(",").slice(0, 200), input.note.trim() || null, linkedTo, actor.id, actor.name.slice(0, 100)]
            );
            const banId = Number(result.insertId);

            // Die Kürzel der letzten Anmeldungen bleiben mit der Sperre (Spec: „Was gespeichert wird“).
            await tx("INSERT IGNORE INTO security_ban_hashes (ban_id, ip_hash, net_hash) SELECT ?, ip_hash, MIN(net_hash) FROM security_logins WHERE user_id = ? GROUP BY ip_hash", [banId, userId]);
            await tx("UPDATE security_suspects SET state = 'banned', closed_by = ?, closed_at = CURRENT_TIMESTAMP(3) WHERE user_id = ? AND state = 'open'", [actor.id, userId]);

            return banId;
        });

        banIds.push(id);
        await change(id, "ban", null, scope.join(","), linkedTo ? `verknüpft mit Sperre ${linkedTo}` : input.reasons.join(", "), actor);
        await audit(actor, "security.ban", userId, `${scopeText(scope)} als ${actor.role}${linkedTo ? `, verknüpft mit Sperre ${linkedTo}` : ""}`.slice(0, 500));
    }

    // Erst der Bot, dann die DM: Wer „antwortet dir nicht mehr“ liest, bekommt auch keine Antwort mehr.
    await botSecurityReload(config, actor.id);

    const owned = await ownedGuilds(input.userId);

    for (const guildId of input.leave.filter((id) => owned.has(id))) await leaveServer(config, banIds[0]!, guildId, actor);

    let undelivered = 0;

    for (const [index, userId] of people.entries()) {
        if (await dm(config, banIds[index]!, userId, null, scope, actor)) undelivered++;
    }

    publish("security");

    return { banIds, undelivered };
}

async function activeBan(banId: number): Promise<store.IBanRow> {
    const row = (await query<store.IBanRow[]>("SELECT * FROM security_bans WHERE id = ?", [banId]))[0];
    if (!row || row.state !== "active") throw new PublicError(404, "Diese Sperre gibt es nicht mehr.");

    return row;
}

export interface IChangeInput {
    readonly scope: readonly Block[];
    readonly note: string;
    readonly leave: readonly string[];
    readonly allow: readonly string[];
}

export async function changeBan(config: IConfig, banId: number, input: IChangeInput, actor: ISecurityActor): Promise<void> {
    const row = await activeBan(banId);
    const before = store.scopeOfRow(row);
    const after = normalScope(input.scope);

    if (after.length === 0) throw new PublicError(400, "Mindestens ein Baustein muss gesperrt bleiben. Sonst hebe die Sperre auf.");
    if (!input.note.trim()) throw new PublicError(400, "Bitte kurz dazuschreiben, warum sich die Sperre ändert.");

    const changed = before.join(",") !== after.join(",");

    if (changed) {
        // Nur vom gelesenen Stand aus: Zwei gleichzeitige Änderungen schicken sonst zwei DMs.
        const result = await query<{ affectedRows: number }>("UPDATE security_bans SET scope = ?, changed_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND state = 'active' AND scope = ?", [after.join(","), banId, row.scope]);
        if (result.affectedRows !== 1) throw new PublicError(409, "Diese Sperre hat sich inzwischen geändert. Lade das Profil neu.");

        await botSecurityReload(config, actor.id);
        await change(banId, "change", before.join(","), after.join(","), input.note, actor);
        await audit(actor, "security.change", row.user_id, `${scopeText(before)} → ${scopeText(after)} als ${actor.role}: ${input.note}`.slice(0, 500));
    }

    const owned = await ownedGuilds(row.user_id);

    for (const guildId of input.leave.filter((id) => owned.has(id))) await leaveServer(config, banId, guildId, actor);
    for (const guildId of input.allow) await allowServer(banId, guildId, actor);

    if (changed) await dm(config, banId, row.user_id, before, after, actor);

    publish("security");
}

export async function liftBan(config: IConfig, banId: number, note: string, actor: ISecurityActor): Promise<void> {
    const row = await activeBan(banId);

    if (!note.trim()) throw new PublicError(400, "Bitte kurz dazuschreiben, warum die Sperre aufgehoben wird.");

    const result = await query<{ affectedRows: number }>("UPDATE security_bans SET state = 'lifted', lifted_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND state = 'active'", [banId]);
    if (result.affectedRows !== 1) throw new PublicError(404, "Diese Sperre gibt es nicht mehr.");

    // Beim Aufheben fallen alle Server-Schalter weg, die Kürzel auch: Verglichen wird nur mit aktiven Sperren.
    await query("DELETE FROM server_blocks WHERE origin = 'ban' AND ban_id = ?", [banId]);
    await query("DELETE FROM security_ban_hashes WHERE ban_id = ?", [banId]);
    await botSecurityReload(config, actor.id);
    await change(banId, "lift", row.scope, null, note, actor);
    await audit(actor, "security.lift", row.user_id, `als ${actor.role}: ${note}`.slice(0, 500));
    await dm(config, banId, row.user_id, store.scopeOfRow(row), null, actor);
    publish("security");
}

/** Verdacht „Passt“: Fall geschlossen, nichts passiert mit dem Konto. */
export async function clearSuspect(suspectId: number, actor: ISecurityActor): Promise<void> {
    const result = await query<{ affectedRows: number }>("UPDATE security_suspects SET state = 'ok', closed_by = ?, closed_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND state = 'open'", [actor.id, suspectId]);
    if (result.affectedRows !== 1) throw new PublicError(409, "Dieser Verdacht ist schon entschieden.");

    await audit(actor, "security.suspect", String(suspectId), `Passt, als ${actor.role}`);
    publish("security");
}
