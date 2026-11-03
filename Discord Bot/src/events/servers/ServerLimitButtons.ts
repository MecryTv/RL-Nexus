import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    Events,
    Interaction,
    LabelBuilder,
    MessageFlags,
    ModalBuilder,
    StringSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle,
} from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import { AskServers, IServerReply, SERVERS_UNREACHABLE } from "../../utils/servers";

/**
 * Die DMs von „ein Server pro Person“ (W-0064): Freigabe oder Wechsel
 * anfragen (mit Grund im Fenster), den Server wählen, die Wahl zurücknehmen,
 * einen zweiten Server anfragen. Entschieden wird im Admin Dashboard
 * (ADMIN_INTERNAL_URL/internal/servers/*), der Bot zeigt nur die Antwort.
 */

export type ServerAction =
    | { kind: "ask"; type: "extra" | "switch"; guildId: string }
    | { kind: "modal"; type: "extra" | "switch"; guildId: string }
    | { kind: "pick" }
    | { kind: "morepick" }
    | { kind: "undo" }
    | { kind: "more" }
    | { kind: "remind" };

const ID = /^\d{17,20}$/;

/** Liest eine customId der DMs. null: gehört nicht hierher. */
export function ParseServerId(customId: string): ServerAction | null {
    const [prefix, kind, type, guildId] = customId.split(":");
    if (prefix !== "sv") return null;

    if (kind === "ask" || kind === "modal") return (type === "extra" || type === "switch") && ID.test(guildId ?? "") ? { kind, type, guildId: guildId! } : null;
    if (kind === "pick" || kind === "morepick" || kind === "undo" || kind === "more" || kind === "remind") return type === undefined ? { kind } : null;

    return null;
}

function Menu(customId: string, placeholder: string, options: NonNullable<IServerReply["options"]>): ActionRowBuilder<StringSelectMenuBuilder> {
    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(customId)
            .setPlaceholder(placeholder)
            .addOptions(options.slice(0, 25).map((option) => ({ label: option.name.slice(0, 100), value: option.id, description: `${option.members.toLocaleString("de-DE")} Mitglieder · du bist ${option.role}`.slice(0, 100) })))
    );
}

function ReasonModal(type: "extra" | "switch", guildId: string): ModalBuilder {
    const input = new TextInputBuilder().setCustomId("reason").setStyle(TextInputStyle.Paragraph).setRequired(true).setMinLength(3).setMaxLength(300);

    return new ModalBuilder()
        .setCustomId(`sv:modal:${type}:${guildId}`)
        .setTitle(type === "extra" ? "Freigabe anfragen" : "Wechsel anfragen")
        .addLabelComponents(
            new LabelBuilder()
                .setLabel(type === "extra" ? "Wofür brauchst du den zweiten Server?" : "Warum soll das dein Hauptserver werden?")
                .setDescription("Das Team liest das und entscheidet.")
                .setTextInputComponent(input)
        );
}

export default class ServerLimitButtons extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.InteractionCreate,
            description: "Knöpfe und Menüs der DMs zu „ein Server pro Person“",
            once: false,
        });
    }

    private async Ask(userId: string, path: string, body: Record<string, unknown> = {}): Promise<IServerReply> {
        const base = this.client.config.ADMIN_INTERNAL_URL;
        if (!base) return { message: SERVERS_UNREACHABLE };

        const { reply, error } = await AskServers(base, this.client.config.SERVER_JWT_SECRET, `discord:${userId}`, path, body);

        return reply ?? { message: error ?? SERVERS_UNREACHABLE };
    }

    async Execute(interaction: Interaction): Promise<void> {
        if (!interaction.isButton() && !interaction.isStringSelectMenu() && !interaction.isModalSubmit()) return;

        const action = ParseServerId(interaction.customId);
        if (!action) return;

        try {
            // Fenster müssen sofort aufgehen, ohne vorher zu warten.
            if (action.kind === "ask" && interaction.isButton()) return void (await interaction.showModal(ReasonModal(action.type, action.guildId)));

            if (action.kind === "morepick" && interaction.isStringSelectMenu()) {
                const guildId = interaction.values[0] ?? "";

                if (ID.test(guildId)) await interaction.showModal(ReasonModal("extra", guildId));

                return;
            }

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const userId = interaction.user.id;

            if (action.kind === "modal" && interaction.isModalSubmit()) {
                const reply = await this.Ask(userId, "request", { guildId: action.guildId, kind: action.type, reason: interaction.fields.getTextInputValue("reason") });

                await interaction.editReply({ content: reply.message });

                return;
            }

            if (action.kind === "pick" && interaction.isStringSelectMenu()) {
                const reply = await this.Ask(userId, "choose", { guildId: interaction.values[0] ?? "" });
                const undo = new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId("sv:undo").setStyle(ButtonStyle.Secondary).setLabel("Doch anders wählen"));

                await interaction.editReply({ content: reply.message, components: reply.undo ? [undo] : [] });

                return;
            }

            if (action.kind === "undo" || action.kind === "remind" || action.kind === "more") {
                const reply = await this.Ask(userId, action.kind === "undo" ? "undo" : "options");
                const options = reply.options ?? [];
                const more = action.kind === "more";
                const content = more ? "Für welchen Server möchtest du eine Freigabe? Danach fragt RL Nexus nach dem Grund." : action.kind === "remind" ? "Welcher Server soll bleiben?" : reply.message;

                await interaction.editReply({
                    content: options.length ? content : reply.message,
                    components: options.length ? [Menu(more ? "sv:morepick" : "sv:pick", more ? "Server für die Freigabe" : "Welcher Server soll bleiben?", options)] : [],
                });
            }
        } catch (error) {
            const normalized = error instanceof Error ? error : new Error(String(error));

            await this.client.guardian.ReportError(normalized, interaction, `Ein Server pro Person: ${interaction.customId}`);
        }
    }
}
