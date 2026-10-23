import { useState, type JSX } from "react";
import { Link } from "react-router-dom";
import type { IBackupsOverview, IGuildTile, NightState } from "../../shared/backups";
import { api } from "../api/client";
import { useLive } from "../api/live";
import { useApi } from "../api/useApi";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { PageHeader } from "../components/PageHeader";
import { Panel } from "../components/Panel";
import { Failure, Loading } from "../components/Status";
import { formatDate, formatDateTime, formatNumber } from "../format";
import { useToast } from "../toast/context";
import { useTitle } from "../useTitle";
import { KIND_LABELS, NIGHT_LABELS, initials, roundSentence } from "./format";
import styles from "./backups.module.scss";

const NIGHT_STATES: readonly NightState[] = ["ok", "fail", "hand", "none"];

/** Anteil der gesicherten Server als Ring, grün gesichert, gelb fehlgeschlagen, in der Mitte „26/27“. */
function Ring({ ok, total }: { readonly ok: number; readonly total: number }): JSX.Element {
    const share = total === 0 ? 0 : ok / total;
    const length = 2 * Math.PI * 34;

    return (
        <svg className={styles.ring} viewBox="0 0 86 86" role="img" aria-label={total === 0 ? "Noch keine Runde" : `${ok} von ${total} Servern gesichert`}>
            <circle className={total > 0 && ok < total ? styles.ringFail : styles.ringTrack} cx="43" cy="43" r="34" />
            {total > 0 && <circle className={styles.ringFill} cx="43" cy="43" r="34" strokeDasharray={`${share * length} ${length}`} transform="rotate(-90 43 43)" />}
            <text x="43" y="42" className={styles.ringValue}>
                {total === 0 ? "–" : `${ok}/${total}`}
            </text>
            <text x="43" y="57" className={styles.ringLabel}>
                gesichert
            </text>
        </svg>
    );
}

/** Die 14 Nächte einer Kachel, älteste links. Jede Nacht sagt per title, was war. */
export function Nights({ nights, now }: { readonly nights: readonly NightState[]; readonly now: number }): JSX.Element {
    return (
        <ol className={styles.nights} aria-label="Die letzten 14 Nächte">
            {nights.map((state, index) => {
                // Kalendertage statt 24-Stunden-Schritten: um die Zeitumstellung fehlte sonst ein Tag.
                const day = new Date(now);
                day.setDate(day.getDate() - (nights.length - 1 - index));
                const title = `${formatDate(day.toISOString())}: ${NIGHT_LABELS[state]}`;

                return <li key={index} className={styles[state]} title={title} aria-label={title} />;
            })}
        </ol>
    );
}

function Legend(): JSX.Element {
    return (
        <ul className={styles.legend} aria-label="Legende">
            {NIGHT_STATES.map((state) => (
                <li key={state}>
                    <i className={styles[state]} aria-hidden="true" />
                    {NIGHT_LABELS[state]}
                </li>
            ))}
        </ul>
    );
}

interface ITileProps {
    readonly guild: IGuildTile;
    readonly now: number;
    readonly busy: boolean;
    /** Während einer Runde gibt es nichts nachzuholen. */
    readonly disabled: boolean;
    readonly onCatchUp: () => void;
}

function Tile({ guild, now, busy, disabled, onCatchUp }: ITileProps): JSX.Element {
    const facts = guild.present ? [guild.members !== null ? `${formatNumber(guild.members)} Mitglieder` : null, guild.modules !== null ? `${guild.modules} Module` : null].filter(Boolean).join(" · ") : "Bot nicht mehr da";

    return (
        <Panel as="li" cut="sm" accent={guild.problem ? "rgb(255 197 61 / 55%)" : undefined} className={[styles.tile, guild.present ? null : styles.gone].filter(Boolean).join(" ")}>
            <div className={styles.tileHead}>
                <span className={styles.avatar} aria-hidden="true">
                    {initials(guild.name)}
                </span>
                <div className={styles.grow}>
                    <h3 className={styles.tileName}>{guild.name}</h3>
                    <p className={styles.faint}>{facts}</p>
                </div>
            </div>

            <Nights nights={guild.nights} now={now} />

            <div className={styles.tileFoot}>
                {guild.problem ? (
                    <span className={[styles.grow, styles.meh].join(" ")}>Letzte Nacht: {guild.problem}</span>
                ) : (
                    <span className={[styles.grow, styles.dim].join(" ")}>{guild.last ? `zuletzt ${formatDateTime(guild.last.at)}, ${KIND_LABELS[guild.last.kind]}` : "noch kein Backup"}</span>
                )}
                {guild.problem && guild.present && (
                    <Button size="sm" variant="primary" icon="refresh" busy={busy} disabled={disabled} onClick={onCatchUp}>
                        Nachholen
                    </Button>
                )}
                <Link to={`/backups/${guild.id}`} className={styles.open}>
                    Öffnen
                    <Icon name="chevron-right" size={16} />
                </Link>
            </div>
        </Panel>
    );
}

