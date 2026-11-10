import type { ChangeKind, ISiteChangelog, ISiteNews, ISiteNewsItem, ISiteVersion, NewsCategory } from "../domain/interfaces/ISiteContent";

/**
 * Rechnen für News, Changelog und Startseite (W-0062): Zeitstrahl nach Monat,
 * Angeheftet, Demnächst, Neu-Marke, Anteile einer Version. Ohne React, damit
 * `npm run check` es direkt laden kann. Monate gelten in Berliner Zeit.
 */

export interface ITimelineEntry {
    readonly kind: "beitrag" | "kurz" | "termin" | "changelog";
    readonly date: string;
    readonly slug: string;
    readonly title: string;
    readonly item: ISiteNewsItem | null;
    readonly version: ISiteVersion | null;
}

export interface ITimelineMonth {
    /** JJJJ-MM */
    readonly key: string;
    /** „November 2026“ */
    readonly label: string;
    readonly entries: readonly ITimelineEntry[];
}

const ZONE = "Europe/Berlin";
const keyFormat = new Intl.DateTimeFormat("sv-SE", { timeZone: ZONE, year: "numeric", month: "2-digit" });
const labelFormat = new Intl.DateTimeFormat("de-DE", { timeZone: ZONE, year: "numeric", month: "long" });

export const monthKey = (iso: string): string => keyFormat.format(new Date(iso)).slice(0, 7);
export const monthLabel = (iso: string): string => labelFormat.format(new Date(iso));

const newestFirst = (a: { readonly date: string }, b: { readonly date: string }): number => b.date.localeCompare(a.date);

function group<T extends { readonly date: string }>(items: readonly T[]): { key: string; label: string; items: T[] }[] {
    const months = new Map<string, { key: string; label: string; items: T[] }>();

    for (const item of [...items].sort(newestFirst)) {
        const key = monthKey(item.date);
        const month = months.get(key) ?? { key, label: monthLabel(item.date), items: [] };

        month.items.push(item);
        months.set(key, month);
    }

    return [...months.values()].sort((a, b) => b.key.localeCompare(a.key));
}

/** Beiträge, Kurzmeldungen, Termine und Versionen nach Monat. Angeheftetes steht oben und hier nicht noch einmal. */
export function timeline(news: ISiteNews, changelog: ISiteChangelog): ITimelineMonth[] {
    const entries: ITimelineEntry[] = [
        ...news.posts.filter((post) => post.pinned === "none").map((post) => ({ kind: post.kind, date: post.publishedAt, slug: post.slug, title: post.title, item: post, version: null })),
        ...changelog.versions.map((version) => ({ kind: "changelog" as const, date: version.postedAt, slug: version.version, title: version.title, item: null, version })),
    ];

    return group(entries).map((month) => ({ key: month.key, label: month.label, entries: month.items }));
}

export function pinned(news: ISiteNews): { readonly big: ISiteNewsItem | null; readonly small: readonly ISiteNewsItem[] } {
    return { big: news.posts.find((post) => post.pinned === "big") ?? null, small: news.posts.filter((post) => post.pinned === "small").slice(0, 2) };
}

/** Kommende und laufende Termine, früheste zuerst. Ein Termin über mehrere Tage bleibt bis zu seinem Ende drin. */
export function upcoming(news: ISiteNews, now: Date, limit = 5): ISiteNewsItem[] {
    return news.posts
        .filter((post) => post.event !== null && Date.parse(post.event.endsAt ?? post.event.startsAt) >= now.getTime())
        .sort((a, b) => a.event!.startsAt.localeCompare(b.event!.startsAt))
        .slice(0, limit);
}

/** Neu ist, was nach dem letzten Besuch kam. Beim ersten Besuch ist nichts neu. */
export function isNew(date: string, lastVisit: string | null): boolean {
    return lastVisit !== null && Date.parse(date) > Date.parse(lastVisit);
}

export function categoryCounts(news: ISiteNews): Record<NewsCategory, number> {
    const counts: Record<NewsCategory, number> = { update: 0, partner: 0, turnier: 0, ankuendigung: 0, wartung: 0 };

    for (const post of news.posts) counts[post.category] += 1;

    return counts;
}

/** Versionen nach Monat, für die Übersicht des Changelogs. */
export function versionMonths(changelog: ISiteChangelog): { readonly key: string; readonly label: string; readonly versions: readonly ISiteVersion[] }[] {
    return group(changelog.versions.map((version) => ({ ...version, date: version.postedAt }))).map((month) => ({ key: month.key, label: month.label, versions: month.items }));
}

export function shares(version: ISiteVersion): Record<ChangeKind, number> {
    const counts: Record<ChangeKind, number> = { neu: 0, verbessert: 0, behoben: 0 };

    for (const item of version.items) counts[item.kind] += 1;

    return counts;
}
