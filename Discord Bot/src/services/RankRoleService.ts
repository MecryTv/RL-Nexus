import { Guild, GuildMember, PermissionFlagsBits } from "discord.js";
import BotClient from "../client/BotClient";
import { DefaultRankRoleSettings, EmptyPlaylist, PLAYLISTS, RANK_ROLES_MODULE, StepOf, Steps } from "../constants/RankRoles";
import { IPrimeProfile } from "../interfaces/services/prime/IPrimeService";
import { IRankRoleChange, IRankRoleResult, IRankRoleSettings, Playlist } from "../interfaces/services/rankroles/IRankRoles";
import logger from "../utils/logger";

export class RankRoleError extends Error {}

function IsRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Rank Roles: Rollen nach Rocket-League-Rang, je Playlist eine eigene.
 *
 * Der Bot fragt nichts von selbst - er tut etwas, wenn jemand den Befehl
 * eingibt. Der Epic-Name kommt aus dem verknüpften Konto, die Ränge aus Prime.
 * Siehe docs/RankRoles.md.
 */
export default class RankRoleService {
    private readonly client: BotClient;

    constructor(client: BotClient) {
        this.client = client;
    }

    /* ----------------------------------------------------------
       Einstellungen
       ---------------------------------------------------------- */
    Settings(guildId: string): Promise<IRankRoleSettings> {
        return this.client.moduleSettings.Of<IRankRoleSettings>(guildId, RANK_ROLES_MODULE, DefaultRankRoleSettings());
    }

    CleanSettings(guild: Guild, input: unknown, previous: IRankRoleSettings): IRankRoleSettings {
        const raw = IsRecord(input) ? input : {};
        const steps = new Set(Steps().map((step) => step.key));
        const given = IsRecord(raw.playlists) ? raw.playlists : {};
        const playlists = {} as IRankRoleSettings["playlists"];

        for (const playlist of PLAYLISTS) {
            const before = previous.playlists[playlist] ?? EmptyPlaylist();
            const entry = IsRecord(given[playlist]) ? (given[playlist] as Record<string, unknown>) : null;

            if (!entry) {
                playlists[playlist] = before;

                continue;
            }

            const roles: Record<string, string | null> = {};
            const wanted = IsRecord(entry.roles) ? entry.roles : {};

            // Nur bekannte Stufen, und nur Rollen, die es auf dem Server gibt -
            // @everyone ist keine.
            for (const [key, value] of Object.entries(wanted)) {
                if (!steps.has(key)) continue;

                roles[key] = typeof value === "string" && guild.roles.cache.has(value) && value !== guild.id ? value : null;
            }

            playlists[playlist] = { on: typeof entry.on === "boolean" ? entry.on : before.on, roles };
        }

        return {
            playlists,
            replace: typeof raw.replace === "boolean" ? raw.replace : previous.replace,
            skipPlacement: typeof raw.skipPlacement === "boolean" ? raw.skipPlacement : previous.skipPlacement,
        };
    }

    async SaveSettings(guild: Guild, input: unknown): Promise<IRankRoleSettings> {
        const settings = this.CleanSettings(guild, input, await this.Settings(guild.id));

        await this.client.moduleSettings.Save(guild.id, RANK_ROLES_MODULE, settings);

        return settings;
    }

    /* ----------------------------------------------------------
       Rollen
       ---------------------------------------------------------- */
    /** Alle Rollen, die dieses Modul vergibt - über alle Playlists. */
    Managed(settings: IRankRoleSettings): Set<string> {
        const ids = new Set<string>();

        for (const playlist of PLAYLISTS) {
            for (const id of Object.values(settings.playlists[playlist]?.roles ?? {})) {
                if (id) ids.add(id);
            }
        }

        return ids;
    }

    /** Die Rollen einer Playlist. */
    private RolesOf(settings: IRankRoleSettings, playlist: Playlist): Set<string> {
        const ids = new Set<string>();

        for (const id of Object.values(settings.playlists[playlist]?.roles ?? {})) {
            if (id) ids.add(id);
        }

        return ids;
    }

    /** Welche Rolle zu einem Rang gehört. */
    RoleFor(settings: IRankRoleSettings, playlist: Playlist, tier: number): string | null {
        const step = StepOf(tier);

        if (!step) return null;

        return settings.playlists[playlist]?.roles[step] ?? null;
    }

    /**
     * Kann der Bot diese Rolle überhaupt vergeben? Antwortet mit dem Grund,
     * sonst null - die Antwort an den Spieler soll sagen, woran es liegt.
     */
    private Blocked(guild: Guild, roleId: string): string | null {
        const me = guild.members.me;
        const role = guild.roles.cache.get(roleId);

        if (!role) return "Diese Rolle gibt es nicht mehr.";
        if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) return "Dem Bot fehlt „Rollen verwalten“.";
        if (role.managed) return "Diese Rolle gehört einer Integration.";
        if (me.roles.highest.comparePositionTo(role) <= 0) return "Die Rolle steht über der höchsten Rolle des Bots.";

