import { randomBytes } from "node:crypto";
import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";
import { COOKIE_PREFIX, SerializeCookie, STATE_LIFETIME } from "../constants/Dashboard";
import { EpicConfirmPage, EpicFailPage, IEpicWho } from "../builder/EpicPage";
import { EPIC_LINK_MINUTES, EPIC_PATH, EpicAuthorizeURL, EpicLinkToken, EpicLoginReady } from "../utils/epicLogin";
import { SendPage } from "../utils/dashboard";

/** W-0125: Nonce und Link-Token zwischen dem Weg zu Epic und dem Rückweg. */
export const EPIC_STATE_COOKIE = `${COOKIE_PREFIX}rlnexus_epic_state`;

/** Name und Profilbild zur Discord-ID, für die Seiten. Ohne Discord bleibt es beim neutralen Text. */
export async function EpicWho(client: BotClient, userId: string): Promise<IEpicWho> {
    const user = await client.users.fetch(userId).catch(() => null);

    return { name: user ? user.globalName?.trim() || user.username : "Dein Discord-Konto", avatar: user?.displayAvatarURL({ extension: "png", size: 64 }) ?? null };
}

/**
 * W-0125: der Knopf aus /rank link landet hier.
 *
 *   GET /link/epic?t=…        Seite: welches Discord-Konto das Epic-Konto bekommt
 *   GET /link/epic?t=…&go=1   state-Cookie setzen, weiter zur Anmeldung bei Epic
 *
 * Erst die Seite, dann Epic: Schickt jemand seinen Knopf an einen anderen Spieler,
 * sieht der vor der Anmeldung, dass sein Epic-Konto an ein fremdes Discord-Konto ginge.
 */
export default class EpicLink extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "GET",
            path: EPIC_PATH,
            description: "Epic-Konto verbinden: Bestätigung und Weg zu Epic (W-0125)",
            prefixed: false,
            requiresAuth: false,
            rateLimit: { max: 30, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        if (!EpicLoginReady(this.client)) {
            reply.code(503);

            return SendPage(this.client, reply, "epic.html", EpicFailPage("Nicht eingerichtet", "Das Verbinden über Epic Games ist auf diesem Bot noch nicht eingerichtet.", "Ränge ansehen geht trotzdem: /rank search mit einem Epic-Namen."));
        }

        const query = request.query as { t?: unknown; go?: unknown };
        const sealed = typeof query.t === "string" ? query.t : "";
        const token = EpicLinkToken(this.client, sealed);

        if (!token) {
            reply.code(410);

            return SendPage(
                this.client,
                reply,
                "epic.html",
                EpicFailPage("Link abgelaufen", `Der Knopf aus /rank link gilt ${EPIC_LINK_MINUTES} Minuten und ist nicht mehr gültig.`, "Gib in Discord noch einmal /rank link ein, dann bekommst du einen neuen Knopf.")
            );
        }

        if (query.go === "1") {
            const nonce = randomBytes(24).toString("base64url");
            const secure = this.client.dashboardService.Secure;

            return reply.header("Set-Cookie", SerializeCookie(EPIC_STATE_COOKIE, `${nonce}|${sealed}`, STATE_LIFETIME, secure)).redirect(EpicAuthorizeURL(this.client, nonce, token.swap), 302);
        }

        const go = `${EPIC_PATH}?t=${encodeURIComponent(sealed)}&go=1`;
        const site = this.client.config.SITE_PUBLIC_URL.replace(/\/+$/, "");

        return SendPage(this.client, reply, "epic.html", EpicConfirmPage(await EpicWho(this.client, token.userId), go, token.expiresAt, site));
    }
}
