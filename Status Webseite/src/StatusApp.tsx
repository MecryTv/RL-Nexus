import { useEffect, useId, useState, type CSSProperties, type JSX } from "react";
import {
    INCIDENT_STATE_LABELS,
    STATUS_SERVICE_LABELS,
    type CheckState,
    type IIncident,
    type ILatency,
    type IPastIssue,
    type IPublicService,
    type IPublicStatus,
    type IStatusDay,
    type PointState,
} from "./status";
import logo from "./assets/logo.webp";
import styles from "./StatusApp.module.scss";

/**
 * status.nexus-emb.de: Läuft RL Nexus gerade?
 *
 * Holt den Stand von /public/status, jede Minute neu, solange der Tab zu
 * sehen ist. Der Server misst alle zwei Minuten, öfter zu fragen brächte
 * nichts Neues.
 */

const REFRESH = 60_000;

const STATE_TEXT: Readonly<Record<CheckState, { readonly title: string; readonly text: string }>> = {
    ok: { title: "Alle Systeme laufen", text: "Bot, Bot-Dashboard, Webseite und Datenbank antworten normal." },
    warn: { title: "Eingeschränkt", text: "Etwas hakt gerade, das meiste läuft aber." },
    down: { title: "Es gibt ein Problem", text: "Mindestens ein Dienst antwortet nicht. Wir sind dran." },
};

const SERVICE_STATE: Readonly<Record<CheckState, string>> = { ok: "Läuft", warn: "Eingeschränkt", down: "Antwortet nicht" };

/** Was jeder Dienst ist, in einem Satz für Leute, die nur wissen wollen, ob sie betroffen sind. */
const SERVICE_ABOUT: Readonly<Record<IPublicService["id"], string>> = {
    bot: "Die Befehle und Automatiken in euren Discord-Servern.",
    dashboard: "Die Einstellungen eurer Server im Browser.",
    website: "nexus-emb.de mit allen Modulen und dem Kontaktformular.",
    database: "Speichert Einstellungen, Level, Tickets und mehr.",
};

const DAY = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long" });
const DATE_TIME = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
const TIME = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" });
const RELATIVE = new Intl.RelativeTimeFormat("de-DE", { numeric: "auto" });

function percent(value: number | null): string {
    return value === null ? "–" : `${value.toLocaleString("de-DE", { maximumFractionDigits: 2 })} %`;
}

function ms(value: number | null): string {
    return value === null ? "–" : `${value.toLocaleString("de-DE")} ms`;
}

function duration(minutes: number): string {
    if (minutes < 60) return `${minutes} Min.`;

    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} ${days === 1 ? "Tag" : "Tage"}`;

    return minutes % 60 === 0 ? `${hours} Std.` : `${hours} Std. ${minutes % 60} Min.`;
}

/** „vor 3 Stunden“, „in 2 Tagen“. */
function relative(iso: string, now: number): string {
    const seconds = (Date.parse(iso) - now) / 1000;
    const units: [Intl.RelativeTimeFormatUnit, number][] = [
        ["day", 86_400],
        ["hour", 3600],
        ["minute", 60],
    ];

    for (const [unit, size] of units) {
        if (Math.abs(seconds) >= size) return RELATIVE.format(Math.round(seconds / size), unit);
    }

    return RELATIVE.format(Math.round(seconds), "second");
}

/** „2T 09:15:42“ bis zu einem Zeitpunkt. */
function countdown(target: number, now: number): string {
    const total = Math.max(0, Math.floor((target - now) / 1000));
    const days = Math.floor(total / 86_400);
    const pad = (value: number): string => String(value).padStart(2, "0");
    const clock = `${pad(Math.floor((total % 86_400) / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;

    return days > 0 ? `${days}T ${clock}` : clock;
}

function useNow(interval: number): number {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), interval);

        return () => window.clearInterval(timer);
    }, [interval]);

    return now;
}

/** Antwortet der Server nicht oder nicht mit JSON (Proxy-Fehlerseite, leere Antwort), steht das hier. */
const UNREACHABLE = "Der Server mit den Statusdaten antwortet gerade nicht. Die Seite versucht es gleich von selbst noch einmal.";

