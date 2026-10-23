import type { BlockState, CheckState, ILatency, ILatencyPoint, IOutage, IStatusDay, IUptime, StatusService } from "../../shared/status.ts";
import { databaseReady, query } from "../db.ts";

/**
 * Was der Server bei jeder Prüfung misst, gemerkt in `status_checks`, und
 * die Auswertung daraus: 90 Tagesbalken, 12 Kästchen für Discord,
 * Verfügbarkeit, Antwortzeiten, Ausfälle.
 *
 * Die Datenbank fasst nach Stunden zusammen, als Unix-Stunde: So spielt ihre
 * Zeitzone keine Rolle. Tage und Kästchen rechnet `summarize` daraus in
 * Berliner Zeit. 90 Tage sind höchstens 2160 Stunden je Dienst.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Wie oft geprüft wird. Ein einzelner Ausfall zählt so lange. */
export const CHECK_EVERY = 2 * MINUTE;

/** Liegen zwei Ausfälle höchstens so weit auseinander, ist es einer. Eine verpasste Prüfung reißt ihn nicht auseinander. */
const SAME_OUTAGE = 5 * MINUTE;

/** So weit reicht der Verlauf. Ältere Prüfungen löscht das Aufräumen. */
export const HISTORY_DAYS = 90;

/** Eine Messung, wie sie gespeichert wird. */
export interface IMeasurement {
    readonly service: StatusService;
    readonly state: CheckState;
    /** Millisekunden. null: keine Antwort, also nichts zu messen. */
    readonly latency: number | null;
}

/** Eine Stunde eines Dienstes, zusammengefasst. */
export interface IHour {
    readonly service: StatusService;
    /** Unix-Stunde: Millisekunden durch 3 600 000. */
    readonly hour: number;
    readonly checks: number;
    readonly down: number;
    readonly warn: number;
    readonly latencySum: number;
    readonly latencyCount: number;
    readonly latencyMax: number | null;
}

export interface IServiceHistory {
    readonly days: readonly IStatusDay[];
    /** 12 Kästchen zu je zwei Stunden, ältestes zuerst. */
    readonly blocks: readonly BlockState[];
    readonly uptime: IUptime;
    readonly latency: Omit<ILatency, "now">;
    readonly lastOutage: IOutage | null;
}

const BERLIN = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" });

/** YYYY-MM-DD in Berliner Zeit. */
export function berlinDate(time: number): string {
    return BERLIN.format(time);
}

/** Ein Tag davor, ohne Zeitzone: reine Datumsrechnung auf dem Text. */
export function daysBefore(date: string, days: number): string {
    const [year, month, day] = date.split("-").map(Number);

    return new Date(Date.UTC(year, month - 1, day - days)).toISOString().slice(0, 10);
}

/** Prozent mit zwei Stellen, abgerundet: Eine Minute Ausfall soll nicht als 100 Prozent dastehen. */
export function percent(up: number, total: number): number | null {
    return total === 0 ? null : Math.floor((up / total) * 10_000) / 100;
}

function stateOf(checks: number, down: number, warn: number): BlockState {
    if (checks === 0) return "none";
    if (down > 0) return "down";
    if (warn > 0) return "warn";

    return "ok";
}

/**
 * Aus den Zeitpunkten ohne Antwort die Ausfälle.
 *
 * `rows` sind nur Prüfungen mit `down`. Ein Ausfall endet eine Prüfung nach
 * seiner letzten Zeile. Er läuft noch, wenn der Dienst gerade nicht antwortet
 * (`current`) und seine letzte Zeile frisch ist.
 */
