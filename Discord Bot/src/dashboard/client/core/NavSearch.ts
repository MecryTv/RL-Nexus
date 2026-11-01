/**
 * Suche der Leiste auf der Serverseite (W-0055): welche Seiten zu einer
 * Eingabe passen und in welcher Reihenfolge, dazu die rechte Umschalttaste.
 * Ohne DOM, damit npm run check:dashboard es prüfen kann. Das Fenster dazu
 * steht in layout/NavSearch.ts.
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
}

const GROUP: Record<NavKind, number> = { page: 0, part: 1, module: 2, list: 3, off: 4 };

/** Klein, ohne Umlaute und Akzente: „Größe“ wird „grosse“. */
export function fold(text: string): string {
    return text
        .toLowerCase()
        .replace(/ä/g, "a")
        .replace(/ö/g, "o")
        .replace(/ü/g, "u")
        .replace(/ß/g, "ss")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "");
}

/** 0 Name beginnt damit (oder ein Wort darin), 1 Name enthält es, 2 Modul, Bereich oder Beschreibung, null kein Treffer. */
function rank(entry: INavEntry, query: string): number | null {
    const name = fold(entry.name);

    if (name.startsWith(query) || name.split(/[^a-z0-9]+/).some((word) => word.startsWith(query))) return 0;
    if (name.includes(query)) return 1;
    if (fold([entry.module, entry.area, entry.text].filter(Boolean).join(" ")).includes(query)) return 2;

    return null;
}

/** Leere Eingabe: keine Treffer - was dann zu sehen ist, entscheidet das Fenster. */
export function searchNav(entries: readonly INavEntry[], query: string): INavEntry[] {
    const wanted = fold(query.trim());

    if (!wanted) return [];

    return entries
        .map((entry) => ({ entry, rank: rank(entry, wanted) }))
        .filter((hit): hit is { entry: INavEntry; rank: number } => hit.rank !== null)
        .sort(
            (a, b) =>
                Number(a.entry.kind === "off") - Number(b.entry.kind === "off") ||
                a.rank - b.rank ||
                GROUP[a.entry.kind] - GROUP[b.entry.kind] ||
                a.entry.name.localeCompare(b.entry.name, "de") ||
                (a.entry.module ?? "").localeCompare(b.entry.module ?? "", "de")
        )
        .map((hit) => hit.entry);
}

/**
 * Die rechte Umschalttaste kurz drücken öffnet die Suche. Nur sie allein:
 * kommt eine andere Taste dazwischen, war es ein Großbuchstabe. Gehalten
 * oder in einem Feld zählt es auch nicht.
 */
export class ShiftTap {
    private since: number | null = null;

    constructor(private readonly limitMs = 500) {}

    down(code: string, at: number, editable: boolean): void {
        this.since = code === "ShiftRight" && !editable ? at : null;
    }

    up(code: string, at: number): boolean {
        const since = this.since;

        this.since = null;

        return code === "ShiftRight" && since !== null && at - since <= this.limitMs;
    }
}
