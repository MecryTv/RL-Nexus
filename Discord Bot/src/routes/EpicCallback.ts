import { timingSafeEqual } from "node:crypto";
import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";
import { ClearCookie, ParseCookies, STATE_LIFETIME } from "../constants/Dashboard";
import { LINK_COOLDOWN_DEV } from "../constants/Database";
import { ModuleValue } from "../utils/moduleFlags";
import { EpicDonePage, EpicFailPage, IEpicWho } from "../builder/EpicPage";
import { ClosedText, RankOpen } from "../utils/moduleFlags";
import { EpicAdopt } from "../utils/epic";
import { EPIC_PATH, EpicExchange, EpicLinkToken, EpicLinkURL, EpicLoginReady } from "../utils/epicLogin";
import { SendPage } from "../utils/dashboard";
import logger from "../utils/logger";
import { EPIC_STATE_COOKIE, EpicWho } from "./EpicLink";

function Match(expected: string, received: unknown): boolean {
    if (!expected || typeof received !== "string" || !received) return false;

    const a = Buffer.from(expected);
    const b = Buffer.from(received);

    return a.length === b.length && timingSafeEqual(a, b);
}

/** MariaDB: der eindeutige Schlüssel (platform, account_id) hat zugeschlagen. */
function Duplicate(error: unknown): boolean {
    return (error as { code?: unknown })?.code === "ER_DUP_ENTRY";
}

/**
 * W-0125: Rückweg von Epic. Tauscht den Code gegen die Konto-ID und verknüpft
 * sie mit der Discord-ID aus dem Link-Token im state-Cookie.
 *
 * Ein Epic-Konto gehört genau einem Discord-Konto. Hat es schon ein anderes,
 * lehnt der Bot ab, statt es umzuhängen: das andere Konto trennt es zuerst mit
 * /rank unlink. Die Datenbank sichert dasselbe mit einem eindeutigen Schlüssel ab
 * (Migration 057), falls zwei Anmeldungen gleichzeitig ankommen.
 */
