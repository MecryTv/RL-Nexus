/**
 * Suche der Leiste (W-0053): welche Seiten zu einer Eingabe passen und in
 * welcher Reihenfolge, dazu die rechte Umschalttaste. Übernommen aus dem
 * Bot-Dashboard (`Discord Bot/src/dashboard/client/core/NavSearch.ts`), hier
 * nur für Seiten. Ohne DOM, damit npm run check es prüfen kann.
 */

import { fold, rankOf } from "../../shared/search.ts";

export { fold };

export interface INavEntry {
    readonly href: string;
    readonly name: string;
    readonly icon: string;
    /** Name des Bereichs, gefunden wird auch darin. */
    readonly area: string;
    /** Die Beschreibung der Seite, gefunden wird auch darin. */
    readonly text: string;
}

/** Leere Eingabe: keine Treffer - was dann zu sehen ist, entscheidet das Fenster. */
export function searchNav(entries: readonly INavEntry[], query: string): INavEntry[] {
    const wanted = fold(query.trim());

    if (!wanted) return [];

    return entries
        .map((entry) => ({ entry, rank: rankOf(entry.name, `${entry.area} ${entry.text}`, wanted) }))
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
