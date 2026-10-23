import {
    STATUS_SERVICES,
    type CheckState,
    type DetailRange,
    type ICheckRound,
    type IChartPoint,
    type IIncident,
    type IOutage,
    type IOutageEvent,
    type IServiceDetail,
    type ISpan,
    type IStatusDetail,
    type ITech,
    type StatusService,
} from "../../shared/status.ts";
import { databaseReady, query } from "../db.ts";
import { lastStatusPost } from "../status-post.ts";
import { CHECK_EVERY, hourPoints, percent, type IHour } from "./history.ts";
import { resolvedSince, listIncidents } from "./incidents.ts";
import { historyData, statusSnapshot, type IStatusSnapshot } from "./snapshot.ts";

/**
 * Der Leitstand unter Admin → Status: Lücken in der Messung, Ausfall-Ereignisse,
 * Median und 95-%-Wert, welche Meldung zu welchem Ausfall gehört (Spec
 * 2026-10-17-status-leitstand-design.md). Alle Zeiten in Millisekunden.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const RANGE_DAYS: Readonly<Record<DetailRange, number>> = { "24h": 1, "7d": 7, "30d": 30 };

/** Eine gespeicherte Prüfung, wie `loadDetail` sie liest. */
export interface IRawCheck {
    readonly service: StatusService;
    readonly at: number;
    readonly state: CheckState;
    readonly latency: number | null;
}

/** Liegen zwei Prüfungen eines Dienstes weiter auseinander, wurde dazwischen nicht gemessen. */
export const GAP_AFTER = 5 * MINUTE;

interface ISpanMs {
    readonly start: number;
    readonly end: number;
}

/**
 * Die nicht gemessenen Zeiten eines Dienstes zwischen `from` und `to`. `times`
 * sind seine Prüfungen, aufsteigend. Eine Lücke beginnt dort, wo die nächste
 * Prüfung fällig gewesen wäre, und endet mit der nächsten echten.
 */
export function findGaps(times: readonly number[], from: number, to: number): ISpanMs[] {
    if (times.length === 0) return to > from ? [{ start: from, end: to }] : [];

    const gaps: ISpanMs[] = [];
    if (times[0] - from > GAP_AFTER) gaps.push({ start: from, end: times[0] });

    for (let index = 1; index < times.length; index++) {
        if (times[index] - times[index - 1] > GAP_AFTER) gaps.push({ start: times[index - 1] + CHECK_EVERY, end: times[index] });
    }

    const last = times[times.length - 1];
    if (to - last > GAP_AFTER) gaps.push({ start: last + CHECK_EVERY, end: to });

    return gaps;
}

/** Nearest-Rank: der kleinste Wert, unter dem mindestens der Anteil `q` liegt. */
export function quantile(values: readonly number[], q: number): number | null {
    if (values.length === 0) return null;

    const sorted = [...values].sort((a, b) => a - b);

    return sorted[Math.min(sorted.length, Math.max(1, Math.ceil(q * sorted.length))) - 1];
}

/** Ausfälle einzelner Dienste, die sich überschneiden, als ein Ereignis. Neueste zuerst. */
export function mergeOutages(outages: readonly IOutage[], now: number): Omit<IOutageEvent, "incident">[] {
    const spans = outages
        .map((outage) => ({ start: Date.parse(outage.start), end: outage.end === null ? now : Date.parse(outage.end), open: outage.end === null, service: outage.service }))
        .sort((a, b) => a.start - b.start);

    const merged: { start: number; end: number; open: boolean; services: Set<StatusService> }[] = [];

    for (const span of spans) {
        const current = merged.at(-1);

        if (current && span.start <= current.end) {
            current.end = Math.max(current.end, span.end);
            current.open ||= span.open;
            current.services.add(span.service);
        } else {
            merged.push({ start: span.start, end: span.end, open: span.open, services: new Set([span.service]) });
        }
    }

    return merged
        .map((event) => ({
            start: new Date(event.start).toISOString(),
            end: event.open ? null : new Date(event.end).toISOString(),
            minutes: Math.max(1, Math.round(((event.open ? Math.max(now, event.end) : event.end) - event.start) / MINUTE)),
            services: STATUS_SERVICES.filter((service) => event.services.has(service)),
        }))
        .reverse();
}

