import { type CSSProperties, type JSX, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { ISiteNewsItem, NewsCategory } from "../domain/interfaces/ISiteContent";
import { usePageMeta } from "../hooks/usePageMeta";
import { useLastVisit } from "../hooks/useLastVisit";
import { isNew, pinned, timeline, upcoming, type ITimelineEntry } from "../services/news";
import { useChangelog, useNews } from "../services/siteContent";
import { siteConfig } from "../services/SiteConfig";
import { PageHeader } from "../components/layout/PageHeader";
import { Section } from "../components/layout/Section";
import { Button } from "../components/ui/Button";
import { PageLoader } from "../components/ui/PageLoader";
import { Panel } from "../components/ui/Panel";
import { NewMark } from "../components/news/NewMark";
import { Cover, TimelineEntry } from "../components/news/TimelineEntry";
import { CATEGORY, day, dayParts, newsFilter, time, type NewsFilter } from "../components/news/meta";
import { initials } from "../components/partners/entry";
import newsStyles from "../components/news/news.module.scss";
import styles from "./NewsPage.module.scss";

/** So viele Einträge zeigt der Zeitstrahl, „Ältere laden“ holt die nächsten. */
const PAGE = 12;
const NO_ITEMS: readonly ITimelineEntry[] = [];

type Filter = NewsFilter;

function PinnedBig({ post, fresh }: { readonly post: ISiteNewsItem; readonly fresh: boolean }): JSX.Element {
    const color = CATEGORY[post.category].color;

    return (
        <Panel as="article" className={styles.pinned} interactive cut="md" style={{ "--c": color } as CSSProperties}>
            <Cover src={post.cover} art={post.entry ? initials(post.entry.name) : "RL"} className={styles.pinnedCover} />
            <div className={styles.pinnedBody}>
                <div className={newsStyles.meta}>
                    <span className={newsStyles.tag}>{CATEGORY[post.category].label}</span>
                    <span className={styles.pin}>Angeheftet</span>
                    {fresh && <NewMark />}
                </div>
                <h2>
                    <Link className={newsStyles.stretch} to={`/news/${post.slug}`}>
                        {post.title}
                    </Link>
                </h2>
                <p>{post.summary}</p>
                <div className={newsStyles.meta}>
                    <span>{day(post.publishedAt)}</span>
                </div>
                <span className={newsStyles.more}>Weiterlesen →</span>
            </div>
        </Panel>
    );
}

function PinnedSmall({ post, fresh }: { readonly post: ISiteNewsItem; readonly fresh: boolean }): JSX.Element {
    return (
        <Panel as="article" className={styles.mini} interactive cut="sm" style={{ "--c": CATEGORY[post.category].color } as CSSProperties}>
            <Cover src={post.cover} art={post.entry ? initials(post.entry.name) : "RL"} className={styles.miniCover} />
            <div className={styles.miniBody}>
                <div className={newsStyles.meta}>
                    <span className={newsStyles.tag}>{CATEGORY[post.category].label}</span>
                    <span className={styles.pin}>Angeheftet</span>
                    {fresh && <NewMark />}
                </div>
                <h3>
                    <Link className={newsStyles.stretch} to={`/news/${post.slug}`}>
                        {post.title}
                    </Link>
                </h3>
            </div>
        </Panel>
    );
}

/**
 * W-0062: /news. Oben das Angeheftete, darunter der Zeitstrahl mit Beiträgen,
 * Kurzmeldungen, Terminen und den Bot-Versionen aus dem Changelog. Filter über
 * `?art=`, Suche über `?suche=`, beides teilbar.
 */
export function NewsPage(): JSX.Element {
    usePageMeta("News", "Updates, Partner, Turniere und Ankündigungen rund um RL Nexus.");

    const news = useNews();
    const changelog = useChangelog();
    const lastVisit = useLastVisit(true);
    const [params, setParams] = useSearchParams();
    const [limit, setLimit] = useState(PAGE);
    const loaded = news !== undefined && changelog !== undefined;

    const art = newsFilter(params.get("art"));
    const query = (params.get("suche") ?? "").trim().toLowerCase();

    const all = useMemo(() => (loaded ? timeline(news, changelog).flatMap((month) => month.entries) : NO_ITEMS), [loaded, news, changelog]);
    // Gezählt wird, was im Zeitstrahl steht; Angeheftetes steht oben und dort nicht noch einmal.
    const counts = useMemo(() => {
        const result: Partial<Record<NewsCategory, number>> = {};

        for (const entry of all) if (entry.item) result[entry.item.category] = (result[entry.item.category] ?? 0) + 1;

        return result;
    }, [all]);

    const matches = all.filter((entry) => {
        if (art === "changelog" ? entry.version === null : art !== null && entry.item?.category !== art) return false;
        if (!query) return true;

        const text = `${entry.title} ${entry.item?.summary ?? ""} ${entry.version?.items.map((item) => item.text).join(" ") ?? ""}`.toLowerCase();

        return text.includes(query);
    });
    const shown = matches.slice(0, limit);
    const months = groupByMonth(shown);
    const archive = groupByMonth(all);
    const top = news ? pinned(news) : null;
    const soon = news ? upcoming(news, new Date()) : [];
    const fresh = (date: string): boolean => isNew(date, lastVisit);
    // Mit dem Angehefteten, das im Zeitstrahl fehlt.
    const freshCount = [...(news?.posts.map((post) => post.publishedAt) ?? []), ...(changelog?.versions.map((version) => version.postedAt) ?? [])].filter(fresh).length;

    const setParam = (key: string, value: string | null): void => {
        const next = new URLSearchParams(params);

        if (value) next.set(key, value);
        else next.delete(key);

        setParams(next, { replace: true });
        setLimit(PAGE);
    };

    const filters: { key: Filter | null; label: string; count: number }[] = [
        { key: null as Filter | null, label: "Alle", count: all.length },
        ...(Object.keys(CATEGORY) as NewsCategory[]).map((key) => ({ key, label: CATEGORY[key].plural, count: counts[key] ?? 0 })),
        { key: "changelog" as const, label: "Changelog", count: changelog?.versions.length ?? 0 },
    ].filter((filter) => filter.key === null || filter.count > 0);

    const jump = (key: string): void => {
        const index = all.findLastIndex((entry) => monthOf(entry.date) === key);

        setParams(new URLSearchParams(), { replace: true });
        setLimit((current) => Math.max(current, index + 1));
        requestAnimationFrame(() => document.getElementById(`monat-${key}`)?.scrollIntoView({ block: "start" }));
    };

    return (
        <>
            <PageHeader
                eyebrow="News"
                title={
                    <>
                        Was bei <em>RL Nexus</em> passiert.
                    </>
                }
                lead={
                    <>
                        Updates, Partner, Turniere und alles, was ihr wissen solltet.
                        {freshCount > 0 && <b className={styles.freshCount}> {freshCount === 1 ? "1 Eintrag ist neu" : `${freshCount} Einträge sind neu`} seit deinem letzten Besuch.</b>}
                    </>
                }
            >
                <div className={styles.follow}>
                    <Button href={siteConfig.supportURL} variant="outline" icon="discord">
                        Discord-Ankündigungen
                    </Button>
                    <Button href="/news.xml" variant="outline">
                        RSS
                    </Button>
                </div>
            </PageHeader>

            {!loaded && <PageLoader />}

            {loaded && (
                <Section flush>
                    <div className="u-shell">
                        {top?.big && <PinnedBig post={top.big} fresh={fresh(top.big.publishedAt)} />}
                        {top && top.small.length > 0 && (
                            <div className={styles.pinnedSmall}>
                                {top.small.map((post) => (
                                    <PinnedSmall key={post.slug} post={post} fresh={fresh(post.publishedAt)} />
                                ))}
                            </div>
                        )}

                        <div className={styles.filters} role="group" aria-label="Nach Art filtern">
                            {filters.map((filter) => (
                                <button key={filter.key ?? "alle"} type="button" className={styles.filter} aria-pressed={art === filter.key} onClick={() => setParam("art", filter.key)}>
                                    {filter.label}
                                    <i>{filter.count}</i>
                                </button>
                            ))}
                        </div>

                        <div className={styles.cols}>
                            <div className={styles.stream}>
                                {all.length === 0 && <p className={styles.empty}>Noch keine News. Neue Beiträge erscheinen hier und im Discord.</p>}
                                {all.length > 0 && shown.length === 0 && <p className={styles.empty}>Dazu gibt es nichts. Versuch einen anderen Begriff oder „Alle“.</p>}
                                {shown.length > 0 && (
                                    <div className={newsStyles.timeline}>
                                        {months.map((month) => (
                                            <section key={month.key} id={`monat-${month.key}`} className={styles.monthGroup} aria-labelledby={`kopf-${month.key}`}>
                                                <div className={newsStyles.month}>
                                                    <h2 id={`kopf-${month.key}`}>{month.short}</h2>
                                                    <span>{month.entries.length === 1 ? "1 Eintrag" : `${month.entries.length} Einträge`}</span>
                                                </div>
                                                <ol className={newsStyles.entries}>
                                                    {month.entries.map((entry) => (
                                                        <TimelineEntry key={`${entry.kind}-${entry.slug}`} entry={entry} fresh={fresh(entry.date)} />
                                                    ))}
                                                </ol>
                                            </section>
                                        ))}
                                    </div>
                                )}
                                {matches.length > shown.length && (
                                    <div className={styles.loadMore}>
                                        <Button variant="outline" onClick={() => setLimit((current) => current + PAGE)}>
                                            Ältere laden
                                        </Button>
                                    </div>
                                )}
                            </div>

                            <aside className={styles.side}>
                                <label className={styles.search}>
                                    <span className="u-sr">News durchsuchen</span>
                                    <input type="search" placeholder="News durchsuchen …" defaultValue={params.get("suche") ?? ""} onChange={(event) => setParam("suche", event.target.value.trim() || null)} />
                                </label>

                                {soon.length > 0 && (
                                    <Panel className={styles.box} cut="sm">
                                        <h2>Demnächst</h2>
                                        <ul className={styles.soon}>
                                            {soon.map((post) => {
                                                const parts = dayParts(post.event!.startsAt);

                                                return (
                                                    <li key={post.slug} style={{ "--c": CATEGORY[post.category].color } as CSSProperties}>
                                                        <span className={styles.soonDate}>
                                                            <strong>{parts.day}</strong>
                                                            <small>{parts.month}</small>
                                                        </span>
                                                        <div>
                                                            <Link to={`/news/${post.slug}`}>{post.title}</Link>
                                                            <small>
                                                                {time(post.event!.startsAt)} Uhr{post.event!.place ? ` · ${post.event!.place}` : ""}
                                                            </small>
                                                        </div>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </Panel>
                                )}

                                {archive.length > 1 && (
                                    <Panel className={styles.box} cut="sm">
                                        <h2>Archiv</h2>
                                        <ul className={styles.archive}>
                                            {archive.map((month) => (
                                                <li key={month.key}>
                                                    <button type="button" onClick={() => jump(month.key)}>
                                                        {month.label}
                                                    </button>
                                                    <span>{month.entries.length}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </Panel>
                                )}

                                <Panel className={[styles.box, styles.subscribe].join(" ")} cut="sm">
                                    <h2>Nichts verpassen</h2>
                                    <p>Neue Beiträge kommen auch in unseren Ankündigungskanal auf Discord.</p>
                                    <div className={styles.subscribeActions}>
                                        <Button href={siteConfig.supportURL} icon="discord">
                                            Discord
                                        </Button>
                                        <Button href="/news.xml" variant="outline">
                                            RSS-Feed
                                        </Button>
                                    </div>
                                </Panel>
                            </aside>
                        </div>
                    </div>
                </Section>
            )}
        </>
    );
}

const monthShort = new Intl.DateTimeFormat("de-DE", { month: "short", year: "numeric", timeZone: "Europe/Berlin" });
const monthLong = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "Europe/Berlin" });
const keyFormat = new Intl.DateTimeFormat("sv-SE", { year: "numeric", month: "2-digit", timeZone: "Europe/Berlin" });
const monthOf = (iso: string): string => keyFormat.format(new Date(iso)).slice(0, 7);

/** Die gezeigten Einträge nach Monat, neueste zuerst (sie kommen schon sortiert). */
function groupByMonth(entries: readonly ITimelineEntry[]): { key: string; label: string; short: string; entries: ITimelineEntry[] }[] {
    const months: { key: string; label: string; short: string; entries: ITimelineEntry[] }[] = [];

    for (const entry of entries) {
        const key = monthOf(entry.date);
        const last = months[months.length - 1];

        if (last?.key === key) last.entries.push(entry);
        else months.push({ key, label: monthLong.format(new Date(entry.date)), short: monthShort.format(new Date(entry.date)).replace(".", ""), entries: [entry] });
    }

    return months;
}

