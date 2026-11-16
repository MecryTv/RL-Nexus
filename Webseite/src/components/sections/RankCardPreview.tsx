import { useEffect, useState, type CSSProperties, type JSX } from "react";
import { RANK_META, RLRank } from "../../domain/enums/RLRank";
import type { IPlacementPreview } from "../../domain/interfaces/IRankPreview";
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
 * Seit W-0129 Maß für Maß wie `builder/RankCard.ts`: Jede Größe im Stylesheet
 * ist ein Bot-Pixel, umgerechnet auf die Breite der Karte. Ändert sich die
 * Karte im Bot, ändert sie sich hier mit denselben Zahlen - beide sollen exakt
 * gleich aussehen.
 *
 * Nachgebaut aus HTML statt als Bild eingebunden, weil ein Bild mit 1536 mal
 * 1678 Bildpunkten rund ein dreiviertel Megabyte kostet und beim Ändern einer
 * Farbe neu gerendert werden müsste.
 *
 * `aria-hidden`, weil daneben im Fließtext steht, was die Karte zeigt. Ein
 * Bildschirmleser, der hier drei Dutzend Zahlen ohne Zusammenhang vorliest,
 * hilft niemandem.
 */
export function RankCardPreview(): JSX.Element {
    const { player, handle, badge, reward, tournament, playlists, extras, career, freshness } = RANK_PREVIEW;
    const rewardMeta = RANK_META[reward.rank];
    const tourneyMeta = RANK_META[tournament.rank];

    return (
        <div className={styles.frame} aria-hidden="true">
            <div className={styles.card}>
                {/* Kopf: Spieler, Season Reward, Turnier-Rang */}
                <header className={styles.head}>
                    <span className={styles.avatar}>
                        <img src={siteConfig.markURL} alt="" width={52} height={52} loading="lazy" />
                    </span>
                    <span className={styles.who}>
                        <span className={styles.tag}>[{badge}]</span>
                        <Fit className={styles.player} text={player} max={404} size={76} weight={800} />
                        <span className={styles.handle}>{handle}</span>
                    </span>

                    <div className={styles.reward} style={tier(rewardMeta.color)}>
                        <span className={styles.boxLabel}>Season Reward Level</span>
                        <span className={styles.rewardRow}>
                            <img className={styles.rewardBadge} src={rankBadge(reward.rank)} alt="" loading="lazy" />
                            <span className={styles.rewardSide}>
                                <Fit className={styles.rewardName} text={reward.label.toUpperCase()} max={230} size={40} weight={700} />
                                <span className={styles.rewardBar}>
                                    <span className={styles.bar}>
                                        <span className={styles.fill} style={{ width: `${reward.progress * 100}%` }} />
                                    </span>
                                    <span className={styles.percent}>{Math.round(reward.progress * 100)}%</span>
                                </span>
                            </span>
                        </span>
                    </div>

                    <div className={styles.tourney} style={tier(tourneyMeta.color)}>
                        <span className={[styles.boxLabel, styles.tourneyLabel].join(" ")}>
                            <i className={styles.mask} style={icon("wins")} />
                            Turnier-Rang
                        </span>
                        <span className={styles.tourneyRow}>
                            <img className={styles.tourneyBadge} src={rankBadge(tournament.rank)} alt="" loading="lazy" />
                            <span className={styles.rankText}>
                                <Fit className={styles.tourneyName} text={tourneyMeta.label.toUpperCase()} max={276} size={32} weight={700} />
                                <span className={styles.tourneyDivision}>{tournament.division}</span>
                            </span>
                        </span>
                        <span className={styles.tourneyMeta}>
                            <span>
                                <small>MMR</small>
                                <b>{tournament.mmr}</b>
                            </span>
                            <i />
                            <span>
                                <small>Spiele</small>
                                <b>{tournament.games}</b>
                            </span>
                        </span>
                    </div>
                </header>

                <SectionHead icon="wins" title="Ranked" sub="Hauptmodi" />

                <ul className={styles.main}>
                    {playlists.map((entry) => (
                        <li key={entry.playlist} className={styles.tile}>
                            <span className={styles.mode}>{entry.playlist}</span>
                            <span className={styles.modeSub}>{entry.subtitle}</span>
                            <RankRow
                                rank={entry.rank}
                                division={entry.division}
                                placement={entry.placement}
                                max={315}
                                size={34}
                            />
                            <span className={styles.mmrLabel}>MMR</span>
                            <span className={styles.mmrValue}>{entry.mmr}</span>
                            <Stats streak={entry.streak} games={entry.games} labels={["Aktuelle Streak", "Gespielte Spiele"]} />
                        </li>
                    ))}
                </ul>

                <SectionHead icon="grid" title="Extra-Modi" sub="Competitive" />

                <ul className={styles.extras}>
                    {extras.map((entry) => (
                        <li key={entry.mode} className={[styles.tile, styles.extra].join(" ")} style={accent(entry.mode)}>
                            <span className={styles.extraTop}>
                                <ModeIcon mode={entry.mode} />
                                {entry.label}
                            </span>
                            <RankRow
                                rank={entry.rank}
                                division={entry.division}
                                placement={entry.placement}
                                max={160}
                                size={24}
                                compact
                            />
                            <span className={styles.mmrLabel}>MMR</span>
                            <span className={styles.mmrValue}>{entry.mmr ?? "—"}</span>
                            <Stats streak={entry.streak} games={entry.games} labels={["Streak", "Spiele"]} />
                        </li>
                    ))}
                </ul>

                <SectionHead icon="shots" title="Karriere" sub="Statistik" />

                <ul className={styles.career}>
                    {career.map((stat) => (
                        <li key={stat.label} className={styles.stat} style={{ "--stat": stat.color } as CSSProperties}>
                            {/* Die Symbole sind schwarze Striche. Als Maske
                                eingefärbt nehmen sie die Farbe des Werts an,
                                genau wie beim Zeichnen im Bot. */}
                            <i className={styles.statIcon} style={icon(stat.icon)} />
                            <span className={styles.statLabel}>{stat.label}</span>
                            <span className={styles.statValue}>{stat.value}</span>
                        </li>
                    ))}
                </ul>

                <p className={styles.freshness}>{freshness}</p>
            </div>

            {/* Der Knopf, den der Bot unter jede Karte setzt */}
            <span className={styles.trackerButton}>
                <span className={styles.trackerEmoji}>🔗</span>
                Beim Tracker ansehen
            </span>

            <p className={styles.caption}>
                <Icon name="discord" size={15} />
                So sieht <code>/rank me</code> in deinem Server aus
            </p>
        </div>
    );
}