/** Die Störungsmeldung zu einem Ereignis: gemeinsamer Dienst, Zeiträume überschneiden sich. Bei mehreren die zuerst angelegte. */
export function incidentFor(event: Omit<IOutageEvent, "incident">, incidents: readonly IIncident[], now: number): IIncident | null {
    const start = Date.parse(event.start);
    const end = event.end === null ? now : Date.parse(event.end);

    const matching = incidents.filter((incident) => {
        if (incident.kind !== "stoerung" || !incident.services.some((service) => event.services.includes(service))) return false;

        const from = Date.parse(incident.createdAt);
        const until = incident.resolvedAt === null ? now : Date.parse(incident.resolvedAt);

        return from <= end && until >= start;
    });

    return matching.reduce<IIncident | null>((first, incident) => (first === null || incident.createdAt < first.createdAt ? incident : first), null);
}

const iso = (time: number): string => new Date(time).toISOString();

/** Verfügbarkeit aus den Stunden eines Dienstes, wie `summarize`: nur echte Prüfungen zählen. */
function uptimeWithin(hours: readonly IHour[], nowHour: number, span: number): number | null {
    const inside = hours.filter((entry) => entry.hour > nowHour - span);

    return percent(
        inside.reduce((sum, entry) => sum + entry.checks - entry.down, 0),
        inside.reduce((sum, entry) => sum + entry.checks, 0)
    );
}

/** Mittel der bekannten Werte, auf zwei Stellen abgerundet wie `uptimeMonth`. */
function meanPercent(values: readonly (number | null)[]): number | null {
    const known = values.filter((value): value is number => value !== null);

    return known.length === 0 ? null : Math.floor((known.reduce((sum, value) => sum + value, 0) / known.length) * 100) / 100;
}

function techOf(snapshot: IStatusSnapshot | null): ITech {
    const measured = snapshot?.measured;
    const bot = measured?.bot ?? null;
    const database = measured?.database;

    return {
        bot: bot && {
            startedAt: bot.startedAt,
            rss: bot.memory.rss,
            heapUsed: bot.memory.heapUsed,
            guilds: bot.guilds.length,
            members: bot.guilds.reduce((sum, guild) => sum + guild.members, 0),
            versions: { app: bot.versions.app, node: bot.versions.node, discordjs: bot.versions.discordjs },
        },
        database: database?.online ? { version: database.version, uptime: database.uptime, tables: database.tables, bytes: database.bytes, rows: database.rows } : null,
        website: { builtAt: measured?.website.builtAt ?? null, banner: (measured?.banner ?? null) !== null },
    };
}

/**
 * Alles für den Leitstand aus reinen Eingaben. `rows` decken den Zeitraum ab,
 * mindestens 24 Stunden; `hours` und `outages` sind die 90 Tage aus dem Verlauf.
 */
