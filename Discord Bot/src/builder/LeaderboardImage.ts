import { Image, SKRSContext2D, createCanvas, loadImage } from "@napi-rs/canvas";
import { RegisterFonts } from "./RankCard";
import { COLORS } from "../constants/RankCard";
import { PERIOD_LABEL, VoiceText } from "../constants/Levels";
import { CARD_SCALE } from "../constants/Welcome";
import { DefaultBoardStyle } from "../constants/LevelDesign";
import { ResolveImagePath } from "../constants/Gallery";
import { IBoardEntry, IBoardPage } from "../interfaces/services/levels/ILevels";
import { IBoardStyle } from "../interfaces/services/levels/ILevelDesign";

/**
 * Das Ranglisten-Bild (Plan 34, Entwurf B „Podium“): auf Seite 1 die ersten
 * drei groß nebeneinander und darunter Platz 4 bis 10, ab Seite 2 zehn Zeilen.
 * Jede Zahl ist beschriftet. Gezeichnet in logischen 1000 px Breite mit
 * CARD_SCALE wie die Welcome Card, damit es in Discord scharf bleibt.
 * Plan 35: Hintergrund, Akzent, Medaillenfarben, Schrift, Titel und Podium
 * stellt der Server ein (IBoardStyle); ohne sieht es aus wie in Etappe 1.
 */

export interface ILeaderboardInput {
    guildName: string;
    page: IBoardPage;
    viewerId: string | null;
    /** Überschrift - die Wochen- und Monatsposts setzen eigene. Sonst die aus dem Stil. */
    title?: string;
    /** Plan 35: der Stil des Servers. */
    style?: IBoardStyle;
    /** Plan 37: statt des Zeitraums oben rechts - etwa „26.10.–01.11.“ beim Wochenpost. */
    chip?: string;
}

/** Für die Prüfungen: was gezeichnet wurde. */
export interface ILeaderboardHooks {
    onDraw?: (count: { podium: number; rows: number }) => void;
    onTitle?: (title: string, subtitle: string) => void;
    onChip?: (chip: string) => void;
}

const WIDTH = 1000;
const PAD = 40;
const HEADER = 140;
const PODIUM = 320;
const ROW = 74;
const ROW_GAP = 8;
const FOOTER = 70;
const CYAN = "#38bdf8";
const AVATAR_TIMEOUT = 3_000;
const NUMBER = new Intl.NumberFormat("de-DE");

function bevel(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, cut: number): void {
    ctx.beginPath();
    ctx.moveTo(x + cut, y);
    ctx.lineTo(x + w - cut, y);
    ctx.lineTo(x + w, y + cut);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + cut);
    ctx.closePath();
}

function Fit(ctx: SKRSContext2D, text: string, max: number): string {
    if (ctx.measureText(text).width <= max) return text;

    let cut = text;

    while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) cut = cut.slice(0, -1);

    return `${cut}…`;
}

function Rgba(hex: string, alpha: number): string {
    const value = Number.parseInt(hex.slice(1), 16);

    return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
}

function Day(day: number): string {
    const date = new Date(day * 86_400_000);

    return `${String(date.getUTCDate()).padStart(2, "0")}.${String(date.getUTCMonth() + 1).padStart(2, "0")}.`;
}

async function Avatar(url: string | null): Promise<Image | null> {
    if (!url) return null;

    return Promise.race([loadImage(url).catch(() => null), new Promise<null>((resolve) => setTimeout(() => resolve(null), AVATAR_TIMEOUT))]);
}

function DrawAvatar(ctx: SKRSContext2D, image: Image | null, x: number, y: number, size: number, ring: string | null): void {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = "#1b1838";
    ctx.fillRect(x, y, size, size);

    if (image) ctx.drawImage(image, x, y, size, size);

    ctx.restore();

    if (!ring) return;

    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.strokeStyle = ring;
    ctx.lineWidth = 4;
    ctx.stroke();
}

/** ▲ 3, ▼ 1, – oder NEU - rechtsbündig an x. Die Dreiecke werden gezeichnet, nicht als Zeichen gesetzt. */
function DrawTrend(ctx: SKRSContext2D, trend: IBoardEntry["trend"], x: number, y: number): void {
    ctx.textAlign = "right";

    if (trend === "new") {
        ctx.font = "700 17px Rajdhani";
        ctx.fillStyle = CYAN;
        ctx.fillText("NEU", x, y);

        return;
    }

    if (trend === 0) {
        ctx.font = "700 20px Oxanium";
        ctx.fillStyle = COLORS.textDim;
        ctx.fillText("–", x, y);

        return;
    }

    const up = trend > 0;
    const text = String(Math.abs(trend));

    ctx.font = "700 20px Oxanium";
    ctx.fillStyle = up ? COLORS.win : COLORS.loss;
    ctx.fillText(text, x, y);

    const width = ctx.measureText(text).width;
    const tx = x - width - 16;

    ctx.beginPath();
    if (up) {
        ctx.moveTo(tx, y - 3);
        ctx.lineTo(tx + 12, y - 3);
        ctx.lineTo(tx + 6, y - 14);
    } else {
        ctx.moveTo(tx, y - 14);
        ctx.lineTo(tx + 12, y - 14);
        ctx.lineTo(tx + 6, y - 3);
    }
    ctx.closePath();
    ctx.fill();
}

