import { Events, Interaction } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";

/** Knöpfe, Menüs und das Fenster der Staff-Freigabe in der DM (sg:…, W-0011). */
export default class StaffGrantButtons extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.InteractionCreate,
            description: "Antworten auf eine Anfrage vom RL Nexus Staff",
            once: false,
        });
    }

    async Execute(interaction: Interaction): Promise<void> {
        if (!(interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) || !interaction.customId.startsWith("sg:")) return;

        try {
            await this.client.staffGrantService.dm?.OnInteraction?.(interaction);
        } catch (error) {
            const normalized = error instanceof Error ? error : new Error(String(error));

            await this.client.guardian.ReportError(normalized, interaction, `Staff-Freigabe: ${interaction.customId}`);
        }
    }
}
