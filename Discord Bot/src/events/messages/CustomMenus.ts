import { Events, Interaction, MessageFlags } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import { InfoCard } from "../../builder/CommunityView";
import { MESSAGE_ACCENT, MESSAGE_PREFIX } from "../../constants/Messages";
import { MessageError } from "../../services/MessageService";

/** W-0091: die Auswahlmenüs unter einer eigenen Nachricht: Text, Rolle, Link oder eine gespeicherte Nachricht. */
export default class CustomMenus extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.InteractionCreate,
            description: "Bedient die Auswahlmenüs unter eigenen Nachrichten",
            once: false,
        });
    }

    async Execute(interaction: Interaction): Promise<void> {
        if (!interaction.isStringSelectMenu() || !interaction.customId.startsWith(`${MESSAGE_PREFIX}:menu:`)) return;
        if (!interaction.inCachedGuild()) return;

        const [, , id, menuId] = interaction.customId.split(":");

        try {
            await this.client.messageService.Menu(interaction, Number(id), menuId ?? "");
        } catch (error) {
            const text = error instanceof MessageError ? error.message : "Das hat nicht geklappt.";
            const payload = { ...InfoCard(text, MESSAGE_ACCENT), flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral } as const;

            if (!interaction.replied && !interaction.deferred) await interaction.reply(payload).catch(() => undefined);
            else await interaction.followUp(payload).catch(() => undefined);

            if (!(error instanceof MessageError)) {
                const normalized = error instanceof Error ? error : new Error(String(error));

                await this.client.guardian.ReportError(normalized, interaction, `Custom-Message-Menü: ${interaction.customId}`);
            }
        }
    }
}
