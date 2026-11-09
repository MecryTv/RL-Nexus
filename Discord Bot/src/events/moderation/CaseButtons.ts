import { Events, Interaction, LabelBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import { EvidenceView, ReadCaseId } from "../../builder/ModerationCard";
import { DetailView, ModErrorView } from "../../builder/ModerationView";
import { CaseRef, MAX_NOTE } from "../../constants/Moderation";
import { ModerationError } from "../../services/ModerationService";
import { ActorOf } from "../../utils/modcommand";
import logger from "../../utils/logger";

/**
 * Die Knöpfe der Log-Karte (mf:…): „Alle ansehen“ mit Blättern und Menü,
 * „Fall“ und „Notiz“. Alles nur für das Moderations-Team und nur für den, der
 * klickt. Die Fallnummer steckt in der ID, so gehen sie auch nach einem Neustart.
 */
export default class CaseButtons extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.InteractionCreate,
            description: "Knöpfe der Log-Karte: Beweise, Fall, Notiz",
            once: false,
        });
    }

    async Execute(interaction: Interaction): Promise<void> {
        if (!(interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) || !interaction.inCachedGuild()) return;

        const target = ReadCaseId(interaction.customId);

        if (!target) return;

        const service = this.client.moderationService;
        const flags = MessageFlags.IsComponentsV2 as const;

        try {
            // Das Fenster muss sofort kommen - geprüft wird beim Absenden, wie alles darunter.
            if (target.kind === "notiz" && interaction.isButton()) {
                await interaction.showModal(
                    new ModalBuilder()
                        .setCustomId(`mf:notiz:${target.number}`)
                        .setTitle(`Notiz an Fall ${CaseRef(target.number)}`)
                        .addLabelComponents(
                            new LabelBuilder()
                                .setLabel("Notiz")
                                .setTextInputComponent(new TextInputBuilder().setCustomId("text").setStyle(TextInputStyle.Paragraph).setMaxLength(MAX_NOTE).setRequired(true).setPlaceholder("Nur das Team sieht sie"))
                        )
                );

                return;
            }

            // In der eigenen Ansicht blättern: ersetzen. Von der Log-Karte aus: eine Antwort nur für den Klickenden.
            const inPlace = !interaction.isModalSubmit() && interaction.message.flags.has(MessageFlags.Ephemeral);

            if (inPlace) await interaction.deferUpdate();
            else await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            // Erst nach dem Bestätigen: die Prüfung fragt womöglich die Datenbank, Discord wartet nur drei Sekunden.
            await service.TeamGate(interaction.member);

            let entry = await service.CaseOf(interaction.guildId, target.number);

            if (target.kind === "ev") {
                const index = interaction.isStringSelectMenu() ? Number(interaction.values[0]) : (target.index ?? 0);
                const item = entry.evidence[Math.min(Math.max(0, index), entry.evidence.length - 1)];
                const file = item ? await service.EvidenceFile(entry, item) : null;
                const view = await EvidenceView(entry, index, { link: service.Link(entry), file });

                await interaction.editReply({ ...view, attachments: [], flags, allowedMentions: { parse: [] } });
                return;
            }

            if (target.kind === "notiz" && interaction.isModalSubmit()) {
                entry = await service.AddNote(interaction.guildId, ActorOf(interaction.member), target.number, interaction.fields.getTextInputValue("text"));
            }

            await interaction.editReply({ ...DetailView(entry, service.Link(entry)), attachments: [], flags, allowedMentions: { parse: [] } });
        } catch (error) {
            if (!(error instanceof ModerationError)) logger.error(`🛡️ Log-Karte (${interaction.customId}) fehlgeschlagen`, error);

            const view = { ...ModErrorView(error instanceof ModerationError ? error.message : "Da ging etwas schief – versuch es gleich nochmal."), allowedMentions: { parse: [] } };

            if (interaction.deferred || interaction.replied) await interaction.editReply({ ...view, flags }).catch(() => undefined);
            else await interaction.reply({ ...view, flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }).catch(() => undefined);
        }
    }
}
