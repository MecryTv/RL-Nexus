import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";
import { AvatarURL, ClearCookie, DASHBOARD_HOME, DASHBOARD_PATH, ParseCookies, SerializeCookie } from "../constants/Dashboard";
import { SNOWFLAKE } from "../constants/Discord";
import { SendPage, SessionOf, Unconfigured } from "../utils/dashboard";
import {
    DecideInvite,
    IInviteQuery,
    IInviteState,
    INVITE_COOKIE_LIFETIME,
    INVITE_STATE_COOKIE,
    InviteFailReason,
    NonceFromCookie,
    TakeInviteState,
    WaitFor,
    WithoutNonce,
} from "../utils/invitestate";
import { IssuePass, RefuseReason } from "../utils/invitepass";
import { JoinOutcome } from "../utils/joinoutcome";
import { InviteFailPage } from "../builder/InviteFailPage";
import { InviteExchangeFailed } from "../services/DashboardService";
import IDashboardSession from "../interfaces/services/dashboard/IDashboardSession";
import logger from "../utils/logger";
import { BannedFor } from "../utils/security";

/** So lange wartet der Rückweg nach dem Tausch auf die Entscheidung von GuildJoined. */
const JOIN_WAIT = 8_000;
/** Ohne Antwort von Discord: so lange schauen, ob der Bot trotzdem beigetreten ist. */
const UNSURE_WAIT = 3_000;

/**
 * W-0069: Rückweg von Discord nach „Bot einladen“. Mit „Requires OAuth2 Code
 * Grant“ tritt der Bot erst bei, wenn hier der Code eingetauscht wird. Das
 * geschieht nur, wenn der state im Cookie dieses Browsers steht, höchstens 15
 * Minuten alt ist, dieselbe Person angemeldet ist und der Server passt. Sonst
 * kommt die Seite „Einladung nicht abgeschlossen“ (Entwurf B+), und der Bot
 * bleibt draußen.
 *
 * Nach dem Tausch zählt, was Discord sagt: Nennt die Antwort einen anderen
 * Server, geht der Bot dort sofort wieder. Danach wartet der Rückweg, bis
 * GuildJoined entschieden hat (Freigabe-Pass, Ansprechpartner), und leitet erst
 * dann in die Übersicht.
 */
