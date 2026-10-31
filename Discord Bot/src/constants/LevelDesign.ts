import { BoardArea, DesignFont, DesignKind, IBoardDesign, IBoardStyle, ICardDesign, IDesignBackground, IDesignElement, ITextElement } from "../interfaces/services/levels/ILevelDesign";

/**
 * Level System, Plan 35: der Designer für Level-Karte und Aufstiegs-Bild,
 * dazu der Stil des Ranglisten-Bilds. Hier stehen Größen, Grenzen, die
 * Vorlagen - ohne Node-Module, das Dashboard nutzt dieselben Werte. Geprüft
 * wird in services/levels/Design.ts, gezeichnet in builder/DesignRenderer.ts.
 * Siehe docs/Levels.md.
 */

/** Logische Größe - die Karte so groß wie die heutige (builder/LevelCard.ts), gezeichnet mit CARD_SCALE. */
export const DESIGN_SIZE: Record<DesignKind, { width: number; height: number }> = {
    card: { width: 900, height: 300 },
    up: { width: 900, height: 260 },
};

/** Mehr Bausteine machen das Zeichnen langsam, ohne dass die Karte besser wird. */
export const MAX_ELEMENTS = 30;
export const MAX_TEXT = 200;
export const MAX_NAME = 40;
export const MAX_BOARD_TEXT = 80;

export const DESIGN_FONTS: readonly DesignFont[] = ["Oxanium", "Orbitron", "Rajdhani"];

/** Platzhalter auf Karte und Aufstiegs-Bild. {level.old} hat nur der Aufstieg, {boost} ist nur während doppelter Punkte gefüllt (Plan 37). */
export const DESIGN_PLACEHOLDERS = [
    "user.name",
    "user.tag",
    "guild",
    "level",
    "level.old",
    "level.next",
    "xp",
    "xp.into",
    "xp.need",
    "xp.percent",
    "rank",
    "rank.total",
    "messages",
    "voice",
    "voice.hours",
    "boost",
] as const;

/** Titel und kleine Zeile des Ranglisten-Stils (Plan 35). */
export const BOARD_PLACEHOLDERS = ["guild", "period", "range"] as const;

/** Plan 38: Kopf und Fuß des Ranglisten-Baukastens. */
export const BOARD_FRAME_PLACEHOLDERS = ["title", "guild", "period", "range", "page", "pages", "total"] as const;

/** Plan 38: ein Platz in Podium und Zeile. */
export const BOARD_ENTRY_PLACEHOLDERS = ["rank", "name", "level", "xp", "messages", "voice", "voice.hours", "trend"] as const;

export const ELEMENT_LABEL: Record<IDesignElement["type"], string> = {
    text: "Text",
    image: "Bild",
    shape: "Form",
    avatar: "Avatar",
    bar: "Balken",
    ring: "Level-Ring",
    icon: "Server-Icon",
};

/** Ohne eigene Einstellungen sieht das Bild aus wie in Etappe 1 - Akzent ist LEVELS_ACCENT. */
export function DefaultBoardStyle(): IBoardStyle {
    return { image: null, dim: 40, accent: "#8a4dff", medals: ["#facc15", "#cbd5e1", "#f59e0b"], font: "Oxanium", title: "Rangliste", subtitle: "{guild}", podium: true };
}

/* ----------------------------------------------------------
   Vorlagen
   Nach level-design-2.html (Karte) und level-ideen.html (Aufstieg),
   umgerechnet auf 900 × 300 bzw. 900 × 260.
   ---------------------------------------------------------- */
const LILA = "#a78bfa";
const CYAN = "#38bdf8";
const WHITE = "#ffffff";
const SOFT = "#c9c3e6";
const LABEL = "#b9b3d6";
const TRACK = "#2b2838";
/** Die heutige Karte (builder/LevelCard.ts, constants/RankCard.ts). */
const TODAY = { accent: "#8a4dff", blue: "#00afff", text: "#f2f4f7", dim: "#a8b0bc", panel: "#080d12", track: "#171c22" };

