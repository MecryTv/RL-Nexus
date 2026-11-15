import { ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import BotClient from "../../client/BotClient";
import Command from "../../structures/Command";
import Category from "../../enums/Category";
import { NewPanelState, PanelStates, RenderPanel } from "../../builder/GalleryPanel";

export default class Gallery extends Command {
    constructor(client: BotClient) {
        super(client, {
            name: "gallery",
            description: "Öffnet die Bild-Verwaltung: ansehen, hochladen, verschieben, löschen",
            category: Category.Admin,
            cooldown: 5,
            developerOnly: false,
            module: "gallery",
        });

        this.data = new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
    }

    async Execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.guildId || !interaction.guild) return;
        // W-0120: Die Standardrechte des Befehls lassen sich in den Integrationen ändern - darum hier noch einmal.
        if (interaction.user.id !== interaction.guild.ownerId && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return void (await interaction.reply({ content: "Die Bild-Verwaltung ist nur für Administratoren.", flags: MessageFlags.Ephemeral }));
        }

        const state = NewPanelState(interaction.guildId);
        const view = await RenderPanel(this.client, state);

        const response = await interaction.reply({
            ...view,
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            withResponse: true,
        });

        const message = response.resource?.message;
        if (message) PanelStates.set(message.id, state);
    }
}