/** Solange noch nie Daten kamen, öfter fragen: Meist startet der Server nur gerade. */
const RETRY = 10_000;

/** Holt /public/status. Wirft einen Satz, der auf die Seite kann, nie eine Meldung des Parsers. */
async function fetchStatus(): Promise<IPublicStatus> {
    let response: Response;

    try {
        response = await fetch("/public/status", { cache: "no-cache" });
    } catch {
        throw new Error(UNREACHABLE);
    }

    // Eine Fehlerseite von Vite oder vom Proxy davor ist kein JSON und oft leer.
    if (!(response.headers.get("content-type") ?? "").includes("json")) throw new Error(UNREACHABLE);

    const body = (await response.json().catch(() => null)) as IPublicStatus | { error?: string } | null;

    if (body === null) throw new Error(UNREACHABLE);
    if (!response.ok || "error" in body) throw new Error(("error" in body && body.error) || UNREACHABLE);

    return body as IPublicStatus;
}

/** Der Stand vom Server: jede Minute neu, sofort, wenn der Tab wieder sichtbar wird. */
function useStatus(): { readonly status: IPublicStatus | null; readonly error: string | null } {
    const [status, setStatus] = useState<IPublicStatus | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        let timer = 0;
        let loaded = false;

        const load = async (): Promise<void> => {
            window.clearTimeout(timer);
            let ok = false;

            // Im Hintergrund nur fragen, solange noch gar nichts da ist: Wer die Seite
            // in einem neuen Tab öffnet, soll beim Hinsehen nicht erst warten.
            if (document.visibilityState === "visible" || !loaded) {
                try {
                    const next = await fetchStatus();
                    if (!active) return;

                    setStatus(next);
                    setError(null);
                    ok = true;
                    loaded = true;
                } catch (failure) {
                    if (!active) return;
                    setError(failure instanceof Error ? failure.message : UNREACHABLE);
                }
            }

            timer = window.setTimeout(() => void load(), ok ? REFRESH : RETRY);
        };

        void load();
        const onVisible = (): void => {
            if (document.visibilityState === "visible") void load();
        };
        document.addEventListener("visibilitychange", onVisible);

        return () => {
            active = false;
            window.clearTimeout(timer);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, []);

    return { status, error };
}

function dayLabel(day: IStatusDay): string {
    const date = DAY.format(new Date(`${day.date}T12:00:00`));

    if (day.state === "none") return `${date} · nicht gemessen`;

    const outages = day.outages === 0 ? "kein Ausfall" : `${day.outages} ${day.outages === 1 ? "Ausfall" : "Ausfälle"}, ${duration(day.downMinutes)}`;

    return `${date} · ${percent(day.uptime)} · ${outages}`;
}

const HOUR_MS = 3_600_000;
const POINT_TEXT: Readonly<Record<PointState, string>> = { ok: "gemessen", warn: "langsam", down: "Ausfall", gap: "nicht gemessen" };

/**
 * Die Kurve der Antwortzeit, 24 Stunden ohne Lücken: Nicht gemessene Stunden
 * liegen grau schraffiert mit gestrichelter Verbindung, Ausfälle als rotes Feld
 * ohne Verbindung. Ohne `points` (älterer Admin-Server) wie früher aus `series`.
 */
