import type { ICategories, IContentMeta, IEnvelope } from "../../shared/content";
import { useLive } from "../api/live";
import { useApi } from "../api/useApi";

/**
 * Was ein Modul enthalten darf, mit den Kategorien aus categories.json statt
 * der eingebauten aus meta.json. Modulseite und Modul-Editor brauchen beides
 * zusammen, die Formulare lesen weiter `meta.categories`.
 */
export function useModuleMeta(): { readonly data: IContentMeta | null; readonly error: Error | null; readonly reload: () => void } {
    const meta = useApi<IContentMeta>("/api/content/meta");
    const categories = useApi<IEnvelope<ICategories>>("/api/content/categories");

    useLive("content", categories.reload);

    const data =
        meta.data === null || categories.data === null
            ? null
            : { ...meta.data, categories: categories.data.data.categories.map((entry) => ({ id: entry.id, label: entry.label, accent: entry.color })) };

    return {
        data,
        error: (meta.error && !meta.data ? meta.error : null) ?? (categories.error && !categories.data ? categories.error : null),
        reload: () => {
            meta.reload();
            categories.reload();
        },
    };
}
