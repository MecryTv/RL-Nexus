import type { EntryKind, IEntry, IRoleState } from "../../shared/partners.ts";
import { audit, type IActor } from "../audit.ts";
import type { IConfig } from "../config.ts";
import { databaseReady, query } from "../db.ts";
import { DiscordUnavailable, fetchMember, fetchRoles, setMemberRole } from "../discord.ts";
import { grantGroupIfNone, groupOf, revokeGroupIf } from "../groups.ts";
import { entriesOfContact, roleStateOf, setGroupGranted, setRoleState } from "./store.ts";

/**
 * Rolle @Partner und Gruppe Partner (W-0062, Spec Teil 7). Die Rolle bekommt,
 * wer die Gruppe Partner hat oder Ansprechpartner eines Partners oder Sponsors
 * ist. Weggenommen wird nur nach einer Aktion (mayRemove), nie vom Zeitgeber.
 */

const REASON = "RL Nexus Partner";
const SYSTEM: IActor = { id: "0", name: "Rolle @Partner" };

export function wantsPartnerRole(input: { readonly group: string | null; readonly contactOf: readonly { readonly kind: EntryKind; readonly visible: boolean }[] }): boolean {
    return input.group === "partner" || input.contactOf.some((entry) => entry.kind !== "supporter");
}

const none: IRoleState = { state: "none", note: null, since: null };

async function remember(userId: string, state: "given" | "pending" | "missing" | "removing" | null, note: string | null = null): Promise<IRoleState> {
    await setRoleState(userId, state, note);

    return state === null ? none : { state, note, since: new Date().toISOString() };
}

/** Bringt die Rolle einer Person auf den gewünschten Stand und merkt sich, wie es steht. */
export async function syncPartnerRole(config: IConfig, userId: string, options: { readonly mayRemove: boolean; readonly actor?: IActor }): Promise<IRoleState> {
    const roleId = config.partnerRoleId;
    const want = wantsPartnerRole({ group: await groupOf(userId), contactOf: await entriesOfContact(userId) });
    // Ein Wegnehmen, das nach einer Aktion scheiterte, holt auch der Zeitgeber nach (Review-Fund 5).
    const mayRemove = options.mayRemove || (await roleStateOf(userId)) === "removing";

    if (!roleId) return want ? remember(userId, "missing", "Keine Test-Rolle eingestellt (DEV_PARTNER_ROLE_ID).") : remember(userId, null);

    let roles: readonly string[] | null;

    try {
        roles = (await fetchMember(config, userId))?.roles ?? null;
    } catch (error) {
        if (!(error instanceof DiscordUnavailable)) throw error;

        if (want) return remember(userId, "missing", "Discord ist gerade nicht erreichbar.");

        return mayRemove ? remember(userId, "removing", "Discord war nicht erreichbar, die Rolle wird später entfernt.") : remember(userId, null);
    }

    if (roles === null) return want ? remember(userId, "pending") : remember(userId, null);

    const has = roles.includes(roleId);

    try {
        if (want && !has) {
            await setMemberRole(config, userId, roleId, true, REASON);
            await audit(options.actor ?? SYSTEM, "partner.role.give", userId);
        }

        if (!want && has && mayRemove) {
            await setMemberRole(config, userId, roleId, false, REASON);
            await audit(options.actor ?? SYSTEM, "partner.role.take", userId);
        }
    } catch (error) {
        if (!(error instanceof DiscordUnavailable)) throw error;

        return remember(userId, want ? "missing" : "removing", error.message);
    }

    return want ? remember(userId, "given") : remember(userId, null);
}

/**
 * Nach dem Speichern oder Löschen eines Eintrags: Gruppe Partner bei Free Access
 * vergeben (nie über eine vorhandene Gruppe), eine vergebene Gruppe wieder
 * nehmen, wenn sie nichts mehr trägt, und die Rolle für alte und neue Person
 * abgleichen. next ist null, wenn der Eintrag gelöscht wurde.
 */