function Sparkline({ latency, state, now }: { readonly latency: ILatency; readonly state: CheckState; readonly now: number }): JSX.Element | null {
    const pattern = useId();
    const points = latency.points;
    if (!points || points.length < 2) return <OldSparkline series={latency.series} state={state} />;

    const values = points.map((point) => point.value).filter((value): value is number => value !== null);
    const top = Math.max(1, ...values) * 1.15;
    const step = 150 / (points.length - 1);
    const x = (index: number): number => index * step;
    const y = (value: number): number => 38 - (value / top) * 34;
    const at = (point: (typeof points)[number] | undefined, index: number): string => (point?.value == null ? "" : `${x(index).toFixed(1)},${y(point.value).toFixed(1)}`);
    const firstHour = Math.floor(now / HOUR_MS) - (points.length - 1);

    // Linienstücke: Ein Ausfall oder eine nicht gemessene Stunde beendet eins.
    const segments: string[][] = [[]];
    points.forEach((point, index) => {
        if (point.value === null || point.state === "down") {
            if (segments.at(-1)?.length) segments.push([]);
            return;
        }

        segments.at(-1)?.push(at(point, index));
    });

    // Brücken nur über nicht gemessene Stunden, vom letzten Wert davor zum ersten danach.
    const bridges: string[] = [];
    points.forEach((point, index) => {
        if (point.state !== "gap" || points[index - 1]?.state === "gap") return;

        let end = index;
        while (points[end]?.state === "gap") end++;

        const before = points[index - 1];
        const after = points[end];
        if (before?.value != null && before.state !== "down" && after?.value != null && after.state !== "down") bridges.push(`${at(before, index - 1)} ${at(after, end)}`);
    });

    return (
        <svg className={styles.spark} viewBox="0 0 150 40" preserveAspectRatio="none" data-state={state} role="img" aria-label="Antwortzeit der letzten 24 Stunden">
            <defs>
                <pattern id={pattern} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="2" height="4" className={styles.sparkHatch} />
                </pattern>
            </defs>
            {points.map((point, index) =>
                point.state === "gap" || point.state === "down" ? (
                    <rect
                        key={`feld-${index}`}
                        x={Math.max(0, x(index) - step / 2)}
                        y={0}
                        width={Math.min(150, x(index) + step / 2) - Math.max(0, x(index) - step / 2)}
                        height={40}
                        className={point.state === "gap" ? styles.sparkGap : styles.sparkDown}
                        fill={point.state === "gap" ? `url(#${pattern})` : undefined}
                    />
                ) : null
            )}
            {bridges.map((bridge) => (
                <polyline key={`bruecke-${bridge}`} points={bridge} className={styles.sparkBridge} />
            ))}
            {segments
                .filter((part) => part.length > 1)
                .map((part) => (
                    <polyline key={part[0]} points={part.join(" ")} />
                ))}
            {points.map((point, index) => (
                <rect key={`stunde-${index}`} x={Math.max(0, x(index) - step / 2)} y={0} width={step} height={40} className={styles.sparkHit}>
                    <title>{`${String(new Date((firstHour + index) * HOUR_MS).getHours()).padStart(2, "0")} Uhr · ${POINT_TEXT[point.state]}${point.value === null ? "" : ` · ${point.value} ms`}`}</title>
                </rect>
            ))}
        </svg>
    );
}

/** Die alte Kurve aus 24 Stundenwerten, für einen Admin-Server ohne `points`. Lücken bleiben Lücken. */
function OldSparkline({ series, state }: { readonly series: readonly (number | null)[]; readonly state: CheckState }): JSX.Element | null {
    const values = series.filter((value): value is number => value !== null);
    if (values.length < 2) return null;

    const top = Math.max(...values) * 1.15;
    const step = 150 / (series.length - 1);
    const segments: string[][] = [[]];

    series.forEach((value, index) => {
        if (value === null) {
            if (segments.at(-1)?.length) segments.push([]);
            return;
        }

        segments.at(-1)?.push(`${(index * step).toFixed(1)},${(38 - (value / top) * 34).toFixed(1)}`);
    });

    return (
        <svg className={styles.spark} viewBox="0 0 150 40" preserveAspectRatio="none" aria-hidden="true" data-state={state}>
            {segments
                .filter((points) => points.length > 1)
                .map((points) => (
                    <polyline key={points[0]} points={points.join(" ")} />
                ))}
        </svg>
    );
}

/** Was Farben und Muster bedeuten: die Tagesbalken und die Kurve der Antwortzeit. */
function Legend(): JSX.Element {
    return (
        <div className={styles.legend}>
            <ul aria-label="Balken je Tag">
                <li className={styles.legendTitle}>Balken je Tag</li>
                <li>
                    <i className={styles["bar-ok"]} aria-hidden="true" />
                    läuft
                </li>
                <li>
                    <i className={styles["bar-warn"]} aria-hidden="true" />
                    eingeschränkt oder langsam
                </li>
                <li>
                    <i className={styles["bar-down"]} aria-hidden="true" />
                    Ausfall
                </li>
                <li>
                    <i className={styles["bar-none"]} aria-hidden="true" />
                    noch nicht gemessen
                </li>
            </ul>
            <ul aria-label="Antwortzeit">
                <li className={styles.legendTitle}>Antwortzeit</li>
                <li>
                    <i className={styles.keyLine} aria-hidden="true" />
                    gemessen
                </li>
                <li>
                    <i className={styles.keyGap} aria-hidden="true" />
                    nicht gemessen
                </li>
                <li>
                    <i className={styles.keyDown} aria-hidden="true" />
                    Ausfall
                </li>
            </ul>
        </div>
    );
}

