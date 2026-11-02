import { useEffect, useState } from "react";
import { SEARCH_DEBOUNCE_MS, SEARCH_KINDS, SEARCH_MIN, type ISearchResult, type SearchKind } from "../../shared/search.ts";
import { api } from "../api/client";

/** Wenn die Anfrage selbst scheitert, fehlt alles, was der Server sucht. */
function unreachable(kind: SearchKind | null): ISearchResult {
    return { hits: [], counts: {}, capped: [], failed: kind ? [kind] : SEARCH_KINDS.filter((entry) => entry !== "seiten") };
}

/**
 * Was der Server zu einer Eingabe findet (W-0059). Erst ab `SEARCH_MIN`
 * Zeichen und `SEARCH_DEBOUNCE_MS` nach dem letzten Tastendruck; eine neue
 * Eingabe bricht die alte Anfrage ab, damit keine späte Antwort die Liste
 * überschreibt. Seiten sucht der Browser selbst.
 */
export function useSearch(text: string, kind: SearchKind | null): { readonly result: ISearchResult | null; readonly loading: boolean } {
    const key = text.length >= SEARCH_MIN && kind !== "seiten" ? `${kind ?? ""}:${text}` : "";
    const [answer, setAnswer] = useState<{ readonly key: string; readonly result: ISearchResult } | null>(null);

    useEffect(() => {
        if (!key) return;

        const controller = new AbortController();
        const timer = setTimeout(() => {
            const params = new URLSearchParams({ q: text, ...(kind ? { art: kind } : {}) });

            api<ISearchResult>(`/api/search?${params.toString()}`, { signal: controller.signal })
                .then((result) => setAnswer({ key, result }))
                .catch(() => {
                    if (!controller.signal.aborted) setAnswer({ key, result: unreachable(kind) });
                });
        }, SEARCH_DEBOUNCE_MS);

        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [key, text, kind]);

    if (!key) return { result: null, loading: false };

    return answer?.key === key ? { result: answer.result, loading: false } : { result: null, loading: true };
}
