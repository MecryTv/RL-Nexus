import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import { COLOR_HEX, berlinDay, fillContent, type IMessageButton, type IMessageContent } from "../../shared/messages.ts";
import type { IConfig } from "../config.ts";
import { postDirectMessage } from "../discord.ts";
import { fit, registerFonts } from "../status/image.ts";
import { avatar, stamp, tileLabel, wrap } from "../userdata/dm.ts";
import { personBase } from "../userdata/flow.ts";

/**
 * Nachrichten über den Bot (W-0058, Spec Teil 2): die DM als Bild im Stil I1
 * wie die Sperr-DM, darunter Link-Knöpfe. Streifen und Stempel in der Farbe
 * der Nachricht, Profilbild und Titel, große Zeile, Kacheln, Fußzeile. Die
 * Höhe wächst mit dem Text, was unten frei bleibt, schneidet die Leinwand ab.
 */

const W = 800;
const PAD = 36;
const BG = "#2b2d31";
const TILE = "#232428";
const TEXT = "#f2f3f5";
const DIM = "#a9afb8";
/** Der Stempel aus userdata/dm.ts steht mit seiner Mitte hier. */
const STAMP_X = W - PAD - 110;
/** Unterhalb davon reicht der gedrehte Stempel nicht mehr. */
const STAMP_BOTTOM = 114;
const TEXT_X = PAD + 92;

export type FailureKind = "person" | "spam" | "trouble";

export interface ISendFailure {
    readonly reason: string;
    readonly kind: FailureKind;
}

/** Discords Codes für „DMs zu schnell geöffnet“ und „Bot als Spam markiert“. */
const SPAM_CODES = new Set([40003, 20026]);
/** Nur diese Person: DMs zu (50007), Konto weg (10013), kein gültiger Empfänger (50033). */
const PERSON_CODES = new Set([50007, 10013, 50033]);

/**
 * Wen ein Fehler betrifft: nur diese Person (die Codes oben), ein
 * Spam-Signal von Discord oder eine Störung. Störung ist alles andere: keine
 * Antwort, 401 (Bot-Token gilt nicht), 429 auch nach dem Warten, 5xx und
 * jede unbekannte 4xx, denn die trifft meist alle.
 */
export function failureKind(_status: number | null, code: number | null): FailureKind {
    if (code !== null && SPAM_CODES.has(code)) return "spam";
    if (code !== null && PERSON_CODES.has(code)) return "person";

    return "trouble";
}

/** Sätze für die Codes, die beim Versand an viele vorkommen. Der Rest bleibt Discords Status und Code. */
const REASONS: Readonly<Record<number, string>> = {
    10013: "Discord kennt dieses Konto nicht mehr.",
    50033: "Discord nimmt diese Person nicht als Empfänger an.",
    40003: "Discord meldet: zu viele neue DMs in kurzer Zeit.",
    20026: "Discord hat den Bot als Spam markiert.",
};

/* --- Bild ------------------------------------------------------------------ */

/** Wörter, die allein breiter sind als width, in Stücke teilen: wrap() setzt ein Wort sonst über den Rand. */
function breakWords(ctx: SKRSContext2D, text: string, width: number): string {
    return text
        .split(" ")
        .flatMap((word) => {
            if (ctx.measureText(word).width <= width) return [word];

            const parts: string[] = [];
            let part = "";

            for (const char of word) {
                if (part && ctx.measureText(part + char).width > width) {
                    parts.push(part);
                    part = "";
                }

                part += char;
            }

            return part ? [...parts, part] : parts;
        })
        .join(" ");
}

/** Zeilen, deren Breite davon abhängt, ob sie neben dem Stempel stehen. Höchstens max, der Rest endet mit „…“ (cut). */
function flow(ctx: SKRSContext2D, text: string, widthOf: (index: number) => number, max: number): { readonly lines: string[]; readonly cut: boolean } {
    const lines: string[] = [];
    let rest = breakWords(ctx, text, Math.min(widthOf(0), widthOf(max - 1)));

    while (rest && lines.length < max - 1) {
        const [line] = wrap(ctx, rest, widthOf(lines.length), Infinity);
        if (!line) break;

        lines.push(line);
        rest = rest.slice(line.length).trimStart();
    }

    if (!rest) return { lines, cut: false };

    const last = fit(ctx, rest, widthOf(lines.length));

    return { lines: [...lines, last], cut: last !== rest };
}

/** Wie flow, aber erst kleiner (sizes der Reihe nach), erst dann gekürzt. Stellt die Schrift auf die gefundene Größe. */
function shrink(ctx: SKRSContext2D, text: string, font: (size: number) => string, sizes: readonly number[], widthOf: (index: number, size: number) => number, max: number): { readonly lines: string[]; readonly size: number } {
    let found = { lines: [] as string[], size: sizes[0] ?? 20 };

    for (const size of sizes) {
        ctx.font = font(size);

        const result = flow(ctx, text, (index) => widthOf(index, size), max);

        found = { lines: result.lines, size };
        if (!result.cut) break;
    }

    return found;
}

