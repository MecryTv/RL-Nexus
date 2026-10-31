import path from "path";
import { Image, SKRSContext2D, createCanvas, loadImage } from "@napi-rs/canvas";
import { RegisterFonts } from "./RankCard";
import { GALLERY_ROOT } from "../constants/Gallery";
import { CARD_SCALE, CARD_WIDTH, IRoleListImage, MAX_IMAGE_PEOPLE, RoleListMotif } from "../constants/RoleLists";
import { IRoleListGroup, IRoleListMember } from "../interfaces/services/rolelists/IRoleLists";

/**
 * Das gezeichnete Bild der Rollen-Listen (Plan 29): Kopf, je Rolle eine
 * Gruppe mit Kacheln, Fuß. Gezeichnet wie die Team-Karte, doppelt so fein,
 * als WebP. Alle Maße folgen dem Entwurf v5 (dort in cqw, hier 1 cqw = 12 px).
 *
 * Diese Datei lädt nichts aus dem Netz. Logo, Hintergrund, Profilbilder und
 * Symbole kommen als fertige Daten (RoleListService.CardData), die Motive
 * „Arena“ und „Nexus-Banner“ liegen als Dateien beim Bot, die übrigen zeichnet
 * DrawMotif selbst. Siehe docs/RoleLists.md.
 */

export interface IRoleListCardData {
    image: IRoleListImage;
    heading: string;
    guildName: string;
    channelName: string;
    groups: IRoleListGroup[];
    /** Discord-ID → Titel (zweite Zeile „Eigener Titel“). */
    titles: Record<string, string>;
    now: number;
    pictures: {
        logo: Buffer | null;
        /** Das eigene Hintergrundbild. null: das Motiv „Arena“. */
        background: Buffer | null;
        /** Discord-ID → Profilbild. */
        avatars: Map<string, Buffer>;
        /** Rollen-ID → Symbol der Rolle. */
        icons: Map<string, Buffer>;
    };
}

const CQW = CARD_WIDTH / 100;
const PAD = 4.5 * CQW;
const INNER = CARD_WIDTH - 2 * PAD;
const SIZES = { s: 0.3, m: 0.4, l: 0.52 } as const;
const TITLE_SIZE = { s: 3.2 * CQW, m: 4.2 * CQW, l: 5.4 * CQW } as const;
const NAME_SIZE = { s: 1.6 * CQW, m: 1.9 * CQW, l: 2.3 * CQW } as const;
const GAP = { tight: 1.6 * CQW, normal: 2.6 * CQW, wide: 3.6 * CQW } as const;
const PEOPLE_GAP = { tight: 0.9 * CQW, normal: 1.5 * CQW, wide: 2.4 * CQW } as const;
const LABEL_HEIGHT = 2.6 * CQW;
const ROW_FACE = 4.6 * CQW;
const FOOT_HEIGHT = 1.6 * CQW + 1.45 * CQW + 2;

const MOTIF_FILES: Partial<Record<RoleListMotif, string>> = {
    arena: path.join(GALLERY_ROOT, "privacy", "RL Card background.webp"),
    nexus: path.join(GALLERY_ROOT, "privacy", "RL Nexus Banner.png"),
};

const files = new Map<string, Promise<Image | null>>();

function FileImage(file: string): Promise<Image | null> {
    let image = files.get(file);

    if (!image) {
        image = loadImage(file).catch(() => null);
        files.set(file, image);
    }

    return image;
}

function BufferImage(buffer: Buffer | null | undefined): Promise<Image | null> {
    return buffer ? loadImage(buffer).catch(() => null) : Promise.resolve(null);
}

/** #rrggbb mit Deckkraft 0..1. */
function Rgba(hex: string, alpha: number): string {
    const value = parseInt(hex.slice(1), 16);

    return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${Math.max(0, Math.min(1, alpha))})`;
}

/** Zwei Farben mischen wie color-mix(in srgb, a p%, b). */
function Mix(a: string, b: string, share: number): string {
    const x = parseInt(a.slice(1), 16);
    const y = parseInt(b.slice(1), 16);
    const channel = (shift: number): number => Math.round(((x >> shift) & 255) * share + ((y >> shift) & 255) * (1 - share));

    return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, "0")).join("")}`;
}

