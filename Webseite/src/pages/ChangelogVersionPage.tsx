import { type CSSProperties, type JSX, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { ISiteVersion } from "../domain/interfaces/ISiteContent";
import { usePageMeta } from "../hooks/usePageMeta";
import { useLastVisit } from "../hooks/useLastVisit";
import { useChangelog } from "../services/siteContent";
import { Icon } from "../components/ui/Icon";
import { PageLoader } from "../components/ui/PageLoader";
import { Panel } from "../components/ui/Panel";
import { DiscordBox } from "../components/changelog/VersionCard";
import { KIND, KINDS, areaOf, countsOf, releaseDay, versionSummary } from "../components/changelog/meta";
import { NotFoundPage } from "./NotFoundPage";
import styles from "./ChangelogVersionPage.module.scss";

function CopyLink(): JSX.Element {
    const [copied, setCopied] = useState(false);

    const copy = (): void => {
        void navigator.clipboard?.writeText(window.location.href).then(
            () => setCopied(true),
            () => setCopied(false)
        );
    };

    return (
        <button type="button" onClick={copy}>
            <Icon name={copied ? "check" : "link"} size={14} />
            {copied ? "Kopiert" : "Link kopieren"}
        </button>
    );
}

function Neighbour({ version, label }: { readonly version: ISiteVersion; readonly label: string }): JSX.Element {
    return (
        <Panel className={styles.neighbour} interactive cut="sm">
            <img src={version.image} alt="" loading="lazy" decoding="async" />
            <div>
                <small>{label}</small>
                <Link className={styles.stretch} to={`/changelog/${version.version}`}>
                    <i>{version.version}</i>
                    {version.title}
                </Link>
            </div>
        </Panel>
    );
}

/**
 * W-0062: Seite einer Version nach C7: Kopf in drei Zeilen, das Bild aus dem
 * Post, die Änderungen nach Art, vorherige und nächste Version. Wer hier war,
 * gilt als zuletzt im Changelog gewesen (roter Punkt im Menü).
 */
export function ChangelogVersionPage(): JSX.Element {
    const { version: number } = useParams();
    const changelog = useChangelog();
    const version = changelog?.versions.find((candidate) => candidate.version === number);

    useLastVisit(true);
    usePageMeta(version ? `Version ${version.version}` : "Changelog", version?.title);

    if (changelog === undefined) return <PageLoader />;
    if (!version) return <NotFoundPage />;

    const at = changelog.versions.indexOf(version);
    const newer = at > 0 ? changelog.versions[at - 1] : undefined;
    const older = changelog.versions[at + 1];
    const counts = countsOf(version);

    return (
        <article className={["u-shell", styles.page].join(" ")}>
            <div className={styles.read}>
                <Link className={styles.back} to="/changelog">
                    ← Alle Versionen
                </Link>

                <header className={styles.head}>
                    <div className={styles.line}>
                        <span className={styles.number}>{version.version}</span>
                        <span className={styles.date}>{releaseDay(version.releasedOn)}</span>
                        {at === 0 && <span className={styles.newest}>Neueste</span>}
                    </div>
                    <h1>{version.title}</h1>
                    <p className={styles.sum}>{versionSummary(version)}</p>
                </header>

                <figure className={styles.figure}>
                    <img src={version.image} alt={`Changelog ${version.version} als Bild aus dem Discord-Post`} decoding="async" />
                    <figcaption>
                        <span>Das Bild aus dem Post in #changelog{version.postedBy ? `, gepostet von ${version.postedBy}` : ""}.</span>
                        <span className={styles.actions}>
                            {version.discordUrl && (
                                <a href={version.discordUrl} target="_blank" rel="noopener noreferrer">
                                    <Icon name="discord" size={14} />
                                    Zum Post
                                </a>
                            )}
                            <CopyLink />
                        </span>
                    </figcaption>
                </figure>

                {KINDS.filter((kind) => counts[kind] > 0).map((kind) => (
                    <section key={kind} className={styles.group} style={{ "--c": KIND[kind].color } as CSSProperties} aria-labelledby={`art-${kind}`}>
                        <h2 id={`art-${kind}`}>
                            {KIND[kind].label} <small>{counts[kind] === 1 ? `1 ${KIND[kind].one}` : `${counts[kind]} ${KIND[kind].unit}`}</small>
                        </h2>
                        <ol className={styles.list}>
                            {version.items
                                .filter((item) => item.kind === kind)
                                .map((item) => (
                                    <li key={item.text}>
                                        <p>{item.text}</p>
                                        <span className={styles.area} style={{ "--a": areaOf(item.area).color } as CSSProperties}>
                                            {areaOf(item.area).label}
                                        </span>
                                    </li>
                                ))}
                        </ol>
                    </section>
                ))}

                <nav className={styles.nav} aria-label="Weitere Versionen">
                    {older ? <Neighbour version={older} label="Vorherige Version" /> : <span />}
                    {newer ? (
                        <Neighbour version={newer} label="Nächste Version" />
                    ) : (
                        <div className={styles.none}>
                            <small>Nächste Version</small>
                            <b>Noch nichts Neueres</b>
                            <span>Die nächste Version steht zuerst auf Discord.</span>
                        </div>
                    )}
                </nav>

                <div className={styles.discord}>
                    <DiscordBox wide />
                </div>
            </div>
        </article>
    );
}