const LINE = "{messages} Nachrichten · {voice} Min. im Voice ({voice.hours})";
const TO_NEXT = "{xp.into} / {xp.need} bis Level {level.next}";

const night = (): IDesignBackground => ({ mode: "gradient", image: null, dim: 40, color: "#0b0f1a", to: "#1d1240", shape: "rect", cut: 16, border: null, borderWidth: 0 });
/** Plan 36: Bei Klassisch ist die graue Fläche das ganze Bild - abgeschrägt, mit feinem Rand. */
const panel = (): IDesignBackground => ({ mode: "color", image: null, dim: 40, color: TODAY.panel, to: "#050608", shape: "bevel", cut: 16, border: "#1c2128", borderWidth: 2 });

function text(id: string, name: string, value: string, x: number, y: number, size: number, extra: Partial<ITextElement> = {}): ITextElement {
    return { type: "text", id, name, hidden: false, x, y, opacity: 1, text: value, font: "Rajdhani", size, weight: 600, color: SOFT, align: "left", maxWidth: 600, ...extra };
}

/** Die Bausteine der Karte - erst die Teile, die jede Vorlage braucht, dann je Vorlage die Lage. */
export const CARD_TEMPLATES: Record<"klassisch" | "mittig" | "panel" | "hud" | "leer", () => ICardDesign> = {
    /** Die heutige Karte, dazu der Streifen am Rand aus dem Entwurf. */
    klassisch: () => ({
        kind: "card",
        template: "klassisch",
        background: panel(),
        elements: [
            { type: "shape", id: "streifen", name: "Streifen", hidden: false, x: 0, y: 0, opacity: 1, shape: "rect", w: 7, h: 300, fill: TODAY.accent, stroke: null, strokeWidth: 0, cut: 0 },
            { type: "avatar", id: "avatar", name: "Avatar", hidden: false, x: 62, y: 84, opacity: 1, size: 132, shape: "circle", ring: 4, ringColor: TODAY.accent },
            { type: "bar", id: "balken", name: "Balken", hidden: false, x: 226, y: 172, opacity: 1, w: 612, h: 22, style: "solid", segments: 20, corner: "bevel", from: TODAY.accent, to: TODAY.blue, track: TODAY.track },
            text("name", "Überschrift", "{user.name}", 226, 95, 40, { font: "Oxanium", weight: 800, color: TODAY.text, maxWidth: 380 }),
            text("zeile", "Unterzeile", LINE, 226, 142, 20, { color: TODAY.dim, maxWidth: 440 }),
            text("level-label", "Level-Beschriftung", "LEVEL", 742, 96, 22, { color: TODAY.dim, align: "right", maxWidth: 120 }),
            text("platz-label", "Platz-Beschriftung", "PLATZ", 838, 96, 22, { color: TODAY.dim, align: "right", maxWidth: 90 }),
            text("level", "Level", "{level}", 742, 120, 46, { font: "Oxanium", weight: 800, color: TODAY.accent, align: "right", maxWidth: 120 }),
            text("platz", "Platz", "#{rank}", 838, 120, 46, { font: "Oxanium", weight: 800, color: TODAY.blue, align: "right", maxWidth: 90 }),
            text("bis", "Fortschritt", TO_NEXT, 226, 204, 20, { color: TODAY.dim, maxWidth: 380 }),
            text("punkte", "Punkte", "{xp} Punkte", 838, 204, 20, { color: TODAY.dim, align: "right", maxWidth: 220 }),
        ],
    }),
    /** Avatar oben in der Mitte, Level links und Platz rechts neben dem Balken. */
    mittig: () => ({
        kind: "card",
        template: "mittig",
        background: night(),
        elements: [
            { type: "avatar", id: "avatar", name: "Avatar", hidden: false, x: 402, y: 22, opacity: 1, size: 96, shape: "circle", ring: 4, ringColor: LILA },
            { type: "bar", id: "balken", name: "Balken", hidden: false, x: 180, y: 226, opacity: 1, w: 540, h: 18, style: "solid", segments: 20, corner: "round", from: "#7c3aed", to: LILA, track: TRACK },
            text("name", "Überschrift", "{user.name}", 450, 134, 38, { font: "Oxanium", weight: 700, color: WHITE, align: "center", maxWidth: 600 }),
            text("zeile", "Unterzeile", LINE, 450, 182, 17, { align: "center", maxWidth: 700 }),
            text("level-label", "Level-Beschriftung", "LEVEL", 100, 186, 14, { color: LABEL, align: "center", maxWidth: 120 }),
            text("level", "Level", "{level}", 100, 204, 46, { font: "Oxanium", weight: 800, color: LILA, align: "center", maxWidth: 140 }),
            text("platz-label", "Platz-Beschriftung", "PLATZ", 800, 186, 14, { color: LABEL, align: "center", maxWidth: 120 }),
            text("platz", "Platz", "#{rank}", 800, 204, 46, { font: "Oxanium", weight: 800, color: CYAN, align: "center", maxWidth: 140 }),
            text("bis", "Fortschritt", TO_NEXT, 180, 254, 15, { maxWidth: 300 }),
            text("punkte", "Punkte", "{xp} Punkte", 720, 254, 15, { align: "right", maxWidth: 220 }),
        ],
    }),
    /** Text auf einer dunklen, schrägen Fläche links, rechts das Level groß im Ring. */
    panel: () => ({
        kind: "card",
        template: "panel",
        background: night(),
        elements: [
            { type: "shape", id: "flaeche", name: "Fläche", hidden: false, x: 0, y: 0, opacity: 0.86, shape: "slant", w: 558, h: 300, fill: "#080910", stroke: null, strokeWidth: 0, cut: 67 },
            { type: "avatar", id: "avatar", name: "Avatar", hidden: false, x: 45, y: 44, opacity: 1, size: 96, shape: "circle", ring: 4, ringColor: LILA },
            { type: "bar", id: "balken", name: "Balken", hidden: false, x: 45, y: 181, opacity: 1, w: 414, h: 18, style: "solid", segments: 20, corner: "round", from: "#7c3aed", to: LILA, track: TRACK },
            { type: "ring", id: "ring", name: "Level-Ring", hidden: false, x: 607, y: 44, opacity: 1, size: 212, thickness: 14, color: LILA, track: TRACK, inner: "#0a0816", label: "LEVEL", value: "{level}", font: "Oxanium", textColor: WHITE },
            text("name", "Überschrift", "{user.name}", 171, 58, 34, { font: "Oxanium", weight: 700, color: WHITE, maxWidth: 330 }),
            text("zeile", "Unterzeile", LINE, 171, 102, 15, { maxWidth: 330 }),
            text("bis", "Fortschritt", TO_NEXT, 45, 213, 15, { maxWidth: 260 }),
            text("punkte", "Punkte", "{xp} Punkte", 459, 213, 15, { align: "right", maxWidth: 160 }),
            text("platz", "Platz", "PLATZ #{rank} VON {rank.total}", 864, 256, 16, { color: CYAN, align: "right", maxWidth: 300 }),
        ],
    }),
    /** Abgeschrägter Rahmen, Avatar abgeschrägt, Balken aus 20 Feldern. */
    hud: () => ({
        kind: "card",
        template: "hud",
        background: night(),
        elements: [
            { type: "shape", id: "rahmen", name: "Rahmen", hidden: false, x: 22, y: 21, opacity: 0.55, shape: "bevel", w: 856, h: 258, fill: null, stroke: LILA, strokeWidth: 2, cut: 22 },
            { type: "avatar", id: "avatar", name: "Avatar", hidden: false, x: 63, y: 85, opacity: 1, size: 116, shape: "bevel", ring: 0, ringColor: LILA },
            { type: "bar", id: "balken", name: "Balken", hidden: false, x: 212, y: 180, opacity: 1, w: 625, h: 18, style: "segments", segments: 20, corner: "bevel", from: LILA, to: LILA, track: TRACK },
            text("kopf", "Kopfzeile", "{guild} · LEVEL", 63, 48, 14, { color: LILA, maxWidth: 400 }),
            text("name", "Überschrift", "{user.name}", 212, 83, 40, { font: "Oxanium", weight: 700, color: WHITE, maxWidth: 380 }),
            text("zeile", "Unterzeile", LINE, 212, 132, 15, { maxWidth: 380 }),
            text("level-label", "Level-Beschriftung", "LEVEL", 700, 53, 14, { color: LABEL, align: "center", maxWidth: 120 }),
            text("level", "Level", "{level}", 700, 70, 46, { font: "Oxanium", weight: 800, color: LILA, align: "center", maxWidth: 140 }),
            text("platz-label", "Platz-Beschriftung", "PLATZ", 800, 53, 14, { color: LABEL, align: "center", maxWidth: 120 }),
            text("platz", "Platz", "#{rank}", 800, 70, 46, { font: "Oxanium", weight: 800, color: CYAN, align: "center", maxWidth: 140 }),
            text("bis", "Fortschritt", TO_NEXT, 212, 213, 15, { maxWidth: 360 }),
            text("punkte", "Punkte", "{xp} Punkte", 837, 213, 15, { align: "right", maxWidth: 220 }),
        ],
    }),
    leer: () => ({ kind: "card", template: "leer", background: night(), elements: [] }),
};