function Font(weight: number, size: number, family: string): string {
    return `${weight} ${size}px ${family}`;
}

function Fit(ctx: SKRSContext2D, text: string, width: number): string {
    if (ctx.measureText(text).width <= width) return text;

    let cut = text;

    while (cut.length > 1 && ctx.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1);

    return `${cut}…`;
}

function RoundRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number): void {
    const radius = Math.max(0, Math.min(r, w / 2, h / 2));

    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
}

/* ----------------------------------------------------------
   Aufteilung: wer wo steht
   ---------------------------------------------------------- */
interface ITile {
    x: number;
    y: number;
    w: number;
    h: number;
    face: number;
    /** null: die Kachel „+N weitere“. */
    member: IRoleListMember | null;
    row: boolean;
}

interface IGroupPlan {
    group: IRoleListGroup;
    color: string;
    label: { x: number; y: number; w: number };
    tiles: ITile[];
    featured: boolean;
}

interface IPlan {
    width: number;
    height: number;
    people: number;
    more: number;
    headHeight: number;
    footY: number;
    groups: IGroupPlan[];
}

function Accent(image: IRoleListImage, group: IRoleListGroup): string {
    return image.accent === "own" ? image.accentColor : group.role.color;
}

function Plan(data: IRoleListCardData): IPlan {
    const image = data.image;
    const gap = GAP[image.gap];
    const pgap = PEOPLE_GAP[image.gap];
    const nameHeight = NAME_SIZE[image.nsize] * 1.15;
    const line2Height = image.line2 === "none" ? 0 : NAME_SIZE[image.nsize] * 0.76 * 1.15 + 0.8 * CQW;
    const titleBlock = TITLE_SIZE[image.tsize] * 1.05 + (image.sub ? 0.9 * CQW + 1.8 * CQW * 1.2 : 0);
    // Mittig steht das Logo über der Überschrift, links daneben.
    const headHeight = (image.headAlign === "center" ? (image.logo ? 8 * CQW + 1.6 * CQW : 0) + titleBlock : Math.max(image.logo ? 8 * CQW : 0, titleBlock)) + 2.2 * CQW + 1;

    // Höchstens 120 Leute: die Gruppe, in der die Grenze liegt, endet mit „+N weitere“, spätere fallen weg.
    let left = MAX_IMAGE_PEOPLE;
    let more = 0;
    const shown: { group: IRoleListGroup; members: (IRoleListMember | null)[] }[] = [];

    for (const group of data.groups) {
        if (left <= 0) {
            more += group.members.length;
            continue;
        }

        const members: (IRoleListMember | null)[] = group.members.slice(0, left);

        left -= members.length;

        if (members.length < group.members.length) {
            more += group.members.length - members.length;
            members.push(null);
        }

        shown.push({ group, members });
    }

    // Endet die Grenze genau an einer Rolle, bekämen die übrigen sonst gar keinen Hinweis.
    if (more > 0 && shown.length && !shown.some((entry) => entry.members.includes(null))) shown[shown.length - 1]!.members.push(null);

    const rows = image.layout === "list" || image.layout === "columns";
    const center = image.align === "center" || image.layout === "pyramid";
    const plans: IGroupPlan[] = [];
    let y = PAD + headHeight + gap;

    const tilesFor = (members: (IRoleListMember | null)[], x0: number, width: number, cols: number, featured: boolean, top: number): { tiles: ITile[]; height: number } => {
        const tiles: ITile[] = [];
        const size = SIZES[image.size];

        if (rows) {
            const perRow = image.layout === "columns" ? 1 : 2;
            const w = (width - (perRow - 1) * pgap) / perRow;
            const h = Math.max(ROW_FACE, nameHeight + line2Height) + 2 * CQW;

            members.forEach((member, index) => {
                tiles.push({ x: x0 + (index % perRow) * (w + pgap), y: top + Math.floor(index / perRow) * (h + pgap), w, h, face: ROW_FACE, member, row: true });
            });

            const lines = Math.ceil(members.length / perRow);

            return { tiles, height: lines ? lines * h + (lines - 1) * pgap : 0 };
        }

        const base = (width - (cols - 1) * pgap) / cols;
        const w = featured && image.layout === "pyramid" ? Math.min(width, base * 1.35) : base;
        const face = (0.91 * width / cols) * (featured ? size * 1.3 : size);
        const h = (featured ? 2.2 + 2 : 1.7 + 1.5) * CQW + face + 0.8 * CQW + nameHeight * (featured ? 1.2 : 1) + line2Height;
        const perRow = Math.max(1, Math.floor((width + pgap) / (w + pgap)));
        const lines = Math.ceil(members.length / perRow);

        for (let line = 0; line < lines; line++) {
            const inLine = members.slice(line * perRow, (line + 1) * perRow);
            const used = inLine.length * w + (inLine.length - 1) * pgap;
            const start = x0 + (center ? (width - used) / 2 : 0);

            inLine.forEach((member, index) => tiles.push({ x: start + index * (w + pgap), y: top + line * (h + pgap), w, h, face, member, row: false }));
        }

        return { tiles, height: lines ? lines * h + (lines - 1) * pgap : 0 };
    };

    const emptyHeight = 1.7 * CQW;

    if (image.layout === "columns") {
        // Rollen nebeneinander, höchstens 4 je Reihe.
        const perRow = Math.min(Math.max(shown.length, 1), 4);
        const width = (INNER - (perRow - 1) * 2 * CQW) / perRow;

        for (let start = 0; start < shown.length; start += perRow) {
            let tallest = 0;

            shown.slice(start, start + perRow).forEach((entry, index) => {
                const x = PAD + index * (width + 2 * CQW);
                const { tiles, height } = tilesFor(entry.members, x, width, 1, false, y + LABEL_HEIGHT + 1.5 * CQW);

                plans.push({ group: entry.group, color: Accent(image, entry.group), label: { x, y, w: width }, tiles, featured: false });
                tallest = Math.max(tallest, LABEL_HEIGHT + 1.5 * CQW + (entry.members.length ? height : emptyHeight));
            });

            y += tallest + gap;
        }
    } else {
        shown.forEach((entry, index) => {
            const featured = image.featured && index === 0 && image.layout !== "list";
            const { tiles, height } = tilesFor(entry.members, PAD, INNER, image.layout === "list" ? 2 : image.cols, featured, y + LABEL_HEIGHT + 1.5 * CQW);

            plans.push({ group: entry.group, color: Accent(image, entry.group), label: { x: PAD, y, w: INNER }, tiles, featured });
            y += LABEL_HEIGHT + 1.5 * CQW + (entry.members.length ? height : emptyHeight) + gap;
        });
    }

    if (!shown.length) y += 2 * CQW + gap;

    const footY = y;
    const height = Math.ceil(footY + (image.showFooter ? FOOT_HEIGHT : 0) + 3.2 * CQW);

    return { width: CARD_WIDTH, height, people: MAX_IMAGE_PEOPLE - left, more, headHeight, footY, groups: plans };
}

