import { CleanGalleryPath } from "../../constants/Gallery";
import { BOARD_AREA_TYPES, BOARD_WIDTH, DESIGN_FONTS, DESIGN_SIZE, ELEMENT_LABEL, MAX_BOARD_TEXT, MAX_ELEMENTS, MAX_NAME, MAX_TEXT } from "../../constants/LevelDesign";
import { BoardArea, DesignKind, IBoardDesign, IBoardFill, IBoardStyle, ICardDesign, IDesignBackground, IDesignElement, ITextElement } from "../../interfaces/services/levels/ILevelDesign";

/**
 * Level System, Plan 35: was aus dem Designer im Dashboard kommt, wird hier
 * ein gültiges Design bzw. ein gültiger Ranglisten-Stil. Bilder nur aus der
 * Galerie - deshalb liegt das nicht bei den Konstanten, die auch das
 * Dashboard lädt.
 */

const HEX = /^#[0-9a-f]{6}$/i;
const ID = /^[a-z0-9_-]{1,24}$/i;
const WEIGHTS: readonly ITextElement["weight"][] = [400, 600, 700, 800];

function IsRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function Int(value: unknown, min: number, max: number, fallback: number): number {
    const number = Number(value);

    return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : Math.min(max, Math.max(min, fallback));
}

/** Plan 38: in der Rangliste darf eine Farbe auch eine Bedeutung sein (keywords). */
function Color(value: unknown, fallback: string, keywords: readonly string[] = []): string {
    return typeof value === "string" && (HEX.test(value) || keywords.includes(value)) ? value.toLowerCase() : fallback;
}

function OptionalColor(value: unknown, keywords: readonly string[] = []): string | null {
    return typeof value === "string" && (HEX.test(value) || keywords.includes(value)) ? value.toLowerCase() : null;
}

function Pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
    return allowed.includes(value as T) ? (value as T) : fallback;
}

function Line(value: unknown, max: number): string {
    return typeof value === "string" ? value.replace(/[\r\n]+/g, " ").slice(0, max) : "";
}

function Background(value: unknown): IDesignBackground {
    const raw = IsRecord(value) ? value : {};

    return {
        mode: Pick(raw.mode, ["image", "color", "gradient"] as const, "gradient"),
        image: CleanGalleryPath(raw.image),
        dim: Int(raw.dim, 0, 90, 40),
        color: Color(raw.color, "#0b0f1a"),
        to: Color(raw.to, "#1d1240"),
        shape: Pick(raw.shape, ["rect", "bevel", "round"] as const, "rect"),
        cut: Int(raw.cut, 0, 60, 16),
        border: OptionalColor(raw.border),
        borderWidth: Int(raw.borderWidth, 0, 8, 0),
    };
}