/* --------------------------------------------------------------------------
   Bausteine
   -------------------------------------------------------------------------- */

function tier(color: string): CSSProperties {
    return { "--tier": color } as CSSProperties;
}

function icon(name: string): CSSProperties {
    return { "--icon": `url(${statIcon(name)})` } as CSSProperties;
}

/** Dieselben Farben wie `EXTRA_MODE_COLORS` im Bot. */
const MODE_COLORS: Readonly<Record<string, string>> = {
    heatseeker: "#ff8a3d",
    rumble: "#b06bff",
    hoops: "#ffc53d",
    snowday: "#38c8ff",
    dropshot: "#ff4fa3",
};

function accent(mode: string): CSSProperties {
    return { "--accent": MODE_COLORS[mode] ?? "var(--c-red)" } as CSSProperties;
}

/** Dieselben Pfade wie `MODE_PATHS` im Bot, im 24er-Raster. */
const MODE_PATHS: Readonly<Record<string, string>> = {
    heatseeker: "M12 4a8 8 0 1 0 0.01 0zM12 9a3 3 0 1 0 0.01 0zM12 1v4M12 19v4M1 12h4M19 12h4",
    rumble: "M13 2 4 14h7l-1 8 9-12h-7z",
    hoops: "M4 7a8 2.5 0 1 0 16 0a8 2.5 0 1 0-16 0M4 7l3 12h10l3-12M8 7l2 12M16 7l-2 12",
    snowday: "M12 2v20M3.3 7l17.4 10M3.3 17l17.4-10",
    dropshot: "M12 2 21 7v10l-9 5-9-5V7zM12 8l4 2.5v4L12 17l-4-2.5v-4z",
    grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
};

