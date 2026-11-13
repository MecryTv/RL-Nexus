import {
    AttachmentBuilder,
    ButtonInteraction,
    ChannelType,
    ChatInputCommandInteraction,
    Guild,
    GuildMember,
    MessageFlags,
    ModalSubmitInteraction,
    PermissionFlagsBits,
    StringSelectMenuInteraction,
    TextChannel,
} from "discord.js";
import BotClient from "../client/BotClient";
import { ABSENCE_LIST_DAYS, AbsenceShown, AddDays, DaysBetween, ShortDay, Today, WeekdayCaps } from "../constants/Absences";
import { MATCHUPS_MODULE, ZoneParts } from "../constants/Matchups";
import { PLAYING_ROLES, TEAMS_MODULE } from "../constants/Teams";
import { IAbsenceSettings, IAbsenceStatus, ITeamAbsence } from "../interfaces/services/teams/IAbsences";
import { ITeam, ITeamPlayer } from "../interfaces/services/teams/ITeams";
import { AbsenceStatus, CheckAbsence, IAbsenceInput, MergeAbsence, ReturnPlan, WarningText } from "./teams/Absences";
import { IAbsenceCardData, IAbsenceCardRow, RenderAbsenceCard } from "../builder/AbsenceCard";
import { ALL_TEAMS, AbsenceModal, AbsenceNote, AddedReply, MineReply, Period, TeamPicker } from "../builder/AbsenceView";
import ComponentV2Builder from "../builder/ComponentV2Builder";
import { Usable } from "./TeamService";
import logger from "../utils/logger";

/** Ein Satz für den Nutzer: was nicht ging und warum. */
export class AbsenceError extends Error {}

/**
 * Abmeldungen im Modul RL Team-Übersicht (W-0095): Spieler melden sich für
 * einen Zeitraum ab, Captains sehen es. Die Regeln stehen in teams/Absences.ts,
 * hier kommen Datenbank und Discord dazu. Siehe docs/Teams.md.
 */
export default class AbsenceService {
    constructor(private readonly client: BotClient) {}

    async Settings(guildId: string): Promise<IAbsenceSettings> {
        return (await this.client.teamService.Settings(guildId)).absences;
    }

    /** Die Teams des Servers, in deren Kader diese Person mit Discord-Konto steht. */
    async TeamsOf(guildId: string, userId: string): Promise<ITeam[]> {
        return (await this.client.teams.AllOfGuild(guildId)).filter((team) => team.players.some((player) => player.discordId === userId));
    }

    /** Was von dieser Person heute oder später noch gilt. */
    Mine(guildId: string, userId: string, now = Date.now()): Promise<ITeamAbsence[]> {
        return this.client.teamAbsences.OfUser(guildId, userId, Today(now));
    }

    async Status(team: ITeam, now = Date.now()): Promise<IAbsenceStatus> {
        const today = Today(now);

        return AbsenceStatus(team.players, await this.client.teamAbsences.OfTeams([team.id], today), today);
    }

    /** Meldet ab, je Team eine Zeile. Was sich überschneidet oder anschließt, wird eins. */
    async Add(guildId: string, userId: string, teamIds: number[], input: IAbsenceInput, now = Date.now()): Promise<ITeamAbsence[]> {
        const settings = await this.Enabled(guildId);
        const teams = (await this.TeamsOf(guildId, userId)).filter((team) => teamIds.includes(team.id));

        if (!teams.length) throw new AbsenceError("Du stehst in keinem dieser Teams im Kader.");

        const checked = CheckAbsence(input, settings, now);

        if ("error" in checked) throw new AbsenceError(checked.error);

        const existing = await this.client.teamAbsences.OfUser(guildId, userId, Today(now));
        const saved: ITeamAbsence[] = [];

        for (const team of teams) {
            const merged = MergeAbsence(
                existing.filter((entry) => entry.teamId === team.id),
                checked.startsOn,
                checked.endsOn
            );
            const values = { startsOn: merged.startsOn, endsOn: merged.endsOn, reason: checked.reason, note: checked.note };

            // Aneinanderhängen darf die Höchstdauer nicht umgehen (Review W-0095).
            if (DaysBetween(merged.startsOn, merged.endsOn) + 1 > settings.maxDays) throw new AbsenceError(`Zusammen mit deiner Abmeldung bei ${team.name} wären das mehr als ${settings.maxDays} Tage am Stück.`);

            if (merged.keep === null) {
                saved.push(await this.client.teamAbsences.Create({ guildId, teamId: team.id, userId, ...values }));
                continue;
            }

            await this.client.teamAbsences.Change(merged.keep, values);
            await this.client.teamAbsences.Remove(...merged.drop);
            saved.push((await this.client.teamAbsences.Get(merged.keep))!);
        }

        this.Changed(guildId, teams.map((team) => team.id));

        return saved;
    }

