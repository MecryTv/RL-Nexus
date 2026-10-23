import { useState, type JSX } from "react";
import { STATUS_SERVICE_LABELS, STATUS_SERVICES, type CheckState, type DetailRange, type IServiceDetail, type IStatusDetail, type StatusService } from "../../shared/status";
import { Badge, type BadgeTone } from "../components/Badge";
import { Button } from "../components/Button";
import { Metric } from "../components/Metric";
import { Pager } from "../components/Pager";
import { Panel } from "../components/Panel";
import { Segmented } from "../components/Segmented";
import { formatBytes, formatDateTime, formatDuration, formatNumber, formatPercent } from "../format";
import { ago, canReport, uptimeRow } from "./format";
import { LatencyChart } from "./LatencyChart";
import styles from "./Leitstand.module.scss";

const TONES: Readonly<Record<CheckState, BadgeTone>> = {
    ok: "ok",
    warn: "warn",
    down: "danger",
};
const STATES: Readonly<Record<CheckState, string>> = {
    ok: "Läuft",
    warn: "Eingeschränkt",
    down: "Weg",
};
const RANK: Readonly<Record<CheckState, number>> = { ok: 0, warn: 1, down: 2 };
const RANGE_SHORT: Readonly<Record<DetailRange, string>> = {
    "24h": "24 Std.",
    "7d": "7 Tage",
    "30d": "30 Tage",
};
const SHORT_NAMES: Readonly<Record<StatusService, string>> = {
    bot: "Bot",
    dashboard: "Dash.",
    website: "Web",
    database: "DB",
};
/** Je Seite. Mehr blättert der Pager weiter. */
const OUTAGES_PER_PAGE = 6;
const ROUNDS_PER_PAGE = 8;
const ROUND_FILTERS = [
    { value: "alle", label: "Alle" },
    { value: "auffaellig", label: "Auffällige" },
] as const;

/** Die Einträge einer Seite. Die Seite rückt zurück, wenn es weniger Seiten gibt als vorher. */
function pageOf<T>(
    items: readonly T[],
    page: number,
    size: number,
): {
    readonly items: readonly T[];
    readonly page: number;
    readonly pages: number;
} {
    const pages = Math.max(1, Math.ceil(items.length / size));
    const current = Math.min(page, pages);

    return {
        items: items.slice((current - 1) * size, current * size),
        page: current,
        pages,
    };
}
/** Ist die Statusmeldung in Discord älter, gilt sie als veraltet. */
const POST_FRESH = 10 * 60_000;

const ms = (value: number | null): string => (value === null ? "–" : `${formatNumber(value)} ms`);

/** Die Fakten einer Dienstzeile. Bot: Ping zu Discord, Webseite: Bau und Banner, Datenbank: Version, Tabellen, Größe. */
function factsOf(service: IServiceDetail, detail: IStatusDetail): string {
    const facts = [
        `${service.id === "bot" ? "Ping zu Discord" : "jetzt"} ${ms(service.latencyNow)}`,
        `Median ${ms(service.median)} · 95 % unter ${ms(service.p95)} · Spitze ${ms(service.max)} (${RANGE_SHORT[detail.range]})`,
    ];

    if (service.id === "website") {
        if (detail.tech.website.builtAt) facts.push(`gebaut ${formatDateTime(detail.tech.website.builtAt)}`);
        facts.push(detail.tech.website.banner ? "Banner an" : "Banner aus");
    }

    if (service.id === "database" && detail.tech.database) {
        const database = detail.tech.database;
        facts.push(`${database.version ?? "MariaDB"} · ${formatNumber(database.tables)} Tabellen · ${formatBytes(database.bytes)}`);
    }

    return facts.join(" · ");
}

function firstOpen(services: readonly IServiceDetail[]): StatusService {
    const worst = [...services].sort((a, b) => RANK[b.state] - RANK[a.state])[0];

    return worst && worst.state !== "ok" ? worst.id : "bot";
}

