/* ----------------------------------------------------------
   Level System, Plan 35: der Designer - siehe docs/Levels.md
   ---------------------------------------------------------- */

/** Level-Karte (/level rang) oder Aufstiegs-Bild. */
export type DesignKind = "card" | "up";
export type DesignFont = "Oxanium" | "Orbitron" | "Rajdhani";
export type DesignElementType = IDesignElement["type"];

interface IDesignBase {
    id: string;
    /** Wie die Ebene im Dashboard heißt. */
    name: string;
    hidden: boolean;
    x: number;
    y: number;
    /** 0 bis 1. */
    opacity: number;
}

/** x ist je nach Ausrichtung die linke Kante, die Mitte oder die rechte Kante, y die Oberkante. */
export interface ITextElement extends IDesignBase {
    type: "text";
    /** Mit Platzhaltern. */
    text: string;
    font: DesignFont;
    size: number;
    weight: 400 | 600 | 700 | 800;
    color: string;
    align: "left" | "center" | "right";
    /** Breiter wird der Text nie: erst kleiner, dann „…“. */
    maxWidth: number;
}

/** Ein Bild aus der Galerie, füllend beschnitten. */
export interface IImageElement extends IDesignBase {
    type: "image";
    source: string;
    w: number;
    h: number;
    radius: number;
}

/** bevel: alle vier Ecken abgeschrägt; slant: rechte Kante schräg (unten um cut eingerückt); line: von oben links nach unten rechts. */
export interface IShapeElement extends IDesignBase {
    type: "shape";
    shape: "rect" | "bevel" | "slant" | "circle" | "line";
    w: number;
    h: number;
    fill: string | null;
    stroke: string | null;
    strokeWidth: number;
    cut: number;
}

export interface IAvatarElement extends IDesignBase {
    type: "avatar";
    size: number;
    shape: "circle" | "bevel";
    /** Ringstärke, 0: kein Ring. */
    ring: number;
    ringColor: string;
}

/** Der Fortschritt im aktuellen Level. */
export interface IBarElement extends IDesignBase {
    type: "bar";
    w: number;
    h: number;
    style: "solid" | "segments";
    segments: number;
    corner: "round" | "bevel";
    from: string;
    to: string;
    track: string;
}

/** Ein Ring, der sich mit dem Fortschritt füllt, innen eine kleine Zeile und groß ein Wert. */
export interface IRingElement extends IDesignBase {
    type: "ring";
    size: number;
    thickness: number;
    color: string;
    track: string;
    inner: string | null;
    label: string;
    value: string;
    font: DesignFont;
    textColor: string;
}

export interface IIconElement extends IDesignBase {
    type: "icon";
    size: number;
    shape: "circle" | "bevel" | "square";
}

export type IDesignElement = ITextElement | IImageElement | IShapeElement | IAvatarElement | IBarElement | IRingElement | IIconElement;

/**
 * Bild aus der Galerie mit Abdunkeln (0 bis 90 %), eine Farbe oder ein Verlauf
 * von oben links (color) nach unten rechts (to). Plan 36: Die Form ist der
 * Umriss des ganzen Bilds - außerhalb bleibt es durchsichtig -, mit Rand.
 */
export interface IDesignBackground {
    mode: "image" | "color" | "gradient";
    image: string | null;
    dim: number;
    color: string;
    to: string;
    shape: "rect" | "bevel" | "round";
    /** Größe der Ecke bei abgeschrägt und abgerundet, 0 bis 60. */
    cut: number;
    border: string | null;
    borderWidth: number;
}

export interface ICardDesign {
    kind: DesignKind;
    /** Die Vorlage, aus der das Design stammt - nur fürs Hervorheben im Dashboard. */
    template: string;
    background: IDesignBackground;
    /** Erster Eintrag ganz hinten. */
    elements: IDesignElement[];
}

/** Die Einstellungen des Ranglisten-Bilds - kein Baukasten, die Zeilen wiederholen sich. */
export interface IBoardStyle {
    image: string | null;
    dim: number;
    accent: string;
    /** Platz 1, 2 und 3. */
    medals: [string, string, string];
    font: DesignFont;
    /** Mit {guild}, {period}, {range}. */
    title: string;
    subtitle: string;
    podium: boolean;
}

/* ----------------------------------------------------------
   Plan 38: das Ranglisten-Bild im Baukasten
   ---------------------------------------------------------- */

/** Kopf, Podium (Platz 1–3, ein Muster), Zeile (ein Muster für alle weiteren Plätze), Fuß. */
export type BoardArea = "head" | "podium" | "row" | "foot";

/**
 * Farben in der Rangliste dürfen neben #rrggbb auch eine Bedeutung haben:
 * "accent" überall, "medal" und "trend" nur im Podium und in der Zeile.
 */
export type BoardColorKeyword = "accent" | "medal" | "trend";

/** Die Fläche hinter jedem Podiumsplatz bzw. jeder Zeile. fill darf eine Bedeutung haben. */
export interface IBoardFill {
    fill: string | null;
    /** 0 bis 100. */
    fillOpacity: number;
    shape: "rect" | "bevel" | "round";
    cut: number;
}

export interface IBoardFree {
    /** Höhe des Bereichs. */
    h: number;
    elements: IDesignElement[];
}

export interface IBoardPodium extends IBoardFill {
    on: boolean;
    /** Höhe des ganzen Bereichs - Plätze, die tiefer stehen, werden unten abgeschnitten. */
    h: number;
    /** Breite und Höhe eines Platzes - das Muster. */
    w: number;
    slotH: number;
    gap: number;
    /** Wie weit Platz 1, 2 und 3 nach unten versetzt sind - eine Treppe. */
    offsets: [number, number, number];
    elements: IDesignElement[];
}

export interface IBoardRow extends IBoardFill {
    /** Linke Kante der ersten Spalte, Breite und Höhe einer Zeile. */
    x: number;
    w: number;
    h: number;
    gap: number;
    columns: 1 | 2;
    /** Rand der eigenen Zeile bzw. des eigenen Podiumsplatzes. null: nicht hervorheben. */
    highlight: string | null;
    elements: IDesignElement[];
}

export interface IBoardDesign {
    kind: "board";
    template: string;
    background: IDesignBackground;
    accent: string;
    medals: [string, string, string];
    /** Schein in der Akzentfarbe oben rechts, wie das bisherige Bild. */
    glow: boolean;
    /** {title} - mit {guild}, {period}, {range}. */
    title: string;
    perPage: 10 | 20;
    head: IBoardFree;
    podium: IBoardPodium;
    row: IBoardRow;
    foot: IBoardFree;
}

/** Was die Bühne im Dashboard je Baustein greift - in logischen Pixeln. */
export interface IDesignBox {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
}
