import { ButtonInteraction, InteractionEditReplyOptions, InteractionReplyOptions, Message, MessageCreateOptions, MessageEditOptions, MessageFlags, ModalSubmitInteraction } from "discord.js";
import BotClient from "../client/BotClient";
import { AskDm, BusyReply, CaptainDm, DoneReply, EpicModal, NotFoundReply, OtherAccountReply, RankLine, RenamedDm, TooManyReply, TypedHint } from "../builder/EpicNameView";
import { ATTEMPTS, ATTEMPT_WINDOW_MS, CASE_KEEP_MS } from "../constants/EpicName";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import { TEAMS_MODULE } from "../constants/Teams";
import { IEpicCase, IEpicPlace } from "../interfaces/services/teams/IEpicName";
import { IPlayerSnapshot, ITeam, ITeamPlayer } from "../interfaces/services/teams/ITeams";
import { Kept, RenamePlaceholders, RenamePlayers } from "./teams/EpicName";

/** Wie lange ein selbst geholter Name als „schon gemeldet“ gilt: zwei Abgleiche zur selben Zeit schicken nur einen Hinweis. */
const RECENT_MS = 3_600_000;

/**
 * Epic-Name geändert (Plan 33): Findet der Abgleich einen Namen nicht mehr,
 * holt der Bot den neuen über die Konto-ID selbst oder fragt den Spieler per
 * DM. Der neue Name gilt dann in jedem Kader der Person und in /rank link.
 * Siehe docs/Teams.md.
 */
export default class EpicNameService {
    private readonly client: BotClient;
    private readonly recent = new Map<string, number>();
    /** Versuche im Fenster je Person - Prime ist ein fremder Dienst. */
    private readonly attempts = new Map<string, number[]>();
    /** Fälle, deren Fenster gerade geprüft wird: zweimal Absenden benennt nicht zweimal um. */
    private readonly busy = new Set<number>();
    /** Fälle, zu denen eine getippte DM schon den Hinweis bekam. */
    private readonly hinted = new Set<number>();

    constructor(client: BotClient) {
        this.client = client;
    }

    /** Aus TeamService.Sync: gibt den Stand zurück, den der Abgleich behalten soll. Ändert bei Erfolg player.epicName. */
    async OnLost(input: { guildId: string; team: ITeam; player: ITeamPlayer; previous: IPlayerSnapshot; fresh: IPlayerSnapshot; kind: "gone" | "taken"; loaded?: ITeam[] }): Promise<IPlayerSnapshot> {
        const { player, previous, fresh, kind } = input;
        const oldName = player.epicName;
        const accountId = previous.accountId ?? (await this.LinkedAccount(player.discordId, oldName));

        if (accountId) {
            const profile = await this.client.primeService.Profile(accountId).catch(() => undefined);

            // Prime antwortet nicht, oder kennt das Konto noch unter dem alten Namen: beim nächsten Abgleich noch einmal.
            if (profile === undefined || profile?.name.toLowerCase() === oldName.toLowerCase()) return previous;

            if (profile) {
                const result = await this.Rename({ guildId: input.guildId, current: input.team, loaded: input.loaded, discordId: player.discordId, oldName, newName: profile.name, accountId });

                if (player.discordId && !this.Recent(player.discordId, oldName)) {
                    await this.Send(player.discordId, RenamedDm({ oldName, newName: profile.name, places: result.places, linked: result.linked, rank: result.rank, auto: true }));
                }

                return result.snapshot;
            }
        }

        if (player.discordId) {
            const made = await this.client.epicNameCases.Add({
                userId: player.discordId,
                oldName,
                accountId,
                lastSeen: { at: previous.at, tierName: previous.tierName, divisionName: previous.divisionName, mmr3: previous.mmr["3v3"] },
                detectedAt: Date.now(),
            });

            if (made) await this.Ask(made);
        }

        return Kept(previous, fresh, kind);
    }

