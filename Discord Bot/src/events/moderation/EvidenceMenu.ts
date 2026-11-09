import { Events, Guild, Interaction, LabelBuilder, Message, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import { DetailView, DoneView, EvidenceId, IModView, ModErrorView, ReadEvidenceId, WithProblems } from "../../builder/ModerationView";
import { MAX_REASON } from "../../constants/Moderation";
import { ModerationError } from "../../services/ModerationService";
import { ActorOf } from "../../utils/modcommand";
import logger from "../../utils/logger";

/**
 * Das Menü von „Als Beweis sichern“ (mbw:…): Fall wählen, oder Knopf → Fenster
 * mit Grund → neue Verwarnung mit der Nachricht als Beweis. Kanal und Nachricht
 * stecken in der ID, die Nachricht wird erst beim Sichern geholt.
 */
export default class EvidenceMenu extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.InteractionCreate,
            description: "Menü und Fenster von „Als Beweis sichern“",
            once: false,
        });
    }

    async Execute(interaction: Interaction): Promise<void> {
        if (!(interaction.isStringSelectMenu() || interaction.isButton() || interaction.isModalSubmit()) || !interaction.inCachedGuild()) return;

        const target = ReadEvidenceId(interaction.customId);

        if (!target) return;

        const service = this.client.moderationService;
        const show = (view: IModView) => ({ ...view, flags: MessageFlags.IsComponentsV2 as const, allowedMentions: { parse: [] } });

        try {
            // Das Fenster muss sofort kommen - geprüft wird beim Absenden, wie alles darunter.
            if (target.kind === "warn" && interaction.isButton()) {
                await interaction.showModal(
                    new ModalBuilder()
                        .setCustomId(EvidenceId("grund", target.channelId, target.messageId))
                        .setTitle("Neue Verwarnung")
                        .addLabelComponents(
                            new LabelBuilder()
                                .setLabel("Grund")
                                .setTextInputComponent(
                                    new TextInputBuilder().setCustomId("grund").setStyle(TextInputStyle.Short).setMaxLength(MAX_REASON).setRequired(true).setPlaceholder("Steht im Fall, im Log und in der DM")
                                )
                        )
                );

                return;
            }

            // Aus dem Menü heraus ersetzt die Antwort das Menü. Erst bestätigen, dann die Team-Prüfung - sie fragt womöglich die Datenbank.
            if (interaction.isModalSubmit() && !interaction.isFromMessage()) await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            else await interaction.deferUpdate();

            await service.TeamGate(interaction.member);

            if (target.kind === "fall" && interaction.isStringSelectMenu()) {
                const message = await this.Message(interaction.guild, target);
                const { entry, problems } = await service.AddMessage(interaction.guild, ActorOf(interaction.member), Number(interaction.values[0]), message);

                await interaction.editReply(show(WithProblems(DetailView(entry, service.Link(entry)), problems)));
                return;
            }

            if (target.kind === "grund" && interaction.isModalSubmit()) {
                const message = await this.Message(interaction.guild, target);
                const request = { action: "warn" as const, targetId: message.author.id, reason: interaction.fields.getTextInputValue("grund") };
                const { entry, problems } = await service.ActWithProof(interaction.guild, interaction.member, request, "discord", { message });

                await interaction.editReply(show(DoneView(entry, entry.logMessage !== null, problems)));
            }
        } catch (error) {
            if (!(error instanceof ModerationError)) logger.error(`🛡️ Als Beweis sichern (${interaction.customId}) fehlgeschlagen`, error);

            const view = show(ModErrorView(error instanceof ModerationError ? error.message : "Da ging etwas schief – versuch es gleich nochmal."));

            if (interaction.deferred || interaction.replied) await interaction.editReply(view).catch(() => undefined);
            else await interaction.reply({ ...view, flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }).catch(() => undefined);
        }
    }

    private async Message(guild: Guild, target: { channelId: string; messageId: string }): Promise<Message> {
        const channel = guild.channels.cache.get(target.channelId) ?? (await guild.channels.fetch(target.channelId).catch(() => null));
        const message = channel?.isTextBased() ? await channel.messages.fetch(target.messageId).catch(() => null) : null;

        if (!message) throw new ModerationError("Die Nachricht gibt es nicht mehr.");

        return message;
    }
}
