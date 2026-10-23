import { Image, SKRSContext2D, createCanvas, loadImage } from "@napi-rs/canvas";
import { RegisterFonts } from "./RankCard";
import { CARD_HEIGHT, CARD_SCALE, CARD_WIDTH, MAX_AVATAR, MAX_RING, MIN_AVATAR } from "../constants/Welcome";
import { IWelcomeCard, WelcomeFont } from "../interfaces/services/welcome/IWelcome";

/**
 * Die Begrüßungskarte als PNG, in vier Layouts.
 *
 * Gezeichnet wird in logischen Pixeln (1000 × 340) auf einer doppelt so großen
 * Fläche - Discord verkleinert das Bild ohnehin, und so bleibt die Schrift auf
 * jedem Bildschirm scharf. Jedes Stück lässt sich abschalten; die Karte rückt
 * dann zusammen, statt Löcher zu lassen.
 */

export interface IWelcomeCardData {
    card: IWelcomeCard;
    /** Die fertigen Zeilen - Platzhalter sind schon ersetzt. */
    title: string;
    subtitle: string;
    footer: string;
    avatarURL: string | null;
    iconURL: string | null;
    /** Dateipfad des Hintergrunds, sofern hochgeladen. */
    backgroundPath: string | null;
}

const W = CARD_WIDTH;
const H = CARD_HEIGHT;

/** Für Linien und Schein, wenn der Akzent aus ist: ein kühles Grau statt einer Farbe. */
const NEUTRAL = "#c9d1dc";

const HEX = /^#[0-9a-f]{6}$/i;

/** Eine Farbe mit Deckkraft - der Kanvas kennt kein color-mix. */
function Alpha(hex: string, alpha: number): string {
    const value = Number.parseInt(hex.slice(1), 16);

    return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
}

function Clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
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

function Rounded(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
}

/**
 * Die Schrift der Überschrift. Orbitron läuft breit, Rajdhani schmal - die
 * Größe gleicht das aus, damit "48" bei jeder Schrift ungefähr gleich wirkt.
 */
function TitleFont(font: WelcomeFont, size: number): string {
    if (font === "orbitron") return `700 ${Math.round(size * 0.8)}px Orbitron`;
    if (font === "rajdhani") return `700 ${Math.round(size * 1.12)}px Rajdhani`;

    return `800 ${size}px Oxanium`;
}

/** Schneidet ab, was nicht in die Breite passt. */
function Ellipsis(ctx: SKRSContext2D, text: string, max: number): string {
    if (ctx.measureText(text).width <= max) return text;

    let cut = text;

    while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) cut = cut.slice(0, -1);

    return `${cut}…`;
}

/** Erst kleiner, dann kürzen: ein langer Name soll lesbar bleiben, statt gleich mit … zu enden. */
function FitTitle(ctx: SKRSContext2D, text: string, font: WelcomeFont, size: number, max: number): { text: string; size: number } {
    const floor = Math.round(size * 0.62);
    let current = size;

    ctx.font = TitleFont(font, current);

    while (current > floor && ctx.measureText(text).width > max) {
        current -= 2;
        ctx.font = TitleFont(font, current);
    }

    return { text: Ellipsis(ctx, text, max), size: current };
}

const cache = new Map<string, Promise<Image | null>>();

/** Bilder einmal laden - Avatare ändern sich selten, ein Server-Icon fast nie. */
function Load(source: string | null): Promise<Image | null> {
    if (!source) return Promise.resolve(null);

    let image = cache.get(source);

    if (!image) {
        image = loadImage(source).catch(() => null);
        // ponytail: kleiner Zwischenspeicher, geleert ab 200 Bildern. Reicht für Beitrittswellen.
        if (cache.size > 200) cache.clear();
        cache.set(source, image);
    }

    return image;
}

/** Was eine Karte zum Zeichnen braucht, einmal ausgerechnet. */
interface IPaint {
    ctx: SKRSContext2D;
    card: IWelcomeCard;
    data: IWelcomeCardData;
    /** Die Akzentfarbe - oder das Grau, wenn der Akzent aus ist. */
    tone: string;
    accentOn: boolean;
    hasImage: boolean;
    footerColor: string;
}

