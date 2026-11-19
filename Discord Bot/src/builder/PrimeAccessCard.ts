import { SKRSContext2D, createCanvas } from "@napi-rs/canvas";
import { RegisterFonts } from "./RankCard";

/**
 * W-0145, Entwurf D: das Bild der DM an die Developer, wenn der Prime-Zugang
 * bald abläuft (gelb), Prime den Schlüssel ablehnt (rot) oder er wieder geht
 * (grün). Stil wie die Lösch-DM I1 und die Statusmeldung: dunkel, Streifen
 * oben, Titel in Oxanium, Labels in Rajdhani-Versalien, gezeichnete Zeichen
 * statt Emojis. Der Schlüssel selbst steht nie darauf.
 *
 * Uhrzeiten in Berliner Zeit. Was live zählen soll, steht als Discord-Zeitstempel
 * in der Zeile unter dem Bild (services/PrimeAccessService.ts).
 */

export type PrimeAccessState = "soon" | "locked" | "back";

export interface IPrimeAccessCard {
    state: PrimeAccessState;
    /** Jetzt - für „seit 20 Stunden“, „heute“ und die Stunden-Leiste. */
    now: number;
    /** Das Rocket-League-Konto hinter dem Zugang. */
    account: string;
    /** Gelb: der Ablauf. Rot: die erste Ablehnung. Grün: der Beginn der Sperre. */
    at: number;
    /** Grün: das Ende der Sperre, die erste erfolgreiche Abfrage danach. */
    until?: number;
    /** Gelb: 1 = Warnung 7 Tage vorher, 2 = 1 Tag vorher. */
    stage?: 1 | 2;
    /** Was Prime sagt, etwa „401 · The Prime API token is not valid.“ */
    answer: string;
    /** Die letzte erfolgreiche Abfrage, null wenn unbekannt (etwa nach einem Neustart). */
    lastOk: number | null;
    /** Die letzten 24 Stunden, älteste zuerst, die letzte ist die laufende. null: keine Abfrage. */
    hours: ("ok" | "down" | null)[];
    /** Grün: so viele Anfragen hat Prime während der Sperre abgelehnt. */
    refused: number;
}

export const PRIME_ACCESS_URL = "https://prime.rocketplanet.gg/access";

const SCALE = 2;
const W = 720;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const C = { bg: "#2b2d31", tile: "#232428", line: "#3a3c42", text: "#f2f3f5", soft: "#dbdee1", dim: "#b5bac1", ok: "#23a55a", down: "#f23f43" };

const LOOK: Readonly<Record<PrimeAccessState, { color: string; icon: "clock" | "lock" | "check"; title: string; sub: string; label: string; word: string }>> = {
    soon: { color: "#f0b232", icon: "clock", title: "Prime-Zugang läuft bald ab", sub: "Danach liefert /rank keine Ränge mehr", label: "Läuft ab in", word: "Bald" },
    locked: { color: "#f23f43", icon: "lock", title: "Prime-Zugang abgelaufen", sub: "Prime lehnt den Schlüssel ab, /rank liefert keine Ränge", label: "Abgelehnt seit", word: "Gesperrt" },
    back: { color: "#23a55a", icon: "check", title: "Prime-Zugang wieder da", sub: "Ränge kommen wieder an, alles läuft", label: "Gesperrt war es", word: "Läuft" },
};

/** Was an Prime hängt - eine Reihe Punkte in der Farbe des Zustands. */
export const PRIME_AFFECTED = ["/rank search, /rank me", "Rang-Rollen", "RL Team-Übersicht", "Epic-Login (Name)"];

const STEP_TAIL = ["Neuen Schlüssel als PRIME_API_TOKEN in die .env", "Bot-Container neu erstellen"];

/* --- Werte in Worten, für Bild und Alt-Text ------------------------------ */

function berlin(at: number, options: Intl.DateTimeFormatOptions): string {
    return new Intl.DateTimeFormat("de-DE", { ...options, timeZone: "Europe/Berlin" }).format(new Date(at));
}

const clock = (at: number): string => berlin(at, { hour: "2-digit", minute: "2-digit" });
const date = (at: number): string => berlin(at, { day: "2-digit", month: "2-digit", year: "numeric" });
/** „18.11.“ - der Punkt kommt schon vom Format. */
const short = (at: number): string => berlin(at, { day: "2-digit", month: "2-digit" });

function plural(count: number, one: string, many: string): string {
    return `${count} ${count === 1 ? one : many}`;
}