export function outagesFrom(
    rows: readonly { readonly service: StatusService; readonly at: number }[],
    now: number,
    current: Partial<Record<StatusService, CheckState>>
): IOutage[] {
    const sorted = [...rows].sort((a, b) => a.service.localeCompare(b.service) || a.at - b.at);
    const outages: IOutage[] = [];

    let first: (typeof sorted)[number] | null = null;
    let last: (typeof sorted)[number] | null = null;

    const close = (): void => {
        if (first === null || last === null) return;

        const ongoing = current[last.service] === "down" && now - last.at <= SAME_OUTAGE;
        const end = last.at + CHECK_EVERY;

        outages.push({
            service: first.service,
            start: new Date(first.at).toISOString(),
            end: ongoing ? null : new Date(end).toISOString(),
            minutes: Math.max(1, Math.round(((ongoing ? Math.max(now, end) : end) - first.at) / MINUTE)),
        });
    };

    for (const row of sorted) {
        if (last !== null && (row.service !== last.service || row.at - last.at > SAME_OUTAGE)) {
            close();
            first = null;
        }

        first ??= row;
        last = row;
    }

    close();

    return outages;
}

/**
 * `count` Stunden ab `firstHour` (Unix-Stunde), ältestes zuerst: Mittel der
 * Antwortzeiten und der schlechteste Zustand, `gap` für eine Stunde ohne Prüfung.
 * `hours` sind die eines Dienstes.
 */
export function hourPoints(hours: readonly IHour[], firstHour: number, count: number): ILatencyPoint[] {
    const byHour = new Map(hours.map((entry) => [entry.hour, entry]));

    return Array.from({ length: count }, (_, index): ILatencyPoint => {
        const entry = byHour.get(firstHour + index);
        if (!entry || entry.checks === 0) return { value: null, state: "gap" };

        const state = stateOf(entry.checks, entry.down, entry.warn);

        return { value: entry.latencyCount > 0 ? Math.round(entry.latencySum / entry.latencyCount) : null, state: state === "none" ? "gap" : state };
    });
}

/** Die Auswertung eines Dienstes. `hours` sind nur seine, in beliebiger Reihenfolge. */
export function summarize(hours: readonly IHour[], outages: readonly IOutage[], now: number): IServiceHistory {
    const nowHour = Math.floor(now / HOUR);
    const byHour = new Map(hours.map((entry) => [entry.hour, entry]));

    // Tage: von heute in Berliner Zeit 90 Tage zurück.
    const today = berlinDate(now);
    const dates = Array.from({ length: HISTORY_DAYS }, (_, index) => daysBefore(today, HISTORY_DAYS - 1 - index));
    const perDay = new Map(dates.map((date) => [date, { checks: 0, down: 0, warn: 0, outages: 0, downMinutes: 0 }]));

    for (const entry of hours) {
        const day = perDay.get(berlinDate(entry.hour * HOUR));
        if (!day) continue;

        day.checks += entry.checks;
        day.down += entry.down;
        day.warn += entry.warn;
    }

    for (const outage of outages) {
        const day = perDay.get(berlinDate(Date.parse(outage.start)));
        if (!day) continue;

        day.outages++;
        day.downMinutes += outage.minutes;
    }

    const days = dates.map((date): IStatusDay => {
        const day = perDay.get(date) ?? { checks: 0, down: 0, warn: 0, outages: 0, downMinutes: 0 };

        return { date, state: stateOf(day.checks, day.down, day.warn), uptime: percent(day.checks - day.down, day.checks), outages: day.outages, downMinutes: day.downMinutes };
    });

    // Die letzten 24 Stunden, ältestes zuerst: Kästchen und Kurve.
    const last24 = Array.from({ length: 24 }, (_, index) => byHour.get(nowHour - 23 + index));

    const blocks = Array.from({ length: 12 }, (_, index): BlockState => {
        const pair = [last24[index * 2], last24[index * 2 + 1]];
        const sum = (key: "checks" | "down" | "warn"): number => pair.reduce((total, entry) => total + (entry?.[key] ?? 0), 0);

        return stateOf(sum("checks"), sum("down"), sum("warn"));
    });

    const within = (from: number): { up: number; total: number } =>
        hours.filter((entry) => entry.hour > nowHour - from).reduce((sum, entry) => ({ up: sum.up + entry.checks - entry.down, total: sum.total + entry.checks }), { up: 0, total: 0 });

    const day = within(24);
    const month = within(30 * 24);
    const quarter = within(HISTORY_DAYS * 24);

    const measured = last24.filter((entry): entry is IHour => entry !== undefined && entry.latencyCount > 0);
    const latencySum = measured.reduce((sum, entry) => sum + entry.latencySum, 0);
    const latencyCount = measured.reduce((sum, entry) => sum + entry.latencyCount, 0);
    const maxima = measured.map((entry) => entry.latencyMax).filter((value): value is number => value !== null);

    return {
        days,
        blocks,
        uptime: { day: percent(day.up, day.total), month: percent(month.up, month.total), quarter: percent(quarter.up, quarter.total) },
        latency: {
            avg: latencyCount === 0 ? null : Math.round(latencySum / latencyCount),
            max: maxima.length === 0 ? null : Math.max(...maxima),
            series: last24.map((entry) => (entry && entry.latencyCount > 0 ? Math.round(entry.latencySum / entry.latencyCount) : null)),
            points: hourPoints(hours, nowHour - 23, 24),
        },
        lastOutage: outages.reduce<IOutage | null>((latest, outage) => (latest === null || outage.start > latest.start ? outage : latest), null),
    };
}

