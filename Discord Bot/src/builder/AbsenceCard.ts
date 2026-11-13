import { Image, SKRSContext2D, createCanvas, loadImage } from "@napi-rs/canvas";
import { RegisterFonts } from "./RankCard";

/**
 * Das Bild der Abmeldungen (W-0095, Entwurf L1 im Stil der Statusmeldung):
 * Streifen oben, Kopf mit Logo und „3/4 heute da“, drei Kacheln, darunter je
 * Abmeldung eine Zeile. Für /abmeldungen mit Gründen, als Panel im Kanal des
 * Teams ohne. Lädt nichts aus dem Netz, das Logo kommt als fertige Daten.
 */

export interface IAbsenceCardRow {
    name: string;
    chip: { text: string; tone: "now" | "soon" };
    period: string;
    reason: string;
    note: string;
}

export interface IAbsenceCardData {
    title: string;
    teamName: string;
    tag: string;
    logo: Buffer | null;
    here: number;
    of: number;
    /** Heute weg und bald weg, für die Kacheln. */
    away: number;
    soon: number;
    /** Das nächste Matchup in den nächsten Tagen: „SA 14.11. · 20:00“ und wie viele dann da sind. */
    next: { label: string; here: number; of: number } | null;
    rows: IAbsenceCardRow[];
    /** Gründe und Notizen zeigen (nur für Captain-Rollen). */
    reasons: boolean;
    footer: string;
    stamp: string;
}

export const ABSENCE_CARD_SCALE = 2;
const WIDTH = 680;
const PAD = 24;
const MAX_ROWS = 10;

const C = {
    bg: "#2b2d31",
    tile: "#232428",
    line: "#3a3c42",
    text: "#ffffff",
    soft: "#dbdee1",
    dim: "#b5bac1",
    warn: "#f5a524",
    ok: "#23a55a",
    red: "#ff1e2d",
    redText: "#ff8a92",
    warnText: "#ffc967",
};

function Fit(ctx: SKRSContext2D, text: string, max: number): string {
    if (ctx.measureText(text).width <= max) return text;

    let cut = text;

    while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) cut = cut.slice(0, -1);

    return `${cut}…`;
}

/** Bricht in höchstens limit Zeilen um, die letzte mit „…“. */
function Wrap(ctx: SKRSContext2D, text: string, max: number, limit: number): string[] {
    const lines: string[] = [];
    let line = "";

    for (const word of text.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;

        if (ctx.measureText(next).width <= max) {
            line = next;
            continue;
        }

        if (line) lines.push(line);
        line = word;

        if (lines.length === limit) break;
    }

    if (line && lines.length < limit) lines.push(line);
    if (lines.length === limit && text.length > lines.join(" ").length) lines[limit - 1] = Fit(ctx, `${lines[limit - 1]}…`, max);

    return lines.map((entry) => Fit(ctx, entry, max));
}

function Caps(ctx: SKRSContext2D, text: string, x: number, y: number, spacing: number, align: "left" | "right" = "left"): void {
    const chars = [...text.toUpperCase()];
    const width = chars.reduce((sum, char) => sum + ctx.measureText(char).width + spacing, -spacing);
    let cursor = align === "right" ? x - width : x;

    for (const char of chars) {
        ctx.fillText(char, cursor, y);
        cursor += ctx.measureText(char).width + spacing;
    }
}

function Round(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
}

function Chip(ctx: SKRSContext2D, text: string, tone: "now" | "soon", x: number, y: number): number {
    ctx.font = "700 11px Rajdhani";

    const w = ctx.measureText(text.toUpperCase()).width + text.length * 0.8 + 12;

    Round(ctx, x, y, w, 18, 3);
    ctx.fillStyle = tone === "now" ? "rgba(255,30,45,0.18)" : "rgba(245,165,36,0.14)";
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = tone === "now" ? "rgba(255,30,45,0.55)" : "rgba(245,165,36,0.5)";
    ctx.stroke();
    ctx.fillStyle = tone === "now" ? C.redText : C.warnText;
    Caps(ctx, text, x + 6, y + 13, 0.8);

    return w;
}

