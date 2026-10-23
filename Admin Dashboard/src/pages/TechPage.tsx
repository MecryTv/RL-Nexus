import type { JSX } from "react";
import type { IMigration, ITech } from "../../shared/api";
import { useApi } from "../api/useApi";
import { Badge } from "../components/Badge";
import { Metric } from "../components/Metric";
import { PageHeader } from "../components/PageHeader";
import { Panel } from "../components/Panel";
import { Failure, Loading } from "../components/Status";
import { formatBytes, formatDateTime, formatDuration, formatNumber, formatTime } from "../format";
import { useTitle } from "../useTitle";
import styles from "./dev.module.scss";

function Online({ online, yes = "Erreichbar", no = "Antwortet nicht" }: { readonly online: boolean; readonly yes?: string; readonly no?: string }): JSX.Element {
    return <Badge tone={online ? "ok" : "danger"}>{online ? yes : no}</Badge>;
}

/** Zahl, die neueste und alle Migrationen zum Aufklappen. */
function Migrations({ label, list }: { readonly label: string; readonly list: readonly IMigration[] }): JSX.Element {
    const newest = list.at(-1);

    return (
        <details className={styles.details}>
            <summary>
                {label}: {list.length}
                {newest ? `, zuletzt ${newest.name} am ${formatDateTime(newest.appliedAt)}` : ""}
            </summary>
            <ul>
                {list.map((migration) => (
                    <li key={migration.name}>
                        <code>{migration.name}</code> {formatDateTime(migration.appliedAt)}
                    </li>
                ))}
            </ul>
        </details>
    );
}

function TechView({ tech }: { readonly tech: ITech }): JSX.Element {
    const env = tech.bot ? Object.entries(tech.bot.env).sort(([a], [b]) => a.localeCompare(b)) : [];

    return (
        <>
            <section className={styles.section} aria-labelledby="technik-bot">
                <h2 id="technik-bot" className={styles.heading}>
                    Bot
                </h2>
                {tech.bot === null ? (
                    <Panel className={styles.notice}>
                        <Online online={false} />
                        <p>Der Bot antwortet nicht. Was zuletzt passiert ist, steht in den Logs.</p>
                    </Panel>
                ) : (
                    <div className={styles.metrics}>
                        <Metric label="Status" value={<Badge tone={tech.bot.ready ? "ok" : "warn"}>{tech.bot.ready ? "Online" : "Verbindet"}</Badge>} />
                        <Metric label="Ping" value={tech.bot.ping === null ? "–" : `${tech.bot.ping} ms`} />
                        <Metric label="Läuft seit" value={formatDuration(tech.bot.uptime)} />
                        <Metric label="Speicher" value={formatBytes(tech.bot.memory.rss)} />
                        <Metric label="Server" value={formatNumber(tech.bot.guildCount)} />
                        <Metric label="Version" value={`${tech.bot.versions.app} · discord.js ${tech.bot.versions.discordjs} · Node ${tech.bot.versions.node}`} />
                    </div>
                )}
            </section>

            <section className={styles.section} aria-labelledby="technik-datenbank">
                <h2 id="technik-datenbank" className={styles.heading}>
                    Datenbank
                </h2>
                <div className={styles.metrics}>
                    <Metric label="Status" value={<Online online={tech.database.online} />} />
                    <Metric label="Version" value={tech.database.version ?? "–"} />
                </div>
                {tech.database.online && (
                    <>
                        <Migrations label="Migrationen des Bots" list={tech.database.migrations.bot} />
                        <Migrations label="Migrationen des Admin Dashboards" list={tech.database.migrations.admin} />
                        <div className={styles.frame}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th scope="col">Tabelle</th>
                                        <th scope="col">Zeilen (etwa)</th>
                                        <th scope="col">Größe</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {tech.database.tables.map((table) => (
                                        <tr key={table.name}>
                                            <td>
                                                <code>{table.name}</code>
                                            </td>
                                            <td>{table.rows === null ? "–" : formatNumber(table.rows)}</td>
                                            <td>{table.bytes === null ? "–" : formatBytes(table.bytes)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </section>

            <section className={styles.section} aria-labelledby="technik-dienste">
                <h2 id="technik-dienste" className={styles.heading}>
                    Admin-Server und Webseite
                </h2>
                <div className={styles.metrics}>
                    <Metric label="Admin: Node" value={tech.admin.node} />
                    <Metric label="Admin: läuft seit" value={formatDuration(tech.admin.uptime)} />
                    <Metric label="Admin: Speicher" value={formatBytes(tech.admin.memory.rss)} />
                    <Metric
                        label="Admin: Modus"
                        value={<Badge tone={tech.admin.developerMode ? "pro" : "ok"}>{tech.admin.developerMode ? "Dev" : "Produktion"}</Badge>}
                    />
                    <Metric label="Admin: Application" value={<code>{tech.admin.clientId}</code>} />
                    <Metric
                        label="Kontakt-Hinweis"
                        value={
                            <>
                                <Badge tone={tech.admin.notify.mail ? "ok" : "neutral"}>{tech.admin.notify.mail ? "E-Mail an" : "E-Mail aus"}</Badge>{" "}
                                <Badge tone={tech.admin.notify.discord ? "ok" : "neutral"}>{tech.admin.notify.discord ? "Discord an" : "Discord aus"}</Badge>
                            </>
                        }
                    />
                    <Metric label="Webseite" value={<Online online={tech.website.online} />} />
                    <Metric label="Webseite gebaut" value={tech.website.builtAt ? formatDateTime(tech.website.builtAt) : "unbekannt"} />
                </div>
            </section>

            {env.length > 0 && (
                <section className={styles.section} aria-labelledby="technik-umgebung">
                    <h2 id="technik-umgebung" className={styles.heading}>
                        Umgebung des Bots
                    </h2>
                    <p className={styles.hint}>Nur ob ein Schlüssel aus .env.example gesetzt ist, nie sein Wert.</p>
                    <ul className={styles.env}>
                        {env.map(([key, set]) => (
                            <li key={key}>
                                <code>{key}</code>
                                <Badge tone={set ? "ok" : "neutral"}>{set ? "Gesetzt" : "Leer"}</Badge>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </>
    );
}

export function TechPage(): JSX.Element {
    useTitle("Technik");

    const { data, error, updatedAt, reload } = useApi<ITech>("/api/tech");

    return (
        <>
            <PageHeader title="Technik" meta={updatedAt ? `Stand ${formatTime(updatedAt)}` : undefined} />
            {error && !data ? <Failure message={error.message} onRetry={reload} /> : !data ? <Loading label="Technik wird geladen" /> : <TechView tech={data} />}
        </>
    );
}
