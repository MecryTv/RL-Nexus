import type { RefuseReason } from "./invitepass";

/**
 * W-0069, Review 4: Der Einladungs-Callback leitet erst weiter, wenn
 * GuildJoined entschieden hat, ob der Bot bleibt. discord.js legt den Server in
 * den Cache, bevor guildCreate läuft; ein Blick in den Cache sagte also nur
 * „beigetreten“, nicht „geblieben“.
 *
 * GuildJoined ruft JoinStarted beim Beitritt und meldet am Ende „ok“ oder den
 * Grund, aus dem der Bot wieder gegangen ist. Der Callback wartet darauf.
 */

export type JoinResult = "ok" | RefuseReason;

interface IPending {
    readonly at: number;
    readonly result: Promise<JoinResult>;
}

const pending = new Map<string, IPending>();
/** So lange bleibt ein Ergebnis abrufbar. */
const KEEP = 2 * 60_000;

/** Beim Beitritt. Gibt die Funktion zurück, mit der GuildJoined sein Ergebnis meldet. */
export function JoinStarted(guildId: string, at = Date.now()): (result: JoinResult) => void {
    let report: (result: JoinResult) => void = () => undefined;
    const result = new Promise<JoinResult>((resolve) => {
        report = resolve;
    });
    const entry: IPending = { at, result };

    pending.set(guildId, entry);
    setTimeout(() => {
        if (pending.get(guildId) === entry) pending.delete(guildId);
    }, KEEP).unref();

    return report;
}

/**
 * Wartet höchstens ms Millisekunden auf das Ergebnis eines Beitritts, der nach
 * since begonnen hat. null: keins gekommen (Gateway langsam oder gestört).
 */
export async function JoinOutcome(guildId: string, since: number, ms: number): Promise<JoinResult | null> {
    const end = Date.now() + ms;

    while (Date.now() < end) {
        const entry = pending.get(guildId);

        if (entry && entry.at >= since) {
            const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), Math.max(0, end - Date.now())).unref());

            return Promise.race([entry.result, timeout]);
        }

        await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return null;
}
