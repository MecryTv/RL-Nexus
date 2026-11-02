import { createCanvas, loadImage, type SKRSContext2D } from "@napi-rs/canvas";
import { audit } from "../audit.ts";
import type { IConfig } from "../config.ts";
import { postDirectMessage, type IDiscordFile } from "../discord.ts";
import { fit, registerFonts } from "../status/image.ts";
import { setDm, type IDeletionRecord } from "./deletions.ts";

/**
 * Die DMs zur Löschung als gezeichnetes Bild (W-0051, Entwurf I1 und J1 bis
 * J3 in w0051-dm-bild.html): dunkles Bild, farbiger Streifen je Zustand,
 * Profilbild, eine große Uhrzeit oder Zahl, Kacheln je Bereich. Uhrzeiten in
 * Berliner Zeit; was live zählen soll, steht als Discord-Zeitstempel darunter.
 * Keine Emojis im Bild: Die Schriften haben keine, Schloss, Pause und Paket
 * sind gezeichnet.
 */

export const DM_KINDS = ["ankuendigung", "kopie", "angehalten", "erledigt", "abgebrochen"] as const;
export type DmKind = (typeof DM_KINDS)[number];

export interface IDmInput {
    readonly name: string;
    /** Profilbild als Bytes, null: Anfangsbuchstabe. */
    readonly avatar: Buffer | null;
    /** Wann das Ereignis war (Ankündigung geschickt, Kopie geholt, angehalten, gelöscht). */
    readonly sentAt: Date;
    readonly dueAt: Date;
    readonly areas: readonly { readonly label: string; readonly rows: number; readonly servers: number }[];
    readonly kept: readonly { readonly label: string; readonly rows: number; readonly note: string }[];
    readonly total: number;
    readonly servers: number;
    /** Größe der Kopie. */
    readonly bytes?: number;
}

const W = 800;
const PAD = 36;
const BG = "#2b2d31";
const TILE = "#232428";
const TEXT = "#f2f3f5";
const DIM = "#a9afb8";
const STRIP: Readonly<Record<DmKind, string>> = { ankuendigung: "#f0b232", kopie: "#23a55a", angehalten: "#80848e", erledigt: "#23a55a", abgebrochen: "#80848e" };

const berlin = (date: Date, options: Intl.DateTimeFormatOptions): string => new Intl.DateTimeFormat("de-DE", { ...options, timeZone: "Europe/Berlin" }).format(date);
const clock = (date: Date): string => berlin(date, { hour: "2-digit", minute: "2-digit" });
const day = (date: Date): string => berlin(date, { day: "numeric", month: "long" });
const number = (value: number): string => value.toLocaleString("de-DE");

/** „45 Minuten“, „3 Stunden“, „2 Tage“. */
function span(ms: number): string {
    const minutes = Math.max(1, Math.round(ms / 60_000));
    if (minutes < 60) return `${minutes} ${minutes === 1 ? "Minute" : "Minuten"}`;

    const hours = Math.round(minutes / 60);
    if (hours < 48) return `${hours} ${hours === 1 ? "Stunde" : "Stunden"}`;

    return `${Math.round(hours / 24)} Tage`;
}

