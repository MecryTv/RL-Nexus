import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    MessageActionRowComponentBuilder,
    MessageFlags,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
} from "discord.js";
import BotClient from "../client/BotClient";
import { CustomMessageView, ICustomView } from "./CustomView";
import { MAX_DESCRIPTION, MAX_LABEL, SELF_ROLE_PREFIX } from "../constants/SelfRoles";
import { ISelfRole, ISelfRolePanel } from "../interfaces/services/selfroles/ISelfRoles";

/**
 * Ein Self-Role-Panel als Nachricht: oben der Kopf (Karte, Embed oder Text -
 * derselbe Bau wie bei Custom Message), darunter die Rollen als Knopfreihen
 * oder als Auswahlmenü.
 *
 * Die Custom-ID trägt Panel und Rolle und übersteht deshalb jeden Neustart:
 * selfrole:<panel>:<rolle> für einen Knopf, selfrole:menu:<panel> für das Menü.
 */

const STYLES: Record<string, ButtonStyle> = {
    primary: ButtonStyle.Primary,
    secondary: ButtonStyle.Secondary,
    success: ButtonStyle.Success,
    danger: ButtonStyle.Danger,
};

/** Was auf dem Knopf steht - der eigene Text, sonst der Name der Rolle. */
export function LabelOf(role: ISelfRole, nameOf: (id: string) => string): string {
    return (role.label.trim() || nameOf(role.roleId)).slice(0, MAX_LABEL);
}

export function PanelRows(panel: ISelfRolePanel, nameOf: (id: string) => string): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
    const roles = panel.roles.slice(0, 25);

    if (!roles.length) return [];

    if (panel.kind === "select") {
        const menu = new StringSelectMenuBuilder()
            .setCustomId(`${SELF_ROLE_PREFIX}:menu:${panel.id}`)
            .setPlaceholder(panel.mode === "single" ? "Eine Rolle wählen" : "Rollen wählen")
            // Nichts auswählen ist auch eine Antwort: dann sollen alle Rollen
            // dieses Panels wieder weg.
            .setMinValues(0)
            .setMaxValues(panel.mode === "single" ? 1 : roles.length)
            .addOptions(
                roles.map((role) => {
                    const option = new StringSelectMenuOptionBuilder().setLabel(LabelOf(role, nameOf)).setValue(role.roleId);

                    if (role.description.trim()) option.setDescription(role.description.trim().slice(0, MAX_DESCRIPTION));
                    if (role.emoji) option.setEmoji(role.emoji);

                    return option;
                })
            );

        return [new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(menu)];
    }

    const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];

    for (let index = 0; index < roles.length; index += 5) {
        const row = new ActionRowBuilder<MessageActionRowComponentBuilder>();

        for (const role of roles.slice(index, index + 5)) {
            const button = new ButtonBuilder()
                .setCustomId(`${SELF_ROLE_PREFIX}:${panel.id}:${role.roleId}`)
                .setLabel(LabelOf(role, nameOf))
                .setStyle(STYLES[role.style] ?? ButtonStyle.Secondary);

            if (role.emoji) button.setEmoji(role.emoji);

            row.addComponents(button);
        }

        rows.push(row);
    }

    return rows;
}

/** Die ganze Nachricht - Kopf plus Rollen. */
export async function SelfRolePanelView(client: BotClient, panel: ISelfRolePanel, nameOf: (id: string) => string): Promise<ICustomView> {
    const rows = PanelRows(panel, nameOf);
    const view = await CustomMessageView(client, {
        id: panel.id,
        kind: panel.body.kind,
        content: panel.body.content,
        embed: panel.body.embed,
        doc: panel.body.doc,
        buttons: [],
        reserve: rows.length,
    });

    // In einer Components-V2-Nachricht steht alles im Container, auch die
    // Knopfreihen - daneben darf nichts liegen.
    if (view.flags === MessageFlags.IsComponentsV2) {
        const container = view.components[0] as ContainerBuilder;

        for (const row of rows) container.addActionRowComponents(row);

        return view;
    }

    return { ...view, components: [...view.components, ...rows] };
}
