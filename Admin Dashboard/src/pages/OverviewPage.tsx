import type { JSX, ReactNode } from "react";
import { Link } from "react-router-dom";
import type { IMailAllPage, IMaintenance, IOverview, IOverviewService } from "../../shared/api";
import type { IMaintenanceState } from "../../shared/maintenance";
import type { IBackupsOverview } from "../../shared/backups";
import { roundSentence } from "../backups/format";
import { BANNER_STATE_LABELS, type BannerState } from "../../shared/content";
import { AUDIT_LABELS } from "../../shared/limits";
import { INCIDENT_KIND_LABELS, STATUS_SERVICE_LABELS, STATUS_SERVICES, type CheckState, type StatusService } from "../../shared/status";
import { useLive } from "../api/live";
import { allPath, boxColor, displayName, mailPath, useMailOverview } from "../api/mail";
import { useApi } from "../api/useApi";
import { Badge, type BadgeTone } from "../components/Badge";
import { GuildTable } from "../components/GuildTable";
import { Icon } from "../components/Icon";
import { PageHeader } from "../components/PageHeader";
import { Panel } from "../components/Panel";
import { RestartBot } from "../components/RestartBot";
import { Failure, Loading } from "../components/Status";
import { formatBytes, formatDateTime, formatDuration, formatNumber, formatPercent, formatTime } from "../format";
import { useMe } from "../session/context";
import { sparkline } from "../sparkline";
import { useTitle } from "../useTitle";
import styles from "./OverviewPage.module.scss";

/** So oft fragt die Übersicht nach, solange der Tab sichtbar ist. */
const REFRESH = 15_000;

/** Sichtbar fällt auf, geplant ist eine Info, aus und abgelaufen sind ruhig. */
const BANNER_STATE_TONES: Readonly<Record<BannerState, BadgeTone>> = { sichtbar: "warn", geplant: "info", abgelaufen: "neutral", aus: "neutral" };

const STATE_TONES: Readonly<Record<CheckState, BadgeTone>> = { ok: "ok", warn: "warn", down: "danger" };

/** Gelb heißt bei der Prüfung: langsam, in Wartung oder der Bot ist noch nicht bereit. */
const STATE_WORDS: Readonly<Record<CheckState, string>> = { ok: "Erreichbar", warn: "Eingeschränkt", down: "Ausfall" };

function sinceText(state: IMaintenanceState): string {
    const parts = [`seit ${formatDateTime(state.startedAt)}`, state.startedBy ? `von ${state.startedBy}` : null].filter(Boolean);

    return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}

/** Ein Satz dazu, was gerade in der Wartung ist. null: nichts. */
function maintenanceText(maintenance: IMaintenance): string | null {
    const { website, dashboard } = maintenance;

    if (website && dashboard) return "Webseite und Bot-Dashboard zeigen gerade die Wartungsseite.";
    if (website) return `Die Webseite zeigt gerade die Wartungsseite${sinceText(website)}.`;
    if (dashboard) return `Das Bot-Dashboard zeigt gerade die Wartungsseite${sinceText(dashboard)}.`;

    return null;
}

function ms(value: number | null): string {
    return value === null ? "–" : `${formatNumber(value)} ms`;
}

/** Antwortzeit der letzten 24 Stunden als eine durchgehende Linie. */
function Sparkline({ series, state }: { readonly series: readonly (number | null)[]; readonly state: CheckState }): JSX.Element {
    return (
        <svg className={styles.spark} data-state={state} viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
            <polyline points={sparkline(series)} />
        </svg>
    );
}

/** Ein Dienst als Kachel. Ohne Prüfung (gerade gestartet) bleibt der Platz mit Strichen reserviert. */
function ServiceTile({ id, service, children }: { readonly id: StatusService; readonly service: IOverviewService | null; readonly children?: ReactNode }): JSX.Element {
    const word = service ? (id === "bot" && service.state === "ok" ? "Online" : STATE_WORDS[service.state]) : "–";

    return (
        <Panel cut="sm" className={styles.tile}>
            <div className={styles.tileHead}>
                <h3 className={styles.tileName}>{STATUS_SERVICE_LABELS[id]}</h3>
                {service && <Badge tone={STATE_TONES[service.state]}>{word}</Badge>}
            </div>
            <p className={styles.uptime}>
                <strong>{formatPercent(service?.uptimeMonth ?? null)}</strong> in 30 Tagen
            </p>
            {service && <Sparkline series={service.latency.series} state={service.state} />}
            <p className={styles.small}>
                jetzt {ms(service?.latency.now ?? null)} · Ø {ms(service?.latency.avg ?? null)}
            </p>
            {children}
        </Panel>
    );
}