    /** Ändert eine eigene Abmeldung. Läuft sie schon, darf ihr Start bleiben. */
    async Edit(guildId: string, userId: string, id: number, input: IAbsenceInput, now = Date.now()): Promise<ITeamAbsence> {
        const settings = await this.Enabled(guildId);
        const absence = await this.Own(guildId, userId, id);
        const checked = CheckAbsence(input, settings, now, absence.startsOn);

        if ("error" in checked) throw new AbsenceError(checked.error);

        const others = (await this.client.teamAbsences.OfUser(guildId, userId, Today(now))).filter((entry) => entry.teamId === absence.teamId && entry.id !== id);
        const merged = MergeAbsence(others, checked.startsOn, checked.endsOn);

        if (DaysBetween(merged.startsOn, merged.endsOn) + 1 > settings.maxDays) throw new AbsenceError(`Zusammen mit einer anderen Abmeldung wären das mehr als ${settings.maxDays} Tage am Stück.`);

        await this.client.teamAbsences.Change(id, { startsOn: merged.startsOn, endsOn: merged.endsOn, reason: checked.reason, note: checked.note });
        await this.client.teamAbsences.Remove(...(merged.keep === null ? [] : [merged.keep, ...merged.drop]));

        this.Changed(guildId, [absence.teamId]);

        return (await this.client.teamAbsences.Get(id))!;
    }

    /** Wieder da: Was heute läuft, endet. Gibt zurück, wie viele es betraf. */
    async Return(guildId: string, userId: string, now = Date.now()): Promise<number> {
        const today = Today(now);
        const mine = await this.client.teamAbsences.OfUser(guildId, userId, today);
        const plan = ReturnPlan(mine, today);

        for (const entry of plan.end) await this.client.teamAbsences.Change(entry.id, { endsOn: entry.endsOn });

        await this.client.teamAbsences.Remove(...plan.drop);

        const touched = mine.filter((entry) => plan.drop.includes(entry.id) || plan.end.some((end) => end.id === entry.id));

        this.Changed(guildId, [...new Set(touched.map((entry) => entry.teamId))]);

        return touched.length;
    }

    async Remove(guildId: string, userId: string, id: number): Promise<void> {
        const absence = await this.Own(guildId, userId, id);

        await this.client.teamAbsences.Remove(id);
        this.Changed(guildId, [absence.teamId]);
    }

    /**
     * Welche Teams diese Person bei /abmeldungen sieht. Wer „Server verwalten“
     * hat, sieht alle mit Gründen; Captain-Rollen aus den Einstellungen sehen
     * ihre Teams mit Gründen, alle anderen im Kader ihre Teams ohne.
     */
    async Viewable(guild: Guild, member: GuildMember): Promise<{ team: ITeam; reasons: boolean }[]> {
        const settings = await this.Settings(guild.id);
        const teams = await this.client.teams.AllOfGuild(guild.id);
        const manage = member.permissions.has(PermissionFlagsBits.ManageGuild);

        return teams.flatMap((team) => {
            if (manage) return [{ team, reasons: true }];

            const me = team.players.find((player) => player.discordId === member.id);

            return me ? [{ team, reasons: settings.viewers.includes(me.role) }] : [];
        });
    }

