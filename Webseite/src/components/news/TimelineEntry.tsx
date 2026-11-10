import type { CSSProperties, JSX } from "react";
import { Link } from "react-router-dom";
import type { ITimelineEntry } from "../../services/news";
import { Panel } from "../ui/Panel";
import { initials } from "../partners/entry";
import { NewMark } from "./NewMark";
import { CATEGORY, CHANGELOG_COLOR, dayParts } from "./meta";
import styles from "./news.module.scss";

/** Titelbild, ohne Bild ein Verlauf in der Farbe der Art mit Kürzel. */
export function Cover({ src, art, className }: { readonly src: string | null; readonly art: string; readonly className?: string }): JSX.Element {
    return (
        <div className={[styles.cover, className].filter(Boolean).join(" ")} data-art={src ? undefined : art} aria-hidden="true">
            {src && <img src={src} alt="" loading="lazy" decoding="async" />}
        </div>
    );
}

/**
 * W-0062: Ein Eintrag im Zeitstrahl: Beitrag groß mit Bild, Kurzmeldung, Termin
 * mit Datumskasten oder eine neue Bot-Version aus dem Changelog. Die Überschrift
 * ist der Link und spannt sich über die ganze Karte.
 */
export function TimelineEntry({ entry, fresh }: { readonly entry: ITimelineEntry; readonly fresh: boolean }): JSX.Element {
    const when = dayParts(entry.date);
    const item = entry.item;
    const color = item ? CATEGORY[item.category].color : CHANGELOG_COLOR;
    const href = item ? `/news/${item.slug}` : `/changelog/${entry.slug}`;
    const title = (
        <h3 className={styles.entryTitle}>
            <Link className={styles.stretch} to={href}>
                {entry.title}
            </Link>
        </h3>
    );
    const tag = <span className={styles.tag}>{item ? CATEGORY[item.category].label : "Changelog"}</span>;

    let card: JSX.Element;

    if (entry.version) {
        card = (
            <Panel className={styles.card} interactive cut="sm">
                <div className={styles.cardBody}>
                    <div className={styles.meta}>
                        {tag}
                        <span className={styles.version}>v{entry.version.version}</span>
                        {fresh && <NewMark />}
                    </div>
                    {title}
                    <ul className={styles.changes}>
                        {entry.version.items.slice(0, 3).map((change) => (
                            <li key={change.text}>{change.text}</li>
                        ))}
                    </ul>
                    <span className={styles.more}>
                        {entry.version.items.length > 3 ? `Alle ${entry.version.items.length} Änderungen` : "Zum Changelog"} →
                    </span>
                </div>
            </Panel>
        );
    } else if (item && item.kind === "kurz") {
        card = (
            <Panel className={[styles.card, styles.short].join(" ")} interactive cut="sm">
                <span className={styles.tag}>Kurz</span>
                {title}
                {fresh && <NewMark />}
            </Panel>
        );
    } else if (item && item.kind === "termin" && item.event) {
        const event = dayParts(item.event.startsAt);

        card = (
            <Panel className={[styles.card, styles.withDate].join(" ")} interactive cut="sm">
                <div className={styles.cardBody}>
                    <div className={styles.meta}>
                        {tag}
                        {fresh && <NewMark />}
                    </div>
                    {title}
                    {item.summary && <p>{item.summary}</p>}
                </div>
                <span className={styles.dateBox}>
                    <small>Termin</small>
                    <strong>
                        {event.day}. {event.month}
                    </strong>
                </span>
            </Panel>
        );
    } else {
        card = (
            <Panel className={[styles.card, styles.big].join(" ")} interactive cut="sm">
                <div className={styles.cardBody}>
                    <div className={styles.meta}>
                        {tag}
                        {fresh && <NewMark />}
                    </div>
                    {title}
                    {item?.summary && <p>{item.summary}</p>}
                </div>
                <Cover src={item?.cover ?? null} art={item?.entry ? initials(item.entry.name) : "RL"} className={styles.entryCover} />
            </Panel>
        );
    }

    return (
        <li className={styles.entry} style={{ "--c": color } as CSSProperties}>
            <span className={styles.when}>
                <strong>{when.day}</strong>
                <small>{when.month}</small>
            </span>
            <span className={styles.node} aria-hidden="true" />
            {card}
        </li>
    );
}
