import { Events, Interaction } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import { SELF_ROLE_PREFIX } from "../../constants/SelfRoles";

/** Die Knöpfe und das Auswahlmenü unter einem Self-Role-Panel. */
export default class SelfRoleClicks extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.InteractionCreate,
            description: "Vergibt die Rollen aus den Self-Role-Panels",
            once: false,
        });
    }

    async Execute(interaction: Interaction): Promise<void> {
        if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;
        if (!interaction.customId.startsWith(`${SELF_ROLE_PREFIX}:`)) return;

        try {
            await this.client.selfRoleService.Handle(interaction);
        } catch (error) {
            const normalized = error instanceof Error ? error : new Error(String(error));

            await this.client.guardian.ReportError(normalized, interaction, `Self-Role-Panel: ${interaction.customId}`);
        }
    }
}
