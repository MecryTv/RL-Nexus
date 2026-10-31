import path from "path";
import { Image, SKRSContext2D, createCanvas, loadImage } from "@napi-rs/canvas";
import { RegisterFonts } from "./RankCard";
import { RankIconFile, TierColor } from "../constants/RankCard";
import { DIVISIONS, RankFromMMR, TIER_SHORT } from "../constants/Prime";
import { GALLERY_ROOT } from "../constants/Gallery";
import { COUNTING_ROLES, PLAYING_ROLES, ROLE_LABELS } from "../constants/Teams";
import { ROLE_ICON_FILES, ROLE_ICON_ROOT } from "../services/RankIconService";
import { ICardColumns, ITeamCardDesign, ITeamPlayer, ITeamView, TeamRole } from "../interfaces/services/teams/ITeams";

/**
 * Die gezeichnete Team-Karte (Plan 26): Kopf mit Logo, Platz und Team-MMR,
 * darunter der Kader als Tabelle, Staff und Fuß. Gezeichnet wie Rang- und
 * Welcome-Karte, doppelt so fein, als WebP. Seit Plan 27 bestimmt
 * `design` (ITeamSettings.card) Hintergrund, Farbe, Bausteine und Zeilen.
 *
 * Diese Datei lädt nichts aus dem Netz. Logo, eigener Hintergrund und eigene
 * Abzeichen kommen als fertige Daten (TeamService.CardImages), Rang-Icons,
 * Standard-Abzeichen und der Standard-Hintergrund liegen als Dateien beim Bot.
 * Siehe docs/Teams.md.
 */

/** Was die Karte zum Zeichnen bekommt. null bei einem Abzeichen: das Standard-Abzeichen aus teamicons. */
export interface ITeamCardImages {
    logo: Buffer | null;
    /** Der eigene Hintergrund aus der Galerie: der des Teams (Plan 30) oder der für alle. null: der Standard. */
    background: Buffer | null;
    badges: Record<TeamRole, Buffer | null>;
}

export interface ITeamCardData {
    view: ITeamView;
    columns: ICardColumns;
    /** Nur bei der Karte auf Abruf (Menü, Hub). */
    place: { place: number; of: number } | null;
    guildName: string;
    roleName: string | null;
    /** Eigene Farbe der Karte, sonst die des Teams, sonst die des Moduls. */
    accent: string;
    images: ITeamCardImages;
    design: ITeamCardDesign;
    /** Die drei Zeilen, Platzhalter schon eingesetzt. Leer: die Zeile fehlt. */
    lines: { title: string; subtitle: string; footer: string };
}

export const TEAM_CARD_SCALE = 2;

const BASE_WIDTH = 1000;
const MIN_WIDTH = 760;
const SIDE = 40;
const ROW = 52;
const HEAD_ROW = 30;

const COLORS = { text: "#f2f4f7", soft: "#c9d1dc", dim: "#a8b0bc", gold: "#ffd77a", blue: "#00afff", line: "rgba(255,255,255,0.07)", league: "#a8dfff" };

/** Die Spalten der Tabelle von links nach rechts, mit Breite. Spieler nimmt den Rest. */
const COLUMNS = [
    { id: "role", width: 150 },
    { id: "player", width: 0 },
    { id: "rank", width: 232 },
    { id: "3v3", width: 74 },
    { id: "2v2", width: 74 },
    { id: "1v1", width: 74 },
    { id: "peak", width: 78 },
    { id: "value", width: 92 },
] as const;

type ColumnId = (typeof COLUMNS)[number]["id"];

const HEADERS: Record<ColumnId, string> = { role: "Rolle", player: "Spieler", rank: "Rang Schnitt", "3v3": "3v3", "2v2": "2v2", "1v1": "1v1", peak: "Peak", value: "Schnitt" };

/** Das Motiv von RL Nexus - der Hintergrund, wenn der Server keinen eigenen wählt (Plan 27). */
const DEFAULT_BACKGROUND = path.join(GALLERY_ROOT, "privacy", "RL Card background.webp");

const NUMBER = new Intl.NumberFormat("de-DE");

