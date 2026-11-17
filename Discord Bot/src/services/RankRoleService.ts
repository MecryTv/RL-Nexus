import { Guild, GuildMember, PermissionFlagsBits } from "discord.js";
import BotClient from "../client/BotClient";
import { MIGRATIONS_TABLE } from "../constants/Database";
import { DefaultRankRoleSettings, EmptyPlaylist, PLAYLISTS, RANK_ROLES_MODULE, StepOf, Steps } from "../constants/RankRoles";
import { IPrimeProfile } from "../interfaces/services/prime/IPrimeService";
import { IRankRoleChange, IRankRoleResult, IRankRoleSettings, Playlist } from "../interfaces/services/rankroles/IRankRoles";
import logger from "../utils/logger";
import { NewRoleProblem } from "../utils/rolegate";
import { LinkUsable } from "../models/PlayerAccount";

export class RankRoleError extends Error {}

/** Merker in schema_migrations: der einmalige Schnitt nach dem Epic-Login ist gelaufen. */
const STRIP_UNVERIFIED = "job:058_strip_unverified_rank_roles";

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

    async SaveSettings(guild: Guild, input: unknown, actor: GuildMember): Promise<IRankRoleSettings> {
        const previous = await this.Settings(guild.id);
        const settings = this.CleanSettings(guild, input, previous);
        // W-0116: Neue Rang-Rollen nur, wenn der Speichernde sie selbst vergeben dürfte.
        const problem = NewRoleProblem(actor, this.Managed(settings), this.Managed(previous));

        if (problem) throw new RankRoleError(problem);

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

        const raw = await this.client.accounts.On(member.id, "epic");
        // W-0131: Per Name verbunden zählt für Rollen nur bei der Art „Nur Epic-Name“.
        const account = raw && LinkUsable(raw, "trusted", member.guild.id) ? raw : null;
        const epicName = account?.display_name?.trim();

        if (raw && !account) throw new RankRoleError("Rang-Rollen gibt es nur mit Epic-Anmeldung: **/rank link** ohne Namen.");
        if (!account || !epicName) throw new RankRoleError("Verbinde erst dein Epic-Konto: **/rank link**.");

        // W-0125: über die Konto-ID, nicht den Namen. Ein alter Name kann inzwischen einem anderen Spieler gehören.
        const profile = known ?? (await this.client.primeService.Profile(account.account_id).catch(() => null));

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
     * W-0125: Die Rang-Rollen dieses Moduls ab, auf jedem Server, auf dem es an
     * ist - beim Wechsel auf ein anderes Epic-Konto und beim Trennen. Sonst
     * blieben die Rollen eines geliehenen Kontos stehen. Neue gibt es danach mit
     * /rank me. Gibt zurück, wie viele Rollen abgingen.
     */
    async Strip(userId: string): Promise<number> {
        let removed = 0;

        for (const guild of this.client.guilds.cache.values()) {
            // Aufräumen geht über die gespeicherte Auswahl, auch wenn Rank Roles im Admin gerade global aus ist (Review W-0131).
            if (!(await this.client.settings.RawModules(guild.id)).includes(RANK_ROLES_MODULE)) continue;

            const member = guild.members.cache.get(userId) ?? (await guild.members.fetch(userId).catch(() => null));

            if (!member) continue;

            const roles = [...this.Managed(await this.Settings(guild.id))].filter((id) => member.roles.cache.has(id) && !this.Blocked(guild, id));

            if (roles.length === 0) continue;

            await member.roles.remove(roles, "Rank Roles: Epic-Konto gewechselt oder getrennt").catch(() => undefined);
            removed += roles.length;
        }

        if (removed > 0) logger.user(`🎖️  Rank Roles: ${userId} -${removed} (Epic-Konto gewechselt oder getrennt)`);

        return removed;
    }

    /**
     * W-0126: Einmal nach dem Start mit dem Epic-Login. Migration 057 hat alle
     * per Namen angelegten Verknüpfungen gelöscht - die Rang-Rollen, die damit
     * geholt wurden, stünden sonst weiter da, auch bei geliehenen Namen. Wer
     * jetzt kein bestätigtes Epic-Konto hat, verliert die Rollen dieses Moduls;
     * mit /rank link und /rank me kommen sie wieder.
     *
     * Läuft genau einmal je Datenbank: Der Merker steht in schema_migrations,
     * erst nachdem alles durch ist - bricht der Lauf ab, kommt er beim nächsten
     * Start noch einmal. Alle Mitglieder sieht der Bot nur mit dem Members-
     * Intent; ohne ihn prüft er die, die er schon kennt, und sagt das im Log.
     * Im Entwicklungsmodus nur auf dem Dev-Server.
     */
    async StripUnverifiedOnce(): Promise<void> {
        if (!this.client.databaseService.Ready) return;

        const done = await this.client.databaseService.Query<{ name: string }>(`SELECT name FROM ${MIGRATIONS_TABLE} WHERE name = ?`, [STRIP_UNVERIFIED]);

        if (done.length > 0) return;

        const { roles, members, intent } = await this.StripUnverified();

        await this.client.databaseService.Query(`INSERT INTO ${MIGRATIONS_TABLE} (name) VALUES (?)`, [STRIP_UNVERIFIED]);

        logger.user(
            `🎖️  Rank Roles: ${roles} Rolle(n) bei ${members} Mitglied(ern) ohne bestätigtes Epic-Konto entfernt` +
                (intent ? "" : " - ohne Members-Intent nur bei Mitgliedern, die der Bot schon kannte")
        );
    }

    /**
     * W-0131: Rang-Rollen von allen Mitgliedern, deren Epic-Verknüpfung für
     * Rollen nicht zählt (keine, oder per Name bei einer strengeren Art).
     * Ohne Merker - StripUnverifiedOnce und der Wechsel der Verknüpfungsart
     * (utils/linkModeWatch.ts) rufen es auf. W-0133: mit guildId nur dieser
     * Server; ob eine Verknüpfung zählt, entscheidet die Art des Servers.
     */
    async StripUnverified(guildId?: string): Promise<{ roles: number; members: number; intent: boolean }> {
        const intent = this.client.config.GUILD_MEMBER_INTENT === true;
        let members = 0;
        let roles = 0;

        for (const guild of this.client.guilds.cache.values()) {
            if (guildId && guild.id !== guildId) continue;
            if (this.client.developerMode && guild.id !== this.client.config.DEV_GUILD_ID) continue;
            // Aufräumen geht über die gespeicherte Auswahl, auch wenn Rank Roles im Admin gerade global aus ist (Review W-0131).
            if (!(await this.client.settings.RawModules(guild.id)).includes(RANK_ROLES_MODULE)) continue;

            const managed = [...this.Managed(await this.Settings(guild.id))];

            if (managed.length === 0) continue;

            if (intent) await guild.members.fetch().catch(() => undefined);

            const holders = new Map<string, GuildMember>();

            for (const id of managed) {
                for (const member of guild.roles.cache.get(id)?.members.values() ?? []) holders.set(member.id, member);
            }

            for (const member of holders.values()) {
                if (await this.client.accounts.Linked(member.id, "epic", "trusted", guild.id)) continue;

                const drop = managed.filter((id) => member.roles.cache.has(id) && !this.Blocked(guild, id));

                if (drop.length === 0) continue;

                await member.roles.remove(drop, "Rank Roles: Epic-Konto nicht bestätigt (Epic-Login)").catch(() => undefined);
                members += 1;
                roles += drop.length;
            }
        }

        return { roles, members, intent };
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
