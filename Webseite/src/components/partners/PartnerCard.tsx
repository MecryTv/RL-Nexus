import type { CSSProperties, JSX } from "react";
import { Link } from "react-router-dom";
import type { ISiteEntry } from "../../domain/interfaces/ISiteContent";
import { Panel } from "../ui/Panel";
import { EntryLogo } from "./EntryLogo";
import { ENTRY_COLOR, linksOf } from "./entry";
import styles from "./partners.module.scss";

/**
 * W-0062: Ein Partner als Karte. Wie ModuleCard liegt der Link über der ganzen
 * Karte (aufgespanntes ::after an der Überschrift); die Links unten liegen
 * darüber und bleiben einzeln klickbar.
 */
export function PartnerCard({ entry }: { readonly entry: ISiteEntry }): JSX.Element {
    const color = ENTRY_COLOR[entry.color];

    return (
        <Panel as="article" className={styles.card} accent={color} interactive cut="md" style={{ "--c": color } as CSSProperties}>
            <div className={styles.cardBanner} style={entry.banner ? { backgroundImage: `url("${entry.banner}")` } : undefined} />
            <div className={styles.cardHead}>
                <EntryLogo name={entry.name} logo={entry.logo} color={entry.color} size="md" />
                <div>
                    <h3 className={styles.cardTitle}>
                        <Link className={styles.stretch} to={`/partner/${entry.slug}`}>
                            {entry.name}
                        </Link>
                    </h3>
                    <span className={styles.tag}>{entry.typeLabel}</span>
                </div>
            </div>
            <div className={styles.cardBody}>
                <p>{entry.shortText}</p>
                <div className={styles.cardFoot}>
                    <div className={styles.links}>
                        {linksOf(entry)
                            .slice(0, 2)
                            .map((link) => (
                                <a key={link.key} href={link.href} target="_blank" rel="noopener noreferrer">
                                    {link.label}
                                </a>
                            ))}
                    </div>
                    <span className={styles.more} aria-hidden="true">
                        Ansehen →
                    </span>
                </div>
            </div>
        </Panel>
    );
}