function Num(value: number | null | undefined): string {
    return typeof value === "number" && value > 0 ? NUMBER.format(Math.round(value)) : "—";
}

function Hidden(columns: ICardColumns): Set<ColumnId> {
    return new Set((["2v2", "1v1", "peak"] as const).filter((id) => !columns[id]));
}

/** Je abgeschalteter Spalte wird die Karte um deren Breite schmaler - Discord zeigt sie trotzdem in voller Breite. */
export function TeamCardWidth(columns: ICardColumns): number {
    const hidden = Hidden(columns);
    const removed = COLUMNS.filter((column) => hidden.has(column.id)).reduce((sum, column) => sum + column.width, 0);

    return Math.max(MIN_WIDTH, BASE_WIDTH - removed);
}

/**
 * Der Rang zu einem Wert, mit Zahlen statt römisch: „GC 3“ und „Div 1“.
 * Gerechnet wie {…rank} (RankFromMMR), SSL hat keine Division.
 */
export function CardRank(mmr: number | null): { tier: number; name: string; division: string | null } | null {
    if (mmr === null || !Number.isFinite(mmr)) return null;

    const { tier, division } = RankFromMMR(mmr);
    const index = division ? DIVISIONS.indexOf(division as (typeof DIVISIONS)[number]) : -1;

    return { tier, name: (TIER_SHORT[tier] ?? "–").replace(/(\d)$/, " $1"), division: index >= 0 ? `Div ${index + 1}` : null };
}

/**
 * Der Peak eines Spielers: der höchste Wert über 1v1, 2v2 und 3v3 - der
 * eingetragene Peak oder, wenn die aktuelle MMR schon darüber liegt, die.
 * Wer in 2v2 höher stand als in 3v3, hat dort seinen Peak.
 */
export function BestPeak(player: ITeamPlayer): number | null {
    const values = (["1v1", "2v2", "3v3"] as const)
        .flatMap((slot) => [player.peaks[slot], player.snapshot?.mmr[slot]])
        .filter((value): value is number => typeof value === "number" && value > 0);

    return values.length ? Math.max(...values) : null;
}

/**
 * Plätze nach Team-MMR: nur Teams mit MMR, gleiche MMR teilt sich den Platz,
 * das nächste zählt weiter ("1, 1, 3"). of ist die Zahl der Teams mit MMR.
 */
export function TeamPlaces(views: ITeamView[]): Map<number, { place: number; of: number }> {
    const ranked = views.filter((view) => typeof view.mmr === "number").sort((a, b) => (b.mmr as number) - (a.mmr as number));
    const places = new Map<number, { place: number; of: number }>();

    ranked.forEach((view, index) => {
        const tied = index > 0 && ranked[index - 1]!.mmr === view.mmr;
        const place = tied ? places.get(ranked[index - 1]!.team.id)!.place : index + 1;

        places.set(view.team.id, { place, of: ranked.length });
    });

    return places;
}

/* ----------------------------------------------------------
   Bilder
   ---------------------------------------------------------- */
const files = new Map<string, Promise<Image | null>>();

function FileImage(file: string): Promise<Image | null> {
    let image = files.get(file);

    if (!image) {
        image = loadImage(file).catch(() => null);
        files.set(file, image);
    }

    return image;
}

function BufferImage(buffer: Buffer | null): Promise<Image | null> {
    return buffer ? loadImage(buffer).catch(() => null) : Promise.resolve(null);
}

const trims = new Map<Image, { x: number; y: number; w: number; h: number }>();

/**
 * Der sichtbare Bereich eines Bildes. Manche Symbole liegen klein auf einer
 * großen leeren Fläche (epicgames.png füllt 16 % der Breite) - gezeichnet wird
 * nur der Ausschnitt, sonst schrumpft das Motiv zum Fleck.
 */
