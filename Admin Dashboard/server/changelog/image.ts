import path from "node:path";
import { createCanvas, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { AREA_LABELS, CHANGE_AREAS, KIND_LABELS, postableItems, stampKind, type ChangeArea, type ChangeKind, type IChangeItem, type IVersionInput } from "../../shared/changelog.ts";
import { fit, registerFonts } from "../status/image.ts";
import { stamp } from "../userdata/dm.ts";

/**
 * Eine Version als Bild für Discord (W-0061, Entwurf D2 in
 * w0061-changelog-v2.html): Stil der Lösch-DMs, Kacheln je Art. Gezeichnet auf
 * 900 logischen Pixeln, ausgegeben als 1100 × höchstens 580 wie die
 * Hilfe-Bilder im Bot, damit Discord es groß zeigt. Intern kommt nie hinein.
 */

type Kind = Exclude<ChangeKind, "intern">;

const ASSETS = path.join(import.meta.dirname, "..", "assets");
const KINDS: readonly Kind[] = ["neu", "verbessert", "behoben"];

const W = 900;
const SCALE = 1100 / W;
const MAX_HEIGHT = Math.floor(580 / SCALE);
const PAD = 30;
const HEAD = 128;
const TILE_TOP = 34;
const ROW = 24;
const TILE_BOTTOM = 8;
const GAP = 10;
const MORE = 26;
const FOOT = 34;

const BG = "#2b2d31";
const TILE = "#232428";
const TEXT = "#f2f3f5";
const SUB = "#c4c9d0";
const DIM = "#b5bac1";
const BRAND = "#ff1e2d";
const KIND_COLOR: Readonly<Record<Kind, string>> = { neu: "#35e07f", verbessert: "#b48cff", behoben: "#00afff" };
const AREA_COLOR: Readonly<Record<ChangeArea, string>> = { bot: "#ff1e2d", dashboard: "#ff8a3d", admin: "#8a4dff", webseite: "#00afff" };

export interface IChangelogFooter {
    readonly poster: string;
    /** JJJJ-MM-TT, wenn der Post nach dem Posten geändert wurde. */
    readonly editedOn: string | null;
}

export interface IChangelogTile {
    readonly kind: Kind;
    /** Alle Zeilen dieser Art, auch die nicht gezeichneten. */
    readonly total: number;
    readonly items: readonly IChangeItem[];
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

const day = (iso: string): string => new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));
const tileHeight = (rows: number): number => TILE_TOP + rows * ROW + TILE_BOTTOM;

function groupsOf(version: IVersionInput): Record<Kind, IChangeItem[]> {
    const items = postableItems(version.items);

    return { neu: items.filter((entry) => entry.kind === "neu"), verbessert: items.filter((entry) => entry.kind === "verbessert"), behoben: items.filter((entry) => entry.kind === "behoben") };
}

/** „4 Änderungen · Bot, Admin · 9. November 2026“ */
function summary(version: IVersionInput): string {
    const items = postableItems(version.items);
    const areas = CHANGE_AREAS.filter((area) => items.some((entry) => entry.area === area)).map((area) => AREA_LABELS[area]);

    return [`${items.length} ${items.length === 1 ? "Änderung" : "Änderungen"}`, ...(areas.length ? [areas.join(", ")] : []), day(version.releasedOn)].join(" · ");
}

/**
 * Welche Zeilen ins Bild passen und wo die Kacheln liegen. Passt nicht alles,
 * bekommt jede Art erst eine Zeile, dann reihum je eine weitere, solange das
 * Bild mit „+ N weitere“ höchstens 580 Pixel hoch bleibt.
 */
export function layoutRows(version: IVersionInput): { readonly tiles: readonly IChangelogTile[]; readonly hidden: number; readonly height: number } {
    const groups = groupsOf(version);
    const present = KINDS.filter((kind) => groups[kind].length > 0);
    const pair = present.filter((kind) => kind !== "neu");
    const heightOf = (shown: Readonly<Record<Kind, number>>, more: boolean): number => {
        const top = groups.neu.length ? tileHeight(shown.neu) + (pair.length ? GAP : 0) : 0;
        const bottom = pair.length ? Math.max(...pair.map((kind) => tileHeight(shown[kind]))) : 0;

        return HEAD + top + bottom + (more ? MORE : 0) + FOOT;
    };

    let shown: Record<Kind, number> = { neu: groups.neu.length, verbessert: groups.verbessert.length, behoben: groups.behoben.length };

    if (heightOf(shown, false) > MAX_HEIGHT) {
        shown = { neu: Math.min(1, groups.neu.length), verbessert: Math.min(1, groups.verbessert.length), behoben: Math.min(1, groups.behoben.length) };

        const open = new Set(present);

        while (open.size > 0) {
            for (const kind of KINDS) {
                if (!open.has(kind)) continue;

                const next = { ...shown, [kind]: shown[kind] + 1 };
                if (next[kind] > groups[kind].length || heightOf(next, true) > MAX_HEIGHT) open.delete(kind);
                else shown = next;
            }
        }
    }

    const tiles: IChangelogTile[] = [];
    const tile = (kind: Kind, x: number, y: number, width: number, height: number): void => {
        tiles.push({ kind, total: groups[kind].length, items: groups[kind].slice(0, shown[kind]), x, y, width, height });
    };
    let y = HEAD;

    if (groups.neu.length) {
        tile("neu", PAD, y, W - 2 * PAD, tileHeight(shown.neu));
        y += tileHeight(shown.neu) + (pair.length ? GAP : 0);
    }

    if (pair.length) {
        const height = Math.max(...pair.map((kind) => tileHeight(shown[kind])));
        const width = pair.length === 2 ? (W - 2 * PAD - GAP) / 2 : W - 2 * PAD;

        pair.forEach((kind, index) => tile(kind, PAD + index * (width + GAP), y, width, height));
    }

    const hidden = postableItems(version.items).length - KINDS.reduce((sum, kind) => sum + shown[kind], 0);

    return { tiles, hidden, height: heightOf(shown, hidden > 0) };
}

