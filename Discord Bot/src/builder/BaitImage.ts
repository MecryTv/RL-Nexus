import { createCanvas, SKRSContext2D } from "@napi-rs/canvas";
import { RegisterFonts } from "./RankCard";

/**
 * W-0063, Entwurf K2 „Warnband“: das Warnbild im Köder-Kanal. Gelb-schwarzer
 * Rand, dunkles Feld, rotes STOPP, ein Satz, rechts der Zähler im Ring.
 * hold: Die Stufe hält fest (Normal, Streng), sonst wird nur gemeldet (Locker).
 */

const W = 1000;
const H = 440;
const YELLOW = "#f0b232";
const INK = "#141518";

/** Was im Bild steht - auch für den Alt-Text. */
export function BaitLines(hold: boolean): { title: string; lead: string } {
    return {
        title: "Hier nichts schreiben.",
        lead: hold
            ? "Falle für Bots und gekaperte Accounts. Wer hier schreibt, wird festgehalten, bis das Team nachgesehen hat."
            : "Falle für Bots und gekaperte Accounts. Wer hier schreibt, wird dem Team gemeldet.",
    };
}

/** Der Zähler, wie er im Ring steht. */
export function BaitCount(caught: number): string {
    return caught > 999 ? "999+" : String(Math.max(0, Math.floor(caught)));
}

export function BaitAlt(caught: number, hold: boolean): string {
    const { title, lead } = BaitLines(hold);

    return `Warnung: STOPP. ${title} ${lead} ${BaitCount(caught)} gefangen in 30 Tagen.`;
}

function wrap(ctx: SKRSContext2D, text: string, width: number): string[] {
    const lines: string[] = [];
    let line = "";

    for (const word of text.split(" ")) {
        const next = line ? `${line} ${word}` : word;

        if (ctx.measureText(next).width <= width || !line) line = next;
        else {
            lines.push(line);
            line = word;
        }
    }

    if (line) lines.push(line);

    return lines.slice(0, 3);
}

function rounded(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

const cache = new Map<string, Buffer>();

export async function RenderBait(caught: number, hold: boolean): Promise<Buffer> {
    const key = `${BaitCount(caught)}:${hold ? 1 : 0}`;
    const hit = cache.get(key);

    if (hit) return hit;

    await RegisterFonts();

    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d");

    // Warnband: schwarz, darüber schräge gelbe Streifen.
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = YELLOW;

    for (let x = -H; x < W + H; x += 64) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 32, 0);
        ctx.lineTo(x + 32 - H, H);
        ctx.lineTo(x - H, H);
        ctx.closePath();
        ctx.fill();
    }

    // Das Feld innen.
    ctx.fillStyle = "#121316";
    rounded(ctx, 26, 26, W - 52, H - 52, 10);
    ctx.fill();

    const { title, lead } = BaitLines(hold);
    const left = 66;

    ctx.fillStyle = "#ff3344";
    ctx.font = "800 104px Oxanium";
    ctx.fillText("STOPP", left - 4, 178);

    ctx.fillStyle = "#ffffff";
    ctx.font = "800 34px Oxanium";
    ctx.fillText(title, left, 232);

    ctx.fillStyle = "#c3c8d0";
    ctx.font = "600 25px Rajdhani";
    wrap(ctx, lead, 560).forEach((line, index) => ctx.fillText(line, left, 278 + index * 31));

    // Der Zähler im Ring.
    const cx = 810;
    const cy = H / 2;

    ctx.strokeStyle = YELLOW;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(cx, cy, 108, 0, Math.PI * 2);
    ctx.stroke();

    const count = BaitCount(caught);

    ctx.fillStyle = YELLOW;
    ctx.textAlign = "center";
    ctx.font = `800 ${count.length > 3 ? 56 : 76}px Oxanium`;
    ctx.fillText(count, cx, cy + 14);
    ctx.fillStyle = "#a4abb4";
    ctx.font = "700 21px Rajdhani";
    ctx.fillText("GEFANGEN", cx, cy + 50);
    ctx.fillText("30 TAGE", cx, cy + 74);
    ctx.textAlign = "left";

    const png = canvas.toBuffer("image/png");

    // ponytail: ein Bild je Zählerstand und Stufe, ohne Obergrenze; mehr als ein paar hundert Einträge gibt es kaum.
    cache.set(key, png);

    return png;
}
