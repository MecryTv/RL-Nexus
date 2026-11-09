import { Canvas, Image, SKRSContext2D, createCanvas, loadImage } from "@napi-rs/canvas";
import { RegisterFonts } from "./RankCard";
import { TwemojiUrl } from "../services/RoleListService";
import { Chars, Cut } from "../utils/cut";

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
    | { kind: "chapter"; n: number; when?: string; display: string; who: string; text: string; code?: string; fields: string }
    /** Kopf einer Fall-Karte (Moderation): Titel, User als Pille, Zeile darunter, Bild rechts. */
    | { kind: "caseHead"; emoji: string; title: string; user?: string; sub: string; by?: string; avatar?: Buffer }
    /** Einstellungen (/einstellungen) als nummerierte Kacheln, drei je Zeile, mit Abschnitt darüber. */
    | { kind: "settings"; title?: string; items: { n: number; label: string; value: string; state?: "on" | "off"; hi?: boolean; dim?: boolean }[] }
    /** Beweise als Zeilen: Vorschau oder Emoji, Titel, wer und wann. */
    | { kind: "evidence"; items: { thumb?: Buffer; icon: string; title: string; sub: string; quote?: boolean }[] };

/**
 * Gezeichnet wird in 900 logischen Pixeln Breite, ausgegeben in 1100 - so breit wie
 * das Banner. Discord zeigt ein Bild höchstens etwa 350 Pixel hoch; flacher als 1100 × 580
 * bleibt es deshalb in jeder Fenstergröße so breit wie das Banner darüber.
 */
const WIDTH = 900;
const OUT_WIDTH = 1100;
const SCALE = OUT_WIDTH / WIDTH;
/** Höhe eines fertigen Bilds, in Pixeln der Ausgabe. */
const MAX_HEIGHT = 580;
const PAD = 40;
const INNER = WIDTH - PAD * 2;
const GAP = 26;
/** Rand und Abstand in Pixeln der Ausgabe. */
const OUT_PAD = Math.round(PAD * SCALE);
const OUT_GAP = Math.round(GAP * SCALE);
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
/** Dieselben, sobald sie da sind - Text mit Emojis wird ohne Warten gezeichnet. */
const loaded = new Map<string, Image | null>();

/** Für die Prüfungen: Emojis ohne Netz. */
export function SetEmojiLoader(load: (emoji: string) => Promise<Buffer | null>): void {
    loader = load;
    emojis.clear();
    loaded.clear();
}

