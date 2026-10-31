import { Events, Interaction } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";

/** Knöpfe und Fenster von „Epic-Name geändert“ (epic:…), Plan 33. */
export default class EpicNameButtons extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.InteractionCreate,
            description: "Knopf und Fenster der DM „Epic-Name geändert?“",
            once: false,
        });
    }

    async Execute(interaction: Interaction): Promise<void> {
        if (!(interaction.isButton() || interaction.isModalSubmit()) || !interaction.customId.startsWith("epic:")) return;

        try {
            await this.client.epicNameService.OnButton(interaction);
        } catch (error) {
            const normalized = error instanceof Error ? error : new Error(String(error));

            await this.client.guardian.ReportError(normalized, interaction, `Epic-Name-Knopf: ${interaction.customId}`);
        }
    }
}
