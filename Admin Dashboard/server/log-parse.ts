import type { ILogEntry, ILogHeader, LogLevel } from "../shared/api.ts";

/**
 * Eine Logdatei des Bots in Einträge zerlegen.
 *
 * So schreibt der Bot (ChronicleLogger.ts dort):
 *
 *   ════════════                                  Rahmen
 *   🚀 [BOT] SESSION #1719 GESTARTET — 9.10.2026 08:56:23
 *   ════════════
 *   PID: 15320  |  Node: v24.15.0  |  discord.js: v14.27.0
 *   Git-Commit: f0a4ed7                           Kopf: Schlüssel: Wert
 *   ════════════
 *   [9.10.2026 08:56:32] INFO     🤖 Bot Mode: Development
 *   [9.10.2026 08:56:32] GUARDIAN INFO  | ✅  Guardian is operational
 *   [9.10.2026 08:57:28] HTTP     GET    /dashboard → 200
 *   [27.9.2026 12:18:09] ERROR    Etwas ging schief
 *       (pool connections: active=0 idle=0)      Folgezeile, gehört zum Eintrag davor
 *   ════════════
 *   🛑 [BOT] SESSION #1715 BEENDET (exit) — Laufzeit: 3s
 *   ════════════
 *
 * Reine Funktion ohne Dateizugriff: Was hier hineinkommt, ist Text, was
 * herauskommt, sind Einträge. So lässt sie sich ohne Logordner prüfen.
 */

/**
 * Eine Zeile mit Zeitstempel. Die Kategorie ist ein Wort in Großbuchstaben,
 * zwei Wörter nur vor einem „|“ (GUARDIAN INFO | …) - sonst würde aus
 * „HTTP     GET“ eine Kategorie „HTTP GET“.
 */
const ENTRY = /^\[(\d{1,2}\.\d{1,2}\.\d{4}) (\d{1,2}:\d{2}:\d{2})\] ([A-Z]+(?: [A-Z]+(?= +\|))?)(?: +\| | +|$)(.*)$/;

/** HTTP-Zeilen: Methode, Pfad, Pfeil, Status. */
const HTTP = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\S+)\s+→\s+(\d{3})/;

/** Die Zeile im Endrahmen. */
const ENDED = /SESSION #\d+ BEENDET \(([^)]+)\)\s*—\s*Laufzeit:\s*(.+?)\s*$/;

/** Die Titelzeile im Kopf. */
const STARTED = /SESSION #\d+ GESTARTET/;

/** Rahmen aus ═ und leere Zeilen tragen nichts. */
function isFrame(line: string): boolean {
    return line.trim() === "" || /^[═─=\s]+$/.test(line);
}

function levelOf(category: string, status: number | null): LogLevel {
    if (category.includes("ERROR")) return "error";
    if (category.includes("WARN")) return "warn";
    if (category.includes("DEBUG")) return "debug";
    // Ein 5xx ist ein Fehler, auch wenn er unter HTTP steht. 4xx nicht: 401
    // und 404 gehören beim Dashboard zum Alltag.
    if (status !== null && status >= 500) return "error";

    return "info";
}

/**
 * Eine Kopfzeile in Paare zerlegen. „PID: 15320  |  Node: v24.15.0“ wird zu
 * zwei Feldern. Ein Zeichen vor dem Namen (⏱️) fällt weg, es steht nur zur Zierde da.
 */
function headerFields(line: string): { label: string; value: string }[] {
    return line
        .split(/\s+\|\s+/)
        .map((part) => /^(.+?):\s+(.+)$/.exec(part.trim()))
        .filter((match): match is RegExpExecArray => match !== null)
        .map((match) => ({ label: match[1].replace(/^[^\p{L}]+/u, "").trim(), value: match[2].trim() }))
        .filter((field) => field.label !== "");
}

export interface IParsedLog {
    readonly header: ILogHeader | null;
    /** null: kein Endrahmen - die Session läuft noch oder ist abgestürzt. */
    readonly ended: { readonly reason: string; readonly duration: string } | null;
    readonly entries: readonly ILogEntry[];
    /** Wie oft jede Kategorie vorkommt, in der Reihenfolge ihres ersten Auftretens. */
    readonly categories: ReadonlyMap<string, number>;
    readonly errors: number;
    readonly warnings: number;
}

export function parseLog(text: string): IParsedLog {
    const lines = text.split("\n");
    const entries: ILogEntry[] = [];
    const categories = new Map<string, number>();
    const fields: { label: string; value: string }[] = [];

    let title: string | null = null;
    let ended: IParsedLog["ended"] = null;
    let errors = 0;
    let warnings = 0;

    /** Folgezeilen des laufenden Eintrags, bis der nächste kommt. */
    let open: { entry: Omit<ILogEntry, "more">; more: string[] } | null = null;

    const close = (): void => {
        if (open === null) return;

        entries.push({ ...open.entry, more: open.more });
        open = null;
    };

    for (const [index, raw] of lines.entries()) {
        const line = raw.replace(/\r$/, "");
        const match = ENTRY.exec(line);

        if (match !== null) {
            close();

            const [, date, time, category, rest] = match;
            const http = category === "HTTP" ? HTTP.exec(rest) : null;
            const status = http ? Number(http[3]) : null;
            const level = levelOf(category, status);

            categories.set(category, (categories.get(category) ?? 0) + 1);
            if (level === "error") errors++;
            if (level === "warn") warnings++;

            open = {
                entry: {
                    line: index + 1,
                    date,
                    time,
                    category,
                    level,
                    text: rest,
                    http: http ? { method: http[1], path: http[2], status: Number(http[3]) } : null,
                },
                more: [],
            };

            continue;
        }

        if (isFrame(line)) continue;

        const end = ENDED.exec(line);

        if (end !== null) {
            close();
            ended = { reason: end[1], duration: end[2] };

            continue;
        }

        // Vor dem ersten Eintrag: der Kopf.
        if (entries.length === 0 && open === null) {
            if (STARTED.test(line)) title = line.trim();
            else fields.push(...headerFields(line));

            continue;
        }

        // Alles andere hängt am Eintrag davor, meist ein Stacktrace.
        if (open !== null) (open as { more: string[] }).more.push(line);
    }

    close();

    return {
        header: title === null && fields.length === 0 ? null : { title, fields },
        ended,
        entries,
        categories,
        errors,
        warnings,
    };
}