function Emoji(emoji: string): Promise<Image | null> {
    let found = emojis.get(emoji);

    if (!found) {
        found = loader(emoji)
            .then((buffer) => (buffer ? loadImage(buffer) : null))
            .catch(() => null)
            .then((image) => {
                loaded.set(emoji, image);

                return image;
            });
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
   Text mit Emojis: Oxanium und Rajdhani haben keine, im Abbild
   gibt es keine Systemschrift - ohne das würden sie Kästchen.
   ---------------------------------------------------------- */

/** Bildzeichen, Flaggen und Tastenkappen. © ® ™ ohne Emoji-Variante haben die Schriften selbst. */
const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20E3/u;

/** Text in Läufe: jedes Emoji für sich, der Rest am Stück. */
export function Runs(text: string): { text: string; emoji: boolean }[] {
    // Fast jeder Text hat keins - dann ohne Zerlegen, das kostet bei jedem Wort.
    if (!EMOJI.test(text)) return [{ text, emoji: false }];

    const runs: { text: string; emoji: boolean }[] = [];

    for (const char of Chars(text)) {
        const emoji = EMOJI.test(char) && !/^[©®™]$/.test(char);
        const last = runs[runs.length - 1];

        if (last && !last.emoji && !emoji) last.text += char;
        else runs.push({ text: char, emoji });
    }

    return runs;
}

/** Lädt die Emojis in den Texten vorab - DrawText zeichnet danach, ohne zu warten. */
export async function LoadEmojis(texts: string[]): Promise<void> {
    await Promise.all(texts.flatMap((text) => Runs(text).filter((run) => run.emoji).map((run) => Emoji(run.text))));
}

/**
 * Für Zeichen, die Oxanium und Rajdhani nicht haben (┃, Kyrillisch, ★, CJK). Skia
 * sucht keine Systemschrift von selbst, es nimmt nur, was in ctx.font steht - und
 * überspringt Namen, die es nicht gibt. Im Abbild sind diese Schriften erst mit den
 * Debian-Paketen da (fonts-dejavu-core, fonts-noto-core, fonts-noto-cjk), bis
 * dahin bleibt es dort beim Kästchen.
 */
const FALLBACK = `"Noto Sans", "DejaVu Sans", "Noto Sans Symbols 2", "Noto Sans Math", "Noto Sans CJK JP"`;

function WithFallback<T>(ctx: SKRSContext2D, text: string, use: () => T): T {
    // ASCII haben die Schriften selbst - und das Umstellen kostet bei jedem Wort.
    if (/^[\x20-\x7E]*$/.test(text)) return use();

    const font = ctx.font;

    ctx.font = `${font}, ${FALLBACK}`;

    try {
        return use();
    } finally {
        ctx.font = font;
    }
}

/** Ein Emoji ist so breit, wie die Schrift groß ist. */
function EmSize(ctx: SKRSContext2D): number {
    return Number(/([\d.]+)px/.exec(ctx.font)?.[1] ?? 30);
}

/** Ohne geladenes Bild steht das Emoji als Text da - dann zählt seine Breite als Text. */
function RunWidth(ctx: SKRSContext2D, run: { text: string; emoji: boolean }): number {
    return run.emoji && loaded.get(run.text) ? EmSize(ctx) : WithFallback(ctx, run.text, () => ctx.measureText(run.text).width);
}

/** Wie measureText().width, mit Emojis als Bild. */
export function TextWidth(ctx: SKRSContext2D, text: string): number {
    return Runs(text).reduce((sum, run) => sum + RunWidth(ctx, run), 0);
}

/** Wie fillText (links, auf der Grundlinie), Emojis als Twemoji-Bild, wenn es geladen ist. */
export function DrawText(ctx: SKRSContext2D, text: string, x: number, y: number): void {
    const runs = Runs(text);

    // Ohne Emoji wie bisher: ein fillText, ohne nachzumessen.
    if (runs.length === 1 && !runs[0].emoji) return WithFallback(ctx, text, () => ctx.fillText(text, x, y));

    const em = EmSize(ctx);
    let cursor = x;

    for (const run of runs) {
        const image = run.emoji ? loaded.get(run.text) : null;

        // Etwas kleiner als die Schrift, mittig auf der Höhe der Großbuchstaben.
        if (image) ctx.drawImage(image, cursor + em * 0.05, y - em * 0.8, em * 0.9, em * 0.9);
        else WithFallback(ctx, run.text, () => ctx.fillText(run.text, cursor, y));

        cursor += RunWidth(ctx, run);
    }
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

        const measured = TextWidth(ctx, word.text) + (word.style === "code" ? 16 : 0);

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
                DrawText(ctx, word.text, cursor + 8, base);
                cursor += wordWidth + 6;
                continue;
            }

            ctx.fillStyle = word.style === "bold" ? C.strong : (options.color ?? C.text);
            DrawText(ctx, word.text, cursor, base);
            cursor += wordWidth;
        }
    });

    return lines.length * lineHeight;
}

/**
 * Kürzt auf eine Zeile mit „…“ - für Namen und Gründe, die nie umbrechen sollen.
 * Geschnitten wird zwischen ganzen Zeichen, ein Emoji bleibt ganz oder fällt weg.
 */
export function Fit(ctx: SKRSContext2D, text: string, width: number): string {
    if (TextWidth(ctx, text) <= width) return text;

    const chars = Chars(text);
    const cut = (count: number) => `${chars.slice(0, count).join("").trimEnd()}…`;
    let low = 1;
    let high = chars.length - 1;

    // Die längste Kürzung, die passt - halbiert gesucht, eine Nachricht als Beweis kann lang sein.
    while (low < high) {
        const middle = Math.ceil((low + high) / 2);

        if (TextWidth(ctx, cut(middle)) <= width) low = middle;
        else high = middle - 1;
    }

    return cut(low);
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

    const width = TextWidth(ctx, text) + 18;

    ctx.fillStyle = C.cmdBg;
    ctx.beginPath();
    ctx.roundRect(x, y, width, 44, 8);
    ctx.fill();
    ctx.fillStyle = C.cmd;
    DrawText(ctx, text, x + 9, y + 33);

    return width;
}

