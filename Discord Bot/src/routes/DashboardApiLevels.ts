import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import { DefaultLevelMessage, LEVEL_PLACEHOLDER_KEYS, LevelProgress, MAX_BONUS, MAX_EXCLUDED, MAX_REWARDS, MAX_UP_LINE, UpMode } from "../constants/Levels";
import { BOARD_ENTRY_PLACEHOLDERS, BOARD_FRAME_PLACEHOLDERS, BOARD_PLACEHOLDERS, BOARD_TEMPLATES, CARD_TEMPLATES, DESIGN_FONTS, DESIGN_PLACEHOLDERS, DESIGN_SIZE, DefaultBoardStyle, MAX_ELEMENTS, UP_TEMPLATES } from "../constants/LevelDesign";
import { DesignKind } from "../interfaces/services/levels/ILevelDesign";
import { ILevelRank } from "../interfaces/services/levels/ILevels";
import { LevelError, LEVELS_MODULE } from "../services/LevelService";
import { IsPeriod } from "../services/levels/BoardMessage";
import { WantsJSON } from "../utils/admin";
import { PersonOf, SearchMembers } from "../utils/dashboard";
import logger from "../utils/logger";
import { GuildResources, IManageAccess, ManageGate } from "../utils/managegate";

interface IBody {
    action?: unknown;
    settings?: unknown;
    userId?: unknown;
    amount?: unknown;
    mode?: unknown;
    query?: unknown;
    period?: unknown;
    page?: unknown;
    kind?: unknown;
    design?: unknown;
    upLine?: unknown;
    style?: unknown;
    reason?: unknown;
}

/** Plan 35: die Vorlagen als fertige Designs fürs Dashboard. */
function Templates<T extends string>(makers: Record<T, () => unknown>): Record<T, unknown> {
    return Object.fromEntries(Object.entries(makers).map(([name, make]) => [name, (make as () => unknown)()])) as Record<T, unknown>;
}

/** Plan 38: "board" ist das Ranglisten-Bild im Baukasten. */
function Kind(value: unknown): DesignKind | "board" {
    if (value === "card" || value === "up" || value === "board") return value;

    throw new LevelError("Unbekannte Art.");
}

/**
 * Level System im Dashboard: Einstellungen, Rangliste und die Punkte einzelner
 * Mitglieder. Siehe docs/Levels.md.
 */