async function DrawBackground(paint: IPaint): Promise<void> {
    const { ctx, card, tone } = paint;
    const image = paint.data.backgroundPath ? await loadImage(paint.data.backgroundPath).catch(() => null) : null;

    paint.hasImage = Boolean(image);

    if (image) {
        // Füllend einpassen, ohne zu verzerren - was übersteht, wird mittig abgeschnitten.
        const scale = Math.max(W / image.width, H / image.height);
        const width = image.width * scale;
        const height = image.height * scale;

        ctx.drawImage(image, (W - width) / 2, (H - height) / 2, width, height);

        // Der Schleier hält den Text lesbar, egal wie hell das Bild ist.
        ctx.fillStyle = `rgba(5,6,8,${Clamp(card.dim, 0, 90) / 100})`;
        ctx.fillRect(0, 0, W, H);

        return;
    }

    // Ohne Bild: fast schwarz, darüber ein weicher Schein oben rechts und ein
    // schwächerer unten links, dazu feine Diagonalen als Struktur.
    ctx.fillStyle = "#07090d";
    ctx.fillRect(0, 0, W, H);

    const high = ctx.createRadialGradient(W * 0.84, -60, 10, W * 0.84, -60, 560);

    high.addColorStop(0, Alpha(tone, paint.accentOn ? 0.42 : 0.2));
    high.addColorStop(1, Alpha(tone, 0));
    ctx.fillStyle = high;
    ctx.fillRect(0, 0, W, H);

    const low = ctx.createRadialGradient(W * 0.08, H + 80, 10, W * 0.08, H + 80, 420);

    low.addColorStop(0, Alpha(tone, paint.accentOn ? 0.2 : 0.1));
    low.addColorStop(1, Alpha(tone, 0));
    ctx.fillStyle = low;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.028)";
    ctx.lineWidth = 1;

    for (let x = -H; x < W; x += 22) {
        ctx.beginPath();
        ctx.moveTo(x, H);
        ctx.lineTo(x + H, 0);
        ctx.stroke();
    }

    ctx.restore();
}

/** Dunkelt die Seite ab, auf der der Text steht - nur nötig, wenn ein Bild darunter liegt. */
function Scrim(paint: IPaint, from: "left" | "center"): void {
    if (!paint.hasImage) return;

    const { ctx } = paint;

    if (from === "left") {
        const shade = ctx.createLinearGradient(0, 0, W * 0.78, 0);

        shade.addColorStop(0, "rgba(4,5,8,0.78)");
        shade.addColorStop(0.6, "rgba(4,5,8,0.45)");
        shade.addColorStop(1, "rgba(4,5,8,0)");
        ctx.fillStyle = shade;
    } else {
        const shade = ctx.createRadialGradient(W / 2, H * 0.62, 40, W / 2, H * 0.62, W * 0.6);

        shade.addColorStop(0, "rgba(4,5,8,0.62)");
        shade.addColorStop(1, "rgba(4,5,8,0.1)");
        ctx.fillStyle = shade;
    }

    ctx.fillRect(0, 0, W, H);
}

async function DrawAvatar(paint: IPaint, x: number, y: number, size: number): Promise<void> {
    const { ctx, card, tone } = paint;
    const shape = (): void => {
        if (card.avatarShape === "circle") {
            ctx.beginPath();
            ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
            ctx.closePath();
        } else {
            Bevel(ctx, x, y, size, size, Math.round(size * 0.13));
        }
    };

    // Ein Schein hinter dem Avatar hebt ihn vom Hintergrund ab.
    ctx.save();
    ctx.shadowColor = Alpha(tone, paint.accentOn ? 0.55 : 0.28);
    ctx.shadowBlur = 30;
    shape();
    ctx.fillStyle = "#0b0f15";
    ctx.fill();
    ctx.restore();

    const avatar = await Load(paint.data.avatarURL);

    ctx.save();
    shape();
    ctx.clip();
    ctx.fillStyle = "#151a22";
    ctx.fillRect(x, y, size, size);

    if (avatar) ctx.drawImage(avatar, x, y, size, size);

    ctx.restore();

    const ring = Clamp(card.ringWidth, 0, MAX_RING);

    if (ring > 0) {
        ctx.lineWidth = ring;
        ctx.strokeStyle = paint.accentOn ? card.accent : "rgba(242,244,247,0.9)";
        shape();
        ctx.stroke();
    }
}

async function DrawIcon(paint: IPaint, x: number, y: number, size: number): Promise<void> {
    if (!paint.card.icon) return;

    const icon = await Load(paint.data.iconURL);

    if (!icon) return;

    const { ctx } = paint;

    ctx.save();
    Rounded(ctx, x, y, size, size, 12);
    ctx.clip();
    ctx.drawImage(icon, x, y, size, size);
    ctx.restore();

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    Rounded(ctx, x, y, size, size, 12);
    ctx.stroke();
}

/**
 * Die drei Zeilen. align "left" beginnt bei x, "center" steht mittig um x.
 * top: wo der Block beginnt - ohne Angabe steht er senkrecht in der Mitte.
 * divider: eine kurze Linie zwischen Unterzeile und kleiner Zeile.
 */
