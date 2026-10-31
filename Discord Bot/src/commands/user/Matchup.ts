import { ActionRowBuilder, AutocompleteInteraction, ButtonBuilder, ButtonStyle, ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from "discord.js";
import BotClient from "../../client/BotClient";
import Command from "../../structures/Command";
import Category from "../../enums/Category";
import { BEST_OF, KICKOFF_HELP, KickoffSuggestions, MATCHUPS_MODULE, MATCHUPS_PREFIX, MAX_LEAGUE, MAX_NOTE, MAX_OPPONENT, MODE_LABELS, MODES, ParseKickoff } from "../../constants/Matchups";
import { MatchupError } from "../../services/MatchupService";

/**
 * /matchup - eintragen und ansehen, ohne die Webseite (Plan 28). Es gelten
 * dieselben Regeln wie dort; alle Antworten sieht nur, wer fragt.
 * Siehe docs/Matchups.md.
 */
export default class Matchup extends Command {
    constructor(client: BotClient) {
        super(client, {
            name: "matchup",
            description: "Matchups eintragen, anstehende und Ergebnisse ansehen",
            category: Category.User,
            cooldown: 3,
            developerOnly: false,
            module: MATCHUPS_MODULE,
        });

        this.data = new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .addSubcommand((sub) =>
                sub
                    .setName("neu")
                    .setDescription("Trägt ein neues Matchup ein")
                    .addStringOption((option) => option.setName("team").setDescription("Für welches Team").setRequired(true).setAutocomplete(true))
                    .addStringOption((option) => option.setName("gegner").setDescription("Gegen wen").setRequired(true).setMaxLength(MAX_OPPONENT))
                    .addStringOption((option) => option.setName("anpfiff").setDescription("Deutsche Zeit, etwa „morgen 20:00“ oder „Sa 18:00“").setRequired(true).setAutocomplete(true))
                    .addStringOption((option) => option.setName("liga").setDescription("Liga oder Turnier – leer heißt Freundschaftsspiel").setMaxLength(MAX_LEAGUE).setAutocomplete(true))
                    .addStringOption((option) =>
                        option
                            .setName("modus")
                            .setDescription("Ab Werk 3v3")
                            .addChoices(...MODES.map((mode) => ({ name: MODE_LABELS[mode], value: mode })))
                    )
                    .addIntegerOption((option) =>
                        option
                            .setName("bestof")
                            .setDescription("Best-of")
                            .addChoices(...BEST_OF.map((count) => ({ name: count ? `Bo${count}` : "offen", value: count })))
                    )
                    .addStringOption((option) => option.setName("stream").setDescription("Stream-Link, nur https://").setMaxLength(512))
                    .addStringOption((option) => option.setName("notiz").setDescription("Kurze Notiz").setMaxLength(MAX_NOTE))
            )
            .addSubcommand((sub) =>
                sub
                    .setName("liste")
                    .setDescription("Die nächsten Matchups")
                    .addStringOption((option) => option.setName("team").setDescription("Nur dieses Team").setAutocomplete(true))
            )
            .addSubcommand((sub) =>
                sub
                    .setName("ergebnisse")
                    .setDescription("Bilanz, Form und die letzten Ergebnisse")
                    .addStringOption((option) => option.setName("team").setDescription("Nur dieses Team").setAutocomplete(true))
            );
    }

    async AutoComplete(interaction: AutocompleteInteraction): Promise<void> {
        if (!interaction.inCachedGuild()) return;

        const focused = interaction.options.getFocused(true);
        const typed = focused.value.trim().toLowerCase();
        const service = this.client.matchupService;
        let choices: { name: string; value: string }[] = [];

        if (focused.name === "anpfiff") choices = KickoffSuggestions(focused.value, Date.now());

        if (focused.name === "liga") {
            const { leagues } = await service.Settings(interaction.guildId);

            choices = leagues.filter((league) => league.toLowerCase().includes(typed)).map((league) => ({ name: league, value: league }));
        }

        if (focused.name === "team") {
            // Eintragen nur für die eigenen Teams, ansehen darf man alle.
            const teams =
                interaction.options.getSubcommand() === "neu" ? (await service.Access(interaction.guild, interaction.member)).teams : await this.client.teams.AllOfGuild(interaction.guildId);

            choices = teams.filter((team) => team.name.toLowerCase().includes(typed)).map((team) => ({ name: team.name, value: String(team.id) }));
        }

        await interaction.respond(choices.slice(0, 25)).catch(() => undefined);
    }

    async Execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.inCachedGuild()) return;

        if (!(await this.client.settings.Of(interaction.guildId)).modules.includes(MATCHUPS_MODULE)) return this.Say(interaction, "Matchups sind auf diesem Server aus.");

        const service = this.client.matchupService;
        const what = interaction.options.getSubcommand();
        const teamId = await this.TeamId(interaction.guildId, interaction.options.getString("team"));

        try {
            if (what === "liste") return void (await interaction.reply(await service.ListView(interaction.guild, interaction.member, Date.now(), teamId)));
            if (what === "ergebnisse") return void (await interaction.reply(await service.ResultsView(interaction.guild, teamId)));

            await this.Create(interaction);
        } catch (error) {
            if (!(error instanceof MatchupError)) throw error;

            await this.Say(interaction, error.message);
        }
    }

    /**
     * Das Team aus dem Feld „team“: der gewählte Vorschlag trägt die ID. Wer den
     * Namen tippt, meint das Team mit genau diesem Namen, ohne Groß und klein (W-0027).
     */
    private async TeamId(guildId: string, raw: string | null): Promise<number | undefined> {
        const text = (raw ?? "").trim();

        if (!text) return undefined;
        if (/^\d+$/.test(text)) return Number(text);

        const teams = await this.client.teams.AllOfGuild(guildId).catch(() => []);

        return teams.find((team) => team.name.toLowerCase() === text.toLowerCase())?.id;
    }

    private async Say(interaction: ChatInputCommandInteraction, content: string, components: ActionRowBuilder<ButtonBuilder>[] = []): Promise<void> {
        if (interaction.deferred || interaction.replied) await interaction.editReply({ content, components, allowedMentions: { parse: [] } });
        else await interaction.reply({ content, components, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    }

    /** /matchup neu - ein gewählter Vorschlag trägt den Zeitpunkt („t:<ms>“), getippter Text wird gelesen. */
    private async Create(interaction: ChatInputCommandInteraction<"cached">): Promise<void> {
        const service = this.client.matchupService;
        const typed = interaction.options.getString("anpfiff") ?? "";
        const at = /^t:\d+$/.test(typed) ? Number(typed.slice(2)) : ParseKickoff(typed, Date.now());

        if (at === null) return this.Say(interaction, KICKOFF_HELP);

        // Die Ankündigung geht vorher raus - das kann dauern.
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const matchup = await service.Create(interaction.guild, interaction.member, {
            teamId: (await this.TeamId(interaction.guildId, interaction.options.getString("team"))) ?? null,
            opponent: interaction.options.getString("gegner") ?? "",
            at,
            league: interaction.options.getString("liga") ?? "",
            mode: interaction.options.getString("modus") ?? undefined,
            bestOf: interaction.options.getInteger("bestof") ?? 0,
            stream: interaction.options.getString("stream") ?? "",
            note: interaction.options.getString("notiz") ?? "",
        });
        const settings = await service.Settings(interaction.guildId);
        const page = service.PageUrl(interaction.guildId, settings);
        const buttons = [
            ...(page ? [new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Ändern").setURL(`${page}?partie=${matchup.id}`)] : []),
            new ButtonBuilder().setCustomId(`${MATCHUPS_PREFIX}:cancel:${matchup.id}`).setStyle(ButtonStyle.Danger).setLabel("Absagen"),
        ];

        await this.Say(
            interaction,
            settings.channelId ? `✅ Eingetragen. Die Ankündigung steht in <#${settings.channelId}>.` : "✅ Eingetragen.",
            [new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)]
        );
    }
}
