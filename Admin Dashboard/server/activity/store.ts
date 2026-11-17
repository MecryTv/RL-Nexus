import { ACTIVITY_DEVICES, ACTIVITY_SERVICES, ACTIVITY_SOURCES, type ActivityDevice, type ActivityRange, type ActivityService, type ActivitySource, type IActivityView } from "../../shared/activity.ts";
import { query } from "../db.ts";
import type { IHit } from "./parse.ts";
import type { IReaderState } from "./reader.ts";

/**
 * W-0138: Summen je Stunde speichern und für die Seite auswerten.
 *
 * Stunden stehen als UTC in der Datenbank und gehen als Text hinein und heraus
 * (DATE_FORMAT). So rechnet der Treiber nichts in die Zeitzone der Datenbank
 * um - sonst fielen bei der Zeitumstellung zwei Stunden auf denselben Wert.
 * Tage und Heatmap entstehen erst beim Lesen in Europe/Berlin.
 */

const HOUR = 3_600_000;
const CHUNK = 500;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const BERLIN = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" });

/** „2026-10-25 00:00:00“ für die Datenbank. */
function utc(at: Date): string {
    return at.toISOString().slice(0, 19).replace("T", " ");
}

function fromDb(text: string): Date {
    return new Date(`${text.replace(" ", "T")}Z`);
}

function berlin(at: Date): { date: string; hour: number; weekday: number } {
    const parts = Object.fromEntries(BERLIN.formatToParts(at).map((part) => [part.type, part.value]));

    return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), weekday: WEEKDAYS.indexOf(parts.weekday!) };
}

function shiftDate(date: string, days: number): string {
    const [year, month, day] = date.split("-").map(Number);

    return new Date(Date.UTC(year!, month! - 1, day! + days)).toISOString().slice(0, 10);
}

/** Mitternacht eines Berliner Tages als Zeitpunkt (Winterzeit +1, Sommerzeit +2). */
function berlinMidnight(date: string): Date {
    const [year, month, day] = date.split("-").map(Number);

    for (const offset of [1, 2]) {
        const at = new Date(Date.UTC(year!, month! - 1, day!) - offset * HOUR);
        const local = berlin(at);

        if (local.date === date && local.hour === 0) return at;
    }

    throw new Error(`Keine Mitternacht für ${date}`);
}

function bump(map: Map<string, number>, key: string): void {
    map.set(key, (map.get(key) ?? 0) + 1);
}

async function upsert(table: string, columns: string, counter: string, rows: Map<string, number>): Promise<void> {
    const entries = [...rows];
    const width = columns.split(",").length;

    for (let index = 0; index < entries.length; index += CHUNK) {
        const chunk = entries.slice(index, index + CHUNK);
        const values = chunk.flatMap(([key, count]) => [...key.split("|"), count]);
        const marks = chunk.map(() => `(${Array(width).fill("?").join(",")})`).join(",");

        await query(`INSERT INTO ${table} (${columns}) VALUES ${marks} ON DUPLICATE KEY UPDATE ${counter} = ${counter} + VALUES(${counter})`, values);
    }
}

/**
 * Zählt Aufrufe (ohne Bots) und Anfragen je Statusklasse (ohne Bots, Scanner
 * und was `excluded` sagt, etwa Zeiten mit Wartung). Ein Zeilenwert je Schlüssel.
 */
export async function addHits(hits: readonly IHit[], excluded: (hit: IHit) => boolean): Promise<void> {
    const views = new Map<string, number>();
    const statuses = new Map<string, number>();

    for (const hit of hits) {
        const hour = utc(hit.hour);

        if (hit.view && !hit.bot) bump(views, [hour, hit.service, hit.device, hit.source].join("|"));
        if (!hit.bot && !hit.scanner && !excluded(hit)) bump(statuses, [hour, hit.service, hit.statusClass].join("|"));
    }

    await upsert("activity_views", "hour, service, device, source, views", "views", views);
    await upsert("activity_status", "hour, service, status_class, requests", "requests", statuses);
}

interface IWindow {
    start: Date;
    end: Date;
    previousStart: Date;
    /** Schlüssel der Punkte in Reihenfolge. */
    buckets: string[];
    bucketOf: (hour: Date) => string;
}

function windowOf(range: ActivityRange, now: Date): IWindow {
    const hour = new Date(Math.floor(now.getTime() / HOUR) * HOUR);
    const end = new Date(hour.getTime() + HOUR);

    if (range === "24h") {
        const start = new Date(end.getTime() - 24 * HOUR);

        return {
            start,
            end,
            previousStart: new Date(start.getTime() - 24 * HOUR),
            buckets: Array.from({ length: 24 }, (_, index) => new Date(start.getTime() + index * HOUR).toISOString()),
            bucketOf: (at) => at.toISOString(),
        };
    }

    const days = range === "7d" ? 7 : 30;
    const today = berlin(now).date;
    const first = shiftDate(today, -(days - 1));

    return {
        start: berlinMidnight(first),
        end,
        previousStart: berlinMidnight(shiftDate(today, -(2 * days - 1))),
        buckets: Array.from({ length: days }, (_, index) => shiftDate(first, index)),
        bucketOf: (at) => berlin(at).date,
    };
}