/** Die große Zeile so groß wie möglich, erst dann gekürzt. Stellt die Schrift ein. */
function bigText(ctx: SKRSContext2D, text: string, width: number): { readonly size: number; readonly text: string } {
    for (const size of [56, 48, 40, 34]) {
        ctx.font = `800 ${size}px Oxanium`;
        if (ctx.measureText(text).width <= width) return { size, text };
    }

    return { size: 34, text: fit(ctx, text, width) };
}

export function footerOf(content: IMessageContent, sender: string, at: Date): string {
    return `${content.signed ? `${sender} vom Team von RL Nexus` : "Nachricht vom Team von RL Nexus"} · ${berlinDay(at)}`;
}

interface IRenderInput {
    readonly person: { readonly name: string; readonly avatar: Buffer | null };
    readonly at: Date;
    readonly sender: string;
}

async function paint(ctx: SKRSContext2D, content: IMessageContent, input: IRenderInput): Promise<number> {
    const color = COLOR_HEX[content.color];

    await avatar(ctx, input.person, PAD, 34, 72);

    // Der Stempel darf nicht über den Rand: Ein sehr breiter wird gekürzt.
    ctx.font = "800 26px Oxanium";
    const stampText = fit(ctx, content.stamp.toUpperCase(), 2 * (W - STAMP_X - 8) - 28);
    const stampLeft = STAMP_X - (ctx.measureText(stampText).width + 28) / 2 - 10;
    const beside = stampLeft - 16 - TEXT_X;
    const wide = W - PAD - TEXT_X;

    stamp(ctx, stampText, color);

    ctx.textAlign = "left";
    ctx.fillStyle = TEXT;

    // Neben dem Stempel ist wenig Platz: lieber zwei Zeilen und kleiner als gekürzt.
    const title = shrink(ctx, content.title, (size) => `800 ${size}px Oxanium`, [28, 25, 22], () => beside, 2);
    const titleLine = title.size + 4;
    title.lines.forEach((line, index) => ctx.fillText(line, TEXT_X, 62 + index * titleLine));

    let y = 62 + (title.lines.length - 1) * titleLine;

    if (content.intro) {
        const first = y + 30;
        const intro = shrink(ctx, content.intro, (size) => `600 ${size}px Rajdhani`, [20, 18, 16], (index, size) => (first + index * (size + 6) - 18 < STAMP_BOTTOM ? beside : wide), 2);

        ctx.fillStyle = DIM;
        intro.lines.forEach((line, index) => ctx.fillText(line, TEXT_X, first + index * (intro.size + 6)));
        y = first + (intro.lines.length - 1) * (intro.size + 6);
    }

    y = Math.max(140, y + 36);

    if (content.big) {
        const big = bigText(ctx, content.big.text, W - 2 * PAD);

        ctx.fillStyle = TEXT;
        ctx.fillText(big.text, PAD, y + big.size * 0.82);
        y += big.size * 0.82 + 12;

        if (content.big.note) {
            ctx.font = "600 20px Rajdhani";
            ctx.fillStyle = DIM;

            const note = flow(ctx, content.big.note, () => W - 2 * PAD, 2).lines;
            note.forEach((line, index) => ctx.fillText(line, PAD, y + 20 + index * 26));
            y += 20 + (note.length - 1) * 26;
        }

        y += 28;
    }

    for (const box of content.boxes) {
        const inner = W - 2 * PAD - 32;

        ctx.font = "600 20px Rajdhani";

        // Jeder Absatz bricht für sich um; eine leere Zeile bleibt als Abstand.
        const paragraphs = box.text.split("\n").map((paragraph) => (paragraph.trim() ? wrap(ctx, breakWords(ctx, paragraph.trim(), inner), inner, Infinity) : []));
        const textHeight = paragraphs.reduce((sum, lines) => sum + (lines.length > 0 ? lines.length * 26 : 14), 0);
        const height = 18 + (box.label ? 26 : 0) + textHeight + 10;

        ctx.fillStyle = TILE;
        ctx.beginPath();
        ctx.roundRect(PAD, y, W - 2 * PAD, height, 8);
        ctx.fill();

        let line = y + 18;

        if (box.label) {
            const label = tileLabel(ctx, box.label, inner);

            ctx.fillStyle = DIM;
            ctx.fillText(label.text, PAD + 16, line + 12);
            line += 26;
        }

        ctx.font = "600 20px Rajdhani";
        ctx.fillStyle = TEXT;

        for (const lines of paragraphs) {
            if (lines.length === 0) line += 14;

            for (const text of lines) {
                ctx.fillText(text, PAD + 16, line + 17);
                line += 26;
            }
        }

        y += height + 12;
    }

    ctx.font = "600 17px Rajdhani";
    ctx.fillStyle = DIM;
    ctx.fillText(fit(ctx, footerOf(content, input.sender, input.at), W - 2 * PAD), PAD, y + 16);

    return y + 40;
}