export function buildDetail(input: {
    readonly range: DetailRange;
    readonly now: number;
    readonly snapshot: IStatusSnapshot | null;
    readonly hours: readonly IHour[];
    readonly outages: readonly IOutage[];
    readonly rows: readonly IRawCheck[];
    readonly incidents: readonly IIncident[];
    readonly statusPostAt: string | null;
}): IStatusDetail {
    const { range, now, snapshot } = input;
    const from = now - RANGE_DAYS[range] * DAY;
    const nowHour = Math.floor(now / HOUR);
    const hourCount = RANGE_DAYS[range] * 24;
    const rows = [...input.rows].sort((a, b) => a.at - b.at);
    const dayGaps: { start: number; end: number }[] = [];

    const services = STATUS_SERVICES.map((id): IServiceDetail => {
        const mine = rows.filter((row) => row.service === id);
        const inRange = mine.filter((row) => row.at >= from);
        const hours = input.hours.filter((entry) => entry.service === id);
        const latencies = inRange.map((row) => row.latency).filter((value): value is number => value !== null);
        const fromSnapshot = snapshot?.services.find((service) => service.id === id);

        dayGaps.push(...findGaps(mine.filter((row) => row.at >= now - DAY).map((row) => row.at), now - DAY, now));

        const points: IChartPoint[] =
            range === "24h"
                ? inRange.map((row) => ({ at: iso(row.at), value: row.latency, state: row.state }))
                : hourPoints(hours, nowHour - hourCount + 1, hourCount).map((point, index) => ({ ...point, at: iso((nowHour - hourCount + 1 + index) * HOUR) }));

        const gaps = findGaps(
            inRange.map((row) => row.at),
            from,
            now
        ).map((gap): ISpan => ({ start: iso(gap.start), end: iso(gap.end), kind: "gap" }));
        const downs = input.outages
            .filter((outage) => outage.service === id && (outage.end === null || Date.parse(outage.end) >= from))
            .map((outage): ISpan => ({ start: outage.start, end: outage.end, kind: "down" }));

        return {
            id,
            state: fromSnapshot?.state ?? mine.at(-1)?.state ?? "ok",
            latencyNow: fromSnapshot?.latencyNow ?? mine.at(-1)?.latency ?? null,
            median: quantile(latencies, 0.5),
            p95: quantile(latencies, 0.95),
            max: latencies.length === 0 ? null : Math.max(...latencies),
            slow: inRange.filter((row) => row.state === "warn").length,
            uptime: {
                day: uptimeWithin(hours, nowHour, 24),
                week: uptimeWithin(hours, nowHour, 7 * 24),
                month: uptimeWithin(hours, nowHour, 30 * 24),
                quarter: uptimeWithin(hours, nowHour, 90 * 24),
            },
            points,
            spans: [...gaps, ...downs].sort((a, b) => a.start.localeCompare(b.start)),
        };
    });

    const outages = mergeOutages(input.outages, now).map((event): IOutageEvent => {
        const incident = incidentFor(event, input.incidents, now);

        return { ...event, incident: incident && { id: incident.id, title: incident.title } };
    });
    const recent = outages.filter((event) => Date.parse(event.start) >= now - 30 * DAY);

    const rounds = new Map<number, Partial<Record<StatusService, { state: CheckState; latency: number | null }>>>();
    for (const row of rows.filter((entry) => entry.at > now - HOUR)) rounds.set(row.at, { ...rounds.get(row.at), [row.service]: { state: row.state, latency: row.latency } });

    const created = input.incidents.map((incident) => incident.createdAt);

    return {
        range,
        generatedAt: iso(now),
        checkedAt: snapshot ? snapshot.measured.at.toISOString() : null,
        nextCheckAt: snapshot ? iso(snapshot.measured.at.getTime() + CHECK_EVERY) : null,
        checksDay: rows.filter((row) => row.at >= now - DAY).length,
        uptime: {
            day: meanPercent(services.map((service) => service.uptime.day)),
            week: meanPercent(services.map((service) => service.uptime.week)),
            month: meanPercent(services.map((service) => service.uptime.month)),
        },
        outages30: { count: recent.length, minutes: recent.reduce((sum, event) => sum + event.minutes, 0) },
        untrackedDayMinutes: unionMinutes(dayGaps),
        latencyAvg: snapshot?.latencyAvg ?? null,
        openIncidents: input.incidents.filter((incident) => incident.resolvedAt === null).length,
        lastIncidentAt: created.length === 0 ? null : created.reduce((a, b) => (a > b ? a : b)),
        statusPostAt: input.statusPostAt,
        services,
        outages,
        rounds: [...rounds.entries()].sort((a, b) => b[0] - a[0]).map(([at, values]): ICheckRound => ({ at: iso(at), values })),
        tech: techOf(snapshot),
    };
}

