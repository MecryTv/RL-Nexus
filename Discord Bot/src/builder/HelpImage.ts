import { Canvas, Image, SKRSContext2D, createCanvas, loadImage } from "@napi-rs/canvas";
import { RegisterFonts } from "./RankCard";
import { TwemojiUrl } from "../services/RoleListService";

/**
 * Die Seiten von /hilfe als Bilder (W-0014, Nachtrag Plan 45): der Look der
 * Entwürfe, 900 breit. Eine Seite wird zu mehreren Bildern, keins höher als
 * MAX_HEIGHT - ein sehr hohes Bild verkleinert Discord bis zur Unlesbarkeit.
 * Ein Block wird nie zerschnitten, außer er ist allein schon zu hoch.
 */

export type HelpBlock =
    | { kind: "title"; emoji: string; text: string; sub: string; note?: string }
    | { kind: "heading"; text: string }
    | { kind: "text"; text: string }
    | { kind: "code"; code: string; note?: string }
    | { kind: "fields"; rows: { name: string; required: boolean; text: string }[] }
    | { kind: "list"; items: string[] }
    | { kind: "tip"; text: string }
    | { kind: "tiles"; items: { emoji: string; value: string; label: string }[] }
    | { kind: "steps"; title: string; items: string[] }
    | { kind: "areas"; items: { emoji: string; name: string; count: string }[] }
    | { kind: "command"; emoji: string; display: string; who: string; text: string; fields: string; off?: string }
    | { kind: "chapter"; n: number; when?: string; display: string; who: string; text: string; code?: string; fields: string };

/**
 * 900 × höchstens 560: Discord begrenzt die Höhe eines Bilds in der Nachricht. Flacher als
 * etwa 0,62 füllt es die volle Breite, und 30 px Schrift landen bei etwa normaler Discord-Größe.
 */
const WIDTH = 900;
const MAX_HEIGHT = 560;
const PAD = 40;
const INNER = WIDTH - PAD * 2;
const GAP = 26;
const SCRATCH = 3200;

const C = {
    bg: "#2b2d31",
    text: "#dbdee1",
    strong: "#f2f3f5",
    muted: "#a9afb8",
    line: "#3f4147",
    codeBg: "#1e1f22",
    cmd: "#c9cdfb",
    cmdBg: "rgba(88,101,242,0.22)",
    gold: "#f0b232",
    tile: "#232428",
};

const BADGES: Record<string, { fg: string; bg: string }> = {
    alle: { fg: "#3ba55d", bg: "rgba(35,165,90,0.18)" },
    Team: { fg: "#f0b232", bg: "rgba(240,178,50,0.18)" },
    Verwalter: { fg: "#f23f43", bg: "rgba(242,63,67,0.18)" },
};

const FONT = {
    title: "800 52px Oxanium",
    heading: "700 34px Oxanium",
    body: "600 30px Rajdhani",
    bold: "700 30px Rajdhani",
    code: "600 28px Rajdhani",
    small: "600 25px Rajdhani",
    smallBold: "700 25px Rajdhani",
};

/* ----------------------------------------------------------
   Emojis als Twemoji-Bild, gemerkt
   ---------------------------------------------------------- */
async function FetchEmoji(emoji: string): Promise<Buffer | null> {
    const response = await fetch(TwemojiUrl(emoji), { signal: AbortSignal.timeout(3000) });

    return response.ok ? Buffer.from(await response.arrayBuffer()) : null;
}

let loader: (emoji: string) => Promise<Buffer | null> = FetchEmoji;
const emojis = new Map<string, Promise<Image | null>>();

/** Für die Prüfungen: Emojis ohne Netz. */
export function SetEmojiLoader(load: (emoji: string) => Promise<Buffer | null>): void {
    loader = load;
    emojis.clear();
}

function Emoji(emoji: string): Promise<Image | null> {
    let found = emojis.get(emoji);

    if (!found) {
        found = loader(emoji)
            .then((buffer) => (buffer ? loadImage(buffer) : null))
            .catch(() => null);
        emojis.set(emoji, found);
    }

    return found;
}

async function DrawEmoji(ctx: SKRSContext2D, emoji: string, x: number, y: number, size: number): Promise<boolean> {
    const image = await Emoji(emoji);

    if (image) ctx.drawImage(image, x, y, size, size);

    return image !== null;
}