/** Das Aufstiegs-Bild: Banner aus level-ideen.html und je Layout-Stil eine Variante. */
export const UP_TEMPLATES: Record<"banner" | "klassisch" | "mittig" | "panel" | "hud" | "leer", () => ICardDesign> = {
    /** Avatar mit Ring, Name, „ist aufgestiegen“, rechts „11 →“ und groß „12“. */
    banner: () => ({
        kind: "up",
        template: "banner",
        background: night(),
        elements: [
            { type: "avatar", id: "avatar", name: "Avatar", hidden: false, x: 50, y: 50, opacity: 1, size: 160, shape: "circle", ring: 8, ringColor: LILA },
            text("name", "Name", "{user.name}", 250, 76, 52, { font: "Oxanium", weight: 700, color: WHITE, maxWidth: 360 }),
            text("zeile", "Unterzeile", "ist aufgestiegen · {xp} Punkte", 250, 142, 26, { maxWidth: 360 }),
            text("alt", "Altes Level", "{level.old} →", 742, 116, 48, { font: "Oxanium", weight: 800, color: "#6b6390", align: "right", maxWidth: 160 }),
            text("level", "Neues Level", "{level}", 754, 82, 90, { font: "Oxanium", weight: 800, color: LILA, maxWidth: 130 }),
        ],
    }),
    klassisch: () => ({
        kind: "up",
        template: "klassisch",
        background: panel(),
        elements: [
            { type: "shape", id: "streifen", name: "Streifen", hidden: false, x: 0, y: 0, opacity: 1, shape: "rect", w: 7, h: 260, fill: TODAY.accent, stroke: null, strokeWidth: 0, cut: 0 },
            { type: "avatar", id: "avatar", name: "Avatar", hidden: false, x: 62, y: 70, opacity: 1, size: 120, shape: "circle", ring: 4, ringColor: TODAY.accent },
            text("name", "Name", "{user.name}", 214, 82, 40, { font: "Oxanium", weight: 800, color: TODAY.text, maxWidth: 400 }),
            text("zeile", "Unterzeile", "ist aufgestiegen · {xp} Punkte", 214, 134, 22, { color: TODAY.dim, maxWidth: 400 }),
            text("label", "Beschriftung", "LEVEL {level.old} →", 838, 80, 22, { color: TODAY.dim, align: "right", maxWidth: 220 }),
            text("level", "Neues Level", "{level}", 838, 104, 70, { font: "Oxanium", weight: 800, color: TODAY.accent, align: "right", maxWidth: 200 }),
        ],
    }),
    mittig: () => ({
        kind: "up",
        template: "mittig",
        background: night(),
        elements: [
            { type: "avatar", id: "avatar", name: "Avatar", hidden: false, x: 402, y: 20, opacity: 1, size: 96, shape: "circle", ring: 4, ringColor: LILA },
            text("name", "Name", "{user.name} ist aufgestiegen", 450, 130, 32, { font: "Oxanium", weight: 700, color: WHITE, align: "center", maxWidth: 760 }),
            text("sprung", "Sprung", "{level.old} → {level}", 450, 172, 56, { font: "Oxanium", weight: 800, color: LILA, align: "center", maxWidth: 500 }),
        ],
    }),
    panel: () => ({
        kind: "up",
        template: "panel",
        background: night(),
        elements: [
            { type: "shape", id: "flaeche", name: "Fläche", hidden: false, x: 0, y: 0, opacity: 0.86, shape: "slant", w: 558, h: 260, fill: "#080910", stroke: null, strokeWidth: 0, cut: 67 },
            { type: "avatar", id: "avatar", name: "Avatar", hidden: false, x: 45, y: 82, opacity: 1, size: 96, shape: "circle", ring: 4, ringColor: LILA },
            { type: "ring", id: "ring", name: "Level-Ring", hidden: false, x: 620, y: 30, opacity: 1, size: 200, thickness: 14, color: LILA, track: TRACK, inner: "#0a0816", label: "LEVEL", value: "{level}", font: "Oxanium", textColor: WHITE },
            text("name", "Name", "{user.name}", 171, 90, 34, { font: "Oxanium", weight: 700, color: WHITE, maxWidth: 330 }),
            text("zeile", "Unterzeile", "steigt auf: Level {level.old} → {level}", 171, 136, 18, { maxWidth: 330 }),
        ],
    }),
    hud: () => ({
        kind: "up",
        template: "hud",
        background: night(),
        elements: [
            { type: "shape", id: "rahmen", name: "Rahmen", hidden: false, x: 22, y: 21, opacity: 0.55, shape: "bevel", w: 856, h: 218, fill: null, stroke: LILA, strokeWidth: 2, cut: 22 },
            { type: "avatar", id: "avatar", name: "Avatar", hidden: false, x: 63, y: 72, opacity: 1, size: 116, shape: "bevel", ring: 0, ringColor: LILA },
            text("kopf", "Kopfzeile", "LEVEL UP · {guild}", 63, 44, 14, { color: LILA, maxWidth: 400 }),
            text("name", "Name", "{user.name}", 212, 84, 40, { font: "Oxanium", weight: 700, color: WHITE, maxWidth: 380 }),
            text("zeile", "Unterzeile", "{xp} Punkte", 212, 134, 18, { maxWidth: 380 }),
            text("alt", "Altes Level", "{level.old} →", 700, 110, 40, { font: "Oxanium", weight: 800, color: "#6b6390", align: "right", maxWidth: 160 }),
            text("level", "Neues Level", "{level}", 712, 84, 72, { font: "Oxanium", weight: 800, color: LILA, maxWidth: 140 }),
        ],
    }),
    leer: () => ({ kind: "up", template: "leer", background: night(), elements: [] }),
};

