import { SKRSContext2D, createCanvas } from "@napi-rs/canvas";
import { COLORS } from "../constants/RankCard";
import { REGION_LABELS } from "../constants/Voice";
import { DrawText, Fit, LoadEmojis, TextWidth } from "./HelpImage";
import { RegisterFonts, glow, image, panel } from "./RankCard";

/**
 * W-0151: Der Kopf des Temp-Voice-Panels als Bild (Entwurf G3): flach wie ein
 * Banner, im Look der Rang-Karte - rote Rahmen, abgeschrägte Ecken. Links der
 * Besitzer, rechts drei Kacheln mit dem Stand. Plätze zeigen nur das Limit,
 * nie die Belegung: das Bild ändert sich nur, wenn jemand etwas einstellt.
 *
 * Das feste Panel (eins für alle in einem Textkanal) hat keinen Besitzer und
 * zeigt nur, wie es geht.
 */

export type IVoicePanelImage =
    | { kind: "channel"; ownerName: string; avatarURL: string | null; privacy: "public" | "private"; stealth: boolean; limit: number; region: string | null }
    | { kind: "fixed" };

export const VOICE_PANEL_FILE = "voice-panel.png";

const WIDTH = 1200;
const HEIGHT = 264;
const PAD = 16;

const OPEN = COLORS.win;
const PRIVATE = "#ffa03d";

const TAG = "TEMP VOICE";
const FIXED_TITLE = "Dein Sprachkanal";
const FIXED_TEXT = "Betritt einen Hub, dann stellst du hier deinen Kanal ein.";

/** Die drei Kacheln, wie sie im Bild und im Alt-Text stehen. */
function tiles(data: Extract<IVoicePanelImage, { kind: "channel" }>): { label: string; value: string; color: string }[] {
    return [
        { label: "ZUTRITT", value: data.privacy === "private" ? "Privat" : "Offen", color: data.privacy === "private" ? PRIVATE : OPEN },
        { label: "PLÄTZE", value: data.limit > 0 ? String(data.limit) : "∞", color: COLORS.text },
        { label: "REGION", value: data.region ? (REGION_LABELS.get(data.region) ?? data.region) : "Auto", color: COLORS.text },
    ];
}

/** Alles, was auf dem Bild steht, als Satz - für Screenreader. */
export function VoicePanelAlt(data: IVoicePanelImage): string {
    if (data.kind === "fixed") return `Temp Voice: ${FIXED_TITLE}. ${FIXED_TEXT}`;

    const [access, seats, region] = tiles(data);

    return `Temp-Voice-Kanal von ${data.ownerName}${data.stealth ? ", unsichtbar" : ""}. Zutritt: ${access.value}. Plätze: ${seats.value}. Region: ${region.value}.`;
}

/** Die größte Schrift zwischen max und min, in der der Text passt. */
function shrink(ctx: SKRSContext2D, text: string, weightFamily: string, max: number, min: number, maxWidth: number): number {
    let size = max;

    ctx.font = `${weightFamily.replace("{size}", String(size))}`;

    while (size > min && TextWidth(ctx, text) > maxWidth) {
        size -= 2;
        ctx.font = `${weightFamily.replace("{size}", String(size))}`;
    }

    return size;
}

/** Mittig auf x, mit Ersatzschriften für Zeichen, die Oxanium nicht hat. */
function centered(ctx: SKRSContext2D, text: string, x: number, y: number): void {
    ctx.textAlign = "left";
    DrawText(ctx, text, x - TextWidth(ctx, text) / 2, y);
}

function tracked(ctx: SKRSContext2D, spacing: string): void {
    // @napi-rs/canvas kennt letterSpacing wie der Browser; ältere Fassungen ignorieren es.
    (ctx as unknown as { letterSpacing: string }).letterSpacing = spacing;
}

function background(ctx: SKRSContext2D): void {
    ctx.fillStyle = COLORS.base;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const shine = ctx.createRadialGradient(0, 0, 0, 0, 0, WIDTH * 0.7);

    shine.addColorStop(0, "rgba(120, 10, 24, 0.35)");
    shine.addColorStop(1, "rgba(5, 6, 8, 0)");
    ctx.fillStyle = shine;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    panel(ctx, PAD, PAD, WIDTH - PAD * 2, HEIGHT - PAD * 2, { cut: 26, fill: "rgba(11, 14, 19, 0.94)", glow: 14, width: 3 });
}

