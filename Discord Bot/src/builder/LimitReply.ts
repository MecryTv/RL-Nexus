import { APIInteractionGuildMember, GuildMember, MessageFlags, PermissionFlagsBits, PermissionsBitField } from "discord.js";
import { SUPPORT_URL } from "../constants/Help";
import { MODULES } from "../dashboard/client/constants/Modules";
import { ILinkButtonOptions } from "../interfaces/builder/IComponentV2Builder";
import { CurrentLinkMode, LimitInfo, LinkMode } from "../utils/moduleFlags";
import ComponentV2Builder from "./ComponentV2Builder";

/**
 * W-0133, Entwurf M: Wenn eine Grenze von RL Nexus greift, steht erst die
 * Sache da, darunter klein, dass RL Nexus sie festlegt. Den Knopf zur Anfrage
 * im Support sehen nur Leute mit „Server verwalten“, samt Server-ID und
 * gewünschtem Wert. Mitglieder lesen „frag ein Server-Admin“, nie die ID.
 */
const YELLOW = 0xf0b232;

const ASK_BUTTON: ILinkButtonOptions = { url: SUPPORT_URL, label: "Anfrage im Support", emoji: "💬" };

const LINK_LABELS: Readonly<Record<LinkMode, string>> = { login: "die Epic-Anmeldung", name: "den Epic-Namen", both: "Epic-Name oder Epic-Anmeldung" };

/** Eine Grenze wurde überschritten: was gefragt war und was geht. */
export interface ILimitHit {
    readonly module: string;
    readonly key: string;
    readonly asked: number;
    readonly allowed: number;
}

/** Der Satz hinter einer Fehlermeldung beim Einstellen (Dashboard, /einstellungen): nur Server-Admins sehen ihn. */
export function LimitSentence(module: string, key: string, guildId: string | null): string {
    return LimitInfo(module, key, guildId).askable
        ? "Die Grenze legt RL Nexus fest, für euren Server lässt sie sich auf Anfrage ändern."
        : "Die Grenze legt RL Nexus fest.";
}

/** Für das Bot-Dashboard: der Satz zur Grenze und der Link zum Support, wenn sie auf Anfrage geht. */
export function DashboardLimit(limit: ILimitHit, guildId: string, message: string): { error: string; ask: { url: string } | null } {
    const askable = LimitInfo(limit.module, limit.key, guildId).askable;

    return {
        error: `${message} ${askable ? "Die Grenze legt RL Nexus fest, für euren Server lässt sie sich auf Anfrage ändern." : "Die Grenze legt RL Nexus fest."}`,
        ask: askable ? { url: SUPPORT_URL } : null,
    };
}

export interface IAskLine {
    readonly text: string;
    readonly button: ILinkButtonOptions | null;
}

/** Hat das Mitglied „Server verwalten“? Nur dann gibt es den Anfrage-Knopf. */
export function IsServerAdmin(member: GuildMember | APIInteractionGuildMember | null | undefined): boolean {
    if (!member) return false;

    const permissions = typeof member.permissions === "string" ? new PermissionsBitField(BigInt(member.permissions)) : member.permissions;

    return permissions.has(PermissionFlagsBits.ManageGuild);
}

function ModuleName(module: string): string {
    return module === "rl-tracking" ? "RL Tracking" : (MODULES.find((entry) => entry.id === module)?.name ?? module);
}

/** Der Satz unter einer Grenze, bei key "linkMode" der zur Verknüpfungsart. */
export function AskLine(input: { module: string; key: string; guildId: string; admin: boolean; asked?: number }): IAskLine {
    if (input.key === "linkMode") {
        const how = LINK_LABELS[CurrentLinkMode(input.guildId)];

        return input.admin
            ? {
                  text: `ℹ️ Verbunden wird über ${how}. Für euren Server lässt sich auf Anfrage eine andere Art freischalten. Server-ID: \`${input.guildId}\``,
                  button: ASK_BUTTON,
              }
            : { text: `ℹ️ Auf diesem Server wird über ${how} verbunden. Das legt RL Nexus fest; Server-Admins können eine andere Art anfragen.`, button: null };
    }

    const info = LimitInfo(input.module, input.key, input.guildId);

    if (!info.askable) return { text: "ℹ️ Die Grenze legt RL Nexus fest.", button: null };
    if (!input.admin) return { text: "ℹ️ Die Grenze legt RL Nexus fest. Braucht ihr mehr, frag ein Server-Admin; er kann es für euren Server anfragen.", button: null };

    const wish = input.asked !== undefined ? ` · gewünscht **${input.asked}**` : "";

    return {
        text:
            "ℹ️ Die Grenze legt RL Nexus fest. Für euren Server lässt sie sich auf Anfrage erhöhen. " +
            `Nenn dabei: ${ModuleName(input.module)} · ${info.def.label}${wish} und die Server-ID \`${input.guildId}\`.`,
        button: ASK_BUTTON,
    };
}

/**
 * Gelbe Karte für eine erreichte Grenze, nur für die Person, ohne Pings.
 * fallback: Knopf „Mit dem erlaubten Wert weitermachen“ samt „Abbrechen“
 * (customId des Abbrechens: `<fallback.customId>:abbrechen`).
 */
export function LimitReply(input: {
    module: string;
    key: string;
    guildId: string;
    admin: boolean;
    title: string;
    text: string;
    asked?: number;
    fallback?: { label: string; customId: string };
}) {
    const ask = AskLine(input);
    const card = new ComponentV2Builder({ accentColor: YELLOW }).text(`### ⚠️ ${input.title}`).text(input.text);

    if (input.fallback) {
        card.buttons({ customId: input.fallback.customId, label: input.fallback.label, tone: "primary" }, { customId: `${input.fallback.customId}:abbrechen`, label: "Abbrechen", tone: "secondary" });
    }

    card.separator().subtext(ask.text);

    if (ask.button) card.buttons(ask.button);

    return { components: [card.build()], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, allowedMentions: { parse: [] } } as const;
}
