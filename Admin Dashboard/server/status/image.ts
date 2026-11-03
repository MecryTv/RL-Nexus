import path from "node:path";
import { GlobalFonts, createCanvas, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { STATUS_SERVICE_LABELS, databaseLabel, type BlockState, type CheckState, type PointState, type StatusService } from "../../shared/status.ts";
import { maintenanceRunning, type IServiceSnapshot, type IStatusSnapshot } from "./snapshot.ts";

/**
 * Die Statusmeldung in Discord als Bilder (W-0052, Entwurf Runde 2): ein
 * Kopfbild mit dem Gesamtzustand und eine Karte je Dienst, gezeichnet im Stil
 * der Bot-Bilder (Rangkarten, Lösch-DM I1). Uhrzeiten in Berliner Zeit; was
 * live zählen soll, steht als Discord-Zeitstempel im Text darunter.
 *
 * Keine Emojis im Bild: Die Schriften haben keine. Jeder Dienst bekommt ein
 * gezeichnetes Zeichen.
 */

const ASSETS = path.join(import.meta.dirname, "..", "assets");

/** Reihenfolge wie in der Meldung und auf der Statusseite. */
const SERVICES: readonly StatusService[] = ["bot", "dashboard", "website", "database"];
const FILE: Readonly<Record<StatusService, string>> = { bot: "status-bot.png", dashboard: "status-dashboard.png", website: "status-webseite.png", database: "status-datenbank.png" };

/** Die Dateinamen der Anhänge, Kopfbild zuerst. `payload()` und der Upload nehmen dieselbe Reihenfolge. */
export const STATUS_IMAGES: readonly string[] = ["status-kopf.png", ...SERVICES.map((id) => FILE[id])];

export function imageName(service: StatusService): string {
    return FILE[service];
}

const COLOR = { ok: "#22c55e", warn: "#f0b232", down: "#ff1e2d", plan: "#00afff", gap: "#3a3c42" } as const;
const BG_HEAD = "#1e1f22";
const BG_CARD = "#232428";
const TEXT = "#f2f3f5";
const DIM = "#b5bac1";
const BRAND = "#ff1e2d";

const HEADS: Readonly<Record<CheckState, string>> = { ok: "Alles läuft", warn: "Eingeschränkt", down: "Es gibt ein Problem" };

let fonts = false;

export function registerFonts(): void {
    if (fonts) return;

    for (const [file, family] of [
        ["Oxanium-Bold.ttf", "Oxanium"],
        ["Oxanium-ExtraBold.ttf", "Oxanium"],
        ["Rajdhani-Bold.ttf", "Rajdhani"],
        ["Rajdhani-SemiBold.ttf", "Rajdhani"],
    ] as const) {
        GlobalFonts.registerFromPath(path.join(ASSETS, "fonts", file), family);
    }

    fonts = true;
}

let logo: Promise<Image> | null = null;

/* --- Werte in Worten, für Bild und Alt-Text ------------------------------ */

/** Abgerundet wie auf der Statusseite: Nach einem Ausfall steht nie 100 %. */
const percent = (value: number | null): string => (value === null ? "–" : `${(Math.floor(value * 10) / 10).toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`);
const berlin = (date: Date, options: Intl.DateTimeFormatOptions): string => new Intl.DateTimeFormat("de-DE", { ...options, timeZone: "Europe/Berlin" }).format(date);

function serviceOf(snapshot: IStatusSnapshot, id: StatusService): IServiceSnapshot {
    const service = snapshot.services.find((entry) => entry.id === id);
    if (!service) throw new Error(`Dienst ${id} fehlt im Stand.`);

    return service;
}

/** Wartung schlägt den gemessenen Zustand: Wer pausiert, soll nicht rot aussehen. */
function stateOf(snapshot: IStatusSnapshot, service: IServiceSnapshot): { readonly word: string; readonly color: string } {
    const now = snapshot.measured.at.getTime();
    const paused = service.id === "dashboard" ? snapshot.measured.maintenance.dashboard : service.id === "website" ? snapshot.measured.maintenance.website : null;
    const planned = snapshot.maintenance.some((incident) => maintenanceRunning(incident, now) && incident.services.includes(service.id));

    if (paused !== null || planned) return { word: "Wartung", color: COLOR.plan };

    return { ok: { word: "Läuft", color: COLOR.ok }, warn: { word: "Eingeschränkt", color: COLOR.warn }, down: { word: "Ausfall", color: COLOR.down } }[service.state];
}

/** Die große Zahl der Karte: Antwortzeit, bei einem laufenden Ausfall wie lange schon. */
function metricOf(snapshot: IStatusSnapshot, service: IServiceSnapshot): { readonly value: string; readonly unit: string } {
    if (service.state === "down" && service.lastOutage && service.lastOutage.end === null) {
        const minutes = Math.max(1, Math.round((snapshot.measured.at.getTime() - Date.parse(service.lastOutage.start)) / 60_000));

        return { value: minutes.toLocaleString("de-DE"), unit: "Min. weg" };
    }

    if (service.latencyNow === null) return { value: "–", unit: "" };

    return { value: service.latencyNow.toLocaleString("de-DE"), unit: service.id === "bot" ? "ms Ping" : "ms" };
}

/** Eine Zeile, die zum Dienst passt. */
function extraOf(snapshot: IStatusSnapshot, service: IServiceSnapshot): string {
    const { bot, database, website } = snapshot.measured;

    switch (service.id) {
        case "bot":
            return bot ? `${bot.guilds.length.toLocaleString("de-DE")} Server · ${bot.guilds.reduce((sum, guild) => sum + guild.members, 0).toLocaleString("de-DE")} Mitglieder · v${bot.versions.app}` : "Antwortet nicht";
        case "dashboard":
            return service.latency.avg === null ? "Noch keine Messung in 24 h" : `Ø 24 h ${service.latency.avg.toLocaleString("de-DE")} ms`;
        case "website":
            return website.builtAt ? `Gebaut ${berlin(new Date(website.builtAt), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : "Bauzeit unbekannt";
        case "database":
            return database.online ? `${databaseLabel(database.version, database.cache)} · ${Math.max(1, Math.round(database.bytes / 1024 / 1024))} MB` : "Nicht erreichbar";
    }
}

/** Alt-Text des Kopfbilds: alles, was draufsteht. */
export function headAlt(snapshot: IStatusSnapshot): string {
    const up = snapshot.services.filter((service) => service.state !== "down").length;

    return `RL Nexus Status, Stand ${berlin(snapshot.measured.at, { hour: "2-digit", minute: "2-digit" })} Uhr: ${HEADS[snapshot.state]}. ${up} von ${snapshot.services.length} Diensten erreichbar, ${percent(snapshot.uptimeMonth)} verfügbar in 30 Tagen.`;
}

/** Alt-Text einer Karte. */
export function serviceAlt(snapshot: IStatusSnapshot, id: StatusService): string {
    const service = serviceOf(snapshot, id);
    const metric = metricOf(snapshot, service);

    return `${STATUS_SERVICE_LABELS[id]}: ${stateOf(snapshot, service).word}, ${metric.value} ${metric.unit}`.trim() + `. ${percent(service.uptime.day)} in 24 Stunden, ${percent(service.uptime.month)} in 30 Tagen. ${extraOf(snapshot, service)}.`;
}

/* --- Zeichnen ------------------------------------------------------------- */

const STATE_COLOR: Readonly<Record<BlockState | PointState, string>> = { ok: COLOR.ok, warn: COLOR.warn, down: COLOR.down, none: COLOR.gap, gap: COLOR.gap };
const RANK: Readonly<Record<PointState, number>> = { gap: 0, ok: 1, warn: 2, down: 3 };

export function alpha(color: string, amount: number): string {
    return `${color}${Math.round(amount * 255)
        .toString(16)
        .padStart(2, "0")}`;
}

export function fit(ctx: SKRSContext2D, text: string, width: number): string {
    if (ctx.measureText(text).width <= width) return text;

    let cut = text;
    while (cut.length > 1 && ctx.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1);

    return `${cut}…`;
}

/** Ein kleines Zeichen je Dienst statt eines Emojis. */
function icon(ctx: SKRSContext2D, id: StatusService, x: number, y: number, color: string): void {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();

    switch (id) {
        case "bot":
            ctx.roundRect(x, y + 6, 30, 22, 6);
            ctx.moveTo(x + 15, y + 6);
            ctx.lineTo(x + 15, y);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(x + 9, y + 17, 2.5, 0, Math.PI * 2);
            ctx.arc(x + 21, y + 17, 2.5, 0, Math.PI * 2);
            ctx.fill();
            break;
        case "dashboard":
            ctx.roundRect(x, y + 2, 30, 20, 3);
            ctx.moveTo(x + 9, y + 28);
            ctx.lineTo(x + 21, y + 28);
            ctx.moveTo(x + 15, y + 22);
            ctx.lineTo(x + 15, y + 28);
            ctx.stroke();
            break;
        case "website":
            ctx.arc(x + 15, y + 15, 13, 0, Math.PI * 2);
            ctx.moveTo(x + 2, y + 15);
            ctx.lineTo(x + 28, y + 15);
            ctx.ellipse(x + 15, y + 15, 6, 13, 0, 0, Math.PI * 2);
            ctx.stroke();
            break;
        case "database":
            ctx.ellipse(x + 15, y + 6, 13, 5, 0, 0, Math.PI * 2);
            ctx.moveTo(x + 2, y + 6);
            ctx.lineTo(x + 2, y + 24);
            ctx.ellipse(x + 15, y + 24, 13, 5, 0, Math.PI, 0, true);
            ctx.lineTo(x + 28, y + 6);
            ctx.stroke();
            break;
    }

    ctx.restore();
}

/** Das Zeichen im großen Kreis: Haken, sonst Ausrufezeichen. */
function mark(ctx: SKRSContext2D, state: CheckState, cx: number, cy: number, color: string): void {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();

    if (state === "ok") {
        ctx.moveTo(cx - 17, cy + 1);
        ctx.lineTo(cx - 5, cy + 13);
        ctx.lineTo(cx + 18, cy - 12);
        ctx.stroke();
    } else {
        ctx.moveTo(cx, cy - 18);
        ctx.lineTo(cx, cy + 4);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy + 17, 4, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

async function drawHead(snapshot: IStatusSnapshot): Promise<Buffer> {
    const width = 1200;
    const height = 400;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    const accent = COLOR[snapshot.state];
    const at = snapshot.measured.at;

    ctx.fillStyle = BG_HEAD;
    ctx.fillRect(0, 0, width, height);

    const glow = ctx.createRadialGradient(width, 0, 0, width, 0, 700);
    glow.addColorStop(0, alpha(accent, 0.24));
    glow.addColorStop(1, alpha(accent, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, width, 8);

    // Name und Stand.
    logo ??= loadImage(path.join(ASSETS, "status-logo.webp"));
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(40, 34, 50, 50, 12);
    ctx.clip();
    ctx.drawImage(await logo, 40, 34, 50, 50);
    ctx.restore();

    ctx.textBaseline = "alphabetic";
    ctx.font = "800 28px Oxanium";
    ctx.fillStyle = TEXT;
    ctx.fillText("RL NEXUS", 106, 70);
    ctx.fillStyle = BRAND;
    ctx.fillText("STATUS", 106 + ctx.measureText("RL NEXUS ").width, 70);

    ctx.font = "700 22px Rajdhani";
    ctx.fillStyle = DIM;
    ctx.textAlign = "right";
    ctx.fillText(`STAND ${berlin(at, { hour: "2-digit", minute: "2-digit" })} UHR · ${berlin(at, { day: "numeric", month: "short" }).toUpperCase()}`, width - 40, 66);
    ctx.textAlign = "left";

    // Gesamtzustand groß.
    ctx.beginPath();
    ctx.arc(94, 168, 46, 0, Math.PI * 2);
    ctx.fillStyle = alpha(accent, 0.18);
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = accent;
    ctx.stroke();
    mark(ctx, snapshot.state, 94, 166, accent);

    const down = snapshot.services.filter((service) => service.state === "down");
    const up = snapshot.services.length - down.length;

    ctx.font = "800 50px Oxanium";
    ctx.fillStyle = TEXT;
    ctx.fillText(HEADS[snapshot.state], 168, 166);
    ctx.font = "600 28px Rajdhani";
    ctx.fillStyle = DIM;
    ctx.fillText(
        down.length > 0 ? `${down.map((service) => STATUS_SERVICE_LABELS[service.id]).join(", ")} nicht erreichbar · ${up} von ${snapshot.services.length} laufen` : `${up} von ${snapshot.services.length} Diensten erreichbar`,
        170,
        204
    );

    ctx.textAlign = "right";
    ctx.font = "800 56px Oxanium";
    ctx.fillStyle = TEXT;
    ctx.fillText(percent(snapshot.uptimeMonth), width - 40, 170);
    ctx.font = "700 20px Rajdhani";
    ctx.fillStyle = DIM;
    ctx.fillText("VERFÜGBAR IN 30 TAGEN", width - 40, 202);
    ctx.textAlign = "left";

    // Ein Punkt je Dienst.
    let x = 40;
    ctx.font = "600 26px Rajdhani";

    for (const id of SERVICES) {
        const service = serviceOf(snapshot, id);

        ctx.beginPath();
        ctx.arc(x + 9, 256, 9, 0, Math.PI * 2);
        ctx.fillStyle = stateOf(snapshot, service).color;
        ctx.fill();
        ctx.fillStyle = TEXT;
        ctx.fillText(STATUS_SERVICE_LABELS[id], x + 26, 265);
        x += 26 + ctx.measureText(STATUS_SERVICE_LABELS[id]).width + 40;
    }

    // 24 Stunden über alle Dienste: je Stunde der schlechteste Zustand.
    ctx.font = "700 18px Rajdhani";
    ctx.fillStyle = DIM;
    ctx.fillText("LETZTE 24 STUNDEN, ALLE DIENSTE", 40, 306);

    const hours = 24;
    const gap = 4;
    const cell = (width - 80 - gap * (hours - 1)) / hours;

    for (let hour = 0; hour < hours; hour++) {
        let worst: PointState = "gap";

        for (const service of snapshot.services) {
            const point = service.latency.points[hour]?.state ?? "gap";
            if (RANK[point] > RANK[worst]) worst = point;
        }

        ctx.beginPath();
        ctx.roundRect(40 + hour * (cell + gap), 318, cell, 26, 4);
        ctx.fillStyle = STATE_COLOR[worst];
        ctx.fill();
    }

    ctx.font = "600 20px Rajdhani";
    ctx.fillStyle = DIM;
    const hourLabel = (offset: number): string => berlin(new Date(at.getTime() - offset * 3_600_000), { hour: "2-digit", minute: "2-digit" });
    ctx.fillText(`${hourLabel(24)} gestern`, 40, 372);
    ctx.textAlign = "center";
    ctx.fillText(hourLabel(16), 40 + (width - 80) / 3, 372);
    ctx.fillText(hourLabel(8), 40 + ((width - 80) * 2) / 3, 372);
    ctx.textAlign = "right";
    ctx.fillText("jetzt", width - 40, 372);

    return canvas.toBuffer("image/png");
}

function drawService(snapshot: IStatusSnapshot, service: IServiceSnapshot): Buffer {
    const width = 600;
    const height = 340;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    const { word, color } = stateOf(snapshot, service);

    ctx.fillStyle = BG_CARD;
    ctx.beginPath();
    ctx.roundRect(0, 0, width, height, 18);
    ctx.fill();
    ctx.strokeStyle = alpha(color, 0.35);
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, 7);
    ctx.restore();

    // Kopf: Zeichen, Name, Zustand.
    icon(ctx, service.id, 28, 30, color);
    ctx.textBaseline = "alphabetic";
    ctx.font = "800 30px Oxanium";
    ctx.fillStyle = TEXT;
    ctx.fillText(STATUS_SERVICE_LABELS[service.id], 74, 56);

    ctx.font = "700 20px Rajdhani";
    const pill = word.toUpperCase();
    const pillWidth = ctx.measureText(pill).width + 24;
    ctx.beginPath();
    ctx.roundRect(width - 28 - pillWidth, 30, pillWidth, 32, 6);
    ctx.fillStyle = alpha(color, 0.14);
    ctx.fill();
    ctx.strokeStyle = alpha(color, 0.6);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.fillText(pill, width - 28 - pillWidth / 2, 53);
    ctx.textAlign = "left";

    // Große Zahl und Kurve der letzten 24 Stunden.
    const metric = metricOf(snapshot, service);
    ctx.font = "800 64px Oxanium";
    ctx.fillStyle = TEXT;
    ctx.fillText(metric.value, 28, 148);
    const valueWidth = ctx.measureText(metric.value).width;
    ctx.font = "700 24px Rajdhani";
    ctx.fillStyle = DIM;
    ctx.fillText(metric.unit, 28 + valueWidth + 8, 146);

    const values = service.latency.points.map((point) => point.value);
    const known = values.filter((value): value is number => value !== null);

    if (known.length > 1) {
        const top = Math.max(...known);
        const bottom = Math.min(...known);
        const left = 340;
        const right = width - 28;
        const step = (right - left) / Math.max(1, values.length - 1);

        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.lineJoin = "round";
        ctx.beginPath();

        let drawing = false;

        values.forEach((value, index) => {
            if (value === null) {
                drawing = false;
                return;
            }

            const y = 140 - (top === bottom ? 18 : ((value - bottom) / (top - bottom)) * 44);
            const xPoint = left + index * step;

            if (drawing) ctx.lineTo(xPoint, y);
            else ctx.moveTo(xPoint, y);
            drawing = true;
        });

        ctx.stroke();

        // Eine Stunde ohne Nachbarn wäre als Linie unsichtbar: dann ein Punkt.
        ctx.fillStyle = color;
        values.forEach((value, index) => {
            if (value === null || values[index - 1] != null || values[index + 1] != null) return;

            ctx.beginPath();
            ctx.arc(left + index * step, 140 - (top === bottom ? 18 : ((value - bottom) / (top - bottom)) * 44), 3.5, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    // Zwölf Kästchen zu je zwei Stunden.
    const blocks = service.blocks;
    const gap = 6;
    const cell = (width - 56 - gap * (blocks.length - 1)) / blocks.length;

    blocks.forEach((block, index) => {
        ctx.beginPath();
        ctx.roundRect(28 + index * (cell + gap), 178, cell, 18, 4);
        ctx.fillStyle = STATE_COLOR[block];
        ctx.fill();
    });

    // 24 Stunden und 30 Tage nebeneinander.
    const pair = (label: string, value: string, x: number, align: "left" | "right"): void => {
        ctx.textAlign = align;
        ctx.font = "600 24px Rajdhani";
        ctx.fillStyle = DIM;
        const labelWidth = ctx.measureText(`${label}  `).width;
        ctx.font = "700 26px Oxanium";
        const valueWidth = ctx.measureText(value).width;

        if (align === "left") {
            ctx.font = "600 24px Rajdhani";
            ctx.fillStyle = DIM;
            ctx.fillText(label, x, 238);
            ctx.font = "700 26px Oxanium";
            ctx.fillStyle = TEXT;
            ctx.fillText(value, x + labelWidth, 238);
        } else {
            ctx.font = "700 26px Oxanium";
            ctx.fillStyle = TEXT;
            ctx.fillText(value, x, 238);
            ctx.font = "600 24px Rajdhani";
            ctx.fillStyle = DIM;
            ctx.fillText(label, x - valueWidth - 10, 238);
        }
    };

    pair("24 h", percent(service.uptime.day), 28, "left");
    pair("30 T", percent(service.uptime.month), width - 28, "right");
    ctx.textAlign = "left";

    ctx.font = "600 24px Rajdhani";
    ctx.fillStyle = DIM;
    ctx.fillText(fit(ctx, extraOf(snapshot, service), width - 56), 28, 294);

    return canvas.toBuffer("image/png");
}

export interface IStatusImage {
    readonly name: string;
    readonly data: Buffer;
}

/** Je Stand einmal gezeichnet: Meldung und Vorschau nehmen dieselben Bilder. */
const drawn = new WeakMap<IStatusSnapshot, Promise<IStatusImage[]>>();

export function renderStatusImages(snapshot: IStatusSnapshot): Promise<IStatusImage[]> {
    let images = drawn.get(snapshot);

    if (!images) {
        registerFonts();
        images = (async () => [
            { name: STATUS_IMAGES[0], data: await drawHead(snapshot) },
            ...SERVICES.map((id) => ({ name: FILE[id], data: drawService(snapshot, serviceOf(snapshot, id)) })),
        ])();
        drawn.set(snapshot, images);
    }

    return images;
}