/* ----------------------------------------------------------
   Plan 38: das Ranglisten-Bild im Baukasten
   Vier Bereiche (Kopf, Podium, Zeile, Fuß), 1000 breit. Podium und Zeile
   sind Muster - der Bot wiederholt sie je Platz. Farben dürfen "accent",
   im Podium und in der Zeile auch "medal" und "trend" sein.
   ---------------------------------------------------------- */
export const BOARD_WIDTH = 1000;

/** Was in welchem Bereich stehen darf - Avatar, Balken und Ring brauchen einen Platz. */
export const BOARD_AREA_TYPES: Record<BoardArea, readonly IDesignElement["type"][]> = {
    head: ["text", "image", "shape", "icon"],
    podium: ["text", "image", "shape", "icon", "avatar", "bar", "ring"],
    row: ["text", "image", "shape", "icon", "avatar", "bar", "ring"],
    foot: ["text", "image", "shape", "icon"],
};

export const BOARD_AREA_LABEL: Record<BoardArea, string> = { head: "Kopf", podium: "Podium", row: "Zeile", foot: "Fuß" };

/** Die Farben des bisherigen Bilds (builder/LeaderboardImage.ts). */
const BOARD = { text: "#f2f4f7", dim: "#a8b0bc", cyan: "#38bdf8" };
/** = CARD_BASELINE: die Grundlinie liegt bei 82 % der Schriftgröße unter der Oberkante. */
const BASELINE = 0.82;

