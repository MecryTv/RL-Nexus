import { ContainerBuilder, MessageFlags, MessageMentionOptions, escapeMarkdown } from "discord.js";
import ComponentV2Builder from "./ComponentV2Builder";
import { IRoleListSettings, RoleIcon } from "../constants/RoleLists";
import { IRoleListGroup, IRoleListMember } from "../interfaces/services/rolelists/IRoleLists";

/**
 * Die Text-Designs der Rollen-Listen (Plan 29): „Kompakt“ und „Mit
 * Abschnitten“, jeweils eine Karte (Components V2). Discord nimmt höchstens
 * 4000 Zeichen und 40 Komponenten - passt die Liste nicht, endet die größte
 * Gruppe mit „… und N weitere“. Erwähnungen pingen nie. Siehe docs/RoleLists.md.
 */

export interface IRoleListTextContext {
    /** Steht oben, wenn keine Überschrift gesetzt ist. */
    listName: string;
    guildName: string;
    iconUrl: string | null;
    now: number;
    /** Ziel des Knopfs - null: kein Knopf. */
    buttonUrl: string | null;
    /** Name eines Server-Emojis, null: gibt es nicht mehr. */
    emojiName: (id: string) => string | null;
    /** Ob ein Server-Emoji animiert ist - dann <a:…>, sonst stünde es unbewegt da. */
    emojiAnimated?: (id: string) => boolean;
}

export interface IRoleListText {
    components: ContainerBuilder[];
    flags: MessageFlags.IsComponentsV2;
    allowedMentions: MessageMentionOptions;
}

const MAX_CHARS = 4000;
const MAX_COMPONENTS = 39; // eine geht an den Container selbst

/** Das Symbol im Text: Emojis und Server-Emojis. Galerie und Rollen-Icon gibt es nur im Bild. */
function IconText(icon: RoleIcon, context: Pick<IRoleListTextContext, "emojiName" | "emojiAnimated">): string {
    if (icon?.kind === "emoji") return `${icon.value} `;

    if (icon?.kind === "server") {
        const name = context.emojiName(icon.id);

        return name ? `<${context.emojiAnimated?.(icon.id) ? "a" : ""}:${name}:${icon.id}> ` : "";
    }

    return "";
}

/** Die Zahl der Leute in der Liste - jeder einmal, auch wenn „Jeder nur einmal“ aus ist. */
export function TotalMembers(groups: IRoleListGroup[]): number {
    return new Set(groups.flatMap((group) => group.members.map((member) => member.id))).size;
}

export function RoleListText(settings: IRoleListSettings, design: "compact" | "sections", groups: IRoleListGroup[], context: IRoleListTextContext): IRoleListText {
    const total = TotalMembers(groups);
    const heading = `## ${escapeMarkdown(settings.heading || context.listName)}`;
    const lead = settings.lead.replace(/\{anzahl\}/g, String(total));
    const head = lead ? `${heading}\n${lead}` : heading;
    const withIcon = settings.thumb === "icon" && Boolean(context.iconUrl);
    const stamp = settings.stamp ? `-# Zuletzt aktualisiert <t:${Math.floor(context.now / 1000)}:R>` : "";
    const button = settings.button.on && settings.button.label && context.buttonUrl ? { url: context.buttonUrl, label: settings.button.label } : null;
    const person = (member: IRoleListMember): string => (settings.as === "mention" ? `<@${member.id}>` : `**${escapeMarkdown(member.name)}**`);
    const titled = (member: IRoleListMember): string => {
        const title = settings.titles[member.id]?.title;

        return title ? `${person(member)} – ${escapeMarkdown(title)}` : person(member);
    };

    // Je Gruppe, wie viele Leute sichtbar bleiben. Gekürzt wird bei der Gruppe mit den meisten sichtbaren.
    const shown = groups.map((group) => group.members.length);
    const block = (index: number): string => {
        const group = groups[index]!;
        const visible = group.members.slice(0, shown[index]);
        const hidden = group.members.length - visible.length;
        const title = `### ${IconText(group.entry.icon, context)}${escapeMarkdown(group.entry.label || group.role.name)}${settings.counts ? ` · ${group.members.length}` : ""}`;

        if (!group.members.length) return `${title}\n-# Noch niemand`;

        if (design === "compact") return `${title}\n${visible.map(person).join("  ")}${hidden ? ` … und ${hidden} weitere` : ""}`;

        return `${title}\n${visible.map((member) => `- ${titled(member)}`).join("\n")}${hidden ? `\n-# … und ${hidden} weitere` : ""}`;
    };

    const fixed = head.length + stamp.length;
    let blocks = groups.map((_, index) => block(index));

    while (fixed + blocks.reduce((sum, text) => sum + text.length, 0) > MAX_CHARS) {
        const largest = shown.reduce((best, count, index) => (count > shown[best]! ? index : best), 0);

        if (!shown[largest]) break;

        shown[largest]! -= 1;
        blocks[largest] = block(largest);
    }

    // Abschnitte trennt eine Linie - nur, solange die Komponenten reichen.
    const extras = (withIcon ? 3 : 1) + (stamp ? 1 : 0) + (button ? 2 : 0);
    const separated = design === "sections" && extras + blocks.length * 2 <= MAX_COMPONENTS;

    // Mehr Gruppen als Komponenten: die überzähligen in einen Baustein zusammenlegen.
    const room = MAX_COMPONENTS - extras - (design === "compact" ? 1 : 0);

    if (!separated && blocks.length > room) blocks = [...blocks.slice(0, room - 1), blocks.slice(room - 1).join("\n\n")];

    const card = new ComponentV2Builder({ accentColor: (groups[0]?.role.color ?? "#00afff") as `#${string}` });

    if (withIcon) card.section(head, { type: "thumbnail", url: context.iconUrl! });
    else card.text(head);

    if (design === "compact") card.separator();

    for (const text of blocks) {
        if (separated) card.separator();
        card.text(text);
    }

    if (stamp) card.subtext(stamp.slice(3));
    if (button) card.buttons(button);

    return { components: [card.build()], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}
