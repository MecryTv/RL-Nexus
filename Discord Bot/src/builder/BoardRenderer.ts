import { SKRSContext2D, createCanvas } from "@napi-rs/canvas";
import { RegisterFonts } from "./RankCard";
import { Load } from "./WelcomeCard";
import { Background, Border, DrawElements, FillDesign, Frame, IDesignHooks } from "./DesignRenderer";
import { CARD_SCALE } from "../constants/Welcome";
import { BOARD_WIDTH } from "../constants/LevelDesign";
import { PERIOD_LABEL, VoiceHours } from "../constants/Levels";
import { COLORS } from "../constants/RankCard";
import { BoardArea, IBoardDesign, IBoardFill, IDesignBox } from "../interfaces/services/levels/ILevelDesign";
import { IBoardEntry, IBoardPage } from "../interfaces/services/levels/ILevels";

/**
 * Plan 38: das Ranglisten-Bild aus dem Baukasten. Kopf, dann auf Seite 1 das
 * Podium (ein Muster je Platz 1–3, versetzt nach offsets und unten am Bereich
 * abgeschnitten), dann die Zeilen (ein Muster je Platz, 1 oder 2 Spalten),
 * dann der Fuß. Die Bausteine zeichnet DesignRenderer - verschoben in ihren
 * Bereich bzw. Platz und mit den Farben dieses Platzes. Siehe docs/Levels.md.
 */

export interface IBoardRenderInput {
    page: IBoardPage;
    guildName: string;
    iconUrl: string | null;
    viewerId: string | null;
    /** {title} statt des Titels aus dem Design - die Posts der Aktivsten. */
    title?: string;
    /** {period} statt „Lifetime“, „7 Tage“, „30 Tage“ - beim Post der Zeitraum. */
    period?: string;
}

export interface IBoardHooks extends IDesignHooks {
    onLayout?: (layout: { podium: number; rows: number; mine: number }) => void;
}

/** Wo ein Bereich im Bild liegt und die Rahmen seiner Bausteine - beim Podium Platz 1, bei der Zeile die erste. */
export interface IBoardAreaBox {
    x: number;
    y: number;
    w: number;
    h: number;
    boxes: IDesignBox[];
    /** Plan 38: wo das Muster sonst noch steht - die Bühne zeigt dort gestrichelte Rahmen. */
    repeats: { x: number; y: number; w: number; h: number }[];
}

/** Ab Platz 4 ist „Medaille“ ein ruhiges Grau-Lila, wie im bisherigen Bild. */
const NO_MEDAL = "#b4aed0";
const NUMBER = new Intl.NumberFormat("de-DE");

function Day(day: number): string {
    const date = new Date(day * 86_400_000);

    return `${String(date.getUTCDate()).padStart(2, "0")}.${String(date.getUTCMonth() + 1).padStart(2, "0")}.`;
}

/** +3, −1, – oder NEU. */
export function TrendText(trend: IBoardEntry["trend"]): string {
    return trend === "new" ? "NEU" : trend === 0 ? "–" : trend > 0 ? `+${trend}` : `−${Math.abs(trend)}`;
}

function TrendColor(trend: IBoardEntry["trend"]): string {
    return trend === "new" ? "#38bdf8" : trend === 0 ? COLORS.textDim : trend > 0 ? COLORS.win : COLORS.loss;
}

function Rgba(hex: string, alpha: number): string {
    const value = Number.parseInt(hex.slice(1), 16);

    return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
}

