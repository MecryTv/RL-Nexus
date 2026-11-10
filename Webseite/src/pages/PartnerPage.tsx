import type { CSSProperties, JSX } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import type { ISiteEntry, ISiteServer } from "../domain/interfaces/ISiteContent";
import { usePageMeta } from "../hooks/usePageMeta";
import { useLiveStats, usePartners } from "../services/siteContent";
import { Section } from "../components/layout/Section";
import { Button } from "../components/ui/Button";
import { PageLoader } from "../components/ui/PageLoader";
import { Panel } from "../components/ui/Panel";
import { EntryLogo } from "../components/partners/EntryLogo";
import { EntrySections } from "../components/partners/EntrySections";
import { Pick } from "../components/preview/Pick";
import { PartnerCard } from "../components/partners/PartnerCard";
import { ENTRY_COLOR, linksOf, monthYear, sectionOf } from "../components/partners/entry";
import partnerStyles from "../components/partners/partners.module.scss";
import { NotFoundPage } from "./NotFoundPage";
import styles from "./PartnerPage.module.scss";

const SHORT_LINK: Readonly<Record<string, string>> = { x: "X", twitch: "TW", youtube: "YT", tiktok: "TT" };

/**
 * W-0062: Die große Ansicht eines Partners oder Sponsors ohne Layout drumherum,
 * wie `ModuleDetailView`. Die Vorschau im Admin Dashboard (Teil 2) zeigt genau das.
 */
export function EntryView({ entry, live }: { readonly entry: ISiteEntry; readonly live: ISiteServer | null }): JSX.Element {
    const color = ENTRY_COLOR[entry.color];
    const sponsor = entry.kind === "sponsor";
    const statsSection = sectionOf(entry, "stats");
    const stats = statsSection?.items ?? [];
    const links = linksOf(entry);
    const website = links.find((link) => link.key === "website");
    const discord = links.find((link) => link.key === "discord");
    const small = links.filter((link) => link.key !== "website" && link.key !== "discord");
    const since = monthYear(entry.since);

    return (
        <article className={styles.view} style={{ "--c": color } as CSSProperties}>
            <Pick part="kopf">
                <div className={styles.banner} style={entry.banner ? { backgroundImage: `url("${entry.banner}")` } : undefined}>
                    <div className={["u-shell", styles.backRow].join(" ")}>
                        <Link className={styles.back} to="/partner">
                            ← Partner/Sponsorings
                        </Link>
                    </div>
                </div>

                <header className={["u-shell", styles.head].join(" ")}>
                    <EntryLogo name={entry.name} logo={entry.logo} color={entry.color} size="xl" />
                    <div className={styles.identity}>
                        <div className={partnerStyles.tags}>
                            <span className={partnerStyles.tag}>{entry.typeLabel}</span>
                            {entry.subtitle && <span className={[partnerStyles.tag, partnerStyles.quiet].join(" ")}>{entry.subtitle}</span>}
                        </div>
                        <h1>{entry.name}</h1>
                        {since && (
                            <p className={styles.sub}>
                                {sponsor ? "Sponsor" : "Partner"} seit {since}
                            </p>
                        )}
                    </div>
                    <div className={styles.actions}>
                        {sponsor && website && (
                            <Button href={website.href} trailingIcon="arrow-up-right">
                                Webseite besuchen
                            </Button>
                        )}
                        {discord && (
                            <Button href={discord.href} variant={sponsor ? "outline" : "primary"} icon="discord">
                                Discord beitreten
                            </Button>
                        )}
                        {!sponsor && website && (
                            <Button href={website.href} variant="outline" trailingIcon="arrow-up-right">
                                Webseite
                            </Button>
                        )}
                        {small.length > 0 && (
                            <div className={styles.icons}>
                                {small.map((link) => (
                                    <a key={link.key} href={link.href} target="_blank" rel="noopener noreferrer" aria-label={link.label} title={link.label}>
                                        {SHORT_LINK[link.key] ?? link.label}
                                    </a>
                                ))}
                            </div>
                        )}
                    </div>
                </header>
            </Pick>

            {statsSection && stats.length > 0 && (
                <Pick part={`abschnitt:${entry.sections.indexOf(statsSection)}`}>
                    <div className="u-shell">
                        <Panel as="dl" className={styles.stats} cut="sm" style={{ "--n": stats.length } as CSSProperties}>
                            {stats.map((item) => (
                                <div key={item.label}>
                                    <dt>{item.label}</dt>
                                    <dd>{item.value ?? item.text ?? ""}</dd>
                                </div>
                            ))}
                        </Panel>
                    </div>
                </Pick>
            )}

            <div className={["u-shell", styles.body].join(" ")}>
                <div className={styles.main}>
                    {entry.sections.some((section) => section.type === "about") ? null : <p className={styles.lead}>{entry.shortText}</p>}
                    <EntrySections entry={entry} live={live} place="main" />
                </div>
                <aside className={styles.aside}>
                    <EntrySections entry={entry} live={live} place="aside" />
                </aside>
            </div>
        </article>
    );
}

/** `/partner/:slug`. Ein Unterstützer hat keine eigene Seite und öffnet sich als Fenster auf der Übersicht. */
export function PartnerPage(): JSX.Element {
    const { slug } = useParams();
    const content = usePartners();
    const live = useLiveStats();
    const entry = content?.entries.find((candidate) => candidate.slug === slug);

    usePageMeta(entry?.name ?? "Partner/Sponsorings", entry?.shortText);

    if (content === undefined) return <PageLoader />;
    if (!entry) return <NotFoundPage />;
    if (entry.kind === "supporter") return <Navigate to={`/partner?unterstuetzer=${entry.slug}`} replace />;

    const more = content.entries.filter((other) => other.kind === entry.kind && other.slug !== entry.slug).slice(0, 3);

    return (
        <>
            <EntryView entry={entry} live={live?.servers[entry.slug] ?? null} />

            {more.length > 0 && (
                <Section>
                    <div className="u-shell">
                        <div className={styles.moreHead}>
                            <h2>{entry.kind === "sponsor" ? "Weitere Sponsoren" : "Weitere Partner"}</h2>
                            <Link to="/partner">Alle Partner/Sponsorings →</Link>
                        </div>
                        <ul className={styles.more}>
                            {more.map((other) => (
                                <li key={other.slug}>
                                    <PartnerCard entry={other} />
                                </li>
                            ))}
                        </ul>
                    </div>
                </Section>
            )}
        </>
    );
}