function DrawText(paint: IPaint, x: number, max: number, align: "left" | "center", options: { top?: number; divider?: boolean; chip?: boolean } = {}): void {
    const { ctx, card, data } = paint;
    const fitted = data.title ? FitTitle(ctx, data.title, card.font, Clamp(card.titleSize, 28, 72), max) : null;
    const rows: { kind: "title" | "subtitle" | "divider" | "footer"; height: number }[] = [];

    if (fitted) rows.push({ kind: "title", height: Math.round(fitted.size * 1.04) });
    if (data.subtitle) rows.push({ kind: "subtitle", height: 34 });
    if (data.footer && options.divider) rows.push({ kind: "divider", height: 22 });
    if (data.footer) rows.push({ kind: "footer", height: options.chip ? 50 : 30 });

    const block = rows.reduce((sum, row) => sum + row.height, 0);
    let y = options.top ?? Math.round(H / 2 - block / 2);

    ctx.textAlign = align;
    ctx.textBaseline = "alphabetic";

    for (const row of rows) {
        if (row.kind === "title" && fitted) {
            ctx.save();
            ctx.font = TitleFont(card.font, fitted.size);
            ctx.fillStyle = card.titleColor;
            ctx.shadowColor = "rgba(0,0,0,0.55)";
            ctx.shadowBlur = 14;
            ctx.shadowOffsetY = 2;
            ctx.fillText(fitted.text, x, y + Math.round(fitted.size * 0.82));
            ctx.restore();
        }

        if (row.kind === "subtitle") {
            ctx.save();
            ctx.font = "600 26px Rajdhani";
            ctx.fillStyle = card.subtitleColor;
            ctx.shadowColor = "rgba(0,0,0,0.5)";
            ctx.shadowBlur = 10;
            ctx.fillText(Ellipsis(ctx, data.subtitle, max), x, y + 26);
            ctx.restore();
        }

        if (row.kind === "divider") {
            const width = 56;

            ctx.fillStyle = paint.accentOn ? card.accent : "rgba(255,255,255,0.28)";
            ctx.fillRect(align === "center" ? x - width / 2 : x, y + 9, width, 3);
        }

        if (row.kind === "footer") {
            ctx.font = "600 21px Rajdhani";

            if (options.chip) {
                // Die kleine Zeile als Marke - im HUD-Layout wie die Abzeichen der Rang-Karte.
                const text = Ellipsis(ctx, data.footer, max - 32);
                const width = ctx.measureText(text).width + 32;
                const left = align === "center" ? x - width / 2 : x;

                Bevel(ctx, left, y + 10, width, 34, 9);
                ctx.fillStyle = Alpha(paint.footerColor, 0.12);
                ctx.fill();
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = Alpha(paint.footerColor, 0.7);
                ctx.stroke();
                ctx.fillStyle = paint.footerColor;
                ctx.textAlign = "left";
                ctx.fillText(text, left + 16, y + 34);
                ctx.textAlign = align;
            } else {
                ctx.fillStyle = paint.footerColor;
                ctx.fillText(Ellipsis(ctx, data.footer, max), x, y + 22);
            }
        }

        y += row.height;
    }
}

/* ----------------------------------------------------------
   Die vier Layouts
   ---------------------------------------------------------- */
async function Classic(paint: IPaint): Promise<void> {
    const { ctx, card } = paint;

    Scrim(paint, "left");

    // Der Streifen am linken Rand, mit einem Schein, der in die Karte läuft.
    if (paint.accentOn) {
        const glow = ctx.createLinearGradient(0, 0, 140, 0);

        glow.addColorStop(0, Alpha(card.accent, 0.22));
        glow.addColorStop(1, Alpha(card.accent, 0));
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, 140, H);
        ctx.fillStyle = card.accent;
        ctx.fillRect(0, 0, 6, H);
    }

    const pad = 52;
    const size = Clamp(card.avatarSize, MIN_AVATAR, MAX_AVATAR);
    const left = card.avatar ? pad + size + 40 : pad;
    const right = W - pad - (card.icon && paint.data.iconURL ? 70 : 0);

    if (card.avatar) await DrawAvatar(paint, pad, Math.round(H / 2 - size / 2), size);

    DrawText(paint, left, Math.max(160, right - left), "left", { divider: true });
    await DrawIcon(paint, W - 28 - 54, 28, 54);
}

async function Center(paint: IPaint): Promise<void> {
    const { card } = paint;

    Scrim(paint, "center");

    // Mittig ist oben wenig Platz: der Avatar bleibt kleiner, sonst drückt er den Text aus der Karte.
    const size = Clamp(card.avatarSize, MIN_AVATAR, 132);
    const top = 30;

    if (card.avatar) await DrawAvatar(paint, Math.round(W / 2 - size / 2), top, size);

    DrawText(paint, W / 2, W - 160, "center", { top: card.avatar ? top + size + 18 : undefined, divider: true });
    await DrawIcon(paint, W - 26 - 50, 26, 50);
    Frame(paint, 0.5);
}

