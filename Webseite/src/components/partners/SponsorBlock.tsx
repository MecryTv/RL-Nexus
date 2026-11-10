import { type CSSProperties, type JSX, useState } from "react";
import { Link } from "react-router-dom";
import type { ISiteEntry } from "../../domain/interfaces/ISiteContent";
import { Button } from "../ui/Button";
import { Panel } from "../ui/Panel";
import { EntryLogo } from "./EntryLogo";
import { ENTRY_COLOR, sectionOf } from "./entry";
import styles from "./partners.module.scss";

/** Rabattcode zum Kopieren. Ohne Zwischenablage (alter Browser, kein https) bleibt der Code zum Abschreiben stehen. */
export function OfferCode({ code, note }: { readonly code: string; readonly note?: string }): JSX.Element {
    const [copied, setCopied] = useState(false);

    const copy = (): void => {
        void navigator.clipboard?.writeText(code).then(
            () => setCopied(true),
            () => setCopied(false)
        );
    };

    return (
        <div className={styles.code}>
            <div>
                <small>{note ?? "Für die Community"}</small>
                <b>{code}</b>
            </div>
            <button type="button" className={styles.copy} onClick={copy}>
                {copied ? "Kopiert" : "Kopieren"}
            </button>
        </div>
    );
}

function MainSponsor({ entry }: { readonly entry: ISiteEntry }): JSX.Element {
    const together = sectionOf(entry, "together");
    const offer = sectionOf(entry, "offer");

    return (
        <Panel as="article" className={styles.main} cut="lg" style={{ "--c": ENTRY_COLOR[entry.color] } as CSSProperties}>
            <div className={styles.mainArt} style={entry.banner ? { backgroundImage: `url("${entry.banner}")` } : undefined}>
                <EntryLogo name={entry.name} logo={entry.logo} color={entry.color} size="xl" />
            </div>
            <div className={styles.mainBody}>
                <div className={styles.tags}>
                    <span className={styles.tag}>{entry.typeLabel}</span>
                    {entry.subtitle && <span className={[styles.tag, styles.quiet].join(" ")}>{entry.subtitle}</span>}
                </div>
                <h3>{entry.name}</h3>
                <p>{entry.shortText}</p>
                {together?.items && together.items.length > 0 && (
                    <div className={styles.does}>
                        {together.items.map((item) => (
                            <span key={item.label}>{item.label}</span>
                        ))}
                    </div>
                )}
                <div className={styles.mainActions}>
                    {offer?.code && <OfferCode code={offer.code} />}
                    <Button to={`/partner/${entry.slug}`} trailingIcon="arrow-right">
                        Mehr erfahren
                    </Button>
                </div>
            </div>
        </Panel>
    );
}

function SponsorCard({ entry }: { readonly entry: ISiteEntry }): JSX.Element {
    return (
        <Panel as="article" className={styles.sponsor} interactive cut="md" style={{ "--c": ENTRY_COLOR[entry.color] } as CSSProperties}>
            <EntryLogo name={entry.name} logo={entry.logo} color={entry.color} size="lg" />
            <div>
                {entry.subtitle && <span className={[styles.tag, styles.quiet].join(" ")}>{entry.subtitle}</span>}
                <h3 className={styles.cardTitle}>
                    <Link className={styles.stretch} to={`/partner/${entry.slug}`}>
                        {entry.name}
                    </Link>
                </h3>
                <p>{entry.shortText}</p>
            </div>
        </Panel>
    );
}

/** W-0062: Hauptsponsor groß, darunter die übrigen Sponsoren als Karten. */
export function SponsorBlock({ main, sponsors }: { readonly main: ISiteEntry | null; readonly sponsors: readonly ISiteEntry[] }): JSX.Element {
    return (
        <div className={styles.sponsors}>
            {main && (
                <>
                    <div className={styles.tier} style={{ "--c": "var(--c-mod-engagement)" } as CSSProperties}>
                        Hauptsponsor
                    </div>
                    <MainSponsor entry={main} />
                </>
            )}
            {sponsors.length > 0 && (
                <>
                    <div className={styles.tier} style={{ "--c": "var(--c-text-dim)" } as CSSProperties}>
                        Sponsoren
                    </div>
                    <div className={styles.sponsorGrid}>
                        {sponsors.map((entry) => (
                            <SponsorCard key={entry.slug} entry={entry} />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
