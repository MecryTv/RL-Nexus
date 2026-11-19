import { useState, type JSX } from "react";
import type { ISlowReport, ISlowSide } from "../../shared/api";
import { useApi } from "../api/useApi";
import { Badge } from "../components/Badge";
import { Icon } from "../components/Icon";
import { Panel } from "../components/Panel";
import { Segmented } from "../components/Segmented";
import { Failure, Loading } from "../components/Status";
import { formatDateTime, formatNumber } from "../format";
import { groupSlow, shareOf, type ISlowGroup, type SlowSource } from "./performance.ts";
import styles from "./Performance.module.scss";

const SOURCE_NAMES: Readonly<Record<SlowSource, string>> = { admin: "Admin", bot: "Bot" };

/** Nachreview W-0141: Vor der Abfrage steht, was langsam war. Bei „Pool“ war es das Warten auf eine freie Verbindung. */
const KIND_PREFIX: Readonly<Record<ISlowGroup["kind"], string>> = { request: "", sql: "SQL · ", pool: "Pool · " };

/** Ab einer Sekunde rot, darunter gelb; die Zahl steht immer dabei. */
function Ms({ value, label }: { readonly value: number; readonly label: string }): JSX.Element {
    return (
        <span className={[styles.ms, value >= 1000 ? styles.poor : styles.mid].join(" ")}>
            {formatNumber(value)} ms<small>{label}</small>
        </span>
    );
}

function Process({ name, side }: { readonly name: string; readonly side: ISlowSide | null }): JSX.Element {
    return (
        <Panel as="section" cut="sm" className={styles.process}>
            <header className={styles.serviceHead}>
                <h2 className={styles.serviceTitle}>{name}</h2>
                {side ? <span className={styles.dim}>seit {formatDateTime(side.since)}</span> : <Badge tone="danger">Antwortet nicht</Badge>}
            </header>
            {side && (
                <dl className={styles.counts}>
                    <div>
                        <dt>Anfragen ab {formatNumber(side.requestMs)} ms</dt>
                        <dd>{shareOf(side.slowRequests, side.requests)}</dd>
                    </div>
                    <div>
                        <dt>SQL ab {formatNumber(side.sqlMs)} ms</dt>
                        <dd>{shareOf(side.slowQueries, side.queries)}</dd>
                    </div>
                    <div>
                        <dt>Pool-Warten ab {formatNumber(side.sqlMs)} ms</dt>
                        <dd>{shareOf(side.poolWaits, side.queries)}</dd>
                    </div>
                </dl>
            )}
        </Panel>
    );
}

function Group({ group }: { readonly group: ISlowGroup }): JSX.Element {
    return (
        <li className={styles.group}>
            <details>
                <summary className={styles.groupRow}>
                    <Badge tone={group.source === "admin" ? "info" : "pro"}>{SOURCE_NAMES[group.source]}</Badge>
                    <code className={styles.what} title={group.what}>
                        {KIND_PREFIX[group.kind]}
                        {group.what}
                    </code>
                    <span className={styles.count}>
                        {formatNumber(group.count)}
                        <small>{group.count === 1 ? "Fall" : "Fälle"}</small>
                    </span>
                    <span className={styles.wide}>
                        <Ms value={group.median} label={group.kind === "pool" ? "gewartet, Median" : "Median"} />
                    </span>
                    <span className={styles.wide}>
                        <Ms value={group.max} label={group.kind === "pool" ? "gewartet, Max" : "Max"} />
                    </span>
                    <span className={[styles.when, styles.wide].join(" ")}>{formatDateTime(group.last)}</span>
                    <Icon name="chevron-right" size={16} className={styles.chevron} />
                </summary>
                <ul className={styles.events}>
                    <li className={styles.full}>
                        <code>{group.what}</code>
                    </li>
                    {group.entries.map((entry, index) => (
                        <li key={`${entry.at}-${index}`}>
                            {entry.kind === "pool" ? (
                                <>
                                    <b>{formatNumber(entry.waitMs ?? 0)} ms auf eine freie Verbindung gewartet</b>
                                    <span>{formatDateTime(entry.at)}</span>
                                    {entry.ms > 0 && <span className={styles.dim}>die Abfrage selbst {formatNumber(entry.ms)} ms</span>}
                                </>
                            ) : (
                                <>
                                    <b>{formatNumber(entry.ms)} ms</b>
                                    <span>{formatDateTime(entry.at)}</span>
                                    {entry.status !== null && <span className={styles.dim}>Status {entry.status}</span>}
                                    {entry.waitMs !== null && entry.waitMs > 0 && <span className={styles.dim}>dazu {formatNumber(entry.waitMs)} ms auf eine freie Verbindung gewartet</span>}
                                </>
                            )}
                        </li>
                    ))}
                </ul>
            </details>
        </li>
    );
}

/** Reiter „Langsame Anfragen“, Entwurf 11-B. */
export function SlowView(): JSX.Element {
    const [source, setSource] = useState<SlowSource | "all">("all");
    const report = useApi<ISlowReport>("/api/dev/slow", 30_000);

    if (!report.data) return report.error ? <Failure message={report.error.message} onRetry={report.reload} /> : <Loading label="Langsame Anfragen werden geladen" />;

    const groups = groupSlow(report.data, source);

    return (
        <>
            <div className={styles.processes}>
                <Process name="Admin-Server" side={report.data.admin} />
                <Process name="Bot" side={report.data.bot} />
            </div>

            <Panel as="section" className={styles.slow}>
                <div className={styles.bar}>
                    <div>
                        <h2 id="langsam-liste" className={styles.serviceTitle}>
                            Was langsam war
                        </h2>
                        <p className={styles.lead}>Zusammengefasst nach Route bzw. Abfrage, was oft langsam war, zuerst · die letzten 200 je Prozess</p>
                    </div>
                    <Segmented<SlowSource | "all">
                        name="langsam-quelle"
                        legend="Quelle"
                        value={source}
                        onChange={setSource}
                        options={[
                            { value: "all", label: "Alle" },
                            { value: "admin", label: "Admin-Server" },
                            { value: "bot", label: "Bot" },
                        ]}
                    />
                </div>

                {groups.length === 0 ? (
                    <p className={styles.empty}>Seit dem Start war hier nichts langsam.</p>
                ) : (
                    <>
                        <div className={[styles.groupRow, styles.groupCols].join(" ")} aria-hidden="true">
                            <span>Quelle</span>
                            <span>Route / Abfrage</span>
                            <span>Fälle</span>
                            <span>Median</span>
                            <span>Max</span>
                            <span>Zuletzt</span>
                            <span />
                        </div>
                        <ul className={styles.groups} aria-labelledby="langsam-liste">
                            {groups.map((group) => (
                                <Group key={group.key} group={group} />
                            ))}
                        </ul>
                    </>
                )}
                <p className={styles.dim}>
                    Gelb ab der Schwelle, rot ab einer Sekunde. Routen als Muster (:id), SQL ohne Werte. Bei SQL zählt die Abfrage selbst. War nur das Warten auf eine
                    freie Verbindung zu lang, steht der Fall als „Pool“ mit der Wartezeit da; bekam eine Abfrage gar keine Verbindung, mit der Zeit bis zum Abbruch.
                    Abfragen in Transaktionen misst der Admin-Server nicht. Nach einem Neustart ist die Liste leer.
                </p>
            </Panel>
        </>
    );
}
