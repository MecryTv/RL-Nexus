import { IWelcomeCard, IWelcomeConfig, IWelcomeMessage, IWelcomePosition, IWelcomePositions, WelcomeFont, WelcomeLayout, WelcomePart } from "../interfaces/services/welcome/IWelcome";
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
        positions: null,
    };
}

/* ----------------------------------------------------------
   Eigene Anordnung (Plan 25)
   ---------------------------------------------------------- */
export const WELCOME_PARTS: readonly WelcomePart[] = ["avatar", "icon", "title", "subtitle", "footer"];

/**
 * Grenzen der freien Plätze. Je Teil die Größe, dazu die Breite einer Zeile,
 * der Abstand zum Kartenrand und wie viel Platz eine Zeile mindestens behält.
 */
export const POSITION_LIMITS = {
    avatar: [48, 240],
    icon: [24, 160],
    title: [20, 96],
    subtitle: [12, 48],
    footer: [12, 48],
    width: [120, 952],
    edge: 24,
    minLine: 120,
} as const;

function Between(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Ein Teil auf die Karte klemmen: Bilder ganz darauf, Texte so, dass nach der
 * Randregel noch minLine Pixel bleiben - nichts verschwindet, nichts ragt hinaus.
 */
function ClampPart(part: WelcomePart, position: IWelcomePosition): IWelcomePosition {
    const { edge, minLine } = POSITION_LIMITS;
    const [low, high] = POSITION_LIMITS[part];
    const size = Between(position.size, low, high);
    const width = Between(position.width, POSITION_LIMITS.width[0], POSITION_LIMITS.width[1]);
    // Über der kleinen Zeile sitzt der Teiler (bis 0,85 × size darüber), im HUD
    // reicht ihre Marke bis 1,3 × size darunter. Beides bleibt ganz auf der Karte.
    // Die Überschrift reicht mit der Unterlänge bis 1,04 × size (Oxanium, W-0021).
    const bottom = part === "footer" ? Math.ceil(size * 1.3) : part === "title" ? Math.ceil(size * 1.05) : size;
    const y = Between(position.y, part === "footer" ? Math.ceil(size * 0.9) : 0, CARD_HEIGHT - bottom);

    if (part === "avatar" || part === "icon") return { x: Between(position.x, 0, CARD_WIDTH - size), y, size, align: "left", width };

    const room = edge + minLine;
    const [min, max] =
        position.align === "left" ? [0, CARD_WIDTH - room] : position.align === "right" ? [room, CARD_WIDTH] : [edge + minLine / 2, CARD_WIDTH - edge - minLine / 2];

    return { x: Between(position.x, min, max), y, size, align: position.align, width };
}

/**
 * Was aus dem Browser oder der Datenbank als Anordnung kommt, geprüft: Teile,
 * die keine sind oder kaputte Zahlen tragen, fallen weg - die zeichnet dann
 * das Layout. Bleibt nichts übrig, gilt wieder ganz das Layout (null).
 */
export function CleanPositions(input: unknown): IWelcomePositions | null {
    if (typeof input !== "object" || input === null || Array.isArray(input)) return null;

    const raw = input as Record<string, unknown>;
    const clean: IWelcomePositions = {};

    for (const part of WELCOME_PARTS) {
        const entry = raw[part];

        if (typeof entry !== "object" || entry === null) continue;

        const { x, y, size, align, width } = entry as Record<string, unknown>;

        if (![x, y, size].every((value) => typeof value === "number" && Number.isFinite(value))) continue;

        clean[part] = ClampPart(part, {
            x: x as number,
            y: y as number,
            size: size as number,
            align: align === "center" || align === "right" ? align : "left",
            width: typeof width === "number" && Number.isFinite(width) ? width : POSITION_LIMITS.width[1],
        });
    }

    return Object.keys(clean).length > 0 ? clean : null;
}

/**
 * Wie breit eine Zeile werden darf: das, was das Layout ihr gab, höchstens
 * aber bis zum Kartenrand abzüglich 24 px - je nach Ausrichtung.
 */
export function LineWidth(x: number, align: IWelcomePosition["align"], width: number): number {
    const { edge } = POSITION_LIMITS;
    const room = align === "left" ? CARD_WIDTH - edge - x : align === "right" ? x - edge : 2 * Math.min(x, CARD_WIDTH - x) - 2 * edge;

    return Math.min(width, room);
}

/** Die Grundlinie einer Zeile: y ist die Oberkante, gezeichnet wird so tief darunter. */
export const CARD_BASELINE = 0.82;

/**
 * Was zum Messen von Text reicht. Der Bot misst mit @napi-rs/canvas, die Bühne
 * im Dashboard mit dem Kanvas des Browsers - beide passen hier hinein, und so
 * wird ein langer Name an beiden Stellen gleich kleiner und gleich gekürzt.
 */
export interface ITextMeasure {
    font: string;
    measureText(text: string): { width: number };
}

/**
 * Die Schrift der Überschrift. Orbitron läuft breit, Rajdhani schmal - die
 * Größe gleicht das aus, damit "48" bei jeder Schrift ungefähr gleich wirkt.
 */
export function TitleFont(font: WelcomeFont, size: number): string {
    if (font === "orbitron") return `700 ${Math.round(size * 0.8)}px Orbitron`;
    if (font === "rajdhani") return `700 ${Math.round(size * 1.12)}px Rajdhani`;

    return `800 ${size}px Oxanium`;
}

/** Schneidet ab, was nicht in die Breite passt. */
export function Ellipsis(ctx: ITextMeasure, text: string, max: number): string {
    if (ctx.measureText(text).width <= max) return text;

    let cut = text;

    while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) cut = cut.slice(0, -1);

    return `${cut}…`;
}

