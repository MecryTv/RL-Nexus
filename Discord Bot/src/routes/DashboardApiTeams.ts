import path from "path";
import { PermissionFlagsBits } from "discord.js";
import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import { KIND_LABELS as BODY_KINDS } from "../constants/Messages";
import {
    DefaultBoardBody,
    DefaultTeamBody,
    FORMULA_HINTS,
    FORMULA_KEYS,
    FORMULA_PRESETS,
    LAYOUT_LABELS,
    MAX_DESCRIPTION,
    MAX_FORMULA,
    MAX_GROUPS,
    MAX_LINK_LABEL,
    MAX_LINKS,
    MAX_MENU_TEAMS,
    MAX_NAME,
    MAX_PLAYERS,
    MAX_TAG,
    MAX_TEAMS,
    MMR_LABELS,
    PLAIN_FORMATS,
    PLAYLISTS,
    RANK_STYLES,
    ROLE_LABELS,
    ROLE_ORDER,
    TEAMS_MODULE,
} from "../constants/Teams";
import { TeamError } from "../services/TeamService";
import { Formats, ListTeams, PlayerList, RoleValues } from "../builder/TeamView";
import { MAX_LIST_MEMBER, MAX_LIST_TEAM } from "../constants/TeamList";
import { GALLERY_ROOT } from "../constants/Gallery";
import { ROLE_ICON_FILES, ROLE_ICON_ROOT } from "../services/RankIconService";
import { TIERS } from "../constants/Prime";
import { WantsJSON } from "../utils/admin";
import { PersonOf, SearchMembers } from "../utils/dashboard";
import logger from "../utils/logger";
import { GuildResources, IManageAccess, ManageGate } from "../utils/managegate";

interface IBody {
    action?: unknown;
    id?: unknown;
    userId?: unknown;
    team?: unknown;
    group?: unknown;
    settings?: unknown;
    query?: unknown;
    formula?: unknown;
    setup?: unknown;
    cleanup?: unknown;
}

/**
 * RL Team-Übersicht im Dashboard: Gruppen und Teams pflegen, die Rechnung
 * einstellen und die Übersicht in den Kanal schicken. Siehe docs/Teams.md.
 */
