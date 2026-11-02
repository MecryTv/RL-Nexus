import { useEffect, useState, type CSSProperties, type JSX } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { AUDIT_LABELS } from "../../shared/limits.ts";
import { SEARCH_DEBOUNCE_MS } from "../../shared/search.ts";
import {
    USERDATA_AREA_IDS,
    USERDATA_AREAS,
    USERDATA_FILTERS,
    USERDATA_SORTS,
    type IDeletion,
    type IUserdataList,
    type IUserdataPerson,
    type IUserdataProfile,
    type UserdataArea,
    type UserdataFilter,
    type UserdataSort,
} from "../../shared/userdata.ts";
import { useLive } from "../api/live";
import { useApi } from "../api/useApi";
import { Button, LinkButton } from "../components/Button";
import { CopyText } from "../components/CopyText";
import { Field } from "../components/Field";
import { Icon } from "../components/Icon";
import { Metric } from "../components/Metric";
import { PageHeader } from "../components/PageHeader";
import { PageTabs } from "../components/PageTabs";
import { Failure, Loading } from "../components/Status";
import { formatDate, formatDateTime, formatNumber } from "../format";
import { useNow } from "../useNow";
import { useTitle } from "../useTitle";
import { DeletionActions, Due, StateBadge, Steps } from "./DeletionParts";
import { PlanDialog } from "./PlanDialog";
import { isOpen, remaining, when } from "./plan.ts";
import styles from "./userdata.module.scss";

const FILTER_LABELS: Readonly<Record<UserdataFilter, string>> = { alle: "Alle", laeuft: "Löschung läuft", shop: "Shop-Kunden" };
const SORT_LABELS: Readonly<Record<UserdataSort, string>> = { eintraege: "Einträgen", zuletzt: "zuletzt aktiv", name: "Name" };
const TABS = [
    { id: "bereiche", label: "Bereiche" },
    { id: "zeitleiste", label: "Zeitleiste" },
    { id: "server", label: "Server" },
    { id: "protokoll", label: "Protokoll" },
] as const;
const AREAS = new Map(USERDATA_AREAS.map((area) => [area.id, area]));
const MONTH = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" });

function initialOf(name: string | null): string {
    return (name ?? "?").slice(0, 1).toUpperCase();
}

/** Die laufende oder angehaltene Löschung als Leiste unter dem Kopf, nach dem Löschen der Beleg. Abgebrochene stehen nur im Protokoll. */
function DeletionBox({ deletion, onChanged }: { readonly deletion: IDeletion; readonly onChanged: () => void }): JSX.Element | null {
    const now = useNow(1000);

    if (deletion.state === "abgebrochen") return null;

    return (
        <section className={[styles.deletionBox, deletion.state === "angehalten" ? styles.halt : deletion.state === "geplant" ? styles.run : ""].join(" ")} aria-label="Löschung">
            <div className={styles.cellState}>
                <StateBadge state={deletion.state} />
                <Steps deletion={deletion} />
            </div>
            <Due deletion={deletion} now={now} />
            <DeletionActions deletion={deletion} onChanged={onChanged} />
        </section>
    );
}

/** Aktivität der letzten 13 Wochen als Balken, die neueste rechts. */
function Activity({ weeks }: { readonly weeks: readonly number[] }): JSX.Element {
    const most = Math.max(1, ...weeks);
    const total = weeks.reduce((sum, count) => sum + count, 0);

    return (
        <span className={styles.spark} role="img" aria-label={`${formatNumber(total)} Einträge in den letzten 13 Wochen`}>
            {weeks.map((count, index) => (
                <i key={index} style={{ height: `${Math.max(6, (count / most) * 100)}%` }} data-empty={count === 0 ? "" : undefined} />
            ))}
        </span>
    );
}

