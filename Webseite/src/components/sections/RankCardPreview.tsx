import type { CSSProperties, JSX } from "react";
import { RANK_META, RLRank } from "../../domain/enums/RLRank";
import { RANK_PREVIEW } from "../../data/preview.data";
import { rankBadge, statIcon } from "../../services/RankAssets";
import { Icon } from "../ui/Icon";
import { siteConfig } from "../../services/SiteConfig";
import styles from "./RankCardPreview.module.scss";

/**
 * Die Rang-Karte des Bots, nachgebaut.
 *
 * Der Blickfang der Startseite, und der ehrlichste, den es gibt. Das ist genau
 * das, was der Bot in Discord postet, kein Symbolbild. Die Rang-Abzeichen und
 * die Statistiksymbole sind dieselben Dateien, die auch der Bot beim Zeichnen
 * verwendet.
 *
 * Nachgebaut aus HTML statt als Bild eingebunden, weil ein Bild mit 1536 mal
 * 1024 Bildpunkten rund ein halbes Megabyte kostet, auf kleinen Bildschirmen
 * unleserlich wird und beim Ändern einer Farbe neu gerendert werden müsste.
 *
 * `aria-hidden`, weil daneben im Fließtext steht, was die Karte zeigt. Ein
 * Bildschirmleser, der hier zwei Dutzend Zahlen ohne Zusammenhang vorliest,
 * hilft niemandem.
 */
export function RankCardPreview(): JSX.Element {
    const { player, handle, badge, reward, playlists, career, freshness } = RANK_PREVIEW;
    const rewardMeta = RANK_META[reward.rank];

    return (
        <div className={styles.frame} aria-hidden="true">
            <div className={styles.card}>
                {/* Kopf: Spieler und Season-Reward */}
                <header className={styles.head}>
                    <div className={styles.identity}>
                        <span className={styles.avatar}>
                            <img src={siteConfig.markURL} alt="" width={52} height={52} loading="lazy" />
                        </span>
                        <span className={styles.who}>
                            <span className={styles.tag}>[{badge}]</span>
                            <span className={styles.player}>{player}</span>
                            <span className={styles.handle}>{handle}</span>
                        </span>
                    </div>

                    <div
                        className={styles.reward}
                        style={{ ["--tier" as string]: rewardMeta.color } as CSSProperties}
                    >
                        <span className={styles.rewardLabel}>Season Reward Level</span>
                        <span className={styles.rewardRow}>
                            <img
                                className={styles.rewardBadge}
                                src={rankBadge(reward.rank)}
                                alt=""
                                width={34}
                                height={34}
                                loading="lazy"
                            />
                            <span className={styles.rewardName}>{reward.label}</span>
                        </span>
                        <span className={styles.rewardBar}>
                            <span className={styles.bar}>
                                <span className={styles.fill} style={{ width: `${reward.progress * 100}%` }} />
                            </span>
                            <span className={styles.percent}>{Math.round(reward.progress * 100)}%</span>
                        </span>
                    </div>
                </header>

                {/* Abschnittsüberschrift, wie auf der echten Karte */}
                <div className={styles.sectionHead}>
                    <Icon name="trophy" size={26} />
                    <span className={styles.sectionText}>
                        <span className={styles.sectionTitle}>Ranked</span>
                        <span className={styles.sectionSub}>Rocket League</span>
                    </span>
                    <span className={styles.sectionRule} />
                </div>

                {/* Die drei Playlists */}
                <ul className={styles.playlists}>
                    {playlists.map((entry) => {
                        const meta = RANK_META[entry.rank];
                        const placement = entry.placement;

                        return (
                            <li
                                key={entry.playlist}
                                className={styles.playlist}
                                style={{ ["--tier" as string]: meta.color } as CSSProperties}
                            >
                                <span className={styles.playlistHead}>
                                    <span className={styles.playlistName}>{entry.playlist}</span>
                                    <span className={styles.playlistSub}>{entry.subtitle}</span>
                                </span>

                                {/* Solange die Platzierung läuft, zeigt das Spiel selbst
                                    kein eigenes Abzeichen. Die Karte hält sich daran und
                                    nimmt das Unranked-Bild. */}
                                <span
                                    className={[styles.rankBox, placement !== undefined && styles.placementBox]
                                        .filter(Boolean)
                                        .join(" ")}
                                >
                                    <img
                                        className={styles.rankBadge}
                                        src={rankBadge(placement !== undefined ? RLRank.Unranked : entry.rank)}
                                        alt=""
                                        width={38}
                                        height={38}
                                        loading="lazy"
                                    />
                                    <span className={styles.rankText}>
                                        <span className={styles.rankName}>
                                            {placement !== undefined
                                                ? `Platzierung ${placement.played}/${placement.needed}`
                                                : meta.label}
                                        </span>
                                        <span className={styles.rankDivision}>
                                            {placement !== undefined
                                                ? `Noch ${placement.needed - placement.played} Spiele`
                                                : entry.division}
                                        </span>
                                    </span>
                                </span>

                                <span className={styles.stats}>
                                    <span className={styles.mmr}>
                                        <span className={styles.mmrLabel}>MMR</span>
                                        <span className={styles.mmrValue}>{entry.mmr.toLocaleString("de-DE")}</span>
                                    </span>

                                    <span className={styles.counters}>
                                        <span className={styles.counter}>
                                            <span className={[styles.counterIcon, styles.streakIcon].join(" ")}>
                                                <Icon name="bolt" size={13} />
                                            </span>
                                            <span className={styles.counterText}>
                                                <span className={styles.counterLabel}>Aktuelle Streak</span>
                                                <span className={styles.counterValue}>{entry.streak}x</span>
                                            </span>
                                        </span>
                                        <span className={styles.counter}>
                                            <span className={styles.counterIcon}>
                                                <Icon name="trophy" size={13} />
                                            </span>
                                            <span className={styles.counterText}>
                                                <span className={styles.counterLabel}>Gespielte Spiele</span>
                                                <span className={styles.counterValue}>{entry.games}</span>
                                            </span>
                                        </span>
                                    </span>
                                </span>
                            </li>
                        );
                    })}
                </ul>

                {/* Karriere-Werte */}
                <div className={styles.career}>
                    <h3 className={styles.careerTitle}>
                        <Icon name="crosshair" size={17} />
                        Karriere Stats
                    </h3>
                    <ul className={styles.careerGrid}>
                        {career.map((stat) => (
                            <li
                                key={stat.label}
                                className={styles.stat}
                                style={
                                    {
                                        "--stat": stat.color,
                                        "--icon": `url(${statIcon(stat.icon)})`,
                                    } as CSSProperties
                                }
                            >
                                {/* Die Symbole sind schwarze Striche. Als Maske
                                    eingefärbt nehmen sie die Farbe des Werts an,
                                    genau wie beim Zeichnen im Bot. */}
                                <span className={styles.statIcon} />
                                <span className={styles.statLabel}>{stat.label}</span>
                                <span className={styles.statValue}>{stat.value}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                <p className={styles.freshness}>{freshness}</p>
            </div>

            <p className={styles.caption}>
                <Icon name="discord" size={15} />
                So sieht <code>/rank me</code> in deinem Server aus
            </p>
        </div>
    );
}
