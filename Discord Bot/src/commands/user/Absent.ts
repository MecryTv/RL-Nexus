import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import BotClient from "../../client/BotClient";
import Command from "../../structures/Command";
import Category from "../../enums/Category";
import { TEAMS_MODULE } from "../../constants/Teams";
import { AbsenceNote } from "../../builder/AbsenceView";

/**
 * /abmelden (W-0095): öffnet das Formular für eine Abmeldung. Wer schon etwas
 * eingetragen hat, sieht erst seine Abmeldungen. Das Team erkennt der Bot am
 * Kader. Siehe docs/Teams.md.
 */
export default class Absent extends Command {
    constructor(client: BotClient) {
        super(client, {
            name: "abmelden",
            description: "Melde dich bei deinem Team für einen Zeitraum ab",
            category: Category.User,
            cooldown: 3,
            developerOnly: false,
            module: TEAMS_MODULE,
        });

        this.data = new SlashCommandBuilder().setName(this.name).setDescription(this.description);
    }

    async Execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.inCachedGuild()) return;

        if (!(await this.client.settings.Of(interaction.guildId)).modules.includes(TEAMS_MODULE)) {
            return void (await interaction.reply(AbsenceNote("Die RL Team-Übersicht ist auf diesem Server aus.")));
        }

        await this.client.absenceService.Open(interaction);
    }
}
