/**
 * Suche der Leiste auf der Serverseite (W-0055): welche Seiten zu einer
 * Eingabe passen und in welcher Reihenfolge, dazu die rechte Umschalttaste.
 * Ohne DOM, damit npm run check:dashboard es prüfen kann. Das Fenster dazu
 * steht in pages/GuildSearch.ts.
 */

/** page: Übersicht, Module, Moderatoren. off: ein Modul, das aus ist. */
export type NavKind = "page" | "part" | "module" | "list" | "off";

export interface INavEntry {
    section: string;
    href: string;
    name: string;
    kind: NavKind;
    icon: string;
    /** Bei Teilen und Listen: das Modul, zu dem sie gehören. */
    module?: string;
    area?: string;
    /** Die Beschreibung - gefunden wird auch darin. */
    text?: string;
    /** Ein Teil, dessen Modul man nicht sehen darf: Er steht selbst in der Spalte (Moderator mit only). */
    alone?: boolean;
}

const GROUP: Record<NavKind, number> = { page: 0, part: 1, module: 2, list: 3, off: 4 };

/**
 * Klein, ohne Umlaute und Akzente, Satzzeichen zu Leerzeichen: „Größe“ wird
 * „grosse“, „Auto-Mod“ wird „auto mod“. „ue“ wird „u“ wie „ü“, damit
 * „Uebersicht“ „Übersicht“ findet.
 */
export function fold(text: string): string {
    return text
        .toLowerCase()
        .replace(/ä|ae/g, "a")
        .replace(/ö|oe/g, "o")
        .replace(/ü|ue/g, "u")
        .replace(/ß/g, "ss")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

/** 0 Name beginnt damit (oder ein Wort darin), 1 Name enthält es, 2 Modul, Bereich oder Beschreibung, null kein Treffer. */
function rank(entry: INavEntry, query: string): number | null {
    const name = fold(entry.name);

    if (name.startsWith(query) || name.split(" ").some((word) => word.startsWith(query))) return 0;
    if (name.includes(query)) return 1;
    if (fold([entry.module, entry.area, entry.text].filter(Boolean).join(" ")).includes(query)) return 2;

    return null;
}

/**
 * Leere Eingabe: keine Treffer - was dann zu sehen ist, sagt browseNav.
 * Erst nach Art, dann nach Rang: Jede Art steht zusammen unter einem Kopf,
 * Aus steht zuletzt.
 */
export function searchNav(entries: readonly INavEntry[], query: string): INavEntry[] {
    const wanted = fold(query);

    if (!wanted) return [];

    return entries
        .map((entry) => ({ entry, rank: rank(entry, wanted) }))
        .filter((hit): hit is { entry: INavEntry; rank: number } => hit.rank !== null)
        .sort(
            (a, b) =>
                GROUP[a.entry.kind] - GROUP[b.entry.kind] ||
                a.rank - b.rank ||
                a.entry.name.localeCompare(b.entry.name, "de") ||
                (a.entry.module ?? "").localeCompare(b.entry.module ?? "", "de")
        )
        .map((hit) => hit.entry);
}

/** Ohne Eingabe: was in der Spalte des Bereichs steht, also seine Module und allein stehende Teile. */
export function browseNav(entries: readonly INavEntry[], area: string | undefined): INavEntry[] {
    return entries.filter((entry) => (entry.kind === "module" || entry.alone === true) && entry.area === area);
}

/** Unter dem Namen des Bereichs: „3 Module an“, bei allein stehenden Teilen „1 Seite“ dazu. */
export function areaLine(modules: number, alone: number): string {
    return [modules ? `${modules} ${modules === 1 ? "Modul" : "Module"} an` : "", alone ? `${alone} ${alone === 1 ? "Seite" : "Seiten"}` : ""].filter(Boolean).join(" · ");
}

/**
 * Die rechte Umschalttaste kurz drücken öffnet die Suche. Nur sie allein:
 * kommt eine andere Taste dazwischen, war es ein Großbuchstabe. Gehalten,
 * in einem Feld, mit Strg, Alt oder Meta (blocked) oder mit einem Klick
 * dazwischen (Umschalt-Klick, cancel) zählt es auch nicht.
 */
export class ShiftTap {
    private since: number | null = null;

    constructor(private readonly limitMs = 500) {}

    down(code: string, at: number, blocked: boolean): void {
        this.since = code === "ShiftRight" && !blocked ? at : null;
    }

    cancel(): void {
        this.since = null;
    }

    up(code: string, at: number): boolean {
        const since = this.since;

        this.since = null;

        return code === "ShiftRight" && since !== null && at - since <= this.limitMs;
    }
}
