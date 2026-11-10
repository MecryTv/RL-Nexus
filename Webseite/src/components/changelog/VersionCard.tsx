import type { CSSProperties, JSX } from "react";
import { Link } from "react-router-dom";
import type { ISiteVersion } from "../../domain/interfaces/ISiteContent";
import { siteConfig } from "../../services/SiteConfig";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Panel } from "../ui/Panel";
import { NewMark } from "../news/NewMark";
import { Counts, ShareBar } from "./ShareBar";
import { KIND, releaseDay, versionSummary } from "./meta";
import styles from "./changelog.module.scss";

export interface IVersionCardProps {
    readonly version: ISiteVersion;
    readonly fresh: boolean;
}

const alt = (version: ISiteVersion): string => `Changelog ${version.version} als Bild aus dem Discord-Post`;

/** W-0062: Die neueste Version groß: Post-Bild links, rechts Nummer, Titel, Anteile und die ersten drei Änderungen. */
export function LatestVersion({ version, fresh }: IVersionCardProps): JSX.Element {
    return (
        <Panel as="article" className={styles.latest} interactive cut="md">
            <img className={styles.post} src={version.image} alt={alt(version)} loading="lazy" decoding="async" />
            <div className={styles.latestBody}>
                <div className={styles.meta}>
                    <span className={styles.newest}>Neueste Version</span>
                    <span>{releaseDay(version.releasedOn)}</span>
                    {fresh && <NewMark />}
                </div>
                <span className={styles.latestNumber}>{version.version}</span>
                <h2>
                    <Link className={styles.stretch} to={`/changelog/${version.version}`}>
                        {version.title}
                    </Link>
                </h2>
                <ShareBar version={version} />
                <p className={styles.sum}>{versionSummary(version)}</p>
                <ul className={styles.peek}>
                    {version.items.slice(0, 3).map((item) => (
                        <li key={item.text} style={{ "--c": KIND[item.kind].color } as CSSProperties}>
                            {item.text}
                        </li>
                    ))}
                </ul>
                <span className={styles.more}>{version.items.length > 0 ? `Alle ${version.items.length} Änderungen` : "Zur Version"} →</span>
            </div>
        </Panel>
    );
}

/** W-0062: Eine ältere Version als Bildkarte; am Handy als Zeile mit kleinem Bild. */
export function VersionCard({ version, fresh }: IVersionCardProps): JSX.Element {
    return (
        <Panel as="article" className={styles.card} interactive cut="sm">
            <img className={styles.post} src={version.image} alt={alt(version)} loading="lazy" decoding="async" />
            <div className={styles.cardBody}>
                <div className={styles.cardNumber}>
                    {version.version} <span className={styles.cardDate}>{releaseDay(version.releasedOn)}</span>
                    {fresh && <NewMark />}
                </div>
                <h3>
                    <Link className={styles.stretch} to={`/changelog/${version.version}`}>
                        {version.title}
                    </Link>
                </h3>
                <ShareBar version={version} className={styles.cardShare} />
                <Counts version={version} />
            </div>
        </Panel>
    );
}

/** W-0062: „Zuerst auf Discord“: jede Version kommt dort als Bild, mit Link hierher. */
/** `narrow`: für die schmale Leiste, Knopf unter dem Text. */
export function DiscordBox({ wide = false, narrow = false }: { readonly wide?: boolean; readonly narrow?: boolean }): JSX.Element {
    return (
        <div className={[styles.discord, wide && styles.discordWide, narrow && styles.discordNarrow].filter(Boolean).join(" ")}>
            <span className={styles.discordIcon} aria-hidden="true">
                <Icon name="discord" size={22} />
            </span>
            <div>
                <h3>Zuerst auf Discord</h3>
                <p>{narrow ? "Jede Version kommt als Bild in #changelog, mit Link hierher." : "Jede Version kommt als Bild in #changelog auf dem RL-Nexus-Server, mit Link hierher."}</p>
            </div>
            <div>
                <Button href={siteConfig.supportURL} icon="discord">
                    {narrow ? "Beitreten" : "Discord beitreten"}
                </Button>
            </div>
        </div>
    );
}