/** Erst kleiner, dann kürzen: ein langer Name soll lesbar bleiben, statt gleich mit … zu enden. */
export function FitTitle(ctx: ITextMeasure, text: string, font: WelcomeFont, size: number, max: number): { text: string; size: number } {
    const floor = Math.round(size * 0.62);
    let current = size;

    ctx.font = TitleFont(font, current);

    while (current > floor && ctx.measureText(text).width > max) {
        current -= 2;
        ctx.font = TitleFont(font, current);
    }

    return { text: Ellipsis(ctx, text, max), size: current };
}

/* ----------------------------------------------------------
   Einrasten auf der Bühne im Dashboard (geprüft in check:welcome)
   ---------------------------------------------------------- */

/** Unter so vielen Pixeln rastet ein Teil ein, das Raster hat so viele. */
export const STAGE_SNAP = 6;
export const STAGE_GRID = 10;

/**
 * Einrasten und Raster. Unter 6 px rastet die Mitte des Teils an der
 * Kartenmitte ein, bei Texten nach ihrer Ausrichtung gerechnet. Sonst rastet
 * der Ankerpunkt an dem eines anderen Teils ein. Senkrecht zählt die
 * Kartenmitte. Das Raster rundet auf 10 px, aber nur auf einer Achse, die nicht
 * gerade eingerastet ist.
 */
export function SnapPosition(
    part: WelcomePart,
    position: IWelcomePosition,
    others: Required<IWelcomePositions>,
    box: { width: number; height: number },
    options: { snap: boolean; grid: boolean },
): { position: IWelcomePosition; guides: { x: number | null; y: number | null } } {
    let { x, y } = position;
    const guides: { x: number | null; y: number | null } = { x: null, y: null };

    if (options.snap) {
        const half = box.width / 2;
        const middle = part === "avatar" || part === "icon" || position.align === "left" ? x + half : position.align === "right" ? x - half : x;

        if (Math.abs(middle - CARD_WIDTH / 2) < STAGE_SNAP) {
            x += CARD_WIDTH / 2 - middle;
            guides.x = CARD_WIDTH / 2;
        } else {
            const match = WELCOME_PARTS.find((other) => other !== part && Math.abs(x - others[other].x) < STAGE_SNAP);

            if (match) {
                x = others[match].x;
                guides.x = x;
            }
        }

        if (Math.abs(y + box.height / 2 - CARD_HEIGHT / 2) < STAGE_SNAP) {
            y = CARD_HEIGHT / 2 - box.height / 2;
            guides.y = CARD_HEIGHT / 2;
        }
    }

    if (options.grid) {
        if (guides.x === null) x = Math.round(x / STAGE_GRID) * STAGE_GRID;
        if (guides.y === null) y = Math.round(y / STAGE_GRID) * STAGE_GRID;
    }

    return { position: { ...position, x, y }, guides };
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

    // Ältere Karten kennen keine eigene Anordnung, gespeicherte wird beim Lesen noch einmal geprüft.
    card.positions = CleanPositions(raw.positions);

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
