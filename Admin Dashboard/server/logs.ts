import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { ILogCounts, ILogEntry, ILogFeed, ILogSearch, ILogSession, ILogSessionPage, ILogView } from "../shared/api.ts";
import { LOG_PAGE_ENTRIES, LOG_SEARCH, PAGE_SIZE, type LogLevelFilter, type LogSessionFilter } from "../shared/limits.ts";
import type { IConfig } from "./config.ts";
import { InvalidInput, PublicError } from "./errors.ts";
import { parseLog, type IParsedLog } from "./log-parse.ts";

/**
 * Die Logs des Bots, nur lesend. Der Bot führt ein Manifest aller Sessions
 * (`.session-manifest-bot.json` in LOGS_DIR, siehe ChronicleLogger.ts dort)
 * und schreibt je Session eine oder mehrere Dateien nach `sessions/bot`.
 *
 * Zerlegt wird jede Datei einmal (log-parse.ts) und dann zwischengespeichert,
 * solange sich Größe und Änderungszeit nicht ändern. Die laufende Session
 * wächst, ihre Datei wird also bei jedem Abruf neu gelesen - sie ist klein,
 * der Bot beginnt bei 2 MB einen neuen Teil.
 */

const MANIFEST = ".session-manifest-bot.json";

/** Teile sind beim Bot höchstens 2 MB groß. Was viel größer ist, gehört in den Download. */
const MAX_VIEW_BYTES = 20 * 1024 * 1024;

/** So viele zerlegte Dateien bleiben im Speicher, die zuletzt geöffneten. */
const PARSED_CACHE = 16;

/** Mehr Sprungmarken als das braucht niemand, und die Antwort bleibt klein. */
const MAX_MARKS = 2000;

interface IManifestEntry {
    readonly sessionNumber: number;
    readonly files: readonly string[];
    readonly startedAt: string;
    readonly endedAt: string | null;
    readonly exitReason: string | null;
    readonly crashed: boolean;
}

interface IFileState {
    readonly size: number;
    readonly mtime: number;
}

/** Was aus einer Datei gelesen ist. `parsed` nur für die zuletzt geöffneten, `counts` für alle. */
const parsedCache = new Map<string, IFileState & { readonly parsed: IParsedLog }>();
const countsCache = new Map<string, IFileState & { readonly counts: ILogCounts }>();

function sessionsDir(config: IConfig): string {
    return path.join(config.logsDir, "sessions", "bot");
}

/** Wie ResolveLogPath() im Bot: nur Pfade unterhalb des Ordners, nie darüber hinaus. */
export function resolveLogPath(directory: string, file: string): string | null {
    if (!file) return null;

    const root = path.resolve(directory);
    const full = path.resolve(root, file);

    return full.startsWith(root + path.sep) ? full : null;
}

function isEntry(value: unknown): value is IManifestEntry {
    if (typeof value !== "object" || value === null) return false;

    const entry = value as Record<string, unknown>;

    return (
        Number.isInteger(entry.sessionNumber) &&
        Array.isArray(entry.files) &&
        entry.files.every((file) => typeof file === "string") &&
        typeof entry.startedAt === "string" &&
        (entry.endedAt === null || typeof entry.endedAt === "string")
    );
}

/** Alle Sessions, neueste zuerst. Ohne Manifest (Bot noch nie gelaufen) eine leere Liste. */
async function readManifest(config: IConfig): Promise<IManifestEntry[]> {
    let raw: string;

    try {
        raw = await readFile(path.join(config.logsDir, MANIFEST), "utf8");
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw new PublicError(503, "Die Logs des Bots lassen sich gerade nicht lesen.");
    }

    let sessions: unknown;

    try {
        sessions = (JSON.parse(raw) as { sessions?: unknown }).sessions;
    } catch {
        throw new PublicError(503, "Das Manifest der Logs ist gerade unlesbar. Versuch es gleich noch einmal.");
    }

    if (!Array.isArray(sessions)) return [];

    return sessions
        .filter(isEntry)
        .map((entry) => ({ ...entry, exitReason: typeof entry.exitReason === "string" ? entry.exitReason : null, crashed: entry.crashed === true }))
        .sort((a, b) => b.sessionNumber - a.sessionNumber);
}