        return null;
    }

    /* ----------------------------------------------------------
       Der Befehl
       ---------------------------------------------------------- */
    /**
     * Holt die Ränge und setzt die Rollen. Wirft, wenn schon der Weg dorthin
     * nicht geht - alles andere steht als Problem im Ergebnis. Mit known: das
     * Profil, das der Aufrufer schon hat (/rank me), Prime wird nicht noch
     * einmal gefragt.
     */
    async Apply(member: GuildMember, known?: IPrimeProfile): Promise<IRankRoleResult> {
        const guild = member.guild;
        const settings = await this.Settings(guild.id);

        if (!PLAYLISTS.some((playlist) => settings.playlists[playlist]?.on)) {
            throw new RankRoleError("Für dieses Modul ist noch keine Playlist eingeschaltet.");
        }

        if (!this.client.primeService.IsConfigured) throw new RankRoleError("Das Rang-Tracking ist auf diesem Bot nicht eingerichtet.");
        if (!this.client.databaseService.Ready) throw new RankRoleError("Ohne Datenbank weiß ich nicht, welches Epic-Konto dir gehört.");

        const account = await this.client.accounts.On(member.id, "epic");
        const epicName = account?.display_name?.trim();

        if (!epicName) throw new RankRoleError("Verbinde erst dein Epic-Konto: **/rank link epicname:DeinName**.");

        const profile = known ?? (await this.client.primeService.Profile(epicName).catch(() => null));

        if (!profile) throw new RankRoleError(`Prime kennt **${epicName}** gerade nicht. Versuch es später noch einmal.`);

        const changes: IRankRoleChange[] = [];
        const add = new Set<string>();
        const remove = new Set<string>();
        const blocked = new Set<string>();

        for (const playlist of PLAYLISTS) {
            if (!settings.playlists[playlist]?.on) continue;

            const rank = profile.ranks.find((entry) => entry.key === playlist);

            if (!rank || rank.tier < 1) {
                changes.push({ playlist, tier: 0, tierName: "Unranked", mmr: 0, roleId: null, problem: "Kein Rang in dieser Playlist." });

                continue;
            }

            if (settings.skipPlacement && rank.placement) {
                changes.push({ playlist, tier: rank.tier, tierName: rank.tierName, mmr: rank.mmr, roleId: null, problem: "Die Platzierungsspiele laufen noch." });

                continue;
            }

            const roleId = this.RoleFor(settings, playlist, rank.tier);

            if (!roleId) {
                changes.push({ playlist, tier: rank.tier, tierName: rank.tierName, mmr: rank.mmr, roleId: null, problem: "Für diese Stufe ist keine Rolle hinterlegt." });

                continue;
            }

            const problem = this.Blocked(guild, roleId);

            if (problem) {
                blocked.add(roleId);
                changes.push({ playlist, tier: rank.tier, tierName: rank.tierName, mmr: rank.mmr, roleId, problem });

                continue;
            }

            // Die alte Rolle derselben Playlist geht ab, die neue kommt dazu.
            if (settings.replace) {
                for (const id of this.RolesOf(settings, playlist)) {
                    if (id !== roleId && member.roles.cache.has(id) && !this.Blocked(guild, id)) remove.add(id);
                }
            }

            if (!member.roles.cache.has(roleId)) add.add(roleId);

            changes.push({ playlist, tier: rank.tier, tierName: rank.tierName, mmr: rank.mmr, roleId, problem: null });
        }

        // Eine Rolle, die zu zwei Playlists gehört, darf nicht zugleich kommen und gehen.
        for (const id of add) remove.delete(id);

        if (remove.size) await member.roles.remove([...remove], "Rank Roles: alter Rang").catch(() => undefined);
        if (add.size) await member.roles.add([...add], "Rank Roles").catch(() => undefined);

        if (add.size || remove.size) {
            logger.user(`🎖️  Rank Roles auf ${guild.id}: ${member.id} +${add.size} -${remove.size} (${epicName})`);
        }

        return { epicName: profile.name, added: [...add], removed: [...remove], changes, blocked: [...blocked] };
    }

    /**
     * Nach /rank me: die Rang-Rollen zum eben geholten Profil - der einzige Weg,
     * über den Mitglieder sie bekommen. Still - null heißt, hier passiert nichts
     * (Modul aus, keine Playlist, kein Konto).
     */
    async AfterRankMe(member: GuildMember, profile: IPrimeProfile): Promise<IRankRoleResult | null> {
        if (!(await this.client.settings.Of(member.guild.id)).modules.includes(RANK_ROLES_MODULE)) return null;

        return this.Apply(member, profile).catch((error) => {
            if (error instanceof RankRoleError) return null;

            throw error;
        });
    }
}