    /** Was das Bild braucht: Namen, Marken, das nächste Matchup. Ohne reasons fehlen Grund und Notiz. */
    async CardData(guild: Guild, team: ITeam, reasons: boolean, now = Date.now(), panel = false): Promise<IAbsenceCardData> {
        const today = Today(now);
        const absences = await this.client.teamAbsences.OfTeams([team.id], today);
        const status = AbsenceStatus(team.players, absences, today);
        const names = new Map(team.players.filter((player) => player.discordId).map((player) => [player.discordId!, (player.name || player.snapshot?.name || player.epicName || "Unbekannt").slice(0, 40)]));
        const row = (entry: ITeamAbsence, tone: "now" | "soon"): IAbsenceCardRow => ({
            name: names.get(entry.userId) ?? "Unbekannt",
            chip: { text: tone === "now" ? "Jetzt" : `Ab ${WeekdayCaps(entry.startsOn)}`, tone },
            period: Period(entry.startsOn, entry.endsOn),
            reason: reasons ? entry.reason : "",
            note: reasons ? entry.note : "",
        });
        const time = ZoneParts(now);

        return {
            title: panel ? "Verfügbarkeit" : "Abmeldungen",
            teamName: team.name,
            tag: team.tag,
            logo: team.logo ? await Usable(await this.client.galleryService.ReadImage(team.logo, guild.id).catch(() => null)) : null,
            here: status.here,
            of: status.of,
            away: status.now.length,
            soon: status.soon.length,
            next: await this.NextMatchup(guild.id, team, absences, now),
            rows: [...status.now.map((entry) => row(entry, "now")), ...status.soon.map((entry) => row(entry, "soon"))],
            reasons,
            footer: panel ? "Nicht da? Melde dich mit /abmelden ab." : "Abgemeldet über /abmelden",
            stamp: `Stand ${ShortDay(today)} ${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}`,
        };
    }

    /** Das nächste Matchup des Teams in den nächsten 14 Tagen und wie viele dann da sind. */
    private async NextMatchup(guildId: string, team: ITeam, absences: ITeamAbsence[], now: number): Promise<IAbsenceCardData["next"]> {
        if (!(await this.client.settings.Of(guildId)).modules.includes(MATCHUPS_MODULE)) return null;

        // Upcoming nimmt Spiele mit, die vor bis zu 6 Stunden begonnen haben - das nächste ist das erste, das noch kommt (Review W-0095).
        const next = (await this.client.matchups.Upcoming(guildId, now, { teamId: team.id, limit: 5 }).catch(() => [])).find((matchup) => matchup.at >= now);

        if (!next || Today(next.at) > AddDays(Today(now), ABSENCE_LIST_DAYS)) return null;

        const day = Today(next.at);
        const status = AbsenceStatus(team.players, absences, day);
        const time = ZoneParts(next.at);

        return { label: `${WeekdayCaps(day)} ${ShortDay(day)} · ${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}`, here: status.here, of: status.of };
    }

    /** Für {team.available} und {team.absent}: je Team heute da und wer heute fehlt. */
    async ViewInfo(teams: ITeam[], now = Date.now()): Promise<Map<number, { here: number; of: number; names: string }>> {
        const today = Today(now);
        const absences = await this.client.teamAbsences.OfTeams(
            teams.map((team) => team.id),
            today
        );
        const info = new Map<number, { here: number; of: number; names: string }>();

        for (const team of teams) {
            const status = AbsenceStatus(
                team.players,
                absences.filter((entry) => entry.teamId === team.id),
                today
            );
            const name = (userId: string): string => {
                const player = team.players.find((entry) => entry.discordId === userId);

                return player?.name || player?.snapshot?.name || player?.epicName || "Unbekannt";
            };

            info.set(team.id, { here: status.here, of: status.of, names: status.now.map((entry) => `${name(entry.userId)} (bis ${ShortDay(entry.endsOn)})`).join(", ") });
        }

        return info;
    }

    /** Für die gezeichnete Karte: Marke je abgemeldetem Spieler und „3/4 da“. null, wenn heute niemand fehlt. */
    async CardMarks(team: ITeam, now = Date.now()): Promise<{ marks: Record<string, string>; here: number; of: number } | null> {
        const today = Today(now);
        const status = AbsenceStatus(team.players, await this.client.teamAbsences.OfTeams([team.id], today), today);

        if (!status.now.length) return null;

        const marks: Record<string, string> = {};

        for (const entry of status.now) {
            const player = team.players.find((candidate) => candidate.discordId === entry.userId);

            if (player) marks[player.id] = entry.endsOn === today ? "Heute weg" : `Bis ${ShortDay(entry.endsOn)}`;
        }

        return { marks, here: status.here, of: status.of };
    }

