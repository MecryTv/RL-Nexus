import { AREA_IDS, type AreaId, type BackupKind, type BackupPart, type IBackupMeta, type IBackupsOverview, type IPlanState, type IServerCounts, type NightState } from "../../shared/backups.ts";
import { formatDuration } from "../format.ts";

/**
 * Kleine Texte der Backup-Seiten, ohne DOM, damit sie im Check mitlaufen.
 */

export const KIND_LABELS: Readonly<Record<BackupKind, string>> = { nacht: "nachts", vorher: "vor dem Zurückladen", hand: "von Hand", plan: "automatisch (Server)", schutz: "Sicherheit (Anti Villain)" };

/** Art mit Herkunft: Was ein Server im Bot-Dashboard angelegt hat, trägt „(Server)“. */
/** Plan 32: welche Teile ein Backup hat. */
export function partsLabel(parts: readonly BackupPart[]): string {
    if (parts.includes("bot") && parts.includes("server")) return "Bot und Discord-Server";

    return parts.includes("server") ? "nur Discord-Server" : "nur Bot";
}

/** Plan 32: was im Server-Teil steckt, nur was es gibt. */
export function serverLabel(counts: IServerCounts): string {
    const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
    const parts = [count(counts.channels, "Kanal", "Kanäle"), count(counts.roles, "Rolle", "Rollen")];

    if (counts.members) parts.push(count(counts.members, "Mitglied mit Rollen", "Mitglieder mit Rollen"));
    if (counts.emojis) parts.push(count(counts.emojis, "Emoji", "Emojis"));
    if (counts.stickers) parts.push(count(counts.stickers, "Sticker", "Sticker"));
    if (counts.bans) parts.push(count(counts.bans, "Ban", "Bans"));

    return parts.join(" · ");
}

export function kindLabel(meta: Pick<IBackupMeta, "kind" | "origin">): string {
    const label = KIND_LABELS[meta.kind];

    return meta.origin === "server" && meta.kind !== "plan" ? `${label} (Server)` : label;
}

const WEEKDAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"] as const;

/** Die automatischen Backups, die ein Server im Bot-Dashboard eingestellt hat, als ein Satz. */
export function planSentence(state: IPlanState | null): string {
    if (!state?.plan.enabled) return "Keine automatischen Backups eingestellt.";

    const { every, weekday, hour, keep } = state.plan;
    const when = { tag: "jeden Tag", "3tage": "alle 3 Tage", woche: `jede Woche am ${WEEKDAYS[weekday]}`, monat: "am 1. jedes Monats" }[every];
    const kept = keep === 1 ? "das letzte bleibt" : `die letzten ${keep} bleiben`;
    const failed = state.lastError ? ` Zuletzt fehlgeschlagen: ${state.lastError.reason}.` : "";

    return `Automatisch ${when} um ${hour}:00, ${kept}.${failed}`;
}

export const NIGHT_LABELS: Readonly<Record<NightState, string>> = { ok: "gesichert", fail: "fehlgeschlagen", hand: "nur von Hand gesichert", none: "keine Sicherung" };

/** Ein Satz, was die letzte Nacht gebracht hat. */
export function roundSentence(round: IBackupsOverview["round"]): string {
    if (round === null) return "Noch keine Nacht-Runde gelaufen.";
    if (round.failed.length === 0) return `Letzte Nacht: alle ${round.total} Server gesichert.`;
    if (round.failed.length === 1) return `${round.failed[0].name} hat nicht geklappt: ${round.failed[0].reason}.`;

    return `${round.failed.length} Server haben nicht geklappt: ${round.failed.map((entry) => entry.name).join(", ")}.`;
}

/**
 * Die Punkte der Zeitleiste, ältestes links. Gleichmäßig verteilt statt nach
 * Uhrzeit: Die von Hand bleiben für immer, und ein Backup vom August schöbe
 * sonst alle Nächte an den rechten Rand übereinander. Wann es war, steht am Punkt.
 */
export function timelineLayout(backups: readonly IBackupMeta[]): { id: number; left: number; lane: "night" | "flag" }[] {
    const sorted = [...backups].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

    return sorted.map((backup, index) => ({
        id: backup.id,
        left: sorted.length === 1 ? 50 : 4 + (index / (sorted.length - 1)) * 92,
        lane: backup.kind === "hand" ? "flag" : "night",
    }));
}

/** Steht in Gelb an Bereichen mit Daten der Mitglieder: so viel Fortschritt ist nach dem Zurückladen weg. */
export function lossText(backupAt: string, now: number): string {
    return `seit dem Backup vergangen: ${formatDuration((now - Date.parse(backupAt)) / 1000)}`;
}

/** Die Bereiche, die „Rückgängig machen“ über den Router mitgibt. null: keine gültigen, dann gilt der Vorschlag. */
export function carriedAreas(state: unknown): Set<AreaId> | null {
    const raw = (state as { areas?: unknown } | null)?.areas;
    const areas = Array.isArray(raw) ? AREA_IDS.filter((area) => raw.includes(area)) : [];

    return areas.length > 0 ? new Set(areas) : null;
}

/** Zwei Buchstaben für die Kachel: Anfangsbuchstaben der ersten zwei Wörter, sonst die ersten zwei. */
export function initials(name: string): string {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return "?";
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();

    return `${words[0][0]}${words[1][0]}`.toUpperCase();
}