export function BackupsPage(): JSX.Element {
    useTitle("Backups");

    const notify = useToast();
    const { data, error, updatedAt, reload } = useApi<IBackupsOverview>("/api/backups");
    const [starting, setStarting] = useState<string | null>(null);

    useLive("backups", reload);

    const running = data?.running === true;

    // Die Runde läuft im Hintergrund. Ist sie fertig, sagt der Server über useLive Bescheid.
    async function start(path: string, key: string): Promise<void> {
        setStarting(key);
        try {
            await api(path, { method: "POST" });
            reload();
        } catch (reason) {
            notify(reason instanceof Error ? reason.message : String(reason), "danger");
        } finally {
            setStarting(null);
        }
    }

    const round = data?.round ?? null;
    const tone = round === null ? "none" : round.failed.length > 0 ? "warn" : "ok";
    // Die Nächte zählen vom Abruf aus, nicht vom Rendern: dann stimmen Streifen und Daten überein.
    const now = updatedAt ?? 0;

    return (
        <>
            <PageHeader title="Backups" meta="Jede Nacht um 0:00 werden alle Server gesichert. Automatische Backups bleiben 72 Stunden, die von Hand, bis jemand sie löscht." />

            {error && !data ? (
                <Failure message={error.message} onRetry={reload} />
            ) : !data ? (
                <Loading label="Backups werden geladen" />
            ) : !data.available ? (
                <Panel className={styles.notice}>
                    <Badge tone="warn">Keine Backups</Badge>
                    <p>{data.reason}</p>
                </Panel>
            ) : (
                <>
                    <Panel cut="lg" className={styles.hero} accent={tone === "warn" ? "rgb(255 197 61 / 45%)" : tone === "ok" ? "rgb(53 224 127 / 35%)" : undefined}>
                        <Ring ok={round?.ok ?? 0} total={round?.total ?? 0} />
                        <div className={styles.grow}>
                            <p className={styles.label}>{round ? `Letzte Runde · ${formatDateTime(round.at)}` : "Nacht-Runde"}</p>
                            <p className={styles.sentence} aria-live="polite">
                                {roundSentence(round)}
                            </p>
                            <p className={styles.dim}>{running ? "Eine Runde läuft gerade." : "Die nächste Runde startet um 0:00. Du kannst sie auch jetzt starten."}</p>
                        </div>
                        <Button variant="primary" icon="shield-check" busy={starting === "all"} disabled={running} onClick={() => void start("/api/backups/run", "all")}>
                            {running ? "Läuft …" : "Runde jetzt starten"}
                        </Button>
                    </Panel>

                    <div className={styles.listHead}>
                        <h2 className={styles.label}>{data.guilds.length === 1 ? "1 Server" : `${data.guilds.length} Server`}</h2>
                        <Legend />
                    </div>

                    {data.guilds.length === 0 ? (
                        <p className={styles.dim}>Der Bot ist auf keinem Server, und es gibt keine Backups von früher.</p>
                    ) : (
                        <ul className={styles.tiles}>
                            {data.guilds.map((guild) => (
                                <Tile key={guild.id} guild={guild} now={now} busy={starting === guild.id} disabled={running} onCatchUp={() => void start(`/api/backups/${guild.id}/run`, guild.id)} />
                            ))}
                        </ul>
                    )}
                </>
            )}
        </>
    );
}