export async function applyContact(config: IConfig, next: IEntry | null, previous: IEntry | null, actor: IActor): Promise<void> {
    const oldId = previous && previous.kind !== "supporter" ? previous.contactId : null;
    const newId = next && next.kind !== "supporter" ? next.contactId : null;
    const wantsGroup = next !== null && newId !== null && next.access === "free";
    const keeps = Boolean(previous?.groupGranted) && wantsGroup && oldId === newId;

    const granted = Boolean(next && wantsGroup && !keeps && newId && (await grantGroupIfNone(actor, newId, "partner", `Partner/Sponsoring: ${next.name}`)));

    if (next && newId && granted) {
        await setGroupGranted(next.id, true);
        await audit(actor, "group.grant", newId, `partner: ${next.name}`);
    }

    if (previous?.groupGranted && oldId && !keeps) {
        // Hat dieser Aufruf dem neuen Ansprechpartner die Gruppe gegeben, bleibt die Markierung (Review-Fund 1).
        if (next && !granted) await setGroupGranted(next.id, false);

        const others = (await entriesOfContact(oldId)).filter((entry) => entry.id !== previous.id && entry.kind !== "supporter" && entry.access === "free");

        if (others[0]) await setGroupGranted(others[0].id, true);
        else if (await revokeGroupIf(oldId, "partner")) await audit(actor, "group.revoke", oldId, `partner: ${previous.name}`);
    }

    for (const userId of new Set([oldId, newId].filter((id): id is string => id !== null))) {
        await syncPartnerRole(config, userId, { mayRemove: true, actor });
    }
}

/** Steht die Rolle des Bots über @Partner? Für die Vorab-Prüfung im Anlege-Dialog. */
export async function checkAssignable(config: IConfig): Promise<{ readonly canAssign: boolean; readonly reason: string | null }> {
    if (!config.partnerRoleId) return { canAssign: false, reason: "Keine Test-Rolle eingestellt (DEV_PARTNER_ROLE_ID)." };

    try {
        const roles = await fetchRoles(config);
        const partner = roles.find((role) => role.id === config.partnerRoleId);

        if (!partner) return { canAssign: false, reason: "Die Rolle @Partner gibt es auf dem Server nicht." };

        const mine = (await fetchMember(config, config.clientId))?.roles ?? [];
        const top = Math.max(0, ...roles.filter((role) => mine.includes(role.id)).map((role) => role.position));

        if (top <= partner.position) return { canAssign: false, reason: "Die Rolle des Bots steht unter @Partner. Zieh sie in den Servereinstellungen darüber." };

        return { canAssign: true, reason: null };
    } catch (error) {
        if (error instanceof DiscordUnavailable) return { canAssign: false, reason: error.message };

        throw error;
    }
}

/** Alle, die die Rolle haben sollten: Gruppe Partner und Ansprechpartner von Partnern und Sponsoren. */
async function wantedPeople(): Promise<string[]> {
    const rows = await query<{ user_id: string }[]>(
        `SELECT user_id FROM dashboard_groups WHERE group_name = 'partner'
         UNION SELECT contact_id FROM partner_entries WHERE contact_id IS NOT NULL AND kind <> 'supporter'`
    );

    return rows.map((row) => row.user_id);
}

async function pendingPeople(): Promise<string[]> {
    return (await query<{ user_id: string }[]>("SELECT user_id FROM partner_roles WHERE state IN ('pending', 'missing', 'removing')")).map((row) => row.user_id);
}

async function round(config: IConfig, people: () => Promise<string[]>): Promise<void> {
    if (!databaseReady()) return;

    try {
        for (const userId of await people()) await syncPartnerRole(config, userId, { mayRemove: false });
    } catch (error) {
        console.warn("[partner] Abgleich der Rolle @Partner:", (error as Error).message);
    }
}

let timer: NodeJS.Timeout | null = null;

/** Beim Start einmal alle nur dazugeben, danach alle 5 Minuten, wer noch wartet. */
export function schedulePartnerRoles(config: IConfig): void {
    if (timer !== null) return;

    setTimeout(() => void round(config, wantedPeople), 30_000).unref();
    timer = setInterval(() => void round(config, pendingPeople), 5 * 60_000);
    timer.unref();
}