/* ----------------------------------------------------------
   Text mit **fett** und `code`, umbrochen
   ---------------------------------------------------------- */
type Style = "body" | "bold" | "code";

interface IWord {
    text: string;
    style: Style;
}

function Words(markup: string): IWord[] {
    const words: IWord[] = [];

    for (const part of markup.split(/(\*\*[^*]+\*\*|`[^`]+`)/)) {
        if (!part) continue;

        const style: Style = part.startsWith("**") ? "bold" : part.startsWith("`") ? "code" : "body";
        const inner = style === "body" ? part : part.slice(style === "bold" ? 2 : 1, style === "bold" ? -2 : -1);

        // Code bleibt ein Stück, außer er ist zu lang für eine Zeile.
        if (style === "code") words.push({ text: inner, style });
        else for (const word of inner.split(/(?<= )/)) if (word) words.push({ text: word, style });
    }

    return words;
}

function Font(style: Style, size: "body" | "small"): string {
    if (style === "code") return FONT.code;
    if (size === "small") return style === "bold" ? FONT.smallBold : FONT.small;

    return style === "bold" ? FONT.bold : FONT.body;
}

/** Zeichnet umbrochenen Text, gibt die Höhe zurück. */
function Paragraph(ctx: SKRSContext2D, markup: string, x: number, y: number, width: number, options: { color?: string; size?: "body" | "small" } = {}): number {
    const size = options.size ?? "body";
    const lineHeight = size === "small" ? 34 : 42;
    const lines: { word: IWord; width: number }[][] = [[]];
    let used = 0;

    for (const word of Words(markup)) {
        ctx.font = Font(word.style, size);

        const measured = ctx.measureText(word.text).width + (word.style === "code" ? 16 : 0);

        if (used + measured > width && lines[lines.length - 1].length) {
            lines.push([]);
            used = 0;
        }

        lines[lines.length - 1].push({ word, width: measured });
        used += measured + (word.style === "code" ? 6 : 0);
    }

    ctx.textBaseline = "alphabetic";

    lines.forEach((line, index) => {
        let cursor = x;
        const base = y + index * lineHeight + lineHeight - 12;

        for (const { word, width: wordWidth } of line) {
            ctx.font = Font(word.style, size);

            if (word.style === "code") {
                ctx.fillStyle = C.cmdBg;
                ctx.beginPath();
                ctx.roundRect(cursor, base - lineHeight + 14, wordWidth, lineHeight - 6, 6);
                ctx.fill();
                ctx.fillStyle = C.cmd;
                ctx.fillText(word.text, cursor + 8, base);
                cursor += wordWidth + 6;
                continue;
            }

            ctx.fillStyle = word.style === "bold" ? C.strong : (options.color ?? C.text);
            ctx.fillText(word.text, cursor, base);
            cursor += wordWidth;
        }
    });

    return lines.length * lineHeight;
}

function Badge(ctx: SKRSContext2D, label: string, x: number, y: number): number {
    const colors = BADGES[label] ?? BADGES.Team;

    ctx.font = FONT.smallBold;

    const width = ctx.measureText(label).width + 20;

    ctx.fillStyle = colors.bg;
    ctx.beginPath();
    ctx.roundRect(x, y, width, 34, 6);
    ctx.fill();
    ctx.fillStyle = colors.fg;
    ctx.fillText(label, x + 10, y + 26);

    return width;
}

function Pill(ctx: SKRSContext2D, text: string, x: number, y: number, font: string): number {
    ctx.font = font;

    const width = ctx.measureText(text).width + 18;

    ctx.fillStyle = C.cmdBg;
    ctx.beginPath();
    ctx.roundRect(x, y, width, 44, 8);
    ctx.fill();
    ctx.fillStyle = C.cmd;
    ctx.fillText(text, x + 9, y + 33);

    return width;
}

function CodeBox(ctx: SKRSContext2D, code: string, x: number, y: number, width: number): number {
    ctx.font = FONT.code;

    // Langen Code umbrechen statt abschneiden.
    const lines: string[] = [""];

    for (const part of code.split(/(?<= )/)) {
        const next = lines[lines.length - 1] + part;

        if (ctx.measureText(next).width > width - 36 && lines[lines.length - 1]) lines.push(part);
        else lines[lines.length - 1] = next;
    }

    const height = lines.length * 38 + 24;

    ctx.fillStyle = C.codeBg;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 10);
    ctx.fill();
    ctx.strokeStyle = "#1a1b1e";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = C.text;
    lines.forEach((line, index) => ctx.fillText(line.trimEnd(), x + 18, y + 12 + 38 * index + 29));

    return height;
}