/** Ein Text an seiner Grundlinie - so lassen sich die Maße des bisherigen Bilds übernehmen. */
function line(id: string, name: string, value: string, x: number, baseline: number, size: number, extra: Partial<ITextElement> = {}): ITextElement {
    return { type: "text", id, name, hidden: false, x, y: Math.max(0, baseline - Math.round(size * BASELINE)), opacity: 1, text: value, font: "Rajdhani", size, weight: 600, color: BOARD.dim, align: "left", maxWidth: 400, ...extra };
}

function boardBackground(style: IBoardStyle): IDesignBackground {
    return { mode: style.image ? "image" : "gradient", image: style.image, dim: style.dim, color: "#0d1020", to: "#1a1238", shape: "rect", cut: 16, border: null, borderWidth: 0 };
}

/** Die Zeile des bisherigen Bilds: Platz, Avatar, Name, Nachrichten und Voice, Level, Punkte, Trend. */
function classicRow(font: DesignFont): IBoardDesign["row"] {
    return {
        x: 40,
        w: 920,
        h: 74,
        gap: 8,
        columns: 1,
        fill: "#ffffff",
        fillOpacity: 5,
        shape: "bevel",
        cut: 10,
        highlight: BOARD.cyan,
        elements: [
            line("platz", "Platz", "{rank}", 22, 47, 26, { font, weight: 700, color: "medal", maxWidth: 66 }),
            { type: "avatar", id: "avatar", name: "Avatar", hidden: false, x: 92, y: 13, opacity: 1, size: 48, shape: "circle", ring: 0, ringColor: "medal" },
            line("name", "Name", "{name}", 158, 33, 23, { font, weight: 700, color: BOARD.text, maxWidth: 380 }),
            line("zahlen", "Nachrichten · Voice", "{messages} Nachr. · {voice} Min. ({voice.hours})", 158, 58, 18, { maxWidth: 420 }),
            line("lvl", "LVL", "LVL", 690, 30, 15, { align: "right", maxWidth: 60 }),
            line("level", "Level", "{level}", 690, 58, 26, { font, weight: 800, color: "accent", align: "right", maxWidth: 90 }),
            line("punkte", "Punkte", "{xp}", 838, 38, 25, { font, weight: 700, color: BOARD.text, align: "right", maxWidth: 130 }),
            line("punkte-label", "PUNKTE", "PUNKTE", 838, 60, 15, { align: "right", maxWidth: 80 }),
            line("trend", "Trend", "{trend}", 904, 46, 20, { font: "Oxanium", weight: 700, color: "trend", align: "right", maxWidth: 60 }),
        ],
    };
}

