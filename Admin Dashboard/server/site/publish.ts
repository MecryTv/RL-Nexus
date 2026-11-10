import type { IPost } from "../../shared/news.ts";
import type { IEntry } from "../../shared/partners.ts";
import { buildChangelog, buildNews, buildOgPage, buildPartners, buildPost, buildRss, type ISiteChangelog } from "../../shared/site-content.ts";
import { listVersions } from "../changelog/store.ts";
import type { IConfig } from "../config.ts";
import { listRaw, removeRaw, writeGenerated, writeRaw } from "../content.ts";
import { query } from "../db.ts";
import { listPosts } from "../news/store.ts";
import { refreshLive } from "../partners/live.ts";
import { listEntries } from "../partners/store.ts";

/**
 * Baut die Inhalte der Webseite für Partner, News und Changelog (W-0062) unter
 * SITE_DIR: partners.json, news.json, news/<adresse>.json, changelog.json,
 * news.xml und kleine Vorschau-Seiten unter og/. nginx liefert alles unter
 * /content/ aus. Fehler werden nur gemeldet: Eine Änderung im Admin Dashboard
 * soll nicht scheitern, weil die Webseite gerade nicht geschrieben werden kann.
 */

/** Was publishSite neu schreibt. */
export type SitePart = "partners" | "news" | "changelog" | "live";

const BY = "RL Nexus";

/** Schreibt die Dateien eines Ordners und löscht, was nicht mehr dazugehört. */
async function writeFolder(config: IConfig, dir: string, files: ReadonlyMap<string, string | object>): Promise<void> {
    for (const [name, data] of files) {
        if (typeof data === "string") await writeRaw(config, `${dir}/${name}`, data);
        else await writeGenerated(config, `${dir}/${name}`, data, BY);
    }

    for (const name of await listRaw(config, dir)) {
        if (!files.has(name) && !name.endsWith(".tmp")) await removeRaw(config, `${dir}/${name}`);
    }
}

function og(config: IConfig, title: string, description: string, image: string | null, route: string): string {
    const site = config.websitePublicUrl;

    return buildOgPage({ title: `${title} · RL Nexus`, description, image: image ? `${site}${image}` : null, url: `${site}${route}` });
}

async function writePartners(config: IConfig, entries: readonly IEntry[], posts: readonly IPost[]): Promise<void> {
    const site = buildPartners(entries, posts, new Date());

    await writeGenerated(config, "partners.json", site, BY);
    await writeFolder(config, "og/partner", new Map(site.entries.map((entry) => [`${entry.slug}.html`, og(config, entry.name, entry.shortText, entry.banner ?? entry.logo, `/partner/${entry.slug}`)])));
}

async function writeNews(config: IConfig, entries: readonly IEntry[], posts: readonly IPost[]): Promise<void> {
    const site = buildNews(posts, entries);
    const full = posts.filter((post) => site.posts.some((item) => item.slug === post.slug));

    await writeGenerated(config, "news.json", site, BY);
    await writeFolder(config, "news", new Map(full.map((post) => [`${post.slug}.json`, buildPost(post, entries)])));
    await writeFolder(config, "og/news", new Map(site.posts.map((post) => [`${post.slug}.html`, og(config, post.title, post.summary, post.cover, `/news/${post.slug}`)])));
}

async function changelogSite(config: IConfig): Promise<ISiteChangelog> {
    const [versions, posters] = await Promise.all([listVersions(), query<{ id: number; posted_by_name: string | null }[]>("SELECT id, posted_by_name FROM changelog_versions")]);
    const names = new Map(posters.map((row) => [Number(row.id), row.posted_by_name]));

    return buildChangelog(versions, { posterOf: (id) => names.get(id) ?? null, guildId: config.guildId });
}

async function writeChangelog(config: IConfig, site: ISiteChangelog): Promise<void> {
    await writeGenerated(config, "changelog.json", site, BY);

    // Bilder nicht mehr geposteter Versionen weg; hochgeladene Bilder (Hash-Namen) bleiben.
    const posted = new Set(site.versions.map((version) => `changelog-${version.version}.png`));

    for (const name of await listRaw(config, "media")) {
        if (/^changelog-.+\.png$/.test(name) && !posted.has(name)) await removeRaw(config, `media/${name}`);
    }

    await writeFolder(
        config,
        "og/changelog",
        new Map(site.versions.map((version) => [`${version.version}.html`, og(config, `Version ${version.version}: ${version.title}`, `${version.items.length} Änderungen`, version.image, `/changelog/${version.version}`)]))
    );
}

/**
 * Alles, was unter SITE_DIR liest und schreibt, läuft nacheinander: Lesen aus der
 * Datenbank und Schreiben gehören zusammen, sonst überschreibt ein älterer Lauf
 * einen neueren (Review-Fund 4).
 * ponytail: eine Kette in diesem Prozess; mit mehreren Prozessen bräuchte es eine Sperre in der Datenbank.
 */
let chain: Promise<unknown> = Promise.resolve();

export function withSite<T>(task: () => Promise<T>): Promise<T> {
    const run = chain.then(task, task);

    chain = run.catch(() => undefined);

    return run;
}

export function publishSite(config: IConfig, parts: readonly SitePart[]): Promise<void> {
    return withSite(() => build(config, parts));
}

async function build(config: IConfig, parts: readonly SitePart[]): Promise<void> {
    const want = new Set(parts);

    try {
        const entries = want.has("partners") || want.has("news") ? await listEntries() : [];
        const posts = want.has("partners") || want.has("news") ? await listPosts() : [];

        if (want.has("partners")) await writePartners(config, entries, posts);
        if (want.has("news")) await writeNews(config, entries, posts);

        if (want.has("changelog") || want.has("news")) {
            const changelog = await changelogSite(config);

            if (want.has("changelog")) await writeChangelog(config, changelog);

            const news = buildNews(want.has("news") ? posts : await listPosts(), want.has("news") ? entries : await listEntries());

            await writeRaw(config, "news.xml", buildRss(news, changelog, config.websitePublicUrl));
        }

        if (want.has("live")) await refreshLive(config);
    } catch (error) {
        console.warn("[site] Inhalte der Webseite nicht geschrieben:", (error as Error).message);
    }
}