/** Die Fläche hinter einem Platz; mine: in der Farbe zum Hervorheben, mit Rand. */
function Plate(ctx: SKRSContext2D, fill: IBoardFill, w: number, h: number, colors: Record<string, string>, highlight: string | null): void {
    const outline = (): void => {
        ctx.beginPath();

        if (fill.shape === "bevel") {
            const cut = Math.min(fill.cut, w / 2, h / 2);

            ctx.moveTo(cut, 0);
            ctx.lineTo(w - cut, 0);
            ctx.lineTo(w, cut);
            ctx.lineTo(w, h);
            ctx.lineTo(0, h);
            ctx.lineTo(0, cut);
            ctx.closePath();
        } else ctx.roundRect(0, 0, w, h, fill.shape === "round" ? Math.min(fill.cut, w / 2, h / 2) : 0);
    };
    const color = fill.fill ? (fill.fill.startsWith("#") ? fill.fill : colors[fill.fill]) : null;

    if (highlight) {
        outline();
        ctx.fillStyle = Rgba(highlight, 0.14);
        ctx.fill();
        ctx.strokeStyle = highlight;
        ctx.lineWidth = 2;
        ctx.stroke();

        return;
    }

    if (!color || fill.fillOpacity <= 0) return;

    outline();
    ctx.fillStyle = Rgba(color, fill.fillOpacity / 100);
    ctx.fill();
}