/** Der Leitstand unter Admin → Status, Richtung A aus dem Entwurf vom 17.10.2026. */
export function Leitstand({
    detail,
    now,
    range,
    onRange,
    onReport,
}: {
    readonly detail: IStatusDetail;
    /** Sekündlich aus der Seite, für „vor 38 Sek.“. */
    readonly now: number;
    readonly range: DetailRange;
    readonly onRange: (range: DetailRange) => void;
    /** Öffnet eine neue Störungsmeldung mit diesen Diensten. */
    readonly onReport: (services: readonly StatusService[]) => void;
}): JSX.Element {
    const [open, setOpen] = useState<StatusService | null>(() => firstOpen(detail.services));
    const [filter, setFilter] = useState<(typeof ROUND_FILTERS)[number]["value"]>("alle");
    const [roundPage, setRoundPage] = useState(1);
    const [outagePage, setOutagePage] = useState(1);

    const generatedAt = Date.parse(detail.generatedAt);
    const postAge = detail.statusPostAt === null ? null : now - Date.parse(detail.statusPostAt);
    const filtered = filter === "auffaellig" ? detail.rounds.filter((round) => Object.values(round.values).some((value) => value && value.state !== "ok")) : detail.rounds;
    const rounds = pageOf(filtered, roundPage, ROUNDS_PER_PAGE);
    const outages = pageOf(detail.outages, outagePage, OUTAGES_PER_PAGE);
    const bot = detail.tech.bot;
    const database = detail.tech.database;

    return (
        <div className={styles.leitstand}>
            <div className={styles.metrics}>
                <Metric
                    label="Verfügbar 24 Std."
                    value={
                        <>
                            <span className={styles.good}>{formatPercent(detail.uptime.day)}</span>
                            <span className={styles.sub}>
                                7 T. {formatPercent(detail.uptime.week)} · 30 T. {formatPercent(detail.uptime.month)}
                            </span>
                        </>
                    }
                />
                <Metric
                    label="Ausfälle 30 T."
                    value={
                        <>
                            {formatNumber(detail.outages30.count)}
                            <span className={styles.sub}>{detail.outages30.count === 0 ? "keiner" : `zusammen ${formatDuration(detail.outages30.minutes * 60)}`}</span>
                        </>
                    }
                />
                <Metric
                    label="Nicht gemessen"
                    value={
                        <>
                            <span className={detail.untrackedDayMinutes > 0 ? styles.meh : undefined}>
                                {detail.untrackedDayMinutes > 0 ? formatDuration(detail.untrackedDayMinutes * 60) : "nichts"}
                            </span>
                            <span className={styles.sub}>in 24 Std.</span>
                        </>
                    }
                />
                <Metric
                    label="Ø Antwortzeit"
                    value={
                        <>
                            {ms(detail.latencyAvg)}
                            <span className={styles.sub}>alle Dienste, 24 Std.</span>
                        </>
                    }
                />
                <Metric
                    label="Offene Meldungen"
                    value={
                        <>
                            {formatNumber(detail.openIncidents)}
                            <span className={styles.sub}>{detail.lastIncidentAt === null ? "noch keine" : `letzte ${ago(detail.lastIncidentAt, now)}`}</span>
                        </>
                    }
                />
                <Metric
                    label="Discord-Meldung"
                    value={
                        <>
                            <span className={postAge === null ? styles.meh : postAge < POST_FRESH ? styles.good : styles.meh}>
                                {postAge === null ? "noch nicht" : postAge < POST_FRESH ? "aktuell" : "veraltet"}
                            </span>
                            <span className={styles.sub}>{detail.statusPostAt === null ? "seit dem Start nicht gesendet" : `aktualisiert ${ago(detail.statusPostAt, now)}`}</span>
                        </>
                    }
                />
            </div>

            <ul className={styles.services} aria-label="Dienste">
                {STATUS_SERVICES.map((id) => {
                    const service = detail.services.find((entry) => entry.id === id);
                    if (!service) return null;

                    const expanded = open === id;

                    return (
                        <li key={id}>
                            <Panel cut="sm" className={styles.service}>
                                <div className={styles.serviceHead}>
                                    <Badge tone={TONES[service.state]}>{STATES[service.state]}</Badge>
                                    <h3 className={styles.serviceName}>{STATUS_SERVICE_LABELS[id]}</h3>
                                    <p className={styles.facts}>{factsOf(service, detail)}</p>
                                    <p className={styles.uptime}>
                                        <span className={styles.uptimeLabel}>24 Std. · 7 · 30 · 90 T.</span> {uptimeRow(service.uptime)}
                                    </p>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        icon={expanded ? "chevron-up" : "chevron-down"}
                                        aria-expanded={expanded}
                                        aria-controls={`graph-${id}`}
                                        onClick={() => setOpen(expanded ? null : id)}
                                    >
                                        Graph
                                    </Button>
                                </div>
                                {expanded && (
                                    <div id={`graph-${id}`}>
                                        <LatencyChart service={service} range={range} dataRange={detail.range} onRange={onRange} now={generatedAt} />
                                    </div>
                                )}
                            </Panel>
                        </li>
                    );
                })}
            </ul>

            <div className={styles.boxes}>
                <Panel cut="sm" className={styles.box}>
                    <h3 className={styles.boxTitle}>Ausfälle</h3>
                    {detail.outages.length === 0 ? (
                        <p className={styles.empty}>Kein Ausfall in 90 Tagen.</p>
                    ) : (
                        <>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th scope="col">Beginn</th>
                                        <th scope="col">Dienste</th>
                                        <th scope="col">Dauer</th>
                                        <th scope="col">Meldung</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {outages.items.map((event) => (
                                        <tr key={event.start}>
                                            <td>{formatDateTime(event.start)}</td>
                                            <td>{event.services.map((service) => STATUS_SERVICE_LABELS[service]).join(", ")}</td>
                                            <td className={event.end === null ? styles.bad : undefined}>
                                                {event.end === null ? `läuft seit ${formatDuration(event.minutes * 60)}` : formatDuration(event.minutes * 60)}
                                            </td>
                                            <td>
                                                {event.incident ? (
                                                    <a href={`#meldung-${event.incident.id}`} className={styles.link}>
                                                        {event.incident.title}
                                                    </a>
                                                ) : canReport(event) ? (
                                                    <Button size="sm" variant="primary" icon="plus" onClick={() => onReport(event.services)}>
                                                        Meldung dazu schreiben
                                                    </Button>
                                                ) : (
                                                    <span className={styles.faint}>ohne Meldung</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <Pager page={outages.page} pages={outages.pages} onPage={setOutagePage} />
                        </>
                    )}
                </Panel>

                <Panel cut="sm" className={styles.box}>
                    <div className={styles.boxHead}>
                        <h3 className={styles.boxTitle}>Letzte Prüfungen</h3>
                        <Segmented
                            name="pruefungen"
                            legend="Zeigen"
                            options={ROUND_FILTERS}
                            value={filter}
                            onChange={(value) => {
                                setFilter(value);
                                setRoundPage(1);
                            }}
                        />
                    </div>
                    {rounds.items.length === 0 ? (
                        <p className={styles.empty}>{filter === "auffaellig" ? "In der letzten Stunde war alles unauffällig." : "In der letzten Stunde wurde nicht geprüft."}</p>
                    ) : (
                        <>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th scope="col">Zeit</th>
                                        {STATUS_SERVICES.map((service) => (
                                            <th key={service} scope="col" title={STATUS_SERVICE_LABELS[service]}>
                                                {SHORT_NAMES[service]}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rounds.items.map((round) => (
                                        <tr key={round.at}>
                                            <td>{formatDateTime(round.at).split(", ").at(-1)}</td>
                                            {STATUS_SERVICES.map((service) => {
                                                const value = round.values[service];

                                                return (
                                                    <td key={service} className={value?.state === "down" ? styles.bad : value?.state === "warn" ? styles.meh : undefined}>
                                                        {value === undefined ? "·" : value.state === "down" ? "—" : formatNumber(value.latency ?? 0)}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <Pager page={rounds.page} pages={rounds.pages} onPage={setRoundPage} />
                        </>
                    )}
                </Panel>

                <Panel cut="sm" className={styles.box}>
                    <h3 className={styles.boxTitle}>Technik</h3>
                    <dl className={styles.tech}>
                        {bot ? (
                            <>
                                <dt>Bot läuft seit</dt>
                                <dd>{formatDuration((now - Date.parse(bot.startedAt)) / 1000)}</dd>
                                <dt>Speicher</dt>
                                <dd>
                                    {formatBytes(bot.rss)} (Heap {formatBytes(bot.heapUsed)})
                                </dd>
                                <dt>Server · Mitglieder</dt>
                                <dd>
                                    {formatNumber(bot.guilds)} · {formatNumber(bot.members)}
                                </dd>
                                <dt>Versionen</dt>
                                <dd>
                                    App {bot.versions.app} · Node {bot.versions.node} · discord.js {bot.versions.discordjs}
                                </dd>
                            </>
                        ) : (
                            <>
                                <dt>Bot</dt>
                                <dd className={styles.bad}>antwortet nicht</dd>
                            </>
                        )}
                        <dt>MariaDB</dt>
                        <dd>{database ? `${database.version ?? "läuft"}${database.uptime === null ? "" : ` · läuft seit ${formatDuration(database.uptime)}`}` : "nicht erreichbar"}</dd>
                    </dl>
                </Panel>
            </div>
        </div>
    );
}
