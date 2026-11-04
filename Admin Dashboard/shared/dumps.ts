/**
 * W-0067: die nächtlichen Sicherungen der Datenbank. Das Skript
 * scripts/sicherung.sh im Repo des Bots schreibt sie auf dem Server nach
 * /home/backups/database, das Admin Dashboard liest den Ordner nur.
 */

export type DumpKind = "nacht" | "vor-deploy";

/**
 * off: auf diesem Server nicht eingerichtet (kein DB_DUMPS_DIR). never: noch
 * kein Lauf. unknown: Dateien da, aber status.json fehlt oder ist kaputt.
 */
export type DumpState = "off" | "never" | "unknown" | "failed" | "stale" | "probe-failed" | "ok";

/** So lange bleibt eine Sicherung, das steht so in der Datenschutzerklärung. */
export const KEEP_DAYS = 30;
/** Ohne gute Sicherung seit so vielen Stunden warnt die Übersicht. */
export const STALE_HOURS = 26;

export interface IDumpFile {
    readonly name: string;
    readonly kind: DumpKind;
    readonly at: string;
    readonly bytes: number;
    /** Liegt die .sha256 daneben? Ohne sie lässt sich die Datei nicht herunterladen. */
    readonly checksum: boolean;
    readonly deleteAt: string;
}

export interface IDumpRun {
    readonly at: string;
    readonly kind: DumpKind;
    readonly ok: boolean;
    readonly file: string | null;
    readonly bytes: number | null;
    readonly seconds: number | null;
    /** Tabellen je Datenbank beim Sichern. */
    readonly tables: Readonly<Record<string, number>> | null;
    readonly error: string | null;
}

export interface IDumpProbe {
    readonly at: string;
    readonly ok: boolean;
    readonly file: string | null;
    readonly seconds: number | null;
    /** Je Datenbank [erwartet, gefunden]. */
    readonly tables: Readonly<Record<string, readonly [number, number]>>;
    readonly rows: number | null;
    readonly error: string | null;
}

export interface IDumpsOverview {
    readonly state: DumpState;
    readonly configured: boolean;
    readonly next: string | null;
    readonly writtenAt: string | null;
    /** Neueste zuerst, die letzten 30 Tage. */
    readonly runs: readonly IDumpRun[];
    readonly probe: IDumpProbe | null;
    /** Neueste zuerst. */
    readonly files: readonly IDumpFile[];
    readonly totalBytes: number;
    readonly free: { readonly bytes: number; readonly total: number } | null;
}

/** Für die Übersicht: ohne Dateinamen und Fehlertexte, die sieht nur ein Developer. */
export interface IDumpSummary {
    readonly state: Exclude<DumpState, "off">;
    readonly lastOkAt: string | null;
}

const NAME = /^rlnexus_(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})(_vor-deploy)?\.sql\.gz$/;

/** Art und Zeit aus dem Dateinamen, in der Ortszeit des Prozesses (im Container Europe/Berlin wie das Skript). */
export function parseDumpName(name: string): { readonly kind: DumpKind; readonly at: Date } | null {
    const match = NAME.exec(name);
    if (!match) return null;

    const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
    const at = new Date(year, month - 1, day, hour, minute, second);

    // new Date rechnet den 40. einfach in den nächsten Monat um.
    if (at.getFullYear() !== year || at.getMonth() !== month - 1 || at.getDate() !== day || at.getHours() !== hour || at.getMinutes() !== minute) return null;

    return { kind: match[7] ? "vor-deploy" : "nacht", at };
}

/** Der Zustand aus Läufen (neueste zuerst) und Probe. Reihenfolge: failed, stale, probe-failed. */
export function dumpState(runs: readonly IDumpRun[], probe: IDumpProbe | null, now: Date): "never" | "failed" | "stale" | "probe-failed" | "ok" {
    if (runs.length === 0) return "never";
    if (!runs[0].ok) return "failed";

    const lastOk = runs.find((run) => run.ok);
    if (!lastOk || now.getTime() - Date.parse(lastOk.at) >= STALE_HOURS * 3_600_000) return "stale";
    if (probe && !probe.ok) return "probe-failed";

    return "ok";
}