    /**
     * Schreibt den Namen um: in den geladenen Teams des laufenden Abgleichs (die
     * er sonst mit dem alten Namen zurückschriebe) und in jedem anderen Team der
     * Person, dort mit frischem Stand gespeichert. Dazu /rank link, die
     * Platzhalter und die Übersicht je Server. Offene Fälle zu diesem Namen
     * sind danach erledigt.
     */
    async Rename(input: { guildId: string | null; current: ITeam | null; loaded?: ITeam[]; discordId: string | null; oldName: string; newName: string; accountId: string | null }): Promise<{ places: IEpicPlace[]; linked: boolean; rank: string | null; snapshot: IPlayerSnapshot }> {
        const { discordId, oldName, newName } = input;
        const snapshot = await this.client.teamService.Fetch(newName);
        const loaded = new Map((input.loaded ?? (input.current ? [input.current] : [])).map((team) => [team.id, team]));

        if (input.current) loaded.set(input.current.id, input.current);

        // Ohne Discord-ID ist der Name an keine Person gebunden: nur das eigene Team.
        const stored = discordId ? (await this.client.teams.WithPlayer(discordId)).filter((team) => !loaded.has(team.id)) : [];
        const scope = discordId ? [...loaded.values(), ...stored] : input.current ? [input.current] : [];
        const touched = scope.filter((team) => RenamePlayers(team, { discordId, oldName }, newName));

        for (const team of touched) {
            for (const player of team.players) if (player.epicName === newName && (!discordId || player.discordId === discordId)) player.snapshot = structuredClone(snapshot);

            await this.client.teams.SavePlayers(team.id, team.players).catch(() => undefined);
        }

        const linked = discordId ? await this.RenameLink(discordId, input.accountId, oldName, newName) : false;
        const guildIds = new Set([...(input.guildId ? [input.guildId] : []), ...touched.map((team) => team.guildId)]);

        for (const guildId of guildIds) {
            const current = await this.client.teamService.Settings(guildId);
            const settings = RenamePlaceholders(current, oldName, newName);

            if (settings) await this.client.moduleSettings.Save(guildId, TEAMS_MODULE, settings).catch(() => undefined);

            const guild = this.client.guilds.cache.get(guildId);
            // Nur, wo die Übersicht schon steht - sonst tauchte sie in einem eingesammelten oder nie gesendeten Kanal auf.
            const shown = !!current.channelId && (current.layout === "hub" ? !!current.messageId : touched.some((team) => team.guildId === guildId && !!team.messageId));

            // Nicht abwarten: Läuft der Abgleich gerade in der Übersicht dieses Servers, reiht sich das dahinter ein.
            if (guild && shown) void this.client.teamService.Publish(guild).catch(() => undefined);
        }

        if (discordId) {
            for (const open of await this.client.epicNameCases.Open(discordId)) {
                if (open.oldName.toLowerCase() === oldName.toLowerCase()) await this.client.epicNameCases.Save(open.id, { resolvedAt: Date.now() });
            }
        }

        return { places: this.Places(touched), linked, rank: RankLine({ tierName: snapshot.tierName, mmr3: snapshot.mmr["3v3"] }) || null, snapshot };
    }

    /** Die Captains der Teams mit dem alten Namen, ohne sie die Co-Captains; ist die Person selbst Captain, die anderen. Danach captain_at. */
    async Captains(epicCase: IEpicCase, reason: "closed" | "silent"): Promise<void> {
        for (const team of await this.Teams(epicCase.userId, epicCase.oldName)) {
            const self = team.players.find((player) => player.discordId === epicCase.userId);
            const others = team.players.filter((player) => player.discordId && player.discordId !== epicCase.userId);
            const captains = others.filter((player) => player.role === "captain");
            const cocaptains = others.filter((player) => player.role === "cocaptain");
            const to = self?.role === "captain" ? [...captains, ...cocaptains] : captains.length ? captains : cocaptains;
            const card = CaptainDm({
                team: team.name,
                server: this.client.guilds.cache.get(team.guildId)?.name ?? "",
                oldName: epicCase.oldName,
                userId: epicCase.userId,
                reason,
                dashboardUrl: `${this.client.server.BaseURL}${DASHBOARD_PATH}/guild/${team.guildId}/teams`,
            });

            for (const player of to) await this.Send(player.discordId!, card);
        }

        await this.client.epicNameCases.Save(epicCase.id, { captainAt: Date.now() });
    }