/** Version, Titel und jede Zeile außer Intern; höchstens 1024 Zeichen, mehr nimmt Discord nicht. */
export function changelogAlt(version: IVersionInput, footer: IChangelogFooter): string {
    const groups = groupsOf(version);
    const kinds = KINDS.filter((kind) => groups[kind].length > 0).map((kind) => `${KIND_LABELS[kind]}: ${groups[kind].map((entry) => (entry.task ? `${entry.text} (${entry.task})` : entry.text)).join("; ")}.`);
    const by = footer.editedOn ? `Bearbeitet am ${day(footer.editedOn)}.` : `Von ${footer.poster}.`;
    const text = [`Changelog ${version.version}: ${version.title}.`, `${summary(version)}.`, ...kinds, by].join(" ");

    return text.length <= 1024 ? text : `${text.slice(0, 1023).replace(/[\uD800-\uDBFF]$/, "")}…`;
}

let logo: Promise<Image> | null = null;

function row(ctx: SKRSContext2D, entry: IChangeItem, x: number, baseline: number, width: number): void {
    ctx.fillStyle = AREA_COLOR[entry.area];
    ctx.fillRect(x, baseline - 10, 8, 8);

    let room = width - 18;

    if (entry.task) {
        ctx.font = "600 13px Rajdhani";
        ctx.fillStyle = DIM;
        ctx.textAlign = "right";
        ctx.fillText(entry.task, x + width, baseline);
        room -= ctx.measureText(entry.task).width + 12;
    }

    ctx.font = "600 16px Rajdhani";
    ctx.fillStyle = TEXT;
    ctx.textAlign = "left";
    ctx.fillText(fit(ctx, entry.text, room), x + 18, baseline);
}

export async function renderChangelogImage(version: IVersionInput, footer: IChangelogFooter): Promise<{ readonly name: "changelog.png"; readonly data: Buffer; readonly alt: string }> {
    registerFonts();

    const layout = layoutRows(version);
    const canvas = createCanvas(Math.round(W * SCALE), Math.round(layout.height * SCALE));
    const ctx = canvas.getContext("2d");

    ctx.scale(SCALE, SCALE);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, layout.height);
    ctx.fillStyle = BRAND;
    ctx.fillRect(0, 0, W, 6);

    // Logo, Version, Titel, Kurzzeile.
    logo ??= loadImage(path.join(ASSETS, "status-logo.webp"));
    ctx.save();
    ctx.beginPath();
    ctx.arc(PAD + 29, 30 + 29, 29, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(await logo, PAD, 30, 58, 58);
    ctx.restore();

    const textX = PAD + 76;
    const textWidth = 640 - textX;

    ctx.textAlign = "left";
    ctx.font = "800 36px Oxanium";
    ctx.fillStyle = TEXT;
    ctx.fillText(fit(ctx, version.version, textWidth), textX, 60);
    ctx.font = "800 20px Oxanium";
    ctx.fillText(fit(ctx, version.title, textWidth), textX, 88);
    ctx.font = "600 16px Rajdhani";
    ctx.fillStyle = SUB;
    ctx.fillText(fit(ctx, summary(version), textWidth), textX, 110);

    const main = stampKind(version.items);

    if (main) {
        // stamp() zeichnet für die 800 breiten DMs, hier 100 weiter rechts.
        ctx.save();
        ctx.translate(W - 800, -6);
        stamp(ctx, KIND_LABELS[main].toUpperCase(), KIND_COLOR[main]);
        ctx.restore();
    }

    for (const tile of layout.tiles) {
        ctx.fillStyle = TILE;
        ctx.beginPath();
        ctx.roundRect(tile.x, tile.y, tile.width, tile.height, 8);
        ctx.fill();
        ctx.font = "700 14px Rajdhani";
        ctx.fillStyle = KIND_COLOR[tile.kind];
        ctx.textAlign = "left";
        ctx.fillText(`${KIND_LABELS[tile.kind].toUpperCase()} · ${tile.total}`, tile.x + 14, tile.y + 24);
        tile.items.forEach((entry, index) => row(ctx, entry, tile.x + 14, tile.y + TILE_TOP + 17 + index * ROW, tile.width - 28));
    }

    ctx.textAlign = "left";
    ctx.font = "600 15px Rajdhani";

    if (layout.hidden > 0) {
        ctx.fillStyle = SUB;
        ctx.fillText(`+ ${layout.hidden} weitere im Admin Dashboard`, PAD, layout.height - FOOT - 6);
    }

    ctx.font = "600 14px Rajdhani";
    ctx.fillStyle = DIM;
    ctx.fillText("RL Nexus · Changelog", PAD, layout.height - 14);
    ctx.textAlign = "right";
    ctx.fillText(fit(ctx, footer.editedOn ? `bearbeitet am ${day(footer.editedOn)}` : `von ${footer.poster}`, 400), W - PAD, layout.height - 14);

    return { name: "changelog.png", data: canvas.toBuffer("image/png"), alt: changelogAlt(version, footer) };
}
