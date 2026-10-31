import { Image, SKRSContext2D, createCanvas, loadImage } from "@napi-rs/canvas";
import { RegisterFonts } from "./RankCard";
import { Load } from "./WelcomeCard";
import { CARD_BASELINE, CARD_SCALE } from "../constants/Welcome";
import { DESIGN_SIZE } from "../constants/LevelDesign";
import { ResolveImagePath } from "../constants/Gallery";
import {
    IAvatarElement,
    IBarElement,
    ICardDesign,
    IDesignBackground,
    IDesignBox,
    IDesignElement,
    IIconElement,
    IImageElement,
    IRingElement,
    IShapeElement,
    ITextElement,
} from "../interfaces/services/levels/ILevelDesign";

/**
 * Zeichnet ein Design aus dem Level-Designer (Plan 35): Level-Karte oder
 * Aufstiegs-Bild. Erst der Hintergrund, dann die Bausteine in ihrer
 * Reihenfolge, der erste ganz hinten.
 *
 * Fehlt ein Bild (aus der Galerie gelöscht, Avatar nicht ladbar), bleibt die
 * Stelle leer bzw. grau - die Karte entsteht immer. Zurück kommen das PNG und
 * die Rahmen der Bausteine; über die legt die Bühne im Dashboard ihre Griffe.
 */

export interface IDesignData {
    /** Die Platzhalter ohne Klammern: "user.name" → "MecryTv | Joe". */
    values: Record<string, string>;
    avatarUrl: string | null;
    iconUrl: string | null;
    /** Fortschritt im aktuellen Level, 0 bis 1 - für Balken und Ring. */
    share: number;
}

/** Für die Prüfungen: jeder Text, wie er wirklich gezeichnet wurde. */
export interface IDesignHooks {
    onText?: (text: string) => void;
}

const PLACEHOLDER = /\{([a-z.]+)\}/g;
/** Kleiner als 60 % wird kein Text - dann lieber „…“. */
const FLOOR = 0.6;
const EMPTY = "#151a22";
/** Oxanium, Orbitron und Rajdhani kennen keinen Pfeil - er wird gezeichnet, so breit wie 0,8 × Schriftgröße. */
const ARROW = "→";
const ARROW_WIDTH = 0.8;

export function FillDesign(text: string, values: Record<string, string>): string {
    return text.replace(PLACEHOLDER, (match, key: string) => values[key] ?? match);
}

function Bevel(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, cut: number): void {
    ctx.beginPath();
    ctx.moveTo(x + cut, y);
    ctx.lineTo(x + w - cut, y);
    ctx.lineTo(x + w, y + cut);
    ctx.lineTo(x + w, y + h - cut);
    ctx.lineTo(x + w - cut, y + h);
    ctx.lineTo(x + cut, y + h);
    ctx.lineTo(x, y + h - cut);
    ctx.lineTo(x, y + cut);
    ctx.closePath();
}

/** Der Umriss einer Fläche - auch Avatar, Icon und Balken nutzen ihn. */
function Outline(ctx: SKRSContext2D, shape: IShapeElement["shape"] | "round" | "square", x: number, y: number, w: number, h: number, cut: number): void {
    if (shape === "circle") {
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        ctx.closePath();
    } else if (shape === "bevel") Bevel(ctx, x, y, w, h, cut);
    else if (shape === "round") {
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, Math.min(w, h) / 2);
    } else if (shape === "slant") {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w - cut, y + h);
        ctx.lineTo(x, y + h);
        ctx.closePath();
    } else {
        ctx.beginPath();
        ctx.rect(x, y, w, h);
    }
}

/** Füllend und mittig beschnitten, wie background-size: cover. */
function Cover(ctx: SKRSContext2D, image: Image, x: number, y: number, w: number, h: number): void {
    const scale = Math.max(w / image.width, h / image.height);
    const sw = w / scale;
    const sh = h / scale;

    ctx.drawImage(image, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh, x, y, w, h);
}

/** Galeriebilder immer frisch von der Platte - ein gelöschtes oder ersetztes Bild soll nicht weiter auftauchen. */
function Gallery(source: string | null): Promise<Image | null> {
    const file = source ? ResolveImagePath(source) : null;

    return file ? loadImage(file).catch(() => null) : Promise.resolve(null);
}

