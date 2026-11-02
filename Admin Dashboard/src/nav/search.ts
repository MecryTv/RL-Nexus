/**
 * Suche der Leiste (W-0053): welche Seiten zu einer Eingabe passen und in
 * welcher Reihenfolge, dazu die rechte Umschalttaste. Übernommen aus dem
 * Bot-Dashboard (`Discord Bot/src/dashboard/client/core/NavSearch.ts`), hier
 * nur für Seiten. Ohne DOM, damit npm run check es prüfen kann.
 */

export interface INavEntry {
    readonly href: string;
    readonly name: string;
    readonly icon: string;
    /** Name des Bereichs, gefunden wird auch darin. */
    readonly area: string;
    /** Die Beschreibung der Seite, gefunden wird auch darin. */
    readonly text: string;
}

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

/** 0 Name beginnt damit (oder ein Wort darin), 1 Name enthält es, 2 Bereich oder Beschreibung, null kein Treffer. */
function rank(entry: INavEntry, query: string): number | null {
    const name = fold(entry.name);

    if (name.startsWith(query) || name.split(/[^a-z0-9]+/).some((word) => word.startsWith(query))) return 0;
    if (name.includes(query)) return 1;
    if (fold(`${entry.area} ${entry.text}`).includes(query)) return 2;

    return null;
}

/** Leere Eingabe: keine Treffer - was dann zu sehen ist, entscheidet das Fenster. */
export function searchNav(entries: readonly INavEntry[], query: string): INavEntry[] {
    const wanted = fold(query.trim());

    if (!wanted) return [];

    return entries
        .map((entry) => ({ entry, rank: rank(entry, wanted) }))
        .filter((hit): hit is { entry: INavEntry; rank: number } => hit.rank !== null)
        .sort((a, b) => a.rank - b.rank || a.entry.name.localeCompare(b.entry.name, "de"))
        .map((hit) => hit.entry);
}

/**
 * Die rechte Umschalttaste kurz drücken öffnet die Suche. Nur sie allein:
 * kommt eine andere Taste dazwischen, war es ein Großbuchstabe. Gehalten
 * oder in einem Feld zählt es auch nicht.
 */
export class ShiftTap {
    private since: number | null = null;
    // Ausgeschrieben statt als Parameter-Property: npm run check lädt die Datei ohne Übersetzung.
    private readonly limitMs: number;

    constructor(limitMs = 500) {
        this.limitMs = limitMs;
    }

    /** Gehalten wiederholt der Browser keydown (`repeat`) - das darf die Uhr nicht neu stellen. */
    down(code: string, at: number, editable: boolean, repeat = false): void {
        if (repeat) return;

        this.since = code === "ShiftRight" && !editable ? at : null;
    }

    up(code: string, at: number): boolean {
        const since = this.since;

        this.since = null;

        return code === "ShiftRight" && since !== null && at - since <= this.limitMs;
    }
}
