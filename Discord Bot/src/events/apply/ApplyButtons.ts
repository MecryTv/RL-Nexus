import { Events, Interaction } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import { APPLY_PREFIX } from "../../constants/Apply";

/** Annehmen und Ablehnen an der Karte im Team-Kanal. */
export default class ApplyButtons extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.InteractionCreate,
            description: "Entscheidet Bewerbungen direkt an der Karte",
            once: false,
        });
    }

    async Execute(interaction: Interaction): Promise<void> {
        if (!interaction.isButton() || !interaction.customId.startsWith(`${APPLY_PREFIX}:`)) return;

        try {
            await this.client.applyService.Handle(interaction);
        } catch (error) {
            const normalized = error instanceof Error ? error : new Error(String(error));

            await this.client.guardian.ReportError(normalized, interaction, `Bewerbungs-Knopf: ${interaction.customId}`);
        }
    }
}