async function stateOf(file: string): Promise<IFileState | null> {
    try {
        const info = await stat(file);

        return { size: info.size, mtime: info.mtimeMs };
    } catch {
        return null;
    }
}

function same(a: IFileState, b: IFileState): boolean {
    return a.size === b.size && a.mtime === b.mtime;
}

function countsOf(parsed: IParsedLog): ILogCounts {
    return { errors: parsed.errors, warnings: parsed.warnings, entries: parsed.entries.length };
}

/** Eine Datei zerlegt, aus dem Zwischenspeicher oder frisch gelesen. */
async function parsedOf(file: string, state: IFileState): Promise<IParsedLog> {
    if (state.size > MAX_VIEW_BYTES) throw new PublicError(413, "Die Datei ist zu groß für die Ansicht. Lad sie herunter.");

    const hit = parsedCache.get(file);

    if (hit && same(hit, state)) {
        // Nach hinten: Map hält die Einfügereihenfolge, vorn steht so das Älteste.
        parsedCache.delete(file);
        parsedCache.set(file, hit);

        return hit.parsed;
    }

    const parsed = parseLog(await readFile(file, "utf8"));

    parsedCache.delete(file);
    parsedCache.set(file, { ...state, parsed });
    countsCache.set(file, { ...state, counts: countsOf(parsed) });

    if (parsedCache.size > PARSED_CACHE) parsedCache.delete(parsedCache.keys().next().value as string);

    return parsed;
}

/** Nur die Zähler einer Datei. Liest und zerlegt nur, was sich seit dem letzten Mal geändert hat. */
async function countsOfFile(file: string, state: IFileState): Promise<ILogCounts | null> {
    const hit = countsCache.get(file);
    if (hit && same(hit, state)) return hit.counts;
    if (state.size > MAX_VIEW_BYTES) return null;

    const counts = countsOf(parseLog(await readFile(file, "utf8")));
    countsCache.set(file, { ...state, counts });

    return counts;
}

/**
 * Eine Session aus dem Manifest, mit Größe jedes Teils und auf Wunsch den
 * Zählern über alle Teile. Zählen heißt: jede Datei einmal zerlegen.
 */
async function toSession(config: IConfig, entry: IManifestEntry, newest: boolean, withCounts: boolean): Promise<ILogSession> {
    const files = entry.files.map((name) => resolveLogPath(sessionsDir(config), name));
    const states = await Promise.all(files.map((file) => (file === null ? null : stateOf(file))));

    let counts: ILogCounts | null = null;

    if (withCounts) {
        const each = await Promise.all(files.map((file, index) => (file === null || states[index] === null ? null : countsOfFile(file, states[index]!))));
        const present = each.filter((value): value is ILogCounts => value !== null);

        counts =
            present.length === 0
                ? null
                : present.reduce((sum, value) => ({ errors: sum.errors + value.errors, warnings: sum.warnings + value.warnings, entries: sum.entries + value.entries }), {
                      errors: 0,
                      warnings: 0,
                      entries: 0,
                  });
    }

    return {
        number: entry.sessionNumber,
        startedAt: entry.startedAt,
        endedAt: entry.endedAt,
        crashed: entry.crashed,
        exitReason: entry.exitReason,
        running: newest && entry.endedAt === null && !entry.crashed,
        parts: entry.files.map((name, index) => ({ index, name, size: states[index]?.size ?? null })),
        counts,
    };
}

/**
 * Die Liste der Sessions.
 *
 * Ohne Filter werden nur die Sessions der Seite gezählt. Mit „fehler“ müssen
 * alle gezählt werden, um zu wissen, welche überhaupt dazugehören - beim
 * ersten Mal dauert das, danach steht es im Zwischenspeicher.
 */
