import { Events, Interaction, MessageFlags } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import { InfoCard } from "../../builder/CommunityView";
import { SUPPORT_ACCENT, SUPPORT_PREFIX } from "../../constants/Moderation";

/**
 * Die Knöpfe „Übernehmen“ und „Zu mir holen“ unter der Meldung des
 * Support-Warteraums. Die Antwort sieht nur, wer geklickt hat; die Meldung
 * selbst wird umgeschrieben, damit der Rest des Teams sieht, wer sich kümmert.
 */
export default class VoiceSupportClaim extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.InteractionCreate,
            description: "Übernimmt jemanden aus dem Support-Warteraum",
            once: false,
        });
    }

    async Execute(interaction: Interaction): Promise<void> {
        if (!interaction.isButton()) return;
        if (!interaction.customId.startsWith(`${SUPPORT_PREFIX}:`)) return;

        try {
            const answer = await this.client.supportService.Claim(interaction);

            await interaction.reply({ ...InfoCard(answer, SUPPORT_ACCENT), flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        } catch (error) {
            const normalized = error instanceof Error ? error : new Error(String(error));

            await this.client.guardian.ReportError(normalized, interaction, `Warteraum: ${interaction.customId}`);
        }
    }
}