function size(bytes: number): string {
    return bytes < 1_000_000 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1_048_576).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB`;
}

const servers = (count: number): string => `${count} ${count === 1 ? "Server" : "Servern"}`;
const sentence = (text: string): string => text.trim().replace(/[.!]+$/, "");

/* --- Gezeichnete Zeichen ------------------------------------------------- */

function lock(ctx: SKRSContext2D, x: number, y: number, color: string): void {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x + 9, y + 9, 6, Math.PI, 0);
    ctx.stroke();
    ctx.fillRect(x + 1, y + 9, 16, 12);
    ctx.restore();
}

function pause(ctx: SKRSContext2D, x: number, y: number, color: string): void {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 10, 34);
    ctx.fillRect(x + 18, y, 10, 34);
}

function box(ctx: SKRSContext2D, x: number, y: number, color: string): void {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y + 8, 34, 26);
    ctx.beginPath();
    ctx.moveTo(x - 2, y + 8);
    ctx.lineTo(x + 6, y);
    ctx.lineTo(x + 28, y);
    ctx.lineTo(x + 36, y + 8);
    ctx.moveTo(x + 17, y + 8);
    ctx.lineTo(x + 17, y + 20);
    ctx.stroke();
    ctx.restore();
}

function stamp(ctx: SKRSContext2D, text: string, color: string): void {
    ctx.save();
    ctx.translate(W - PAD - 110, 70);
    ctx.rotate((-8 * Math.PI) / 180);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.9;
    ctx.font = "800 26px Oxanium";
    const width = ctx.measureText(text).width + 28;
    ctx.beginPath();
    ctx.roundRect(-width / 2, -24, width, 48, 8);
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillText(text, 0, 9);
    ctx.restore();
}

async function avatar(ctx: SKRSContext2D, input: IDmInput, x: number, y: number, diameter: number): Promise<void> {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + diameter / 2, y + diameter / 2, diameter / 2, 0, Math.PI * 2);
    ctx.clip();

    const image = input.avatar ? await loadImage(input.avatar).catch(() => null) : null;

    if (image) {
        ctx.drawImage(image, x, y, diameter, diameter);
    } else {
        const gradient = ctx.createLinearGradient(x, y, x + diameter, y + diameter);
        gradient.addColorStop(0, "#ff6bd6");
        gradient.addColorStop(1, "#8b2fd1");
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, diameter, diameter);
        ctx.fillStyle = "#ffffff";
        ctx.font = "800 30px Oxanium";
        ctx.textAlign = "center";
        ctx.fillText((input.name.trim()[0] ?? "?").toUpperCase(), x + diameter / 2, y + diameter / 2 + 11);
    }

    ctx.restore();
}

/** Der Name einer Kachel: erst kleiner (15, 13, 12 px), erst dann gekürzt. Stellt die Schrift auf die gefundene Größe. */
export function tileLabel(ctx: SKRSContext2D, label: string, width: number): { readonly size: number; readonly text: string } {
    const text = label.toUpperCase();

    for (const size of [15, 13, 12]) {
        ctx.font = `700 ${size}px Rajdhani`;
        if (ctx.measureText(text).width <= width) return { size, text };
    }

    return { size: 12, text: fit(ctx, text, width) };
}

function label(ctx: SKRSContext2D, text: string, x: number, y: number): void {
    ctx.font = "700 16px Rajdhani";
    ctx.fillStyle = DIM;
    ctx.textAlign = "left";
    ctx.fillText(text.toUpperCase(), x, y);
}

/** Text in Zeilen der Breite width, höchstens max; der Rest endet mit „…“. */
function wrap(ctx: SKRSContext2D, text: string, width: number, max: number): string[] {
    const lines: string[] = [];
    let line = "";

    for (const word of text.split(" ")) {
        const next = line ? `${line} ${word}` : word;

        if (ctx.measureText(next).width <= width || !line) {
            line = next;
            continue;
        }

        lines.push(line);
        line = word;
    }

    if (line) lines.push(line);
    if (lines.length <= max) return lines;

    return [...lines.slice(0, max - 1), fit(ctx, `${lines.slice(max - 1).join(" ")}`, width)];
}

/** Der Block „Bleibt“ bzw. „Geblieben“ mit Schloss: je Bereich eine Zeile, lange Sätze brechen um (höchstens 3 Zeilen). Gibt die neue Höhe zurück. */
function keptRow(ctx: SKRSContext2D, input: IDmInput, word: string, y: number): number {
    if (input.kept.length === 0) return y;

    const LINE = 26;
    const textWidth = W - 2 * PAD - 170;

    ctx.font = "600 20px Rajdhani";
    const blocks = input.kept.map((entry) => wrap(ctx, `${entry.label}: ${sentence(entry.note)}`, textWidth, 3));
    const height = 26 + blocks.reduce((sum, lines) => sum + lines.length * LINE, 0) + (blocks.length - 1) * 8;

    ctx.fillStyle = TILE;
    ctx.beginPath();
    ctx.roundRect(PAD, y, W - 2 * PAD, height, 8);
    ctx.fill();
    lock(ctx, PAD + 16, y + 15, DIM);
    label(ctx, word, PAD + 46, y + 32);
    ctx.font = "600 20px Rajdhani";
    ctx.fillStyle = TEXT;

    let line = y + 33;

    for (const lines of blocks) {
        for (const text of lines) {
            ctx.fillText(text, PAD + 150, line);
            line += LINE;
        }

        line += 8;
    }

    return y + height + 24;
}

/* --- Die fünf Bilder ----------------------------------------------------- */

async function draw(kind: DmKind, height: number, paint: (ctx: SKRSContext2D) => Promise<number>): Promise<Buffer> {
    registerFonts();

    const canvas = createCanvas(W, height);
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, height);
    ctx.fillStyle = STRIP[kind];
    ctx.fillRect(0, 0, W, 6);

    const used = await paint(ctx);

    if (used >= height) return draw(kind, used + 8, paint);

    // Was unten frei bleibt, schneidet die Leinwand ab.
    const trimmed = createCanvas(W, used);
    trimmed.getContext("2d").drawImage(canvas, 0, 0);

    return trimmed.toBuffer("image/png");
}

async function header(ctx: SKRSContext2D, input: IDmInput, title: string, sub: string): Promise<number> {
    await avatar(ctx, input, PAD, 34, 72);
    ctx.textAlign = "left";
    ctx.font = "800 30px Oxanium";
    ctx.fillStyle = TEXT;
    ctx.fillText(fit(ctx, title, W - PAD - 130 - 150), PAD + 92, 70);
    ctx.font = "600 20px Rajdhani";
    ctx.fillStyle = DIM;
    ctx.fillText(fit(ctx, sub, W - PAD - 130), PAD + 92, 100);

    return 132;
}

function announcement(input: IDmInput): (ctx: SKRSContext2D) => Promise<number> {
    return async (ctx) => {
        let y = await header(ctx, input, "Deine Daten werden gelöscht", `Hallo ${input.name}, wie gewünscht löschen wir alles bei RL Nexus.`);

        label(ctx, "Endgültig gelöscht", PAD, y + 18);
        ctx.font = "800 64px Oxanium";
        ctx.fillStyle = TEXT;
        ctx.fillText(`${clock(input.dueAt)} Uhr`, PAD, y + 84);
        ctx.font = "600 20px Rajdhani";
        ctx.fillStyle = DIM;
        ctx.fillText(`${day(input.dueAt)} · ${span(input.dueAt.getTime() - input.sentAt.getTime())} nach dieser Nachricht`, PAD, y + 116);

        // Wie viel der Frist um ist: beim Schicken noch nichts, ein schmaler Anfang zeigt die Leiste.
        ctx.fillStyle = "#1e1f22";
        ctx.beginPath();
        ctx.roundRect(PAD, y + 132, W - 2 * PAD, 10, 5);
        ctx.fill();
        ctx.fillStyle = "#f0b232";
        ctx.beginPath();
        ctx.roundRect(PAD, y + 132, 18, 10, 5);
        ctx.fill();
        y += 170;

        const shown = input.areas.length > 4 ? [...input.areas.slice(0, 3), { label: `${input.areas.length - 3} weitere`, rows: input.areas.slice(3).reduce((sum, area) => sum + area.rows, 0), servers: 0 }] : input.areas;
        const width = (W - 2 * PAD - 3 * 12) / 4;

        shown.forEach((area, index) => {
            const x = PAD + index * (width + 12);

            ctx.fillStyle = TILE;
            ctx.beginPath();
            ctx.roundRect(x, y, width, 108, 8);
            ctx.fill();
            const name = tileLabel(ctx, area.label, width - 24);
            ctx.fillStyle = DIM;
            ctx.fillText(name.text, x + 12, y + 26);
            ctx.font = "800 36px Oxanium";
            ctx.fillStyle = TEXT;
            ctx.fillText(number(area.rows), x + 12, y + 70);
            ctx.font = "600 17px Rajdhani";
            ctx.fillStyle = DIM;
            // In der Kachel steht die Zahl für sich: „3 Server“, nicht „3 Servern“.
            ctx.fillText(area.servers > 0 ? `${area.servers} Server` : "Einträge", x + 12, y + 94);
        });

        return keptRow(ctx, input, "Bleibt", y + (shown.length > 0 ? 132 : 0));
    };
}

function copy(input: IDmInput): (ctx: SKRSContext2D) => Promise<number> {
    return async (ctx) => {
        box(ctx, PAD + 2, 40, TEXT);
        ctx.textAlign = "left";
        ctx.font = "800 30px Oxanium";
        ctx.fillStyle = TEXT;
        ctx.fillText("Deine Kopie", PAD + 56, 70);
        ctx.font = "600 20px Rajdhani";
        ctx.fillStyle = DIM;
        ctx.fillText(`Stand ${clock(input.sentAt)} · ${number(input.total)} Einträge${input.bytes ? ` · ${size(input.bytes)}` : ""}`, PAD, 118);
        ctx.fillStyle = TEXT;
        ctx.fillText(`Gelöscht wird weiter wie geplant um ${clock(input.dueAt)} Uhr.`, PAD, 150);

        return 184;
    };
}

function halted(input: IDmInput): (ctx: SKRSContext2D) => Promise<number> {
    return async (ctx) => {
        label(ctx, `Angehalten um ${clock(input.sentAt)}`, PAD, 50);
        pause(ctx, PAD, 72, TEXT);
        ctx.textAlign = "left";
        ctx.font = "800 34px Oxanium";
        ctx.fillStyle = TEXT;
        ctx.fillText("Nichts wird gelöscht", PAD + 48, 102);
        ctx.font = "600 20px Rajdhani";
        ctx.fillStyle = DIM;
        ctx.fillText("Wir schauen uns das an, das Team meldet sich bei dir.", PAD, 146);

        return 180;
    };
}

function done(input: IDmInput): (ctx: SKRSContext2D) => Promise<number> {
    return async (ctx) => {
        stamp(ctx, "GELÖSCHT", "#23a55a");
        label(ctx, `Erledigt um ${clock(input.sentAt)}`, PAD, 50);
        ctx.textAlign = "left";
        ctx.font = "800 64px Oxanium";
        ctx.fillStyle = TEXT;
        ctx.fillText(number(input.total), PAD, 118);
        ctx.font = "600 20px Rajdhani";
        ctx.fillStyle = DIM;
        ctx.fillText(`Einträge auf ${servers(input.servers)} gelöscht`, PAD, 152);

        return keptRow(ctx, input, "Geblieben", 184);
    };
}

function cancelled(): (ctx: SKRSContext2D) => Promise<number> {
    return async (ctx) => {
        ctx.textAlign = "left";
        ctx.font = "800 30px Oxanium";
        ctx.fillStyle = TEXT;
        ctx.fillText("Löschung abgebrochen", PAD, 72);
        ctx.font = "600 20px Rajdhani";
        ctx.fillStyle = DIM;
        ctx.fillText("Die geplante Löschung ist abgebrochen, deine Daten bleiben.", PAD, 112);

        return 146;
    };
}

/** Alt-Text mit allem, was auf dem Bild steht. */
function altOf(kind: DmKind, input: IDmInput): string {
    const kept = (word: string): string => (input.kept.length > 0 ? ` ${word}: ${input.kept.map((entry) => `${entry.label} – ${sentence(entry.note)}`).join("; ")}.` : "");

    switch (kind) {
        case "ankuendigung":
            return (
                `Deine Daten werden gelöscht. Hallo ${input.name}, wie gewünscht löschen wir alles bei RL Nexus. ` +
                `Endgültig gelöscht um ${clock(input.dueAt)} Uhr am ${day(input.dueAt)}, ${span(input.dueAt.getTime() - input.sentAt.getTime())} nach dieser Nachricht. ` +
                `${input.areas.map((area) => `${area.label} ${number(area.rows)}`).join(", ")}.${kept("Bleibt")}`
            );
        case "kopie":
            return `Deine Kopie. Stand ${clock(input.sentAt)} Uhr, ${number(input.total)} Einträge${input.bytes ? `, ${size(input.bytes)}` : ""}. Gelöscht wird weiter wie geplant um ${clock(input.dueAt)} Uhr.`;
        case "angehalten":
            return `Angehalten um ${clock(input.sentAt)} Uhr. Nichts wird gelöscht. Wir schauen uns das an, das Team meldet sich bei dir.`;
        case "erledigt":
            return `Gelöscht. Erledigt um ${clock(input.sentAt)} Uhr. ${number(input.total)} Einträge auf ${servers(input.servers)} gelöscht.${kept("Geblieben")}`;
        case "abgebrochen":
            return "Löschung abgebrochen. Die geplante Löschung ist abgebrochen, deine Daten bleiben.";
    }
}

export async function renderDeletionImage(kind: DmKind, input: IDmInput): Promise<{ readonly name: string; readonly data: Buffer; readonly alt: string }> {
    const paint = { ankuendigung: announcement(input), kopie: copy(input), angehalten: halted(input), erledigt: done(input), abgebrochen: cancelled() }[kind];

    return { name: `rl-nexus-${kind}.png`, data: await draw(kind, 640, paint), alt: altOf(kind, input) };
}

/**
 * Die Nachricht dazu (Components V2 wie die Statusmeldung): oben das Bild,
 * bei der Ankündigung darunter die live zählende Zeile und die Knöpfe, bei
 * der Kopie die Datei.
 */
export function deletionMessage(kind: DmKind, deletionId: number, image: { readonly name: string; readonly alt: string }, dueAt: Date, fileNames: readonly string[] = []): { readonly flags: number; readonly components: readonly unknown[] } {
    const parts: unknown[] = [{ type: 12, items: [{ media: { url: `attachment://${image.name}` }, description: image.alt.slice(0, 1024) }] }];

    if (kind === "ankuendigung") {
        parts.push(
            { type: 10, content: `⏳ Gelöscht <t:${Math.floor(dueAt.getTime() / 1000)}:R> · vorher kannst du dir eine Kopie holen.` },
            {
                type: 1,
                components: [
                    { type: 2, style: 3, label: "Kopie meiner Daten", emoji: { name: "📦" }, custom_id: `ud:copy:${deletionId}` },
                    { type: 2, style: 2, label: "Das war ich nicht", custom_id: `ud:stop:${deletionId}` },
                ],
            }
        );
    }

    for (const name of fileNames) parts.push({ type: 13, file: { url: `attachment://${name}` } });

    return { flags: 1 << 15, components: parts };
}

/**
 * Eine DM zur Löschung schicken. Bei der Ankündigung merkt sich die Löschung,
 * ob sie ankam und wo sie liegt; kommt sie nicht an, steht das im Protokoll.
 * Die Löschung läuft in jedem Fall weiter.
 */
export async function sendDeletionDm(config: IConfig, record: IDeletionRecord, kind: DmKind, input: IDmInput, files: readonly IDiscordFile[] = []): Promise<boolean> {
    const image = await renderDeletionImage(kind, input);
    const message = deletionMessage(kind, record.id, image, input.dueAt, files.map((file) => file.name));
    const sent = await postDirectMessage(config, record.userId, message, [{ name: image.name, data: image.data, type: "image/png" }, ...files]);

    if (kind === "ankuendigung") {
        if ("error" in sent) {
            await setDm(record.id, "nicht_zustellbar", null, sent.error.slice(0, 200));
            await audit({ id: "0", name: "Löschung" }, "userdata.dm", record.userId, sent.error);
        } else {
            await setDm(record.id, "zugestellt", sent);
        }
    }

    return !("error" in sent);
}