async function avatar(ctx: SKRSContext2D, data: Extract<IVoicePanelImage, { kind: "channel" }>, cx: number, cy: number, radius: number): Promise<void> {
    const picture = data.avatarURL ? await image(data.avatarURL) : null;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    if (picture) {
        ctx.drawImage(picture, cx - radius, cy - radius, radius * 2, radius * 2);
    } else {
        const fill = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);

        fill.addColorStop(0, "#ff6bd6");
        fill.addColorStop(1, "#8b2fd1");
        ctx.fillStyle = fill;
        ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
        ctx.fillStyle = COLORS.text;
        ctx.font = "800 56px Oxanium";
        ctx.textBaseline = "alphabetic";
        centered(ctx, ([...data.ownerName.trim()][0] ?? "?").toUpperCase(), cx, cy + 20);
    }

    ctx.restore();

    glow(ctx, COLORS.red, 14, () => {
        ctx.beginPath();
        ctx.arc(cx, cy, radius + 3, 0, Math.PI * 2);
        ctx.strokeStyle = COLORS.red;
        ctx.lineWidth = 6;
        ctx.stroke();
    });
}

function drawTiles(ctx: SKRSContext2D, data: Extract<IVoicePanelImage, { kind: "channel" }>): number {
    const width = 172;
    const height = 120;
    const gap = 16;
    const right = WIDTH - PAD - 40;
    const top = (HEIGHT - height) / 2;
    const all = tiles(data);
    const left = right - all.length * width - (all.length - 1) * gap;

    all.forEach((tile, index) => {
        const x = left + index * (width + gap);

        panel(ctx, x, top, width, height, { cut: 14, fill: "#11151c", glow: 8, width: 2 });

        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = COLORS.textDim;
        ctx.font = "700 22px Rajdhani";
        tracked(ctx, "3px");
        ctx.fillText(tile.label, x + width / 2, top + 42);
        tracked(ctx, "0px");

        // W-0152: Oxanium hat kein „∞“, die Ersatzschrift zeichnet es winzig - also größer bestellen.
        const infinite = tile.value === "∞";

        shrink(ctx, tile.value, "800 {size}px Oxanium", infinite ? 88 : 40, 24, width - 24);
        ctx.fillStyle = tile.color;
        centered(ctx, Fit(ctx, tile.value, width - 24), x + width / 2, top + (infinite ? 110 : 94));
    });

    return left;
}

/** W-0152: Das feste Panel sieht immer gleich aus - einmal je Prozess zeichnen reicht. */
let fixedPng: Promise<Buffer> | null = null;

export function RenderVoicePanel(data: IVoicePanelImage): Promise<Buffer> {
    if (data.kind !== "fixed") return Render(data);

    fixedPng ??= Render(data).catch((error: unknown) => {
        fixedPng = null;

        throw error;
    });

    return fixedPng;
}

async function Render(data: IVoicePanelImage): Promise<Buffer> {
    await RegisterFonts();

    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext("2d");

    background(ctx);

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";

    if (data.kind === "fixed") {
        const x = PAD + 56;

        ctx.fillStyle = COLORS.red;
        ctx.font = "800 28px Oxanium";
        tracked(ctx, "4px");
        ctx.fillText(TAG, x, 94);
        tracked(ctx, "0px");

        ctx.fillStyle = COLORS.text;
        ctx.font = "800 64px Oxanium";
        ctx.fillText(FIXED_TITLE, x, 162);

        ctx.fillStyle = COLORS.textDim;
        ctx.font = "600 30px Rajdhani";
        ctx.fillText(Fit(ctx, FIXED_TEXT, WIDTH - x - PAD - 56), x, 208);

        return canvas.toBuffer("image/png");
    }

    const radius = 64;
    const cx = PAD + 56 + radius;
    const cy = HEIGHT / 2;

    await LoadEmojis([data.ownerName]);
    await avatar(ctx, data, cx, cy, radius);

    const tilesLeft = drawTiles(ctx, data);
    const x = cx + radius + 40;
    const room = tilesLeft - 32 - x;

    ctx.textAlign = "left";
    // Die rote Zeile wird lieber kleiner als abgeschnitten: „UNSICHTBAR“ ist eine Aussage.
    const tag = data.stealth ? `${TAG} · UNSICHTBAR` : TAG;

    ctx.fillStyle = COLORS.red;
    tracked(ctx, "3px");
    shrink(ctx, tag, "800 {size}px Oxanium", 28, 18, room);
    ctx.fillText(Fit(ctx, tag, room), x, 112);
    tracked(ctx, "0px");

    shrink(ctx, data.ownerName, "800 {size}px Oxanium", 60, 40, room);
    ctx.fillStyle = COLORS.text;
    DrawText(ctx, Fit(ctx, data.ownerName, room), x, 172);

    return canvas.toBuffer("image/png");
}
