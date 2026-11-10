import { type CSSProperties, type JSX, type RefObject, useEffect, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import type { ISiteNewsPost } from "../domain/interfaces/ISiteContent";
import { usePageMeta } from "../hooks/usePageMeta";
import { useNews, useNewsPost } from "../services/siteContent";
import { PageLoader } from "../components/ui/PageLoader";
import { Panel } from "../components/ui/Panel";
import { Blocks } from "../components/news/Blocks";
import { Pick } from "../components/preview/Pick";
import { Cover } from "../components/news/TimelineEntry";
import { CATEGORY, day, eventText, readingMinutes, wasUpdated } from "../components/news/meta";
import { initials } from "../components/partners/entry";
import newsStyles from "../components/news/news.module.scss";
import { NotFoundPage } from "./NotFoundPage";
import styles from "./NewsPostPage.module.scss";

/** Der Balken unter der Kopfzeile: wie weit man im Beitrag ist. Nur `transform`, damit beim Scrollen nichts neu gesetzt wird. */
function ReadingBar({ target }: { readonly target: RefObject<HTMLElement | null> }): JSX.Element {
    const bar = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        let frame = 0;
        const update = (): void => {
            frame = 0;
            const element = target.current;

            if (!element || !bar.current) return;

            const box = element.getBoundingClientRect();
            const total = box.height - window.innerHeight;
            const done = total <= 0 ? 1 : Math.min(1, Math.max(0, -box.top / total));

            bar.current.style.transform = `scaleX(${done})`;
        };
        const onScroll = (): void => {
            if (frame === 0) frame = requestAnimationFrame(update);
        };

        update();
        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onScroll);

        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener("scroll", onScroll);
            window.removeEventListener("resize", onScroll);
        };
    }, [target]);

    return (
        <div className={styles.progress} aria-hidden="true">
            <span ref={bar} />
        </div>
    );
}

/** W-0062: Ein Beitrag ohne Layout drumherum. Die Vorschau im Admin Dashboard (Teil 2) zeigt genau das. */
export function NewsPostView({ post }: { readonly post: ISiteNewsPost }): JSX.Element {
    const category = CATEGORY[post.category];

    return (
        <div className={styles.article} style={{ "--c": category.color } as CSSProperties}>
            <Pick part="kopf">
                <Link className={styles.back} to="/news">
                    ← Alle News
                </Link>
                <h1>{post.title}</h1>
                <div className={[newsStyles.meta, styles.meta].join(" ")}>
                    <span className={newsStyles.tag}>{category.label}</span>
                    <span>{day(post.publishedAt)}</span>
                    <span>· {readingMinutes(post.blocks)} Min. Lesezeit</span>
                </div>
                {post.event && (
                    <p className={styles.event}>Termin: {eventText(post.event)}</p>
                )}
                <div className={styles.author}>
                    <span className={styles.avatar} aria-hidden="true">
                        {initials(post.author) || "RL"}
                    </span>
                    <div>
                        <b>{post.author}</b>
                        <small>{wasUpdated(post.publishedAt, post.updatedAt) ? `Aktualisiert am ${day(post.updatedAt)}` : "RL Nexus"}</small>
                    </div>
                </div>
            </Pick>
            {post.cover && (
                <Pick part="titelbild">
                    <Cover src={post.cover} art="" className={styles.cover} />
                </Pick>
            )}
            <Blocks blocks={post.blocks} partners={post.partners} />
        </div>
    );
}

/** `/news/:slug` mit Lesebalken und vorherigem/nächstem Beitrag. */
export function NewsPostPage(): JSX.Element {
    const { slug } = useParams();
    const post = useNewsPost(slug);
    const news = useNews();
    const article = useRef<HTMLElement>(null);

    usePageMeta(post?.title ?? "News", post?.summary);

    if (post === undefined) return <PageLoader />;
    if (post === null) return <NotFoundPage />;

    const list = news?.posts ?? [];
    const at = list.findIndex((item) => item.slug === post.slug);
    // Die Liste ist neueste zuerst: davor steht der neuere, dahinter der ältere Beitrag.
    const newer = at > 0 ? list[at - 1] : undefined;
    const older = at >= 0 ? list[at + 1] : undefined;

    return (
        <>
            <ReadingBar target={article} />
            <article ref={article} className={["u-shell", styles.page].join(" ")}>
                <NewsPostView post={post} />
                {(older || newer) && (
                    <nav className={styles.nextPrev} aria-label="Weitere Beiträge">
                        {older ? (
                            <Panel className={styles.step} interactive cut="sm">
                                <small>← Vorheriger</small>
                                <Link className={newsStyles.stretch} to={`/news/${older.slug}`}>
                                    {older.title}
                                </Link>
                            </Panel>
                        ) : (
                            <span />
                        )}
                        {newer && (
                            <Panel className={[styles.step, styles.stepNext].join(" ")} interactive cut="sm">
                                <small>Nächster →</small>
                                <Link className={newsStyles.stretch} to={`/news/${newer.slug}`}>
                                    {newer.title}
                                </Link>
                            </Panel>
                        )}
                    </nav>
                )}
            </article>
        </>
    );
}