function Trim(image: Image): { x: number; y: number; w: number; h: number } {
    const known = trims.get(image);

    if (known) return known;

    const scale = Math.min(1, 128 / Math.max(image.width, image.height));
    const w = Math.max(1, Math.round(image.width * scale));
    const h = Math.max(1, Math.round(image.height * scale));
    const probe = createCanvas(w, h).getContext("2d");

    probe.drawImage(image, 0, 0, w, h);

    const data = probe.getImageData(0, 0, w, h).data;
    let [left, top, right, bottom] = [w, h, -1, -1];

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (data[(y * w + x) * 4 + 3]! > 16) {
                left = Math.min(left, x);
                right = Math.max(right, x);
                top = Math.min(top, y);
                bottom = Math.max(bottom, y);
            }
        }
    }

    const box = right < 0 ? { x: 0, y: 0, w: image.width, h: image.height } : { x: left / scale, y: top / scale, w: (right - left + 1) / scale, h: (bottom - top + 1) / scale };

    trims.set(image, box);

    return box;
}

/** Das Motiv mittig und seitentreu in ein Quadrat. */
function Icon(ctx: SKRSContext2D, image: Image | null, x: number, y: number, size: number, glow?: string): void {
    if (!image) return;

    const box = Trim(image);
    const scale = size / Math.max(box.w, box.h);
    const w = box.w * scale;
    const h = box.h * scale;

    ctx.save();

    if (glow) {
        ctx.shadowColor = glow;
        ctx.shadowBlur = size * 0.4;
    }

    ctx.drawImage(image, box.x, box.y, box.w, box.h, x + (size - w) / 2, y + (size - h) / 2, w, h);
    ctx.restore();
}

/* ----------------------------------------------------------
   Zeichen-Handgriffe
   ---------------------------------------------------------- */
function Alpha(hex: string, alpha: number): string {
    const value = Number.parseInt(hex.slice(1), 16);

    return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
}

function Bevel(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, cut: number): void {
    ctx.beginPath();
    ctx.moveTo(x + cut, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h - cut);
    ctx.lineTo(x + w - cut, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + cut);
    ctx.closePath();
}

/** Kürzt mit „…“, bis der Text passt. */
function Fit(ctx: SKRSContext2D, text: string, max: number): string {
    if (ctx.measureText(text).width <= max) return text;

    let cut = text;

    while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) cut = cut.slice(0, -1);

    return `${cut}…`;
}

/** Text in Großbuchstaben mit Sperrung, wie die Beschriftungen im Entwurf. */
function Caps(ctx: SKRSContext2D, text: string, x: number, y: number, spacing: number, align: "left" | "right" = "left"): number {
    const upper = text.toUpperCase();
    const width = [...upper].reduce((sum, char) => sum + ctx.measureText(char).width + spacing, -spacing);
    let cursor = align === "right" ? x - width : x;

    ctx.textAlign = "left";

    for (const char of upper) {
        ctx.fillText(char, cursor, y);
        cursor += ctx.measureText(char).width + spacing;
    }

    return width;
}

/** Wie breit Caps() einen Text zeichnet: in Großbuchstaben und gesperrt. */
function CapsWidth(ctx: SKRSContext2D, text: string, spacing: number): number {
    return [...text.toUpperCase()].reduce((sum, char) => sum + ctx.measureText(char).width + spacing, -spacing);
}

/** Kürzt einen Text so, dass er in Großbuchstaben und gesperrt in max passt. */
function FitCaps(ctx: SKRSContext2D, text: string, max: number, spacing: number): string {
    if (CapsWidth(ctx, text, spacing) <= max) return text;

    let cut = text;

    while (cut.length > 1 && CapsWidth(ctx, `${cut}…`, spacing) > max) cut = cut.slice(0, -1);

    return `${cut}…`;
}

/**
 * Bis zu `limit` Zeilen, die letzte endet mit „…“, wenn es nicht passt. Ein
 * Zeilenumbruch aus dem Dashboard beginnt eine neue Zeile (Plan 30), leere
 * Zeilen fallen weg.
 */