/** Kopf des Profils (N2+): Banner aus Discord, sonst Profilfarbe, sonst der rote Schein von RL Nexus. */
function Hero({ data, onPlan }: { readonly data: IUserdataProfile; readonly onPlan: () => void }): JSX.Element {
    const kind = data.banner ? "banner" : data.accentColor ? "accent" : "plain";
    const look = data.accentColor ? ({ "--accent": data.accentColor } as CSSProperties) : undefined;

    return (
        <header className={styles.hero} data-kind={kind} style={look}>
            {data.banner && <img className={styles.heroBanner} src={data.banner} alt="" />}
            <div className={styles.heroRow}>
                {data.avatar ? (
                    <img className={styles.heroAvatar} src={data.avatar} alt="" />
                ) : (
                    <span className={styles.heroAvatar} aria-hidden="true">
                        {initialOf(data.name)}
                    </span>
                )}
                <div className={styles.heroWho}>
                    <h2 id="nutzer-name">{data.name ?? "Unbekannt"}</h2>
                    {data.username && <p className={styles.heroUser}>@{data.username}</p>}
                    <div className={styles.heroId}>
                        <CopyText value={data.id} />
                    </div>
                </div>
                <div className={styles.heroActions}>
                    <LinkButton href={`/api/userdata/${data.id}/auskunft?format=html`} icon="download" download>
                        Auskunft (HTML)
                    </LinkButton>
                    <LinkButton href={`/api/userdata/${data.id}/auskunft`} icon="download" download>
                        JSON
                    </LinkButton>
                    {!isOpen(data.deletion) && (
                        <Button variant="danger" icon="trash" onClick={onPlan}>
                            Löschen planen
                        </Button>
                    )}
                </div>
            </div>
            <ul className={styles.facts}>
                <li>Auf Discord seit {MONTH.format(new Date(data.discordSince))}</li>
                {data.firstAt && <li>Bei RL Nexus seit {formatDate(data.firstAt)}</li>}
                {data.lastAt && <li>Zuletzt {formatDateTime(data.lastAt)}</li>}
                {data.shop && <li className={styles.factShop}>Shop-Kunde</li>}
                {data.servers.length > 0 && (
                    <li className={styles.factGuilds}>
                        Server
                        {data.servers.slice(0, 6).map((server) =>
                            server.icon ? (
                                <img key={server.id} src={server.icon} alt={server.name ?? server.id} title={server.name ?? server.id} />
                            ) : (
                                <span key={server.id} title={server.name ?? server.id}>
                                    {initialOf(server.name)}
                                </span>
                            )
                        )}
                    </li>
                )}
            </ul>
        </header>
    );
}