function ModeIcon({ mode }: { mode: string }): JSX.Element {
    return (
        <svg className={styles.modeIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d={MODE_PATHS[mode]} />
        </svg>
    );
}

/** Die Überschrift eines Punkts: Symbol, Titel, Untertitel, Linie bis zum Rand. */
function SectionHead({ icon: name, title, sub }: { icon: "wins" | "shots" | "grid"; title: string; sub: string }): JSX.Element {
    return (
        <div className={styles.sectionHead}>
            {name === "grid" ? (
                <svg className={styles.sectionGrid} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round">
                    <path d={MODE_PATHS.grid} />
                </svg>
            ) : (
                <i className={[styles.mask, styles.sectionIcon].join(" ")} style={icon(name)} />
            )}
            <span className={styles.sectionText}>
                <span className={styles.sectionTitle}>{title}</span>
                <span className={styles.sectionSub}>{sub}</span>
            </span>
            <span className={styles.sectionRule} />
        </div>
    );
}

/** Abzeichen, Rang und Division im blauen Kasten - in den Hauptmodi groß, in den Extra-Modi klein. */
function RankRow(props: {
    rank: RLRank;
    division: string;
    placement?: IPlacementPreview;
    max: number;
    size: number;
    compact?: boolean;
}): JSX.Element {
    const { rank, division, placement, max, size, compact } = props;
    // Solange die Platzierung läuft, zeigt das Spiel kein Abzeichen und keine
    // Farbe. Die Karte hält sich daran.
    const shown = placement ? RLRank.Unranked : rank;
    const meta = RANK_META[shown];
    // Ohne Rang zeichnet der Bot in textDim (`TierColor(0)`), nicht im
    // blasseren Grau, das die Seite sonst für Unranked nimmt.
    const color = shown === RLRank.Unranked ? "var(--c-text-dim)" : meta.color;
    const name = placement ? `Platzierung ${placement.played}/${placement.needed}` : meta.label;
    const sub = placement ? `Noch ${placement.needed - placement.played} Spiele` : division;

    return (
        <span className={styles.rankRow} style={tier(color)}>
            <img className={styles.rankBadge} src={rankBadge(shown)} alt="" loading="lazy" />
            <span className={styles.rankText}>
                <Fit
                    className={styles.rankName}
                    text={name.toUpperCase()}
                    short={compact ? shorten(name.toUpperCase()) : undefined}
                    max={max}
                    size={size}
                    weight={700}
                />
                <span className={styles.rankDivision}>{sub}</span>
            </span>
        </span>
    );
}

/** Die Kurzformen des Bots für die schmalen Extra-Kacheln. */
function shorten(text: string): string {
    return text.replace("GRAND CHAMPION", "GRAND CHAMP").replace("SUPERSONIC LEGEND", "SSL").replace("PLATZIERUNG", "PLATZ.");
}

/** Linie, darunter Streak | Spiele mit Trenner - wie `drawStatsRow()`. */
function Stats(props: { streak: number; games: number; labels: readonly [string, string] }): JSX.Element {
    const { games, labels } = props;
    // Wie im Bot: ohne Spiel in dieser Season keine Serie.
    const streak = games > 0 ? props.streak : 0;
    const tone = streak > 0 ? styles.win : streak < 0 ? styles.loss : styles.none;

    return (
        <span className={styles.stats}>
            <span className={styles.counter}>
                <span className={[styles.counterValue, tone].join(" ")}>
                    {streak !== 0 && <Flame />}
                    {streak === 0 ? "—" : `${Math.abs(streak)}x`}
                </span>
                <span className={styles.counterLabel}>{labels[0]}</span>
            </span>
            <i className={styles.counterSep} />
            <span className={styles.counter}>
                <span className={styles.counterValue}>
                    <i className={[styles.mask, styles.counterIcon].join(" ")} style={icon("wins")} />
                    {games}
                </span>
                <span className={styles.counterLabel}>{labels[1]}</span>
            </span>
        </span>
    );
}

/** Die Flamme aus `flame()` im Bot, als SVG. */
function Flame(): JSX.Element {
    return (
        <svg className={styles.flame} viewBox="0 0 24 24">
            <path fill="currentColor" d="M13 0C13 5 17 7 18.5 11C20.5 16 17.5 24 12 24C6.5 24 3.5 19.5 4.5 14.5C5.2 11 7.5 9.5 8 6.5C9.5 9 10.5 9.5 11 8C11.6 6 12.2 3 13 0Z" />
            <path fill="rgb(255 255 255 / 45%)" d="M12.5 11C14.5 14 15.5 16 15.5 18.5C15.5 21.5 14 22.5 12 22.5C10 22.5 8.5 21 8.5 18.5C8.5 16 11 14.5 12.5 11Z" />
        </svg>
    );
}

/* --------------------------------------------------------------------------
   Text, der notfalls kleiner wird - wie `fitText()` im Bot
   -------------------------------------------------------------------------- */

let measureContext: CanvasRenderingContext2D | null = null;

/** Schriftgröße in Bot-Pixeln, bei der `text` in `max` passt. Gemessen wird in Oxanium, wie im Bot. */
function fitSize(text: string, max: number, size: number, weight: number): number {
    measureContext ??= document.createElement("canvas").getContext("2d");

    if (!measureContext) return size;

    let current = size;

    measureContext.font = `${weight} ${current}px Oxanium`;

    while (measureContext.measureText(text).width > max && current > 12) {
        current -= 2;
        measureContext.font = `${weight} ${current}px Oxanium`;
    }

    return current;
}

/**
 * Ein Text mit der Größe, die der Bot ihm geben würde.
 *
 * Gemessen wird erst, wenn Oxanium geladen ist - vorher misst der Browser mit
 * einer Ersatzschrift und läge daneben. Weil alle Maße mit der Karte
 * mitwachsen, reicht eine Messung in Bot-Pixeln für jede Breite.
 *
 * `short` ist die Kurzform für die Extra-Kacheln: passt der volle Text nur noch
 * unter 20 px, nimmt der Bot sie.
 */
function Fit(props: { className: string; text: string; short?: string; max: number; size: number; weight: number }): JSX.Element {
    const { className, text, short, max, size, weight } = props;
    const [fitted, setFitted] = useState({ text, size });

    useEffect(() => {
        let alive = true;

        void document.fonts.load(`${weight} ${size}px Oxanium`, text).then(() => {
            if (!alive) return;

            const full = fitSize(text, max, size, weight);
            const shown = short && full < 20 ? short : text;

            setFitted({ text: shown, size: shown === text ? full : fitSize(shown, max, size, weight) });
        });

        return () => {
            alive = false;
        };
    }, [text, short, max, size, weight]);

    return (
        <span className={className} style={{ "--size": fitted.size } as CSSProperties}>
            {fitted.text}
        </span>
    );
}
