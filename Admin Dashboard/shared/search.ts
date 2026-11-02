/**
 * Die Suche der Leiste (W-0059): was gefunden wird, wie es heißt und in
 * welcher Reihenfolge es steht. Server und Browser rechnen gleich.
 */

/** Reihenfolge der Filterleiste (nach „Alles“) und bei gleichem Rang. */
export const SEARCH_KINDS = ["seiten", "personen", "server", "mails", "inhalte", "protokoll"] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

export const SEARCH_LABELS: Readonly<Record<SearchKind, string>> = {
    seiten: "Seiten",
    personen: "Personen",
    server: "Server",
    mails: "Mails",
    inhalte: "Inhalte",
    protokoll: "Protokoll",
};

/** Ab so vielen Zeichen fragt der Browser den Server. Ein Zeichen fände bei Mails fast alles. */
export const SEARCH_MIN = 2;
export const SEARCH_DEBOUNCE_MS = 200;
/** So lange hat jede Quelle; was später kommt, fehlt in der Antwort. */
export const SEARCH_TIMEOUT_MS = 2000;
export const SEARCH_PER_KIND = 20;
/** Zeilen in „Alles“. */
export const SEARCH_ALL = 40;

export interface ISearchHit {
    readonly kind: SearchKind;
    readonly icon: string;
    readonly title: string;
    /** Rechts in der Zeile: wo der Treffer liegt („Postfach Info“). */
    readonly place: string;
    /** Die Zeile darunter. */
    readonly context: string;
    readonly href: string;
    /** ISO, für „das Neueste zuerst“ bei gleichem Rang. */
    readonly at: string | null;
    /** 0 Titel beginnt mit dem Begriff, 1 Titel enthält ihn, 2 nur der Kontext. */
    readonly rank: number;
}

export interface ISearchResult {
    readonly hits: readonly ISearchHit[];
    readonly counts: Partial<Record<SearchKind, number>>;
    /** Arten mit mehr Treffern als `SEARCH_PER_KIND`: am Filter steht „20+“. */
    readonly capped: readonly SearchKind[];
    /** Arten, deren Quelle nicht rechtzeitig oder mit Fehler antwortete. */
    readonly failed: readonly SearchKind[];
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

/** `query` schon gefaltet. null: kein Treffer. */
export function rankOf(title: string, context: string, query: string): number | null {
    const name = fold(title);

    if (name.startsWith(query) || name.split(/[^a-z0-9]+/).some((word) => word.startsWith(query))) return 0;
    if (name.includes(query)) return 1;
    if (fold(context).includes(query)) return 2;

    return null;
}

const PREFIXES: Readonly<Record<string, SearchKind>> = { "@": "personen", "#": "server", "/": "seiten" };

/** Ein Kürzel am Anfang stellt den Filter um und wird nicht mitgesucht. */
export function parseQuery(input: string): { readonly kind: SearchKind | null; readonly text: string } {
    const trimmed = input.trimStart();
    const kind = PREFIXES[trimmed.charAt(0)] ?? null;

    return { kind, text: (kind ? trimmed.slice(1) : trimmed).trim() };
}

export function sortHits(hits: readonly ISearchHit[]): ISearchHit[] {
    return [...hits].sort(
        (a, b) =>
            a.rank - b.rank ||
            SEARCH_KINDS.indexOf(a.kind) - SEARCH_KINDS.indexOf(b.kind) ||
            (b.at ?? "").localeCompare(a.at ?? "") ||
            a.title.localeCompare(b.title, "de")
    );
}

/** Die Stelle zum Markieren. Nur wörtlich: Über Umlaute gefundene Titel bleiben ohne Markierung. */
export function markOf(title: string, text: string): { readonly before: string; readonly match: string; readonly after: string } | null {
    const needle = text.trim().toLowerCase();
    if (!needle) return null;

    const at = title.toLowerCase().indexOf(needle);
    if (at < 0) return null;

    return { before: title.slice(0, at), match: title.slice(at, at + needle.length), after: title.slice(at + needle.length) };
}
