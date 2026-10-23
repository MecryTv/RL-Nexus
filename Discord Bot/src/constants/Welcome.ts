import { IWelcomeCard, IWelcomeConfig, IWelcomeMessage, WelcomeFont, WelcomeLayout } from "../interfaces/services/welcome/IWelcome";
import { IMessageDoc } from "../interfaces/builder/IMessageDoc";

/**
 * Welcome System: Grenzen, Platzhalter und die Vorgaben.
 * Siehe docs/Welcome.md.
 */
export const WELCOME_ACCENT = "#00afff";
export const LEAVE_ACCENT = "#6b7683";

export const MAX_ROLES = 10;
export const MAX_LINE = 120;
export const MIN_TITLE_SIZE = 28;
export const MAX_TITLE_SIZE = 72;

/**
 * Die Karte in logischen Pixeln. Gezeichnet wird mit CARD_SCALE, also doppelt so
 * fein: Discord zeigt das Bild verkleinert, und auf hochauflösenden Bildschirmen
 * blieben die Kanten der Schrift sonst weich.
 */
export const CARD_WIDTH = 1000;
export const CARD_HEIGHT = 340;
export const CARD_SCALE = 2;

/**
 * Was das Dashboard als Hintergrund empfiehlt. Die Galerie verkleinert
 * Hochgeladenes auf 1920 px an der längsten Kante, also ist das die
 * größte Breite, die etwas bringt.
 */
export const BACKGROUND_HINT = { width: 1920, height: 653, minWidth: 1000, minHeight: 340, maxMegabytes: 8 } as const;

export const MIN_AVATAR = 96;
export const MAX_AVATAR = 200;
export const MAX_RING = 12;

export const LAYOUT_LABELS: Record<WelcomeLayout, string> = {
    classic: "Klassisch – Avatar links, Streifen am Rand",
    center: "Mittig – Avatar oben, Text darunter",
    panel: "Panel – Text auf dunkler Fläche, Bild rechts frei",
    hud: "HUD – Rahmen mit Eckwinkeln wie die Rang-Karte",
};

export const FONT_LABELS: Record<WelcomeFont, string> = {
    oxanium: "Oxanium – kräftig, die Standardschrift",
    orbitron: "Orbitron – breit und technisch",
    rajdhani: "Rajdhani – schmal und ruhig",
};

const HEX = /^#[0-9a-f]{6}$/i;

/** Was in Texten und auf der Karte eingesetzt wird. */
export const WELCOME_PLACEHOLDER_KEYS = [
    "user",
    "user.name",
    "user.tag",
    "user.id",
    "user.avatar",
    "guild",
    "guild.icon",
    "guild.members",
    "member.number",
    "joined",
    "created",
] as const;

export function DefaultCard(kind: "join" | "leave"): IWelcomeCard {
    return {
        background: null,
        accent: kind === "join" ? WELCOME_ACCENT : LEAVE_ACCENT,
        accentOn: true,
        dim: 45,
        layout: "classic",
        title: kind === "join" ? "Willkommen, {user.name}!" : "Tschüss, {user.name}",
        subtitle: kind === "join" ? "Schön, dass du da bist." : "War schön mit dir.",
        footer: kind === "join" ? "Mitglied Nr. {member.number} auf {guild}" : "{guild} hat jetzt {guild.members} Mitglieder",
        font: "oxanium",
        titleSize: 48,
        titleColor: "#f2f4f7",
        subtitleColor: "#a8b0bc",
        footerColor: null,
        avatar: true,
        avatarSize: 168,
        ringWidth: 5,
        avatarShape: "circle",
        count: true,
        icon: true,
        date: false,
    };
}

/**
 * Eine gespeicherte Karte, ergänzt um alles, was sie noch nicht kennt. Karten
 * von vor den Layouts trugen "align" und "avatarRing" - daraus werden Layout
 * und Ringstärke, damit niemandes Karte beim Update anders aussieht als gewählt.
 */
export function NormalizeCard(stored: unknown, kind: "join" | "leave"): IWelcomeCard {
    const raw = typeof stored === "object" && stored !== null ? (stored as Record<string, unknown>) : {};
    const card = { ...DefaultCard(kind), ...(raw as Partial<IWelcomeCard>) };

    if (raw.layout === undefined) card.layout = raw.align === "center" ? "center" : "classic";
    if (raw.ringWidth === undefined && raw.avatarRing === false) card.ringWidth = 0;
    if (!HEX.test(card.titleColor)) card.titleColor = DefaultCard(kind).titleColor;
    if (!HEX.test(card.subtitleColor)) card.subtitleColor = DefaultCard(kind).subtitleColor;

    delete (card as Record<string, unknown>).align;
    delete (card as Record<string, unknown>).avatarRing;

    return card;
}

export function DefaultDoc(kind: "join" | "leave"): IMessageDoc {
    return {
        accent: kind === "join" ? WELCOME_ACCENT : LEAVE_ACCENT,
        blocks: [
            {
                type: "text",
                body:
                    kind === "join"
                        ? "## 👋 Willkommen, {user}!\nSchön, dass du auf **{guild}** bist – du bist Mitglied Nr. {member.number}."
                        : "## 👋 {user.name} hat den Server verlassen\nJetzt sind es noch {guild.members} Mitglieder.",
            },
        ],
    };
}

export function DefaultMessage(kind: "join" | "leave"): IWelcomeMessage {
    return {
        on: kind === "join",
        channelId: null,
        kind: "card",
        content: kind === "join" ? "{user}" : "",
        embed: null,
        doc: DefaultDoc(kind),
        card: DefaultCard(kind),
    };
}

export function DefaultWelcomeConfig(): IWelcomeConfig {
    return { join: DefaultMessage("join"), leave: DefaultMessage("leave"), roles: [], botRoles: [] };
}