/** Eine Kennzahl im Kasten „Bot im Detail“, mit kleiner Zeile darunter. */
function Fact({ label, value, sub }: { readonly label: string; readonly value: ReactNode; readonly sub?: ReactNode }): JSX.Element {
    return (
        <div className={styles.fact}>
            <dt>{label}</dt>
            <dd>
                {value}
                {sub !== undefined && <small>{sub}</small>}
            </dd>
        </div>
    );
}

/** Ungelesenes je Postfach. Eigene Anfrage, damit die Übersicht nicht auf IMAP wartet. */
function Mailboxes(): JSX.Element {
    const { data, error } = useMailOverview();

    if (error && !data) return <p className={styles.note}>Das Postfach antwortet gerade nicht.</p>;
    if (!data) return <Loading />;
    if (data.boxes.length === 0) return <p className={styles.note}>Noch kein Postfach eingerichtet.</p>;

    const broken = data.boxes.filter((box) => box.error !== null);

    return (
        <>
            <ul className={styles.boxes}>
                {data.boxes.map((box, index) => {
                    const inbox = box.folders?.find((folder) => folder.role === "inbox") ?? null;

                    return (
                        <li key={box.id}>
                            <Link to={inbox ? mailPath(box.id, inbox.path) : allPath()} className={styles.box} title={box.error ?? box.address}>
                                <span className={styles.boxCount} style={{ color: box.error ? "var(--c-loss)" : inbox && inbox.unread > 0 ? boxColor(index) : undefined }}>
                                    {box.error ? "!" : formatNumber(inbox?.unread ?? 0)}
                                </span>
                                <span className={styles.boxLabel}>{box.label}</span>
                            </Link>
                        </li>
                    );
                })}
            </ul>
            <p className={styles.small}>
                ungelesen im Posteingang
                {broken.length > 0 && <span className={styles.error}> · {broken.map((box) => `${box.label}: ${box.error}`).join(" · ")}</span>}
            </p>
        </>
    );
}

/** Bis zu fünf ungelesene Mails aus allen Posteingängen. */
function LatestMail(): JSX.Element {
    const { data, error, reload } = useApi<IMailAllPage>("/api/mail/all?filter=ungelesen");

    useLive("mail", reload);

    if (error && !data) return <p className={styles.note}>Das Postfach antwortet gerade nicht.</p>;
    if (!data) return <Loading />;
    if (data.messages.length === 0) return <p className={styles.note}>Keine ungelesenen Mails.</p>;

    return (
        <>
            <ul className={styles.rows}>
                {data.messages.slice(0, 5).map((entry) => (
                    <li key={`${entry.account}-${entry.uid}`}>
                        <Link to={allPath(entry.account, entry.uid)} className={styles.row}>
                            <span className={styles.text} title={`${displayName(entry.from)} · ${entry.subject}`}>
                                <strong>{displayName(entry.from)}</strong> · {entry.subject}
                            </span>
                            <span className={styles.when}>{formatDateTime(entry.date)}</span>
                        </Link>
                    </li>
                ))}
            </ul>
            {data.total > 5 && <p className={styles.small}>Dazu {data.total - 5} weitere ungelesene.</p>}
        </>
    );
}