/** Plan 36: der Umriss des ganzen Bilds. */
export function Frame(ctx: SKRSContext2D, background: IDesignBackground, width: number, height: number, inset = 0): void {
    const x = inset;
    const w = width - inset * 2;
    const h = height - inset * 2;

    if (background.shape === "bevel") Bevel(ctx, x, x, w, h, background.cut);
    else {
        ctx.beginPath();
        ctx.roundRect(x, x, w, h, background.shape === "round" ? background.cut : 0);
    }
}

export async function Background(ctx: SKRSContext2D, background: IDesignBackground, width: number, height: number): Promise<void> {
    ctx.fillStyle = background.color;
    ctx.fillRect(0, 0, width, height);

    if (background.mode === "gradient") {
        const gradient = ctx.createLinearGradient(0, 0, width, height);

        gradient.addColorStop(0, background.color);
        gradient.addColorStop(1, background.to);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
    }

    if (background.mode !== "image") return;

    const image = await Gallery(background.image);

    if (!image) return;

    Cover(ctx, image, 0, 0, width, height);
    ctx.fillStyle = `rgba(0,0,0,${background.dim / 100})`;
    ctx.fillRect(0, 0, width, height);
}

/** Breite in der aktuellen Schrift, Pfeile mitgerechnet. */
function Width(ctx: SKRSContext2D, text: string, size: number): number {
    const parts = text.split(ARROW);

    return parts.reduce((sum, part) => sum + (part ? ctx.measureText(part).width : 0), 0) + (parts.length - 1) * size * ARROW_WIDTH;
}

/** Erst kleiner bis 60 %, dann kürzen - wie die Welcome Card. */
function Fit(ctx: SKRSContext2D, text: string, element: Pick<ITextElement, "font" | "weight" | "size">, max: number): { text: string; size: number } {
    const floor = Math.round(element.size * FLOOR);
    let size = element.size;

    ctx.font = `${element.weight} ${size}px ${element.font}`;

    while (size > floor && Width(ctx, text, size) > max) {
        size -= 1;
        ctx.font = `${element.weight} ${size}px ${element.font}`;
    }

    if (Width(ctx, text, size) <= max) return { text, size };

    let cut = text;

    while (cut.length > 1 && Width(ctx, `${cut}…`, size) > max) cut = cut.slice(0, -1);

    return { text: `${cut}…`, size };
}

function Arrow(ctx: SKRSContext2D, x: number, y: number, size: number): void {
    const width = size * ARROW_WIDTH;
    const pad = width * 0.15;
    const head = size * 0.2;

    ctx.save();
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = Math.max(1.5, size * 0.08);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(x + pad, y);
    ctx.lineTo(x + width - pad, y);
    ctx.moveTo(x + width - pad - head, y - head);
    ctx.lineTo(x + width - pad, y);
    ctx.lineTo(x + width - pad - head, y + head);
    ctx.stroke();
    ctx.restore();
}

/** Zeichnet eine Zeile samt Pfeilen. Zurück kommt die linke Kante und die Breite. */
function Draw(ctx: SKRSContext2D, text: string, x: number, baseline: number, align: ITextElement["align"], size: number): { left: number; width: number } {
    const width = Width(ctx, text, size);
    const start = align === "center" ? x - width / 2 : align === "right" ? x - width : x;
    let left = start;

    ctx.textAlign = "left";
    text.split(ARROW).forEach((part, index, parts) => {
        if (part) {
            ctx.fillText(part, left, baseline);
            left += ctx.measureText(part).width;
        }

        if (index < parts.length - 1) {
            Arrow(ctx, left, baseline - size * 0.32, size);
            left += size * ARROW_WIDTH;
        }
    });

    return { left: start, width };
}

function Text(ctx: SKRSContext2D, element: ITextElement, data: IDesignData, hooks: IDesignHooks): IDesignBox {
    const fitted = Fit(ctx, FillDesign(element.text, data.values), element, element.maxWidth);

    ctx.fillStyle = element.color;

    // Die Grundlinie bleibt, wo sie bei voller Größe wäre - ein kleinerer Name rutscht nicht nach oben.
    const drawn = Draw(ctx, fitted.text, element.x, element.y + element.size * CARD_BASELINE, element.align, fitted.size);

    hooks.onText?.(fitted.text);

    return { id: element.id, x: Math.max(0, Math.round(drawn.left)), y: element.y, w: Math.ceil(drawn.width), h: Math.round(element.size * 1.05) };
}