/** Ein Baustein, so dass er ganz auf der Fläche liegt - oder null, wenn er nichts taugt. */
function Element(value: unknown, width: number, height: number, keywords: readonly string[] = []): IDesignElement | null {
    if (!IsRecord(value)) return null;

    const color = (raw: unknown, fallback: string) => Color(raw, fallback, keywords);
    const optional = (raw: unknown) => OptionalColor(raw, keywords);

    const type = value.type;
    const base = (w: number, h: number) => ({
        id: typeof value.id === "string" && ID.test(value.id) ? value.id : "",
        name: Line(value.name, MAX_NAME).trim() || ELEMENT_LABEL[type as IDesignElement["type"]],
        hidden: value.hidden === true,
        x: Int(value.x, 0, Math.max(0, width - w), 0),
        y: Int(value.y, 0, Math.max(0, height - h), 0),
        opacity: Number.isFinite(Number(value.opacity)) ? Math.min(1, Math.max(0, Math.round(Number(value.opacity) * 100) / 100)) : 1,
    });

    switch (type) {
        case "text": {
            const size = Int(value.size, 10, 120, 32);
            const maxWidth = Int(value.maxWidth, 20, width, width);

            // x ist der Anker - linke Kante, Mitte oder rechte Kante - und bleibt auf der Fläche.
            return {
                type,
                ...base(0, Math.round(size * 1.05)),
                text: Line(value.text, MAX_TEXT),
                font: Pick(value.font, DESIGN_FONTS, "Oxanium"),
                size,
                weight: WEIGHTS.includes(value.weight as ITextElement["weight"]) ? (value.weight as ITextElement["weight"]) : 700,
                color: color(value.color, "#ffffff"),
                align: Pick(value.align, ["left", "center", "right"] as const, "left"),
                maxWidth,
            };
        }
        case "image": {
            const source = CleanGalleryPath(value.source);

            if (!source) return null;

            const w = Int(value.w, 8, width, 200);
            const h = Int(value.h, 8, height, 200);

            return { type, ...base(w, h), source, w, h, radius: Int(value.radius, 0, Math.floor(Math.min(w, h) / 2), 0) };
        }
        case "shape": {
            const shape = Pick(value.shape, ["rect", "bevel", "slant", "circle", "line"] as const, "rect");
            const w = Int(value.w, shape === "line" ? 0 : 4, width, 200);
            const h = Int(value.h, shape === "line" ? 0 : 4, height, 100);

            return {
                type,
                ...base(w, h),
                shape,
                w,
                h,
                fill: optional(value.fill),
                stroke: optional(value.stroke),
                strokeWidth: Int(value.strokeWidth, 0, 12, 0),
                cut: Int(value.cut, 0, Math.floor(Math.min(w, h) / 2), 0),
            };
        }
        // Quadratische Bausteine passen ganz auf die Fläche - auf dem Aufstieg höchstens 260.
        case "avatar": {
            const size = Int(value.size, 24, Math.min(300, width, height), 132);

            return { type, ...base(size, size), size, shape: Pick(value.shape, ["circle", "bevel"] as const, "circle"), ring: Int(value.ring, 0, 12, 4), ringColor: color(value.ringColor, "#a78bfa") };
        }
        case "bar": {
            const w = Int(value.w, 20, width, 500);
            const h = Int(value.h, 4, 60, 20);

            return {
                type,
                ...base(w, h),
                w,
                h,
                style: Pick(value.style, ["solid", "segments"] as const, "solid"),
                segments: Int(value.segments, 2, 40, 20),
                corner: Pick(value.corner, ["round", "bevel"] as const, "round"),
                from: color(value.from, "#7c3aed"),
                to: color(value.to, "#a78bfa"),
                track: color(value.track, "#2b2838"),
            };
        }
        case "ring": {
            const size = Int(value.size, 40, Math.min(300, width, height), 200);

            return {
                type,
                ...base(size, size),
                size,
                thickness: Int(value.thickness, 2, Math.floor(size / 4), 14),
                color: color(value.color, "#a78bfa"),
                track: color(value.track, "#2b2838"),
                inner: optional(value.inner),
                label: Line(value.label, MAX_NAME),
                value: Line(value.value, MAX_NAME),
                font: Pick(value.font, DESIGN_FONTS, "Oxanium"),
                textColor: color(value.textColor, "#ffffff"),
            };
        }
        case "icon": {
            const size = Int(value.size, 24, Math.min(300, width, height), 80);

            return { type, ...base(size, size), size, shape: Pick(value.shape, ["circle", "bevel", "square"] as const, "circle") };
        }
        default:
            return null;
    }
}

/**
 * Was aus dem Dashboard kommt, wird ein gültiges Design: unbekannte Bausteine
 * fallen weg, Zahlen werden geklemmt, Farben sind #rrggbb, Bilder nur aus der
 * Galerie, höchstens 30 Bausteine. null heißt: kein eigenes Design.
 */
export function CleanDesign(kind: DesignKind, input: unknown): ICardDesign | null {
    if (!IsRecord(input)) return null;

    const { width, height } = DESIGN_SIZE[kind];

    return { kind, template: Template(input.template), background: Background(input.background), elements: Elements(input.elements, width, height) };
}

function Template(value: unknown): string {
    return typeof value === "string" && ID.test(value) ? value : "eigen";
}

/** Höchstens 30 Bausteine mit eindeutiger ID; types: nur diese Arten (Plan 38, Bereiche der Rangliste). */
function Elements(list: unknown, width: number, height: number, types?: readonly IDesignElement["type"][], keywords: readonly string[] = []): IDesignElement[] {
    const elements: IDesignElement[] = [];
    const ids = new Set<string>();

    for (const raw of Array.isArray(list) ? list : []) {
        if (elements.length >= MAX_ELEMENTS) break;

        const element = Element(raw, width, height, keywords);

        if (!element || (types && !types.includes(element.type))) continue;

        if (!element.id || ids.has(element.id)) {
            let n = elements.length + 1;

            while (ids.has(`e${n}`)) n++;
            element.id = `e${n}`;
        }

        ids.add(element.id);
        elements.push(element);
    }

    return elements;
}

/* ----------------------------------------------------------
   Plan 38: das Ranglisten-Bild im Baukasten
   ---------------------------------------------------------- */
/** "accent" überall, "medal" und "trend" nur dort, wo es einen Platz gibt. */
const BOARD_KEYWORDS: Record<BoardArea, readonly string[]> = { head: ["accent"], foot: ["accent"], podium: ["accent", "medal", "trend"], row: ["accent", "medal", "trend"] };

function Fill(raw: Record<string, unknown>, keywords: readonly string[]): IBoardFill {
    return {
        fill: OptionalColor(raw.fill, keywords),
        fillOpacity: Int(raw.fillOpacity, 0, 100, 5),
        shape: Pick(raw.shape, ["rect", "bevel", "round"] as const, "bevel"),
        cut: Int(raw.cut, 0, 40, 10),
    };
}