/** Profil rechts (N2+): Kopf mit Banner, Löschung, Kennzahlen, vier Reiter. Reiter und Bereich stehen in der Adresse. */
function Profile({ id }: { readonly id: string }): JSX.Element {
    const [params] = useSearchParams();
    const tab = TABS.find((entry) => entry.id === params.get("reiter"))?.id ?? "bereiche";
    const only = USERDATA_AREA_IDS.find((area) => area === params.get("bereich")) ?? null;
    const profile = useApi<IUserdataProfile>(`/api/userdata/${id}${only && tab === "zeitleiste" ? `?bereich=${only}` : ""}`);
    const [planning, setPlanning] = useState(false);
    const data = profile.data;

    useLive("userdata", profile.reload);

    if (profile.error && !data) return <Failure message={profile.error.message} onRetry={profile.reload} />;
    if (!data) return <Loading label="Profil wird geladen" />;

    const total = data.areas.reduce((sum, area) => sum + area.rows, 0);
    const filled = [...data.areas].filter((area) => area.rows > 0).sort((a, b) => b.rows - a.rows);

    return (
        <article className={styles.profileBody} aria-labelledby="nutzer-name">
            <Hero data={data} onPlan={() => setPlanning(true)} />

            {data.deletion && <DeletionBox deletion={data.deletion} onChanged={profile.reload} />}

            {planning && (
                <PlanDialog
                    userId={id}
                    onClose={() => setPlanning(false)}
                    onPlanned={() => {
                        setPlanning(false);
                        profile.reload();
                    }}
                />
            )}

            <dl className={styles.kpis}>
                <div>
                    <dt>Einträge</dt>
                    <dd>{formatNumber(total)}</dd>
                </div>
                <div>
                    <dt>Bereiche</dt>
                    <dd>{filled.length}</dd>
                </div>
                <div>
                    <dt>Server</dt>
                    <dd>{data.servers.length}</dd>
                </div>
                <div>
                    <dt>Aktivität 90 Tage</dt>
                    <dd>
                        <Activity weeks={data.activity} />
                    </dd>
                </div>
                <div className={styles.kpiKeep}>
                    <dt>bleiben bei Löschung</dt>
                    <dd>{formatNumber(data.keptRows)}</dd>
                </div>
            </dl>

            <PageTabs label="Profil" tabs={TABS.map((entry) => ({ to: `/datenschutz/${id}?reiter=${entry.id}`, label: entry.label, active: entry.id === tab }))} />

            {tab === "bereiche" && (
                <div className={styles.areaGrid}>
                    {filled.map((area) => {
                        const share = total > 0 ? Math.round((area.rows / total) * 100) : 0;

                        return (
                            <section key={area.id} className={[styles.areaCard, area.keep ? styles.areaKeep : ""].join(" ")} aria-labelledby={`bereich-${area.id}`}>
                                <div className={styles.cardHead}>
                                    <Icon name={area.keep ? "lock" : (AREAS.get(area.id)?.icon ?? "database")} size={18} />
                                    <h3 id={`bereich-${area.id}`}>{area.label}</h3>
                                    <span className={styles.cardCounts}>{share} %</span>
                                </div>
                                <p className={styles.areaCount}>{formatNumber(area.rows)}</p>
                                <span className={styles.meter} aria-hidden="true">
                                    <i style={{ width: `${Math.max(2, share)}%` }} />
                                </span>
                                <ul className={styles.areaFirst}>
                                    {area.first.map((label, index) => (
                                        <li key={index}>{label}</li>
                                    ))}
                                </ul>
                                {area.keep && <p className={styles.keep}>bleibt: {area.keep}</p>}
                                <Link to={`/datenschutz/${id}?reiter=zeitleiste&bereich=${area.id}`} className={styles.more}>
                                    In der Zeitleiste <Icon name="arrow-right" size={14} />
                                </Link>
                            </section>
                        );
                    })}
                </div>
            )}

            {tab === "zeitleiste" && (
                <>
                    {only && (
                        <p className={styles.filterNote}>
                            Nur {AREAS.get(only)?.label}
                            <Link to={`/datenschutz/${id}?reiter=zeitleiste`}>
                                <Icon name="close" size={14} /> alle zeigen
                            </Link>
                        </p>
                    )}
                    <ol className={styles.timeline}>
                        {data.timeline.map((row, index) => (
                            <li key={index}>
                                <time dateTime={row.at ?? undefined}>{row.at ? formatDateTime(row.at) : "ohne Zeit"}</time>
                                <span>{row.label}</span>
                                <small>
                                    {AREAS.get(row.area)?.label}
                                    {row.guildId && ` · ${row.guildName ?? row.guildId}`}
                                </small>
                            </li>
                        ))}
                    </ol>
                </>
            )}

            {tab === "server" &&
                (data.servers.length === 0 ? (
                    <p className={styles.empty}>Keine Daten, die zu einem Server gehören.</p>
                ) : (
                    <ul className={styles.servers}>
                        {data.servers.map((server) => (
                            <li key={server.id}>
                                <span>{server.name ?? "Unbekannter Server"}</span>
                                <small>{server.id}</small>
                                <b>{formatNumber(server.rows)}</b>
                            </li>
                        ))}
                    </ul>
                ))}

            {tab === "protokoll" &&
                (data.audit.length === 0 ? (
                    <p className={styles.empty}>Zu dieser Person steht noch nichts im Protokoll.</p>
                ) : (
                    <ol className={styles.timeline}>
                        {data.audit.map((entry, index) => (
                            <li key={index}>
                                <time dateTime={entry.at}>{formatDateTime(entry.at)}</time>
                                <span>{AUDIT_LABELS[entry.action] ?? entry.action}</span>
                                <small>
                                    {entry.by}
                                    {entry.detail && ` · ${entry.detail}`}
                                </small>
                            </li>
                        ))}
                    </ol>
                ))}
        </article>
    );
}

