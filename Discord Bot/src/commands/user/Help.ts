import { AutocompleteInteraction, ChatInputCommandInteraction, InteractionContextType, MessageFlags, SlashCommandBuilder } from "discord.js";
import BotClient from "../../client/BotClient";
import Command from "../../structures/Command";
import Category from "../../enums/Category";
import { HelpCommandView } from "../../builder/HelpView";

/** /hilfe: alle Befehle erklärt, nur für den, der fragt (W-0014, Plan 45). Siehe docs/Help.md. */
export default class Help extends Command {
    constructor(client: BotClient) {
        super(client, { name: "hilfe", description: "Erklärt alle Befehle des Bots", category: Category.User, cooldown: 3, developerOnly: false, module: "dashboard" });

        this.data = new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .setContexts(InteractionContextType.Guild)
            .addStringOption((option) => option.setName("befehl").setDescription("Springt direkt zu einem Befehl, etwa timeout oder fall beweis").setAutocomplete(true).setMaxLength(100));
    }

    async AutoComplete(interaction: AutocompleteInteraction): Promise<void> {
        const help = this.client.helpService;

        await interaction.respond(help.Suggest(interaction.options.getFocused(), help.IsDeveloper(interaction.user.id)));
    }

    async Execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.inCachedGuild()) return;

        const help = this.client.helpService;
        const developer = help.IsDeveloper(interaction.user.id);
        const wanted = interaction.options.getString("befehl");

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        if (wanted) {
            const found = help.Find(wanted, developer);

            if (!found) {
                await interaction.editReply({ content: `Einen Befehl „${wanted.slice(0, 80)}“ gibt es nicht. Tipp \`/hilfe\` für alle Befehle.`, allowedMentions: { parse: [] } });

                return;
            }

            const { flags: _flags, ...page } = HelpCommandView(found.entry, found.key, 0, await help.Context(interaction.guild));

            await interaction.editReply({ ...page, flags: MessageFlags.IsComponentsV2 });

            return;
        }

        const { flags: _flags, ...start } = await help.Start(interaction.guild, interaction.member.displayName, developer);

        await interaction.editReply({ ...start, flags: MessageFlags.IsComponentsV2 });
    }
}
