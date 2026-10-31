/**
 * Rollen-Listen (Plan 29): Listen, die zeigen, wer welche Rolle hat – als
 * Text-Karte oder als gezeichnetes Bild. Grenzen, Vorlagen und Standardwerte.
 * Ohne Imports: das Dashboard bündelt die Datei mit. Siehe docs/RoleLists.md.
 */

export const ROLE_LISTS_MODULE = "role-lists";

export const MAX_LISTS = 10;
export const MAX_ROLES = 20;
export const MAX_PRESETS = 10;
export const MAX_TITLE = 40;
/** Titel je Liste: 20 Rollen mit vielen Leuten, aber nicht beliebig viele. */
export const MAX_TITLES = 500;
export const MAX_LABEL = 40;
export const MAX_NAME = 40;
export const MAX_HEADING = 80;
export const MAX_SUB = 80;
export const MAX_LEAD = 300;
export const MAX_BUTTON = 40;
export const MAX_IMAGE_PEOPLE = 120;
/** Gebündelt: höchstens einmal pro Minute je Liste nachziehen. */
export const REFRESH_DELAY_MS = 60_000;
/** So lange bleibt ein Titel stehen, nachdem die Person zuletzt eine Rolle der Liste hatte. */
export const TITLE_KEEP_DAYS = 30;
/** Breite des Bildes, gezeichnet wird doppelt so fein. */
export const CARD_WIDTH = 1200;
export const CARD_SCALE = 2;

export type RoleListDesign = "compact" | "sections" | "board";

export type RoleIcon = { kind: "emoji"; value: string } | { kind: "server"; id: string } | { kind: "gallery"; id: string } | { kind: "role" } | null;

export interface IRoleEntry {
    roleId: string;
    /** Name in der Liste – darf anders heißen als die Rolle. */
    label: string;
    icon: RoleIcon;
}

export type RoleListFont = "Orbitron" | "Oxanium" | "Rajdhani";
export type RoleListSize = "s" | "m" | "l";
export type RoleListMotif = "arena" | "nexus" | "spotlight" | "carbon" | "grid" | "aurora";

/** Alles, was das Bild ausmacht – dieselben Namen wie im Entwurf v5. */
export interface IRoleListImage {
    preset: string;
    layout: "grid" | "list" | "columns" | "pyramid";
    cols: number;
    align: "left" | "center";
    featured: boolean;
    gap: "tight" | "normal" | "wide";
    bg: "motif" | "image" | "gradient" | "solid";
    motif: RoleListMotif;
    /** Galerie-ID – nie eine Adresse. */
    image: string | null;
    fx: number;
    fy: number;
    zoom: number;
    c1: string;
    c2: string;
    angle: number;
    dimc: string;
    dim: number;
    blur: number;
    pattern: "none" | "raster" | "diagonal" | "dots";
    accent: "role" | "own";
    accentColor: string;
    tc: string;
    sc: string;
    headMode: "own" | "accent";
    headColor: string;
    nc: string;
    lc: string;
    lineColor: string;
    tile: "glass" | "solid" | "topline" | "outline" | "none";
    tileColor: string;
    tileAlpha: number;
    tint: number;
    borderMode: "accent" | "own";
    borderColor: string;
    bw: number;
    radius: number;
    shape: "round" | "rounded" | "square";
    size: RoleListSize;
    ring: "role" | "glow" | "none";
    glow: number;
    ft: RoleListFont;
    fn: RoleListFont;
    tsize: RoleListSize;
    nsize: RoleListSize;
    upper: boolean;
    logo: boolean;
    logoShape: "rounded" | "round" | "square";
    sub: string;
    total: boolean;
    headAlign: "left" | "center";
    headStyle: "bar" | "pill" | "line" | "plain";
    showIcon: boolean;
    showCount: boolean;
    line2: "handle" | "title" | "joined" | "role" | "none";
    showFooter: boolean;
    footer: string;
}

export interface IRoleListButton {
    on: boolean;
    label: string;
    to: "channel" | "url";
    channelId: string | null;
    url: string | null;
}

export interface IRoleListSettings {
    roles: IRoleEntry[];
    /** Discord-ID → Titel; seen: zuletzt mit einer Rolle der Liste gesehen (ms). */
    titles: Record<string, { title: string; seen: number }>;
    once: boolean;
    hideEmpty: boolean;
    counts: boolean;
    as: "mention" | "name";
    sort: "abc" | "joined";
    heading: string;
    lead: string;
    thumb: "icon" | "none";
    button: IRoleListButton;
    stamp: boolean;
    image: IRoleListImage;
}

