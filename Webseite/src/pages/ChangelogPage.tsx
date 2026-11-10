import { type JSX, useState } from "react";
import { usePageMeta } from "../hooks/usePageMeta";
import { useLastVisit } from "../hooks/useLastVisit";
import { isNew, versionMonths } from "../services/news";
import { useChangelog } from "../services/siteContent";
import { siteConfig } from "../services/SiteConfig";
import { PageHeader } from "../components/layout/PageHeader";
import { Section } from "../components/layout/Section";
import { Button } from "../components/ui/Button";
import { PageLoader } from "../components/ui/PageLoader";
import { DiscordBox, LatestVersion, VersionCard } from "../components/changelog/VersionCard";
import { releaseDay } from "../components/changelog/meta";
import styles from "./ChangelogPage.module.scss";

/** Zuerst zwölf Monate, „Ältere laden“ holt die nächsten zwölf. */
const MONTHS = 12;

const shortMonth = new Intl.DateTimeFormat("de-DE", { month: "short", timeZone: "Europe/Berlin" });

/**
 * W-0062: /changelog nach C10. Links eine Leiste mit der Zahl der Versionen,
 * den Monaten zum Springen und dem Discord-Kasten, rechts die neueste Version
 * groß und darunter die übrigen nach Monat. Am Handy wird die Leiste zur Zeile.
 */
export function ChangelogPage(): JSX.Element {
    usePageMeta("Changelog", "Jede Version des RL-Nexus-Bots mit allen Änderungen: neue Funktionen, Verbesserungen und behobene Fehler.");

    const changelog = useChangelog();
    const lastVisit = useLastVisit(true);
    const [limit, setLimit] = useState(MONTHS);

    if (changelog === undefined) return <PageLoader />;

    const [latest, ...rest] = changelog.versions;
    const months = versionMonths({ versions: rest });
    const all = versionMonths(changelog);
    const shown = months.slice(0, limit);
    const oldest = changelog.versions[changelog.versions.length - 1];
    const jump = (key: string): void => {
        const index = months.findIndex((month) => month.key === key);

        if (index >= limit) setLimit(index + 1);
        requestAnimationFrame(() => document.getElementById(`monat-${key}`)?.scrollIntoView({ block: "start" }));
    };

    return (
        <>
            <PageHeader
                eyebrow="Changelog"
                title={
                    <>
                        Was sich am <em>Bot</em> ändert.
                    </>
                }
                lead={
                    latest && oldest
                        ? `Jede Version, die wir in Discord gepostet haben, mit allen Änderungen. ${changelog.versions.length === 1 ? "Eine Version" : `${changelog.versions.length} Versionen`} seit ${all[all.length - 1]?.label ?? ""}, die neueste vom ${releaseDay(latest.releasedOn)}.`
                        : "Jede Version, die wir in Discord gepostet haben, mit allen Änderungen."
                }
            >
                <div className={styles.headerActions}>
                    <Button href={siteConfig.supportURL} variant="outline" icon="discord">
                        #changelog auf Discord
                    </Button>
                </div>
            </PageHeader>

            <Section flush>
                <div className={["u-shell", styles.gallery].join(" ")}>
                    {!latest ? (
                        <div className={styles.empty}>
                            <p>Noch keine Version veröffentlicht. Die erste steht zuerst auf Discord und dann hier.</p>
                            <DiscordBox wide />
                        </div>
                    ) : (
                        <>
                            <aside className={styles.rail}>
                                <div className={styles.total}>
                                    {changelog.versions.length}
                                    <small>{changelog.versions.length === 1 ? "Version" : "Versionen"}</small>
                                </div>
                                <ul className={styles.months}>
                                    {all.map((month, index) => (
                                        <li key={month.key}>
                                            <button type="button" aria-current={index === 0 ? "true" : undefined} onClick={() => (index === 0 ? window.scrollTo({ top: 0 }) : jump(month.key))}>
                                                <span className={styles.monthLong}>{month.label}</span>
                                                <span className={styles.monthShort}>{shortMonth.format(new Date(`${month.key}-15T12:00:00Z`))}</span>
                                                <span className={styles.monthCount}>{month.versions.length}</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                                <div className={styles.railDiscord}>
                                    <DiscordBox narrow />
                                </div>
                            </aside>

                            <div className={styles.main}>
                                <LatestVersion version={latest} fresh={isNew(latest.postedAt, lastVisit)} />

                                {shown.map((month) => (
                                    <section key={month.key} id={`monat-${month.key}`} className={styles.month} aria-labelledby={`kopf-${month.key}`}>
                                        <h2 id={`kopf-${month.key}`} className={styles.monthHead}>
                                            {month.label} <span>{month.versions.length === 1 ? "1 Version" : `${month.versions.length} Versionen`}</span>
                                        </h2>
                                        <ul className={styles.grid}>
                                            {month.versions.map((version) => (
                                                <li key={version.version}>
                                                    <VersionCard version={version} fresh={isNew(version.postedAt, lastVisit)} />
                                                </li>
                                            ))}
                                        </ul>
                                    </section>
                                ))}

                                {months.length > shown.length && (
                                    <div className={styles.loadMore}>
                                        <Button variant="outline" onClick={() => setLimit((current) => current + MONTHS)}>
                                            Ältere laden
                                        </Button>
                                    </div>
                                )}

                                <div className={styles.endDiscord}>
                                    <DiscordBox wide />
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </Section>
        </>
    );
}