function classicFoot(): IBoardDesign["foot"] {
    return {
        h: 80,
        elements: [
            line("seite", "Seite", "Seite {page} von {pages} · {total} Mitglieder", 40, 46, 20, { maxWidth: 560 }),
            line("zeitraum", "Zeitraum", "{range}", 960, 46, 20, { align: "right", maxWidth: 300 }),
        ],
    };
}

function classicHead(style: IBoardStyle, center = false): IBoardDesign["head"] {
    const x = center ? BOARD_WIDTH / 2 : 40;
    const align = center ? "center" : "left";
    const chip: IDesignElement[] = [
        { type: "shape", id: "chip", name: "Rahmen Zeitraum", hidden: false, x: 800, y: 76, opacity: 1, shape: "rect", w: 160, h: 40, fill: null, stroke: BOARD.cyan, strokeWidth: 2, cut: 0 },
        line("zeitraum", "Zeitraum", "{period}", 880, 103, 20, { weight: 700, color: BOARD.cyan, align: "center", maxWidth: 150 }),
    ];

    return {
        h: 140,
        elements: [
            line("untertitel", "Kleine Zeile", style.subtitle, x, 64, 20, { color: "accent", align, maxWidth: 560 }),
            line("titel", "Titel", "{title}", x, 112, 46, { font: style.font, weight: 800, color: BOARD.text, align, maxWidth: 700 }),
            ...(center ? [] : chip),
        ],
    };
}

