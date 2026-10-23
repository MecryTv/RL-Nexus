import { Events, Interaction } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import { SIXMANS_PREFIX } from "../../constants/SixMans";

/**
 * Die Knöpfe von 6Mans: beitreten, verlassen, Ergebnis melden und abbrechen.
 * Sie tragen die ID der Runde und funktionieren deshalb auch nach einem
 * Neustart - die Warteschlange selbst ist dann allerdings leer.
 */
export default class SixMansButtons extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.InteractionCreate,
            description: "Warteschlange und Ergebnisse von RL 6Mans",
            once: false,
        });
    }

    async Execute(interaction: Interaction): Promise<void> {
        if (!interaction.isButton() || !interaction.customId.startsWith(`${SIXMANS_PREFIX}:`)) return;

        try {
            await this.client.sixMansService.Handle(interaction);
        } catch (error) {
            const normalized = error instanceof Error ? error : new Error(String(error));

            await this.client.guardian.ReportError(normalized, interaction, `6Mans-Knopf: ${interaction.customId}`);
        }
    }
}