function CodeBox(ctx: SKRSContext2D, code: string, x: number, y: number, width: number): number {
    ctx.font = FONT.code;

    // Langen Code umbrechen statt abschneiden.
    const lines: string[] = [""];

    for (const part of code.split(/(?<= )/)) {
        const next = lines[lines.length - 1] + part;

        if (TextWidth(ctx, next) > width - 36 && lines[lines.length - 1]) lines.push(part);
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
    lines.forEach((line, index) => DrawText(ctx, line.trimEnd(), x + 18, y + 12 + 38 * index + 29));

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

        case "caseHead": {
            const size = 104;
            const width = INNER - (block.avatar ? size + 24 : 0);
            const has = await DrawEmoji(ctx, block.emoji, x, y + 2, 46);
            const left = x + (has ? 60 : 0);

            ctx.font = "800 44px Oxanium";
            ctx.fillStyle = C.strong;
            DrawText(ctx, Fit(ctx, block.title, width - (left - x)), left, y + 42);

            let cursor = x;

            if (block.user) {
                ctx.font = "700 28px Rajdhani";
                cursor += Pill(ctx, Fit(ctx, block.user, width / 2), x, y + 56, "700 28px Rajdhani") + 12;
            }

            ctx.font = FONT.small;
            ctx.fillStyle = C.muted;
            DrawText(ctx, Fit(ctx, block.sub, width - (cursor - x)), cursor, y + 87);

            let height = 104;

            if (block.by) {
                DrawText(ctx, Fit(ctx, block.by, width), x, y + height + 26);
                height += 34;
            }

            const avatar = block.avatar ? await loadImage(block.avatar).catch(() => null) : null;

            if (avatar) {
                const left = x + INNER - size;

                ctx.save();
                ctx.beginPath();
                ctx.arc(left + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
                ctx.clip();
                ctx.drawImage(avatar, left, y, size, size);
                ctx.restore();
            }

            return Math.max(height, avatar ? size : 0);
        }

        case "settings": {
            const columns = 3;
            const gap = 12;
            const tile = 80;
            const width = (INNER - gap * (columns - 1)) / columns;
            let height = 0;

            if (block.title) {
                ctx.font = "700 22px Rajdhani";
                ctx.fillStyle = C.muted;
                ctx.fillText(block.title.toUpperCase(), x, y + 20);
                height = 34;
            }

            for (const [index, item] of block.items.entries()) {
                const left = x + (index % columns) * (width + gap);
                const top = y + height + Math.floor(index / columns) * (tile + gap);

                // Blass: in der Übersicht die Module ohne eigene Einstellungen (W-0014 Teil 4, A1).
                ctx.globalAlpha = item.dim ? 0.5 : 1;
                ctx.fillStyle = item.hi ? "rgba(240,178,50,0.14)" : C.tile;
                ctx.beginPath();
                ctx.roundRect(left, top, width, tile, 10);
                ctx.fill();

                if (item.hi) {
                    ctx.strokeStyle = C.gold;
                    ctx.lineWidth = 3;
                    ctx.stroke();
                }

                ctx.fillStyle = C.gold;
                ctx.beginPath();
                ctx.arc(left + 26, top + 26, 15, 0, Math.PI * 2);
                ctx.fill();
                ctx.font = "800 17px Oxanium";
                ctx.fillStyle = "#1a1300";
                ctx.textAlign = "center";
                ctx.fillText(String(item.n), left + 26, top + 32);
                ctx.textAlign = "left";
                ctx.font = FONT.small;
                ctx.fillStyle = C.muted;
                DrawText(ctx, Fit(ctx, item.label, width - 62), left + 50, top + 34);
                ctx.font = "800 28px Oxanium";
                ctx.fillStyle = item.state === "on" ? "#35e07f" : item.state === "off" ? C.muted : C.strong;
                DrawText(ctx, Fit(ctx, item.value, width - 28), left + 14, top + 68);
                ctx.globalAlpha = 1;
            }

            const rows = Math.ceil(block.items.length / columns);

            return height + rows * tile + Math.max(0, rows - 1) * gap;
        }

        case "evidence": {
            const row = 66;
            let height = 0;

            for (const item of block.items) {
                const top = y + height;
                const box = { x: x + 10, y: top + 10, w: 80, h: row - 20 };
                const thumb = item.thumb ? await loadImage(item.thumb).catch(() => null) : null;

                ctx.fillStyle = C.tile;
                ctx.beginPath();
                ctx.roundRect(x, top, INNER, row, 12);
                ctx.fill();

                ctx.save();
                ctx.beginPath();
                ctx.roundRect(box.x, box.y, box.w, box.h, 8);
                ctx.clip();
                ctx.fillStyle = C.codeBg;
                ctx.fillRect(box.x, box.y, box.w, box.h);

                if (thumb) {
                    // Wie object-fit: cover - die Mitte des Bilds füllt die Vorschau.
                    const scale = Math.max(box.w / thumb.width, box.h / thumb.height);
                    const w = thumb.width * scale;
                    const h = thumb.height * scale;

                    ctx.drawImage(thumb, box.x + (box.w - w) / 2, box.y + (box.h - h) / 2, w, h);
                }

                ctx.restore();

                if (!thumb) await DrawEmoji(ctx, item.icon, box.x + box.w / 2 - 15, box.y + box.h / 2 - 15, 30);

                const left = box.x + box.w + 16;
                const width = INNER - (left - x) - 14;

                ctx.font = FONT.bold;
                ctx.fillStyle = item.quote ? C.text : C.strong;
                DrawText(ctx, Fit(ctx, item.title, width), left, top + 29);
                ctx.font = FONT.small;
                ctx.fillStyle = C.muted;
                DrawText(ctx, Fit(ctx, item.sub, width), left, top + 56);

                height += row + 10;
            }

            return Math.max(0, height - 10);
        }
    }
}

/** Alle Texte eines Blocks, Bilder ausgenommen - für das Vorladen der Emojis. */
function Texts(value: unknown): string[] {
    if (typeof value === "string") return [value];
    if (!value || typeof value !== "object" || Buffer.isBuffer(value)) return [];

    return Object.values(value).flatMap(Texts);
}

/** Ein Block auf eigener, genau passender Fläche. */
async function BlockImage(scratch: Canvas, block: HelpBlock): Promise<Canvas> {
    const ctx = scratch.getContext("2d");

    await LoadEmojis(Texts(block));

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, scratch.width, scratch.height);
    // Logisch zeichnen, scharf in voller Ausgabegröße.
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);

    const height = Math.min(Math.ceil((await DrawBlock(ctx, block, 0)) * SCALE), scratch.height);
    const piece = createCanvas(OUT_WIDTH, Math.max(height, 1));

    piece.getContext("2d").drawImage(scratch, 0, 0, OUT_WIDTH, height, 0, 0, OUT_WIDTH, height);

    return piece;
}

