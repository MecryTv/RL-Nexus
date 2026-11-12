import { AutocompleteInteraction, ChatInputCommandInteraction, InteractionContextType, SlashCommandBuilder } from "discord.js";
import BotClient from "../../client/BotClient";
import Command from "../../structures/Command";
import Category from "../../enums/Category";
import { MAX_REASON, MAX_TIMEOUT } from "../../constants/Moderation";
import { ReadDuration, RunAction, SuggestDuration } from "../../utils/modcommand";

export default class Timeout extends Command {
    constructor(client: BotClient) {
        super(client, { name: "timeout", description: "Schaltet einen User stumm", category: Category.Moderation, cooldown: 3, developerOnly: false, module: "moderation" });

        this.data = new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .setContexts(InteractionContextType.Guild)
            .addUserOption((option) => option.setName("user").setDescription("Wen?").setRequired(true))
            .addStringOption((option) =>
                option.setName("dauer").setDescription("Wie lange? Etwa 10m, 2h oder 1d, höchstens 28 Tage").setRequired(true).setAutocomplete(true)
            )
            .addStringOption((option) => option.setName("grund").setDescription("Warum? Steht im Log und in der DM").setMaxLength(MAX_REASON))
            .addAttachmentOption((option) => option.setName("beweis").setDescription("Ein Screenshot als Beweis: PNG, JPG, GIF oder WebP"))
            .addStringOption((option) => option.setName("beweislink").setDescription("Ein https-Link oder Nachrichtenlink als Beweis").setMaxLength(500));
    }

    async AutoComplete(interaction: AutocompleteInteraction): Promise<void> {
        await SuggestDuration(interaction, false, MAX_TIMEOUT);
    }

    async Execute(interaction: ChatInputCommandInteraction): Promise<void> {
        await RunAction(this.client, interaction, () => ({
            action: "timeout",
            targetId: interaction.options.getUser("user", true).id,
            duration: ReadDuration(interaction.options.getString("dauer", true), false),
            reason: interaction.options.getString("grund"),
        }));
    }
}
