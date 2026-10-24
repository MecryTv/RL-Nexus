import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import { BrowserReportsOn, CLIENT_ERROR_MAX, CLIENT_ERROR_WINDOW } from "../constants/Report";
import { ErrorSignature, NewErrorId, Translate } from "../Guardian";
import { WantsJSON } from "../utils/admin";
import { SessionOf } from "../utils/dashboard";
import logger from "../utils/logger";

/** Was das Dashboard über einen Fehler schickt, geprüft und gekürzt. */
export interface IClientError {
    kind: "error" | "rejection" | "section" | "page";
    message: string;
    stack: string;
    page: string;
    section: string | null;
    steps: string[];
    browser: string;
    screen: string;
}

const KINDS: IClientError["kind"][] = ["error", "rejection", "section", "page"];
const KIND_LABELS: Record<IClientError["kind"], string> = {
    error: "Fehler im Skript",
    rejection: "Abgelehntes Promise",
    section: "Bereich lädt nicht",
    page: "Fehlerseite",
};

function Text(value: unknown, max: number): string | null {
    return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

/** null: unbrauchbar. Pfade ohne Abfrage, Schritte höchstens zehn. */
export function CleanClientError(raw: unknown): IClientError | null {
    if (typeof raw !== "object" || raw === null) return null;

    const body = raw as Record<string, unknown>;
    const kind = KINDS.find((entry) => entry === body.kind);
    const message = Text(body.message, 500);
    const page = Text(body.page, 200)?.split(/[?#]/)[0] ?? null;

    if (!kind || !message || !page?.startsWith("/")) return null;

    return {
        kind,
        message,
        stack: Text(body.stack, 8000) ?? message,
        page,
        section: Text(body.section, 60),
        steps: Array.isArray(body.steps) ? body.steps.flatMap((step) => Text(step, 160) ?? []).slice(-10) : [],
        browser: Text(body.browser, 120) ?? "unbekannt",
        screen: Text(body.screen, 40) ?? "unbekannt",
    };
}

/**
 * Fehler aus dem Bot-Dashboard (Plan 24): Das Dashboard meldet von selbst,
 * solange der Schalter an ist (BrowserReportsOn). Nur mit Sitzung, nur von der
 * eigenen Seite, höchstens 16 KB; je Person zehn je Minute und derselbe Fehler
 * nur einmal je Minute. Antwort: die Fehler-ID, die der Nutzer sieht.
 */
export default class DashboardApiClientError extends Route {
    /** Je Person: wann sie zuletzt gemeldet hat. */
    private readonly recent = new Map<string, number[]>();
    /** Je Person und Fehler: die ID der letzten Meldung. */
    private readonly same = new Map<string, { id: string; at: number }>();

    constructor(client: BotClient) {
        super(client, {
            method: "POST",
            path: `${DASHBOARD_PATH}/api/report/error`,
            description: "Nimmt Fehler aus dem Bot-Dashboard an und schickt sie an die Devs",
            prefixed: false,
            requiresAuth: false,
            rateLimit: { max: 30, timeWindow: "1 minute" },
            bodyLimit: 16 * 1024,
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        if (!BrowserReportsOn()) return reply.code(404).send({ error: "Not Found" });

        // Wie bei /beta: Der Browser sagt, woher der Abruf kommt.
        const site = request.headers["sec-fetch-site"];

        if (site !== undefined && site !== "same-origin") return reply.code(403).send({ error: "Nur vom Dashboard selbst." });
        if (!WantsJSON(request)) return reply.code(415).send({ error: "Nur application/json" });

        const session = SessionOf(this.client, request);

        if (!session) return reply.code(401).send({ error: "Nicht angemeldet." });

        const input = CleanClientError(request.body);

        if (!input) return reply.code(400).send({ error: "Der Bericht ist unvollständig." });

        const translated = Translate(input.stack);
        const where = translated.where ? `${translated.where.file}:${translated.where.line}${translated.where.fn ? ` in ${translated.where.fn}` : ""}` : "unbekannt";
        const message = `${KIND_LABELS[input.kind]}: ${input.message}`;
        const now = Date.now();
        const key = `${session.userId}|${ErrorSignature("dashboard", message, where)}`;
        const known = this.same.get(key);

        if (known && now - known.at < CLIENT_ERROR_WINDOW) return reply.send({ errorId: known.id });

        const times = (this.recent.get(session.userId) ?? []).filter((at) => now - at < CLIENT_ERROR_WINDOW);

        if (times.length >= CLIENT_ERROR_MAX) return reply.code(429).send({ error: "Zu viele Fehlerberichte in kurzer Zeit." });

        this.Prune(now);
        this.recent.set(session.userId, [...times, now]);

        const guildId = input.page.match(/\/guild\/(\d{17,20})/)?.[1];
        const guild = guildId ? this.client.guilds.cache.get(guildId) : undefined;
        const frames = Math.max(translated.stack.split("\n").length - 1, 0);
        const { id } = this.client.guardian.Report({
            id: NewErrorId(),
            kind: "dashboard",
            title: "🌐 Fehler im Dashboard",
            message,
            where,
            fields: [
                ["Was", message],
                ["Wo", `\`${where}\``],
                ["Seite", `\`${input.page}\`${input.section ? ` · Bereich „${input.section}“` : ""}`],
                ["Nutzer", `${session.username} \`${session.userId}\``],
                ...(guild ? ([["Server", guild.name]] as [string, string][]) : []),
                ["Browser", `${input.browser} · ${input.screen}`],
            ],
            excerpt: translated.excerpt,
            steps: input.steps,
            footer: `Stack: ${frames} Zeilen${translated.missing ? " · Karte zu diesem Build fehlt" : ""} · Sitzung #${logger.getCurrentSessionNumber()}`,
        });

        this.same.set(key, { id, at: now });

        // Ohne Nutzer und ohne IDs im Log: Wer betroffen war, steht in der DM (Datenschutz, Plan 24).
        logger.guardian("error", `🌐 Browser-Fehler [ID: ${id}] ${KIND_LABELS[input.kind]} auf ${input.page.replace(/\d{17,20}/g, ":id")}: ${input.message.slice(0, 200)}`);

        return reply.send({ errorId: id });
    }

    /** Hält die beiden Karten klein. */
    private Prune(now: number): void {
        if (this.recent.size + this.same.size < 500) return;

        for (const [user, times] of this.recent) if (times.every((at) => now - at >= CLIENT_ERROR_WINDOW)) this.recent.delete(user);
        for (const [key, entry] of this.same) if (now - entry.at >= CLIENT_ERROR_WINDOW) this.same.delete(key);
    }
}