async function Panel(paint: IPaint): Promise<void> {
    const { ctx, card } = paint;
    const x = 26;
    const y = 26;
    const width = 620;
    const height = H - 52;

    // Die Fläche: dunkel und leicht durchscheinend, damit das Bild noch durchkommt.
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 30;
    Bevel(ctx, x, y, width, height, 22);
    ctx.fillStyle = paint.hasImage ? "rgba(6,8,12,0.8)" : "rgba(13,17,24,0.92)";
    ctx.fill();
    ctx.restore();

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = paint.accentOn ? Alpha(card.accent, 0.6) : "rgba(255,255,255,0.14)";
    Bevel(ctx, x, y, width, height, 22);
    ctx.stroke();

    if (paint.accentOn) {
        ctx.fillStyle = card.accent;
        ctx.fillRect(x, y + 22, 4, height - 44);
    }

    const size = Clamp(card.avatarSize, MIN_AVATAR, 156);
    const inner = x + 34;
    const left = card.avatar ? inner + size + 30 : inner;

    if (card.avatar) await DrawAvatar(paint, inner, Math.round(H / 2 - size / 2), size);

    DrawText(paint, left, x + width - 30 - left, "left", { divider: true });
    await DrawIcon(paint, W - 28 - 54, 28, 54);
}

async function Hud(paint: IPaint): Promise<void> {
    const { ctx, card } = paint;

    Scrim(paint, "left");

    // Feine Zeilen wie auf einem Bildschirm - nur als Struktur, kaum zu sehen.
    ctx.fillStyle = "rgba(255,255,255,0.022)";

    for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);

    // Kleinere Schräge als sonst: die Eckwinkel sitzen innen, die Schräge darf sie nicht schneiden.
    Frame(paint, 1, 14);

    // Eckwinkel in allen vier Ecken.
    const corner = 34;
    const inset = 18;
    const color = paint.accentOn ? card.accent : "rgba(242,244,247,0.55)";

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;

    if (paint.accentOn) {
        ctx.shadowColor = Alpha(card.accent, 0.7);
        ctx.shadowBlur = 12;
    }

    for (const [cx, cy, dx, dy] of [
        [inset, inset, 1, 1],
        [W - inset, inset, -1, 1],
        [inset, H - inset, 1, -1],
        [W - inset, H - inset, -1, -1],
    ] as const) {
        ctx.beginPath();
        ctx.moveTo(cx, cy + dy * corner);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx + dx * corner, cy);
        ctx.stroke();
    }

    ctx.restore();

    const pad = 58;
    const size = Clamp(card.avatarSize, MIN_AVATAR, 180);
    const left = card.avatar ? pad + size + 40 : pad;
    const right = W - pad - (card.icon && paint.data.iconURL ? 70 : 0);

    if (card.avatar) await DrawAvatar(paint, pad, Math.round(H / 2 - size / 2), size);

    DrawText(paint, left, Math.max(160, right - left), "left", { chip: true });
    await DrawIcon(paint, W - 34 - 52, 34, 52);
}

/** Ein dünner, abgeschrägter Rahmen - in der Akzentfarbe oder neutral. */
function Frame(paint: IPaint, strength: number, cut = 24): void {
    const { ctx, card } = paint;

    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = paint.accentOn ? Alpha(card.accent, 0.55 * strength + 0.2) : `rgba(255,255,255,${0.1 + 0.06 * strength})`;

    if (paint.accentOn && strength >= 1) {
        ctx.shadowColor = Alpha(card.accent, 0.6);
        ctx.shadowBlur = 16;
    }

    Bevel(ctx, 8, 8, W - 16, H - 16, cut);
    ctx.stroke();
    ctx.restore();
}

/** scale 1 reicht für die Vorschau im Dashboard - ein Viertel der Bytes. */
export async function RenderWelcomeCard(data: IWelcomeCardData, scale: number = CARD_SCALE): Promise<Buffer> {
    await RegisterFonts();

    const { card } = data;
    const canvas = createCanvas(W * scale, H * scale);
    const ctx = canvas.getContext("2d");
    const accentOn = card.accentOn !== false && HEX.test(card.accent);
    const tone = accentOn ? card.accent : NEUTRAL;

    ctx.scale(scale, scale);

    const paint: IPaint = {
        ctx,
        card,
        data,
        tone,
        accentOn,
        hasImage: false,
        footerColor: card.footerColor && HEX.test(card.footerColor) ? card.footerColor : accentOn ? card.accent : card.subtitleColor,
    };

    await DrawBackground(paint);

    if (card.layout === "center") await Center(paint);
    else if (card.layout === "panel") await Panel(paint);
    else if (card.layout === "hud") await Hud(paint);
    else await Classic(paint);

    return canvas.toBuffer("image/png");
}
