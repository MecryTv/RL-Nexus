import type { ISiteChangelog, ISiteLive, ISiteNews, ISiteNewsPost, ISitePartners } from "../domain/interfaces/ISiteContent";
import { isSiteChangelog, isSiteLive, isSiteNews, isSiteNewsPost, isSitePartners, useContent } from "./Content";

/**
 * Partner, News und Changelog laden (W-0062). `undefined` heißt: lädt noch.
 * Fehlt eine Datei oder ist sie kaputt, gilt ein leerer Stand. Prüfer und
 * Fallbacks stehen auf Modulebene, damit useContent sie nicht jedes Mal neu sieht.
 */

const NO_PARTNERS: ISitePartners = { entries: [] };
const NO_LIVE: ISiteLive = { at: "1970-01-01T00:00:00.000Z", servers: {} };
const NO_NEWS: ISiteNews = { posts: [] };
const NO_CHANGELOG: ISiteChangelog = { versions: [] };
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const isPost = (data: unknown): data is ISiteNewsPost | null => isSiteNewsPost(data);

export const usePartners = (): ISitePartners | undefined => useContent("partners.json", isSitePartners, NO_PARTNERS);
export const useLiveStats = (): ISiteLive | undefined => useContent("partners-live.json", isSiteLive, NO_LIVE);
export const useNews = (): ISiteNews | undefined => useContent("news.json", isSiteNews, NO_NEWS);
export const useChangelog = (): ISiteChangelog | undefined => useContent("changelog.json", isSiteChangelog, NO_CHANGELOG);

/** null: Beitrag gibt es nicht (oder die Adresse ist ungültig). */
export function useNewsPost(slug: string | undefined): ISiteNewsPost | null | undefined {
    return useContent(slug && SLUG.test(slug) ? `news/${slug}.json` : null, isPost, null);
}