/** Ein Satz endet mit einem Zeichen, sonst kommt ein Punkt dazu. */
const sentence = (text: string): string => (/[.!?:,…]$/.test(text) ? text : `${text}.`);
const oneLine = (text: string): string => text.replace(/\s+/g, " ").trim();

/** Alles, was im Bild steht, höchstens 1024 Zeichen. Wird es zu lang, kürzt es die Kacheln, die Fußzeile bleibt. */
export function altOf(content: IMessageContent, sender: string, at: Date): string {
    const head = [content.title, content.intro, content.big ? `${content.big.text}${content.big.note ? ` – ${content.big.note}` : ""}` : ""].filter(Boolean).map(oneLine).map(sentence).join(" ");
    const boxes = content.boxes.map((box) => sentence(oneLine(box.label ? `${box.label}: ${box.text}` : box.text))).join(" ");
    const footer = footerOf(content, sender, at);
    const room = 1024 - head.length - footer.length - 2;
    const middle = boxes.length <= room ? boxes : `${boxes.slice(0, Math.max(0, room - 1)).trimEnd()}…`;

    return [head, middle, footer].filter(Boolean).join(" ").slice(0, 1024);
}

/** Das Bild der Nachricht. Der Inhalt kommt schon mit eingesetzten Platzhaltern. */
export async function renderMessageDm(content: IMessageContent, input: IRenderInput): Promise<{ readonly name: "rl-nexus-nachricht.png"; readonly data: Buffer; readonly alt: string }> {
    registerFonts();

    let height = 720;

    for (;;) {
        const canvas = createCanvas(W, height);
        const ctx = canvas.getContext("2d");

        ctx.fillStyle = BG;
        ctx.fillRect(0, 0, W, height);
        ctx.fillStyle = COLOR_HEX[content.color];
        ctx.fillRect(0, 0, W, 6);

        const used = Math.ceil(await paint(ctx, content, input));

        if (used > height) {
            height = used + 8;
            continue;
        }

        // Was unten frei bleibt, schneidet die Leinwand ab.
        const trimmed = createCanvas(W, used);
        trimmed.getContext("2d").drawImage(canvas, 0, 0);

        return { name: "rl-nexus-nachricht.png", data: trimmed.toBuffer("image/png"), alt: altOf(content, input.sender, input.at) };
    }
}

/** Components V2 wie die Lösch-DM: oben das Bild, darunter bei Knöpfen eine Zeile mit Link-Knöpfen. */
export function messagePayload(image: { readonly name: string; readonly alt: string }, buttons: readonly IMessageButton[]): { readonly flags: number; readonly components: readonly unknown[] } {
    const components: unknown[] = [{ type: 12, items: [{ media: { url: `attachment://${image.name}` }, description: image.alt.slice(0, 1024) }] }];

    if (buttons.length > 0) components.push({ type: 1, components: buttons.map((button) => ({ type: 2, style: 5, label: button.label, url: button.url })) });

    return { flags: 1 << 15, components };
}

/**
 * Eine Nachricht an eine Person: Name und Bild aus Discord (sonst der
 * gespeicherte Name, sonst „du“), Platzhalter einsetzen, zeichnen, schicken.
 * null: angekommen, sonst Grund und Art. Wirft nie.
 */
export async function sendMessageDm(config: IConfig, userId: string, content: IMessageContent, sender: string, at = new Date(), stored: string | null = null): Promise<ISendFailure | null> {
    try {
        const person = await personBase(config, userId, stored);
        const filled = fillContent(content, { name: person.name, date: at });
        const image = await renderMessageDm(filled, { person, at, sender });
        const sent = await postDirectMessage(config, userId, messagePayload(image, filled.buttons), [{ name: image.name, data: image.data, type: "image/png" }]);

        if (!("error" in sent)) return null;

        return { reason: ((sent.code !== null ? REASONS[sent.code] : undefined) ?? sent.error).slice(0, 200), kind: failureKind(sent.status, sent.code) };
    } catch (error) {
        return { reason: (error instanceof Error ? error.message : String(error)).slice(0, 200), kind: "trouble" };
    }
}

/** Die Vorschau: genau das Bild, das ankommt, mit Name und Bild der ansehenden Person. Im Verlauf mit Datum und Absender von damals. */
export async function previewMessage(config: IConfig, viewer: { readonly id: string; readonly name: string }, content: IMessageContent, at = new Date(), sender = viewer.name): Promise<Buffer> {
    const person = await personBase(config, viewer.id, viewer.name);
    const image = await renderMessageDm(fillContent(content, { name: person.name, date: at }), { person, at, sender });

    return image.data;
}
