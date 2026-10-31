import { ChatInputCommandInteraction, InteractionContextType, SlashCommandBuilder } from "discord.js";
import BotClient from "../../client/BotClient";
import Command from "../../structures/Command";
import Category from "../../enums/Category";
import { APPLY_MODULE } from "../../constants/Apply";

/**
 * /bewerben: derselbe Weg wie das Panel (Plan 24). Ein offenes Formular
 * startet sofort, bei mehreren kommt erst ein Menü. Bewirbt man sich auf der
 * Webseite, gibt es den Link. Siehe docs/Apply.md.
 */
export default class Apply extends Command {
    constructor(client: BotClient) {
        super(client, { name: "bewerben", description: "Bei diesem Server bewerben", category: Category.User, cooldown: 10, developerOnly: false, module: APPLY_MODULE });

        this.data = new SlashCommandBuilder().setName(this.name).setDescription(this.description).setContexts(InteractionContextType.Guild);
    }

    async Execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.inCachedGuild()) return;

        // Derselbe Weg wie der Knopf „Bei uns bewerben“ im Team-Hub (Plan 26).
        await this.client.applyService.flow.Entry(interaction);
    }
}
