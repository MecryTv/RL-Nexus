import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";
import { SessionExpired } from "../services/DashboardService";
import { AvatarURL, DASHBOARD_HOME, DASHBOARD_PATH, ParseCookies, SerializeCookie } from "../constants/Dashboard";
import { SNOWFLAKE } from "../constants/Discord";
import { SessionOf, Unconfigured } from "../utils/dashboard";
import { IssuePass } from "../utils/invitepass";
import { CreateInviteState, INVITE_COOKIE_LIFETIME, INVITE_STATE_COOKIE, NonceList } from "../utils/invitestate";
import logger from "../utils/logger";
import { BannedFor } from "../utils/security";

/**
 * W-0064, Punkt 4 (Entwurf E-A): „Bot einladen“ läuft nur hierüber. Ohne
 * Anmeldung erst zu Discord und zurück. Wer den Server verwaltet, bekommt einen
 * Freigabe-Pass für genau diesen Server (15 Minuten, einmal) und landet bei
 * Discord mit dem Server schon ausgewählt. Ohne Server-ID geht es zur Liste,
 * dort hat jede Karte ihren eigenen Knopf.
 */
export default class DashboardInvite extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "GET",
            path: `${DASHBOARD_PATH}/einladen`,
            description: "Bot einladen mit Freigabe-Pass",
            prefixed: false,
            requiresAuth: false,
            rateLimit: { max: 20, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        const service = this.client.dashboardService;

        if (!service.IsConfigured) return Unconfigured(reply);

        const guildId = String((request.query as { guild?: string }).guild ?? "");
        const back = `${DASHBOARD_PATH}/einladen${SNOWFLAKE.test(guildId) ? `?guild=${guildId}` : ""}`;
        const session = SessionOf(this.client, request);

        if (!session) return reply.redirect(`${DASHBOARD_PATH}/login?return=${encodeURIComponent(back)}`, 302);
        if (!SNOWFLAKE.test(guildId)) return reply.redirect(DASHBOARD_HOME, 302);

        let card;

        try {
            card = await service.CardFor(session, guildId);
        } catch (error) {
            if (!(error instanceof SessionExpired)) throw error;

            return reply.redirect(`${DASHBOARD_PATH}/login?return=${encodeURIComponent(back)}`, 302);
        }

        // Einladen darf, wer den Server verwaltet (Owner oder Admin bei Discord). Staff-Karten zählen nicht.
        if (!card?.canManage || card.role === "Staff") return reply.redirect(DASHBOARD_HOME, 302);
        // W-0057: kein Freigabe-Pass für Gesperrte (eigene Server).
        if (BannedFor(session.userId, "own")) return reply.redirect(DASHBOARD_HOME, 302);

        if (!this.client.databaseService.Ready) {
            logger.warn(`🎟️  Freigabe-Pass für ${guildId} nicht angelegt: keine Datenbank`);

            return reply.redirect(DASHBOARD_HOME, 302);
        }

        await IssuePass(this.client, guildId, session.userId);

        // W-0069: einmaliger state für den Rückweg, im Speicher und als Cookie in diesem Browser.
        const state = CreateInviteState({
            guildId,
            guildName: card.name,
            guildIcon: card.icon,
            userId: session.userId,
            userName: session.username,
            userAvatar: session.avatar ? AvatarURL(session.userId, session.avatar) : null,
        });

        // Bis zu fünf offene Einladungen im Cookie, damit zwei Tabs sich nicht gegenseitig verdrängen.
        const cookie = NonceList(ParseCookies(request.headers.cookie)[INVITE_STATE_COOKIE], state);

        return reply
            .header("Cache-Control", "no-store")
            .header("Set-Cookie", SerializeCookie(INVITE_STATE_COOKIE, cookie, INVITE_COOKIE_LIFETIME, service.Secure))
            .redirect(service.InviteURL(guildId, state), 302);
    }
}
