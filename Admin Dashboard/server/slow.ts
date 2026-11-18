import type { ISlowEntry, ISlowSide } from "../shared/api.ts";

/**
 * W-0141: langsame Anfragen und langsames SQL dieses Prozesses, die letzten
 * 200 im Speicher. Nach einem Neustart ist die Liste leer (E3). Gemerkt wird
 * das Muster der Route, nie die Adresse mit IDs, und SQL ohne Werte.
 */

export const SLOW_REQUEST_MS = 500;
export const SLOW_SQL_MS = 200;
const KEEP = 200;

let since = Date.now();
let entries: ISlowEntry[] = [];
let counts = { requests: 0, slowRequests: 0, queries: 0, slowQueries: 0 };

function keep(entry: ISlowEntry): void {
    entries.push(entry);
    if (entries.length > KEEP) entries.shift();
}

/** SQL in einer Zeile, Texte und lange Zahlen (IDs) durch ? ersetzt, höchstens 200 Zeichen. */
export function sqlShape(sql: string): string {
    return sql
        .replace(/'(?:[^'\\]|\\.)*'/g, "?")
        .replace(/\b\d{6,}\b/g, "?")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 200);
}

export function noteRequest(method: string, route: string, status: number, ms: number, now = Date.now()): void {
    counts.requests++;
    if (ms < SLOW_REQUEST_MS) return;

    counts.slowRequests++;
    keep({ kind: "request", at: new Date(now).toISOString(), ms: Math.round(ms), what: `${method} ${route}`, status, waitMs: null });
}

/** Review W-0141: ms ist die Abfrage selbst, waitMs das Warten auf eine freie Verbindung davor. Gemerkt wird, wenn eins davon über der Schwelle liegt. */
export function noteQuery(sql: string, ms: number, waitMs = 0, now = Date.now()): void {
    counts.queries++;
    if (ms < SLOW_SQL_MS && waitMs < SLOW_SQL_MS) return;

    counts.slowQueries++;
    keep({ kind: "sql", at: new Date(now).toISOString(), ms: Math.round(ms), what: sqlShape(sql), status: null, waitMs: Math.round(waitMs) });
}

export function slowReport(): ISlowSide {
    return { since: new Date(since).toISOString(), requestMs: SLOW_REQUEST_MS, sqlMs: SLOW_SQL_MS, ...counts, entries: [...entries].reverse() };
}

/** Für die Checks: alles vergessen. */
export function forgetSlow(): void {
    since = Date.now();
    entries = [];
    counts = { requests: 0, slowRequests: 0, queries: 0, slowQueries: 0 };
}
