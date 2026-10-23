/**
 * Die Inhalte der Hauptseite, die das Admin Dashboard bearbeitet.
 *
 * Die Formen entsprechen den Interfaces der Webseite (`src/domain/interfaces`
 * und `src/services/Content.ts` dort), nur ohne deren Enums: Kategorien,
 * Status, Symbole und Farben kommen aus `meta.json` der Webseite. Die Grenzen
 * sind aus den heutigen Inhalten abgeleitet, mit Luft nach oben. `npm run
 * check` prüft, dass alle heutigen Inhalte durchgehen.
 */

/** Die drei einzelnen Dokumente. Dazu kommt je Modul ein Detailtext. */
export const CONTENT_DOCS = ["banner", "team", "modules", "categories"] as const;
export type ContentDoc = (typeof CONTENT_DOCS)[number];

/** Jede Datei in `data/site` und jeder Standard der Webseite steckt in dieser Hülle. */
export interface IEnvelope<T> {
    /** 0 heißt: Stand der Webseite, im Admin Dashboard noch nie gespeichert. */
    readonly revision: number;
    readonly updatedAt: string | null;
    /** Anzeigename der Person, die zuletzt gespeichert hat. */
    readonly updatedBy: string | null;
    readonly data: T;
}

/** Die Arten des Banners. Jede hat auf der Webseite eigene Farbe und eigenes Symbol. */
export const BANNER_KINDS = ["info", "update", "event", "wartung", "stoerung"] as const;
export type BannerKind = (typeof BANNER_KINDS)[number];

export const BANNER_KIND_LABELS: Readonly<Record<BannerKind, string>> = {
    info: "Info",
    update: "Update",
    event: "Event",
    wartung: "Wartung",
    stoerung: "Störung",
};

export interface IBanner {
    readonly enabled: boolean;
    readonly kind: BannerKind;
    /** Darf leer sein, dann steht nur der Text da. */
    readonly title: string;
    readonly text: string;
    readonly link?: { readonly href: string; readonly label: string };
    /** ISO. Vorher und nachher zeigt die Webseite den Banner nicht. */
    readonly showFrom?: string;
    readonly showUntil?: string;
    /** ISO. Bis dahin läuft ein Countdown, danach verschwindet er. */
    readonly countdownTo?: string;
}

export type BannerState = "aus" | "sichtbar" | "geplant" | "abgelaufen";

export const BANNER_STATE_LABELS: Readonly<Record<BannerState, string>> = {
    aus: "Aus",
    sichtbar: "Sichtbar",
    geplant: "Geplant",
    abgelaufen: "Abgelaufen",
};

/** Was die Webseite gerade zeigt. Dieselbe Rechnung steht in Content.ts der Webseite. */
export function bannerState(banner: IBanner, now = Date.now()): BannerState {
    if (!banner.enabled) return "aus";
    if (banner.showFrom !== undefined && now < Date.parse(banner.showFrom)) return "geplant";
    if (banner.showUntil !== undefined && now >= Date.parse(banner.showUntil)) return "abgelaufen";

    return "sichtbar";
}

export interface IMemberLink {
    readonly label: string;
    readonly href: string;
    readonly icon: string;
}

export interface IMember {
    readonly name: string;
    readonly handle: string;
    readonly role: string;
    readonly text: string;
    readonly focus: readonly string[];
    readonly accent: string;
    readonly links?: readonly IMemberLink[];
}

export interface IOpenRole {
    readonly title: string;
    readonly text: string;
    readonly icon: string;
}

export interface ITeam {
    readonly members: readonly IMember[];
    readonly openRoles: readonly IOpenRole[];
}

export interface IModuleDefinition {
    readonly id: string;
    readonly name: string;
    readonly tagline: string;
    readonly description: string;
    readonly category: string;
    readonly status: string;
    readonly icon: string;
    readonly highlights: readonly string[];
    readonly commands?: readonly string[];
    readonly featured?: boolean;
    readonly builtIn?: boolean;
}

export interface IModules {
    readonly modules: readonly IModuleDefinition[];
}

export interface IBlock<T> {
    readonly title: string;
    readonly lead: string;
    readonly entries: readonly T[];
}