function Bars({ days }: { readonly days: readonly IStatusDay[] }): JSX.Element {
    const [active, setActive] = useState<number | null>(null);
    const shown = active === null ? null : days[active];

    return (
        <div className={styles.barsWrap} onMouseLeave={() => setActive(null)}>
            <div className={styles.bars} aria-hidden="true">
                {days.map((day, index) => (
                    <span key={day.date} className={styles[`bar-${day.state}`]} title={dayLabel(day)} onMouseEnter={() => setActive(index)} />
                ))}
            </div>
            {shown && (
                <span className={styles.tip} style={{ "--at": `${((active ?? 0) / Math.max(1, days.length - 1)) * 100}%` } as CSSProperties}>
                    {dayLabel(shown)}
                </span>
            )}
        </div>
    );
}

function Service({ service, now }: { readonly service: IPublicService; readonly now: number }): JSX.Element {
    const measured = service.days.findIndex((day) => day.state !== "none");
    const days = measured === -1 ? 0 : service.days.length - measured;
    const outage = service.lastOutage;

    const facts: string[] = [];

    if (service.id === "bot" && service.since) facts.push(`läuft seit ${relative(service.since, now).replace(/^vor /, "")}`);
    if (service.id === "bot") facts.push(`Ping zu Discord ${ms(service.latency.now)}`);
    else facts.push(`Antwortzeit ${ms(service.latency.now)}`, `Ø 24 Std. ${ms(service.latency.avg)}`);
    if (service.id === "website" && service.since) facts.push(`aktualisiert ${relative(service.since, now)}`);
    facts.push(outage === null ? "kein Ausfall in 90 Tagen" : outage.end === null ? `weg seit ${relative(outage.start, now).replace(/^vor /, "")}` : `letzter Ausfall ${relative(outage.start, now)}, ${duration(outage.minutes)}`);

    return (
        <li className={styles.service} data-state={service.state}>
            <div className={styles.serviceMain}>
                <div className={styles.serviceHead}>
                    <h3 className={styles.serviceName}>
                        <span className={styles.dot} aria-hidden="true" />
                        {STATUS_SERVICE_LABELS[service.id]}
                    </h3>
                    <span className={styles.serviceState}>{SERVICE_STATE[service.state]}</span>
                </div>
                <p className={styles.about}>{SERVICE_ABOUT[service.id]}</p>
                <Bars days={service.days} />
                <p className={styles.scale}>
                    <span>{days < service.days.length ? `seit ${days} ${days === 1 ? "Tag" : "Tagen"} gemessen` : "vor 90 Tagen"}</span>
                    <span>{percent(service.uptime.quarter)} verfügbar</span>
                    <span>heute</span>
                </p>
                <p className={styles.facts}>{facts.join(" · ")}</p>
                <p className="u-sr">
                    {STATUS_SERVICE_LABELS[service.id]}: {SERVICE_STATE[service.state]}. {percent(service.uptime.quarter)} verfügbar in 90 Tagen, {percent(service.uptime.month)} in 30
                    Tagen.
                </p>
            </div>
            <div className={styles.serviceSide}>
                <p className={styles.label}>{service.id === "bot" ? "Ping 24 Std." : "Antwortzeit 24 Std."}</p>
                <p className={styles.sideValue}>{ms(service.latency.now)}</p>
                <Sparkline latency={service.latency} state={service.state} now={now} />
            </div>
        </li>
    );
}