    /** epic:ask, epic:again und das Fenster epic:modal - nur für die Person des Falls. */
    async OnButton(interaction: ButtonInteraction | ModalSubmitInteraction): Promise<void> {
        const id = Number(interaction.customId.split(":")[2]);
        const epicCase = Number.isInteger(id) ? await this.client.epicNameCases.Get(id) : null;

        if (!epicCase || epicCase.userId !== interaction.user.id) return void (await this.Reply(interaction, DoneReply()));

        if (interaction.isButton()) {
            // Erledigt, auch im Dashboard oder weil der alte Name wieder geht: die Nachricht mit dem Knopf wird zur Bestätigung.
            if (!(await this.StillOpen(epicCase))) return void (await interaction.update(DoneReply() as never));

            return void (await interaction.showModal(EpicModal(epicCase.id, epicCase.oldName, epicCase.lastSeen.at)));
        }

        if (this.busy.has(epicCase.id)) return void (await this.Reply(interaction, DoneReply()));

        this.busy.add(epicCase.id);

        try {
            // Neu lesen: Ein zweites Absenden kann den Fall gelesen haben, bevor das erste fertig war.
            const current = await this.client.epicNameCases.Get(epicCase.id);

            if (!current || !(await this.StillOpen(current))) return void (await this.Reply(interaction, DoneReply()));
            if (this.TooMany(interaction.user.id)) return void (await this.Reply(interaction, TooManyReply()));

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            await this.Submit(interaction, current, interaction.fields.getTextInputValue("name").trim());
        } finally {
            this.busy.delete(epicCase.id);
        }
    }

    /**
     * Getippte DM bei offenem Fall: einmal je Fall der Hinweis mit Knopf statt
     * Mod Mail. Danach geht Mod Mail wieder - ein Fall kann lange offen sein.
     * false: kein Fall offen oder schon darauf hingewiesen.
     */
    async OnTyped(message: Message): Promise<boolean> {
        const [open] = await this.client.epicNameCases.Open(message.author.id);

        // ponytail: im Speicher - nach einem Neustart kommt der Hinweis noch einmal.
        if (!open || this.hinted.has(open.id)) return false;

        this.hinted.add(open.id);
        await message.reply({ ...TypedHint(open.id, open.oldName), allowedMentions: { parse: [], repliedUser: false } } as never).catch(() => undefined);

        return true;
    }

    /** Stündlich: erledigte Fälle abhaken, nach 3 Tagen ohne Antwort der Captain, alte Fälle weg. */
    async Tick(now: number): Promise<void> {
        for (const open of await this.client.epicNameCases.AllOpen()) await this.StillOpen(open, now);

        for (const due of await this.client.epicNameCases.Due(now)) await this.Captains(due, due.dmFailed ? "closed" : "silent");

        await this.client.epicNameCases.Prune(now - CASE_KEEP_MS);
    }

    /* ----------------------------------------------------------
       Intern
       ---------------------------------------------------------- */
    /**
     * false, wenn der Fall erledigt ist - oder sich inzwischen anders erledigt hat:
     * Der alte Name steht in keinem Kader der Person mehr (etwa im Dashboard
     * geändert), oder Prime kennt ihn dort wieder zum selben Konto. Dann wird er abgehakt.
     */
    private async StillOpen(epicCase: IEpicCase, now = Date.now()): Promise<boolean> {
        if (epicCase.resolvedAt !== null) return false;

        const key = epicCase.oldName.toLowerCase();
        const teams = await this.Teams(epicCase.userId, epicCase.oldName);
        const back = teams.some((team) =>
            team.players.some((player) => {
                const snapshot = player.snapshot;

                return player.discordId === epicCase.userId && player.epicName.toLowerCase() === key && !!snapshot?.name && snapshot.error === null && (!epicCase.accountId || snapshot.accountId === epicCase.accountId);
            })
        );

        if (teams.length && !back) return true;

        await this.client.epicNameCases.Save(epicCase.id, { resolvedAt: now });

        return false;
    }

    /** Das Fenster: Prime fragen, Konto prüfen, überall umbenennen, die DM wird grün. */
    private async Submit(interaction: ModalSubmitInteraction, epicCase: IEpicCase, name: string): Promise<void> {
        const profile = name ? await this.client.primeService.Profile(name).catch(() => undefined) : null;

        if (profile === undefined) return void (await this.Reply(interaction, BusyReply(epicCase.id)));
        if (!profile) return void (await this.Reply(interaction, NotFoundReply(name || "…", epicCase.id)));
        if (epicCase.accountId && profile.accountId !== epicCase.accountId) return void (await this.Reply(interaction, OtherAccountReply(profile.name, epicCase.oldName, epicCase.id)));

        const result = await this.Rename({ guildId: null, current: null, discordId: epicCase.userId, oldName: epicCase.oldName, newName: profile.name, accountId: epicCase.accountId });
        const done = RenamedDm({ oldName: epicCase.oldName, newName: profile.name, places: result.places, linked: result.linked, rank: result.rank, auto: false });

        await this.client.epicNameCases.Save(epicCase.id, { resolvedAt: Date.now() });

        const edited = await this.EditDm(epicCase, done);

        if (edited) await interaction.deleteReply().catch(() => undefined);
        else await this.Reply(interaction, done);
    }

