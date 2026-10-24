import type { IMaintenanceState } from "../../shared/maintenance.ts";
import {
    STATUS_SERVICE_LABELS,
    STATUS_SERVICES,
    type CheckState,
    type IIncident,
    type IPastIssue,
    type IPublicService,
    type IPublicStatus,
    type StatusService,
} from "../../shared/status.ts";
import type { IConfig } from "../config.ts";
import { databaseReady } from "../db.ts";
import { publish } from "../events.ts";
import { loadHistory, recordChecks, summarize, type IServiceHistory } from "./history.ts";
import { listIncidents, resolvedSince } from "./incidents.ts";
import { measure, type IMeasured } from "./measure.ts";

/**
 * Der Stand nach der letzten Prüfung: Messung, Verlauf, Meldungen. Daraus
 * entstehen die öffentliche Antwort für status.nexus-emb.de und die
 * Discord-Nachricht. Gebaut einmal je Prüfung und im Speicher gehalten: Die
 * Statusseite fragt jede Minute, die Datenbank soll dafür nicht jedes Mal
 * 90 Tage zusammenrechnen.
 */

/** So weit zurück reicht „Störungen der letzten 14 Tage“. */
const RECENT = 14 * 24 * 60 * 60_000;

/** Mehr Einträge zeigt die Liste nicht. */
const RECENT_MAX = 20;

const RANK: Readonly<Record<CheckState, number>> = { ok: 0, warn: 1, down: 2 };

export interface IServiceSnapshot extends IServiceHistory {
    readonly id: StatusService;
    readonly state: CheckState;
    /** Letzte Messung in ms. */
    readonly latencyNow: number | null;
}

export interface IStatusSnapshot {
    readonly measured: IMeasured;
    readonly state: CheckState;
    readonly services: readonly IServiceSnapshot[];
    /** Offene Störungen. */
    readonly incidents: readonly IIncident[];
    /** Offene Wartungen, deren Ende noch nicht vorbei ist, früheste zuerst. */
    readonly maintenance: readonly IIncident[];
    readonly history: readonly IPastIssue[];
    readonly uptimeMonth: number | null;
    readonly latencyAvg: number | null;
    readonly lastIssueEnd: string | null;
}

let latest: IStatusSnapshot | null = null;
let publicCache: IPublicStatus | null = null;

type HistoryLoader = typeof loadHistory;
type History = NonNullable<Awaited<ReturnType<HistoryLoader>>>;

/** Für die Checks: ein eigener Lader statt der Datenbank. null stellt zurück und vergisst den gemerkten Verlauf. */
let historyLoader: HistoryLoader | null = null;
/** Der zuletzt gelesene Verlauf. Ist die Datenbank weg, zeigen Leitstand und Statusseite ihn weiter. */
let lastHistory: History | null = null;

export function setHistoryLoader(loader: HistoryLoader | null): void {
    historyLoader = loader;
    if (loader === null) lastHistory = null;
}

/** Stunden und Ausfälle der letzten 90 Tage, wie zuletzt gelesen. Für den Leitstand. */
export function historyData(): History | null {
    return lastHistory;
}

function worst(states: readonly CheckState[]): CheckState {
    return states.reduce<CheckState>((current, state) => (RANK[state] > RANK[current] ? state : current), "ok");
}

/** Läuft eine Wartung gerade? */
export function maintenanceRunning(incident: IIncident, now: number): boolean {
    return incident.startsAt !== null && incident.endsAt !== null && Date.parse(incident.startsAt) <= now && now < Date.parse(incident.endsAt);
}

function minutesBetween(start: string, end: string | null, now: number): number {
    return Math.max(1, Math.round(((end === null ? now : Date.parse(end)) - Date.parse(start)) / 60_000));
}