/** Ein Bild und der Text darauf für die Bildbeschreibung. */
export interface IHelpImage {
    png: Buffer;
    alt: string;
}

export async function RenderHelpImages(blocks: HelpBlock[]): Promise<IHelpImage[]> {
    await RegisterFonts();

    const scratch = createCanvas(OUT_WIDTH, Math.ceil(SCRATCH * SCALE));
    // Nacheinander: alle Blöcke teilen sich die eine Arbeitsfläche.
    const pieces: Canvas[] = [];

    for (const block of blocks) pieces.push(await BlockImage(scratch, block));

    const images: Canvas[][] = [[]];
    const owners: HelpBlock[][] = [[]];
    let used = OUT_PAD;

    for (const [index, canvas] of pieces.entries()) {
        const height = Math.min(canvas.height, MAX_HEIGHT - OUT_PAD * 2);

        if (images[images.length - 1].length && used + height + OUT_PAD > MAX_HEIGHT) {
            // Eine Überschrift geht mit ihrem Inhalt ins nächste Bild, statt allein unten zu stehen.
            const last = owners[owners.length - 1];
            const carry = last.length > 1 && last[last.length - 1].kind === "heading";
            const heading = carry ? images[images.length - 1].pop()! : null;
            const headingBlock = carry ? last.pop()! : null;

            images.push(heading ? [heading] : []);
            owners.push(headingBlock ? [headingBlock] : []);
            used = OUT_PAD + (heading ? Math.min(heading.height, MAX_HEIGHT - OUT_PAD * 2) + OUT_GAP : 0);
        }

        images[images.length - 1].push(canvas);
        owners[owners.length - 1].push(blocks[index]);
        used += height + OUT_GAP;
    }

    return images.map((group, index) => {
        const height = Math.min(MAX_HEIGHT, OUT_PAD + group.reduce((sum, piece) => sum + Math.min(piece.height, MAX_HEIGHT - OUT_PAD * 2) + OUT_GAP, 0) - OUT_GAP + OUT_PAD);
        const canvas = createCanvas(OUT_WIDTH, height);
        const ctx = canvas.getContext("2d");
        let y = OUT_PAD;

        ctx.fillStyle = C.bg;
        ctx.fillRect(0, 0, OUT_WIDTH, height);

        for (const piece of group) {
            const part = Math.min(piece.height, MAX_HEIGHT - OUT_PAD * 2);

            ctx.drawImage(piece, 0, 0, OUT_WIDTH, part, 0, y, OUT_WIDTH, part);
            y += part + OUT_GAP;
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
            case "caseHead":
                return `${block.title}. ${[block.user, block.sub].filter(Boolean).join(", ")}${block.by ? `. ${block.by}` : ""}`;
            case "evidence":
                return block.items.map((item) => `${item.title} (${item.sub})`).join(". ");
            case "settings":
                return `${block.title ? `${block.title}: ` : ""}${block.items.map((item) => `${item.n}. ${item.label}: ${item.value}`).join(", ")}`;
        }
    });
    const text = lines.join(" ").replace(/\s+/g, " ").trim();

    return Cut(text, 1024);
}