async function Logo(buffer: Buffer | null): Promise<Image | null> {
    if (!buffer) return null;

    try {
        return await loadImage(buffer);
    } catch {
        return null;
    }
}

/** Höhe einer Zeile: Name und Marke links, rechts Grund und bis zu zwei Zeilen Notiz. */
function RowHeight(ctx: SKRSContext2D, row: IAbsenceCardRow, reasons: boolean, noteWidth: number): number {
    if (!reasons || !row.note) return 50;

    ctx.font = "500 14px Rajdhani";

    return 50 + Math.max(0, Wrap(ctx, `„${row.note}“`, noteWidth, 2).length - 1) * 16 + 4;
}

export async function RenderAbsenceCard(data: IAbsenceCardData): Promise<Buffer> {
    await RegisterFonts();

    const measure = createCanvas(10, 10).getContext("2d");
    const rows = data.rows.slice(0, MAX_ROWS);
    const more = data.rows.length - rows.length;
    const cols = data.reasons ? { name: PAD, period: PAD + 210, reason: PAD + 400 } : { name: PAD, period: PAD + 300, reason: 0 };
    const noteWidth = WIDTH - PAD - cols.reason;
    const heights = rows.map((row) => RowHeight(measure, row, data.reasons, noteWidth));
    const tableTop = 6 + 20 + 58 + 18 + 62 + 22;
    const body = rows.length ? 22 + heights.reduce((sum, h) => sum + h, 0) + (more > 0 ? 28 : 0) : 56;
    const height = tableTop + body + 44;

    const canvas = createCanvas(WIDTH * ABSENCE_CARD_SCALE, height * ABSENCE_CARD_SCALE);
    const ctx = canvas.getContext("2d");

    ctx.scale(ABSENCE_CARD_SCALE, ABSENCE_CARD_SCALE);
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, WIDTH, height);

    // Streifen: gelb, solange jemand fehlt oder bald fehlt, sonst grün.
    ctx.fillStyle = data.away || data.soon ? C.warn : C.ok;
    ctx.fillRect(0, 0, WIDTH, 6);

    // Kopf: Logo, Titel, rechts „3/4 heute da“.
    const top = 26;
    const logo = await Logo(data.logo);

    Round(ctx, PAD, top, 58, 58, 8);
    ctx.fillStyle = "#1c1d21";
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = C.line;
    ctx.stroke();

    if (logo) {
        const scale = Math.min(46 / logo.width, 46 / logo.height);
        const w = logo.width * scale;
        const h = logo.height * scale;

        ctx.drawImage(logo, PAD + (58 - w) / 2, top + (58 - h) / 2, w, h);
    } else {
        ctx.fillStyle = C.dim;
        ctx.font = "700 16px Orbitron";
        ctx.textAlign = "center";
        ctx.fillText(Fit(ctx, (data.tag || data.teamName.slice(0, 3)).toUpperCase(), 50), PAD + 29, top + 35);
        ctx.textAlign = "left";
    }

    ctx.font = "800 34px Oxanium";

    const big = `${data.here}/${data.of}`;
    const bigWidth = ctx.measureText(big).width;

    ctx.fillStyle = C.text;
    ctx.textAlign = "right";
    ctx.fillText(big, WIDTH - PAD, top + 36);
    ctx.font = "700 12px Rajdhani";
    ctx.fillStyle = C.dim;
    Caps(ctx, "Heute da", WIDTH - PAD, top + 54, 1.2, "right");
    ctx.textAlign = "left";

    const titleMax = WIDTH - PAD * 2 - 58 - 16 - Math.max(bigWidth, 70) - 16;

    ctx.font = "800 22px Oxanium";
    ctx.fillStyle = C.text;
    ctx.fillText(Fit(ctx, `${data.title} · ${data.teamName}`, titleMax), PAD + 74, top + 28);
    ctx.font = "700 12px Rajdhani";
    ctx.fillStyle = C.dim;
    Caps(ctx, "Nächste 14 Tage", PAD + 74, top + 48, 1.2);

    // Kacheln.
    const tileTop = top + 58 + 18;
    const tileWidth = (WIDTH - PAD * 2 - 16) / 3;
    const tiles: { label: string; value: string; warn: boolean }[] = [
        { label: "Heute weg", value: String(data.away), warn: false },
        { label: "Bald weg", value: String(data.soon), warn: false },
        data.next
            ? { label: data.next.label, value: `${data.next.here}/${data.next.of} da`, warn: data.next.here < data.next.of }
            : { label: "Nächstes Matchup", value: "keins", warn: false },
    ];

    tiles.forEach((tile, index) => {
        const x = PAD + index * (tileWidth + 8);

        Round(ctx, x, tileTop, tileWidth, 62, 6);
        ctx.fillStyle = C.tile;
        ctx.fill();
        ctx.font = "700 12px Rajdhani";
        ctx.fillStyle = C.dim;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, tileTop, tileWidth - 8, 62);
        ctx.clip();
        Caps(ctx, tile.label, x + 12, tileTop + 22, 1);
        ctx.restore();
        ctx.font = "800 20px Oxanium";
        ctx.fillStyle = tile.warn ? C.warn : C.text;
        ctx.fillText(Fit(ctx, tile.value, tileWidth - 24), x + 12, tileTop + 48);
    });

    // Tabelle.
    let y = tableTop;

    if (!rows.length) {
        ctx.font = "600 16px Rajdhani";
        ctx.fillStyle = C.dim;
        ctx.textAlign = "center";
        ctx.fillText("Niemand abgemeldet. Alle sind da.", WIDTH / 2, y + 34);
        ctx.textAlign = "left";
    } else {
        ctx.font = "700 12px Rajdhani";
        ctx.fillStyle = C.dim;
        Caps(ctx, "Spieler", cols.name, y + 12, 1.2);
        Caps(ctx, "Zeitraum", cols.period, y + 12, 1.2);
        if (data.reasons) Caps(ctx, "Grund", cols.reason, y + 12, 1.2);
        y += 22;

        rows.forEach((row, index) => {
            const h = heights[index]!;

            ctx.fillStyle = C.line;
            ctx.fillRect(PAD, y, WIDTH - PAD * 2, 1);

            ctx.font = "700 16px Oxanium";
            ctx.fillStyle = C.text;
            ctx.fillText(Fit(ctx, row.name, cols.period - cols.name - 16), cols.name, y + 22);
            Chip(ctx, row.chip.text, row.chip.tone, cols.name, y + 28);

            ctx.font = "600 15px Rajdhani";
            ctx.fillStyle = C.soft;
            ctx.fillText(Fit(ctx, row.period, (data.reasons ? cols.reason : WIDTH - PAD) - cols.period - 12), cols.period, y + 22);

            if (data.reasons) {
                ctx.font = "700 15px Rajdhani";
                ctx.fillStyle = C.soft;
                ctx.fillText(Fit(ctx, row.reason || "ohne Grund", noteWidth), cols.reason, y + 22);

                if (row.note) {
                    ctx.font = "500 14px Rajdhani";
                    ctx.fillStyle = C.dim;
                    Wrap(ctx, `„${row.note}“`, noteWidth, 2).forEach((line, at) => ctx.fillText(line, cols.reason, y + 40 + at * 16));
                }
            }

            y += h;
        });

        if (more > 0) {
            ctx.fillStyle = C.line;
            ctx.fillRect(PAD, y, WIDTH - PAD * 2, 1);
            ctx.font = "600 14px Rajdhani";
            ctx.fillStyle = C.dim;
            ctx.fillText(`+ ${more} weitere`, PAD, y + 20);
        }
    }

    // Fuß.
    ctx.font = "600 13px Rajdhani";
    ctx.fillStyle = C.dim;
    ctx.fillText(Fit(ctx, data.footer, WIDTH / 2), PAD, height - 18);
    ctx.textAlign = "right";
    ctx.fillText(data.stamp, WIDTH - PAD, height - 18);
    ctx.textAlign = "left";

    return canvas.encode("webp", 90);
}