export async function RenderBoard(design: IBoardDesign, input: IBoardRenderInput, scale = CARD_SCALE, hooks: IBoardHooks = {}): Promise<{ png: Buffer; width: number; height: number; areas: Record<BoardArea, IBoardAreaBox | null> }> {
    await RegisterFonts();

    const { page } = input;
    const { head, podium, row, foot } = design;
    const onPodium = podium.on && page.page === 1 ? page.entries.slice(0, 3) : [];
    const rows = page.entries.slice(onPodium.length);
    const lines = Math.ceil(rows.length / row.columns);
    // Plan 43: Wer zuschaut und nicht auf der Seite steht, aber Punkte hat, kommt mit Abstand unter die Liste.
    const away = input.viewerId && page.viewer?.userId === input.viewerId && !page.entries.some((entry) => entry.userId === input.viewerId) ? page.viewer : null;
    const podiumTop = head.h;
    const rowsTop = podiumTop + (onPodium.length ? podium.h : 0);
    const awayTop = rowsTop + lines * (row.h + row.gap) + row.gap;
    const footTop = (away ? awayTop + row.h : rowsTop + lines * (row.h + row.gap)) + 10;
    const width = BOARD_WIDTH;
    const height = footTop + foot.h;
    const canvas = createCanvas(width * scale, height * scale);
    const ctx = canvas.getContext("2d");
    const areas: Record<BoardArea, IBoardAreaBox | null> = { head: null, podium: null, row: null, foot: null };
    let mine = 0;

    // Avatare gleichzeitig laden - gezeichnet wird danach der Reihe nach aus dem Zwischenspeicher. Was nicht kam,
    // wird nicht noch einmal je Platz versucht (Load merkt sich Fehlschläge nicht): sonst 3 s je Platz (Review).
    const shown = away ? [...page.entries, away] : page.entries;
    const loaded = await Promise.all(shown.map((entry) => Load(entry.avatar)));
    const hasAvatar = new Set(shown.filter((_, index) => loaded[index]).map((entry) => entry.userId));

    const period = input.period ?? PERIOD_LABEL[page.period];
    const range = page.range ? `${Day(page.range.from)}–${Day(page.range.to)}` : PERIOD_LABEL[page.period];
    const frame = { guild: input.guildName, period, range, page: String(page.page), pages: String(page.pages), total: NUMBER.format(page.total) };
    const values = { ...frame, title: input.title ?? FillDesign(design.title, frame) };
    const frameData = { values, avatarUrl: null, iconUrl: input.iconUrl, share: 0 };
    const accent = { accent: design.accent };
    const entryData = (entry: IBoardEntry) => ({
        values: {
            rank: String(entry.rank),
            name: entry.name,
            level: String(entry.level),
            xp: NUMBER.format(entry.xp),
            messages: NUMBER.format(entry.messages),
            voice: NUMBER.format(entry.voiceMinutes),
            "voice.hours": VoiceHours(entry.voiceMinutes),
            trend: TrendText(entry.trend),
        },
        avatarUrl: hasAvatar.has(entry.userId) ? entry.avatar : null,
        iconUrl: input.iconUrl,
        share: entry.need > 0 ? Math.min(1, entry.into / entry.need) : 1,
    });
    const colorsOf = (entry: IBoardEntry) => ({ accent: design.accent, medal: entry.rank <= 3 ? design.medals[entry.rank - 1] : NO_MEDAL, trend: TrendColor(entry.trend) });

    ctx.scale(scale, scale);
    ctx.textBaseline = "alphabetic";
    ctx.save();
    Frame(ctx, design.background, width, height);
    ctx.clip();
    await Background(ctx, design.background, width, height);

    if (design.glow) {
        const glow = ctx.createRadialGradient(width * 0.85, 0, 0, width * 0.85, 0, 420);

        glow.addColorStop(0, Rgba(design.accent, 0.45));
        glow.addColorStop(1, Rgba(design.accent, 0));
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, width, height);
    }

    // Kopf
    areas.head = { x: 0, y: 0, w: width, h: head.h, boxes: await DrawElements(ctx, head.elements, frameData, hooks, accent), repeats: [] };

    // Podium: 2 links, 1 in der Mitte, 3 rechts. Alle Plätze enden, wo Platz 1 endet - tiefer stehende werden dort
    // abgeschnitten, so entsteht die Treppe; darunter bleibt bis zur Kante des Bereichs Luft.
    const left = (width - (3 * podium.w + 2 * podium.gap)) / 2;
    const podiumBottom = podiumTop + Math.min(podium.h, podium.offsets[0] + podium.slotH);
    const slotX = [left + podium.w + podium.gap, left, left + 2 * (podium.w + podium.gap)];

    for (const [index, entry] of onPodium.entries()) {
        const x = slotX[index];
        const y = podiumTop + podium.offsets[index];
        const colors = colorsOf(entry);
        // Die Farbe zum Hervorheben gilt für Zeile und Podium gleich.
        const highlight = entry.userId === input.viewerId ? row.highlight : null;

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, podiumTop, width, podiumBottom - podiumTop);
        ctx.clip();
        ctx.translate(x, y);
        Plate(ctx, podium, podium.w, podium.slotH, colors, highlight);

        const boxes = await DrawElements(ctx, podium.elements, entryData(entry), hooks, colors);

        ctx.restore();

        if (highlight) mine++;
        if (index === 0) areas.podium = { x, y, w: podium.w, h: Math.max(0, Math.min(podium.slotH, podiumBottom - y)), boxes, repeats: [] };
        else areas.podium?.repeats.push({ x, y, w: podium.w, h: Math.max(0, Math.min(podium.slotH, podiumBottom - y)) });
    }

    // Zeilen
    for (const [index, entry] of rows.entries()) {
        const x = row.x + (index % row.columns) * (row.w + row.gap);
        const y = rowsTop + Math.floor(index / row.columns) * (row.h + row.gap);
        const colors = colorsOf(entry);
        const highlight = entry.userId === input.viewerId ? row.highlight : null;

        ctx.save();
        ctx.translate(x, y);
        Plate(ctx, row, row.w, row.h, colors, highlight);

        const boxes = await DrawElements(ctx, row.elements, entryData(entry), hooks, colors);

        ctx.restore();

        if (highlight) mine++;
        if (index === 0) areas.row = { x, y, w: row.w, h: row.h, boxes, repeats: [] };
        else areas.row?.repeats.push({ x, y, w: row.w, h: row.h });
    }

    if (away) {
        const colors = colorsOf(away);

        ctx.save();
        ctx.translate(row.x, awayTop);
        Plate(ctx, row, row.w, row.h, colors, row.highlight);
        await DrawElements(ctx, row.elements, entryData(away), hooks, colors);
        ctx.restore();
        mine++;
        areas.row?.repeats.push({ x: row.x, y: awayTop, w: row.w, h: row.h });
    }

    // Fuß
    ctx.save();
    ctx.translate(0, footTop);
    areas.foot = { x: 0, y: footTop, w: width, h: foot.h, boxes: await DrawElements(ctx, foot.elements, frameData, hooks, accent), repeats: [] };
    ctx.restore();

    ctx.restore();
    Border(ctx, design.background, width, height);
    hooks.onLayout?.({ podium: onPodium.length, rows: rows.length, mine });

    return { png: await canvas.encode("png"), width, height, areas };
}