/**
 * Was aus dem Ranglisten-Baukasten kommt, wird ein gültiges Design: Bereiche
 * mit geklemmten Maßen, je Bereich nur die erlaubten Bausteine, die ganz in
 * ihrem Bereich bzw. Platz liegen, Farben als #rrggbb oder mit Bedeutung.
 */
export function CleanBoardDesign(input: unknown): IBoardDesign | null {
    if (!IsRecord(input)) return null;

    const part = (value: unknown): Record<string, unknown> => (IsRecord(value) ? value : {});
    const head = part(input.head);
    const foot = part(input.foot);
    const podium = part(input.podium);
    const row = part(input.row);
    const medals = Array.isArray(input.medals) && input.medals.length === 3 && input.medals.every((color) => typeof color === "string" && HEX.test(color));
    const offsets = Array.isArray(podium.offsets) ? podium.offsets : [];

    const headH = Int(head.h, 40, 400, 140);
    const footH = Int(foot.h, 0, 300, 80);
    const gap = Int(podium.gap, 0, 60, 20);
    const podiumH = Int(podium.h, 120, 600, 320);
    const slotW = Int(podium.w, 120, Math.floor((BOARD_WIDTH - 2 * gap) / 3), 280);
    const slotH = Int(podium.slotH, 60, podiumH, 300);
    const columns = row.columns === 2 ? 2 : 1;
    const rowX = Int(row.x, 0, 200, 40);
    const rowGap = Int(row.gap, 0, 40, 8);
    const maxW = columns === 2 ? Math.floor((BOARD_WIDTH - rowX - rowGap) / 2) : BOARD_WIDTH - rowX;
    const rowW = Int(row.w, Math.min(200, maxW), maxW, maxW);
    const rowH = Int(row.h, 30, 200, 74);

    return {
        kind: "board",
        template: Template(input.template),
        background: Background(input.background),
        accent: Color(input.accent, "#8a4dff"),
        medals: medals ? ((input.medals as string[]).map((color) => color.toLowerCase()) as IBoardDesign["medals"]) : ["#facc15", "#cbd5e1", "#f59e0b"],
        glow: input.glow !== false,
        title: typeof input.title === "string" ? Line(input.title, MAX_BOARD_TEXT).trim() || "Rangliste" : "Rangliste",
        perPage: input.perPage === 20 ? 20 : 10,
        head: { h: headH, elements: Elements(head.elements, BOARD_WIDTH, headH, BOARD_AREA_TYPES.head, BOARD_KEYWORDS.head) },
        // Reihenfolge wie in den Vorlagen - das Studio vergleicht als Text.
        podium: {
            on: podium.on !== false,
            h: podiumH,
            w: slotW,
            slotH,
            gap,
            offsets: [0, 1, 2].map((index) => Int(offsets[index], 0, 200, [0, 40, 40][index])) as IBoardDesign["podium"]["offsets"],
            ...Fill(podium, BOARD_KEYWORDS.podium),
            elements: Elements(podium.elements, slotW, slotH, BOARD_AREA_TYPES.podium, BOARD_KEYWORDS.podium),
        },
        row: {
            x: rowX,
            w: rowW,
            h: rowH,
            gap: rowGap,
            columns,
            ...Fill(row, BOARD_KEYWORDS.row),
            highlight: OptionalColor(row.highlight),
            elements: Elements(row.elements, rowW, rowH, BOARD_AREA_TYPES.row, BOARD_KEYWORDS.row),
        },
        foot: { h: footH, elements: Elements(foot.elements, BOARD_WIDTH, footH, BOARD_AREA_TYPES.foot, BOARD_KEYWORDS.foot) },
    };
}

/** Der Stil des Ranglisten-Bilds: was fehlt oder nicht taugt, bleibt wie vorher. */
export function CleanBoardStyle(input: unknown, previous: IBoardStyle): IBoardStyle {
    const raw = IsRecord(input) ? input : {};
    const medals = Array.isArray(raw.medals) && raw.medals.length === 3 && raw.medals.every((color) => typeof color === "string" && HEX.test(color));
    const text = (value: unknown, fallback: string) => (typeof value === "string" ? Line(value, MAX_BOARD_TEXT).trim() : fallback);

    return {
        image: raw.image === undefined ? previous.image : CleanGalleryPath(raw.image),
        dim: Int(raw.dim, 0, 90, previous.dim),
        accent: Color(raw.accent, previous.accent),
        medals: medals ? ((raw.medals as string[]).map((color) => color.toLowerCase()) as IBoardStyle["medals"]) : previous.medals,
        font: Pick(raw.font, DESIGN_FONTS, previous.font),
        title: text(raw.title, previous.title),
        subtitle: text(raw.subtitle, previous.subtitle),
        podium: typeof raw.podium === "boolean" ? raw.podium : previous.podium,
    };
}
