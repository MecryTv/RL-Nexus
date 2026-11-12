import { ApplicationCommandType, ChatInputCommandInteraction, ContextMenuCommandBuilder, InteractionContextType, Message, MessageContextMenuCommandInteraction, MessageFlags } from "discord.js";
import BotClient from "../../client/BotClient";
import Command from "../../structures/Command";
import Category from "../../enums/Category";
import { IEvidencePreview, IModView, ModErrorView, SaveEvidenceView } from "../../builder/ModerationView";
import { ModerationError } from "../../services/ModerationService";
import logger from "../../utils/logger";

function PreviewOf(message: Message): IEvidencePreview {
    return {
        channelId: message.channelId,
        messageId: message.id,
        authorName: message.member?.displayName ?? message.author.username,
        channelName: "name" in message.channel ? (message.channel.name ?? "") : "",
        content: message.content,
        sentAt: message.createdTimestamp,
    };
}

/**
 * Rechtsklick auf eine Nachricht › Apps › „Als Beweis sichern“ (W-0014). Nur
 * der Klickende sieht das Menü: an einen Fall des Verfassers hängen oder gleich
 * eine Verwarnung damit. Weiter geht es in events/moderation/EvidenceMenu.ts.
 */
export default class SaveEvidence extends Command {
    constructor(client: BotClient) {
        super(client, { name: "Als Beweis sichern", description: "Eine Nachricht als Beweis an einen Fall hängen", category: Category.Moderation, cooldown: 3, developerOnly: false, module: "moderation" });

        this.data = new ContextMenuCommandBuilder().setName(this.name).setType(ApplicationCommandType.Message).setContexts(InteractionContextType.Guild);
    }

    async Execute(_interaction: ChatInputCommandInteraction): Promise<void> {}

    async ExecuteMessage(interaction: MessageContextMenuCommandInteraction): Promise<void> {
        const say = (view: IModView) => interaction.editReply({ ...view, flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });

        try {
            // Erst bestätigen: Team-Prüfung und Fall-Liste fragen womöglich die Datenbank, Discord wartet nur drei Sekunden.
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            if (!interaction.inCachedGuild()) throw new ModerationError("Das geht nur auf einem Server.");

            await this.client.moderationService.TeamGate(interaction.member);

            const message = interaction.targetMessage;
            const cases = await this.client.modCases.List(interaction.guildId, { targetId: message.author.id }, null, 25);

            await say(SaveEvidenceView(PreviewOf(message), cases));
        } catch (error) {
            if (!(error instanceof ModerationError)) logger.error("🛡️ Als Beweis sichern fehlgeschlagen", error);

            await say(ModErrorView(error instanceof ModerationError ? error.message : "Da ging etwas schief. Versuch es gleich nochmal.")).catch(() => undefined);
        }
    }
}