export function Lines(ctx: SKRSContext2D, text: string, max: number, limit = 3): string[] {
    const lines: string[] = [];

    for (const paragraph of text.split(/\r?\n/)) {
        let line = "";

        for (const word of paragraph.replace(/\s+/g, " ").trim().split(" ").filter(Boolean)) {
            const next = line ? `${line} ${word}` : word;

            if (!line || ctx.measureText(next).width <= max) {
                line = next;
                continue;
            }

            lines.push(line);
            line = word;
        }

        if (line) lines.push(line);
    }

    if (lines.length <= limit) return lines.map((entry) => Fit(ctx, entry, max));

    return [...lines.slice(0, limit - 1).map((entry) => Fit(ctx, entry, max)), Fit(ctx, lines.slice(limit - 1).join(" "), max)];
}

/** Platz für Name, Beschreibung und Ligen: zwischen Logo und dem MMR-Block rechts - ohne die beiden mehr. */
function HeadWidth(width: number, design: ITeamCardDesign): number {
    return width - 36 - (design.parts.mmr ? 260 : 0) - (SIDE + (design.parts.logo ? 124 + 26 : 0));
}

/** Ein Bild randlos über die ganze Fläche, mittig beschnitten. */
function Cover(ctx: SKRSContext2D, image: Image, width: number, height: number): void {
    const scale = Math.max(width / image.width, height / image.height);
    const w = image.width * scale;
    const h = image.height * scale;

    ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
}

/** Ein Zeitpunkt, wie er auf der Karte steht: „29.10. · 16:10“ (Europe/Berlin). */
export function Stamp(at: number): string {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
            .formatToParts(new Date(at))
            .map((part) => [part.type, part.value])
    );

    return `${parts.day}.${parts.month}. · ${parts.hour}:${parts.minute}`;
}

/* ----------------------------------------------------------
   Die Karte
   ---------------------------------------------------------- */
interface ILayout {
    width: number;
    columns: { id: ColumnId; x: number; width: number }[];
    tableTop: number;
    height: number;
}

function Layout(data: ITeamCardData, tableTop: number): ILayout {
    const width = TeamCardWidth(data.columns);
    const hidden = Hidden(data.columns);
    const shown = COLUMNS.filter((column) => !hidden.has(column.id));
    const fixed = shown.reduce((sum, column) => sum + column.width, 0);
    const player = width - 2 * SIDE - fixed;
    let x = SIDE;

    const columns = shown.map((column) => {
        const entry = { id: column.id, x, width: column.id === "player" ? player : column.width };

        x += entry.width;

        return entry;
    });

    const playing = data.view.players.filter((entry) => PLAYING_ROLES.includes(entry.player.role)).length;
    const staff = data.design.parts.staff && data.view.players.some((entry) => !PLAYING_ROLES.includes(entry.player.role));
    const height = tableTop + HEAD_ROW + Math.max(1, playing) * ROW + (staff ? 62 : 0) + 70;

    return { width, columns, tableTop, height };
}