    /**
     * Wer am Tag eines Matchups abgemeldet ist - nur wer mitspielt, ohne Grund.
     * null: Warnung aus, kein Team oder niemand weg.
     */
    async MatchupAbsent(guildId: string, teamId: number | null, at: number): Promise<{ here: number; of: number; names: string[] } | null> {
        if (teamId === null) return null;

        const settings = await this.Settings(guildId);

        if (!settings.enabled || !settings.matchupWarning) return null;

        const team = (await this.client.teams.AllOfGuild(guildId)).find((entry) => entry.id === teamId);

        if (!team) return null;

        const day = Today(at);
        const playing = team.players.filter((player) => PLAYING_ROLES.includes(player.role));
        const status = AbsenceStatus(team.players, await this.client.teamAbsences.OfTeams([team.id], day), day);
        const names = status.now
            .map((entry) => playing.find((player) => player.discordId === entry.userId))
            .filter((player): player is ITeamPlayer => Boolean(player))
            .map((player) => player.name || player.snapshot?.name || player.epicName || "Unbekannt");

        return names.length ? { here: status.here, of: status.of, names } : null;
    }

    /** Beim Eintragen: „2 von 4 sind dann abgemeldet: Kuzai, Yoshi.“ null: niemand. */
    async MatchupWarning(guildId: string, teamId: number | null, at: number): Promise<string | null> {
        const absent = await this.MatchupAbsent(guildId, teamId, at).catch(() => null);

        return absent ? WarningText(absent.here, absent.of, absent.names) : null;
    }

    /** /abmeldungen: das Bild, nur für den Fragenden. */
    async ListView(guild: Guild, team: ITeam, reasons: boolean, now = Date.now()) {
        const name = `abmeldungen-${team.id}.webp`;
        const file = new AttachmentBuilder(await RenderAbsenceCard(await this.CardData(guild, team, reasons, now)), { name });
        const card = new ComponentV2Builder({ accentColor: 0xf5a524 }).gallery(`attachment://${name}`);

        return { components: [card.build()], files: [file], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, allowedMentions: { parse: [] } } as const;
    }

    /* ----------------------------------------------------------
       Discord: /abmelden, /abmeldungen, Formular, Knöpfe
       ---------------------------------------------------------- */
    /** /abmelden und „Neue Abmeldung“: Wer schon etwas eingetragen hat, sieht erst seine Liste (außer fresh). */
    async Open(interaction: ChatInputCommandInteraction<"cached"> | ButtonInteraction<"cached">, fresh = false): Promise<void> {
        const settings = await this.Settings(interaction.guildId);

        if (!settings.enabled) return void (await interaction.reply(AbsenceNote("Abmeldungen sind auf diesem Server aus.")));

        const teams = await this.TeamsOf(interaction.guildId, interaction.user.id);

        if (!teams.length) return void (await interaction.reply(AbsenceNote("Du stehst in keinem Team-Kader auf diesem Server. Dein Captain trägt dich im Dashboard unter RL Team-Übersicht ein.")));

        const mine = fresh ? [] : await this.Mine(interaction.guildId, interaction.user.id);

        if (mine.length) return void (await interaction.reply(MineReply(mine, this.Names(teams), Today(Date.now()))));

        await interaction.showModal(AbsenceModal({ teams, reasons: settings.reasons, reasonRequired: settings.reasonRequired }));
    }