/** Gelber Hinweis mit Warn-Emoji davor - das Zeichen ⚠ hat keine der Schriften. */
async function Warning(ctx: SKRSContext2D, text: string, x: number, y: number): Promise<number> {
    const has = await DrawEmoji(ctx, "⚠️", x, y + 4, 26);

    return Paragraph(ctx, text, x + (has ? 36 : 0), y, INNER - (has ? 36 : 0), { color: C.gold, size: "small" });
}

/* ----------------------------------------------------------
   Die Blöcke
   ---------------------------------------------------------- */
async function DrawBlock(ctx: SKRSContext2D, block: HelpBlock, y: number): Promise<number> {
    const x = PAD;

    switch (block.kind) {
        case "title": {
            const has = await DrawEmoji(ctx, block.emoji, x, y + 4, 56);
            const left = x + (has ? 72 : 0);

            ctx.font = FONT.title;
            ctx.fillStyle = C.strong;
            ctx.fillText(block.text, left, y + 52);

            let height = 66 + Paragraph(ctx, block.sub, x, y + 70, INNER, { color: C.muted, size: "small" });

            if (block.note) height += 8 + (await Warning(ctx, block.note, x, y + height + 8));

            ctx.fillStyle = C.line;
            ctx.fillRect(x, y + height + 18, INNER, 2);

            return height + 22;
        }

        case "heading":
            ctx.font = FONT.heading;
            ctx.fillStyle = C.strong;
            ctx.fillText(block.text, x, y + 34);

            return 46;

        case "text":
            return Paragraph(ctx, block.text, x, y, INNER);

        case "code": {
            const box = CodeBox(ctx, block.code, x, y, INNER);

            return block.note ? box + 8 + Paragraph(ctx, block.note, x, y + box + 8, INNER, { color: C.muted, size: "small" }) : box;
        }

        case "fields": {
            let height = 0;

            for (const row of block.rows) {
                const width = Pill(ctx, `${row.name}${row.required ? "*" : ""}`, x, y + height, FONT.code);

                height += Math.max(48, Paragraph(ctx, row.text, x + width + 14, y + height, INNER - width - 14)) + 8;
            }

            return height;
        }

        case "list": {
            let height = 0;

            for (const item of block.items) {
                ctx.fillStyle = C.muted;
                ctx.beginPath();
                ctx.arc(x + 8, y + height + 24, 5, 0, Math.PI * 2);
                ctx.fill();
                height += Paragraph(ctx, item, x + 28, y + height, INNER - 28) + 4;
            }

            return height;
        }

        case "tip": {
            const scratch = createCanvas(WIDTH, 600).getContext("2d");
            const inner = Paragraph(scratch, `**Tipp:** ${block.text}`, 0, 0, INNER - 44);

            ctx.fillStyle = "rgba(240,178,50,0.08)";
            ctx.strokeStyle = "rgba(240,178,50,0.3)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(x, y, INNER, inner + 28, 10);
            ctx.fill();
            ctx.stroke();
            Paragraph(ctx, `**Tipp:** ${block.text}`, x + 22, y + 14, INNER - 44);

            return inner + 28;
        }

        case "tiles": {
            const columns = Math.min(block.items.length, 4);
            const width = (INNER - (columns - 1) * 16) / columns;

            for (const [index, item] of block.items.entries()) {
                const left = x + index * (width + 16);

                ctx.fillStyle = C.tile;
                ctx.beginPath();
                ctx.roundRect(left, y, width, 128, 12);
                ctx.fill();

                const has = await DrawEmoji(ctx, item.emoji, left + 20, y + 18, 34);

                ctx.font = "800 38px Oxanium";
                ctx.fillStyle = C.strong;
                ctx.fillText(item.value, left + 20 + (has ? 46 : 0), y + 50);
                ctx.font = FONT.small;
                ctx.fillStyle = C.muted;
                ctx.fillText(item.label, left + 20, y + 100);
            }

            return 128;
        }

        case "steps": {
            ctx.font = FONT.heading;
            ctx.fillStyle = C.strong;
            await DrawEmoji(ctx, "⚡", x, y + 4, 36);
            ctx.fillText(block.title, x + 48, y + 34);

            let height = 56;

            for (const [index, item] of block.items.entries()) {
                ctx.fillStyle = C.gold;
                ctx.beginPath();
                ctx.arc(x + 20, y + height + 21, 20, 0, Math.PI * 2);
                ctx.fill();
                ctx.font = "800 24px Oxanium";
                ctx.fillStyle = "#1a1300";
                ctx.textAlign = "center";
                ctx.fillText(String(index + 1), x + 20, y + height + 30);
                ctx.textAlign = "left";
                height += Math.max(46, Paragraph(ctx, item, x + 56, y + height, INNER - 56)) + 8;
            }

            return height;
        }

        case "areas": {
            const columns = 3;
            const width = (INNER - (columns - 1) * 16) / columns;
            const rows = Math.ceil(block.items.length / columns);

            for (const [index, item] of block.items.entries()) {
                const left = x + (index % columns) * (width + 16);
                const top = y + Math.floor(index / columns) * 112;

                ctx.fillStyle = C.tile;
                ctx.beginPath();
                ctx.roundRect(left, top, width, 96, 12);
                ctx.fill();
                await DrawEmoji(ctx, item.emoji, left + 18, top + 26, 44);
                ctx.font = "700 30px Oxanium";
                ctx.fillStyle = C.strong;
                ctx.fillText(item.name, left + 76, top + 44, width - 90);
                ctx.font = FONT.small;
                ctx.fillStyle = C.muted;
                ctx.fillText(item.count, left + 76, top + 78);
            }

            return rows * 112 - 16;
        }

        case "command": {
            const has = await DrawEmoji(ctx, block.emoji, x, y + 6, 34);
            const pill = Pill(ctx, block.display, x + (has ? 46 : 0), y, "700 30px Rajdhani");

            Badge(ctx, block.who, x + (has ? 46 : 0) + pill + 12, y + 5);

            let height = 54 + Paragraph(ctx, block.text, x, y + 54, INNER);

            if (block.off) height += await Warning(ctx, block.off, x, y + height);

            return height + Paragraph(ctx, block.fields, x, y + height, INNER, { color: C.muted, size: "small" });
        }

        case "chapter": {
            ctx.fillStyle = C.gold;
            ctx.beginPath();
            ctx.arc(x + 22, y + 22, 22, 0, Math.PI * 2);
            ctx.fill();
            ctx.font = "800 26px Oxanium";
            ctx.fillStyle = "#1a1300";
            ctx.textAlign = "center";
            ctx.fillText(String(block.n), x + 22, y + 31);
            ctx.textAlign = "left";

            const left = x + 60;
            const width = INNER - 60;
            let height = 0;

            if (block.when) {
                ctx.font = "700 24px Rajdhani";
                ctx.fillStyle = C.gold;
                ctx.fillText(block.when.toUpperCase(), left, y + 26);
                height = 38;
            }

            const pill = Pill(ctx, block.display, left, y + height, "700 30px Rajdhani");

            Badge(ctx, block.who, left + pill + 12, y + height + 5);
            height += 54;
            height += Paragraph(ctx, block.text, left, y + height, width);

            if (block.code) height += 8 + CodeBox(ctx, block.code, left, y + height + 8, width);

            return height + 6 + Paragraph(ctx, `Felder: ${block.fields}`, left, y + height + 6, width, { color: C.muted, size: "small" });
        }
    }
}