export async function listSessions(config: IConfig, page: number, filter: LogSessionFilter): Promise<ILogSessionPage> {
    const all = await readManifest(config);
    const newest = all[0]?.sessionNumber;
    const running = (entry: IManifestEntry): boolean => entry.sessionNumber === newest && entry.endedAt === null && !entry.crashed;

    let chosen: IManifestEntry[];
    let prepared: Map<number, ILogSession> | null = null;

    if (filter === "absturz") chosen = all.filter((entry) => entry.crashed);
    else if (filter === "laeuft") chosen = all.filter(running);
    else if (filter === "fehler") {
        const sessions = await Promise.all(all.map((entry) => toSession(config, entry, entry.sessionNumber === newest, true)));

        prepared = new Map(sessions.map((session) => [session.number, session]));
        chosen = all.filter((entry) => (prepared!.get(entry.sessionNumber)?.counts?.errors ?? 0) > 0);
    } else chosen = all;

    const slice = chosen.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    return {
        sessions: await Promise.all(slice.map((entry) => prepared?.get(entry.sessionNumber) ?? toSession(config, entry, entry.sessionNumber === newest, true))),
        total: chosen.length,
        all: all.length,
        page,
        pageSize: PAGE_SIZE,
    };
}

/** Eine Datei einer Session. Ohne Teil der letzte, dort steht das Neueste. */
export async function findPart(
    config: IConfig,
    number: number,
    part?: number
): Promise<{ readonly session: ILogSession; readonly part: number; readonly file: string; readonly state: IFileState }> {
    const all = await readManifest(config);
    const entry = all.find((candidate) => candidate.sessionNumber === number);
    if (!entry) throw new PublicError(404, `Session ${number} gibt es nicht.`);

    const session = await toSession(config, entry, entry === all[0], true);
    if (session.parts.length === 0) throw new PublicError(404, "Zu dieser Session gibt es keine Datei.");

    const index = part ?? session.parts.length - 1;
    if (!Number.isInteger(index) || index < 0 || index >= session.parts.length) throw new InvalidInput("Diesen Teil gibt es nicht.");

    const file = resolveLogPath(sessionsDir(config), entry.files[index]);
    if (file === null) throw new PublicError(404, "Diese Datei liegt nicht im Log-Ordner.");

    const state = session.parts[index].size === null ? null : await stateOf(file);
    if (state === null) throw new PublicError(404, "Dieser Teil ist schon gelöscht. Logs verschwinden 30 Tage nach dem letzten Eintrag.");

    return { session, part: index, file, state };
}

/** Was eine Ansicht oder Suche durchlässt. */
export interface ILogFilter {
    /** Diese Kategorien fallen weg. */
    readonly hidden: ReadonlySet<string>;
    readonly level: LogLevelFilter;
    /** Kleingeschrieben. Leer heißt: kein Textfilter. */
    readonly needle: string;
}

function passes(entry: ILogEntry, filter: ILogFilter): boolean {
    if (filter.hidden.has(entry.category)) return false;
    if (filter.level === "error" && entry.level !== "error") return false;
    if (filter.level === "warn" && entry.level !== "error" && entry.level !== "warn") return false;

    // Die Kategorie zählt mit: „guardian“ findet so alle Guardian-Einträge.
    if (filter.needle !== "") {
        const haystack = `${entry.category} ${entry.text}\n${entry.more.join("\n")}`.toLowerCase();
        if (!haystack.includes(filter.needle)) return false;
    }

    return true;
}

/** Der Eintrag, in dem eine Zeile steht: der letzte, der bei ihr oder davor beginnt. */
function entryAt(entries: readonly ILogEntry[], line: number): ILogEntry | null {
    let found: ILogEntry | null = null;

    for (const entry of entries) {
        if (entry.line > line) break;
        found = entry;
    }

    return found;
}

/**
 * Eine Seite eines Teils, gefiltert.
 *
 * Ohne Seite die letzte: Bei einem Log steht das Neueste unten. Mit `line`
 * (aus einem Suchtreffer) die Seite, auf der diese Zeile steht.
 */
