import { type CSSProperties, type JSX, useId } from "react";
import { Link } from "react-router-dom";
import type { ISiteEntry } from "../../domain/interfaces/ISiteContent";
import { Overlay } from "../../shop/Overlay";
import { Icon } from "../ui/Icon";
import { Pick } from "../preview/Pick";
import { EntryLogo } from "./EntryLogo";
import { OfferCode } from "./SponsorBlock";
import { ENTRY_COLOR, linksOf, monthYear, sectionOf } from "./entry";
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
    const intro = sectionOf(entry, "intro");
    const help = sectionOf(entry, "help");
    const offer = sectionOf(entry, "offer");
    const since = monthYear(entry.since);
    // In der Vorschau wählbar wie die Abschnitte eines Partners; ohne eigenen Abschnitt ist es der Kopf.
    const partOf = (section: typeof intro): string => (section ? `abschnitt:${entry.sections.indexOf(section)}` : "kopf");

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
            <div className={styles.supporterBody}>
                <Pick part={partOf(intro)}>
                    <p>{intro?.visible !== false && intro?.text ? intro.text : entry.shortText}</p>
                </Pick>
                <dl className={styles.facts}>
                    {since && (
                        <div>
                            <dt>Seit</dt>
                            <dd>{since}</dd>
                        </div>
                    )}
                    <div>
                        <dt>Art</dt>
                        <dd>{entry.typeLabel}</dd>
                    </div>
                    <div>
                        <dt>Turniere</dt>
                        <dd>{entry.tournaments.length}</dd>
                    </div>
                </dl>
                {help?.items && help.items.length > 0 && (
                    <Pick part={partOf(help)}>
                        <div>
                            <h3 className={styles.miniHead}>{help.title ?? `Wie ${entry.name} hilft`}</h3>
                            <ul className={styles.helpList}>
                                {help.items.map((item) => (
                                    <li key={item.label}>{item.label}</li>
                                ))}
                            </ul>
                        </div>
                    </Pick>
                )}
                {entry.tournaments.length > 0 && (
                    <div>
                        <h3 className={styles.miniHead}>Unterstützt bei</h3>
                        <div className={styles.tags}>
                            {entry.tournaments.map((tournament) => (
                                <Link key={tournament.slug} className={styles.tag} to={`/news/${tournament.slug}`}>
                                    {tournament.title}
                                </Link>
                            ))}
                        </div>
                    </div>
                )}
                {offer?.code && (
                    <Pick part={partOf(offer)}>
                        <OfferCode code={offer.code} note={offer.title} />
                    </Pick>
                )}
            </div>
            <div className={styles.supporterFoot}>
                {linksOf(entry).map((link) => (
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
