import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import { BACKGROUND_HINT, DefaultCard, DefaultDoc, FONT_LABELS, LAYOUT_LABELS, MAX_AVATAR, MAX_RING, MAX_ROLES, MAX_TITLE_SIZE, MIN_AVATAR, MIN_TITLE_SIZE, WELCOME_PLACEHOLDER_KEYS } from "../constants/Welcome";
import { KIND_LABELS } from "../constants/Messages";
import { IWelcomeMessage } from "../interfaces/services/welcome/IWelcome";
import { WelcomeError, WELCOME_MODULE } from "../services/WelcomeService";
import { WantsJSON } from "../utils/admin";
import logger from "../utils/logger";
import { GuildResources, IManageAccess, ManageGate } from "../utils/managegate";

interface IBody {
    action?: unknown;
    config?: unknown;
    which?: unknown;
    message?: unknown;
    bare?: unknown;
}

/**
 * Welcome System im Dashboard: Begrüßung, Abschied, Auto-Rollen - dazu die
 * Vorschau der gezeichneten Karte. Siehe docs/Welcome.md.
 */
export default class DashboardApiWelcome extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: ["GET", "POST"],
            path: `${DASHBOARD_PATH}/api/guild/:id/welcome`,
            description: "Begrüßung, Abschied und Auto-Rollen eines Servers",
            prefixed: false,
            requiresAuth: false,
            // 120: Wer ein Teil der Welcome Card pixelweise setzt, löst je Pause eine Vorschau aus (Plan 25).
            rateLimit: { max: 120, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        const writing = request.method === "POST";

        if (writing && !WantsJSON(request)) return reply.code(415).send({ error: "Nur application/json" });

        const access = await ManageGate(this.client, request, reply, WELCOME_MODULE);

        if (!access) return reply;

        reply.header("Cache-Control", "no-store");

        try {
            if (!writing) return reply.send(await this.Read(access));

            return reply.send(await this.Write(access, (request.body ?? {}) as IBody));
        } catch (error) {
            if (error instanceof WelcomeError) return reply.code(400).send({ error: error.message });

            throw error;
        }
    }

    private async Read(access: IManageAccess) {
        const { guild } = access;

        return {
            config: await this.client.welcomeService.Settings(guild.id),
            defaults: { join: { doc: DefaultDoc("join"), card: DefaultCard("join") }, leave: { doc: DefaultDoc("leave"), card: DefaultCard("leave") } },
            placeholders: WELCOME_PLACEHOLDER_KEYS,
            kinds: { card: "Welcome Card (Bild)", ...KIND_LABELS },
            limits: { roles: MAX_ROLES, titleMin: MIN_TITLE_SIZE, titleMax: MAX_TITLE_SIZE, avatarMin: MIN_AVATAR, avatarMax: MAX_AVATAR, ringMax: MAX_RING },
            layouts: LAYOUT_LABELS,
            fonts: FONT_LABELS,
            background: BACKGROUND_HINT,
            // Ohne das Members-Intent sieht der Bot niemanden kommen.
            ready: { members: this.client.config.GUILD_MEMBER_INTENT },
            guild: { name: guild.name, icon: guild.iconURL({ extension: "png", size: 128 }), ...GuildResources(guild) },
        };
    }

    private async Write(access: IManageAccess, body: IBody): Promise<unknown> {
        const { guild, member, actor } = access;
        const service = this.client.welcomeService;
        const which = body.which === "leave" ? "leave" : "join";

        switch (body.action) {
            case "save": {
                const config = await service.Save(guild, body.config);

                logger.user(`👋 Welcome-Einstellungen auf ${guild.id} gespeichert (von ${actor.id})`);

                return { ok: true, config };
            }

            case "test":
                await service.Test(guild, member, which);

                return { ok: true };

            case "preview": {
                // Die Karte aus dem Entwurf - gezeichnet mit den Daten dessen, der zuschaut.
                const current = await service.Settings(guild.id);
                // on: false - gezeichnet wird auch ohne Kanal; was nur beim Speichern zählt, prüft "save".
                const draft = typeof body.message === "object" && body.message !== null ? body.message : {};
                const message: IWelcomeMessage = service.CleanMessage(guild, { ...draft, on: false }, current[which], which);
                // bare: ohne die fünf Teile, dazu Zeilen und Plätze - für die Bühne (Plan 25).
                return { ok: true, ...(await service.Preview(member, message, which, body.bare === true)) };
            }

            default:
                throw new WelcomeError("Unbekannte Aktion.");
        }
    }
}