function Incident({ incident }: { readonly incident: IIncident }): JSX.Element {
    return (
        <article className={styles.notice} aria-labelledby={`meldung-${incident.id}`}>
            <div className={styles.noticeHead}>
                <h2 id={`meldung-${incident.id}`} className={styles.noticeTitle}>
                    {incident.title}
                </h2>
                <span className={styles.chip}>{INCIDENT_STATE_LABELS[incident.state]}</span>
            </div>
            <p className={styles.affects}>
                Betrifft {incident.services.map((service) => STATUS_SERVICE_LABELS[service]).join(", ")} · seit {TIME.format(new Date(incident.createdAt))}
            </p>
            <ol className={styles.timeline}>
                {incident.updates.map((update, index) => (
                    <li key={update.id}>
                        <span className={styles.when}>
                            {TIME.format(new Date(update.createdAt))} {index === incident.updates.length - 1 ? "Gemeldet" : "Update"}
                        </span>
                        <span>{update.body}</span>
                    </li>
                ))}
            </ol>
        </article>
    );
}

function Maintenance({ incident, now }: { readonly incident: IIncident; readonly now: number }): JSX.Element {
    const start = Date.parse(incident.startsAt ?? "");
    const end = Date.parse(incident.endsAt ?? "");
    const running = start <= now && now < end;

    return (
        <article className={styles.maintenance} aria-labelledby={`wartung-${incident.id}`}>
            <div>
                <p className={styles.label}>{running ? "Wartung läuft" : "Geplante Wartung"}</p>
                <h2 id={`wartung-${incident.id}`} className={styles.maintenanceTitle}>
                    {incident.title}
                </h2>
                <p className={styles.affects}>
                    {DATE_TIME.format(start)} bis etwa {TIME.format(end)} · betrifft {incident.services.map((service) => STATUS_SERVICE_LABELS[service]).join(", ")}
                </p>
                {incident.updates[0] && <p className={styles.maintenanceText}>{incident.updates[0].body}</p>}
            </div>
            <p className={styles.count}>
                <span className={styles.label}>{running ? "Endet in" : "Beginnt in"}</span>
                <span aria-hidden="true">{countdown(running ? end : start, now)}</span>
                <span className="u-sr">{relative(new Date(running ? end : start).toISOString(), now)}</span>
            </p>
        </article>
    );
}

function Issue({ issue }: { readonly issue: IPastIssue }): JSX.Element {
    const start = new Date(issue.start);

    return (
        <li className={styles.issue}>
            <p className={styles.issueTitle}>{issue.title}</p>
            <p className={styles.affects}>
                {DATE_TIME.format(start)}
                {issue.end ? ` bis ${TIME.format(new Date(issue.end))}` : ", läuft noch"} · {duration(issue.minutes)}
            </p>
            <p className={styles.issueNote}>
                {issue.kind === "ausfall" ? "Automatisch erkannt" : "Eigene Meldung"} · {issue.services.map((service) => STATUS_SERVICE_LABELS[service]).join(", ")}
                {issue.note && ` · ${issue.note}`}
            </p>
        </li>
    );
}

