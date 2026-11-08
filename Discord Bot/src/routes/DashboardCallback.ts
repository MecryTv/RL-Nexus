import { timingSafeEqual } from "node:crypto";
import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";
import {
    ClearCookie,
    DASHBOARD_PATH,
    ParseCookies,
    SafeReturnPath,
    SerializeCookie,
    SESSION_COOKIE,
    SESSION_LIFETIME,
    AvatarURL,
    STATE_COOKIE,
} from "../constants/Dashboard";
import { BotAuthorization, MfaRequired } from "../services/DashboardService";
import { SendPage, Unconfigured } from "../utils/dashboard";
import { BlockedPage } from "../builder/BlockedPage";
import { LoginCheck } from "../utils/security";
import logger from "../utils/logger";

function Match(expected: string, received: string | undefined): boolean {
    if (!expected || !received) return false;

    const a = Buffer.from(expected);
    const b = Buffer.from(received);

    return a.length === b.length && timingSafeEqual(a, b);
}

export default class DashboardCallback extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "GET",
            path: `${DASHBOARD_PATH}/callback`,
            description: "Nimmt den OAuth2-Code von Discord entgegen und legt die Sitzung an",
            prefixed: false,
            requiresAuth: false,
            rateLimit: { max: 20, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        const service = this.client.dashboardService;

        if (!service.IsConfigured) return Unconfigured(reply);

        const query = request.query as { code?: string; state?: string; error?: string; guild_id?: string };
        const cookie = ParseCookies(request.headers.cookie)[STATE_COOKIE] ?? "";
        const separator = cookie.indexOf("|");
        const clear = ClearCookie(STATE_COOKIE, service.Secure);

        // Abgebrochen oder von Discord abgelehnt - kein Grund für einen 500er.
        if (query.error) {
            reply.header("Set-Cookie", clear).code(403);

            return SendPage(this.client, reply, "denied.html");
        }

        // W-0069: guild_id schickt Discord nur bei einer Bot-Freigabe. Ein Login mit
        // angehängtem bot-Scope würde sonst beim Tausch den Bot einladen, an
        // /einladen und dem state dort vorbei. Also kein Tausch.
        if (query.guild_id !== undefined) {
            logger.warn(`🔒 Login mit Bot-Freigabe abgewiesen (Server ${/^\d{17,20}$/.test(String(query.guild_id)) ? query.guild_id : "?"})`);
            reply.header("Set-Cookie", clear).code(400);

            return SendPage(this.client, reply, "denied.html");
        }

        const nonce = separator < 0 ? "" : cookie.slice(0, separator);
        const back = SafeReturnPath(separator < 0 ? undefined : cookie.slice(separator + 1));

        if (!query.code || !Match(nonce, query.state)) {
            reply.header("Set-Cookie", clear).code(400);

            return SendPage(this.client, reply, "denied.html");
        }

        let session;

        try {
            session = await service.Exchange(query.code);
        } catch (error) {
            // W-0069, Review 1: Der Code stammte aus einer Bot-Freigabe (alter Code
            // mit neuem state, ohne guild_id in der Adresse). Der Bot ist damit schon
            // beigetreten, an /einladen vorbei: sofort wieder gehen, keine Sitzung.
            if (error instanceof BotAuthorization) {
                logger.warn(`🔒 Login mit Bot-Freigabe abgewiesen, Bot verlässt Server ${error.guildId ?? "?"}`);
                if (error.guildId) await service.LeaveGuild(error.guildId);
                reply.header("Set-Cookie", clear).code(400);

                return SendPage(this.client, reply, "denied.html");
            }

            // Kein Zwei-Faktor am Discord-Konto. Das ist kein Ausfall, sondern
            // eine Absage mit einem Weg daraus - also eine Anleitung statt eines
            // 500ers. Alles andere fliegt weiter nach oben.
            if (!(error instanceof MfaRequired)) throw error;

            reply.header("Set-Cookie", clear).code(403);

            return SendPage(this.client, reply, "mfa.html");
        }

        // W-0057, Prüfung D3: Sperre, gleiche IP, VPN. Gesperrt oder blockiert: keine Sitzung, die Seite C4c oder V-A+.
        const blocked = await LoginCheck(this.client, { userId: session.userId, name: session.username, avatar: AvatarURL(session.userId, session.avatar), ip: request.ip });

        if (blocked) {
            await service.Revoke(session);

            const { page, values } = BlockedPage(blocked);

            reply.header("Set-Cookie", clear).code(403);

            return SendPage(this.client, reply, page, values);
        }

        const cookies = [clear, SerializeCookie(SESSION_COOKIE, service.Sign(session), SESSION_LIFETIME, service.Secure)];

        return reply.header("Set-Cookie", cookies).redirect(back, 302);
    }
}