export default class EpicCallback extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "GET",
            path: `${EPIC_PATH}/callback`,
            description: "Nimmt den Code von Epic entgegen und verknüpft das Epic-Konto (W-0125)",
            prefixed: false,
            requiresAuth: false,
            rateLimit: { max: 20, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        const query = request.query as { code?: unknown; state?: unknown; error?: unknown };
        const cookie = ParseCookies(request.headers.cookie)[EPIC_STATE_COOKIE] ?? "";
        const separator = cookie.indexOf("|");
        const nonce = separator < 0 ? "" : cookie.slice(0, separator);
        // Wer kurz vor Ablauf des Knopfs zu Epic ging, hat für den Rückweg die Frist des Cookies.
        const token = separator < 0 ? null : EpicLinkToken(this.client, cookie.slice(separator + 1), STATE_LIFETIME);
        const page = (code: number, values: Record<string, string>): Promise<unknown> => {
            reply.header("Set-Cookie", ClearCookie(EPIC_STATE_COOKIE, this.client.dashboardService.Secure)).code(code);

            return SendPage(this.client, reply, "epic.html", values);
        };

        if (!EpicLoginReady(this.client)) {
            return page(503, EpicFailPage("Nicht eingerichtet", "Das Verbinden über Epic Games ist auf diesem Bot noch nicht eingerichtet.", "Ränge ansehen geht trotzdem: /rank search mit einem Epic-Namen."));
        }

        // W-0131: RL Tracking im Admin Dashboard abgeschaltet - nichts verbinden.
        if (!RankOpen(token?.place ?? null, token?.userId)) return page(503, EpicFailPage("Gerade abgeschaltet", ClosedText("rl-tracking"), "Versuch es später noch einmal mit /rank link."));

        const who: IEpicWho | null = token ? await EpicWho(this.client, token.userId) : null;
        const place = token?.place ?? null;
        // Jede Absage führt mit „Zurück zu Discord“ in den Kanal, in dem /rank link lief.
        const fail = (title: string, text: string, why: string): Record<string, string> => EpicFailPage(title, text, why, who, place);

        // Bei Epic abgebrochen oder abgelehnt.
        if (query.error !== undefined) {
            return page(403, fail("Anmeldung abgebrochen", "Die Anmeldung bei Epic Games wurde abgebrochen. Es ist nichts verbunden.", "Mit /rank link in Discord kannst du es noch einmal versuchen."));
        }

        if (!token || typeof query.code !== "string" || !query.code || !Match(nonce, query.state)) {
            return page(400, fail("Rückweg nicht mehr gültig", "Der Rückweg von Epic passt nicht zu diesem Browser oder ist abgelaufen. Es ist nichts verbunden.", "Gib in Discord noch einmal /rank link ein und öffne den Knopf im selben Browser."));
        }

        if (!this.client.databaseService.Ready) {
            return page(503, fail("Gerade nicht möglich", "Die Datenbank ist gerade nicht erreichbar. Es ist nichts verbunden.", "Versuch es in ein paar Minuten noch einmal mit /rank link."));
        }

        let epic;

        try {
            epic = await EpicExchange(this.client, query.code);
        } catch (error) {
            logger.warn(`🎮 Epic-Login: ${String(error)}`);

            return page(502, fail("Epic antwortet nicht", "Epic Games hat die Anmeldung nicht bestätigt. Es ist nichts verbunden.", "Versuch es gleich noch einmal mit /rank link. Klappt es dann immer noch nicht, sag dem Team des Servers Bescheid."));
        }

        const userId = token.userId;
        const owner = await this.client.accounts.OwnerRow("epic", epic.accountId);

        // W-0131: Hing das Konto nur per Name an jemand anderem, gehört es jetzt dem, der sich angemeldet hat.
        if (owner && owner.userId !== userId && !owner.verified) {
            logger.warn(`🎮 Epic-Login übernimmt ${epic.accountId}: per Name bei ${owner.userId}, jetzt per Login bei ${userId}`);
            await this.client.accounts.Unlink(owner.userId, "epic");
            await this.client.ranks.Clear(owner.userId);
            void this.client.rankRoleService.Strip(owner.userId).catch(() => 0);
        } else if (owner && owner.userId !== userId) {
            logger.warn(`🎮 Epic-Login abgelehnt: ${epic.accountId} gehört schon einem anderen Discord-Konto (Anfrage von ${userId})`);

            return page(
                409,
                fail(
                    "Schon verbunden",
                    "Dieses Epic-Konto ist schon mit einem anderen Discord-Konto verbunden. Ein Epic-Konto gehört genau einem Discord-Konto.",
                    "Ist das andere Discord-Konto auch deins, trenn das Epic-Konto dort zuerst mit /rank unlink."
                )
            );
        }

        // W-0133: Sperrfrist und Korrektur-Fenster aus dem Admin (für alle).
        const windowMs = this.client.developerMode ? LINK_COOLDOWN_DEV : ModuleValue("rl-tracking", "switchDays", null) * 86_400_000;
        const fixMs = ModuleValue("rl-tracking", "fixMinutes", null) * 60_000;
        const current = await this.client.accounts.On(userId, "epic");
        const cooldown = await this.client.accounts.Cooldown(userId, "epic", windowMs, fixMs);
        const swapped = !!current && current.account_id !== epic.accountId;

        // In der Zeit seit dem Knopf kann woanders gewechselt worden sein. Dasselbe Konto neu bestätigen geht immer.
        if (swapped && !cooldown.open) {
            return page(
                409,
                fail("Wechsel noch gesperrt", `Mit deinem Discord-Konto ist schon ${current.display_name ?? "ein Epic-Konto"} verbunden. Wechseln geht nur alle paar Tage.`, "Wann es wieder geht, sagt dir /rank link in Discord.")
            );
        }

        // Korrektur im Fenster nach dem Verbinden: das falsche Konto weicht, die Frist zählt weiter ab dem ersten Verbinden.
        const keepChangedAt = swapped && cooldown.fixUntil !== null ? new Date(current.changed_at) : undefined;

        let adopted;

        try {
            adopted = await EpicAdopt(this.client, userId, epic, keepChangedAt);
        } catch (error) {
            if (!Duplicate(error)) throw error;

            return page(409, fail("Schon verbunden", "Dieses Epic-Konto wurde gerade mit einem anderen Discord-Konto verbunden.", "Ist das andere Discord-Konto auch deins, trenn das Epic-Konto dort zuerst mit /rank unlink."));
        }

        logger.user(`🎮 Epic verknüpft (Login${keepChangedAt ? ", Korrektur" : ""}): ${userId} → ${adopted.name} (${epic.accountId})`);

        const ranks = (adopted.profile?.ranks ?? [])
            .filter((rank) => !rank.placement && rank.mmr > 0)
            // 1v1, 2v2, 3v3 kurz, Extra-Modi und Turniere mit ihrem Namen.
            .map((rank) => ({ mode: /^\dv\d$/.test(rank.key) ? rank.key : rank.label, tier: rank.tier, name: rank.tierName }));
        // Ab hier gilt, was jetzt in der Zeile steht: neu verbunden, korrigiert oder dasselbe Konto bestätigt.
        const changed = current && (!swapped || keepChangedAt) ? new Date(current.changed_at).getTime() : Date.now();
        const fixUntil = changed + fixMs > Date.now() ? changed + fixMs : null;
        // Falsches Konto erwischt: ein frischer Knopf, mit dem Epic neu nach der Anmeldung fragt.
        const swapURL = fixUntil ? `${EpicLinkURL(this.client, userId, Date.now(), true, place)}&go=1` : null;

        return page(200, EpicDonePage(who, adopted.name, ranks, changed + windowMs, swapURL, fixUntil, place));
    }
}