export default class DashboardApiLevels extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: ["GET", "POST"],
            path: `${DASHBOARD_PATH}/api/guild/:id/levels`,
            description: "Level System eines Servers",
            prefixed: false,
            requiresAuth: false,
            // Plan 35: Der Designer fragt nach jeder Änderung eine neue Vorschau an.
            rateLimit: { max: 120, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        const writing = request.method === "POST";

        if (writing && !WantsJSON(request)) return reply.code(415).send({ error: "Nur application/json" });

        const access = await ManageGate(this.client, request, reply, LEVELS_MODULE);

        if (!access) return reply;

        reply.header("Cache-Control", "no-store");

        try {
            if (!writing) return reply.send(await this.Read(access, request.query as { page?: string }));

            return reply.send(await this.Write(access, (request.body ?? {}) as IBody));
        } catch (error) {
            if (error instanceof LevelError) return reply.code(400).send({ error: error.message });

            throw error;
        }
    }

    /** Ein Platz der Rangliste mit Namen und Bild. */
    private Out(entry: ILevelRank, access: IManageAccess, base: number) {
        const member = access.guild.members.cache.get(entry.userId);
        const progress = LevelProgress(entry.xp, base);

        return {
            id: entry.userId,
            name: member?.displayName ?? entry.userId,
            avatar: member?.displayAvatarURL({ extension: "webp", size: 64 }) ?? null,
            gone: !member,
            rank: entry.rank,
            level: progress.level,
            xp: entry.xp,
            into: progress.into,
            need: progress.need,
            messages: entry.messages,
            voiceMinutes: entry.voiceMinutes,
        };
    }

    private async Read(access: IManageAccess, query: { page?: string }) {
        const { guild } = access;
        const settings = await this.client.levelService.Settings(guild.id);
        const page = Math.max(1, Math.min(50, Number(query.page) || 1));
        const top = await this.client.levels.Top(guild.id, 25, (page - 1) * 25);

        return {
            settings,
            defaultMessage: DefaultLevelMessage(),
            placeholders: LEVEL_PLACEHOLDER_KEYS,
            limits: { rewards: MAX_REWARDS, bonus: MAX_BONUS, excluded: MAX_EXCLUDED, elements: MAX_ELEMENTS, upLine: MAX_UP_LINE },
            // Plan 35: der Designer.
            upMode: UpMode(settings),
            designs: { card: settings.cardDesign ?? null, up: settings.upDesign ?? null, board: settings.boardStyle ?? DefaultBoardStyle(), boardDesign: settings.boardDesign ?? null },
            // Plan 38: die Vorlagen der Rangliste im bisherigen Stil des Servers.
            templates: { card: Templates(CARD_TEMPLATES), up: Templates(UP_TEMPLATES), board: Object.fromEntries(Object.entries(BOARD_TEMPLATES).map(([name, make]) => [name, make(settings.boardStyle ?? DefaultBoardStyle())])) },
            boardFramePlaceholders: BOARD_FRAME_PLACEHOLDERS,
            boardEntryPlaceholders: BOARD_ENTRY_PLACEHOLDERS,
            designPlaceholders: DESIGN_PLACEHOLDERS,
            boardPlaceholders: BOARD_PLACEHOLDERS,
            designSize: DESIGN_SIZE,
            fonts: DESIGN_FONTS,
            page,
            total: await this.client.levels.Total(guild.id),
            top: top.map((entry) => this.Out(entry, access, settings.base)),
            backfill: await this.client.levelBackfill.Of(guild.id),
            // Plan 37: was beim letzten Post der Aktivsten passiert ist.
            topStatus: { week: await this.client.levelTop.Of(guild.id, "week"), month: await this.client.levelTop.Of(guild.id, "month") },
            guild: { name: guild.name, ...GuildResources(guild) },
        };
    }

    private async Write(access: IManageAccess, body: IBody): Promise<unknown> {
        const { guild, member } = access;
        const service = this.client.levelService;
        const userId = typeof body.userId === "string" ? body.userId : "";

        switch (body.action) {
            case "save": {
                const settings = await service.Save(guild, body.settings);

                logger.user(`📈 Level-Einstellungen auf ${guild.id} gespeichert (von ${member.id})`);

                return { ok: true, settings };
            }

            case "members": {
                const query = typeof body.query === "string" ? body.query.trim().slice(0, 100) : "";

                return { members: (await SearchMembers(guild, query)).map(PersonOf) };
            }

            case "adjust": {
                if (!/^\d{17,20}$/.test(userId)) throw new LevelError("Wähle zuerst ein Mitglied.");

                const mode = body.mode === "add" || body.mode === "reset" ? body.mode : "set";
                const amount = Math.round(Number(body.amount));

                if (mode !== "reset" && !Number.isFinite(amount)) throw new LevelError("Gib eine Zahl an.");

                const entry = await service.Adjust(guild, userId, mode, amount, member.id, typeof body.reason === "string" ? body.reason : "");

                logger.user(`📈 Punkte von ${userId} auf ${guild.id} geändert (${mode}, von ${member.id})`);

                return { ok: true, entry };
            }

            // Plan 37: das Protokoll der Punkte von Hand.
            case "log":
                return { entries: await service.Log(guild) };

            // Plan 34: eine Seite der Rangliste in einem Zeitraum, mit Trend.
            case "board":
                return service.Board(guild, IsPeriod(body.period) ? body.period : "all", Number(body.page) || 1, null, 25);

            case "sync":
                return { ok: true, touched: await service.Sync(guild) };

            // Plan 35: der Designer.
            case "design.preview": {
                const kind = Kind(body.kind);

                return kind === "board" ? service.BoardDesignPreview(member, body.design) : service.DesignPreview(member, kind, body.design);
            }

            case "design.save": {
                const kind = Kind(body.kind);

                // null heißt ausdrücklich „zurück zur Vorgabe“ - fehlt das Design, ist das ein Fehler, kein Zurücksetzen.
                if (body.design === undefined) throw new LevelError("Kein Design mitgeschickt.");

                if (kind === "board") {
                    const board = await service.SaveBoardDesign(guild, body.design);

                    logger.user(`📈 Ranglisten-Bild auf ${guild.id} ${board.design ? "gespeichert" : "zurückgesetzt"} (von ${member.id})`);

                    return { ok: true, ...board };
                }

                const saved = await service.SaveDesign(guild, kind, body.design, body.upLine);

                logger.user(`📈 ${kind === "card" ? "Level-Karte" : "Aufstiegs-Bild"} auf ${guild.id} ${saved.design ? "gespeichert" : "zurückgesetzt"} (von ${member.id})`);

                return { ok: true, ...saved };
            }

            // Plan 36: die Vorlagen als kleine Bilder fürs Studio.
            case "design.thumbs": {
                const kind = Kind(body.kind);

                return { thumbs: kind === "board" ? await service.BoardThumbs(member) : await service.DesignThumbs(member, kind) };
            }

            case "design.test": {
                const kind = Kind(body.kind);

                if (kind === "board") await service.TestBoard(member);
                else await service.TestDesign(member, kind);

                return { ok: true };
            }

            case "board.preview":
                return { image: await service.BoardPreview(guild, member.id, body.style) };

            case "board.save": {
                const style = await service.SaveBoardStyle(guild, body.style);

                logger.user(`📈 Ranglisten-Stil auf ${guild.id} gespeichert (von ${member.id})`);

                return { ok: true, style };
            }

            case "reset":
                await service.Reset(guild);

                return { ok: true };

            default:
                throw new LevelError("Unbekannte Aktion.");
        }
    }
}
