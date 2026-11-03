import { Guild, PermissionFlagsBits } from "discord.js";
import BotClient from "../client/BotClient";

/**
 * W-0064, Punkt 4 und 5: Freigabe-Pass beim Einladen und die Sperre für
 * Commands ohne Ansprechpartner. Ansprechpartner sind dieselben Leute, die die
 * Staff-Freigabe fragt (StaffGrantService.Askees): bei Free der Owner, bei
 * Paid und Beta wer Zugang hat.
 */

export const PASS_MINUTES = 15;
/** Mit Ansprechpartner gilt das einen Tag (Prüfung „täglich“), ohne nur 5 Minuten, damit ein Kauf schnell wirkt. */
export const GATE_OK_TTL = 24 * 3_600_000;
export const GATE_NO_TTL = 5 * 60_000;
/** Länger wartet ein Command ohne gespeichertes Ergebnis nicht auf die Prüfung, dann läuft er. */
const GATE_WAIT = 1_000;

export function PassUsable(row: { expires_at: number | string; used_at: number | string | null }, now: number): boolean {
    return row.used_at === null && Number(row.expires_at) > now;
}

export type RefuseReason = "pass" | "contact";

/** Warum der Bot einen neuen Server gleich wieder verlässt. null: Er bleibt. contacts null heißt: unbekannt, dann bleibt er. */
export function RefuseFor(input: { pass: boolean; team: boolean; contacts: number | null }): RefuseReason | null {
    // Hat das Team eingeladen, ist es selbst der Ansprechpartner.
    if (input.team) return null;
    if (!input.pass) return "pass";
    if (input.contacts === 0) return "contact";

    return null;
}

export function GateFresh(entry: { ok: boolean; at: number } | undefined, now: number): boolean {
    return entry !== undefined && now - entry.at < (entry.ok ? GATE_OK_TTL : GATE_NO_TTL);
}

export async function IssuePass(client: BotClient, guildId: string, userId: string, now = Date.now()): Promise<void> {
    await client.databaseService.Write("INSERT INTO invite_passes (guild_id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)", [guildId, userId, now, now + PASS_MINUTES * 60_000]);
}

/**
 * Löst den neuesten gültigen Pass für den Server ein und schließt alle übrigen
 * offenen dieses Servers (Review 7: kein Pass bleibt für eine spätere Einladung
 * liegen). at: wann der Bot auf den Server kam, nicht wann das Ereignis
 * ankommt (Review 3: nach einem Gateway-Ausfall kann das viel später sein).
 * Gibt zurück, wer ihn angelegt hat, sonst null. Wirft bei Datenbankfehlern.
 */
export async function TakePass(client: BotClient, guildId: string, at: number): Promise<string | null> {
    const row = await client.databaseService.One<{ id: number; user_id: string; expires_at: number; used_at: number | null }>(
        "SELECT id, user_id, expires_at, used_at FROM invite_passes WHERE guild_id = ? AND used_at IS NULL ORDER BY id DESC LIMIT 1",
        [guildId]
    );

    if (!row || !PassUsable(row, at)) return null;

    const taken = await client.databaseService.Write("UPDATE invite_passes SET used_at = ? WHERE id = ? AND used_at IS NULL", [at, row.id]);

    if (taken.affectedRows !== 1) return null;

    await client.databaseService.Write("UPDATE invite_passes SET used_at = ? WHERE guild_id = ? AND used_at IS NULL", [at, guildId]);

    return row.user_id;
}

/** Wer den Bot über das Bot-Dashboard auf diesen Server gebracht hat (Pass eingelöst seit since; 0: jemals). */
export async function PassUser(client: BotClient, guildId: string, since: number): Promise<string | null> {
    if (!client.databaseService.Ready) return null;

    const row = await client.databaseService
        .One<{ user_id: string }>("SELECT user_id FROM invite_passes WHERE guild_id = ? AND used_at >= ? ORDER BY used_at DESC LIMIT 1", [guildId, since])
        .catch(() => null);

    return row?.user_id ?? null;
}

