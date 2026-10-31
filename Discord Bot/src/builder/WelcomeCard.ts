import { Image, SKRSContext2D, createCanvas, loadImage } from "@napi-rs/canvas";
import { RegisterFonts } from "./RankCard";
import { CARD_BASELINE, CARD_HEIGHT, CARD_SCALE, CARD_WIDTH, CleanPositions, Ellipsis, FitTitle, LineWidth, MAX_AVATAR, MAX_RING, MIN_AVATAR, POSITION_LIMITS, TitleFont } from "../constants/Welcome";
import { IWelcomeCard, IWelcomePosition, IWelcomePositions } from "../interfaces/services/welcome/IWelcome";

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

const cache = new Map<string, Promise<Image | null>>();
/** So lange wartet eine Karte auf ein Bild - ein hängender CDN-Server hält sonst Aufstieg und Nachtrag an. */
const LOAD_TIMEOUT = 3_000;

/**
 * Avatare und Server-Icons einmal laden - sie ändern sich selten. Auch der
 * Level-Designer lädt hierüber. Was nicht kam (Fehler, nach 3 s noch nichts),
 * bleibt nicht im Speicher: beim nächsten Mal wird es wieder versucht.
 */
export function Load(source: string | null): Promise<Image | null> {
    if (!source) return Promise.resolve(null);

    let image = cache.get(source);

    if (!image) {
        image = Promise.race([loadImage(source).catch(() => null), new Promise<null>((resolve) => setTimeout(() => resolve(null), LOAD_TIMEOUT).unref())]);
        // ponytail: kleiner Zwischenspeicher, geleert ab 200 Bildern. Reicht für Beitrittswellen.
        if (cache.size > 200) cache.clear();
        cache.set(source, image);
        void image.then((loaded) => {
            if (!loaded && cache.get(source) === image) cache.delete(source);
        });
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

/* ----------------------------------------------------------
   Plätze (Plan 25)
   ---------------------------------------------------------- */

type Places = Required<IWelcomePositions>;
type Lines = Pick<IWelcomeCardData, "title" | "subtitle" | "footer" | "iconURL">;

/** Avatar und Icon brauchen keine Ausrichtung und keine Breite. */
function Box(x: number, y: number, size: number): IWelcomePosition {
    return { x, y, size, align: "left", width: POSITION_LIMITS.width[1] };
}

/**
 * Die drei Zeilen, wie die Layouts sie heute stellen: ein Block, senkrecht
 * mittig (oder ab top), mit einem Teiler bzw. der kleinen Zeile als Marke. y
 * ist so gewählt, dass die Grundlinie genau dort liegt, wo sie vor Plan 25 lag.
 */
function TextPlaces(
    ctx: SKRSContext2D,
    card: IWelcomeCard,
    data: Lines,
    x: number,
    max: number,
    align: "left" | "center",
    options: { top?: number; divider?: boolean; chip?: boolean }
): Pick<Places, "title" | "subtitle" | "footer"> {
    const size = Clamp(card.titleSize, 28, 72);
    const fitted = data.title ? FitTitle(ctx, data.title, card.font, size, max) : null;
    const heights = {
        title: fitted ? Math.round(fitted.size * 1.04) : 0,
        subtitle: data.subtitle ? 34 : 0,
        divider: data.footer && options.divider ? 22 : 0,
        footer: data.footer ? (options.chip ? 50 : 30) : 0,
    };
    let y = options.top ?? Math.round(H / 2 - (heights.title + heights.subtitle + heights.divider + heights.footer) / 2);

    const title = { x, y, size, align, width: max };

    y += heights.title;

    const subtitle = { x, y: y + 26 - Math.round(26 * CARD_BASELINE), size: 26, align, width: max };

    y += heights.subtitle + heights.divider;

    const footer = { x, y: y + (options.chip ? 34 : 22) - Math.round(21 * CARD_BASELINE), size: 21, align, width: max };

    return { title, subtitle, footer };
}

/* ----------------------------------------------------------
   Die vier Layouts: Verzierung und die Plätze, die sie den Teilen geben
   ---------------------------------------------------------- */
interface ILayout {
    divider: boolean;
    chip: boolean;
    before(paint: IPaint): void;
    after?(paint: IPaint): void;
    places(ctx: SKRSContext2D, card: IWelcomeCard, data: Lines): Places;
}

const LAYOUTS: Record<IWelcomeCard["layout"], ILayout> = {
    classic: {
        divider: true,
        chip: false,
        before(paint) {
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
        },
        places(ctx, card, data) {
            const pad = 52;
            const size = Clamp(card.avatarSize, MIN_AVATAR, MAX_AVATAR);
            const left = card.avatar ? pad + size + 40 : pad;
            const right = W - pad - (card.icon && data.iconURL ? 70 : 0);

            return {
                avatar: Box(pad, Math.round(H / 2 - size / 2), size),
                icon: Box(W - 28 - 54, 28, 54),
                ...TextPlaces(ctx, card, data, left, Math.max(160, right - left), "left", { divider: true }),
            };
        },
    },
    center: {
        divider: true,
        chip: false,
        before(paint) {
            Scrim(paint, "center");
        },
        after(paint) {
            Frame(paint, 0.5);
        },
        places(ctx, card, data) {
            // Mittig ist oben wenig Platz: der Avatar bleibt kleiner, sonst drückt er den Text aus der Karte.
            const size = Clamp(card.avatarSize, MIN_AVATAR, 132);
            const top = 30;

            return {
                avatar: Box(Math.round(W / 2 - size / 2), top, size),
                icon: Box(W - 26 - 50, 26, 50),
                ...TextPlaces(ctx, card, data, W / 2, W - 160, "center", { top: card.avatar ? top + size + 18 : undefined, divider: true }),
            };
        },
    },
    panel: {
        divider: true,
        chip: false,
        before(paint) {
            const { ctx, card } = paint;
            const { x, y, width, height } = PANEL;

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
        },
        places(ctx, card, data) {
            const { x, width } = PANEL;
            const size = Clamp(card.avatarSize, MIN_AVATAR, 156);
            const inner = x + 34;
            const left = card.avatar ? inner + size + 30 : inner;

            return {
                avatar: Box(inner, Math.round(H / 2 - size / 2), size),
                icon: Box(W - 28 - 54, 28, 54),
                ...TextPlaces(ctx, card, data, left, x + width - 30 - left, "left", { divider: true }),
            };
        },
    },
    hud: {
        divider: false,
        chip: true,
        before(paint) {
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
        },
        places(ctx, card, data) {
            const pad = 58;
            const size = Clamp(card.avatarSize, MIN_AVATAR, 180);
            const left = card.avatar ? pad + size + 40 : pad;
            const right = W - pad - (card.icon && data.iconURL ? 70 : 0);

            return {
                avatar: Box(pad, Math.round(H / 2 - size / 2), size),
                icon: Box(W - 34 - 52, 34, 52),
                ...TextPlaces(ctx, card, data, left, Math.max(160, right - left), "left", { chip: true }),
            };
        },
    },
};

/** Die dunkle Fläche des Layouts Panel. */
const PANEL = { x: 26, y: 26, width: 620, height: H - 52 } as const;

function LayoutOf(card: IWelcomeCard): ILayout {
    return LAYOUTS[card.layout] ?? LAYOUTS.classic;
}

/** Die Plätze, die das Layout den fünf Teilen gibt - für genau diese Zeilen, weil ein langer Name kleiner wird. */
export function LayoutPositions(ctx: SKRSContext2D, card: IWelcomeCard, data: Lines): Places {
    return LayoutOf(card).places(ctx, card, data);
}

/** Dasselbe ohne eigenen Kanvas - für die Vorschau im Dashboard. */
export async function WelcomePlaces(data: IWelcomeCardData): Promise<Places> {
    await RegisterFonts();

    return LayoutPositions(createCanvas(10, 10).getContext("2d"), data.card, data);
}

/* ----------------------------------------------------------
   Die Teile zeichnen
   ---------------------------------------------------------- */
function DrawLines(paint: IPaint, places: Places, layout: ILayout): void {
    const { ctx, card, data } = paint;

    ctx.textBaseline = "alphabetic";

    if (data.title) {
        const place = places.title;
        const fitted = FitTitle(ctx, data.title, card.font, place.size, LineWidth(place.x, place.align, place.width));

        ctx.save();
        ctx.textAlign = place.align;
        ctx.font = TitleFont(card.font, fitted.size);
        ctx.fillStyle = card.titleColor;
        ctx.shadowColor = "rgba(0,0,0,0.55)";
        ctx.shadowBlur = 14;
        ctx.shadowOffsetY = 2;
        ctx.fillText(fitted.text, place.x, place.y + Math.round(fitted.size * CARD_BASELINE));
        ctx.restore();
    }

    if (data.subtitle) {
        const place = places.subtitle;

        ctx.save();
        ctx.textAlign = place.align;
        ctx.font = `600 ${place.size}px Rajdhani`;
        ctx.fillStyle = card.subtitleColor;
        ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.shadowBlur = 10;
        ctx.fillText(Ellipsis(ctx, data.subtitle, LineWidth(place.x, place.align, place.width)), place.x, place.y + Math.round(place.size * CARD_BASELINE));
        ctx.restore();
    }

    if (!data.footer) return;

    const place = places.footer;
    const baseline = place.y + Math.round(place.size * CARD_BASELINE);
    const max = LineWidth(place.x, place.align, place.width);
    const shift = (width: number): number => (place.align === "center" ? place.x - width / 2 : place.align === "right" ? place.x - width : place.x);

    // Der kurze Strich über der kleinen Zeile, in der Akzentfarbe.
    if (layout.divider) {
        ctx.fillStyle = paint.accentOn ? card.accent : "rgba(255,255,255,0.28)";
        ctx.fillRect(shift(56), baseline - Math.round(place.size * 1.667), 56, 3);
    }

    ctx.font = `600 ${place.size}px Rajdhani`;

    if (layout.chip) {
        // Die kleine Zeile als Marke - im HUD-Layout wie die Abzeichen der Rang-Karte.
        const pad = Math.round(place.size * 0.76);
        const text = Ellipsis(ctx, data.footer, max - 2 * pad);
        const width = ctx.measureText(text).width + 2 * pad;
        const left = shift(width);

        Bevel(ctx, left, baseline - Math.round(place.size * 1.14), width, Math.round(place.size * 1.62), Math.round(place.size * 0.43));
        ctx.fillStyle = Alpha(paint.footerColor, 0.12);
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = Alpha(paint.footerColor, 0.7);
        ctx.stroke();
        ctx.fillStyle = paint.footerColor;
        ctx.textAlign = "left";
        ctx.fillText(text, left + pad, baseline);

        return;
    }

    ctx.textAlign = place.align;
    ctx.fillStyle = paint.footerColor;
    ctx.fillText(Ellipsis(ctx, data.footer, max), place.x, baseline);
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

/**
 * scale 1 reicht für die Vorschau im Dashboard - ein Viertel der Bytes. bare:
 * nur Hintergrund und Verzierung, ohne die fünf Teile - die Bühne im
 * Dashboard legt sie selbst darüber.
 */
export async function RenderWelcomeCard(data: IWelcomeCardData, scale: number = CARD_SCALE, options: { bare?: boolean } = {}): Promise<Buffer> {
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
    const layout = LayoutOf(card);

    await DrawBackground(paint);

    layout.before(paint);

    if (!options.bare) {
        // Eigene Plätze gehen vor, was fehlt oder kaputt war, kommt vom Layout.
        const places: Places = { ...layout.places(ctx, card, data), ...(CleanPositions(card.positions) ?? {}) };

        if (card.avatar) await DrawAvatar(paint, places.avatar.x, places.avatar.y, places.avatar.size);

        DrawLines(paint, places, layout);
        await DrawIcon(paint, places.icon.x, places.icon.y, places.icon.size);
    }

    layout.after?.(paint);

    return canvas.toBuffer("image/png");
}
