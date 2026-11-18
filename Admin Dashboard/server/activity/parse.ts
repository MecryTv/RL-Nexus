import type { ActivityDevice, ActivityService, ActivitySource, StatusClass } from "../../shared/activity.ts";

/**
 * W-0138: eine Zeile aus dem nginx-Protokoll zerlegen und einordnen.
 *
 * Formate (Discord Bot/nginx/*.conf):
 *   $host $ip [$time_local] "$request" $status $bytes "$referer" "$agent"
 * beim Bot-Dashboard steht statt $request "$request_method $uri $server_protocol"
 * - dieselbe Form, nur ohne Abfrage. Die Abfrage (?…) wird als Erstes
 * abgeschnitten; in die Datenbank kommt ohnehin nur die Einordnung.
 */

export interface IAccessLine {
    host: string;
    at: Date;
    method: string;
    path: string;
    status: number;
    referer: string;
    agent: string;
}

export interface IHit {
    service: ActivityService;
    /** UTC, volle Stunde. */
    hour: Date;
    page: boolean;
    bot: boolean;
    /** Rauschen: Scanner-Pfade und 4xx, die kein echter Fehler sind (W-0139) - zählt nicht in der Fehlerquote. */
    scanner: boolean;
    device: ActivityDevice;
    source: ActivitySource;
    statusClass: StatusClass;
    view: boolean;
}

// ponytail: 8 kB je Zeile reichen für jede echte Anfrage; Längeres ist Müll oder Angriff.
const MAX_LINE = 8192;
const LINE = /^(\S+) \S+ \[([^\]]+)\] "([^"]*)" (\d{3}) (?:\d+|-) "([^"]*)" "([^"]*)"$/;
const REQUEST = /^([A-Z]+) (\/\S*)(?: HTTP\/[\d.]+)?$/;
const TIME = /^(\d{2})\/([A-Z][a-z]{2})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2})$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const HOSTS: Record<string, ActivityService> = {
    "nexus-emb.de": "website",
    "www.nexus-emb.de": "website",
    "status.nexus-emb.de": "status",
    "dashboard.nexus-emb.de": "dashboard",
};

// W-0138 Review: dazu Linkvorschauen (WhatsApp) und Skript-Clients (Go, axios).
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|curl|wget|python|go-http-client|axios|headlesschrome/i;
// W-0139: .env, .git und Co. an jeder Stelle, Verwaltungspfade und Endungen, die es bei uns nicht gibt.
const SCANNER = /(^|\/)\.(env|git|aws|ssh|svn|hg|vscode|DS_Store)|^\/(wp-|xmlrpc|cgi-bin|phpmyadmin|vendor\/|boaform)|\.(php\d?|asp|aspx|jsp|cgi|bak|sql|old|swp|ini|ya?ml|log)$/i;

function parseTime(text: string): Date | null {
    const match = TIME.exec(text);

    if (!match) return null;

    const [, day, month, year, hour, minute, second, sign, offsetHours, offsetMinutes] = match;
    const index = MONTHS.indexOf(month!);

    if (index < 0) return null;

    const offset = (sign === "-" ? -1 : 1) * (Number(offsetHours) * 60 + Number(offsetMinutes));
    const at = new Date(Date.UTC(Number(year), index, Number(day), Number(hour), Number(minute), Number(second)) - offset * 60_000);

    return Number.isNaN(at.getTime()) ? null : at;
}

export function parseAccessLine(line: string): IAccessLine | null {
    // Ungültiges UTF-8 kommt beim Lesen als Ersatzzeichen an.
    if (line.length === 0 || line.length > MAX_LINE || line.includes("�")) return null;

    const match = LINE.exec(line);

    if (!match) return null;

    const [, host, time, request, status, referer, agent] = match;
    const target = REQUEST.exec(request!);
    const at = parseTime(time!);
    const code = Number(status);

    if (!target || !at || code < 100 || code > 599) return null;

    return {
        host: host!.toLowerCase(),
        at,
        method: target[1]!,
        path: target[2]!.split("?")[0]!,
        status: code,
        referer: referer!,
        agent: agent!,
    };
}

function isPage(path: string): boolean {
    // /public/: die Statusseite fragt dort jede Minute nach (Review W-0138), das ist kein Aufruf.
    if (/^\/(assets|api|_ersatz|public)\//.test(path) || path.includes("favicon")) return false;

    // Eine Dateiendung im letzten Abschnitt heißt: Datei, keine Seite.
    return !/\.[a-z0-9]+$/i.test(path.slice(path.lastIndexOf("/") + 1));
}

function deviceOf(agent: string): ActivityDevice {
    if (/iPad|Tablet/i.test(agent)) return "tablet";
    if (/Mobi|Android|iPhone/i.test(agent)) return "mobile";

    return "desktop";
}

function sourceOf(referer: string): ActivitySource {
    if (referer === "" || referer === "-") return "direct";

    let host: string;

    try {
        host = new URL(referer).hostname.toLowerCase();
    } catch {
        return "other";
    }

    if (host === "discord.com" || host.endsWith(".discord.com") || host.includes("discordapp")) return "discord";
    if (/(^|\.)google\./.test(host)) return "google";
    if (host === "top.gg" || host.endsWith(".top.gg")) return "topgg";
    if (host === "nexus-emb.de" || host.endsWith(".nexus-emb.de")) return "direct";

    return "other";
}

/** W-0139: Kam der Aufruf von einer eigenen Seite? Dann ist ein 404 ein kaputter Link oder eine fehlende Datei bei uns. */
function fromOwnPage(referer: string): boolean {
    try {
        const host = new URL(referer).hostname.toLowerCase();

        return host === "nexus-emb.de" || host.endsWith(".nexus-emb.de");
    } catch {
        return false;
    }
}

export function classify(line: IAccessLine): IHit | null {
    const service = HOSTS[line.host];

    if (!service) return null;

    const agent = line.agent === "-" ? "" : line.agent;
    const bot = agent === "" || BOT.test(agent) || /^node\b/i.test(agent);
    const page = isPage(line.path);
    const hour = new Date(line.at);

    hour.setUTCMinutes(0, 0, 0);

    // W-0139 (Nutzer, 18.11.2026): Als 4xx-Fehler zählt nur „Seite nicht gefunden“ von einer eigenen Seite, der Rest ist Rauschen.
    const noise = line.status >= 400 && line.status < 500 && !(line.status === 404 && fromOwnPage(line.referer));

    return {
        service,
        hour,
        page,
        bot,
        scanner: SCANNER.test(line.path) || noise,
        device: deviceOf(agent),
        source: sourceOf(line.referer),
        statusClass: line.status >= 500 ? "5xx" : line.status >= 400 ? "4xx" : line.status >= 300 ? "3xx" : "2xx",
        view: line.method === "GET" && page && (line.status === 200 || line.status === 304) && !bot,
    };
}
