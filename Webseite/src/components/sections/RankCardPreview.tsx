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
 * 1212 Bildpunkten rund ein halbes Megabyte kostet und beim Ändern einer
 * Farbe neu gerendert werden müsste.
 *
 * Zwei Seiten wie in Discord: Ranked und Extra-Modi. Der Knopf darunter
 * wechselt, Kopf und Karriere bleiben stehen.
 *
 * Die Karte ist `aria-hidden`, weil daneben im Fließtext steht, was sie zeigt.
 * Ein Bildschirmleser, der hier drei Dutzend Zahlen ohne Zusammenhang vorliest,
 * hilft niemandem. Der Knopf zum Umschalten bleibt bedienbar.
 */
export function RankCardPreview(): JSX.Element {
    const { player, handle, badge, reward, tournament, playlists, extras, career, freshness } = RANK_PREVIEW;
    const rewardMeta = RANK_META[reward.rank];
    const tourneyMeta = RANK_META[tournament.rank];
    const [page, setPage] = useState<"ranked" | "extra">("ranked");

    return (
        <div className={styles.frame}>
            <div className={styles.card} aria-hidden="true">
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

                {/* Seite 1 Ranked, Seite 2 Extra-Modi. Nur dieser Teil wechselt -
                    der key baut ihn neu auf, damit er weich einblendet. */}
                <div key={page} className={styles.swap}>
                    {page === "ranked" ? (
                        <>
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
                        </>
                    ) : (
                        <>
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
                                            max={150}
                                            size={24}
                                            compact
                                        />
                                        <span className={styles.mmrLabel}>MMR</span>
                                        <span className={styles.mmrValue}>{entry.mmr}</span>
                                        <Stats streak={entry.streak} games={entry.games} labels={["Streak", "Spiele"]} />
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                </div>

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

            {/* Die Knöpfe, die der Bot unter jede Karte setzt: links die andere
                Seite, rechts der Tracker (hier nur Bild, er führt nirgends hin). */}
            <div className={styles.buttons}>
                <button type="button" className={styles.dbtn} onClick={() => setPage(page === "ranked" ? "extra" : "ranked")}>
                    <span className={styles.emoji} aria-hidden="true">
                        {page === "ranked" ? "🎮" : "🏆"}
                    </span>
                    {page === "ranked" ? "Extra-Modi" : "Ranked"}
                </button>
                <span className={styles.dbtn} aria-hidden="true">
                    <span className={styles.emoji}>🔗</span>
                    Beim Tracker ansehen
                    <svg className={styles.external} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
                    </svg>
                </span>
            </div>

            <p className={styles.caption} aria-hidden="true">
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
    const [symbol, tone] = streak > 0 ? (["fire", styles.win] as const) : streak < 0 ? (["down", styles.loss] as const) : (["fire-off", styles.none] as const);

    return (
        <span className={styles.stats}>
            <span className={styles.counter}>
                <span className={[styles.counterValue, tone].join(" ")}>
                    <StatIcon name={symbol} />
                    {streak === 0 ? "—" : `${Math.abs(streak)}x`}
                </span>
                <span className={styles.counterLabel}>{labels[0]}</span>
            </span>
            <i className={styles.counterSep} />
            <span className={styles.counter}>
                <span className={styles.counterValue}>
                    <StatIcon name="pad" />
                    {games}
                </span>
                <span className={styles.counterLabel}>{labels[1]}</span>
            </span>
        </span>
    );
}

/**
 * Die Symbole neben Streak und Spiele (Entwurf I2) - dieselben Pfade wie
 * `STAT_SHAPES` im Bot: Flamme bei einer Siegesserie, leere Flamme ohne Serie,
 * Pfeil nach unten bei Niederlagen, Controller für die Spiele.
 */
function StatIcon({ name }: { name: "fire" | "fire-off" | "down" | "pad" }): JSX.Element {
    switch (name) {
        case "fire":
            return (
                <svg className={styles.fire} viewBox="0 0 24 24">
                    <path fill="currentColor" d="M13.2 1.5c.2 3.6 3.6 5.4 4.8 8.6 1.6 4.3-.9 11.4-6 11.4-4.6 0-7.2-3.8-6.3-8 .5-2.7 2.4-4 2.9-6.4 1.1 1.9 2 2.3 2.4 1.2.6-1.7.9-4.4 2.2-6.8z" />
                    <path fill="rgb(255 255 255 / 55%)" d="M12.4 11.2c1.6 2.3 2.5 3.9 2.5 5.9 0 2.4-1.2 3.3-2.9 3.3s-2.9-1.2-2.9-3.3c0-2 2-3.3 3.3-5.9z" />
                </svg>
            );
        case "fire-off":
            return (
                <svg className={styles.idle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round">
                    <path d="M13.2 2.5c.2 3.4 3.4 5.1 4.5 8.1 1.5 4-.8 10.4-5.7 10.4-4.3 0-6.7-3.6-5.9-7.5.5-2.5 2.2-3.8 2.7-6 1 1.8 1.9 2.1 2.2 1.1.6-1.6.9-4 2.2-6.1z" />
                </svg>
            );
        case "down":
            return (
                <svg className={styles.down} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 7l6.5 6.5 4-4L21 17M21 11v6h-6" />
                </svg>
            );
        default:
            return (
                <svg className={styles.pad} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7.2 6h9.6a4.6 4.6 0 0 1 4.5 5.5l-1 5.2a2.9 2.9 0 0 1-5 1.4L13.6 16h-3.2l-1.7 2.1a2.9 2.9 0 0 1-5-1.4l-1-5.2A4.6 4.6 0 0 1 7.2 6zM7 10.2v3M5.5 11.7h3" />
                    <circle cx="15.6" cy="10.6" r=".9" fill="currentColor" stroke="none" />
                    <circle cx="17.6" cy="12.8" r=".9" fill="currentColor" stroke="none" />
                </svg>
            );
    }
}

/* --------------------------------------------------------------------------
   Text, der notfalls kleiner wird - wie `fitText()` im Bot
   -------------------------------------------------------------------------- */

let measureContext: CanvasRenderingContext2D | null = null;

/** Messergebnisse von Fit, damit ein neu aufgebauter Text sofort richtig groß ist. */
const FITTED = new Map<string, { text: string; size: number }>();

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
    const key = `${weight}|${size}|${max}|${short ?? ""}|${text}`;
    // Schon einmal gemessen (etwa vor dem Umschalten der Seite): gleich mit dem
    // Ergebnis starten, sonst blitzt der Text einen Frame lang zu groß auf.
    const [fitted, setFitted] = useState(() => FITTED.get(key) ?? { text, size });

    useEffect(() => {
        let alive = true;

        document.fonts
            .load(`${weight} ${size}px Oxanium`, text)
            .then(() => {
                if (!alive) return;

                const full = fitSize(text, max, size, weight);
                const shown = short && full < 20 ? short : text;
                const result = { text: shown, size: shown === text ? full : fitSize(shown, max, size, weight) };

                FITTED.set(key, result);
                setFitted(result);
            })
            // Lädt die Schrift nicht, bleibt der Text ungemessen in Startgröße.
            .catch(() => undefined);

        return () => {
            alive = false;
        };
    }, [key, text, short, max, size, weight]);

    return (
        <span className={className} style={{ "--size": fitted.size } as CSSProperties}>
            {fitted.text}
        </span>
    );
}
