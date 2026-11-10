/**
 * Was die Webseite über Partner, News und Changelog liest (W-0062). Das Admin
 * Dashboard baut daraus Dateien unter SITE_DIR (server/site/publish.ts), die
 * Webseite lädt sie von /content/. Die Feldnamen hier sind für die Webseite
 * verbindlich (Plan Teil 3). Nur Veröffentlichtes und Sichtbares kommt hinein,
 * nie Ansprechpartner, Zugang oder Rollen.
 */

import type { ChangeArea, IChangelogVersion } from "./changelog.ts";
import type { IBlock, IPost, IPostEvent, NewsCategory, NewsKind, PinState } from "./news.ts";
import { PARTNER_TYPE_LABELS, SUPPORTER_TYPE_LABELS, TIER_LABELS, type EntryColor, type EntryKind, type IEntry, type IEntryLinks, type ISection, type SponsorTier } from "./partners.ts";

export interface ISiteRef {
    readonly slug: string;
    readonly title: string;
    readonly date: string;
}

export interface ISiteEntry {
    readonly slug: string;
    readonly kind: EntryKind;
    readonly name: string;
    /** „Organisation“, „Hauptsponsor“, „Firma“ … */
    readonly typeLabel: string;
    readonly tier: SponsorTier | null;
    readonly subtitle: string;
    readonly shortText: string;
    readonly stripText: string | null;
    readonly color: EntryColor;
    readonly logo: string | null;
    readonly banner: string | null;
    readonly since: string | null;
    readonly links: IEntryLinks;
    readonly sections: readonly ISection[];
    readonly tournaments: readonly ISiteRef[];
    readonly news: readonly ISiteRef[];
    readonly onHome: boolean;
}

/** partners.json */
export interface ISitePartners {
    readonly entries: readonly ISiteEntry[];
}

export interface ISiteTeam {
    readonly name: string;
    readonly group: string | null;
    readonly mmr: number | null;
    readonly rank: string | null;
    readonly players: number;
}

/** partners-live.json, je Adresse eines Eintrags mit verknüpftem Server. */
export interface ISiteLive {
    readonly at: string;
    readonly servers: Readonly<Record<string, { readonly members: number; readonly online: number; readonly modules: readonly string[]; readonly teams: readonly ISiteTeam[] }>>;
}

export interface ISiteNewsItem {
    readonly slug: string;
    readonly kind: NewsKind;
    readonly category: NewsCategory;
    readonly title: string;
    readonly summary: string;
    readonly cover: string | null;
    readonly publishedAt: string;
    readonly pinned: PinState;
    readonly event: IPostEvent | null;
    readonly entry: { readonly slug: string; readonly name: string } | null;
}

/** news.json */
export interface ISiteNews {
    readonly posts: readonly ISiteNewsItem[];
}

export interface ISitePartnerCard {
    readonly slug: string;
    readonly name: string;
    readonly typeLabel: string;
    readonly color: EntryColor;
    readonly logo: string | null;
}

/** news/<adresse>.json */
export interface ISiteNewsPost extends ISiteNewsItem {
    readonly blocks: readonly IBlock[];
    readonly author: string;
    readonly updatedAt: string;
    /** Die Partner-Karten im Text, nach ID des Eintrags. */
    readonly partners: Readonly<Record<string, ISitePartnerCard>>;
}

export interface ISiteVersion {
    readonly version: string;
    readonly releasedOn: string;
    readonly title: string;
    readonly items: readonly { readonly kind: "neu" | "verbessert" | "behoben"; readonly area: ChangeArea; readonly text: string }[];
    readonly image: string;
    readonly postedAt: string;
    readonly postedBy: string | null;
    /** Nur wenn nach dem Posten geändert. */
    readonly updatedAt: string | null;
    readonly discordUrl: string | null;
}

/** changelog.json */
export interface ISiteChangelog {
    readonly versions: readonly ISiteVersion[];
}

const KIND_ORDER: Readonly<Record<EntryKind, number>> = { sponsor: 0, partner: 1, supporter: 2 };

function typeLabelOf(entry: IEntry): string {
    if (entry.kind === "sponsor") return TIER_LABELS[entry.tier ?? "sponsor"];
    if (entry.kind === "supporter") return entry.supporterType ? SUPPORTER_TYPE_LABELS[entry.supporterType] : "Unterstützer";

    return entry.partnerType ? PARTNER_TYPE_LABELS[entry.partnerType] : "Partner";
}

/** JJJJ-MM-TT in Berlin. */
const dayOf = (date: Date): string => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(date);

function isShown(entry: IEntry, today: string): boolean {
    if (!entry.visible) return false;

    return !(entry.kind === "supporter" && entry.hideAfterEnd && entry.endsOn !== null && entry.endsOn < today);
}

const published = (posts: readonly IPost[]): IPost[] =>
    posts.filter((post) => post.status === "published" && post.publishedAt !== null).sort((a, b) => b.publishedAt!.localeCompare(a.publishedAt!) || b.id - a.id);

