import {
    ChatInputCommandInteraction,
    ContainerBuilder,
    InteractionContextType,
    LabelBuilder,
    MessageFlags,
    ModalBuilder,
    SlashCommandBuilder,
    TextInputBuilder,
    TextInputStyle,
} from "discord.js";
import BotClient from "../../client/BotClient";
import Command from "../../structures/Command";
import Category from "../../enums/Category";
import ComponentV2Builder from "../../builder/ComponentV2Builder";
import { REPORT_LIMITS, REPORT_MAIL, SUPPORT_DISCORD } from "../../constants/Report";
import { ReportError } from "../../services/ReportService";

const ACCENT = "#ff1e2d";

/** Wie lange das Formular offen bleiben darf, bevor die Antwort verfällt. */
const FORM_TIME = 15 * 60 * 1000;

/**
 * /fehler: ein Formular, das als Mail an support@nexus-emb.de geht - derselbe
 * Weg wie das Pop-up im Dashboard. Geht auf jedem Server und in der DM an den Bot.
 */
export default class Report extends Command {
    constructor(client: BotClient) {
        super(client, { name: "fehler", description: "Einen Fehler an das RL Nexus Team melden", category: Category.User, cooldown: 30, developerOnly: false, module: "dashboard" });

        this.data = new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM);
    }

    private Card(text: string): { components: ContainerBuilder[] } {
        return {
            components: [
                new ComponentV2Builder({ accentColor: ACCENT })
                    .text(text)
                    .buttons({ url: SUPPORT_DISCORD, label: "Support-Server", emoji: "💬" })
                    .build(),
            ],
        };
    }

    async Execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const id = `report:${interaction.id}`;
        const input = (custom: string, label: string, style: TextInputStyle, max: number, required: boolean, placeholder: string) =>
            new LabelBuilder()
                .setLabel(label)
                .setTextInputComponent(
                    new TextInputBuilder().setCustomId(custom).setStyle(style).setMaxLength(max).setRequired(required).setPlaceholder(placeholder)
                );

        await interaction.showModal(
            new ModalBuilder()
                .setCustomId(id)
                .setTitle("Fehler melden")
                .addLabelComponents(
                    input("subject", "Worum geht es?", TextInputStyle.Short, REPORT_LIMITS.subject, true, "z. B. Ticket-Panel lässt sich nicht senden"),
                    input("message", "Was ist passiert?", TextInputStyle.Paragraph, REPORT_LIMITS.message, true, "Was hast du erwartet, was kam stattdessen?"),
                    input("context", "Wo und wie?", TextInputStyle.Paragraph, REPORT_LIMITS.context, false, "Modul, Kanal, was du davor getan hast"),
                    input("contact", "E-Mail für die Antwort (freiwillig)", TextInputStyle.Short, REPORT_LIMITS.contact, false, "Ohne Angabe melden wir uns über Discord")
                )
        );

        const submitted = await interaction
            .awaitModalSubmit({ time: FORM_TIME, filter: (entry) => entry.customId === id && entry.user.id === interaction.user.id })
            .catch(() => null);

        if (!submitted) return;

        await submitted.deferReply({ flags: MessageFlags.Ephemeral });

        const field = (custom: string): string => submitted.fields.getTextInputValue(custom) ?? "";
        const service = this.client.reportService;

        try {
            const report = service.Clean(
                { subject: field("subject"), message: field("message"), context: field("context"), contact: field("contact") },
                true
            );

            await service.Send(
                {
                    ...report,
                    source: "discord",
                    user: { id: interaction.user.id, name: `@${interaction.user.username}` },
                    guild: interaction.guild ? { id: interaction.guild.id, name: interaction.guild.name } : null,
                    page: null,
                },
                interaction.user.id
            );

            await submitted.editReply({
                ...this.Card("✅ Danke, deine Meldung ist angekommen. Wir melden uns, sobald wir mehr wissen."),
                flags: MessageFlags.IsComponentsV2,
            });
        } catch (error) {
            const text =
                error instanceof ReportError && error.status === 400
                    ? `❌ ${error.message}`
                    : error instanceof ReportError && error.status === 429
                      ? `⏳ ${error.message}`
                      : `Die Meldung ließ sich gerade nicht verschicken. Schreib uns bitte im Support-Server oder an ${REPORT_MAIL}.`;

            await submitted.editReply({ ...this.Card(text), flags: MessageFlags.IsComponentsV2 });
        }
    }
}
