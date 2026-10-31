import { Events, Interaction } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";

/** Knöpfe und Menüs an den Karten von Anti Villain (av:…). */
export default class AvButtons extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.InteractionCreate,
            description: "Freigeben, Bannen, Raid-Menü und mehr an den Karten von Anti Villain",
            once: false,
        });
    }

    async Execute(interaction: Interaction): Promise<void> {
        if (!(interaction.isButton() || interaction.isStringSelectMenu()) || !interaction.customId.startsWith("av:")) return;

        try {
            await this.client.antiVillainService.OnButton(interaction);
        } catch (error) {
            const normalized = error instanceof Error ? error : new Error(String(error));

            await this.client.guardian.ReportError(normalized, interaction, `Anti-Villain-Knopf: ${interaction.customId}`);
        }
    }
}
