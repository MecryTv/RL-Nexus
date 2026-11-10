import type { CSSProperties, JSX } from "react";
import { Link } from "react-router-dom";
import type { ISiteEntry } from "../../domain/interfaces/ISiteContent";
import { usePartners } from "../../services/siteContent";
import { EntryLogo } from "../partners/EntryLogo";
import { PartnerCard } from "../partners/PartnerCard";
import { MainSponsor } from "../partners/SponsorBlock";
import { ENTRY_COLOR } from "../partners/entry";
import partnerStyles from "../partners/partners.module.scss";
import { Section } from "../layout/Section";
import { Panel } from "../ui/Panel";
import { SectionHeading } from "../ui/SectionHeading";
import styles from "./PartnersBand.module.scss";

/** Zuerst, was im Admin Dashboard für die Startseite markiert ist, sonst in der gespeicherten Reihenfolge. */
const homeFirst = (entries: readonly ISiteEntry[]): ISiteEntry[] => [...entries.filter((entry) => entry.onHome), ...entries.filter((entry) => !entry.onHome)];

function Tier({ label, color }: { readonly label: string; readonly color: string }): JSX.Element {
    return (
        <div className={partnerStyles.tier} style={{ "--c": color } as CSSProperties}>
            {label}
        </div>
    );
}

/**
 * W-0062: „Wer dabei ist“ auf der Startseite (H1): Hauptsponsor breit, bis drei
 * Sponsoren, bis drei Partner und die Unterstützer. Ohne Einträge verschwindet
 * das Band ganz.
 */
export function PartnersBand(): JSX.Element | null {
    const content = usePartners();

    if (!content || content.entries.length === 0) return null;

    const main = content.entries.find((entry) => entry.kind === "sponsor" && entry.tier === "main") ?? null;
    const sponsors = homeFirst(content.entries.filter((entry) => entry.kind === "sponsor" && entry.tier !== "main")).slice(0, 3);
    const partners = homeFirst(content.entries.filter((entry) => entry.kind === "partner")).slice(0, 3);
    const supporters = homeFirst(content.entries.filter((entry) => entry.kind === "supporter")).slice(0, 6);

    return (
        <Section>
            <div className="u-shell">
                <div className={styles.head}>
                    <SectionHeading
                        eyebrow="Partner/Sponsorings"
                        title="Wer dabei ist"
                        lead="Firmen, die RL Nexus möglich machen, und Organisationen, Creator und Ligen, mit denen wir arbeiten."
                    />
                    <Link className={styles.all} to="/partner">
                        Alle Partner und Sponsoren →
                    </Link>
                </div>

                {(main || sponsors.length > 0) && (
                    <div className={[styles.who, main && sponsors.length > 0 ? styles.whoSplit : ""].join(" ")}>
                        {main && (
                            <div className={styles.column}>
                                <Tier label="Hauptsponsor" color="var(--c-mod-engagement)" />
                                <MainSponsor entry={main} />
                            </div>
                        )}
                        {sponsors.length > 0 && (
                            <div className={styles.column}>
                                <Tier label="Sponsoren" color="var(--c-text-dim)" />
                                {sponsors.map((entry) => (
                                    <Panel key={entry.slug} as="article" className={styles.sponsor} interactive cut="sm" style={{ "--c": ENTRY_COLOR[entry.color] } as CSSProperties}>
                                        <EntryLogo name={entry.name} logo={entry.logo} color={entry.color} size="md" />
                                        <div>
                                            <h3>
                                                <Link className={partnerStyles.stretch} to={`/partner/${entry.slug}`}>
                                                    {entry.name}
                                                </Link>
                                            </h3>
                                            <p>{entry.shortText}</p>
                                        </div>
                                    </Panel>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {partners.length > 0 && (
                    <>
                        <Tier label="Partner" color="var(--c-red)" />
                        <ul className={styles.partners}>
                            {partners.map((entry) => (
                                <li key={entry.slug}>
                                    <PartnerCard entry={entry} />
                                </li>
                            ))}
                        </ul>
                    </>
                )}

                {supporters.length > 0 && (
                    <div className={styles.supporters}>
                        <span className={styles.supportersLabel}>Unterstützer</span>
                        <ul>
                            {supporters.map((entry) => (
                                <li key={entry.slug}>
                                    <Link className={partnerStyles.stripItem} to={`/partner?unterstuetzer=${entry.slug}`} style={{ "--c": ENTRY_COLOR[entry.color] } as CSSProperties}>
                                        <EntryLogo name={entry.name} logo={entry.logo} color={entry.color} size="sm" />
                                        <span>
                                            <b>{entry.name}</b>
                                            {entry.stripText && <small>{entry.stripText}</small>}
                                        </span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </Section>
    );
}
