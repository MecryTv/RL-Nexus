import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";
import { DASHBOARD_HOME, DASHBOARD_PATH } from "../constants/Dashboard";
import { BetaError } from "../services/DashboardService";
import { SessionOf } from "../utils/dashboard";
import { CreateToken } from "../utils/jwt";
import logger from "../utils/logger";

/**
 * Beta Access (Plan 22): Die Sperrseite schickt hierher den Beta-Code.
 *
 * Eingelöst wird im Admin Dashboard (POST ADMIN_INTERNAL_URL/internal/beta/redeem,
 * Token mit Scope "beta" wie bei den Backups): Dort stehen Codes und Tester,
 * der Bot liest sie nur. Danach geht es zurück auf die Startseite - mit Code
 * ins Dashboard, sonst mit ?beta=… auf die Sperrseite mit dem passenden Satz.
 *
 * Das Formular kommt als text/plain ("code=…"): Der Server liest von Haus aus
 * nur JSON und Text, und die Sperrseite soll ohne Skript auskommen.
 */

const TOKEN_LIFETIME = 60_000;

/** Der Code aus dem Formular. Kein Text: leer. */
export function CodeFromForm(body: unknown): string {
    if (typeof body !== "string") return "";

    return (/(?:^|\n)code=([^\r\n]*)/.exec(body)?.[1] ?? "").trim().slice(0, 40);
}

/** Fragt das Admin Dashboard. ok, falsch (400 mit Satz), sonst weg (nicht erreichbar, 401, 5xx). */
export async function RedeemAtAdmin(baseUrl: string, secret: string, user: { id: string; name: string }, code: string): Promise<"ok" | BetaError> {
    try {
        const response = await fetch(`${baseUrl}/internal/beta/redeem`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${CreateToken(secret, `dashboard:${user.id}`, TOKEN_LIFETIME, ["beta"])}`,
                "X-Actor-Name": encodeURIComponent(user.name),
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ code }),
            signal: AbortSignal.timeout(10_000),
        });

        if (response.ok) return "ok";

        return response.status === 400 ? "falsch" : "weg";
    } catch {
        return "weg";
    }
}

export default class DashboardBeta extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "POST",
            path: `${DASHBOARD_PATH}/beta`,
            description: "Beta-Code von der Sperrseite einlösen",
            prefixed: false,
            requiresAuth: false,
            // Gegen Durchprobieren: zehn Versuche je zehn Minuten.
            rateLimit: { max: 10, timeWindow: "10 minutes" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        // Ein Formular als text/plain darf jede Seite schicken. Der Browser sagt, woher es kommt:
        // nur von der eigenen Seite. Ältere Browser ohne den Header lässt SameSite=Lax am Cookie ohnehin nicht durch.
        const site = request.headers["sec-fetch-site"];

        if (site !== undefined && site !== "same-origin") return reply.code(403).send({ error: "Nur von der Sperrseite des Dashboards." });

        const session = SessionOf(this.client, request);

        if (!session) return reply.redirect(`${DASHBOARD_PATH}/login`, 302);

        const back = (error: BetaError): FastifyReply => reply.redirect(`${DASHBOARD_HOME}?beta=${error}`, 303);
        const code = CodeFromForm(request.body);

        if (!code) return back("leer");
        if (!this.client.config.ADMIN_INTERNAL_URL) return back("weg");

        const result = await RedeemAtAdmin(this.client.config.ADMIN_INTERNAL_URL, this.client.config.SERVER_JWT_SECRET, { id: session.userId, name: session.username }, code);

        if (result !== "ok") {
            if (result === "weg") logger.warn(`🔑 Beta-Code für ${session.userId} nicht eingelöst: Admin Dashboard nicht erreichbar oder Fehler.`);

            return back(result);
        }

        this.client.dashboardService.ForgetAccess(session.userId);
        logger.user(`🔑 Beta-Code eingelöst von ${session.userId}`);

        return reply.redirect(DASHBOARD_HOME, 303);
    }
}
