/**
 * Was /public/status liefert. Eine Kopie von `shared/status.ts` aus dem Admin
 * Dashboard, das die Antwort baut: Ändert sich dort etwas, gehört diese Datei
 * mit ausgetauscht. Ein gemeinsames Paket wäre für eine Datei zu viel.
 */

export const STATUS_SERVICES = ["bot", "dashboard", "website", "database"] as const;
export type StatusService = (typeof STATUS_SERVICES)[number];

export const STATUS_SERVICE_LABELS: Readonly<Record<StatusService, string>> = {
    bot: "Bot",
    dashboard: "Bot-Dashboard",
    website: "Webseite",
    database: "Datenbank",
};

/** ok: läuft. warn: läuft, aber langsam, in Wartung oder noch nicht bereit. down: antwortet nicht. */
export type CheckState = "ok" | "warn" | "down";
/** Für Balken und Kästchen: none heißt, in dieser Zeit wurde nicht gemessen. */
export type BlockState = CheckState | "none";

/** Ein Tag im Verlauf der Statusseite. */
export interface IStatusDay {
    /** YYYY-MM-DD in Berliner Zeit. */
    readonly date: string;
    readonly state: BlockState;
    /** Anteil verfügbar in Prozent, null ohne Messung. */
    readonly uptime: number | null;
    readonly outages: number;
    readonly downMinutes: number;
}

/** Ein Ausfall: aufeinanderfolgende Prüfungen ohne Antwort. */
export interface IOutage {
    readonly service: StatusService;
    readonly start: string;
    /** null: läuft noch. */
    readonly end: string | null;
    readonly minutes: number;
}

/** Zustand eines Punkts im Antwortzeit-Graphen. gap: nicht gemessen. */
export type PointState = "ok" | "warn" | "down" | "gap";

/** Eine Stunde im Graphen: Mittel der Antwortzeiten und der schlechteste Zustand. */
export interface ILatencyPoint {
    readonly value: number | null;
    readonly state: PointState;
}

export interface ILatency {
    /** Letzte Messung. */
    readonly now: number | null;
    /** Mittel und Höchstwert der letzten 24 Stunden. */
    readonly avg: number | null;
    readonly max: number | null;
    /** 24 Werte, einer je Stunde, ältester zuerst. null ohne Messung. */
    readonly series: readonly (number | null)[];
    /** Dieselben 24 Stunden mit Zustand. Fehlt bei einem älteren Admin-Server, dann zeichnet die Seite aus series. */
    readonly points?: readonly ILatencyPoint[];
}

export interface IUptime {
    /** Prozent in den letzten 24 Stunden, 30 und 90 Tagen. null ohne Messung. */
    readonly day: number | null;
    readonly month: number | null;
    readonly quarter: number | null;
}

/* --- Eigene Meldungen ----------------------------------------------------- */

export const INCIDENT_KINDS = ["stoerung", "wartung"] as const;
export type IncidentKind = (typeof INCIDENT_KINDS)[number];

export const INCIDENT_KIND_LABELS: Readonly<Record<IncidentKind, string>> = { stoerung: "Störung", wartung: "Wartung" };

/** Wie weit eine Meldung ist. Eine Wartung kennt nur „geplant“ und „geloest“, ob sie gerade läuft, sagt die Uhr. */
export const INCIDENT_STATES = ["geplant", "untersucht", "erkannt", "beobachtet", "geloest"] as const;
export type IncidentState = (typeof INCIDENT_STATES)[number];

/** Was bei welcher Art erlaubt ist. */
export const INCIDENT_STATES_OF: Readonly<Record<IncidentKind, readonly IncidentState[]>> = {
    stoerung: ["untersucht", "erkannt", "beobachtet", "geloest"],
    wartung: ["geplant", "geloest"],
};

export const INCIDENT_STATE_LABELS: Readonly<Record<IncidentState, string>> = {
    geplant: "Geplant",
    untersucht: "Wird untersucht",
    erkannt: "Ursache gefunden",
    beobachtet: "Wird beobachtet",
    geloest: "Gelöst",
};

export const INCIDENT_LIMITS = { title: { min: 4, max: 120 }, body: { min: 4, max: 1000 } } as const;

export interface IIncidentUpdate {
    readonly id: number;
    readonly state: IncidentState;
    readonly body: string;
    /** Name zum Zeitpunkt des Updates. Öffentlich steht hier nichts. */
    readonly by: string | null;
    readonly createdAt: string;
}

export interface IIncident {
    readonly id: number;
    readonly kind: IncidentKind;
    readonly title: string;
    readonly services: readonly StatusService[];
    readonly state: IncidentState;
    /** Nur bei einer Wartung. */
    readonly startsAt: string | null;
    readonly endsAt: string | null;
    readonly createdAt: string;
    readonly resolvedAt: string | null;
    /** Neueste zuerst. */
    readonly updates: readonly IIncidentUpdate[];
}

/** GET /api/status/incidents */
export interface IIncidentList {
    readonly open: readonly IIncident[];
    readonly past: readonly IIncident[];
    /** Wohin der Link „Statusseite“ führt. */
    readonly statusUrl: string;
}

/** Eingabe für eine neue Meldung. */
export interface IIncidentInput {
    readonly kind: IncidentKind;
    readonly title: string;
    readonly services: readonly StatusService[];
    readonly state: IncidentState;
    readonly body: string;
    readonly startsAt?: string;
    readonly endsAt?: string;
}

/* --- Öffentliche Statusseite (GET /public/status) ------------------------- */

export interface IPublicService {
    readonly id: StatusService;
    readonly state: CheckState;
    readonly uptime: IUptime;
    /** 90 Tage, ältester zuerst. */
    readonly days: readonly IStatusDay[];
    readonly latency: ILatency;
    readonly lastOutage: IOutage | null;
    /** Seit wann der Bot läuft, wann die Webseite gebaut wurde. Nur, was öffentlich sein darf. */
    readonly since: string | null;
}

/** Ein Eintrag unter „Störungen der letzten 14 Tage“. */
export interface IPastIssue {
    readonly kind: "ausfall" | "meldung";
    readonly title: string;
    readonly services: readonly StatusService[];
    readonly start: string;
    readonly end: string | null;
    readonly minutes: number;
    /** Bei einer Meldung das letzte Update. */
    readonly note: string | null;
}

export interface IPublicStatus {
    /** null: noch nie gemessen, der Server ist eben erst gestartet. */
    readonly checkedAt: string | null;
    readonly state: CheckState;
    readonly uptimeMonth: number | null;
    readonly latencyAvg: number | null;
    readonly servers: number | null;
    readonly members: number | null;
    /** Ende der letzten Störung, null wenn es in 90 Tagen keine gab. */
    readonly lastIssueEnd: string | null;
    readonly services: readonly IPublicService[];
    /** Laufende Störungen. */
    readonly incidents: readonly IIncident[];
    /** Geplante und laufende Wartungen. */
    readonly maintenance: readonly IIncident[];
    readonly history: readonly IPastIssue[];
    readonly links: { readonly website: string; readonly discord: string | null };
}