export async function viewLog(
    config: IConfig,
    number: number,
    options: { readonly part?: number; readonly page?: number; readonly line?: number; readonly filter: ILogFilter }
): Promise<ILogView> {
    const found = await findPart(config, number, options.part);
    const parsed = await parsedOf(found.file, found.state);
    const visible = parsed.entries.filter((entry) => passes(entry, options.filter));
    const pages = Math.max(1, Math.ceil(visible.length / LOG_PAGE_ENTRIES));

    let target: ILogView["target"] = null;
    let page = Math.min(Math.max(options.page ?? pages, 1), pages);

    if (options.line !== undefined) {
        const entry = entryAt(parsed.entries, options.line);
        const index = entry === null ? -1 : visible.indexOf(entry);

        target = { line: entry?.line ?? options.line, index: index === -1 ? null : index };
        if (index !== -1) page = Math.floor(index / LOG_PAGE_ENTRIES) + 1;
    }

    const marks: { index: number; level: "error" | "warn" }[] = [];

    for (const [index, entry] of visible.entries()) {
        if (marks.length === MAX_MARKS) break;
        if (entry.level === "error" || entry.level === "warn") marks.push({ index, level: entry.level });
    }

    return {
        session: found.session,
        part: found.part,
        header: parsed.header,
        ended: parsed.ended,
        categories: [...parsed.categories].map(([name, count]) => ({ name, count })),
        errors: parsed.errors,
        warnings: parsed.warnings,
        total: visible.length,
        page,
        pages,
        pageSize: LOG_PAGE_ENTRIES,
        entries: visible.slice((page - 1) * LOG_PAGE_ENTRIES, page * LOG_PAGE_ENTRIES),
        marks,
        target,
    };
}

/**
 * Was seit einer Zeile dazukam, für das Mitlesen.
 *
 * Der Eintrag, in dem `after` steht, kommt noch einmal mit: Er kann seit dem
 * letzten Abruf Folgezeilen bekommen haben, etwa einen Stacktrace. Die
 * Oberfläche ersetzt ihn dann anhand seiner Zeilennummer.
 */
export async function feedLog(config: IConfig, number: number, options: { readonly part?: number; readonly after: number; readonly filter: ILogFilter }): Promise<ILogFeed> {
    const found = await findPart(config, number);
    const partChanged = options.part !== undefined && options.part !== found.part;
    const parsed = await parsedOf(found.file, found.state);
    const from = partChanged ? 0 : (entryAt(parsed.entries, options.after)?.line ?? 0);

    return {
        entries: parsed.entries.filter((entry) => entry.line >= from && passes(entry, options.filter)),
        last: parsed.entries.at(-1)?.line ?? 0,
        running: found.session.running,
        partChanged,
    };
}

/**
 * Über alle Sessions suchen, neueste zuerst.
 *
 * Erst grob, dann genau: Eine Datei, in der der Begriff gar nicht vorkommt
 * oder die keinen Fehler hat, wird nicht zerlegt. Das spart bei der Suche
 * nach einem seltenen Wort fast alle Dateien.
 */
export async function searchLogs(config: IConfig, filter: ILogFilter): Promise<Omit<ILogSearch, "query" | "level" | "hidden">> {
    const all = await readManifest(config);
    const newest = all[0]?.sessionNumber;
    const results: ILogSearch["sessions"][number][] = [];

    let total = 0;
    let limited = false;
    let scanned = 0;

    for (const entry of all) {
        if (limited) break;

        scanned++;

        const session = await toSession(config, entry, entry.sessionNumber === newest, filter.level !== "alle");

        // Grob: Hat die Session überhaupt, wonach gesucht wird?
        if (filter.level === "error" && (session.counts?.errors ?? 0) === 0) continue;
        if (filter.level === "warn" && (session.counts?.errors ?? 0) + (session.counts?.warnings ?? 0) === 0) continue;

        const hits: { part: number; entry: ILogEntry }[] = [];

        for (const [index, name] of entry.files.entries()) {
            const file = resolveLogPath(sessionsDir(config), name);
            const state = file === null ? null : await stateOf(file);
            if (file === null || state === null || state.size > MAX_VIEW_BYTES) continue;

            if (filter.needle !== "") {
                const raw = await readFile(file, "utf8");
                if (!raw.toLowerCase().includes(filter.needle)) continue;
            }

            for (const candidate of (await parsedOf(file, state)).entries) {
                if (!passes(candidate, filter)) continue;
                if (total === LOG_SEARCH.hits) {
                    limited = true;
                    break;
                }

                hits.push({ part: index, entry: candidate });
                total++;
            }

            if (limited) break;
        }

        if (hits.length > 0) results.push({ session, hits });
    }

    return { total, limited, scanned, sessions: results };
}