/** Ein Block auf eigener, genau passender Fläche. */
async function BlockImage(scratch: Canvas, block: HelpBlock): Promise<Canvas> {
    const ctx = scratch.getContext("2d");

    ctx.clearRect(0, 0, WIDTH, SCRATCH);

    const height = Math.min(Math.ceil(await DrawBlock(ctx, block, 0)), SCRATCH);
    const piece = createCanvas(WIDTH, Math.max(height, 1));

    piece.getContext("2d").drawImage(scratch, 0, 0, WIDTH, height, 0, 0, WIDTH, height);

    return piece;
}

/** Ein Bild und der Text darauf für die Bildbeschreibung. */
export interface IHelpImage {
    png: Buffer;
    alt: string;
}

export async function RenderHelpImages(blocks: HelpBlock[]): Promise<IHelpImage[]> {
    await RegisterFonts();

    const scratch = createCanvas(WIDTH, SCRATCH);
    // Nacheinander: alle Blöcke teilen sich die eine Arbeitsfläche.
    const pieces: Canvas[] = [];

    for (const block of blocks) pieces.push(await BlockImage(scratch, block));

    const images: Canvas[][] = [[]];
    const owners: HelpBlock[][] = [[]];
    let used = PAD;

    for (const [index, canvas] of pieces.entries()) {
        const height = Math.min(canvas.height, MAX_HEIGHT - PAD * 2);

        if (images[images.length - 1].length && used + height + PAD > MAX_HEIGHT) {
            // Eine Überschrift geht mit ihrem Inhalt ins nächste Bild, statt allein unten zu stehen.
            const last = owners[owners.length - 1];
            const carry = last.length > 1 && last[last.length - 1].kind === "heading";
            const heading = carry ? images[images.length - 1].pop()! : null;
            const headingBlock = carry ? last.pop()! : null;

            images.push(heading ? [heading] : []);
            owners.push(headingBlock ? [headingBlock] : []);
            used = PAD + (heading ? Math.min(heading.height, MAX_HEIGHT - PAD * 2) + GAP : 0);
        }

        images[images.length - 1].push(canvas);
        owners[owners.length - 1].push(blocks[index]);
        used += height + GAP;
    }

    return images.map((group, index) => {
        const height = Math.min(MAX_HEIGHT, PAD + group.reduce((sum, piece) => sum + Math.min(piece.height, MAX_HEIGHT - PAD * 2) + GAP, 0) - GAP + PAD);
        const canvas = createCanvas(WIDTH, height);
        const ctx = canvas.getContext("2d");
        let y = PAD;

        ctx.fillStyle = C.bg;
        ctx.fillRect(0, 0, WIDTH, height);

        for (const piece of group) {
            const part = Math.min(piece.height, MAX_HEIGHT - PAD * 2);

            ctx.drawImage(piece, 0, 0, WIDTH, part, 0, y, WIDTH, part);
            y += part + GAP;
        }

        return { png: canvas.toBuffer("image/png"), alt: HelpAlt(owners[index]) };
    });
}

