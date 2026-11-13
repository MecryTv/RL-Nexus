import { AutocompleteInteraction, ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import BotClient from "../../client/BotClient";
import Command from "../../structures/Command";
import Category from "../../enums/Category";
import { TEAMS_MODULE } from "../../constants/Teams";
import { AbsenceNote } from "../../builder/AbsenceView";

/**
 * /abmeldungen (W-0095): wer im Team fehlt, als Bild, nur für den Fragenden.
 * Captain-Rollen und wer „Server verwalten“ hat, sehen Grund und Notiz.
 * Siehe docs/Teams.md.
 */
export default class Absences extends Command {
    constructor(client: BotClient) {
        super(client, {
            name: "abmeldungen",
            description: "Zeigt, wer in deinem Team abgemeldet ist",
            category: Category.User,
            cooldown: 3,
            developerOnly: false,
            module: TEAMS_MODULE,
        });

        this.data = new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .addStringOption((option) => option.setName("team").setDescription("Welches Team? Leer: dein Team").setAutocomplete(true));
    }

    async AutoComplete(interaction: AutocompleteInteraction): Promise<void> {
        if (!interaction.inCachedGuild()) return;

        const typed = interaction.options.getFocused().trim().toLowerCase();
        const viewable = await this.client.absenceService.Viewable(interaction.guild, interaction.member).catch(() => []);
        const choices = viewable.filter((entry) => entry.team.name.toLowerCase().includes(typed)).map((entry) => ({ name: entry.team.name.slice(0, 100), value: String(entry.team.id) }));

        await interaction.respond(choices.slice(0, 25)).catch(() => undefined);
    }

    async Execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.inCachedGuild()) return;

        if (!(await this.client.settings.Of(interaction.guildId)).modules.includes(TEAMS_MODULE)) {
            return void (await interaction.reply(AbsenceNote("Die RL Team-Übersicht ist auf diesem Server aus.")));
        }

        await this.client.absenceService.List(interaction, await this.TeamId(interaction.guildId, interaction.options.getString("team")));
    }

    /** Der gewählte Vorschlag trägt die ID; wer den Namen tippt, meint das Team mit genau diesem Namen. */
    private async TeamId(guildId: string, raw: string | null): Promise<number | null> {
        const text = (raw ?? "").trim();

        if (!text) return null;
        if (/^\d+$/.test(text)) return Number(text);

        const teams = await this.client.teams.AllOfGuild(guildId).catch(() => []);

        return teams.find((team) => team.name.toLowerCase() === text.toLowerCase())?.id ?? -1;
    }
}
