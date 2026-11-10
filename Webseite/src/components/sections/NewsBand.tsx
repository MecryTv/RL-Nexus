import type { CSSProperties, JSX } from "react";
import { Link } from "react-router-dom";
import type { ISiteNewsItem } from "../../domain/interfaces/ISiteContent";
import { readLastVisit } from "../../hooks/useLastVisit";
import { isNew } from "../../services/news";
import { useChangelog, useNews } from "../../services/siteContent";
import { Counts } from "../changelog/ShareBar";
import { releaseDay } from "../changelog/meta";
import { NewMark } from "../news/NewMark";
import { Cover } from "../news/TimelineEntry";
import { CATEGORY, day, dayParts } from "../news/meta";
import { initials } from "../partners/entry";
import { Section } from "../layout/Section";
import { Panel } from "../ui/Panel";
import { SectionHeading } from "../ui/SectionHeading";
import styles from "./NewsBand.module.scss";

function Row({ post, fresh }: { readonly post: ISiteNewsItem; readonly fresh: boolean }): JSX.Element {
    const event = post.event ? dayParts(post.event.startsAt) : null;

    return (
        <Panel as="article" className={styles.row} interactive cut="sm" style={{ "--c": CATEGORY[post.category].color } as CSSProperties}>
            <div>
                <div className={styles.meta}>
                    <span className={styles.tag}>{post.kind === "termin" ? "Termin" : CATEGORY[post.category].label}</span>
                    {fresh && <NewMark />}
                    <span>{day(post.publishedAt)}</span>
                </div>
                <h3>
                    <Link className={styles.stretch} to={`/news/${post.slug}`}>
                        {post.title}
                    </Link>
                </h3>
            </div>
            {event && (
                <span className={styles.dateBox}>
                    <small>Am</small>
                    <strong>
                        {event.day}. {event.month}
                    </strong>
                </span>
            )}
        </Panel>
    );
}

/**
 * W-0062: „Neu bei RL Nexus“ auf der Startseite (H1): der neueste Beitrag groß,
 * daneben die neueste Bot-Version und zwei weitere Einträge. Ohne Inhalte
 * verschwindet das Band ganz.
 */
export function NewsBand(): JSX.Element | null {
    const news = useNews();
    const changelog = useChangelog();

    if (news === undefined || changelog === undefined) return null;

    const posts = [...news.posts].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    // Groß steht ein richtiger Beitrag; Termine und Kurzmeldungen passen besser in die Zeilen.
    const big = posts.find((post) => post.kind === "beitrag") ?? posts.find((post) => post.kind !== "kurz") ?? posts[0];
    const rows = posts.filter((post) => post !== big).slice(0, 2);
    const version = changelog.versions[0];

    if (!big && !version) return null;

    const lastVisit = readLastVisit();
    const fresh = (date: string): boolean => isNew(date, lastVisit);
    const freshCount = [...posts.map((post) => post.publishedAt), ...changelog.versions.map((item) => item.postedAt)].filter(fresh).length;

    return (
        <Section>
            <div className="u-shell">
                <div className={styles.head}>
                    <SectionHeading
                        eyebrow="Aktuell"
                        title="Neu bei RL Nexus"
                        lead={
                            <>
                                Beiträge, Versionen und Termine.
                                {freshCount > 0 && <b className={styles.fresh}> {freshCount} neu seit deinem letzten Besuch.</b>}
                            </>
                        }
                    />
                    <div className={styles.links}>
                        <Link to="/news">Alle News →</Link>
                        <Link to="/changelog">Changelog →</Link>
                    </div>
                </div>

                <div className={styles.band}>
                    {big && (
                        <Panel as="article" className={styles.big} interactive cut="md" style={{ "--c": CATEGORY[big.category].color } as CSSProperties}>
                            <Cover src={big.cover} art={big.entry ? initials(big.entry.name) : "RL"} className={styles.cover} />
                            <div className={styles.bigBody}>
                                <div className={styles.meta}>
                                    <span className={styles.tag}>{CATEGORY[big.category].label}</span>
                                    {fresh(big.publishedAt) && <NewMark />}
                                    <span>{day(big.publishedAt)}</span>
                                </div>
                                <h3>
                                    <Link className={styles.stretch} to={`/news/${big.slug}`}>
                                        {big.title}
                                    </Link>
                                </h3>
                                {big.summary && <p>{big.summary}</p>}
                                <span className={styles.more}>Weiterlesen →</span>
                            </div>
                        </Panel>
                    )}

                    <div className={styles.stack}>
                        {version && (
                            <Panel as="article" className={styles.version} interactive cut="sm">
                                <img src={version.image} alt={`Changelog ${version.version} als Bild aus dem Discord-Post`} loading="lazy" decoding="async" />
                                <div>
                                    <div className={styles.meta}>
                                        <span className={styles.tag} style={{ "--c": "var(--c-win)" } as CSSProperties}>
                                            Changelog
                                        </span>
                                        {fresh(version.postedAt) && <NewMark />}
                                    </div>
                                    <div className={styles.versionNumber}>
                                        {version.version} <span>{releaseDay(version.releasedOn)}</span>
                                    </div>
                                    <h3>
                                        <Link className={styles.stretch} to={`/changelog/${version.version}`}>
                                            {version.title}
                                        </Link>
                                    </h3>
                                    <Counts version={version} />
                                </div>
                            </Panel>
                        )}
                        {rows.map((post) => (
                            <Row key={post.slug} post={post} fresh={fresh(post.publishedAt)} />
                        ))}
                    </div>
                </div>
            </div>
        </Section>
    );
}
