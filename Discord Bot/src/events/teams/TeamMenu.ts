import { Events, Interaction } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import { TEAMS_PREFIX } from "../../constants/Teams";

/** Das Auswahlmenü unter der Team-Übersicht. */
export default class TeamMenu extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.InteractionCreate,
            description: "Zeigt das gewählte Team aus der Übersicht",
            once: false,
        });
    }

    async Execute(interaction: Interaction): Promise<void> {
        if (!interaction.isStringSelectMenu()) return;
        // teams:menu bis 25 Teams, teams:menu:<n> darüber (Plan 26).
        if (interaction.customId !== `${TEAMS_PREFIX}:menu` && !interaction.customId.startsWith(`${TEAMS_PREFIX}:menu:`)) return;

        try {
            await this.client.teamService.Handle(interaction);
        } catch (error) {
            const normalized = error instanceof Error ? error : new Error(String(error));

            await this.client.guardian.ReportError(normalized, interaction, `Team-Übersicht: ${interaction.customId}`);
        }
    }
}
