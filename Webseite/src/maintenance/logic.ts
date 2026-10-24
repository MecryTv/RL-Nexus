/**
 * Der Wartungsbildschirm (Plan 23): was die Webseite vom Admin Dashboard über
 * `/api/wartung` erfährt, und die Regeln dazu. Ohne DOM, damit der Check
 * (`scripts/check-maintenance.mjs`) sie prüfen kann.
 *
 * Die Regel „läuft“ ist dieselbe wie im Admin Dashboard und im Bot: an, und
 * nicht mit Haken über die Endzeit hinaus. Die Webseite teilt keinen Code mit
 * dem Admin Dashboard, deshalb steht sie hier noch einmal.
 */

export interface IWebsiteMaintenance {
    readonly reason: string | null;
    readonly startedAt: string;
    /** null: ohne Endzeit. */
    readonly endsAt: string | null;
    readonly autoEnd: boolean;
}

const time = (value: unknown): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value));

/**
 * Die Antwort von `/api/wartung`. null: keine Wartung. undefined: unbrauchbar,
 * etwa eine Fehlerseite von nginx. Das zählt wie keine Antwort, die Seite bleibt offen.
 */
export function parseMaintenance(data: unknown): IWebsiteMaintenance | null | undefined {
    if (typeof data !== "object" || data === null || !("website" in data)) return undefined;

    const website = (data as { website: unknown }).website;
    if (website === null) return null;
    if (typeof website !== "object") return undefined;

    const { reason, startedAt, endsAt, autoEnd } = website as Record<string, unknown>;

    if ((reason !== null && typeof reason !== "string") || !time(startedAt) || (endsAt !== null && !time(endsAt)) || typeof autoEnd !== "boolean") return undefined;

    return { reason, startedAt, endsAt, autoEnd };
}

/** Diese Seiten bleiben während der Wartung offen: die Rechtstexte und die Vorschau fürs Admin Dashboard. */
const EXEMPT = ["/impressum", "/datenschutz", "/agb", "/widerruf"];

export function isExempt(pathname: string): boolean {
    const path = pathname.replace(/\/+$/, "") || "/";

    return EXEMPT.includes(path) || path === "/vorschau" || path.startsWith("/vorschau/");
}

/** Läuft die Wartung noch? Mit Haken endet sie zur Endzeit. */
export function isRunning(state: IWebsiteMaintenance | null, now: Date): boolean {
    return state !== null && !(state.autoEnd && state.endsAt !== null && Date.parse(state.endsAt) <= now.getTime());
}

/** Wie weit die Wartung ist, 0 bis 1. null ohne Endzeit. */
export function progress(state: IWebsiteMaintenance, now: Date): number | null {
    if (state.endsAt === null) return null;

    const start = Date.parse(state.startedAt);
    const total = Date.parse(state.endsAt) - start;

    if (total <= 0) return 1;

    return Math.min(1, Math.max(0, (now.getTime() - start) / total));
}

const ZONE = "Europe/Berlin";
const CALENDAR = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const CLOCK = new Intl.DateTimeFormat("de-DE", { timeZone: ZONE, hour: "numeric", minute: "2-digit" });
const DATE = new Intl.DateTimeFormat("de-DE", { timeZone: ZONE, weekday: "long", day: "numeric", month: "long" });
const SHORT_DATE = new Intl.DateTimeFormat("de-DE", { timeZone: ZONE, day: "2-digit", month: "2-digit" });

function berlinDay(at: Date): number {
    const [year, month, day] = CALENDAR.format(at).split("-").map(Number);

    return Date.UTC(year, month - 1, day) / 86_400_000;
}

/** „18:05“, in Berliner Zeit. */
export function clockText(iso: string): string {
    return CLOCK.format(new Date(iso));
}

/** „heute um 18:00 Uhr“, „morgen um 9:00 Uhr“, sonst „am Samstag, 31. Oktober, um 9:00 Uhr“. */
export function whenText(iso: string, now: Date): string {
    const at = new Date(iso);
    const days = berlinDay(at) - berlinDay(now);
    const clock = `${clockText(iso)} Uhr`;

    if (days === 0) return `heute um ${clock}`;
    if (days === 1) return `morgen um ${clock}`;

    return `am ${DATE.format(at)}, um ${clock}`;
}

/** Für die Zeitleiste: „18:05“ am selben Tag, sonst „gestern 18:05“, „morgen 9:00“ oder „31.10. 9:00“. */
export function dayClock(iso: string, now: Date): string {
    const days = berlinDay(new Date(iso)) - berlinDay(now);
    const clock = clockText(iso);

    if (days === 0) return clock;
    if (days === -1) return `gestern ${clock}`;
    if (days === 1) return `morgen ${clock}`;

    return `${SHORT_DATE.format(new Date(iso))} ${clock}`;
}

/** Die Zeile unter dem Grund. */
export function etaLine(state: IWebsiteMaintenance, now: Date): string {
    if (state.endsAt === null) return "Wie lange es dauert, steht noch nicht fest.";
    if (Date.parse(state.endsAt) <= now.getTime()) return "Es dauert etwas länger als geplant.";

    return `Voraussichtlich zurück ${whenText(state.endsAt, now)}`;
}

/**
 * Lohnt ein Neuladen? Nur, wenn die Wartung beginnt oder endet, verglichen mit
 * dem, was gerade zu sehen ist (`shown`, null: keine). Ein geänderter Grund
 * allein nicht. Ohne brauchbare Antwort (undefined) nur, wenn die gezeigte
 * Wartung von selbst vorbei ist: Danach bleibt die Seite offen, wie beim ersten Laden.
 */
export function stateChanged(shown: IWebsiteMaintenance | null, after: IWebsiteMaintenance | null | undefined, now: Date): boolean {
    if (after === undefined) return shown !== null && !isRunning(shown, now);

    return isRunning(after, now) !== (shown !== null);
}