function boardBase(style: IBoardStyle, template: string): Pick<IBoardDesign, "kind" | "template" | "background" | "accent" | "medals" | "glow" | "title"> {
    return { kind: "board", template, background: boardBackground(style), accent: style.accent, medals: [...style.medals], glow: true, title: style.title };
}

/** Das Podium des bisherigen Bilds: Platz 1 in der Mitte und höher. */
function classicPodium(style: IBoardStyle, on: boolean): IBoardDesign["podium"] {
    return {
        on,
        h: 320,
        w: 280,
        slotH: 300,
        gap: 20,
        offsets: [0, 40, 40],
        fill: "medal",
        fillOpacity: 10,
        shape: "bevel",
        cut: 16,
        elements: [
            line("platz", "Platz", "{rank}", 140, 44, 34, { font: style.font, weight: 800, color: "medal", align: "center", maxWidth: 80 }),
            { type: "avatar", id: "avatar", name: "Avatar", hidden: false, x: 94, y: 58, opacity: 1, size: 92, shape: "circle", ring: 4, ringColor: "medal" },
            line("name", "Name", "{name}", 140, 184, 24, { font: style.font, weight: 700, color: BOARD.text, align: "center", maxWidth: 250 }),
            line("zeile", "Level und Punkte", "Level {level} · {xp} Punkte", 140, 210, 19, { align: "center", maxWidth: 250 }),
            line("trend", "Trend", "{trend}", 140, 238, 20, { font: "Oxanium", weight: 700, color: "trend", align: "center", maxWidth: 80 }),
        ],
    };
}

/**
 * Die Vorlagen der Rangliste. Ohne Angabe gilt der Stil ab Werk; mit dem
 * bisherigen Ranglisten-Stil (Plan 35) übernimmt die Vorlage Bild, Abdunkeln,
 * Akzent, Medaillen, Schrift, Titel, kleine Zeile und Podium an/aus.
 */