/** „seit 20 Stunden“, „seit 5 Minuten“, „seit 2 Tagen“. */
function since(ms: number): string {
    if (ms >= 2 * DAY) return `seit ${Math.floor(ms / DAY)} Tagen`;
    if (ms >= HOUR) return `seit ${plural(Math.floor(ms / HOUR), "Stunde", "Stunden")}`;

    return `seit ${plural(Math.max(1, Math.floor(ms / 60_000)), "Minute", "Minuten")}`;
}

/** „20 Std. 48 Min.“, „2 Tage 3 Std.“, „35 Min.“ */
function duration(ms: number): string {
    const minutes = Math.max(1, Math.round(ms / 60_000));
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);

    if (days > 0) return `${plural(days, "Tag", "Tage")}${hours ? ` ${hours} Std.` : ""}`;
    if (hours > 0) return `${hours} Std. ${minutes % 60} Min.`;

    return `${minutes} Min.`;
}

/** „in 7 Tagen“ ohne das „in“: 7 Tagen, 1 Tag, 23 Stunden. */
function left(ms: number): string {
    if (ms >= 2 * DAY) return `${Math.ceil(ms / DAY - 1e-9)} Tagen`;
    if (ms >= DAY) return "1 Tag";

    return plural(Math.max(1, Math.ceil(ms / HOUR)), "Stunde", "Stunden");
}

/** „heute 19:52 Uhr“, „gestern 22:57 Uhr“, „18.11. · 22:57 Uhr“. */
function when(at: number | null, now: number): string {
    if (at === null) return "unbekannt";
    if (date(at) === date(now)) return `heute ${clock(at)} Uhr`;
    if (date(at) === date(now - DAY)) return `gestern ${clock(at)} Uhr`;

    return `${short(at)} · ${clock(at)} Uhr`;
}

function figureOf(card: IPrimeAccessCard): { big: string; sub: string } {
    if (card.state === "soon") return { big: left(card.at - card.now), sub: `am ${date(card.at)} um ${clock(card.at)} Uhr` };
    if (card.state === "locked") return { big: `${clock(card.at)} Uhr`, sub: `${date(card.at)} · ${since(card.now - card.at)}` };

    const until = card.until ?? card.now;

    return { big: duration(until - card.at), sub: `${short(card.at)} ${clock(card.at)} bis ${short(until)} ${clock(until)} Uhr` };
}

function stepsOf(card: IPrimeAccessCard): string[] {
    if (card.state === "back") return [];

    return [`Zugang auf prime.rocketplanet.gg ${card.state === "soon" ? "verlängern" : "erneuern"}`, ...STEP_TAIL];
}

function confirmOf(card: IPrimeAccessCard): string {
    return `Ränge kommen wieder an. In der Zeit hat Prime ${plural(card.refused, "Anfrage", "Anfragen")} abgelehnt.`;
}

function tilesOf(card: IPrimeAccessCard): [string, string][] {
    return [
        ["Konto", card.account],
        ["Prime sagt", card.answer],
        ["Zuletzt erfolgreich", when(card.lastOk, card.now)],
    ];
}

/** Die Stunden-Leiste: links die erste Stunde, rechts „jetzt“. */
function stripLeft(card: IPrimeAccessCard): string {
    const first = Math.floor((card.now - (card.hours.length - 1) * HOUR) / HOUR) * HOUR;

    return `${clock(first)} ${date(first) === date(card.now) ? "heute" : "gestern"}`;
}

function stations(card: IPrimeAccessCard): { names: string[]; at: number; alt: string } {
    if (card.state === "back") return { names: ["Abgelaufen", "Neuer Schlüssel", "Wieder da"], at: 2, alt: "Abgelaufen, neuer Schlüssel, wieder da: alles erledigt" };
    if (card.state === "locked") return { names: ["7 Tage vorher", "1 Tag vorher", "Abgelaufen"], at: 2, alt: "7 Tage vorher, 1 Tag vorher, abgelaufen: alle Stationen erreicht" };

    return card.stage === 2
        ? { names: ["7 Tage vorher", "1 Tag vorher", "Abgelaufen"], at: 1, alt: "Zweite Warnung 1 Tag vorher, danach läuft der Zugang ab" }
        : { names: ["7 Tage vorher", "1 Tag vorher", "Abgelaufen"], at: 0, alt: "Erste Warnung 7 Tage vorher, die zweite kommt 1 Tag vorher" };
}