    private async EditDm(epicCase: IEpicCase, payload: MessageCreateOptions): Promise<boolean> {
        if (!epicCase.channelId || !epicCase.messageId) return false;

        try {
            const channel = (await this.client.channels.fetch(epicCase.channelId)) as { messages: { fetch: (id: string) => Promise<Message> } } | null;
            const message = await channel?.messages.fetch(epicCase.messageId);

            await message?.edit(payload as MessageEditOptions);

            return !!message;
        } catch {
            return false;
        }
    }

    private async Reply(interaction: ButtonInteraction | ModalSubmitInteraction, payload: MessageCreateOptions): Promise<void> {
        if (interaction.deferred || interaction.replied) await interaction.editReply(payload as InteractionEditReplyOptions);
        else await interaction.reply({ ...(payload as InteractionReplyOptions), flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    }

    /** true ab dem (ATTEMPTS + 1). Versuch im Fenster. */
    private TooMany(userId: string): boolean {
        const now = Date.now();
        const recent = (this.attempts.get(userId) ?? []).filter((at) => now - at < ATTEMPT_WINDOW_MS);

        recent.push(now);
        this.attempts.set(userId, recent);

        return recent.length > ATTEMPTS;
    }

    /** DM an den Spieler; kommt sie nicht an, sofort der Captain. */
    private async Ask(epicCase: IEpicCase): Promise<void> {
        const teams = await this.Teams(epicCase.userId, epicCase.oldName);
        const link = await this.client.accounts.On(epicCase.userId, "epic").catch(() => null);
        const linked = !!link && (epicCase.accountId ? link.account_id === epicCase.accountId : link.display_name?.toLowerCase() === epicCase.oldName.toLowerCase());
        const sent = await this.Send(epicCase.userId, AskDm({ caseId: epicCase.id, oldName: epicCase.oldName, places: this.Places(teams), linked, lastSeen: epicCase.lastSeen }));

        if (sent) return void (await this.client.epicNameCases.Save(epicCase.id, { dmAt: Date.now(), channelId: sent.channelId, messageId: sent.id }));

        await this.client.epicNameCases.Save(epicCase.id, { dmFailed: true });
        await this.Captains({ ...epicCase, dmFailed: true }, "closed");
    }

    /** Die Konto-ID aus /rank link, wenn dort derselbe Name steht. */
    private async LinkedAccount(discordId: string | null, name: string): Promise<string | null> {
        if (!discordId) return null;

        const link = await this.client.accounts.On(discordId, "epic").catch(() => null);

        return link && link.display_name?.toLowerCase() === name.toLowerCase() ? link.account_id : null;
    }

    /** Nur der Anzeigename, wenn die Verknüpfung dieses Konto (oder ohne ID diesen Namen) hat. Die Sperrfrist bleibt. */
    private async RenameLink(discordId: string, accountId: string | null, oldName: string, newName: string): Promise<boolean> {
        const link = await this.client.accounts.On(discordId, "epic").catch(() => null);

        if (!link || !(accountId ? link.account_id === accountId : link.display_name?.toLowerCase() === oldName.toLowerCase())) return false;

        await this.client.accounts.Rename(discordId, "epic", newName);

        return true;
    }

    /** Aktive Teams aller Server, in denen die Person unter diesem Namen steht. */
    private async Teams(userId: string, name: string): Promise<ITeam[]> {
        const key = name.toLowerCase();

        return (await this.client.teams.WithPlayer(userId)).filter((team) => team.players.some((player) => player.discordId === userId && player.epicName.toLowerCase() === key));
    }

    private Places(teams: ITeam[]): IEpicPlace[] {
        return teams.map((team) => ({ guildName: this.client.guilds.cache.get(team.guildId)?.name ?? "", teamName: team.name }));
    }

    private async Send(userId: string, payload: MessageCreateOptions): Promise<{ id: string; channelId: string } | null> {
        try {
            const user = await this.client.users.fetch(userId);

            return await user.send(payload);
        } catch {
            return null;
        }
    }

    /** true, wenn für diese Person und diesen alten Namen schon ein Hinweis rausging. Merkt ihn sonst. */
    private Recent(userId: string, oldName: string): boolean {
        const now = Date.now();
        const key = `${userId}:${oldName.toLowerCase()}`;

        for (const [entry, at] of this.recent) if (now - at > RECENT_MS) this.recent.delete(entry);
        if (this.recent.has(key)) return true;

        this.recent.set(key, now);

        return false;
    }
}