export async function RenderTeamCard(data: ITeamCardData): Promise<Buffer> {
    await RegisterFonts();

    const { view } = data;
    const accent = /^#[0-9a-f]{6}$/i.test(data.accent) ? data.accent : COLORS.blue;
    const measure = createCanvas(10, 10).getContext("2d");

    // Erst messen, wie hoch der Kopf wird - danach steht fest, wo die Tabelle beginnt.
    const headWidth = HeadWidth(TeamCardWidth(data.columns), data.design);

    measure.font = "600 19px Rajdhani";

    const description = data.lines.subtitle ? Lines(measure, data.lines.subtitle, headWidth) : [];
    const leagues = data.design.parts.leagues ? view.team.links.slice(0, 5) : [];
    const headBottom = 34 + 50 + 34 + (description.length ? 12 + description.length * 24 : 0) + (leagues.length ? 30 : 0);
    const tableTop = Math.max(250, headBottom + 34);
    const layout = Layout(data, tableTop);
    const { width, height } = layout;

    const canvas = createCanvas(width * TEAM_CARD_SCALE, height * TEAM_CARD_SCALE);
    const ctx = canvas.getContext("2d");

    ctx.scale(TEAM_CARD_SCALE, TEAM_CARD_SCALE);
    ctx.textBaseline = "alphabetic";

    // Grund: dunkel, darauf das Motiv (Standard oder eigenes, abgedunkelt), Schein in der Kartenfarbe oben rechts,
    // ein Hauch Rot unten links, feine Zeilen. Fehlt das eigene Bild, steht der Standard da.
    ctx.fillStyle = "#070b10";
    ctx.fillRect(0, 0, width, height);

    // images.background ist schon das richtige Bild: das des Teams (Plan 30) oder das eigene für alle.
    // Fehlt es, steht der Standard da - außer der Server will gar keinen.
    const { mode } = data.design.background;
    const backdrop = (await BufferImage(data.images.background ?? null)) ?? (mode === "none" ? null : await FileImage(DEFAULT_BACKGROUND));

    if (backdrop) {
        Cover(ctx, backdrop, width, height);
        ctx.fillStyle = `rgba(5,8,12,${Math.min(0.9, Math.max(0, data.design.dim / 100))})`;
        ctx.fillRect(0, 0, width, height);
    }

    const glow = ctx.createRadialGradient(width * 0.92, -height * 0.08, 0, width * 0.92, -height * 0.08, width * 0.62);

    glow.addColorStop(0, Alpha(accent, 0.3));
    glow.addColorStop(1, Alpha(accent, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    const red = ctx.createRadialGradient(0, height * 1.1, 0, 0, height * 1.1, width * 0.5);

    red.addColorStop(0, "rgba(255,30,45,0.10)");
    red.addColorStop(1, "rgba(255,30,45,0)");
    ctx.fillStyle = red;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "rgba(255,255,255,0.025)";

    for (let y = 0; y < height; y += 4) ctx.fillRect(0, y, width, 1);

    ctx.strokeStyle = Alpha(accent, 0.45);
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, 7, height);

    await DrawHead(ctx, data, accent, width, description, leagues);
    await DrawTable(ctx, data, layout, accent);
    await DrawStaff(ctx, data, layout);
    DrawFoot(ctx, data, layout);

    return canvas.encode("webp", 90);
}

async function DrawHead(ctx: SKRSContext2D, data: ITeamCardData, accent: string, width: number, description: string[], leagues: { label: string }[]): Promise<void> {
    const { view, design } = data;
    const logoSize = 124;
    const left = SIDE;
    const top = 34;

    // Logo im abgeschrägten Rahmen, ohne Logo das Kürzel in der Kartenfarbe. Ist der Baustein aus, rückt der Text nach links.
    if (design.parts.logo) await DrawLogo(ctx, data, accent, left, top, logoSize);

    // Rechts: Rang-Symbol, Team-MMR, Rang in Zahlen, Ø Peak.
    const right = width - 36;
    const rank = CardRank(view.mmr);

    if (design.parts.mmr) {
        if (rank) Icon(ctx, await FileImage(RankIconFile(rank.tier)), right - 86, top - 4, 86, Alpha(TierColor(rank.tier), 0.55));

        ctx.textAlign = "right";
        ctx.fillStyle = COLORS.text;
        ctx.font = view.mmr !== null ? "700 54px Orbitron" : "700 26px Orbitron";
        ctx.fillText(view.mmr !== null ? Num(view.mmr) : "Noch keine MMR", right, top + 140);
        ctx.font = "700 15px Rajdhani";
        ctx.fillStyle = COLORS.soft;
        Caps(ctx, ["Team-MMR", rank?.name, rank?.division].filter(Boolean).join(" · "), right, top + 164, 1.8, "right");
    }

    const peaks = view.players
        .filter((entry) => COUNTING_ROLES.includes(entry.player.role))
        .map((entry) => BestPeak(entry.player) ?? 0)
        .filter((value) => value > 0);

    if (design.parts.mmr && design.parts.peak && peaks.length) {
        ctx.textAlign = "right";
        ctx.fillStyle = COLORS.gold;
        ctx.font = "700 16px Rajdhani";
        Caps(ctx, `Ø Peak ${Num(peaks.reduce((sum, value) => sum + value, 0) / peaks.length)}`, right, top + 186, 1, "right");
    }

    // Mitte: große Zeile, Marken, Unterzeile, Ligen.
    const x = design.parts.logo ? left + logoSize + 26 : left;
    const max = HeadWidth(width, design);

    ctx.textAlign = "left";
    ctx.fillStyle = COLORS.text;
    ctx.font = "800 44px Oxanium";
    ctx.fillText(Fit(ctx, data.lines.title, max), x, top + 40);

    let chip = x;
    const chips: { text: string; tone: "tag" | "place" | "plain" }[] = [
        ...(design.chips.tag && view.team.tag ? [{ text: view.team.tag, tone: "tag" as const }] : []),
        ...(design.chips.group && view.group ? [{ text: view.group.name, tone: "plain" as const }] : []),
        ...(design.chips.place && data.place ? [{ text: `Platz ${data.place.place} von ${data.place.of}`, tone: "place" as const }] : []),
        ...(design.chips.region && view.team.region ? [{ text: view.team.region, tone: "plain" as const }] : []),
    ];

    ctx.font = "700 15px Rajdhani";

    for (const entry of chips) {
        const text = entry.text.toUpperCase();
        const w = [...text].reduce((sum, char) => sum + ctx.measureText(char).width + 1.8, -1.8) + 20;

        // Passt eine Marke nicht mehr, fällt nur sie weg - Platz und Region dahinter sollen bleiben.
        if (chip + w > x + max) continue;

        const border = entry.tone === "tag" ? Alpha(accent, 0.7) : entry.tone === "place" ? "rgba(255,197,61,0.7)" : "rgba(255,255,255,0.22)";

        if (entry.tone === "tag") {
            ctx.fillStyle = Alpha(accent, 0.14);
            ctx.fillRect(chip, top + 56, w, 26);
        }

        ctx.strokeStyle = border;
        ctx.lineWidth = 1;
        ctx.strokeRect(chip + 0.5, top + 56.5, w - 1, 25);
        ctx.fillStyle = entry.tone === "tag" ? "#bfe9ff" : entry.tone === "place" ? COLORS.gold : COLORS.soft;
        Caps(ctx, text, chip + 10, top + 74, 1.8);
        chip += w + 8;
    }

    DrawUnder(ctx, x, max, top, accent, description, leagues);
}

/** Unterzeile und Ligen unter den Marken. */
function DrawUnder(ctx: SKRSContext2D, x: number, max: number, top: number, accent: string, description: string[], leagues: { label: string }[]): void {
    let y = top + 84;

    if (description.length) {
        ctx.font = "600 19px Rajdhani";
        ctx.fillStyle = COLORS.soft;

        for (const line of description) {
            y += 24;
            ctx.fillText(line, x, y);
        }
    }

    if (leagues.length) {
        y += 28;
        ctx.font = "600 16px Rajdhani";

        let cursor = x;

        for (const league of leagues) {
            const label = Fit(ctx, league.label, 220);
            const w = 14 + ctx.measureText(label).width;

            if (cursor + w > x + max) break;

            // Das Dreieck gezeichnet: Rajdhani kennt kein ▸.
            ctx.fillStyle = accent;
            ctx.beginPath();
            ctx.moveTo(cursor, y - 11);
            ctx.lineTo(cursor + 7, y - 6);
            ctx.lineTo(cursor, y - 1);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = COLORS.league;
            ctx.fillText(label, cursor + 14, y);
            cursor += w + 16;
        }
    }
}

/** Das Logo im abgeschrägten Rahmen, ohne Logo das Kürzel in der Kartenfarbe. */
async function DrawLogo(ctx: SKRSContext2D, data: ITeamCardData, accent: string, left: number, top: number, logoSize: number): Promise<void> {
    const { view } = data;

    ctx.save();
    Bevel(ctx, left, top, logoSize, logoSize, 20);
    ctx.fillStyle = "#121a24";
    ctx.fill();
    ctx.clip();

    const logo = await BufferImage(data.images.logo);

    if (logo) {
        const scale = Math.min((logoSize * 0.8) / logo.width, (logoSize * 0.8) / logo.height);
        const w = logo.width * scale;
        const h = logo.height * scale;

        ctx.drawImage(logo, left + (logoSize - w) / 2, top + (logoSize - h) / 2, w, h);
    } else {
        const tag = (view.team.tag || view.team.name.slice(0, 3)).toUpperCase();

        ctx.fillStyle = accent;
        ctx.textAlign = "center";
        ctx.font = "700 34px Orbitron";
        ctx.fillText(Fit(ctx, tag, logoSize - 20), left + logoSize / 2, top + logoSize / 2 + 12);
    }

    ctx.restore();
    ctx.lineWidth = 3;
    ctx.strokeStyle = Alpha(accent, 0.7);
    Bevel(ctx, left + 1.5, top + 1.5, logoSize - 3, logoSize - 3, 19);
    ctx.stroke();
}

async function DrawTable(ctx: SKRSContext2D, data: ITeamCardData, layout: ILayout, accent: string): Promise<void> {
    const { columns, tableTop, width } = layout;
    const players = data.view.players.filter((entry) => PLAYING_ROLES.includes(entry.player.role));
    const numeric = new Set<ColumnId>(["3v3", "2v2", "1v1", "peak", "value"]);

    ctx.font = "700 15px Rajdhani";
    ctx.fillStyle = COLORS.soft;

    for (const column of columns) {
        const right = numeric.has(column.id);

        Caps(ctx, HEADERS[column.id], right ? column.x + column.width - 10 : column.x, tableTop + 16, 1.8, right ? "right" : "left");
    }

    for (const [index, entry] of players.entries()) {
        const top = tableTop + HEAD_ROW + index * ROW;
        const middle = top + ROW / 2;
        const { player, value, label } = entry;
        const snapshot = player.snapshot;
        const counts = COUNTING_ROLES.includes(player.role);

        ctx.fillStyle = COLORS.line;
        ctx.fillRect(SIDE, top, width - 2 * SIDE, 1);

        if (player.role === "captain") {
            const tint = ctx.createLinearGradient(SIDE, 0, SIDE + (width - 2 * SIDE) * 0.7, 0);

            tint.addColorStop(0, Alpha(accent, 0.1));
            tint.addColorStop(1, Alpha(accent, 0));
            ctx.fillStyle = tint;
            ctx.fillRect(SIDE, top + 1, width - 2 * SIDE, ROW - 1);
        }

        for (const column of columns) {
            const right = column.x + column.width - 10;

            ctx.textAlign = "left";

            if (column.id === "role") {
                const badge = (await BufferImage(data.images.badges[player.role])) ?? (await FileImage(path.join(ROLE_ICON_ROOT, `${ROLE_ICON_FILES[player.role]}.png`)));

                Icon(ctx, badge, column.x, middle - 16, 32);
                ctx.font = "700 16px Rajdhani";
                ctx.fillStyle = COLORS.soft;
                Caps(ctx, ROLE_LABELS[player.role], column.x + 42, counts ? middle + 6 : middle, 1);

                if (player.role === "trial") {
                    ctx.font = "600 12px Rajdhani";
                    ctx.fillStyle = COLORS.dim;
                    ctx.fillText("zählt nicht", column.x + 42, middle + 16);
                }
            } else if (column.id === "player") {
                ctx.font = "600 20px Oxanium";
                ctx.fillStyle = "#ffffff";
                ctx.fillText(Fit(ctx, label, column.width - 12), column.x, middle + 7);
            } else if (column.id === "rank") {
                // Der Rang zum Schnitt des Spielers, nicht zu 3v3 (Plan 27).
                const rank = CardRank(value);

                if (!rank) {
                    ctx.font = "600 20px Oxanium";
                    ctx.fillStyle = COLORS.dim;
                    ctx.fillText("—", column.x, middle + 7);
                    continue;
                }

                Icon(ctx, await FileImage(RankIconFile(rank.tier)), column.x, middle - 17, 34);
                ctx.font = "700 19px Oxanium";
                ctx.fillStyle = COLORS.text;
                ctx.fillText(rank.name, column.x + 44, rank.division ? middle - 1 : middle + 6);

                if (rank.division) {
                    ctx.font = "700 13px Rajdhani";
                    ctx.fillStyle = COLORS.dim;
                    Caps(ctx, rank.division, column.x + 44, middle + 16, 0.8);
                }
            } else {
                const number =
                    column.id === "peak" ? BestPeak(player) : column.id === "value" ? value : (snapshot?.mmr[column.id as "1v1" | "2v2" | "3v3"] ?? null);

                ctx.textAlign = "right";
                ctx.font = column.id === "3v3" || column.id === "value" ? "800 19px Oxanium" : "600 19px Oxanium";
                ctx.fillStyle = column.id === "3v3" ? "#ffffff" : column.id === "peak" ? COLORS.gold : column.id === "value" ? COLORS.blue : COLORS.dim;
                // Der Schnitt eines Trials zählt nicht in die Team-MMR - blass.
                ctx.globalAlpha = column.id === "value" && !counts ? 0.5 : 1;
                ctx.fillText(Num(number), right, middle + 7);
                ctx.globalAlpha = 1;
            }
        }
    }

    if (!players.length) {
        ctx.textAlign = "left";
        ctx.font = "600 18px Rajdhani";
        ctx.fillStyle = COLORS.dim;
        ctx.fillText("Noch niemand im Kader.", SIDE, tableTop + HEAD_ROW + ROW / 2 + 6);
    }
}

async function DrawStaff(ctx: SKRSContext2D, data: ITeamCardData, layout: ILayout): Promise<void> {
    const staff = data.view.players.filter((entry) => !PLAYING_ROLES.includes(entry.player.role));

    if (!data.design.parts.staff || !staff.length) return;

    const playing = Math.max(1, data.view.players.length - staff.length);
    const top = layout.tableTop + HEAD_ROW + playing * ROW + 14;
    let x = SIDE;

    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.fillRect(SIDE, top, layout.width - 2 * SIDE, 1);

    for (const [index, entry] of staff.entries()) {
        // Erst messen: Passt der Eintrag nicht mehr in die Zeile, steht dort „+N“ statt eines halben Namens.
        ctx.font = "700 14px Rajdhani";

        const label = CapsWidth(ctx, ROLE_LABELS[entry.player.role], 1.6);

        ctx.font = "600 19px Oxanium";

        const name = Fit(ctx, entry.label, 220);
        const need = 40 + label + 8 + ctx.measureText(name).width;
        const rest = staff.length - index - 1;

        if (x + need > layout.width - SIDE - (rest ? 50 : 0)) {
            ctx.font = "700 16px Rajdhani";
            ctx.fillStyle = COLORS.dim;
            ctx.textAlign = "left";
            ctx.fillText(`+${staff.length - index}`, x, top + 36);
            break;
        }

        const badge = (await BufferImage(data.images.badges[entry.player.role])) ?? (await FileImage(path.join(ROLE_ICON_ROOT, `${ROLE_ICON_FILES[entry.player.role]}.png`)));

        Icon(ctx, badge, x, top + 14, 30);
        x += 40;
        ctx.textAlign = "left";
        ctx.font = "700 14px Rajdhani";
        ctx.fillStyle = COLORS.dim;
        x += Caps(ctx, ROLE_LABELS[entry.player.role], x, top + 35, 1.6) + 8;
        ctx.font = "600 19px Oxanium";
        ctx.fillStyle = "#e6eaf0";
        ctx.fillText(name, x, top + 36);
        x += ctx.measureText(name).width + 30;
    }
}

function DrawFoot(ctx: SKRSContext2D, data: ITeamCardData, layout: ILayout): void {
    const y = layout.height - 26;
    const left = data.lines.footer;
    const right = data.view.fetchedAt > 0 ? `Ränge vom ${Stamp(data.view.fetchedAt)}` : "Ränge fehlen noch";

    ctx.font = "700 15px Rajdhani";
    ctx.fillStyle = COLORS.dim;

    const used = Caps(ctx, right, layout.width - 36, y, 1.5, "right");

    Caps(ctx, FitCaps(ctx, left, layout.width - SIDE - 36 - used - 40, 1.5), SIDE, y, 1.5);
}