/** Eine Zeile der Liste: Bild, Name, Symbole der größten Bereiche, Einträge, Stand. */
function PersonRow({ person, current, now }: { readonly person: IUserdataPerson; readonly current: boolean; readonly now: number }): JSX.Element {
    const top = (Object.entries(person.areas) as [UserdataArea, number][]).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const state = person.deletion?.state;

    return (
        <Link to={`/datenschutz/${person.id}`} className={[styles.row, state === "angehalten" ? styles.rowHalt : ""].join(" ")} aria-current={current ? "page" : undefined}>
            {person.avatar ? (
                <img className={styles.rowAvatar} src={person.avatar} alt="" />
            ) : (
                <span className={styles.rowAvatar} aria-hidden="true">
                    {initialOf(person.name)}
                </span>
            )}
            <span className={styles.rowText}>
                <b>{person.name ?? "Unbekannt"}</b>
                <span className={styles.rowIcons}>
                    {top.map(([area]) => (
                        <Icon key={area} name={AREAS.get(area)?.icon ?? "database"} size={13} />
                    ))}
                    <span className={styles.sr}>Bereiche: {top.map(([area]) => AREAS.get(area)?.label).join(", ")}</span>
                </span>
            </span>
            <span className={styles.rowEnd}>
                <b>{formatNumber(person.rows)}</b>
                {state === "angehalten" ? (
                    <small className={styles.rowHaltText}>angehalten</small>
                ) : state === "geplant" && person.deletion ? (
                    <small className={styles.rowRunText}>läuft {remaining(person.deletion.dueAt, now)}</small>
                ) : (
                    <small>{person.lastAt ? when(person.lastAt, now) : "–"}</small>
                )}
            </span>
        </Link>
    );
}

/**
 * Nutzerdaten (W-0051, Entwurf N2+): oben die Zahlen, links alle Personen mit
 * Daten, rechts das Profil. Schmal steht nur eins von beiden da, das Profil
 * mit Weg zurück.
 */