export default class DashboardInviteCallback extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "GET",
            path: `${DASHBOARD_PATH}/einladen/callback`,
            description: "Nimmt den Code nach „Bot einladen“ entgegen und lässt den Bot beitreten",
            prefixed: false,
            requiresAuth: false,
            rateLimit: { max: 20, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        const service = this.client.dashboardService;

        if (!service.IsConfigured) return Unconfigured(reply);

        const query = request.query as IInviteQuery;
        const cookie = ParseCookies(request.headers.cookie)[INVITE_STATE_COOKIE];
        // Eingelöst wird nur ein state, der im Cookie dieses Browsers steht. Er gilt einmal, auch beim Abbruch.
        const nonce = NonceFromCookie(cookie, query.state);
        const state = nonce ? TakeInviteState(nonce) : null;
        const rest = WithoutNonce(cookie, nonce);
        const session = SessionOf(this.client, request);
        const now = Date.now();
        const decision = DecideInvite({ query, state, sessionUserId: session?.userId ?? null, now });

        reply
            .header("Set-Cookie", rest ? SerializeCookie(INVITE_STATE_COOKIE, rest, INVITE_COOKIE_LIFETIME, service.Secure) : ClearCookie(INVITE_STATE_COOKIE, service.Secure))
            .header("Cache-Control", "no-store");

        if (decision.kind === "cancel") return reply.redirect(DASHBOARD_HOME, 302);

        if (decision.kind === "fail") {
            if (decision.reason === "discord") logger.warn(`🎟️  Discord meldet bei der Einladung: ${String(query.error).slice(0, 60).replace(/[^\w.-]/g, "?")}`);

            return this.Fail(reply, decision.reason, state, session, now, SNOWFLAKE.test(query.guild_id ?? "") ? (query.guild_id as string) : null);
        }

        // Hier passt alles: state ist gesetzt, sonst hätte DecideInvite abgelehnt.
        const invite = state as IInviteState;

        // W-0057: Wer inzwischen für eigene Server gesperrt ist, lädt nicht ein.
        if (BannedFor(invite.userId, "own")) return reply.redirect(DASHBOARD_HOME, 302);

        // Ein frischer Freigabe-Pass direkt vor dem Tausch: Der vom Start der Einladung
        // könnte bei einer Rückkehr kurz vor 15 Minuten schon abgelaufen sein, bis
        // GuildJoined ihn prüft (Review 11).
        if (this.client.databaseService.Ready) await IssuePass(this.client, invite.guildId, invite.userId).catch((error: unknown) => logger.warn(`🎟️  Freigabe-Pass nicht erneuert: ${String(error)}`));

        const started = Date.now();
        let joined: string | null;

        try {
            joined = await service.ExchangeInvite(query.code as string);
        } catch (error) {
            if (!(error instanceof InviteExchangeFailed)) throw error;

            logger.warn(`🎟️  Einladung für ${invite.guildName} (${invite.guildId}) nicht getauscht: ${error.message}`);

            // Ohne Antwort ist offen, ob der Bot beigetreten ist. Kurz nachsehen, bevor wir „nichts passiert“ sagen.
            if (error.kind === "unreachable" && (await WaitFor(() => this.client.guilds.cache.has(invite.guildId), UNSURE_WAIT))) {
                return this.AfterJoin(reply, invite, session, now, started);
            }

            return this.Fail(reply, "discord", invite, session, now, null, error.kind === "unreachable");
        }

        // Discord sagt, welchem Server der Bot beigetreten ist. Der zählt, nicht die Adresse (Review 2).
        if (joined && joined !== invite.guildId) {
            logger.warn(`🎟️  Discord nennt nach dem Tausch Server ${joined}, erwartet war ${invite.guildId}. Der Bot geht dort wieder.`);
            await service.LeaveGuild(joined);

            return this.Fail(reply, "guild", invite, session, now, joined);
        }

        logger.info(`🎟️  Einladung getauscht: ${invite.guildName} (${invite.guildId}) durch ${invite.userName} (${invite.userId})`);

        return this.AfterJoin(reply, invite, session, now, started);
    }

    /** Wartet auf GuildJoined. Bleibt der Bot, geht es in die Übersicht; geht er, kommt der Grund. */
    private async AfterJoin(reply: FastifyReply, invite: IInviteState, session: IDashboardSession | null, now: number, since: number): Promise<unknown> {
        const result = await JoinOutcome(invite.guildId, since, JOIN_WAIT);

        if (result !== null && result !== "ok") return this.Fail(reply, "refused", invite, session, now, null, false, result);

        // Kein Ergebnis in 8 Sekunden: Ist der Bot da, in die Übersicht, sonst zur Liste (dort kommt er per Puls dazu).
        const present = result === "ok" || this.client.guilds.cache.has(invite.guildId);

        return reply.redirect(present ? `${DASHBOARD_PATH}/guild/${invite.guildId}/uebersicht` : DASHBOARD_HOME, 302);
    }

    private async Fail(
        reply: FastifyReply,
        reason: InviteFailReason,
        state: IInviteState | null,
        session: IDashboardSession | null,
        now: number,
        chosenId: string | null,
        unsure = false,
        refused?: RefuseReason
    ): Promise<unknown> {
        logger.warn(`🎟️  Einladung nicht abgeschlossen (${reason}): Server ${state?.guildId ?? chosenId ?? "?"}, Person ${session?.userId ?? "-"}`);

        const chosen = chosenId && session ? await this.client.dashboardService.CardFor(session, chosenId).catch(() => null) : null;
        const { page, values } = InviteFailPage({
            reason,
            state,
            now,
            session: session ? { name: session.username, avatar: AvatarURL(session.userId, session.avatar) } : null,
            chosen: chosen ? { id: chosen.id, name: chosen.name, icon: chosen.icon } : null,
            unsure,
            refused,
            siteURL: this.client.config.SITE_PUBLIC_URL.replace(/\/+$/, ""),
        });

        reply.code(400);

        return SendPage(this.client, reply, page, values);
    }
}