export interface IConcept {
    readonly label: string;
    readonly text: string;
    readonly color: string;
}

export interface IFeature {
    readonly title: string;
    readonly text: string;
    readonly icon: string;
}

export interface IStep {
    readonly title: string;
    readonly text: string;
}

export interface IPart {
    readonly name: string;
    readonly text: string;
}

export interface IModuleDetail {
    readonly intro: readonly string[];
    readonly concepts?: IBlock<IConcept>;
    readonly automations?: IBlock<IFeature>;
    readonly setup?: IBlock<IStep>;
    readonly parts?: readonly IPart[];
    readonly showcase?: string;
}

/** Was ein Inhalt enthalten darf, aus `meta.json` der Webseite. */
export interface IContentMeta {
    readonly categories: readonly { readonly id: string; readonly label: string; readonly accent: string }[];
    readonly statuses: readonly { readonly id: string; readonly label: string }[];
    /** Jedes Symbol als SVG-Markup mit `currentColor`. Angezeigt nur als `<img>`. */
    readonly icons: readonly { readonly name: string; readonly svg: string }[];
    /** Jede Farbe `--c-*` der Webseite mit ihrem Wert. */
    readonly colors: readonly { readonly token: string; readonly value: string }[];
    readonly showcases: readonly string[];
}

/** Die ID steckt in der Adresse der Detailseite: Kleinbuchstabe vorn, dann Kleinbuchstaben, Ziffern, Bindestriche. */
export const MODULE_ID = /^[a-z][a-z0-9-]*$/;

/** Ein Slash-Command ohne Schrägstrich, mit bis zu zwei Unterbefehlen: „rank me“, „ticket setup“. */
export const COMMAND_NAME = /^[\p{Ll}\p{N}_-]+(?: [\p{Ll}\p{N}_-]+){0,2}$/u;

/** Die Grenzen. In Klammern der längste heutige Wert. */
export const CONTENT_LIMITS = {
    banner: { title: 60, text: 200, linkLabel: 40, href: 190 },
    team: {
        members: 20, // (2)
        name: 40, // (7)
        handle: 40, // (8)
        role: 60, // (14)
        text: 500, // (256)
        focus: 8, // (4)
        focusEntry: 40, // (12)
        links: 5, // (1)
        linkLabel: 40, // (14)
        href: 190, // (29)
        openRoles: 10, // (2)
        roleTitle: 60, // (17)
        roleText: 300, // (119)
    },
    categories: {
        count: 12, // (6)
        id: 40,
        label: { min: 2, max: 30 },
        description: 200, // (86)
    },
    modules: {
        count: 60, // (23)
        id: 40, // (16)
        name: 40, // (17)
        tagline: 140, // (64)
        description: 600, // (300)
        highlights: 10, // (6)
        highlight: 160, // (86)
        commands: 30, // (12)
        command: 32, // (18)
    },
    detail: {
        intro: 6, // (3)
        paragraph: 700, // (382)
        blockTitle: 80, // (32)
        blockLead: 240, // (93)
        entries: 12, // (7)
        entryTitle: 80, // (41)
        entryText: 400, // (212)
        conceptLabel: 60, // (35)
        conceptText: 300, // (152)
        parts: 8, // (3)
        partName: 60, // (14)
        partText: 300, // (96)
    },
} as const;

/** Ein Command, wie man ihn in Discord tippt, etwa „rank me“, mit seiner Beschreibung. */
export interface ICommandPath {
    readonly path: string;
    readonly description: string;
}

/** commands.json: die Commands je Modul, wie der Bot sie meldet. Schreibt nur der Abgleich. */
export interface ICommandsContent {
    readonly updatedAt: string;
    readonly modules: Readonly<Record<string, readonly ICommandPath[]>>;
}

/** Eine Kategorie der Module. `color`: Hex (#rrggbb) oder eine Farbe der Webseite (var(--c-…)). */
export interface ICategory {
    readonly id: string;
    readonly label: string;
    readonly color: string;
    readonly description?: string;
}

/** categories.json */
export interface ICategories {
    readonly categories: readonly ICategory[];
}
