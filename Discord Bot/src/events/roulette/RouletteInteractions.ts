import { Events, Interaction } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import { ROULETTE_PREFIX } from "../../constants/RocketRoulette";

/**
 * Knöpfe und Auswahlen von Rocket Roulette (W-0087). Sie tragen Abend, Runde
 * und Lobby in der ID und wirken deshalb auch nach einem Neustart.
 */
export default class RouletteInteractions extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.InteractionCreate,
            description: "Knöpfe und Auswahlen von Rocket Roulette",
            once: false,
        });
    }

    async Execute(interaction: Interaction): Promise<void> {
        if (!(interaction.isButton() || interaction.isUserSelectMenu() || interaction.isStringSelectMenu()) || !interaction.customId.startsWith(`${ROULETTE_PREFIX}:`)) return;

        try {
            await this.client.rouletteService.Handle(interaction);
        } catch (error) {
            const normalized = error instanceof Error ? error : new Error(String(error));

            await this.client.guardian.ReportError(normalized, interaction, `Rocket-Roulette: ${interaction.customId}`);
        }
    }
}
