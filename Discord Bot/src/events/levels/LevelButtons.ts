import { Events, Interaction } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import { HandleBoardButton } from "../../services/levels/BoardMessage";

/** Knöpfe unter dem Ranglisten-Bild (lv:…): Zeitraum, Blättern, Meine Seite (Plan 34). */
export default class LevelButtons extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.InteractionCreate,
            description: "Knöpfe der Rangliste von /level rangliste",
            once: false,
        });
    }

    async Execute(interaction: Interaction): Promise<void> {
        if (!interaction.isButton() || !interaction.customId.startsWith("lv:")) return;

        try {
            await HandleBoardButton(this.client, interaction);
        } catch (error) {
            const normalized = error instanceof Error ? error : new Error(String(error));

            await this.client.guardian.ReportError(normalized, interaction, `Ranglisten-Knopf: ${interaction.customId}`);
        }
    }
}