    async Submit(interaction: ModalSubmitInteraction<"cached">): Promise<void> {
        const editId = /^absence:modal:edit:(\d+)$/.exec(interaction.customId)?.[1];
        const field = (id: string): string => {
            try {
                return interaction.fields.getTextInputValue(id);
            } catch {
                return "";
            }
        };
        const choice = (id: string): string => {
            try {
                return interaction.fields.getStringSelectValues(id)[0] ?? "";
            } catch {
                return "";
            }
        };
        const input = { from: field("from"), to: field("to"), reason: choice("reason"), note: field("note") };
        const teams = await this.TeamsOf(interaction.guildId, interaction.user.id);

        try {
            if (editId) {
                const saved = await this.Edit(interaction.guildId, interaction.user.id, Number(editId), input);

                return void (await interaction.reply(AddedReply([saved], this.Names(teams), Today(Date.now()))));
            }

            const picked = choice("team");
            const ids = picked && picked !== ALL_TEAMS ? [Number(picked)] : teams.map((team) => team.id);
            const saved = await this.Add(interaction.guildId, interaction.user.id, ids, input);

            await interaction.reply(AddedReply(saved, this.Names(teams), Today(Date.now())));
        } catch (error) {
            if (!(error instanceof AbsenceError)) throw error;

            await interaction.reply(AbsenceNote(error.message, "error"));
        }
    }

    /** absence:new, absence:return, absence:edit:<id>, absence:remove:<id> */
    async Button(interaction: ButtonInteraction<"cached">): Promise<void> {
        const [, action, id] = interaction.customId.split(":");
        const update = (payload: { readonly components: readonly unknown[] }) => interaction.update({ components: [...payload.components] as never, flags: MessageFlags.IsComponentsV2 });

        try {
            if (action === "new") return await this.Open(interaction, true);

            if (action === "edit") {
                const settings = await this.Settings(interaction.guildId);
                const absence = await this.Own(interaction.guildId, interaction.user.id, Number(id));
                const team = (await this.client.teams.AllOfGuild(interaction.guildId)).find((entry) => entry.id === absence.teamId);

                return await interaction.showModal(
                    AbsenceModal({ teams: [], reasons: settings.reasons, reasonRequired: settings.reasonRequired, edit: { ...absence, teamName: team?.name ?? "Team" } })
                );
            }

            if (action === "return") {
                const count = await this.Return(interaction.guildId, interaction.user.id);

                return void (await update(AbsenceNote(count ? "✅ Willkommen zurück. Du bist wieder als da eingetragen." : "Heute warst du gar nicht abgemeldet.", count ? "ok" : "warn")));
            }

            if (action === "remove") {
                await this.Remove(interaction.guildId, interaction.user.id, Number(id));

                const mine = await this.Mine(interaction.guildId, interaction.user.id);
                const teams = await this.TeamsOf(interaction.guildId, interaction.user.id);

                return void (await update(mine.length ? MineReply(mine, this.Names(teams), Today(Date.now())) : AbsenceNote("🗑 Gelöscht. Du hast keine Abmeldung mehr.", "ok")));
            }
        } catch (error) {
            if (!(error instanceof AbsenceError)) throw error;

            await interaction.reply(AbsenceNote(error.message, "error"));
        }
    }

    /** /abmeldungen: mit team das Team, sonst das eine oder eine Auswahl. */
    async List(interaction: ChatInputCommandInteraction<"cached">, teamId: number | null): Promise<void> {
        const viewable = await this.Viewable(interaction.guild, interaction.member);

        if (!viewable.length) return void (await interaction.reply(AbsenceNote("Du stehst in keinem Team-Kader auf diesem Server.")));

        const chosen = teamId !== null ? viewable.find((entry) => entry.team.id === teamId) : viewable.length === 1 ? viewable[0] : undefined;

        if (teamId !== null && !chosen) return void (await interaction.reply(AbsenceNote("Dieses Team kannst du dir nicht ansehen.", "error")));
        if (!chosen) return void (await interaction.reply(TeamPicker(viewable.map((entry) => entry.team))));

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const view = await this.ListView(interaction.guild, chosen.team, chosen.reasons);

        await interaction.editReply({ components: view.components, files: view.files, flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });
    }

    /** Die Auswahl aus TeamPicker. */
    async Picked(interaction: StringSelectMenuInteraction<"cached">): Promise<void> {
        const viewable = await this.Viewable(interaction.guild, interaction.member);
        const chosen = viewable.find((entry) => String(entry.team.id) === interaction.values[0]);

        if (!chosen) return void (await interaction.reply(AbsenceNote("Dieses Team kannst du dir nicht ansehen.", "error")));

        await interaction.deferUpdate();

        const view = await this.ListView(interaction.guild, chosen.team, chosen.reasons);

        await interaction.editReply({ components: view.components, files: view.files, flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });
    }