export function UserdataPage(): JSX.Element {
    useTitle("Nutzerdaten");

    const { id } = useParams();
    const now = useNow(30_000);
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<UserdataFilter>("alle");
    const [sort, setSort] = useState<UserdataSort>("eintraege");
    const [page, setPage] = useState(1);
    const [wanted, setWanted] = useState("");

    // Erst wenn das Tippen kurz ruht: Jede Anfrage rechnet sonst auf dem Server die Liste durch.
    useEffect(() => {
        const timer = setTimeout(() => setWanted(search.trim()), SEARCH_DEBOUNCE_MS);

        return () => clearTimeout(timer);
    }, [search]);

    const list = useApi<IUserdataList>(`/api/userdata?${new URLSearchParams({ seite: String(page), filter, sort, ...(wanted ? { q: wanted } : {}) }).toString()}`);
    const data = list.data;

    useLive("userdata", list.reload);

    const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

    return (
        <>
            <PageHeader title="Nutzerdaten" />

            <div className={styles.metrics}>
                <Metric
                    label="Personen mit Daten"
                    value={
                        data && (
                            <>
                                {formatNumber(data.counts.alle)}
                                <small className={styles.metricSub}>mit mindestens einem Eintrag</small>
                            </>
                        )
                    }
                />
                <Metric
                    label="Einträge"
                    value={
                        data && (
                            <>
                                {formatNumber(data.totals.rows)}
                                <small className={styles.metricSub}>in {USERDATA_AREAS.length} Bereichen</small>
                            </>
                        )
                    }
                />
                <Metric
                    label="Löschung läuft"
                    value={
                        data && (
                            <>
                                <span className={data.totals.halted > 0 ? styles.goldText : undefined}>{formatNumber(data.counts.laeuft)}</span>
                                <small className={styles.metricSub}>{data.totals.halted > 0 ? `${data.totals.halted} angehalten` : "keine angehalten"}</small>
                            </>
                        )
                    }
                />
                <Metric
                    label="Shop-Kunden"
                    value={
                        data && (
                            <>
                                {formatNumber(data.counts.shop)}
                                <small className={styles.metricSub}>mit Kundenkonto</small>
                            </>
                        )
                    }
                />
            </div>

            <div className={styles.layout} data-open={id ? "" : undefined}>
                <section className={styles.list} aria-label="Personen mit Daten">
                    <div className={styles.search} role="search">
                        <Field id="nutzer-suche" label="Suchen">
                            <input
                                id="nutzer-suche"
                                type="search"
                                value={search}
                                placeholder="Name oder ID …"
                                autoComplete="off"
                                onChange={(event) => {
                                    setSearch(event.target.value);
                                    setPage(1);
                                }}
                            />
                        </Field>
                    </div>

                    <div className={styles.chips} role="group" aria-label="Filter">
                        {USERDATA_FILTERS.map((entry) => (
                            <button
                                key={entry}
                                type="button"
                                className={styles.chip}
                                aria-pressed={filter === entry}
                                onClick={() => {
                                    setFilter(entry);
                                    setPage(1);
                                }}
                            >
                                {FILTER_LABELS[entry]}
                                {data && <span className={styles.chipCount}>{formatNumber(data.counts[entry])}</span>}
                            </button>
                        ))}
                    </div>

                    {list.error && !data && <Failure message={list.error.message} onRetry={list.reload} />}
                    {!data && !list.error && <Loading label="Personen werden geladen" />}

                    {data && (
                        <>
                            <div className={styles.listHead}>
                                <p className={styles.count} aria-live="polite">
                                    {formatNumber(data.total)} {data.total === 1 ? "Person" : "Personen"}
                                </p>
                                <label className={styles.sort}>
                                    Sortiert nach
                                    <select
                                        value={sort}
                                        onChange={(event) => {
                                            setSort(event.target.value as UserdataSort);
                                            setPage(1);
                                        }}
                                    >
                                        {USERDATA_SORTS.map((entry) => (
                                            <option key={entry} value={entry}>
                                                {SORT_LABELS[entry]}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            </div>

                            {data.people.length === 0 ? (
                                <p className={styles.empty}>Niemand passt zu Suche und Filter.</p>
                            ) : (
                                <ul className={styles.people}>
                                    {data.people.map((person) => (
                                        <li key={person.id}>
                                            <PersonRow person={person} current={person.id === id} now={now} />
                                        </li>
                                    ))}
                                </ul>
                            )}

                            {pages > 1 && (
                                <nav className={styles.pager} aria-label="Seiten der Liste">
                                    <button type="button" className={styles.chip} disabled={page <= 1} onClick={() => setPage(page - 1)}>
                                        Zurück
                                    </button>
                                    <span>
                                        Seite {page} von {pages}
                                    </span>
                                    <button type="button" className={styles.chip} disabled={page >= pages} onClick={() => setPage(page + 1)}>
                                        Weiter
                                    </button>
                                </nav>
                            )}
                        </>
                    )}
                </section>

                <section className={styles.profile} aria-label="Profil">
                    {id ? (
                        <>
                            <Link to="/datenschutz" className={styles.back}>
                                <Icon name="arrow-left" size={16} /> Zurück zur Liste
                            </Link>
                            <Profile key={id} id={id} />
                        </>
                    ) : (
                        <p className={styles.empty}>Wähle links eine Person, dann steht hier alles, was RL Nexus über sie hat.</p>
                    )}
                </section>
            </div>
        </>
    );
}
