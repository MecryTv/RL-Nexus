/**
 * Suche der Leiste (W-0053, W-0059): Seiten als Treffer, was die Liste zeigt
 * und welcher Filter folgt, dazu die rechte Umschalttaste (übernommen aus
 * `Discord Bot/src/dashboard/client/core/NavSearch.ts`). Ohne DOM, damit
 * npm run check es prüfen kann.
 */

import { fold, rankOf, SEARCH_ALL, SEARCH_KINDS, SEARCH_PER_KIND, sortHits, type ISearchHit, type ISearchResult, type SearchKind } from "../../shared/search.ts";

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

export type SearchFilter = SearchKind | "alles";

/** Reihenfolge der Filterleiste. */
export const FILTERS: readonly SearchFilter[] = ["alles", ...SEARCH_KINDS];

/** Eine Seite als Treffer. */
export function entryHit(entry: INavEntry, rank = 0): ISearchHit {
    return { kind: "seiten", icon: entry.icon, title: entry.name, place: entry.area, context: entry.text, href: entry.href, at: null, rank };
}

/** Seiten als Treffer, sortiert. Leere Eingabe: keine - was dann zu sehen ist, entscheidet das Fenster. */
export function pageHits(entries: readonly INavEntry[], text: string): ISearchHit[] {
    const wanted = fold(text.trim());

    if (!wanted) return [];

    return sortHits(
        entries.flatMap((entry) => {
            const rank = rankOf(entry.name, `${entry.area} ${entry.text}`, wanted);

            return rank === null ? [] : [entryHit(entry, rank)];
        })
    );
}

/** Was die Liste zeigt: in „Alles“ gemischt, sonst nur die eine Art. */
export function shownHits(pages: readonly ISearchHit[], result: ISearchResult | null, filter: SearchFilter): ISearchHit[] {
    const all = sortHits([...pages, ...(result?.hits ?? [])]);

    return filter === "alles" ? all.slice(0, SEARCH_ALL) : all.filter((hit) => hit.kind === filter).slice(0, SEARCH_PER_KIND);
}

/** Tab: der nächste Filter, ringsum. */
export function nextFilter(current: SearchFilter, step: 1 | -1): SearchFilter {
    return FILTERS[(FILTERS.indexOf(current) + step + FILTERS.length) % FILTERS.length];
}

/** Die Zahl am Filter. Seiten stehen sofort fest, der Rest erst mit der Antwort des Servers. */
export function countLabel(filter: SearchFilter, pages: number, result: ISearchResult | null, loading: boolean): string {
    if (filter === "seiten") return String(pages);
    if (loading) return "·";

    const capped = result?.capped ?? [];

    if (filter === "alles") {
        const sum = pages + Object.values(result?.counts ?? {}).reduce((total, count) => total + (count ?? 0), 0);

        return `${sum}${capped.length > 0 ? "+" : ""}`;
    }

    return capped.includes(filter) ? `${SEARCH_PER_KIND}+` : String(result?.counts[filter] ?? 0);
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