    private Names(teams: ITeam[]): Map<number, string> {
        return new Map(teams.map((team) => [team.id, team.name]));
    }

    /** Räumt ab, was lange vorbei ist. */
    Prune(now = Date.now(), keepDays = 30): Promise<number> {
        return this.client.teamAbsences.Prune(AddDays(Today(now), -keepDays));
    }

    private async Enabled(guildId: string): Promise<IAbsenceSettings> {
        const settings = await this.Settings(guildId);

        if (!settings.enabled) throw new AbsenceError("Abmeldungen sind auf diesem Server aus.");

        return settings;
    }

    private async Own(guildId: string, userId: string, id: number): Promise<ITeamAbsence> {
        const absence = await this.client.teamAbsences.Get(id);

        if (!absence || absence.guildId !== guildId || absence.userId !== userId) throw new AbsenceError("Diese Abmeldung gibt es nicht oder sie ist nicht deine.");

        return absence;
    }

    /** Nach jeder Änderung: Panel und Karten der Teams nachziehen. Läuft im Hintergrund, ein Fehler bleibt im Log. */
    private Changed(guildId: string, teamIds: number[]): void {
        if (!teamIds.length) return;

        const guild = this.client.guilds.cache.get(guildId);

        if (!guild) return;

        void this.Refresh(guild.id, teamIds).catch((error) => logger.warn(`🗓 Abmeldungen: Nachziehen auf ${guildId} fehlgeschlagen: ${String(error)}`));
    }

    /* ----------------------------------------------------------
       Panel „Verfügbarkeit“ im Kanal des Teams und der Tageswechsel
       ---------------------------------------------------------- */
    private readonly chains = new Map<number, Promise<void>>();
    private day: string | null = null;

    /** Nach einer Änderung: Panels der Teams und Karten mit {team.available}/{team.absent} nachziehen. */
    async Refresh(guildId: string, teamIds: number[]): Promise<void> {
        const guild = this.client.guilds.cache.get(guildId);

        if (!guild) return;

        const settings = await this.client.teamService.Settings(guildId);
        const teams = (await this.client.teams.AllOfGuild(guildId)).filter((team) => teamIds.includes(team.id));
        const panel = settings.absences.enabled && settings.absences.panel;

        for (const team of teams) {
            await this.Serial(team.id, () => (panel ? this.ShowPanel(guild, team) : this.DropPanel(guild, team.id))).catch((error) =>
                logger.warn(`🗓 Panel für Team ${team.id} nicht aktualisiert: ${String(error)}`)
            );
        }

        // {team.available}/{team.absent} im Kanal: bei „Alle Teams einzeln“ die Karten der Teams, im Hub einmal der ganze Hub.
        const shown = AbsenceShown(settings);

        if (shown === "cards") for (const team of teams) if (team.messageId) await this.client.teamService.Refresh(guild, team).catch(() => undefined);
        if (shown === "hub" && settings.messageId) await this.client.teamService.Publish(guild).catch(() => undefined);
    }

    /**
     * Ein Matchup kam dazu, änderte sich, fiel weg oder wurde angepfiffen: Die
     * Kachel „nächstes Matchup“ im Panel stimmt sonst bis zum nächsten Tag nicht.
     * Nur mit Panel, im Hintergrund.
     */
    MatchupChanged(guildId: string, ...teamIds: (number | null)[]): void {
        const ids = [...new Set(teamIds.filter((id): id is number => id !== null))];

        if (!ids.length) return;

        void this.Settings(guildId)
            .then((settings) => (settings.enabled && settings.panel ? this.Refresh(guildId, ids) : undefined))
            .catch((error) => logger.warn(`🗓 Panel nach Matchup auf ${guildId} nicht nachgezogen: ${String(error)}`));
    }