/** Eine Runde Messungen merken. Ohne Datenbank nichts. */
export async function recordChecks(measurements: readonly IMeasurement[], at: Date): Promise<void> {
    if (!databaseReady() || measurements.length === 0) return;

    await query(
        `INSERT INTO status_checks (checked_at, service, state, latency_ms) VALUES ${measurements.map(() => "(?, ?, ?, ?)").join(", ")}`,
        measurements.flatMap((entry) => [at, entry.service, entry.state, entry.latency])
    );
}

interface IHourRow {
    readonly service: StatusService;
    readonly hour: number | string;
    readonly checks: number | string;
    readonly down: number | string | null;
    readonly warn: number | string | null;
    readonly latency_sum: number | string | null;
    readonly latency_count: number | string;
    readonly latency_max: number | string | null;
}

/**
 * Stunden und Ausfälle der letzten 90 Tage. `null` ohne Datenbank.
 *
 * SUM liefert bei MariaDB DECIMAL, das kommt als Text: daher überall Number().
 */
export async function loadHistory(now: number, current: Partial<Record<StatusService, CheckState>>): Promise<{ readonly hours: IHour[]; readonly outages: IOutage[] } | null> {
    if (!databaseReady()) return null;

    const [hourRows, downRows] = await Promise.all([
        query<IHourRow[]>(
            `SELECT service, FLOOR(UNIX_TIMESTAMP(checked_at) / 3600) AS hour, COUNT(*) AS checks,
                    SUM(state = 'down') AS down, SUM(state = 'warn') AS warn,
                    SUM(latency_ms) AS latency_sum, COUNT(latency_ms) AS latency_count, MAX(latency_ms) AS latency_max
             FROM status_checks WHERE checked_at >= NOW() - INTERVAL ${HISTORY_DAYS} DAY
             GROUP BY service, hour`
        ),
        query<{ service: StatusService; at: number | string }[]>(
            `SELECT service, UNIX_TIMESTAMP(checked_at) AS at FROM status_checks
             WHERE state = 'down' AND checked_at >= NOW() - INTERVAL ${HISTORY_DAYS} DAY ORDER BY service, checked_at`
        ),
    ]);

    const hours = hourRows.map(
        (row): IHour => ({
            service: row.service,
            hour: Number(row.hour),
            checks: Number(row.checks),
            down: Number(row.down ?? 0),
            warn: Number(row.warn ?? 0),
            latencySum: Number(row.latency_sum ?? 0),
            latencyCount: Number(row.latency_count),
            latencyMax: row.latency_max === null ? null : Number(row.latency_max),
        })
    );

    return { hours, outages: outagesFrom(downRows.map((row) => ({ service: row.service, at: Number(row.at) * 1000 })), now, current) };
}