export function buildPartners(entries: readonly IEntry[], posts: readonly IPost[], now: Date): ISitePartners {
    const today = dayOf(now);
    const live = published(posts);

    return {
        entries: entries
            .filter((entry) => isShown(entry, today))
            .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || Number(b.tier === "main") - Number(a.tier === "main") || a.position - b.position || a.id - b.id)
            .map((entry) => ({
                slug: entry.slug,
                kind: entry.kind,
                name: entry.name,
                typeLabel: typeLabelOf(entry),
                tier: entry.tier,
                subtitle: entry.subtitle,
                shortText: entry.shortText,
                stripText: entry.stripText,
                color: entry.color,
                logo: entry.logo,
                banner: entry.banner,
                since: entry.since,
                links: entry.links,
                sections: entry.sections.filter((section) => section.visible),
                tournaments: live
                    .filter((post) => post.kind === "termin" && post.event && entry.tournamentIds.includes(post.id))
                    .map((post) => ({ slug: post.slug, title: post.title, date: post.event!.startsAt }))
                    .sort((a, b) => a.date.localeCompare(b.date)),
                news: live
                    .filter((post) => post.entryId === entry.id)
                    .slice(0, 6)
                    .map((post) => ({ slug: post.slug, title: post.title, date: post.publishedAt! })),
                onHome: entry.onHome,
            })),
    };
}

function itemOf(post: IPost, shown: ReadonlyMap<number, IEntry>): ISiteNewsItem {
    const entry = post.entryId === null ? undefined : shown.get(post.entryId);

    return {
        slug: post.slug,
        kind: post.kind,
        category: post.category,
        title: post.title,
        summary: post.summary,
        cover: post.cover,
        publishedAt: post.publishedAt!,
        pinned: post.pinned,
        event: post.event,
        entry: entry ? { slug: entry.slug, name: entry.name } : null,
    };
}

const shownMap = (entries: readonly IEntry[]): Map<number, IEntry> => new Map(entries.filter((entry) => entry.visible).map((entry) => [entry.id, entry]));

export function buildNews(posts: readonly IPost[], entries: readonly IEntry[]): ISiteNews {
    const shown = shownMap(entries);

    return { posts: published(posts).map((post) => itemOf(post, shown)) };
}

export function buildPost(post: IPost, entries: readonly IEntry[]): ISiteNewsPost {
    const shown = shownMap(entries);
    const partners: Record<string, ISitePartnerCard> = {};

    for (const block of post.blocks) {
        const entry = block.type === "partner" ? shown.get(block.entryId) : undefined;

        if (entry) partners[String(entry.id)] = { slug: entry.slug, name: entry.name, typeLabel: typeLabelOf(entry), color: entry.color, logo: entry.logo };
    }

    return { ...itemOf(post, shown), blocks: post.blocks, author: post.authorName, updatedAt: post.updatedAt, partners };
}

export function buildChangelog(versions: readonly IChangelogVersion[], context: { readonly posterOf: (id: number) => string | null; readonly guildId: string }): ISiteChangelog {
    return {
        versions: versions
            .filter((version) => version.posted !== null)
            .map((version) => {
                const posted = version.posted!;

                return {
                    version: version.version,
                    releasedOn: version.releasedOn,
                    title: version.title,
                    items: version.items.flatMap((item) => (item.kind === "intern" ? [] : [{ kind: item.kind, area: item.area, text: item.text }])),
                    image: `/content/media/changelog-${version.version}.png`,
                    postedAt: posted.at,
                    postedBy: context.posterOf(version.id),
                    updatedAt: Date.parse(version.updatedAt) > Date.parse(posted.at) ? version.updatedAt : null,
                    discordUrl: `https://discord.com/channels/${context.guildId}/${posted.channelId}/${posted.messageId}`,
                };
            }),
    };
}

const XML: Readonly<Record<string, string>> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escape = (text: string): string => text.replace(/[&<>"']/g, (char) => XML[char]!);

/** RSS 2.0 mit den neuesten 30 Einträgen aus News und Changelog. */
export function buildRss(news: ISiteNews, changelog: ISiteChangelog, siteUrl: string): string {
    const items = [
        ...news.posts.map((post) => ({ title: post.title, link: `${siteUrl}/news/${post.slug}`, date: post.publishedAt, text: post.summary })),
        ...changelog.versions.map((version) => ({ title: `Version ${version.version}: ${version.title}`, link: `${siteUrl}/changelog/${version.version}`, date: version.postedAt, text: `${version.items.length} Änderungen` })),
    ]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 30);

    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0"><channel>',
        `<title>RL Nexus News</title><link>${escape(`${siteUrl}/news`)}</link><description>News und Changelog von RL Nexus</description><language>de-de</language>`,
        ...items.map(
            (item) =>
                `<item><title>${escape(item.title)}</title><link>${escape(item.link)}</link><guid isPermaLink="true">${escape(item.link)}</guid><pubDate>${new Date(item.date).toUTCString()}</pubDate><description>${escape(item.text)}</description></item>`
        ),
        "</channel></rss>",
    ].join("\n");
}

/** Kleine Seite nur mit Vorschau-Angaben für Discord und andere, die eine Adresse aufklappen. */
export function buildOgPage(meta: { readonly title: string; readonly description: string; readonly image: string | null; readonly url: string }): string {
    const tag = (property: string, content: string): string => `<meta property="${property}" content="${escape(content)}">`;

    return [
        "<!doctype html>",
        '<html lang="de"><head><meta charset="utf-8">',
        `<title>${escape(meta.title)}</title>`,
        `<meta name="description" content="${escape(meta.description)}">`,
        tag("og:type", "website"),
        tag("og:site_name", "RL Nexus"),
        tag("og:title", meta.title),
        tag("og:description", meta.description),
        tag("og:url", meta.url),
        ...(meta.image ? [tag("og:image", meta.image)] : []),
        `<meta name="twitter:card" content="${meta.image ? "summary_large_image" : "summary"}">`,
        `<link rel="canonical" href="${escape(meta.url)}">`,
        "</head>",
        `<body><a href="${escape(meta.url)}">${escape(meta.title)}</a></body></html>`,
    ].join("\n");
}