function Shape(ctx: SKRSContext2D, element: IShapeElement): void {
    const { x, y, w, h } = element;

    if (element.shape === "line") {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + w, y + h);
        ctx.strokeStyle = element.stroke ?? element.fill ?? "#ffffff";
        ctx.lineWidth = Math.max(1, element.strokeWidth);
        ctx.stroke();

        return;
    }

    Outline(ctx, element.shape, x, y, w, h, element.cut);

    if (element.fill) {
        ctx.fillStyle = element.fill;
        ctx.fill();
    }

    if (element.stroke && element.strokeWidth > 0) {
        ctx.strokeStyle = element.stroke;
        ctx.lineWidth = element.strokeWidth;
        ctx.stroke();
    }
}

/** Avatar und Server-Icon: ausgeschnitten, ohne Bild ein grauer Kreis. */
async function Picture(ctx: SKRSContext2D, element: IAvatarElement | IIconElement, source: string | null): Promise<void> {
    const { x, y, size } = element;
    const shape = element.shape;
    const cut = Math.round(size * 0.18);
    const image = await Load(source);

    ctx.save();
    Outline(ctx, shape, x, y, size, size, cut);
    ctx.clip();
    ctx.fillStyle = EMPTY;
    ctx.fillRect(x, y, size, size);

    if (image) Cover(ctx, image, x, y, size, size);

    ctx.restore();

    if (element.type === "avatar" && element.ring > 0) {
        Outline(ctx, shape, x, y, size, size, cut);
        ctx.strokeStyle = element.ringColor;
        ctx.lineWidth = element.ring;
        ctx.stroke();
    }
}

async function Photo(ctx: SKRSContext2D, element: IImageElement): Promise<void> {
    const image = await Gallery(element.source);

    if (!image) return;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(element.x, element.y, element.w, element.h, element.radius);
    ctx.clip();
    Cover(ctx, image, element.x, element.y, element.w, element.h);
    ctx.restore();
}

function Bar(ctx: SKRSContext2D, element: IBarElement, share: number): void {
    const { x, y, w, h } = element;
    const fill = ctx.createLinearGradient(x, 0, x + w, 0);

    fill.addColorStop(0, element.from);
    fill.addColorStop(1, element.to);

    if (element.style === "segments") {
        // Felder als schräge Parallelogramme, wie der HUD-Entwurf.
        const gap = Math.max(2, Math.round(w * 0.006));
        const skew = Math.round(h * 0.36);
        const each = (w - skew - gap * (element.segments - 1)) / element.segments;
        const filled = Math.round(share * element.segments);

        for (let i = 0; i < element.segments; i++) {
            const left = x + i * (each + gap);

            ctx.beginPath();
            ctx.moveTo(left + skew, y);
            ctx.lineTo(left + skew + each, y);
            ctx.lineTo(left + each, y + h);
            ctx.lineTo(left, y + h);
            ctx.closePath();
            ctx.fillStyle = i < filled ? fill : element.track;
            ctx.fill();
        }

        return;
    }

    const corner = element.corner === "round" ? "round" : "bevel";
    const cut = Math.min(6, Math.floor(h / 3));

    Outline(ctx, corner, x, y, w, h, cut);
    ctx.fillStyle = element.track;
    ctx.fill();

    if (share <= 0) return;

    ctx.save();
    Outline(ctx, corner, x, y, w, h, cut);
    ctx.clip();
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, Math.max(h, w * share), h);
    ctx.restore();
}

function Ring(ctx: SKRSContext2D, element: IRingElement, data: IDesignData, hooks: IDesignHooks): void {
    const { size, thickness } = element;
    const cx = element.x + size / 2;
    const cy = element.y + size / 2;
    const radius = size / 2 - thickness / 2;

    if (element.inner) {
        ctx.beginPath();
        ctx.arc(cx, cy, size / 2 - thickness, 0, Math.PI * 2);
        ctx.fillStyle = element.inner;
        ctx.fill();
    }

    ctx.lineWidth = thickness;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = element.track;
    ctx.stroke();

    if (data.share > 0) {
        ctx.beginPath();
        ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, data.share));
        ctx.strokeStyle = element.color;
        ctx.stroke();
    }

    const inside = (size - thickness * 2) * 0.8;
    const valueSize = Math.round(size * 0.32);
    const labelSize = Math.max(10, Math.round(size * 0.075));

    ctx.fillStyle = element.textColor;

    if (element.label) {
        const label = Fit(ctx, FillDesign(element.label, data.values), { font: "Rajdhani", weight: 600, size: labelSize }, inside);

        ctx.globalAlpha *= 0.75;
        Draw(ctx, label.text, cx, cy - valueSize * 0.38, "center", label.size);
        ctx.globalAlpha /= 0.75;
        hooks.onText?.(label.text);
    }

    const value = Fit(ctx, FillDesign(element.value, data.values), { font: element.font, weight: 800, size: valueSize }, inside);

    Draw(ctx, value.text, cx, cy + valueSize * (element.label ? 0.5 : 0.3), "center", value.size);
    hooks.onText?.(value.text);
}