/** Die erlaubten Werte je Feld – zum Säubern im Bot und für die Auswahlen im Dashboard. */
export const IMAGE_CHOICES = {
    layout: ["grid", "list", "columns", "pyramid"],
    align: ["left", "center"],
    gap: ["tight", "normal", "wide"],
    bg: ["motif", "image", "gradient", "solid"],
    motif: ["arena", "nexus", "spotlight", "carbon", "grid", "aurora"],
    pattern: ["none", "raster", "diagonal", "dots"],
    accent: ["role", "own"],
    headMode: ["own", "accent"],
    tile: ["glass", "solid", "topline", "outline", "none"],
    borderMode: ["accent", "own"],
    shape: ["round", "rounded", "square"],
    size: ["s", "m", "l"],
    ring: ["role", "glow", "none"],
    ft: ["Orbitron", "Oxanium", "Rajdhani"],
    fn: ["Orbitron", "Oxanium", "Rajdhani"],
    tsize: ["s", "m", "l"],
    nsize: ["s", "m", "l"],
    logoShape: ["rounded", "round", "square"],
    headAlign: ["left", "center"],
    headStyle: ["bar", "pill", "line", "plain"],
    line2: ["handle", "title", "joined", "role", "none"],
} as const;

/** Zahlen: [kleinster, größter Wert]. */
export const IMAGE_RANGES = {
    cols: [3, 8],
    fx: [0, 100],
    fy: [0, 100],
    zoom: [100, 250],
    angle: [0, 360],
    dim: [0, 95],
    blur: [0, 12],
    tileAlpha: [0, 100],
    tint: [0, 50],
    bw: [0, 4],
    radius: [0, 24],
    glow: [0, 100],
} as const;

export const IMAGE_COLORS = ["c1", "c2", "dimc", "accentColor", "tc", "sc", "headColor", "nc", "lc", "lineColor", "tileColor", "borderColor"] as const;
export const IMAGE_SWITCHES = ["featured", "logo", "total", "showIcon", "showCount", "upper", "showFooter"] as const;

const BASE_IMAGE: IRoleListImage = {
    preset: "esports",
    layout: "grid",
    cols: 5,
    align: "left",
    featured: true,
    gap: "normal",
    bg: "motif",
    motif: "arena",
    image: null,
    fx: 50,
    fy: 50,
    zoom: 100,
    c1: "#0b1118",
    c2: "#2a0b12",
    angle: 150,
    dimc: "#05080c",
    dim: 55,
    blur: 0,
    pattern: "none",
    accent: "role",
    accentColor: "#ff1e2d",
    tc: "#ffffff",
    sc: "#93a3b5",
    headMode: "own",
    headColor: "#ffffff",
    nc: "#ffffff",
    lc: "#93a3b5",
    lineColor: "#ffffff",
    tile: "glass",
    tileColor: "#ffffff",
    tileAlpha: 4,
    tint: 14,
    borderMode: "accent",
    borderColor: "#2a3644",
    bw: 1,
    radius: 0,
    shape: "round",
    size: "m",
    ring: "role",
    glow: 40,
    ft: "Orbitron",
    fn: "Rajdhani",
    tsize: "m",
    nsize: "m",
    upper: true,
    logo: true,
    logoShape: "rounded",
    sub: "{server} · {anzahl} Mitglieder",
    total: true,
    headAlign: "left",
    headStyle: "bar",
    showIcon: true,
    showCount: true,
    line2: "handle",
    showFooter: true,
    footer: "Stand {stand}",
};

export type ImagePresetKey = "esports" | "neon" | "clean" | "columns" | "pyramid" | "gold";