export const BOARD_TEMPLATES: Record<"podium" | "liste" | "kompakt" | "arena", (style?: IBoardStyle) => IBoardDesign> = {
    /** Wie das bisherige Bild: Platz 1–3 groß, darunter die Zeilen. */
    podium: (style = DefaultBoardStyle()) => ({ ...boardBase(style, "podium"), perPage: 10, head: classicHead(style), podium: classicPodium(style, style.podium), row: classicRow(style.font), foot: classicFoot() }),
    /** Zehn gleiche Zeilen, ohne Podium. */
    liste: (style = DefaultBoardStyle()) => ({ ...boardBase(style, "liste"), perPage: 10, head: classicHead(style), podium: classicPodium(style, false), row: classicRow(style.font), foot: classicFoot() }),
    /** Zwei Spalten, 20 Plätze je Seite. */
    kompakt: (style = DefaultBoardStyle()) => ({
        ...boardBase(style, "kompakt"),
        perPage: 20,
        head: { ...classicHead(style), h: 130 },
        podium: classicPodium(style, false),
        row: {
            x: 40,
            w: 456,
            h: 56,
            gap: 8,
            columns: 2,
            fill: "#ffffff",
            fillOpacity: 5,
            shape: "bevel",
            cut: 8,
            highlight: BOARD.cyan,
            elements: [
                line("platz", "Platz", "{rank}", 14, 36, 22, { font: style.font, weight: 700, color: "medal", maxWidth: 46 }),
                { type: "avatar", id: "avatar", name: "Avatar", hidden: false, x: 62, y: 10, opacity: 1, size: 36, shape: "circle", ring: 0, ringColor: "medal" },
                line("name", "Name", "{name}", 110, 28, 19, { font: style.font, weight: 700, color: BOARD.text, maxWidth: 200 }),
                line("level", "Level", "Level {level}", 110, 47, 15, { maxWidth: 200 }),
                line("punkte", "Punkte", "{xp}", 396, 30, 20, { font: style.font, weight: 700, color: BOARD.text, align: "right", maxWidth: 90 }),
                line("punkte-label", "PUNKTE", "PUNKTE", 396, 47, 12, { align: "right", maxWidth: 70 }),
                line("trend", "Trend", "{trend}", 442, 38, 15, { font: "Oxanium", weight: 700, color: "trend", align: "right", maxWidth: 40 }),
            ],
        },
        foot: classicFoot(),
    }),
    /** Das Podium als Treppe wie auf der Web-Rangliste, die Sockel in Medaillenfarbe. */
    arena: (style = DefaultBoardStyle()) => ({
        ...boardBase(style, "arena"),
        perPage: 10,
        head: classicHead(style, true),
        // Platz 3 steht 90 tiefer: alles Lesbare bleibt über 380 − 90 = 290, darunter liegt nur der Sockel (Review Plan 38).
        podium: {
            on: true,
            h: 400,
            w: 260,
            slotH: 380,
            gap: 24,
            offsets: [0, 50, 90],
            fill: null,
            fillOpacity: 0,
            shape: "rect",
            cut: 0,
            elements: [
                { type: "avatar", id: "avatar", name: "Avatar", hidden: false, x: 82, y: 6, opacity: 1, size: 96, shape: "circle", ring: 4, ringColor: "medal" },
                line("name", "Name", "{name}", 130, 130, 22, { font: style.font, weight: 700, color: BOARD.text, align: "center", maxWidth: 240 }),
                line("punkte", "Punkte", "{xp} Punkte", 130, 152, 18, { align: "center", maxWidth: 240 }),
                { type: "shape", id: "sockel", name: "Sockel", hidden: false, x: 0, y: 166, opacity: 0.3, shape: "rect", w: 260, h: 214, fill: "medal", stroke: null, strokeWidth: 0, cut: 0 },
                { type: "shape", id: "kante", name: "Kante", hidden: false, x: 0, y: 166, opacity: 1, shape: "rect", w: 260, h: 4, fill: "medal", stroke: null, strokeWidth: 0, cut: 0 },
                line("platz", "Platz", "{rank}", 130, 236, 56, { font: style.font, weight: 800, color: "medal", align: "center", maxWidth: 120 }),
                line("level", "Level", "LVL {level}", 130, 262, 18, { weight: 700, color: BOARD.text, align: "center", maxWidth: 200 }),
                line("trend", "Trend", "{trend}", 130, 284, 18, { font: "Oxanium", weight: 700, color: "trend", align: "center", maxWidth: 80 }),
            ],
        },
        row: classicRow(style.font),
        foot: classicFoot(),
    }),
};