/** Maße des Bildes (vor dem Faktor) und wie viele Leute darauf passen. */
export function BoardPlan(data: IRoleListCardData): { width: number; height: number; people: number; more: number; extra: boolean } {
    const plan = Plan(data);
    // extra: es steht eine Kachel „+N weitere“ im Bild.
    const extra = plan.groups.some((group) => group.tiles.some((tile) => tile.member === null));

    return { width: plan.width, height: plan.height, people: plan.people, more: plan.more, extra };
}

/* ----------------------------------------------------------
   Hintergrund
   ---------------------------------------------------------- */
function Cover(ctx: SKRSContext2D, picture: Image, width: number, height: number, image: IRoleListImage): void {
    const zoom = image.zoom / 100;
    const scale = Math.max(width / picture.width, height / picture.height) * zoom;
    const w = picture.width * scale;
    const h = picture.height * scale;
    const x = (width - w) * (image.fx / 100);
    const y = (height - h) * (image.fy / 100);

    ctx.save();

    if (image.blur > 0) ctx.filter = `blur(${image.blur}px)`;

    ctx.drawImage(picture, x, y, w, h);
    ctx.restore();
}

/** Ein Motiv: Arena und Nexus-Banner aus Dateien, die übrigen gezeichnet wie im Entwurf. */
export async function DrawMotif(ctx: SKRSContext2D, motif: RoleListMotif, width: number, height: number, image?: IRoleListImage): Promise<void> {
    const file = MOTIF_FILES[motif];

    if (file) {
        const picture = await FileImage(file);

        if (picture) {
            Cover(ctx, picture, width, height, image ?? ({ zoom: 100, fx: 50, fy: 50, blur: 0 } as IRoleListImage));

            return;
        }
    }

    switch (motif) {
        case "spotlight": {
            const light = ctx.createRadialGradient(width / 2, -0.1 * height, 0, width / 2, -0.1 * height, Math.max(width, height) * 0.95);

            light.addColorStop(0, "#5a1220");
            light.addColorStop(0.38, "#170a10");
            light.addColorStop(0.7, "#070a0f");
            light.addColorStop(1, "#070a0f");
            ctx.fillStyle = light;
            ctx.fillRect(0, 0, width, height);

            return;
        }
        case "carbon": {
            ctx.fillStyle = "#0f141b";
            ctx.fillRect(0, 0, width, height);
            ctx.save();
            ctx.strokeStyle = "#141b24";
            ctx.lineWidth = 7;

            for (let x = -height; x < width + height; x += 14) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x + height, height);
                ctx.stroke();
            }

            ctx.restore();

            return;
        }
        case "grid": {
            const glow = ctx.createRadialGradient(width / 2, 1.15 * height, 0, width / 2, 1.15 * height, Math.max(width, height) * 0.9);

            glow.addColorStop(0, "#08405a");
            glow.addColorStop(0.7, "#05060f");
            glow.addColorStop(1, "#05060f");
            ctx.fillStyle = glow;
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = "rgba(0, 229, 255, 0.14)";

            for (let x = 0; x < width; x += 34) ctx.fillRect(x, 0, 1, height);
            for (let y = 0; y < height; y += 34) ctx.fillRect(0, y, width, 1);

            return;
        }
        default: {
            // Polarlicht - und der Ersatz, wenn eine Datei fehlt.
            ctx.fillStyle = "#070a10";
            ctx.fillRect(0, 0, width, height);

            for (const [cx, cy, color] of [
                [0.15, 0, "#4a1f73"],
                [0.9, 1, "#0d5c57"],
            ] as const) {
                ctx.save();
                ctx.translate(cx * width, cy * height);
                ctx.scale(1, height / width);

                const blob = ctx.createRadialGradient(0, 0, 0, 0, 0, width * 0.55);

                blob.addColorStop(0, color);
                blob.addColorStop(1, "rgba(7, 10, 16, 0)");
                ctx.fillStyle = blob;
                ctx.fillRect(-width, -width, 2 * width, 2 * width);
                ctx.restore();
            }
        }
    }
}

