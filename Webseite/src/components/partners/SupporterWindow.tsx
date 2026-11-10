import { type CSSProperties, type JSX, useId } from "react";
import { Link } from "react-router-dom";
import type { ISiteEntry, SectionType } from "../../domain/interfaces/ISiteContent";
import { Overlay } from "../../shop/Overlay";
import { Icon } from "../ui/Icon";
import { Pick } from "../preview/Pick";
import { EntryLogo } from "./EntryLogo";
import { OfferCode } from "./SponsorBlock";
import { ENTRY_COLOR, linksOf, monthYear, offerActive, sectionOf, supporterBlocks } from "./entry";
import styles from "./partners.module.scss";

export interface ISupporterViewProps {
    readonly entry: ISiteEntry;
    /** 1-basiert, für „‹ 1 / 5 ›“. */
    readonly position: number;
    readonly count: number;
    readonly onPrev?: () => void;
    readonly onNext?: () => void;
    readonly onClose?: () => void;
    readonly titleId?: string;
}

/** Der Inhalt des Fensters, ohne Fenster: Die Vorschau im Admin Dashboard (Teil 2) zeigt ihn genauso. */
export function SupporterView({ entry, position, count, onPrev, onNext, onClose, titleId }: ISupporterViewProps): JSX.Element {
    const since = monthYear(entry.since);
    const blocks = supporterBlocks(entry);
    const links = sectionOf(entry, "links") ? linksOf(entry) : [];

    const block = (type: SectionType, index: number): JSX.Element | null => {
        const section = entry.sections[index];

        if (!section) return null;

        switch (type) {
            case "intro":
                return <p>{section.text || entry.shortText}</p>;
            case "stats": {
                const facts = section.items?.length
                    ? section.items.map((item) => ({ label: item.label, value: item.value ?? item.text ?? "" }))
                    : [...(since ? [{ label: "Seit", value: since }] : []), { label: "Art", value: entry.typeLabel }, { label: "Turniere", value: String(entry.tournaments.length) }];

                return (
                    <dl className={styles.facts}>
                        {facts.map((fact) => (
                            <div key={fact.label}>
                                <dt>{fact.label}</dt>
                                <dd>{fact.value}</dd>
                            </div>
                        ))}
                    </dl>
                );
            }
            case "help":
                return section.items?.length ? (
                    <div>
                        <h3 className={styles.miniHead}>{section.title ?? `Wie ${entry.name} hilft`}</h3>
                        <ul className={styles.helpList}>
                            {section.items.map((item) => (
                                <li key={item.label}>{item.label}</li>
                            ))}
                        </ul>
                    </div>
                ) : null;
            case "tournaments":
                return entry.tournaments.length > 0 ? (
                    <div>
                        <h3 className={styles.miniHead}>{section.title ?? "Unterstützt bei"}</h3>
                        <div className={styles.tags}>
                            {entry.tournaments.map((tournament) => (
                                <Link key={tournament.slug} className={styles.tag} to={`/news/${tournament.slug}`}>
                                    {tournament.title}
                                </Link>
                            ))}
                        </div>
                    </div>
                ) : null;
            case "offer":
                return offerActive(section) ? (
                    <div>
                        {section.text && <p>{section.text}</p>}
                        {section.code && <OfferCode code={section.code} note={section.title} />}
                    </div>
                ) : null;
            default:
                return null;
        }
    };

    return (
        <div className={styles.supporter} style={{ "--c": ENTRY_COLOR[entry.color] } as CSSProperties}>
            {onClose && (
                <button type="button" className={styles.close} onClick={onClose} aria-label="Fenster schließen">
                    <Icon name="close" size={20} />
                </button>
            )}
            <Pick part="kopf">
                <div className={styles.supporterArt} style={entry.banner ? { backgroundImage: `url("${entry.banner}")` } : undefined} />
                <div className={styles.supporterHead}>
                    <EntryLogo name={entry.name} logo={entry.logo} color={entry.color} size="lg" />
                    <div>
                        <span className={[styles.tag, styles.quiet].join(" ")}>Unterstützer{entry.subtitle ? ` · ${entry.subtitle}` : ""}</span>
                        <h2 id={titleId}>{entry.name}</h2>
                    </div>
                </div>
            </Pick>
            {/* Die Blöcke folgen den Abschnitten aus dem Studio: Reihenfolge und Ausblenden gelten auch hier. */}
            <div className={styles.supporterBody}>
                {!blocks.some((item) => item.type === "intro") && <p>{entry.shortText}</p>}
                {blocks.map((item) => (
                    <Pick key={`${item.type}-${item.index}`} part={`abschnitt:${item.index}`}>
                        {block(item.type, item.index)}
                    </Pick>
                ))}
            </div>
            <div className={styles.supporterFoot}>
                {links.map((link) => (
                    <a key={link.key} className={link.key === "website" ? styles.footMain : styles.footLink} href={link.href} target="_blank" rel="noopener noreferrer">
                        {link.label}
                        {link.key === "website" && " ↗"}
                    </a>
                ))}
                {count > 1 && (
                    <span className={styles.pager}>
                        <button type="button" onClick={onPrev} aria-label="Vorheriger Unterstützer">
                            ‹
                        </button>
                        {position} / {count}
                        <button type="button" onClick={onNext} aria-label="Nächster Unterstützer">
                            ›
                        </button>
                    </span>
                )}
            </div>
        </div>
    );
}

/** W-0062: Große Ansicht eines Unterstützers als Fenster über der Seite, am Handy als Blatt von unten. */
export function SupporterWindow(props: Omit<ISupporterViewProps, "titleId"> & { readonly onClose: () => void }): JSX.Element {
    const titleId = useId();

    return (
        <Overlay labelledBy={titleId} onClose={props.onClose} className={styles.window}>
            <SupporterView {...props} titleId={titleId} />
        </Overlay>
    );
}