/** Ein Durchlauf: messen, merken, Verlauf und Meldungen laden, Stand bauen. */
export async function refreshStatus(config: IConfig): Promise<IStatusSnapshot> {
    const measured = await measure(config);
    const now = measured.at.getTime();
    const current = Object.fromEntries(measured.measurements.map((entry) => [entry.service, entry.state])) as Record<StatusService, CheckState>;

    await recordChecks(measured.measurements, measured.at).catch((error: unknown) => {
        console.error(`⚠️  Statusprüfung nicht gespeichert: ${error instanceof Error ? error.message : String(error)}`);
    });

    // Ohne Datenbank kein Verlauf und keine Meldungen. Die Messung allein gilt trotzdem.
    const [fresh, incidents, resolved] = await Promise.all([
        (historyLoader ?? loadHistory)(now, current).catch(() => null),
        databaseReady() ? listIncidents().catch(() => null) : null,
        databaseReady() ? resolvedSince(new Date(now - RECENT)).catch(() => []) : [],
    ]);

    if (fresh) lastHistory = fresh;
    const history = fresh ?? lastHistory;
    const outages = history?.outages ?? [];

    const services = STATUS_SERVICES.map((id): IServiceSnapshot => {
        const measurement = measured.measurements.find((entry) => entry.service === id);

        return {
            id,
            state: current[id],
            latencyNow: measurement?.latency ?? null,
            ...summarize(
                (history?.hours ?? []).filter((entry) => entry.service === id),
                outages.filter((outage) => outage.service === id),
                now
            ),
        };
    });

    const open = incidents?.open ?? [];
    const openIncidents = open.filter((incident) => incident.kind === "stoerung");
    const maintenance = open
        .filter((incident) => incident.kind === "wartung" && incident.endsAt !== null && Date.parse(incident.endsAt) > now)
        .sort((a, b) => Date.parse(a.startsAt ?? "") - Date.parse(b.startsAt ?? ""));

    // Eine offene Störung oder laufende Wartung macht den Gesamtzustand mindestens gelb.
    const flagged = openIncidents.length > 0 || maintenance.some((incident) => maintenanceRunning(incident, now));
    const state = worst([...services.map((service) => service.state), flagged ? "warn" : "ok"]);

    const recentOutages = outages
        .filter((outage) => Date.parse(outage.start) >= now - RECENT)
        .map(
            (outage): IPastIssue => ({
                kind: "ausfall",
                title: `${STATUS_SERVICE_LABELS[outage.service]} nicht erreichbar`,
                services: [outage.service],
                start: outage.start,
                end: outage.end,
                minutes: outage.minutes,
                note: null,
            })
        );

    const recentIncidents = resolved
        .filter((incident) => incident.kind === "stoerung")
        .map(
            (incident): IPastIssue => ({
                kind: "meldung",
                title: incident.title,
                services: incident.services,
                start: incident.createdAt,
                end: incident.resolvedAt,
                minutes: minutesBetween(incident.createdAt, incident.resolvedAt, now),
                note: incident.updates[0]?.body ?? null,
            })
        );

    const issues = [...recentOutages, ...recentIncidents].sort((a, b) => b.start.localeCompare(a.start)).slice(0, RECENT_MAX);

    // Verfügbarkeit und Antwortzeit über alle Dienste: Mittel der Werte, die es gibt.
    const mean = (values: readonly (number | null)[]): number | null => {
        const known = values.filter((value): value is number => value !== null);

        return known.length === 0 ? null : known.reduce((sum, value) => sum + value, 0) / known.length;
    };

    const uptimeMonth = mean(services.map((service) => service.uptime.month));
    const latencyAvg = mean(services.map((service) => service.latency.avg));

    const ends = [...outages.map((outage) => outage.end), ...resolved.filter((incident) => incident.kind === "stoerung").map((incident) => incident.resolvedAt)].filter(
        (end): end is string => end !== null
    );

    latest = {
        measured,
        state,
        services,
        incidents: openIncidents,
        maintenance,
        history: issues,
        uptimeMonth: uptimeMonth === null ? null : Math.floor(uptimeMonth * 100) / 100,
        latencyAvg: latencyAvg === null ? null : Math.round(latencyAvg),
        lastIssueEnd: ends.length === 0 ? null : ends.reduce((a, b) => (a > b ? a : b)),
    };

    publicCache = toPublic(latest, config);
    publish("status");

    return latest;
}

/** Namen von Personen gehen nicht nach außen. */
function anonymous(incident: IIncident): IIncident {
    return { ...incident, updates: incident.updates.map((update) => ({ ...update, by: null })) };
}

/** Die Wartung eines Dienstes für die Statusseite: Grund und Endzeit, kein Name. */
function pausedOf(state: IMaintenanceState | null): IPublicService["paused"] {
    return state ? { reason: state.reason, endsAt: state.endsAt } : null;
}

/** Was status.nexus-emb.de bekommt: nur, was öffentlich sein darf. Kein Speicher, keine Größen, keine Kontakte. */
export function toPublic(snapshot: IStatusSnapshot, config: IConfig): IPublicStatus {
    const bot = snapshot.measured.bot;

    return {
        checkedAt: snapshot.measured.at.toISOString(),
        state: snapshot.state,
        uptimeMonth: snapshot.uptimeMonth,
        latencyAvg: snapshot.latencyAvg,
        servers: bot ? bot.guilds.length : null,
        members: bot ? bot.guilds.reduce((sum, guild) => sum + guild.members, 0) : null,
        lastIssueEnd: snapshot.lastIssueEnd,
        services: snapshot.services.map((service) => ({
            id: service.id,
            state: service.state,
            uptime: service.uptime,
            days: service.days,
            latency: { now: service.latencyNow, ...service.latency },
            lastOutage: service.lastOutage,
            since: service.id === "bot" ? (bot?.startedAt ?? null) : service.id === "website" ? snapshot.measured.website.builtAt : null,
            paused: pausedOf(service.id === "website" ? snapshot.measured.maintenance.website : service.id === "dashboard" ? snapshot.measured.maintenance.dashboard : null),
        })),
        incidents: snapshot.incidents.map(anonymous),
        maintenance: snapshot.maintenance.map(anonymous),
        history: snapshot.history,
        links: { website: config.websitePublicUrl, discord: config.discordInviteUrl },
    };
}

/** Der letzte Stand für status.nexus-emb.de. null, solange noch nie gemessen wurde. */
export function publicStatus(): IPublicStatus | null {
    return publicCache;
}

export function statusSnapshot(): IStatusSnapshot | null {
    return latest;
}