    /** Alle Teams eines Servers, etwa nach dem Speichern der Einstellungen. */
    async RefreshAll(guildId: string): Promise<void> {
        await this.Refresh(
            guildId,
            (await this.client.teams.AllOfGuild(guildId)).map((team) => team.id)
        );
    }

    /** Einmal je Tag (und nach dem Start): abgelaufene Abmeldungen abräumen, Panels und Karten auf den neuen Tag bringen. */
    async DayTick(now = Date.now()): Promise<number> {
        const today = Today(now);

        if (this.day === today) return 0;

        this.day = today;

        const pruned = await this.Prune(now).catch(() => 0);
        let guilds = 0;

        for (const guild of this.client.guilds.cache.values()) {
            if (!(await this.client.settings.Of(guild.id)).modules.includes(TEAMS_MODULE)) continue;

            const settings = await this.client.teamService.Settings(guild.id);

            if (!settings.absences.enabled) continue;
            if (!settings.absences.panel && !AbsenceShown(settings)) continue;

            await this.RefreshAll(guild.id).catch((error) => logger.warn(`🗓 Tageswechsel auf ${guild.id}: ${String(error)}`));
            guilds++;
        }

        if (pruned || guilds) logger.tasks(`🗓 Abmeldungen: neuer Tag ${today}, ${pruned} alte entfernt, ${guilds} Server nachgezogen`);

        return guilds;
    }

    /** Das Panel eines Teams entfernen, etwa bevor das Team gelöscht wird. */
    async DropPanel(guild: Guild, teamId: number): Promise<void> {
        const stored = await this.client.teamAbsences.Panel(teamId);

        if (!stored.messageId) return;

        const channel = stored.channelId ? guild.channels.cache.get(stored.channelId) : null;

        if (channel?.isTextBased()) await channel.messages.delete(stored.messageId).catch(() => undefined);

        await this.client.teamAbsences.SetPanel(teamId, null, null);
    }

    /** Der erste Textkanal des Teams: aus der Kategorie oder der erste eingetragene. */
    private PanelChannel(guild: Guild, team: ITeam): TextChannel | null {
        const ids =
            team.channels.kind === "category" && team.channels.categoryId
                ? [...guild.channels.cache.values()]
                      .filter((channel) => channel.parentId === team.channels.categoryId && channel.type === ChannelType.GuildText)
                      .sort((a, b) => ("position" in a && "position" in b ? a.position - b.position : 0))
                      .map((channel) => channel.id)
                : team.channels.textIds;

        for (const id of ids) {
            const channel = guild.channels.cache.get(id);

            if (channel?.type === ChannelType.GuildText) return channel;
        }

        return null;
    }

    private async ShowPanel(guild: Guild, team: ITeam): Promise<void> {
        const channel = this.PanelChannel(guild, team);
        const stored = await this.client.teamAbsences.Panel(team.id);

        // Kein Textkanal mehr: Ein altes Panel kommt weg.
        if (!channel) return this.DropPanel(guild, team.id);

        const name = `verfuegbarkeit-${team.id}.webp`;
        const file = new AttachmentBuilder(await RenderAbsenceCard(await this.CardData(guild, team, false, Date.now(), true)), { name });
        const components = [new ComponentV2Builder({ accentColor: 0xf5a524 }).gallery(`attachment://${name}`).build()];

        if (stored.messageId && stored.channelId === channel.id) {
            const message = await channel.messages.fetch(stored.messageId).catch(() => null);

            if (message) {
                await message.edit({ components, files: [file], attachments: [], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });

                return;
            }
        }

        // Neuer Kanal oder Nachricht weg: das alte (falls noch da) löschen, neu posten.
        if (stored.messageId) await this.DropPanel(guild, team.id);

        const sent = await channel.send({ components, files: [file], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });

        await this.client.teamAbsences.SetPanel(team.id, channel.id, sent.id);
    }

    /** Je Team der Reihe nach, sonst posten zwei Änderungen kurz hintereinander zwei Panels. */
    private Serial(teamId: number, task: () => Promise<void>): Promise<void> {
        const run = (this.chains.get(teamId) ?? Promise.resolve()).catch(() => undefined).then(task);

        this.chains.set(
            teamId,
            run.catch(() => undefined)
        );

        return run;
    }
}