export async function RenderLeaderboard(input: ILeaderboardInput, hooks: ILeaderboardHooks = {}): Promise<Buffer> {
    await RegisterFonts();

    const { page, viewerId } = input;
    const style = input.style ?? DefaultBoardStyle();
    const accent = style.accent;
    const medals = style.medals;
    const font = style.font;
    const podium = style.podium && page.page === 1 ? page.entries.slice(0, 3) : [];
    const rows = podium.length ? page.entries.slice(3) : page.entries;
    const rowsTop = HEADER + (podium.length ? PODIUM : 0);
    const footerTop = rowsTop + rows.length * (ROW + ROW_GAP) + 10;
    const height = footerTop + FOOTER;
    const canvas = createCanvas(WIDTH * CARD_SCALE, height * CARD_SCALE);
    const ctx = canvas.getContext("2d");
    const avatars = await Promise.all(page.entries.map((entry) => Avatar(entry.avatar)));
    const avatarOf = new Map(page.entries.map((entry, index) => [entry.userId, avatars[index]]));

    ctx.scale(CARD_SCALE, CARD_SCALE);
    ctx.textBaseline = "alphabetic";

    // Hintergrund wie im Entwurf: dunkel mit Schein in der Akzentfarbe oben rechts - oder das Bild des Servers.
    // Frisch von der Platte: ein gelöschtes oder ersetztes Galeriebild soll nicht weiter auftauchen.
    const file = style.image ? ResolveImagePath(style.image) : null;
    const backdrop = file ? await loadImage(file).catch(() => null) : null;

    if (backdrop) {
        const scale = Math.max(WIDTH / backdrop.width, height / backdrop.height);
        const sw = WIDTH / scale;
        const sh = height / scale;

        ctx.drawImage(backdrop, (backdrop.width - sw) / 2, (backdrop.height - sh) / 2, sw, sh, 0, 0, WIDTH, height);
        ctx.fillStyle = `rgba(0,0,0,${style.dim / 100})`;
        ctx.fillRect(0, 0, WIDTH, height);
    } else {
        const base = ctx.createLinearGradient(0, 0, WIDTH, height);

        base.addColorStop(0, "#0d1020");
        base.addColorStop(0.6, "#1a1238");
        base.addColorStop(1, "#0a0c15");
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, WIDTH, height);
    }

    const glow = ctx.createRadialGradient(WIDTH * 0.85, 0, 0, WIDTH * 0.85, 0, 420);

    glow.addColorStop(0, Rgba(accent, 0.45));
    glow.addColorStop(1, Rgba(accent, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, WIDTH, height);

    // Kopf: Titel und kleine Zeile mit {guild}, {period}, {range}. Ein Punkt am Rand, weil {range} leer ist, fällt weg.
    const range = page.range ? `${Day(page.range.from)}–${Day(page.range.to)}` : "";
    const values: Record<string, string> = { guild: input.guildName, period: PERIOD_LABEL[page.period], range };
    const fill = (text: string) => text.replace(/\{(guild|period|range)\}/g, (_, key: string) => values[key]).replace(/^[\s·]+|[\s·]+$/g, "");
    const title = input.title ?? fill(style.title);
    const subtitle = fill(style.subtitle);

    hooks.onTitle?.(title, subtitle);
    ctx.textAlign = "left";
    ctx.font = "600 20px Rajdhani";
    ctx.fillStyle = accent;
    ctx.fillText(Fit(ctx, subtitle.toUpperCase(), 560), PAD, 64);
    ctx.font = `800 46px ${font}`;
    ctx.fillStyle = COLORS.text;
    ctx.fillText(Fit(ctx, title, 700), PAD, 112);

    const chip = (input.chip ?? PERIOD_LABEL[page.period]).toUpperCase();

    hooks.onChip?.(input.chip ?? PERIOD_LABEL[page.period]);

    ctx.font = "700 20px Rajdhani";

    const chipWidth = ctx.measureText(chip).width + 36;

    ctx.strokeStyle = CYAN;
    ctx.lineWidth = 2;
    ctx.strokeRect(WIDTH - PAD - chipWidth, 76, chipWidth, 40);
    ctx.fillStyle = CYAN;
    ctx.textAlign = "center";
    ctx.fillText(chip, WIDTH - PAD - chipWidth / 2, 103);

    // Podium: 2 links, 1 in der Mitte und höher, 3 rechts.
    const side = 280;
    const middle = WIDTH - PAD * 2 - side * 2 - 40;
    const slots = [
        { index: 1, x: PAD, width: side, top: HEADER + 40 },
        { index: 0, x: PAD + side + 20, width: middle, top: HEADER },
        { index: 2, x: PAD + side + 20 + middle + 20, width: side, top: HEADER + 40 },
    ];

    for (const slot of slots) {
        const entry = podium[slot.index];

        if (!entry) continue;

        const color = medals[slot.index];
        const bottom = HEADER + PODIUM - 20;
        const center = slot.x + slot.width / 2;
        const size = slot.index === 0 ? 104 : 84;
        const fill = ctx.createLinearGradient(0, slot.top, 0, bottom);

        fill.addColorStop(0, slot.index === 0 ? "rgba(250,204,21,0.20)" : "rgba(255,255,255,0.07)");
        fill.addColorStop(1, "rgba(255,255,255,0.03)");
        ctx.fillStyle = fill;
        bevel(ctx, slot.x, slot.top, slot.width, bottom - slot.top, 16);
        ctx.fill();

        if (entry.userId === viewerId) {
            ctx.strokeStyle = CYAN;
            ctx.lineWidth = 3;
            ctx.stroke();
        }

        ctx.textAlign = "center";
        ctx.font = `800 34px ${font}`;
        ctx.fillStyle = color;
        ctx.fillText(String(entry.rank), center, slot.top + 44);

        DrawAvatar(ctx, avatarOf.get(entry.userId) ?? null, center - size / 2, slot.top + 58, size, color);

        const textTop = slot.top + 58 + size;

        ctx.font = `700 24px ${font}`;
        ctx.fillStyle = COLORS.text;
        ctx.fillText(Fit(ctx, entry.name, slot.width - 30), center, textTop + 34);
        ctx.font = "600 19px Rajdhani";
        ctx.fillStyle = COLORS.textDim;
        ctx.fillText(`Level ${entry.level} · ${NUMBER.format(entry.xp)} Punkte`, center, textTop + 60);
        DrawTrend(ctx, entry.trend, center + 30, textTop + 88);
    }

    // Zeilen
    rows.forEach((entry, index) => {
        const y = rowsTop + index * (ROW + ROW_GAP);
        const mine = entry.userId === viewerId;
        const medal = entry.rank <= 3 ? medals[entry.rank - 1] : null;

        ctx.fillStyle = mine ? "rgba(56,189,248,0.14)" : "rgba(255,255,255,0.05)";
        bevel(ctx, PAD, y, WIDTH - PAD * 2, ROW, 10);
        ctx.fill();

        if (mine) {
            ctx.fillStyle = CYAN;
            ctx.fillRect(PAD, y + 10, 5, ROW - 10);
        }

        ctx.textAlign = "left";
        ctx.font = `700 26px ${font}`;
        ctx.fillStyle = mine ? CYAN : (medal ?? "#b4aed0");
        ctx.fillText(String(entry.rank), PAD + 22, y + 47);

        DrawAvatar(ctx, avatarOf.get(entry.userId) ?? null, PAD + 92, y + 13, 48, medal);

        ctx.font = `700 23px ${font}`;
        ctx.fillStyle = COLORS.text;
        ctx.fillText(Fit(ctx, entry.name, 380), PAD + 158, y + 33);
        ctx.font = "600 18px Rajdhani";
        ctx.fillStyle = COLORS.textDim;
        ctx.fillText(`${NUMBER.format(entry.messages)} Nachr. · ${VoiceText(entry.voiceMinutes)}`, PAD + 158, y + 58);

        const right = WIDTH - PAD;

        ctx.textAlign = "right";
        ctx.font = "600 15px Rajdhani";
        ctx.fillStyle = COLORS.textDim;
        ctx.fillText("LVL", right - 230, y + 30);
        ctx.font = `800 26px ${font}`;
        ctx.fillStyle = accent;
        ctx.fillText(String(entry.level), right - 230, y + 58);
        ctx.font = `700 25px ${font}`;
        ctx.fillStyle = COLORS.text;
        ctx.fillText(NUMBER.format(entry.xp), right - 82, y + 38);
        ctx.font = "600 15px Rajdhani";
        ctx.fillStyle = COLORS.textDim;
        ctx.fillText("PUNKTE", right - 82, y + 60);

        DrawTrend(ctx, entry.trend, right - 16, y + 46);
    });

    // Fuß
    ctx.font = "600 20px Rajdhani";
    ctx.fillStyle = COLORS.textDim;
    ctx.textAlign = "left";
    ctx.fillText(`Seite ${page.page} von ${page.pages} · ${NUMBER.format(page.total)} Mitglieder`, PAD, footerTop + 36);
    ctx.textAlign = "right";
    ctx.fillText(page.range ? `${Day(page.range.from)} – ${Day(page.range.to)}` : "Lifetime", WIDTH - PAD, footerTop + 36);

    hooks.onDraw?.({ podium: podium.length, rows: rows.length });

    return canvas.toBuffer("image/png");
}
