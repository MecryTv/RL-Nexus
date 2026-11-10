import type { CSSProperties, JSX } from "react";
import type { ISiteEntry } from "../../domain/interfaces/ISiteContent";
import { EntryLogo } from "./EntryLogo";
import { ENTRY_COLOR } from "./entry";
import styles from "./partners.module.scss";

/**
 * W-0062: Die Unterstützer als schmale Leiste. Beim Drüberfahren oder mit der
 * Tastatur steht der Kurztext darunter; ein Klick öffnet das Fenster (S6).
 */
export function SupporterStrip({ supporters, onOpen }: { readonly supporters: readonly ISiteEntry[]; readonly onOpen: (slug: string) => void }): JSX.Element {
    return (
        <ul className={styles.strip}>
            {supporters.map((entry) => (
                <li key={entry.slug}>
                    <button type="button" className={styles.stripItem} style={{ "--c": ENTRY_COLOR[entry.color] } as CSSProperties} onClick={() => onOpen(entry.slug)}>
                        <EntryLogo name={entry.name} logo={entry.logo} color={entry.color} size="sm" />
                        <b>{entry.name}</b>
                        {entry.stripText && (
                            <span className={styles.tip}>
                                {entry.stripText}
                                <em>Ansehen →</em>
                            </span>
                        )}
                    </button>
                </li>
            ))}
        </ul>
    );
}