function RecentActions({ entries }: { readonly entries: IOverview["recent"] }): JSX.Element {
    if (entries.length === 0) return <p className={styles.note}>Noch nichts im Protokoll.</p>;

    return (
        <ul className={styles.rows}>
            {entries.map((entry) => (
                <li key={entry.id} className={styles.row}>
                    <span className={styles.text} title={[entry.userName, AUDIT_LABELS[entry.action] ?? entry.action, entry.target].filter(Boolean).join(" · ")}>
                        <strong>{entry.userName}</strong> · {AUDIT_LABELS[entry.action] ?? entry.action}
                        {entry.target && <span className={styles.target}> · {entry.target}</span>}
                    </span>
                    <span className={styles.when}>{formatDateTime(entry.createdAt)}</span>
                </li>
            ))}
        </ul>
    );
}

function Section({ id, title, action, className, children }: { readonly id: string; readonly title: string; readonly action?: ReactNode; readonly className?: string; readonly children: ReactNode }): JSX.Element {
    return (
        <section className={className} aria-labelledby={`${id}-titel`}>
            <div className={styles.head}>
                <h2 id={`${id}-titel`} className={styles.heading}>
                    {title}
                </h2>
                {action}
            </div>
            {children}
        </section>
    );
}

function More({ to, children }: { readonly to: string; readonly children: ReactNode }): JSX.Element {
    return (
        <Link to={to} className={styles.more}>
            {children} <Icon name="arrow-right" size={16} />
        </Link>
    );
}

/** Gelb, wenn in der letzten Nacht ein Server nicht gesichert wurde. Gemeldet wird das nur hier und auf der Seite Backups. */
function BackupNotice(): JSX.Element | null {
    const { data, reload } = useApi<IBackupsOverview>("/api/backups");

    useLive("backups", reload);

    if (!data?.round || data.round.failed.length === 0) return null;

    return (
        <Panel className={[styles.notice, styles.alert].join(" ")}>
            <Badge tone="warn">Backups</Badge>
            <p>{roundSentence(data.round)}</p>
            <More to="/backups">Backups</More>
        </Panel>
    );
}