export async function readActivity(range: ActivityRange, service: ActivityService | "all", now: Date): Promise<IActivityView> {
    const window = windowOf(range, now);
    const filter = service === "all" ? "" : " AND service = ?";
    const scoped = [utc(window.start), utc(window.end), ...(service === "all" ? [] : [service])];

    const [hourly, heat, devices, sources, statuses, first] = await Promise.all([
        query<{ h: string; service: ActivityService; views: number }[]>(
            "SELECT DATE_FORMAT(hour, '%Y-%m-%d %H:00:00') AS h, service, SUM(views) AS views FROM activity_views WHERE hour >= ? AND hour < ? GROUP BY hour, service",
            [utc(window.previousStart), utc(window.end)]
        ),
        query<{ h: string; views: number }[]>(`SELECT DATE_FORMAT(hour, '%Y-%m-%d %H:00:00') AS h, SUM(views) AS views FROM activity_views WHERE hour >= ? AND hour < ?${filter} GROUP BY hour`, scoped),
        query<{ device: ActivityDevice; views: number }[]>(`SELECT device, SUM(views) AS views FROM activity_views WHERE hour >= ? AND hour < ?${filter} GROUP BY device`, scoped),
        query<{ source: ActivitySource; views: number }[]>(`SELECT source, SUM(views) AS views FROM activity_views WHERE hour >= ? AND hour < ?${filter} GROUP BY source`, scoped),
        query<{ status_class: string; requests: number }[]>(`SELECT status_class, SUM(requests) AS requests FROM activity_status WHERE hour >= ? AND hour < ?${filter} GROUP BY status_class`, scoped),
        query<{ h: string | null }[]>("SELECT DATE_FORMAT(MIN(hour), '%Y-%m-%d %H:00:00') AS h FROM activity_views"),
    ]);

    const index = new Map(window.buckets.map((bucket, position) => [bucket, position]));
    const current = new Map(ACTIVITY_SERVICES.map((entry) => [entry, window.buckets.map(() => 0)]));
    const previous = new Map(ACTIVITY_SERVICES.map((entry) => [entry, 0]));

    for (const row of hourly) {
        const at = fromDb(row.h);
        const views = Number(row.views);

        if (at < window.start) previous.set(row.service, previous.get(row.service)! + views);
        else {
            const position = index.get(window.bucketOf(at));

            if (position !== undefined) current.get(row.service)![position]! += views;
        }
    }

    const heatmap = Array.from({ length: 7 }, () => Array<number>(24).fill(0));

    for (const row of heat) {
        const local = berlin(fromDb(row.h));

        heatmap[local.weekday]![local.hour]! += Number(row.views);
    }

    const counted = <K extends string>(keys: readonly K[], rows: { key: K; value: number }[]): Record<K, number> =>
        Object.fromEntries(keys.map((key) => [key, rows.filter((row) => row.key === key).reduce((sum, row) => sum + Number(row.value), 0)])) as Record<K, number>;
    const requests = counted(["2xx", "3xx", "4xx", "5xx"], statuses.map((row) => ({ key: row.status_class as "2xx", value: row.requests })));
    const total = requests["2xx"] + requests["3xx"] + requests["4xx"] + requests["5xx"];

    return {
        range,
        service,
        since: first[0]?.h ? fromDb(first[0].h).toISOString() : null,
        tiles: ACTIVITY_SERVICES.map((entry) => {
            const series = current.get(entry)!;
            const views = series.reduce((sum, value) => sum + value, 0);
            const before = previous.get(entry)!;

            return { service: entry, views, previous: before, change: before === 0 ? null : (views - before) / before, series };
        }),
        series: ACTIVITY_SERVICES.map((entry) => ({ service: entry, points: window.buckets.map((at, position) => ({ at, views: current.get(entry)![position]! })) })),
        heatmap,
        devices: counted(ACTIVITY_DEVICES, devices.map((row) => ({ key: row.device, value: row.views }))),
        sources: counted(ACTIVITY_SOURCES, sources.map((row) => ({ key: row.source, value: row.views }))),
        errors: { client: total === 0 ? 0 : requests["4xx"] / total, server: total === 0 ? 0 : requests["5xx"] / total },
    };
}

/** Löscht alles, was älter als 13 Monate ist. Gibt die Zahl der gelöschten Zeilen zurück. */
export async function pruneActivity(now: Date): Promise<number> {
    const cutoff = new Date(now);

    cutoff.setUTCMonth(cutoff.getUTCMonth() - 13);

    const views = await query<{ affectedRows: number }>("DELETE FROM activity_views WHERE hour < ?", [utc(cutoff)]);
    const statuses = await query<{ affectedRows: number }>("DELETE FROM activity_status WHERE hour < ?", [utc(cutoff)]);

    return Number(views.affectedRows) + Number(statuses.affectedRows);
}

/** Stand eines Lesers (`live`, `import`). Ohne Zeile: noch nie gelesen. */
export async function readerState(name: string): Promise<IReaderState> {
    const [row] = await query<{ inode: string | null; read_offset: number; first: string | null }[]>(
        "SELECT inode, read_offset, DATE_FORMAT(first_line_at, '%Y-%m-%d %H:%i:%s') AS first FROM activity_reader WHERE name = ?",
        [name]
    );

    return row ? { inode: row.inode, offset: Number(row.read_offset), firstLineAt: row.first ? fromDb(row.first) : null } : { inode: null, offset: 0, firstLineAt: null };
}

/** Sichert den Stand. Die erste Zeit bleibt, einmal gesetzt, für immer. */
export async function saveReaderState(name: string, state: IReaderState): Promise<void> {
    await query(
        "INSERT INTO activity_reader (name, inode, read_offset, first_line_at) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE inode = VALUES(inode), read_offset = VALUES(read_offset), first_line_at = COALESCE(first_line_at, VALUES(first_line_at))",
        [name, state.inode, state.offset, state.firstLineAt ? utc(state.firstLineAt) : null]
    );
}
