import type { Role } from "../../shared/api.ts";
import { SEARCH_PER_KIND, SEARCH_TIMEOUT_MS, sortHits, type ISearchHit, type ISearchResult, type SearchKind } from "../../shared/search.ts";

/** Eine Stelle, an der gesucht wird. Seiten sucht der Browser. */
export interface ISearchSource {
    readonly kind: Exclude<SearchKind, "seiten">;
    /** Nur für Developer, wie die Seite dazu. */
    readonly developer?: boolean;
    find(text: string): Promise<ISearchHit[]>;
}

/** Eine Quelle mit Zeitlimit. null: zu spät oder mit Fehler. */
async function within(source: ISearchSource, text: string, timeoutMs: number): Promise<ISearchHit[] | null> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
    });

    try {
        return await Promise.race([source.find(text), late]);
    } catch (error) {
        console.error(`🔎 Suche in ${source.kind} fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);

        return null;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Alle Quellen gleichzeitig, jede höchstens `timeoutMs`. Je Art sortiert und
 * auf `SEARCH_PER_KIND` gekürzt; was fehlt, steht in `failed`.
 */
export async function runSearch(sources: readonly ISearchSource[], text: string, role: Role, timeoutMs = SEARCH_TIMEOUT_MS): Promise<ISearchResult> {
    const allowed = sources.filter((source) => !source.developer || role === "developer");
    const answers = await Promise.all(allowed.map(async (source) => ({ kind: source.kind, hits: await within(source, text, timeoutMs) })));
    const byKind = new Map<SearchKind, ISearchHit[]>();
    const failed = new Set<SearchKind>();

    for (const { kind, hits } of answers) {
        if (hits === null) failed.add(kind);
        byKind.set(kind, [...(byKind.get(kind) ?? []), ...(hits ?? [])]);
    }

    const counts: Partial<Record<SearchKind, number>> = {};
    const capped: SearchKind[] = [];
    const hits: ISearchHit[] = [];

    for (const [kind, found] of byKind) {
        const kept = sortHits(found).slice(0, SEARCH_PER_KIND);

        counts[kind] = kept.length;
        if (found.length > SEARCH_PER_KIND) capped.push(kind);
        hits.push(...kept);
    }

    return { hits: sortHits(hits), counts, capped, failed: [...failed] };
}