export function OverviewPage(): JSX.Element {
    useTitle("Übersicht");

    const me = useMe();
    const { data, error, updatedAt, reload } = useApi<IOverview>("/api/overview", REFRESH);

    // Was andere ändern, steht sofort da. Die 15 Sekunden bleiben für das, was
    // von selbst altert: Laufzeit, Ping, Antwortzeiten, ob der Bot noch antwortet.
    useLive("maintenance", reload);
    useLive("content", reload);
    const bot = data?.bot ?? null;
    const offline = data !== null && bot === null;
    const maintenance = data ? maintenanceText(data.maintenance) : null;
    const status = data?.status ?? null;
    const serviceOf = (id: StatusService): IOverviewService | null => status?.services.find((service) => service.id === id) ?? null;
    const meta = updatedAt
        ? [`Stand ${formatTime(updatedAt)}`, status?.uptimeMonth != null ? `${formatPercent(status.uptimeMonth)} in 30 Tagen` : null, "aktualisiert sich alle 15 Sekunden"].filter(Boolean).join(" · ")
        : undefined;

    return (
        <>
            <PageHeader title="Übersicht" meta={meta} />

            {error && <Failure message={error.message} onRetry={reload} />}

            {maintenance && (
                <Panel className={[styles.notice, styles.alert].join(" ")}>
                    <Badge tone="warn">Wartung</Badge>
                    <p>{maintenance}</p>
                    {me.role === "developer" && <More to="/dev/wartung">Wartung verwalten</More>}
                </Panel>
            )}

            {status?.incidents.map((incident) => (
                <Panel key={incident.id} className={[styles.notice, styles.alert].join(" ")}>
                    <Badge tone={incident.kind === "stoerung" ? "danger" : "info"}>{INCIDENT_KIND_LABELS[incident.kind]}</Badge>
                    <p>
                        {incident.title}
                        {incident.kind === "wartung" && incident.startsAt && <span className={styles.small}> · ab {formatDateTime(incident.startsAt)}</span>}
                    </p>
                    <More to="/status">Meldungen</More>
                </Panel>
            ))}

            <BackupNotice />

            <Section id="dienste" title="Dienste" action={<More to="/status">Statusmeldungen</More>}>
                <div className={styles.tiles}>
                    {STATUS_SERVICES.map((id) => (
                        <ServiceTile key={id} id={id} service={serviceOf(id)}>
                            {id === "website" && data && (
                                <p className={styles.extra}>
                                    <span className={styles.small}>Gebaut {data.website.builtAt ? formatDateTime(data.website.builtAt) : "unbekannt"}</span>
                                    {data.website.banner !== null && (
                                        <Link to="/webseite/banner" className={styles.inline} aria-label={`Banner: ${BANNER_STATE_LABELS[data.website.banner]}, bearbeiten`}>
                                            <Badge tone={BANNER_STATE_TONES[data.website.banner]}>Banner {BANNER_STATE_LABELS[data.website.banner]}</Badge>
                                        </Link>
                                    )}
                                </p>
                            )}
                        </ServiceTile>
                    ))}
                </div>
                {data && status === null && <p className={styles.small}>Die erste Prüfung nach dem Start läuft noch.</p>}
            </Section>

            <div className={styles.split}>
                <Section id="bot" title="Bot im Detail" action={me.role === "developer" ? <RestartBot onBack={reload} /> : undefined}>
                    {offline ? (
                        <Panel className={styles.notice}>
                            <Badge tone="danger">Offline</Badge>
                            <p>Der Bot antwortet nicht. Neuer Versuch in 15 Sekunden.</p>
                        </Panel>
                    ) : (
                        <dl className={styles.facts}>
                            <Fact label="Ping" value={bot && bot.ping !== null ? `${bot.ping} ms` : "–"} sub={bot ? (bot.ready ? "verbunden" : "verbindet") : undefined} />
                            <Fact label="Läuft seit" value={bot ? formatDuration(bot.uptime) : "–"} sub={bot ? formatDateTime(bot.startedAt) : undefined} />
                            <Fact label="Server" value={bot ? formatNumber(bot.guildCount) : "–"} />
                            <Fact label="Mitglieder" value={bot ? formatNumber(bot.memberCount) : "–"} />
                            <Fact label="Speicher" value={bot ? formatBytes(bot.memory.rss) : "–"} sub={bot ? `Heap ${formatBytes(bot.memory.heapUsed)}` : undefined} />
                            <Fact
                                label="Commands"
                                value={data?.commands ? formatNumber(data.commands.count) : "–"}
                                sub={data?.commands ? `in ${data.commands.modules} Modulen` : "noch nicht geholt"}
                            />
                            <Fact label="Version" value={bot ? bot.versions.app : "–"} sub={bot ? `discord.js ${bot.versions.discordjs} · Node ${bot.versions.node}` : undefined} />
                            <Fact
                                label="Statusmeldung"
                                value={data ? (data.statusPost.channels === 0 ? "aus" : data.statusPost.at ? formatTime(Date.parse(data.statusPost.at)) : "–") : "–"}
                                sub={data && data.statusPost.channels > 0 ? `${data.statusPost.channels} ${data.statusPost.channels === 1 ? "Kanal" : "Kanäle"}` : undefined}
                            />
                        </dl>
                    )}
                </Section>

                <Section id="postfaecher" title="Postfächer" action={<More to={allPath()}>Alle Posteingänge</More>}>
                    <Panel cut="sm" className={styles.card}>
                        <Mailboxes />
                    </Panel>
                </Section>
            </div>

            <div className={styles.pair}>
                <Section id="aktionen" title="Letzte Aktionen" action={me.role === "developer" ? <More to="/dev/protokoll">Protokoll</More> : undefined}>
                    <Panel cut="sm" className={styles.card}>{data ? <RecentActions entries={data.recent} /> : <Loading />}</Panel>
                </Section>

                <Section id="mail" title="Neueste Mails" action={<More to={allPath()}>Zum Postfach</More>}>
                    <Panel cut="sm" className={styles.card}>
                        <LatestMail />
                    </Panel>
                </Section>
            </div>

            <Section id="server" title="Größte Server" className={styles.spaced} action={<More to="/server">Alle Server</More>}>
                {data ? (
                    <GuildTable guilds={data.topGuilds} empty={offline ? "Ohne Bot gibt es keine Serverliste." : "Der Bot ist noch auf keinem Server."} />
                ) : (
                    <Loading label="Server werden geladen" />
                )}
            </Section>
        </>
    );
}
