import { Guild } from "discord.js";
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
/** Länger wartet ein Command nicht auf die Prüfung, dann läuft er. */
const GATE_WAIT = 2_000;

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

/** Löst den neuesten gültigen Pass für den Server ein. Gibt zurück, wer ihn angelegt hat, sonst null. */
export async function TakePass(client: BotClient, guildId: string, now = Date.now()): Promise<string | null> {
    const row = await client.databaseService.One<{ id: number; user_id: string; expires_at: number; used_at: number | null }>(
        "SELECT id, user_id, expires_at, used_at FROM invite_passes WHERE guild_id = ? AND used_at IS NULL ORDER BY id DESC LIMIT 1",
        [guildId]
    );

    if (!row || !PassUsable(row, now)) return null;

    const taken = await client.databaseService.Write("UPDATE invite_passes SET used_at = ? WHERE id = ? AND used_at IS NULL", [now, row.id]);

    return taken.affectedRows === 1 ? row.user_id : null;
}

/** Wer den Bot über das Bot-Dashboard auf diesen Server gebracht hat (Pass eingelöst seit since). */
export async function PassUser(client: BotClient, guildId: string, since: number): Promise<string | null> {
    if (!client.databaseService.Ready) return null;

    const row = await client.databaseService
        .One<{ user_id: string }>("SELECT user_id FROM invite_passes WHERE guild_id = ? AND used_at >= ? ORDER BY used_at DESC LIMIT 1", [guildId, since])
        .catch(() => null);

    return row?.user_id ?? null;
}

const gate = new Map<string, { ok: boolean; at: number }>();
const loading = new Map<string, Promise<boolean>>();

/** Gibt es auf dem Server einen Ansprechpartner? Im Zweifel ja: Ein Fehler soll keine Commands sperren. */
export function HasContact(client: BotClient, guild: Guild): Promise<boolean> {
    const running = loading.get(guild.id);
    if (running) return running;

    const job = client.staffGrantService
        .Askees(guild)
        .then((askees) => askees.users.length > 0)
        .catch(() => true)
        .then((ok) => {
            gate.set(guild.id, { ok, at: Date.now() });
            loading.delete(guild.id);

            return ok;
        });

    loading.set(guild.id, job);

    return job;
}

/** Punkt 5: Dürfen Commands auf diesem Server laufen? Wartet höchstens zwei Sekunden auf die Prüfung. */
export async function CommandsAllowed(client: BotClient, guild: Guild, now = Date.now()): Promise<boolean> {
    const entry = gate.get(guild.id);
    if (entry && GateFresh(entry, now)) return entry.ok;

    return Promise.race([HasContact(client, guild), new Promise<boolean>((resolve) => setTimeout(() => resolve(entry?.ok ?? true), GATE_WAIT))]);
}

/** Nach einem Kauf oder Beta-Code: gleich neu prüfen. */
export function ForgetGate(guildId?: string): void {
    if (guildId) gate.delete(guildId);
    else gate.clear();
}
