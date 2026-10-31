import { Events, Interaction } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import { LFT_FLOW_PREFIX, LFT_PREFIX } from "../../constants/Lft";

/**
 * Die Knöpfe am Beitrag im Forum und an der Meldung ans Team: Suche beenden und
 * Beitrag löschen. Sie tragen die ID der Anfrage und funktionieren deshalb auch
 * Wochen später noch. Dazu die Knöpfe im Panel und alles, was zum Fragen im
 * Fenster gehört (Plan 30).
 */
export default class LftButtons extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.InteractionCreate,
            description: "Startet Looking-for-Suchen und beendet und löscht Anfragen an der Nachricht",
            once: false,
        });
    }

    async Execute(interaction: Interaction): Promise<void> {
        const flow = (interaction.isButton() || interaction.isModalSubmit()) && interaction.customId.startsWith(`${LFT_FLOW_PREFIX}:`) ? interaction : null;

        if (!flow && (!interaction.isButton() || !interaction.customId.startsWith(`${LFT_PREFIX}:`))) return;

        try {
            if (flow) await this.client.lookingForService.modal.Handle(flow);
            else if (interaction.isButton()) await this.client.lookingForService.Handle(interaction);
        } catch (error) {
            const normalized = error instanceof Error ? error : new Error(String(error));
            const customId = flow?.customId ?? (interaction.isButton() ? interaction.customId : "");

            await this.client.guardian.ReportError(normalized, interaction, `Looking-for-Knopf: ${customId}`);
        }
    }
}