/** Woher die Prüfungen und Meldungen kommen. Die Checks setzen eine eigene Quelle. */
export interface IDetailSource {
    readonly rows: (range: DetailRange) => Promise<IRawCheck[]>;
    readonly incidents: () => Promise<IIncident[]>;
}

const DATABASE: IDetailSource = {
    rows: async (range) =>
        (
            await query<{ service: StatusService; at: number | string; state: CheckState; latency_ms: number | null }[]>(
                `SELECT service, UNIX_TIMESTAMP(checked_at) AS at, state, latency_ms FROM status_checks
                  WHERE checked_at >= NOW() - INTERVAL ${RANGE_DAYS[range]} DAY ORDER BY checked_at`
            )
        ).map((row): IRawCheck => ({ service: row.service, at: Math.round(Number(row.at) * 1000), state: row.state, latency: row.latency_ms === null ? null : Number(row.latency_ms) })),
    incidents: async () => {
        const [list, resolved] = await Promise.all([listIncidents(), resolvedSince(new Date(Date.now() - 90 * DAY))]);

        return [...list.open, ...resolved];
    },
};

let source: IDetailSource | null = null;

/** Gemerkt bis zur nächsten Prüfung, je Zeitraum: Aufklappen und Umschalten lesen nicht jedes Mal 30 Tage. */
const cache = new Map<DetailRange, { readonly stamp: number; readonly detail: IStatusDetail }>();
/**
 * Die zuletzt gelesenen Prüfungen je Zeitraum und die Meldungen. Ist die
 * Datenbank weg, zeigt der Leitstand sie weiter, statt alles grau zu machen;
 * nur die Zeit seitdem ist dann nicht gemessen, und das stimmt.
 * ponytail: hält bis zu 30 Tage Prüfungen im Speicher (rund 86.000 Zeilen), bei Platzmangel nur 24 Std. merken.
 */
const lastRows = new Map<DetailRange, IRawCheck[]>();
let lastIncidents: IIncident[] | null = null;

/** Für die Checks. null stellt zurück und vergisst alles Gemerkte. */
export function setDetailSource(next: IDetailSource | null): void {
    source = next;
    cache.clear();
    lastRows.clear();
    lastIncidents = null;
}

export async function loadDetail(range: DetailRange): Promise<IStatusDetail> {
    const snapshot = statusSnapshot();
    const stamp = snapshot?.measured.at.getTime() ?? 0;
    const cached = cache.get(range);
    if (cached && stamp !== 0 && cached.stamp === stamp) return cached.detail;

    const now = Date.now();
    const from = source ?? (databaseReady() ? DATABASE : null);
    const [rows, incidents] = from ? await Promise.all([from.rows(range).catch(() => null), from.incidents().catch(() => null)]) : [null, null];

    if (rows) lastRows.set(range, rows);
    if (incidents) lastIncidents = incidents;

    const history = historyData();
    const detail = buildDetail({
        range,
        now,
        snapshot,
        hours: history?.hours ?? [],
        outages: history?.outages ?? [],
        rows: rows ?? lastRows.get(range) ?? [],
        incidents: incidents ?? lastIncidents ?? [],
        statusPostAt: lastStatusPost(),
    });

    // Nur ein frisches Ergebnis wird gemerkt. Eins aus dem Gedächtnis würde sonst einen ganzen Prüfabstand stehen bleiben.
    if (stamp !== 0 && rows && incidents) cache.set(range, { stamp, detail });

    return detail;
}

/** Wie lange die Zeiträume zusammen dauern, Überschneidungen einmal gezählt. In Minuten. */
export function unionMinutes(spans: readonly ISpanMs[]): number {
    const sorted = [...spans].sort((a, b) => a.start - b.start);
    let total = 0;
    let open: ISpanMs | null = null;

    for (const span of sorted) {
        if (open && span.start <= open.end) {
            open = { start: open.start, end: Math.max(open.end, span.end) };
            continue;
        }

        if (open) total += open.end - open.start;
        open = span;
    }

    if (open) total += open.end - open.start;

    return Math.round(total / MINUTE);
}