async function DrawBackground(ctx: SKRSContext2D, data: IRoleListCardData, width: number, height: number): Promise<void> {
    const image = data.image;

    ctx.fillStyle = image.c1;
    ctx.fillRect(0, 0, width, height);

    if (image.bg === "gradient") {
        const angle = ((image.angle - 90) * Math.PI) / 180;
        const reach = (Math.abs(width * Math.cos(angle)) + Math.abs(height * Math.sin(angle))) / 2;
        const gradient = ctx.createLinearGradient(width / 2 - Math.cos(angle) * reach, height / 2 - Math.sin(angle) * reach, width / 2 + Math.cos(angle) * reach, height / 2 + Math.sin(angle) * reach);

        gradient.addColorStop(0, image.c1);
        gradient.addColorStop(1, image.c2);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
    } else if (image.bg === "image") {
        const picture = await BufferImage(data.pictures.background);

        if (picture) Cover(ctx, picture, width, height, image);
        else await DrawMotif(ctx, "arena", width, height, image);
    } else if (image.bg === "motif") {
        await DrawMotif(ctx, image.motif, width, height, image);
    }

    ctx.fillStyle = Rgba(image.dimc, image.dim / 100);
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.globalAlpha = 0.5;

    if (image.pattern === "raster") {
        ctx.fillStyle = "rgba(255, 255, 255, 0.05)";

        for (let x = 0; x < width; x += 3 * CQW) ctx.fillRect(x, 0, 1, height);
        for (let y = 0; y < height; y += 3 * CQW) ctx.fillRect(0, y, width, 1);
    } else if (image.pattern === "diagonal") {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.045)";
        ctx.lineWidth = 1;

        for (let x = -height; x < width + height; x += 1.6 * CQW) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x + height, height);
            ctx.stroke();
        }
    } else if (image.pattern === "dots") {
        ctx.fillStyle = "rgba(255, 255, 255, 0.08)";

        for (let x = 1.1 * CQW; x < width; x += 2.2 * CQW) {
            for (let y = 1.1 * CQW; y < height; y += 2.2 * CQW) {
                ctx.beginPath();
                ctx.arc(x, y, 1.2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    ctx.restore();
}

/* ----------------------------------------------------------
   Zeichnen
   ---------------------------------------------------------- */
function Stand(now: number): string {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
            .formatToParts(new Date(now))
            .map((part) => [part.type, part.value])
    );

    return `${parts.day}.${parts.month}.${parts.year} · ${parts.hour}:${parts.minute}`;
}

function Joined(at: number): string {
    const date = new Date(at);

    return `dabei seit ${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()}`;
}

function Upper(image: IRoleListImage, text: string): string {
    return image.upper ? text.toLocaleUpperCase("de-DE") : text;
}

async function DrawFace(ctx: SKRSContext2D, image: IRoleListImage, tile: ITile, x: number, y: number, color: string, picture: Image | null, member: IRoleListMember): Promise<void> {
    const size = tile.face;
    const radius = { round: size / 2, rounded: size * 0.24, square: size * 0.04 }[image.shape];

    if (image.ring !== "none") {
        ctx.save();

        if (image.ring === "glow" && image.glow > 0) {
            ctx.shadowColor = Rgba(color, 0.7);
            ctx.shadowBlur = (image.glow / 100) * 3 * CQW;
        }

        RoundRect(ctx, x - 0.7 * CQW, y - 0.7 * CQW, size + 1.4 * CQW, size + 1.4 * CQW, radius + 0.7 * CQW);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.restore();

        RoundRect(ctx, x - 0.35 * CQW, y - 0.35 * CQW, size + 0.7 * CQW, size + 0.7 * CQW, radius + 0.35 * CQW);
        ctx.fillStyle = image.c1;
        ctx.fill();
    }

    ctx.save();
    RoundRect(ctx, x, y, size, size, radius);
    ctx.clip();

    if (picture) {
        ctx.drawImage(picture, x, y, size, size);
    } else {
        const fill = ctx.createRadialGradient(x + size * 0.3, y + size * 0.25, 0, x + size * 0.3, y + size * 0.25, size);

        fill.addColorStop(0, Mix(color, "#ffffff", 0.7));
        fill.addColorStop(0.7, Mix(color, "#0b1016", 0.55));
        fill.addColorStop(1, Mix(color, "#0b1016", 0.55));
        ctx.fillStyle = fill;
        ctx.fillRect(x, y, size, size);
        ctx.fillStyle = "#ffffff";
        ctx.font = Font(700, size * 0.4, image.fn);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText((member.name.trim()[0] ?? "?").toLocaleUpperCase("de-DE"), x + size / 2, y + size / 2);
    }

    ctx.restore();
}

function DrawTileBox(ctx: SKRSContext2D, image: IRoleListImage, tile: ITile, color: string): void {
    const radius = image.radius;
    const border = image.borderMode === "own" ? image.borderColor : color;
    const base = Rgba(image.tileColor, image.tileAlpha / 100);

    if (image.tile === "none") return;

    if (image.tile === "glass" || image.tile === "solid" || image.tile === "topline") {
        RoundRect(ctx, tile.x, tile.y, tile.w, tile.h, radius);

        if (image.tile === "glass") {
            const glass = ctx.createLinearGradient(0, tile.y, 0, tile.y + tile.h);

            glass.addColorStop(0, Rgba(color, image.tint / 100 + 0.03));
            glass.addColorStop(1, base);
            ctx.fillStyle = glass;
        } else {
            ctx.fillStyle = base;
        }

        ctx.fill();
    }

    if (image.tile === "topline") {
        ctx.fillStyle = color;
        ctx.fillRect(tile.x, tile.y, tile.w, Math.max(2, image.bw));

        return;
    }

    if (image.bw > 0) {
        RoundRect(ctx, tile.x + image.bw / 2, tile.y + image.bw / 2, tile.w - image.bw, tile.h - image.bw, radius);
        ctx.strokeStyle = image.tile === "glass" ? Rgba(border, 0.55) : border;
        ctx.lineWidth = image.bw;
        ctx.stroke();

        if (image.tile === "glass") {
            ctx.fillStyle = color;
            ctx.fillRect(tile.x, tile.y, tile.w, 2);
        }
    }
}

function DrawLabel(ctx: SKRSContext2D, data: IRoleListCardData, plan: IGroupPlan, icon: Image | null, center: boolean): void {
    const image = data.image;
    const color = plan.color;
    const ink = image.headMode === "accent" ? color : image.headColor;
    const size = 2.1 * CQW;
    const label = Upper(image, plan.group.entry.label || plan.group.role.name);
    const count = image.showCount ? String(plan.group.members.length) : "";
    const { x, y, w } = plan.label;
    const middle = y + LABEL_HEIGHT / 2;

    ctx.font = Font(700, size, image.fn);

    const iconSize = icon ? 2.8 * CQW : 0;
    const textWidth = Math.min(ctx.measureText(label).width, w * 0.8);
    ctx.font = Font(600, 1.6 * CQW, image.fn);
    const countWidth = count ? ctx.measureText(count).width + 1.2 * CQW : 0;
    const content = (image.headStyle === "bar" ? 1.9 * CQW : 0) + (iconSize ? iconSize + 1.2 * CQW : 0) + textWidth + countWidth;
    let cursor = center ? x + (w - content) / 2 : x;

    if (image.headStyle === "pill") {
        RoundRect(ctx, cursor, y, content + 3.2 * CQW, LABEL_HEIGHT, LABEL_HEIGHT / 2);
        ctx.fillStyle = color;
        ctx.fill();
        cursor += 1.6 * CQW;
    }

    if (image.headStyle === "bar") {
        ctx.save();

        if (image.glow > 0) {
            ctx.shadowColor = color;
            ctx.shadowBlur = (image.glow / 100) * 2.4 * CQW;
        }

        ctx.fillStyle = color;
        ctx.fillRect(cursor, y, 0.7 * CQW, LABEL_HEIGHT);
        ctx.restore();
        cursor += 1.9 * CQW;
    }

    if (icon) {
        ctx.drawImage(icon, cursor, middle - iconSize / 2, iconSize, iconSize);
        cursor += iconSize + 1.2 * CQW;
    }

    const fill = image.headStyle === "pill" ? "#0a0d12" : image.headStyle === "plain" ? color : ink;

    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = Font(700, size, image.fn);
    ctx.fillStyle = fill;
    ctx.fillText(Fit(ctx, label, w * 0.8), cursor, middle);
    cursor += textWidth;

    if (count) {
        ctx.font = Font(600, 1.6 * CQW, image.fn);
        ctx.fillStyle = image.headStyle === "pill" ? "rgba(10, 13, 18, 0.75)" : image.sc;
        ctx.fillText(count, cursor + 1.2 * CQW, middle);
        cursor += countWidth;
    }

    if (image.headStyle === "line") {
        ctx.fillStyle = color;
        ctx.fillRect(x, y + LABEL_HEIGHT + 0.4 * CQW, w, 2);
    } else if (image.headStyle === "bar" && !center && cursor + 1.2 * CQW < x + w) {
        const line = ctx.createLinearGradient(cursor + 1.2 * CQW, 0, x + w, 0);

        line.addColorStop(0, Rgba(color, 0.7));
        line.addColorStop(1, Rgba(color, 0));
        ctx.fillStyle = line;
        ctx.fillRect(cursor + 1.2 * CQW, middle, x + w - cursor - 1.2 * CQW, 1);
    }
}

/** Größte Kante, die WebP kennt. */
const MAX_WEBP_SIZE = 16383;

export async function RenderRoleListCard(data: IRoleListCardData): Promise<Buffer> {
    await RegisterFonts();

    const image = data.image;
    const plan = Plan(data);
    // WebP endet bei 16383 px: ein sehr hohes Bild (viele Leute, Spalten) zeichnet der Bot weniger fein statt gar nicht.
    const scale = Math.min(CARD_SCALE, MAX_WEBP_SIZE / plan.height);
    const canvas = createCanvas(Math.floor(plan.width * scale), Math.floor(plan.height * scale));
    const ctx = canvas.getContext("2d");

    ctx.scale(scale, scale);
    await DrawBackground(ctx, data, plan.width, plan.height);

    const count = new Set(data.groups.flatMap((group) => group.members.map((member) => member.id))).size;
    const fill = (text: string): string => text.replace(/\{server\}/g, data.guildName).replace(/\{anzahl\}/g, String(count)).replace(/\{rollen\}/g, String(data.groups.length)).replace(/\{stand\}/g, Stand(data.now));
    const line = Rgba(image.lineColor, 0.14);

    // Kopf
    const centerHead = image.headAlign === "center";
    const logo = image.logo ? await BufferImage(data.pictures.logo) : null;
    const top = PAD;
    const logoSize = 8 * CQW;
    const titleSize = TITLE_SIZE[image.tsize];
    let textX = PAD;
    let textY = top;

    if (image.logo) {
        const x = centerHead ? (plan.width - logoSize) / 2 : PAD;
        const radius = { rounded: 1.4 * CQW, round: logoSize / 2, square: 0 }[image.logoShape];

        ctx.save();
        RoundRect(ctx, x, top, logoSize, logoSize, radius);
        ctx.fillStyle = "#0d1218";
        ctx.fill();
        ctx.clip();

        if (logo) ctx.drawImage(logo, x, top, logoSize, logoSize);
        else {
            ctx.fillStyle = "#ffffff";
            ctx.font = Font(700, logoSize * 0.45, image.ft);
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText((data.guildName.trim()[0] ?? "?").toLocaleUpperCase("de-DE"), x + logoSize / 2, top + logoSize / 2);
        }

        ctx.restore();

        if (centerHead) textY = top + logoSize + 1.6 * CQW;
        else textX = PAD + logoSize + 2.4 * CQW;
    }

    const totalWidth = image.total && !centerHead ? 12 * CQW : 0;
    const textWidth = plan.width - PAD - textX - totalWidth;
    const block = titleSize * 1.05 + (image.sub ? 0.9 * CQW + 1.8 * CQW * 1.2 : 0);
    const blockTop = centerHead ? textY : top + (image.logo ? Math.max(0, (logoSize - block) / 2) : 0);

    ctx.textAlign = centerHead ? "center" : "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = image.tc;
    ctx.font = Font(700, titleSize, image.ft);
    ctx.fillText(Fit(ctx, Upper(image, data.heading), centerHead ? plan.width - 2 * PAD : textWidth), centerHead ? plan.width / 2 : textX, blockTop);

    if (image.sub) {
        ctx.fillStyle = image.sc;
        ctx.font = Font(600, 1.8 * CQW, image.fn);
        ctx.fillText(Fit(ctx, fill(image.sub).toLocaleUpperCase("de-DE"), centerHead ? plan.width - 2 * PAD : textWidth), centerHead ? plan.width / 2 : textX, blockTop + titleSize * 1.05 + 0.9 * CQW);
    }

    if (image.total && !centerHead) {
        ctx.textAlign = "right";
        ctx.fillStyle = image.tc;
        ctx.font = Font(700, 5 * CQW, image.fn);
        ctx.fillText(String(count), plan.width - PAD, top + 1 * CQW);
        ctx.fillStyle = image.sc;
        ctx.font = Font(600, 1.5 * CQW, image.fn);
        ctx.fillText("MITGLIEDER", plan.width - PAD, top + 6.2 * CQW);
    }

    ctx.fillStyle = line;
    ctx.fillRect(PAD, top + plan.headHeight - 1, plan.width - 2 * PAD, 1);

    // Gruppen
    const center = image.align === "center" || image.layout === "pyramid";
    const nameSize = NAME_SIZE[image.nsize];
    const avatars = new Map<string, Image | null>();

    for (const [id, buffer] of data.pictures.avatars) avatars.set(id, await BufferImage(buffer));

    for (const group of plan.groups) {
        const icon = image.showIcon ? await BufferImage(data.pictures.icons.get(group.group.role.id)) : null;

        DrawLabel(ctx, data, group, icon, center && image.layout !== "columns");

        if (!group.group.members.length) {
            ctx.textAlign = center ? "center" : "left";
            ctx.textBaseline = "top";
            ctx.fillStyle = image.sc;
            ctx.font = Font(600, 1.7 * CQW, image.fn);
            ctx.fillText("NOCH NIEMAND", center ? group.label.x + group.label.w / 2 : group.label.x, group.label.y + LABEL_HEIGHT + 1.5 * CQW);
        }

        for (const tile of group.tiles) {
            DrawTileBox(ctx, image, tile, group.color);

            if (!tile.member) {
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillStyle = image.nc;
                ctx.font = Font(700, nameSize * 1.4, image.fn);
                ctx.fillText(`+${plan.more} weitere`, tile.x + tile.w / 2, tile.y + tile.h / 2);
                continue;
            }

            const member = tile.member;
            const second = { handle: `@${member.username}`, title: data.titles[member.id] ?? "", joined: Joined(member.joinedAt), role: group.group.entry.label || group.group.role.name, none: "" }[image.line2];
            const nick = group.featured ? nameSize * 1.2 : nameSize;

            if (tile.row) {
                const faceX = tile.x + 1.4 * CQW;
                const faceY = tile.y + (tile.h - tile.face) / 2;

                await DrawFace(ctx, image, tile, faceX, faceY, group.color, avatars.get(member.id) ?? null, member);

                const textLeft = faceX + tile.face + 1.4 * CQW;
                const room = tile.x + tile.w - textLeft - 1.4 * CQW;
                const lines = nick * 1.15 + (second ? nick * 0.76 * 1.15 + 0.4 * CQW : 0);
                const start = tile.y + (tile.h - lines) / 2;

                ctx.textAlign = "left";
                ctx.textBaseline = "top";
                ctx.fillStyle = image.nc;
                ctx.font = Font(700, nick, image.fn);
                ctx.fillText(Fit(ctx, member.name, room), textLeft, start);

                if (second) {
                    ctx.fillStyle = image.lc;
                    ctx.font = Font(600, nick * 0.76, image.fn);
                    ctx.fillText(Fit(ctx, second, room), textLeft, start + nick * 1.15 + 0.4 * CQW);
                }

                continue;
            }

            const faceX = tile.x + (tile.w - tile.face) / 2;
            const faceY = tile.y + (group.featured ? 2.2 : 1.7) * CQW;

            await DrawFace(ctx, image, tile, faceX, faceY, group.color, avatars.get(member.id) ?? null, member);

            const room = tile.w - 2 * CQW;
            const nameY = faceY + tile.face + 0.8 * CQW;

            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillStyle = image.nc;
            ctx.font = Font(700, nick, image.fn);
            ctx.fillText(Fit(ctx, member.name, room), tile.x + tile.w / 2, nameY);

            if (second) {
                ctx.fillStyle = image.lc;
                ctx.font = Font(600, nameSize * 0.76, image.fn);
                ctx.fillText(Fit(ctx, second, room), tile.x + tile.w / 2, nameY + nick * 1.15 + 0.8 * CQW);
            }
        }
    }

    if (!plan.groups.length) {
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = image.sc;
        ctx.font = Font(600, 1.7 * CQW, image.fn);
        ctx.fillText("NOCH KEINE ROLLE", plan.width / 2, PAD + plan.headHeight + GAP[image.gap]);
    }

    // Fuß
    if (image.showFooter) {
        const y = plan.footY;

        ctx.fillStyle = line;
        ctx.fillRect(PAD, y, plan.width - 2 * PAD, 1);
        ctx.fillStyle = image.sc;
        ctx.font = Font(600, 1.45 * CQW, image.fn);
        ctx.textBaseline = "top";
        ctx.textAlign = "left";
        ctx.fillText(Fit(ctx, fill(image.footer).toLocaleUpperCase("de-DE"), INNER * 0.7), PAD, y + 1.6 * CQW);
        ctx.textAlign = "right";
        ctx.fillText(`#${data.channelName}`.toLocaleUpperCase("de-DE"), plan.width - PAD, y + 1.6 * CQW);
    }

    return canvas.encode("webp", 90);
}