export default class DashboardApiTeams extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: ["GET", "POST"],
            path: `${DASHBOARD_PATH}/api/guild/:id/teams`,
            description: "Teams, Gruppen und die Übersicht eines Servers",
            prefixed: false,
            requiresAuth: false,
            rateLimit: { max: 60, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        const writing = request.method === "POST";

        if (writing && !WantsJSON(request)) return reply.code(415).send({ error: "Nur application/json" });

        const access = await ManageGate(this.client, request, reply, TEAMS_MODULE);

        if (!access) return reply;

        reply.header("Cache-Control", "no-store");

        try {
            if (!writing) return reply.send(await this.Read(access));

            return reply.send(await this.Write(access, (request.body ?? {}) as IBody));
        } catch (error) {
            if (error instanceof TeamError) return reply.code(400).send({ error: error.message });

            throw error;
        }
    }

    private async Read(access: IManageAccess) {
        const { guild } = access;
        const { views, groups, settings } = await this.client.teamService.Views(guild);
        const me = guild.members.me;
        // Ränge und Aufgaben hier ausgeschrieben, die Aufgaben auch in {…role.icon} - wie sie in der
        // Vorschau stehen, setzt die Seite nach den Einstellungen und Abzeichen, auch ungespeichert
        // (rankIcons, roleIcons, settings.badges). Nur .rank.icon kommt gleich als Icon.
        const preview = { ...Formats(this.client, { rankStyle: "text", roleStyle: "text", badges: {} }), roleIcon: PLAIN_FORMATS.roleIcon };
        const icons = this.client.rankIconService;

        return {
            settings,
            groups,
            teams: views.map((view) => ({
                ...view.team,
                mmr: view.mmr,
                fetchedAt: view.fetchedAt,
                // Der gerechnete Wert je Spieler - die Seite rechnet nichts selbst.
                values: Object.fromEntries(view.players.map((entry) => [entry.player.id, entry.value])),
                snapshots: Object.fromEntries(view.players.map((entry) => [entry.player.id, entry.player.snapshot ?? null])),
            })),
            prime: this.client.primeService.IsConfigured,
            // Die Platzhalter je Spieler ({epicname.rank} …) samt dem, was eingesetzt würde - für Vorschlag und Vorschau.
            players: PlayerList(views, settings, preview),
            // Die Icons des Bots, Ränge und Aufgaben - damit die Vorschau sie zeigt.
            icons: icons.List,
            // Die Platzhalter je Aufgabe ({team.captain.rank} …) am ersten Team - als Beispiel für die Vorschau der Team-Karte.
            roleSamples: views[0] ? RoleValues(views[0], settings, true, preview) : {},
            // Alle Teams so, wie {teams} sie aufschreibt - die Vorschau im Reiter „Teams-Liste“ baut daraus
            // dieselbe Liste wie der Bot (constants/TeamList.ts), mit dem ungespeicherten Entwurf.
            listTeams: ListTeams(views, settings, preview, true),
            // Je Rang sein Icon, etwa "Grand Champion I" → "<:rl_gc1:…>". Fehlt eins, bleibt dort der Text.
            rankIcons: Object.fromEntries(TIERS.flatMap((name, tier) => {
                const icon = icons.Of(tier);

                return icon ? [[name, icon]] : [];
            })),
            // Je Aufgabe ihr Abzeichen, etwa "Captain" → "<:rl_role_captain:…>" - ebenso.
            roleIcons: Object.fromEntries(ROLE_ORDER.flatMap((role) => {
                const icon = icons.OfRole(role);

                return icon ? [[ROLE_LABELS[role], icon]] : [];
            })),
            // Die Abzeichen je Aufgabe aus der Galerie (Vorlagen › rocketleague › teamicons) - fürs Dashboard.
            roleImages: Object.fromEntries(
                ROLE_ORDER.map((role) => {
                    const segments = [...path.relative(GALLERY_ROOT, ROLE_ICON_ROOT).split(path.sep), `${ROLE_ICON_FILES[role]}.png`];

                    return [role, `${this.client.server.BaseURL}/images/${segments.map(encodeURIComponent).join("/")}`];
                })
            ),
            rankStyles: RANK_STYLES,
            // Was dem Vergeben der Rollen im Weg steht, und was der Bot ueberhaupt anlegen darf.
            problems: this.client.teamService.RoleProblems(guild, views.map((view) => view.team), settings),
            bot: { roles: Boolean(me?.permissions.has(PermissionFlagsBits.ManageRoles)), channels: Boolean(me?.permissions.has(PermissionFlagsBits.ManageChannels)) },
            memberIntent: this.client.config.GUILD_MEMBER_INTENT,
            defaults: { board: DefaultBoardBody(), team: DefaultTeamBody() },
            layouts: LAYOUT_LABELS,
            modes: MMR_LABELS,
            roles: ROLE_LABELS,
            playlists: PLAYLISTS,
            formula: { keys: FORMULA_KEYS, hints: FORMULA_HINTS, presets: FORMULA_PRESETS },
            bodyKinds: BODY_KINDS,
            limits: { groups: MAX_GROUPS, teams: MAX_TEAMS, players: MAX_PLAYERS, name: MAX_NAME, tag: MAX_TAG, description: MAX_DESCRIPTION, formula: MAX_FORMULA, menu: MAX_MENU_TEAMS, links: MAX_LINKS, linkLabel: MAX_LINK_LABEL, listTeam: MAX_LIST_TEAM, listMember: MAX_LIST_MEMBER },
            guild: { name: guild.name, ...GuildResources(guild) },
        };
    }

    private async Write(access: IManageAccess, body: IBody): Promise<unknown> {
        const { guild, member } = access;
        const service = this.client.teamService;
        const id = Number(body.id ?? 0);

        switch (body.action) {
            case "settings":
                return { ok: true, settings: await service.SaveSettings(guild, body.settings) };

            case "group.create":
                return { ok: true, group: await service.CreateGroup(guild.id, body.group) };

            case "group.save":
                return { ok: true, group: await service.SaveGroup(guild.id, id, body.group) };

            case "group.delete":
                await service.RemoveGroup(guild.id, id);

                return { ok: true };

            case "team.create":
                return { ok: true, team: await service.CreateTeam(guild, body.team) };

            case "team.save":
                return { ok: true, team: await service.SaveTeam(guild, id, body.team) };

            case "team.delete": {
                const cleanup = typeof body.cleanup === "object" && body.cleanup !== null ? (body.cleanup as Record<string, unknown>) : {};

                await service.RemoveTeam(guild, id, { role: cleanup.role === true, channels: cleanup.channels === true });

                return { ok: true };
            }

            // Rolle und Kanaele in Discord anlegen. Ein ungespeicherter Stand
            // kommt mit - sonst hiesse die neue Rolle noch wie vor dem Umbenennen.
            case "team.setup": {
                if (body.team !== undefined) await service.SaveTeam(guild, id, body.team);

                const result = await service.SetupTeam(guild, id, body.setup);

                logger.user(`🛡️ Team ${id} auf ${guild.id} eingerichtet (von ${member.id})`);

                return { ok: true, ...result };
            }

            // „Rechte angleichen“: nur Kanäle, die der Bot für das Team angelegt hat.
            case "team.permissions": {
                const result = await service.AlignRights(guild, id);

                logger.user(`🛡️ Team ${id} auf ${guild.id}: Rechte angeglichen (von ${member.id})`);

                return { ok: true, ...result };
            }

            case "roles.sync":
                return { ok: true, members: await service.SyncRoles(guild) };

            case "publish": {
                const result = await service.Publish(guild);

                logger.user(`🛡️ Team-Übersicht auf ${guild.id} gesendet (${result.layout}, von ${member.id})`);

                return { ok: true, ...result };
            }

            case "recall":
                await service.Recall(guild);

                return { ok: true };

            case "sync": {
                await service.Sync(await service.Teams(guild.id), true);

                return { ok: true };
            }

            case "members": {
                const query = typeof body.query === "string" ? body.query.trim().slice(0, 100) : "";

                return { members: (await SearchMembers(guild, query)).map(PersonOf) };
            }

            // Das verknuepfte Epic-Konto eines Mitglieds - damit der Kader den
            // Namen nicht von Hand braucht.
            case "epic": {
                const userId = typeof body.userId === "string" ? body.userId : "";

                if (!/^\d{17,20}$/.test(userId)) throw new TeamError("Das ist keine Mitglieds-ID.");
                if (!this.client.databaseService.Ready) return { epicName: null };

                const account = await this.client.accounts.On(userId, "epic");

                return { epicName: account?.display_name ?? null };
            }

            default:
                throw new TeamError("Unbekannte Aktion.");
        }
    }
}