/** Die fertigen Looks aus dem Entwurf v5. Eine Vorlage setzt nur, was vom Standard abweicht. */
export const IMAGE_PRESETS: Record<ImagePresetKey, { label: string; set: Partial<IRoleListImage> }> = {
    esports: { label: "Esports", set: {} },
    neon: {
        label: "Neon",
        set: { bg: "gradient", c1: "#0a0620", c2: "#001a2e", angle: 135, dim: 10, pattern: "raster", ring: "glow", glow: 85, tile: "outline", headStyle: "pill", ft: "Oxanium", fn: "Oxanium", accent: "own", accentColor: "#00e5ff", radius: 10, lc: "#7fe9ff", sc: "#7fa8c9" },
    },
    clean: {
        label: "Schlicht",
        set: { bg: "solid", c1: "#11161d", dim: 0, ring: "none", glow: 0, tile: "solid", tileColor: "#1a222c", tileAlpha: 100, tint: 0, headStyle: "line", ft: "Rajdhani", fn: "Rajdhani", shape: "rounded", featured: false, total: false, radius: 8, borderMode: "own", borderColor: "#263140", upper: false },
    },
    columns: {
        label: "Spalten",
        set: { layout: "columns", bg: "motif", motif: "nexus", fy: 40, dim: 65, tile: "none", headStyle: "plain", headMode: "accent", headAlign: "center", line2: "title", size: "s" },
    },
    pyramid: {
        label: "Hierarchie",
        set: { layout: "pyramid", align: "center", headAlign: "center", dim: 60, pattern: "diagonal", ring: "glow", glow: 60, line2: "title", accent: "own", accentColor: "#ffc53d", tc: "#ffe7a3", tile: "topline", tileColor: "#0b1118", tileAlpha: 70 },
    },
    gold: {
        label: "Gold",
        set: { bg: "gradient", c1: "#1b1408", c2: "#070605", angle: 160, dim: 0, pattern: "dots", accent: "own", accentColor: "#e8b04a", tc: "#f6dfa6", headMode: "accent", ring: "role", tile: "solid", tileColor: "#000000", tileAlpha: 35, borderMode: "accent", radius: 6, ft: "Oxanium", fn: "Rajdhani" },
    },
};

export function ImagePreset(key: string): IRoleListImage {
    const known = (Object.keys(IMAGE_PRESETS) as ImagePresetKey[]).includes(key as ImagePresetKey) ? (key as ImagePresetKey) : "esports";

    return { ...BASE_IMAGE, ...IMAGE_PRESETS[known].set, preset: known };
}

export const MOTIFS: Record<RoleListMotif, string> = {
    arena: "Arena",
    nexus: "Nexus-Banner",
    spotlight: "Scheinwerfer",
    carbon: "Carbon",
    grid: "Neon-Raster",
    aurora: "Polarlicht",
};

export const DESIGN_LABELS: Record<RoleListDesign, string> = {
    compact: "Kompakt",
    sections: "Mit Abschnitten",
    board: "Als Bild",
};

export type ListTemplateKey = "empty" | "staff" | "teams";

/** Vorlagen für „Neue Liste“: Rollen werden über den Namen gesucht, angelegt wird nichts. */
export const LIST_TEMPLATES: Record<ListTemplateKey, { label: string; heading: string; lead: string; button: string; match: { pattern: RegExp; label: string | null; emoji: string }[] }> = {
    empty: { label: "Leer", heading: "", lead: "", button: "", match: [] },
    staff: {
        label: "Staff",
        heading: "Unser Staff",
        lead: "Fragen, Probleme, Ideen? Diese Leute helfen dir weiter.",
        button: "Ticket öffnen",
        match: [
            { pattern: /owner|inhaber|leitung/i, label: "Leitung", emoji: "👑" },
            { pattern: /admin/i, label: "Admins", emoji: "🛠️" },
            { pattern: /^mod|moderat/i, label: "Moderation", emoji: "🛡️" },
            { pattern: /support/i, label: "Support", emoji: "💬" },
            { pattern: /trial/i, label: "Neu im Team", emoji: "🌱" },
        ],
    },
    teams: {
        label: "Teams",
        heading: "Unsere Spieler",
        lead: "Wer für uns aufläuft – {anzahl} Leute.",
        button: "Bei uns bewerben",
        // label null: der Name der Rolle
        match: [{ pattern: /team|main|academy/i, label: null, emoji: "🥇" }],
    },
};

export function DefaultListSettings(): IRoleListSettings {
    return {
        roles: [],
        titles: {},
        once: true,
        hideEmpty: false,
        counts: true,
        as: "mention",
        sort: "abc",
        heading: "",
        lead: "",
        thumb: "icon",
        button: { on: false, label: "", to: "channel", channelId: null, url: null },
        stamp: true,
        image: ImagePreset("esports"),
    };
}