function Box(element: Exclude<IDesignElement, ITextElement>): IDesignBox {
    if (element.type === "avatar" || element.type === "ring" || element.type === "icon") return { id: element.id, x: element.x, y: element.y, w: element.size, h: element.size };

    // Eine Linie ohne Breite oder Höhe braucht trotzdem etwas zum Greifen.
    return { id: element.id, x: element.x, y: element.y, w: Math.max(4, element.w), h: Math.max(4, element.h) };
}

/** Die Farbfelder der Bausteine - Plan 38 setzt dort Farben mit Bedeutung ein. */
const COLOR_KEYS = ["color", "fill", "stroke", "ringColor", "from", "to", "track", "inner", "textColor"] as const;

/**
 * Plan 38: "accent", "medal" und "trend" in Farbfeldern werden zur Farbe
 * dieses Bilds bzw. Platzes. Was es nicht gibt, wird weiß statt unsichtbar.
 */
export function ResolveColors<T extends IDesignElement>(element: T, colors: Record<string, string>): T {
    const next = { ...element } as Record<string, unknown>;

    for (const key of COLOR_KEYS) {
        const value = next[key];

        if (typeof value === "string" && !value.startsWith("#")) next[key] = colors[value] ?? "#ffffff";
    }

    return next as T;
}

/**
 * Die Bausteine in ihrer Reihenfolge, der erste ganz hinten. Plan 38: mit
 * Farben mit Bedeutung - die Rangliste zeichnet so Kopf, Fuß und jeden Platz.
 * Zurück kommen die Rahmen, in den Koordinaten der Bausteine.
 */
export async function DrawElements(ctx: SKRSContext2D, elements: readonly IDesignElement[], data: IDesignData, hooks: IDesignHooks = {}, colors: Record<string, string> = {}): Promise<IDesignBox[]> {
    const boxes: IDesignBox[] = [];

    for (const raw of elements) {
        if (raw.hidden) continue;

        const element = ResolveColors(raw, colors);

        ctx.save();
        ctx.globalAlpha *= element.opacity;

        if (element.type === "text") boxes.push(Text(ctx, element, data, hooks));
        else {
            if (element.type === "shape") Shape(ctx, element);
            else if (element.type === "image") await Photo(ctx, element);
            else if (element.type === "avatar") await Picture(ctx, element, data.avatarUrl);
            else if (element.type === "icon") await Picture(ctx, element, data.iconUrl);
            else if (element.type === "bar") Bar(ctx, element, data.share);
            else Ring(ctx, element, data, hooks);

            boxes.push(Box(element));
        }

        ctx.restore();
    }

    return boxes;
}

/** Plan 36: Rand um das ganze Bild, nach allem anderen. */
export function Border(ctx: SKRSContext2D, background: IDesignBackground, width: number, height: number): void {
    if (!background.border || background.borderWidth <= 0) return;

    Frame(ctx, background, width, height, background.borderWidth / 2);
    ctx.strokeStyle = background.border;
    ctx.lineWidth = background.borderWidth;
    ctx.stroke();
}

export async function RenderDesign(design: ICardDesign, data: IDesignData, scale = CARD_SCALE, hooks: IDesignHooks = {}): Promise<{ png: Buffer; boxes: IDesignBox[] }> {
    await RegisterFonts();

    const { width, height } = DESIGN_SIZE[design.kind];
    const canvas = createCanvas(width * scale, height * scale);
    const ctx = canvas.getContext("2d");

    ctx.scale(scale, scale);
    ctx.textBaseline = "alphabetic";
    // Alles liegt in der Form des Hintergrunds - außerhalb bleibt das Bild durchsichtig.
    ctx.save();
    Frame(ctx, design.background, width, height);
    ctx.clip();
    await Background(ctx, design.background, width, height);

    const boxes = await DrawElements(ctx, design.elements, data, hooks);

    ctx.restore();

    Border(ctx, design.background, width, height);

    // Kodieren außerhalb des Haupt-Threads, wie die Rang-Karte.
    return { png: await canvas.encode("png"), boxes };
}