/** Alt-Text: alles, was auf dem Bild steht. */
export function PrimeAccessAlt(card: IPrimeAccessCard): string {
    const look = LOOK[card.state];
    const figure = figureOf(card);
    const tiles = tilesOf(card)
        .map(([label, value]) => `${label}: ${value}`)
        .join(". ");
    const count = (kind: "ok" | "down") => card.hours.filter((hour) => hour === kind).length;
    const strip =
        card.state === "soon" ? "" : ` Letzte 24 Stunden ab ${stripLeft(card)}: ${count("ok")} Stunden in Ordnung, ${count("down")} Stunden gesperrt${card.hours.at(-1) === "ok" && count("down") > 0 ? ", jetzt wieder in Ordnung" : ""}.`;
    const steps = stepsOf(card);
    const box = steps.length
        ? ` ${card.state === "soon" ? "Rechtzeitig verlängern" : "So geht es wieder"}: ${steps.map((step, index) => `${index + 1}. ${step}`).join(" ")}.`
        : ` Alles wieder in Ordnung: ${confirmOf(card)}`;

    return `${look.title}. ${look.sub}. ${look.label} ${figure.big}, ${figure.sub}. ${stations(card).alt}. Betroffen: ${PRIME_AFFECTED.join(", ")}.${strip} ${tiles}.${box}`;
}

/* --- Zeichnen ------------------------------------------------------------ */

function alpha(color: string, amount: number): string {
    return `${color}${Math.round(amount * 255)
        .toString(16)
        .padStart(2, "0")}`;
}

function caps(ctx: SKRSContext2D, text: string, x: number, y: number, spacing: number, align: CanvasTextAlign = "left"): void {
    ctx.save();
    ctx.letterSpacing = `${spacing}px`;
    ctx.textAlign = align;
    ctx.fillText(text.toUpperCase(), x, y);
    ctx.restore();
}

/** Bricht nach Wörtern um. Was nicht mehr passt, endet mit „…“ statt still zu fehlen. */
function wrap(ctx: SKRSContext2D, text: string, width: number, limit: number): string[] {
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
    if (lines.length <= limit) return lines;

    const kept = lines.slice(0, limit);
    let last = `${kept[limit - 1]} ${lines[limit]}`;

    while (last.length > 1 && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1);
    kept[limit - 1] = `${last.trimEnd()}…`;

    return kept;
}

function glyph(ctx: SKRSContext2D, kind: "clock" | "lock" | "check", cx: number, cy: number, size: number, color: string): void {
    const s = size / 2;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(2.5, size / 9);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();

    if (kind === "clock") {
        ctx.arc(cx, cy, s * 0.62, 0, Math.PI * 2);
        ctx.moveTo(cx, cy - s * 0.36);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx + s * 0.26, cy + s * 0.18);
        ctx.stroke();
    } else if (kind === "lock") {
        ctx.roundRect(cx - s * 0.52, cy - s * 0.08, s * 1.04, s * 0.72, s * 0.12);
        ctx.moveTo(cx - s * 0.32, cy - s * 0.08);
        ctx.lineTo(cx - s * 0.32, cy - s * 0.3);
        ctx.arc(cx, cy - s * 0.3, s * 0.32, Math.PI, 0);
        ctx.lineTo(cx + s * 0.32, cy - s * 0.08);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy + s * 0.22, s * 0.09, 0, Math.PI * 2);
        ctx.fill();
    } else {
        ctx.moveTo(cx - s * 0.42, cy + s * 0.02);
        ctx.lineTo(cx - s * 0.12, cy + s * 0.32);
        ctx.lineTo(cx + s * 0.44, cy - s * 0.3);
        ctx.stroke();
    }

    ctx.restore();
}

function tile(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, label: string, value: string): void {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fillStyle = C.tile;
    ctx.fill();
    ctx.font = "700 12px Rajdhani";
    ctx.fillStyle = C.dim;
    caps(ctx, label, x + 14, y + 22, 1.4);
    ctx.font = "700 19px Rajdhani";
    ctx.fillStyle = C.text;
    wrap(ctx, value, w - 28, 2).forEach((line, index) => ctx.fillText(line, x + 14, y + 46 + index * 20));
}

