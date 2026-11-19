/**
 * W-0141: langsame Anfragen und langsames SQL des Bots, die letzten 200 im
 * Speicher. Nach einem Neustart leer. Gemerkt wird das Muster der Route, nie
 * die Adresse mit IDs, und SQL ohne Werte. Das Admin Dashboard liest es über
 * /admin/dev/slow (routes/AdminDevSlow.ts). Gleicher Aufbau wie dort
 * (Admin Dashboard/server/slow.ts).
 */

export const SLOW_REQUEST_MS = 500;
export const SLOW_SQL_MS = 200;
const KEEP = 200;

export interface ISlowEntry {
    /** Nachreview W-0141: "pool" - nur das Warten auf eine freie Verbindung lag über der Schwelle, nicht die Abfrage. */
    kind: "request" | "sql" | "pool";
    at: string;
    ms: number;
    what: string;
    status: number | null;
    /** Review W-0141: bei SQL das Warten auf eine freie Verbindung, nicht in ms enthalten. Bei Anfragen null. */
    waitMs: number | null;
}

let since = Date.now();
let entries: ISlowEntry[] = [];
let counts = { requests: 0, slowRequests: 0, queries: 0, slowQueries: 0, poolWaits: 0 };

function Keep(entry: ISlowEntry): void {
    entries.push(entry);
    if (entries.length > KEEP) entries.shift();
}

/** SQL in einer Zeile, Texte und lange Zahlen (IDs) durch ? ersetzt, höchstens 200 Zeichen. */
export function SqlShape(sql: string): string {
    return sql
        .replace(/'(?:[^'\\]|\\.)*'/g, "?")
        .replace(/\b\d{6,}\b/g, "?")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 200);
}

export function NoteRequest(method: string, route: string, status: number, ms: number, now = Date.now()): void {
    counts.requests++;
    if (ms < SLOW_REQUEST_MS) return;

    counts.slowRequests++;
    Keep({ kind: "request", at: new Date(now).toISOString(), ms: Math.round(ms), what: `${method} ${route}`, status, waitMs: null });
}

/**
 * Review W-0141: ms ist die Abfrage selbst, waitMs das Warten auf eine freie Verbindung davor.
 * Nachreview: Langsames SQL ist nur, was selbst über der Schwelle liegt. War nur das Warten zu lang,
 * steht der Fall als eigene Art „pool“ da und zählt in poolWaits.
 */
export function NoteQuery(sql: string, ms: number, waitMs = 0, now = Date.now()): void {
    counts.queries++;

    const kind = ms >= SLOW_SQL_MS ? "sql" : waitMs >= SLOW_SQL_MS ? "pool" : null;

    if (kind === null) return;
    if (kind === "sql") counts.slowQueries++;
    else counts.poolWaits++;
    Keep({ kind, at: new Date(now).toISOString(), ms: Math.round(ms), what: SqlShape(sql), status: null, waitMs: Math.round(waitMs) });
}

/** Nachreview W-0141: eine Verbindung holen und die Wartezeit messen. Scheitert das Holen (etwa acquireTimeout), wird es mit ms 0 und der verstrichenen Zeit gemerkt. */
export async function AcquireTimed<C>(sql: string, acquire: () => Promise<C>): Promise<{ connection: C; waitMs: number }> {
    const asked = performance.now();

    try {
        return { connection: await acquire(), waitMs: performance.now() - asked };
    } catch (error) {
        NoteQuery(sql, 0, performance.now() - asked);
        throw error;
    }
}

export function SlowReport() {
    return { since: new Date(since).toISOString(), requestMs: SLOW_REQUEST_MS, sqlMs: SLOW_SQL_MS, ...counts, entries: [...entries].reverse() };
}

/** Für die Checks: alles vergessen. */
export function ForgetSlow(): void {
    since = Date.now();
    entries = [];
    counts = { requests: 0, slowRequests: 0, queries: 0, slowQueries: 0, poolWaits: 0 };
}
