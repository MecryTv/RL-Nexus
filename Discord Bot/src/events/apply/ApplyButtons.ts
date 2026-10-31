import { Events, Interaction } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import { APPLY_FLOW_PREFIX, APPLY_PREFIX } from "../../constants/Apply";

/**
 * Annehmen und Ablehnen an der Karte im Team-Kanal - und alles, was zum
 * Bewerben in Discord gehört: Panel, Menü, Fenster, Knöpfe in der DM (Plan 24).
 */
export default class ApplyButtons extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.InteractionCreate,
            description: "Entscheidet Bewerbungen an der Karte und führt durchs Bewerben in Discord",
            once: false,
        });
    }

    async Execute(interaction: Interaction): Promise<void> {
        const flow =
            (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) && interaction.customId.startsWith(`${APPLY_FLOW_PREFIX}:`)
                ? interaction
                : null;

        if (!flow && (!interaction.isButton() || !interaction.customId.startsWith(`${APPLY_PREFIX}:`))) return;

        try {
            if (flow) await this.client.applyService.flow.Handle(flow);
            else if (interaction.isButton()) await this.client.applyService.Handle(interaction);
        } catch (error) {
            const normalized = error instanceof Error ? error : new Error(String(error));
            const customId = flow?.customId ?? (interaction.isButton() ? interaction.customId : "");

            await this.client.guardian.ReportError(normalized, interaction, `Bewerbungs-Knopf: ${customId}`);
        }
    }
}