export function StatusApp(): JSX.Element {
    const { status, error } = useStatus();
    const now = useNow(1000);

    useEffect(() => {
        if (status) document.title = `${STATE_TEXT[status.state].title} · Status · RL Nexus`;
    }, [status]);

    const website = status?.links.website ?? "https://nexus-emb.de";

    return (
        <div className={styles.page}>
            <header className={styles.top}>
                <a className={styles.brand} href={website}>
                    <img src={logo} alt="" width={38} height={38} />
                    <span className={styles.word}>
                        RL <span>NEXUS</span>
                        <small>Status</small>
                    </span>
                </a>
                <nav className={styles.nav} aria-label="Weiter zu">
                    {status?.links.discord && (
                        <a className={styles.ghost} href={status.links.discord} target="_blank" rel="noopener noreferrer">
                            Discord
                        </a>
                    )}
                    <a className={styles.ghost} href={website}>
                        Zur Webseite
                    </a>
                </nav>
            </header>

            <main>
                {status === null ? (
                    <p className={styles.loading} role="status">
                        {error ?? "Der Status wird geladen …"}
                    </p>
                ) : (
                    <>
                        <section className={styles.hero} aria-label="Gesamtzustand">
                            <div className={styles.state} data-state={status.state}>
                                <span className={styles.ring} aria-hidden="true" />
                                <div>
                                    <h1 className={styles.stateTitle}>{STATE_TEXT[status.state].title}</h1>
                                    <p className={styles.stateText}>
                                        {STATE_TEXT[status.state].text}{" "}
                                        {status.checkedAt && `Geprüft ${relative(status.checkedAt, now)}, alle 2 Minuten neu.`}
                                    </p>
                                </div>
                            </div>
                            <dl className={styles.kpis}>
                                <div>
                                    <dt>Verfügbar</dt>
                                    <dd className={styles.good}>{percent(status.uptimeMonth)}</dd>
                                    <dd className={styles.small}>letzte 30 Tage</dd>
                                </div>
                                <div>
                                    <dt>Antwortzeit</dt>
                                    <dd>{ms(status.latencyAvg)}</dd>
                                    <dd className={styles.small}>Mittel aller Dienste</dd>
                                </div>
                                <div>
                                    <dt>Im Einsatz</dt>
                                    <dd>{status.servers ?? "–"}</dd>
                                    <dd className={styles.small}>{status.members === null ? "Server" : `Server · ${status.members.toLocaleString("de-DE")} Mitglieder`}</dd>
                                </div>
                                <div>
                                    <dt>Ohne Störung</dt>
                                    <dd>{status.state !== "ok" ? "–" : status.lastIssueEnd ? relative(status.lastIssueEnd, now).replace(/^vor /, "") : "90+ Tage"}</dd>
                                    <dd className={styles.small}>
                                        {status.state !== "ok"
                                            ? "gerade nicht"
                                            : status.lastIssueEnd
                                              ? `seit ${DATE_TIME.format(new Date(status.lastIssueEnd))}`
                                              : "keine Störung bekannt"}
                                    </dd>
                                </div>
                            </dl>
                        </section>

                        {status.incidents.map((incident) => (
                            <Incident key={incident.id} incident={incident} />
                        ))}

                        {status.maintenance.map((incident) => (
                            <Maintenance key={incident.id} incident={incident} now={now} />
                        ))}

                        <section aria-labelledby="dienste">
                            <h2 id="dienste" className={styles.label}>
                                Dienste · letzte 90 Tage
                            </h2>
                            <Legend />
                            <ul className={styles.services}>
                                {status.services.map((service) => (
                                    <Service key={service.id} service={service} now={now} />
                                ))}
                            </ul>
                        </section>

                        <div className={styles.lower}>
                            <section aria-labelledby="stoerungen">
                                <h2 id="stoerungen" className={styles.label}>
                                    Störungen der letzten 14 Tage
                                </h2>
                                {status.history.length === 0 ? (
                                    <p className={styles.calm}>Keine Störung in den letzten 14 Tagen.</p>
                                ) : (
                                    <ul className={styles.issues}>
                                        {status.history.map((issue) => (
                                            <Issue key={`${issue.kind}-${issue.start}-${issue.title}`} issue={issue} />
                                        ))}
                                    </ul>
                                )}
                            </section>
                            <section className={styles.about2} aria-labelledby="pruefung">
                                <h2 id="pruefung" className={styles.label}>
                                    So wird geprüft
                                </h2>
                                <p>
                                    Alle zwei Minuten fragt der Server Bot, Bot-Dashboard, Webseite und Datenbank ab und misst, wie schnell sie antworten. Ein Tagesbalken wird gelb,
                                    wenn etwas langsam oder in Wartung war, und rot bei einem Ausfall. Alle Zeiten stehen in deiner Zeitzone.
                                </p>
                            </section>
                        </div>

                        {error && (
                            <p className={styles.stale} role="status">
                                Gerade keine Verbindung zum Server, das hier ist der Stand von {status.checkedAt ? TIME.format(new Date(status.checkedAt)) : "eben"}.
                            </p>
                        )}
                    </>
                )}
            </main>

            <footer className={styles.foot}>
                <span>Aktualisiert sich von selbst</span>
                <span>
                    <a href="mailto:support@nexus-emb.de">support@nexus-emb.de</a> · <a href={`${website}/impressum`}>Impressum</a> · <a href={`${website}/datenschutz`}>Datenschutz</a>
                </span>
            </footer>
        </div>
    );
}