function Plain(markup: string): string {
    return markup.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1");
}

/** Der Inhalt als Text für die Bildbeschreibung, höchstens 1024 Zeichen. */
export function HelpAlt(blocks: HelpBlock[]): string {
    const lines = blocks.map((block): string => {
        switch (block.kind) {
            case "title":
                return `${block.text}. ${block.sub}${block.note ? `. ${block.note}` : ""}`;
            case "heading":
                return `${block.text}:`;
            case "text":
                return Plain(block.text);
            case "code":
                return `${block.code}${block.note ? ` (${block.note})` : ""}`;
            case "fields":
                return block.rows.map((row) => `${row.name}${row.required ? " (Pflicht)" : ""}: ${row.text}`).join(" ");
            case "list":
                return block.items.map(Plain).join(". ");
            case "tip":
                return `Tipp: ${Plain(block.text)}`;
            case "tiles":
                return block.items.map((item) => `${item.label}: ${item.value}`).join(", ");
            case "steps":
                return `${block.title}: ${block.items.map(Plain).join(". ")}`;
            case "areas":
                return block.items.map((item) => `${item.name} (${item.count})`).join(", ");
            case "command":
                return `${block.display} (${block.who}): ${Plain(block.text)}`;
            case "chapter":
                return `${block.n}. ${block.display}: ${Plain(block.text)}`;
        }
    });
    const text = lines.join(" ").replace(/\s+/g, " ").trim();

    return text.length <= 1024 ? text : `${text.slice(0, 1023)}…`;
}