/**
 * Ist diese Person Ansprechpartner: Owner oder „Server verwalten“ und mit
 * Zugang? Holt das Mitglied einzeln per REST, das geht ohne Members-Intent
 * (Review 1). null: nicht prüfbar.
 */
export async function IsContact(client: BotClient, guild: Guild, userId: string): Promise<boolean | null> {
    try {
        const member = guild.members.cache.get(userId) ?? (await guild.members.fetch(userId).catch(() => null));
        if (!member) return false;

        const manager = guild.ownerId === userId || member.permissions.has(PermissionFlagsBits.ManageGuild);

        return manager && (await client.dashboardService.ShopAccess(userId)).allowed;
    } catch {
        return null;
    }
}

const gate = new Map<string, { ok: boolean; at: number }>();
const loading = new Map<string, Promise<boolean>>();

/** Was das Gate mit einem gespeicherten Ergebnis tut: frisch nehmen, alt nehmen und neu prüfen, ohne Ergebnis prüfen und warten (Review 5). */
export function GateNow(entry: { ok: boolean; at: number } | undefined, now: number): { ok: boolean | null; refresh: boolean } {
    if (!entry) return { ok: null, refresh: true };

    return { ok: entry.ok, refresh: !GateFresh(entry, now) };
}

/**
 * Gibt es auf dem Server einen Ansprechpartner? Die Leute, die die
 * Staff-Freigabe fragt; ohne Members-Intent kennt der Bot dort nur, wer im
 * Speicher ist, deshalb zählt auch, wer zuletzt über das Bot-Dashboard
 * eingeladen hat (Review 1). Ist es nicht prüfbar, bleibt es offen und wird
 * in 5 Minuten neu geprüft.
 */
export function HasContact(client: BotClient, guild: Guild): Promise<boolean> {
    const running = loading.get(guild.id);
    if (running) return running;

    const job = (async (): Promise<{ ok: boolean; sure: boolean }> => {
        try {
            if ((await client.staffGrantService.Askees(guild)).users.length > 0) return { ok: true, sure: true };

            const inviter = await PassUser(client, guild.id, 0);
            const contact = inviter ? await IsContact(client, guild, inviter) : false;

            return contact === null ? { ok: true, sure: false } : { ok: contact, sure: true };
        } catch {
            return { ok: true, sure: false };
        }
    })().then(({ ok, sure }) => {
        gate.set(guild.id, sure ? { ok, at: Date.now() } : { ok: true, at: Date.now() - GATE_OK_TTL + GATE_NO_TTL });
        loading.delete(guild.id);

        return ok;
    });

    loading.set(guild.id, job);

    return job;
}

/**
 * Punkt 5: Dürfen Commands auf diesem Server laufen? Wer den Command nutzt und
 * selbst Ansprechpartner ist, darf immer. Ein gespeichertes Ergebnis gilt
 * sofort, auch ein altes (das wird im Hintergrund erneuert); nur ohne Ergebnis
 * wartet der Command, höchstens eine Sekunde (Review 5).
 */
export async function CommandsAllowed(client: BotClient, guild: Guild, userId: string, now = Date.now()): Promise<boolean> {
    const { ok, refresh } = GateNow(gate.get(guild.id), now);

    if (ok === true && !refresh) return true;

    if ((await IsContact(client, guild, userId)) === true) {
        gate.set(guild.id, { ok: true, at: now });

        return true;
    }

    if (ok !== null) {
        if (refresh) void HasContact(client, guild);

        return ok;
    }

    return Promise.race([HasContact(client, guild), new Promise<boolean>((resolve) => setTimeout(() => resolve(true), GATE_WAIT))]);
}

/** Beim Beitritt: gleich neu prüfen. */
export function ForgetGate(guildId?: string): void {
    if (guildId) gate.delete(guildId);
    else gate.clear();
}