function drawHead(ctx: SKRSContext2D, card: IPrimeAccessCard): void {
    const look = LOOK[card.state];

    ctx.beginPath();
    ctx.arc(50, 60, 26, 0, Math.PI * 2);
    ctx.fillStyle = alpha(look.color, 0.16);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = look.color;
    ctx.stroke();
    glyph(ctx, look.icon, 50, 60, 39, look.color);

    ctx.font = "800 25px Oxanium";
    ctx.fillStyle = C.text;
    ctx.fillText(look.title, 92, 58);
    ctx.font = "600 18px Rajdhani";
    ctx.fillStyle = C.dim;
    ctx.fillText(look.sub, 92, 82);

    // Der Zustand als Stempel rechts oben.
    ctx.font = "700 14px Rajdhani";
    const word = look.word.toUpperCase();
    const w = ctx.measureText(word).width + 22;

    ctx.beginPath();
    ctx.roundRect(W - 24 - w, 26, w, 26, 6);
    ctx.fillStyle = alpha(look.color, 0.14);
    ctx.fill();
    ctx.strokeStyle = alpha(look.color, 0.6);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = look.color;
    caps(ctx, word, W - 24 - w / 2, 44, 1.4, "center");
}

function drawFigure(ctx: SKRSContext2D, card: IPrimeAccessCard): void {
    const look = LOOK[card.state];
    const figure = figureOf(card);

    ctx.font = "700 13px Rajdhani";
    ctx.fillStyle = C.dim;
    caps(ctx, look.label, 24, 128, 1.8);
    ctx.font = "800 46px Oxanium";
    ctx.fillStyle = look.color;
    ctx.fillText(figure.big, 24, 178);
    ctx.font = "600 18px Rajdhani";
    ctx.fillStyle = C.dim;
    ctx.fillText(figure.sub, 24, 204);
}

/** Drei Stationen rechts neben der Zahl: wann der Bot schreibt. */
function drawStations(ctx: SKRSContext2D, card: IPrimeAccessCard): void {
    const color = LOOK[card.state].color;
    const { names, at } = stations(card);
    const x = 404;
    const y = 160;
    const width = 290;
    const step = width / (names.length - 1);

    ctx.lineWidth = 4;
    ctx.strokeStyle = C.line;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + width, y);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + step * at, y);
    ctx.stroke();

    names.forEach((name, index) => {
        const cx = x + step * index;

        ctx.beginPath();
        ctx.arc(cx, y, index === at ? 9 : 7, 0, Math.PI * 2);
        ctx.fillStyle = index <= at ? color : C.bg;
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = index <= at ? color : C.line;
        ctx.stroke();
        ctx.font = "700 12px Rajdhani";
        ctx.fillStyle = index === at ? C.text : C.dim;
        caps(ctx, name, cx, y + 28, 1.2, index === 0 ? "left" : index === names.length - 1 ? "right" : "center");
    });
}

interface ILayout {
    rows: number;
    tw: number;
    affected: number;
    strip: number;
    tiles: number;
    box: number;
    height: number;
}

const TOP = 230;

/** Höhen vorab messen: die Karte wird genau so hoch, wie sie sein muss. */
function layoutOf(card: IPrimeAccessCard): ILayout {
    const ctx = createCanvas(W, 10).getContext("2d");

    ctx.font = "600 18px Rajdhani";
    const row = PRIME_AFFECTED.reduce((sum, name) => sum + 26 + ctx.measureText(name).width + 22, -22);
    const rows = row <= W - 48 - 28 ? 1 : 2;

    ctx.font = "700 19px Rajdhani";
    const tw = (W - 48 - 24) / 3;
    const lines = Math.max(...tilesOf(card).map(([, value]) => wrap(ctx, value, tw - 28, 2).length));

    const affected = 30 + rows * 28 + 8;
    const strip = card.state === "soon" ? 0 : 68;
    const tiles = 44 + lines * 20;
    const box = card.state === "back" ? 66 : 98;
    const height = TOP + affected + 14 + (strip ? strip + 14 : 0) + tiles + 14 + box + 24;

    return { rows, tw, affected, strip, tiles, box, height };
}

