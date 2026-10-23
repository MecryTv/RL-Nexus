import { Events, Interaction } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import { LFT_PREFIX } from "../../constants/Lft";

/**
 * Die Knöpfe am Beitrag im Forum und an der Meldung ans Team: Suche beenden und
 * Beitrag löschen. Sie tragen die ID der Anfrage und funktionieren deshalb auch
 * Wochen später noch.
 */
export default class LftButtons extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.InteractionCreate,
            description: "Beendet und löscht Looking-for-Anfragen an der Nachricht",
            once: false,
        });
    }

    async Execute(interaction: Interaction): Promise<void> {
        if (!interaction.isButton() || !interaction.customId.startsWith(`${LFT_PREFIX}:`)) return;

        try {
            await this.client.lookingForService.Handle(interaction);
        } catch (error) {
            const normalized = error instanceof Error ? error : new Error(String(error));

            await this.client.guardian.ReportError(normalized, interaction, `Looking-for-Knopf: ${interaction.customId}`);
        }
    }
}