/** Zeichnet die Karte, doppelt aufgelöst (1440 px breit). */
export async function RenderPrimeAccessCard(card: IPrimeAccessCard): Promise<Buffer> {
    await RegisterFonts();

    const look = LOOK[card.state];
    const layout = layoutOf(card);
    const canvas = createCanvas(W * SCALE, layout.height * SCALE);
    const ctx = canvas.getContext("2d");

    ctx.scale(SCALE, SCALE);
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, layout.height);
    ctx.fillStyle = look.color;
    ctx.fillRect(0, 0, W, 6);
    ctx.textBaseline = "alphabetic";

    drawHead(ctx, card);
    drawFigure(ctx, card);
    drawStations(ctx, card);

    // Was davon abhängt, je ein Punkt in der Farbe des Zustands.
    let y = TOP;

    ctx.beginPath();
    ctx.roundRect(24, y, W - 48, layout.affected, 8);
    ctx.fillStyle = C.tile;
    ctx.fill();
    ctx.font = "700 12px Rajdhani";
    ctx.fillStyle = C.dim;
    caps(ctx, "Betroffen", 38, y + 22, 1.4);
    ctx.font = "600 18px Rajdhani";

    const column = (W - 48 - 28) / 2;
    let x = 38;

    PRIME_AFFECTED.forEach((name, index) => {
        if (layout.rows === 2) x = 38 + (index % 2) * column;

        const base = y + 50 + (layout.rows === 2 ? Math.floor(index / 2) : 0) * 28;

        ctx.beginPath();
        ctx.arc(x + 8, base - 6, 7, 0, Math.PI * 2);
        ctx.fillStyle = look.color;
        ctx.fill();
        ctx.fillStyle = C.text;
        ctx.fillText(name, x + 24, base);

        if (layout.rows === 1) x += 26 + ctx.measureText(name).width + 22;
    });
    y += layout.affected + 14;

    // Die letzten 24 Stunden als Kästchen: rot gesperrt, grün geht, grau keine Abfrage.
    if (layout.strip) {
        ctx.font = "700 12px Rajdhani";
        ctx.fillStyle = C.dim;
        caps(ctx, "Letzte 24 Stunden", 24, y + 12, 1.4);

        const count = Math.max(1, card.hours.length);
        const gap = 4;
        const cell = (W - 48 - gap * (count - 1)) / count;

        card.hours.forEach((hour, index) => {
            ctx.beginPath();
            ctx.roundRect(24 + index * (cell + gap), y + 22, cell, 20, 4);
            ctx.fillStyle = hour === "ok" ? C.ok : hour === "down" ? C.down : C.line;
            ctx.fill();
        });

        ctx.font = "600 16px Rajdhani";
        ctx.fillStyle = C.dim;
        ctx.fillText(stripLeft(card), 24, y + 62);
        ctx.textAlign = "right";
        ctx.fillText("jetzt", W - 24, y + 62);
        ctx.textAlign = "left";
        y += layout.strip + 14;
    }

    tilesOf(card).forEach(([label, value], index) => tile(ctx, 24 + index * (layout.tw + 12), y, layout.tw, layout.tiles, label, value));
    y += layout.tiles + 14;

    // Unten: die drei Schritte oder, wenn es wieder geht, eine kurze Bestätigung.
    ctx.beginPath();
    ctx.roundRect(24, y, W - 48, layout.box, 8);
    ctx.fillStyle = alpha(look.color, 0.08);
    ctx.fill();
    ctx.strokeStyle = alpha(look.color, 0.35);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.font = "700 12px Rajdhani";
    ctx.fillStyle = look.color;

    const steps = stepsOf(card);

    if (steps.length) {
        caps(ctx, card.state === "soon" ? "Rechtzeitig verlängern" : "So geht es wieder", 40, y + 22, 1.6);

        const sw = (W - 48 - 32) / 3;

        steps.forEach((step, index) => {
            const sx = 40 + index * sw;

            ctx.beginPath();
            ctx.arc(sx + 11, y + 50, 11, 0, Math.PI * 2);
            ctx.fillStyle = look.color;
            ctx.fill();
            ctx.font = "800 13px Oxanium";
            ctx.fillStyle = C.bg;
            ctx.textAlign = "center";
            ctx.fillText(String(index + 1), sx + 11, y + 55);
            ctx.textAlign = "left";
            ctx.font = "600 15px Rajdhani";
            ctx.fillStyle = C.soft;
            wrap(ctx, step, sw - 40, 3).forEach((line, row) => ctx.fillText(line, sx + 30, y + 46 + row * 17));
        });
    } else {
        caps(ctx, "Alles wieder in Ordnung", 40, y + 22, 1.6);
        ctx.font = "600 17px Rajdhani";
        ctx.fillStyle = C.soft;
        ctx.fillText(wrap(ctx, confirmOf(card), W - 48 - 32, 1)[0] ?? "", 40, y + 48);
    }

    return canvas.toBuffer("image/png");
}
