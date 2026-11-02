import { useEffect, useState, type JSX } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { AUDIT_LABELS } from "../../shared/limits.ts";
import { SEARCH_DEBOUNCE_MS } from "../../shared/search.ts";
import { USERDATA_AREAS, USERDATA_FILTERS, type IUserdataList, type IUserdataProfile, type UserdataFilter } from "../../shared/userdata.ts";
import { useApi } from "../api/useApi";
import { LinkButton } from "../components/Button";
import { Field } from "../components/Field";
import { Icon } from "../components/Icon";
import { PageHeader } from "../components/PageHeader";
import { PageTabs } from "../components/PageTabs";
import { Failure, Loading } from "../components/Status";
import { formatDate, formatDateTime, formatNumber } from "../format";
import { useTitle } from "../useTitle";
import styles from "./userdata.module.scss";

const FILTER_LABELS: Readonly<Record<UserdataFilter, string>> = { alle: "Alle", laeuft: "Löschung läuft", shop: "Shop-Kunden" };
const TABS = [
    { id: "bereiche", label: "Bereiche" },
    { id: "zeitleiste", label: "Zeitleiste" },
    { id: "server", label: "Server" },
    { id: "protokoll", label: "Protokoll" },
] as const;
const AREA_LABELS = new Map(USERDATA_AREAS.map((area) => [area.id, area.label]));

function initialOf(name: string | null): string {
    return (name ?? "?").slice(0, 1).toUpperCase();
}

/** Profil rechts (C4): Kopf, Auskunft, vier Reiter. Der Reiter steht in der Adresse. */
function Profile({ id }: { readonly id: string }): JSX.Element {
    const profile = useApi<IUserdataProfile>(`/api/userdata/${id}`);
    const [params] = useSearchParams();
    const tab = TABS.find((entry) => entry.id === params.get("reiter"))?.id ?? "bereiche";
    const data = profile.data;

    if (profile.error && !data) return <Failure message={profile.error.message} onRetry={profile.reload} />;
    if (!data) return <Loading label="Profil wird geladen" />;

    return (
        <article className={styles.profileBody} aria-labelledby="nutzer-name">
            <header className={styles.head}>
                {data.avatar ? (
                    <img className={styles.avatar} src={data.avatar} alt="" />
                ) : (
                    <span className={styles.avatar} aria-hidden="true">
                        {initialOf(data.name)}
                    </span>
                )}
                <div className={styles.who}>
                    <h2 id="nutzer-name">{data.name ?? "Unbekannt"}</h2>
                    <p className={styles.id}>{data.id}</p>
                    <p className={styles.meta}>
                        Daten auf {data.servers.length} {data.servers.length === 1 ? "Server" : "Servern"}
                        {data.firstAt && ` · zuerst ${formatDate(data.firstAt)}`}
                        {data.lastAt && ` · zuletzt ${formatDateTime(data.lastAt)}`}
                    </p>
                </div>
                <LinkButton href={`/api/userdata/${id}/auskunft`} icon="download" download>
                    Auskunft (JSON)
                </LinkButton>
            </header>

            <PageTabs label="Profil" tabs={TABS.map((entry) => ({ to: `/datenschutz/${id}?reiter=${entry.id}`, label: entry.label, active: entry.id === tab }))} />

            {tab === "bereiche" && (
                <div className={styles.tiles}>
                    {data.areas
                        .filter((area) => area.rows > 0)
                        .map((area) => (
                            <section key={area.id} className={styles.tile} aria-labelledby={`bereich-${area.id}`}>
                                <h3 id={`bereich-${area.id}`}>
                                    {area.label}
                                    {area.keep && <Icon name="lock" size={14} />}
                                </h3>
                                <p className={styles.number}>
                                    {formatNumber(area.rows)} {area.rows === 1 ? "Eintrag" : "Einträge"}
                                </p>
                                <ul>
                                    {area.first.map((label, index) => (
                                        <li key={index}>{label}</li>
                                    ))}
                                </ul>
                                {area.keep && <p className={styles.keep}>bleibt: {area.keep}</p>}
                            </section>
                        ))}
                </div>
            )}

            {tab === "zeitleiste" && (
                <ol className={styles.timeline}>
                    {data.timeline.map((row, index) => (
                        <li key={index}>
                            <time dateTime={row.at ?? undefined}>{row.at ? formatDateTime(row.at) : "ohne Zeit"}</time>
                            <span>{row.label}</span>
                            <small>
                                {AREA_LABELS.get(row.area)}
                                {row.guildId && ` · ${row.guildName ?? row.guildId}`}
                            </small>
                        </li>
                    ))}
                </ol>
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

/**
 * Nutzerdaten (W-0051, Entwurf C4): links alle Personen mit Daten, rechts das
 * Profil. Schmal steht nur eins von beiden da, das Profil mit Weg zurück.
 */
export function UserdataPage(): JSX.Element {
    useTitle("Nutzerdaten");

    const { id } = useParams();
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<UserdataFilter>("alle");
    const [page, setPage] = useState(1);
    const [wanted, setWanted] = useState("");

    // Erst wenn das Tippen kurz ruht: Jede Anfrage rechnet sonst auf dem Server die Liste durch.
    useEffect(() => {
        const timer = setTimeout(() => setWanted(search.trim()), SEARCH_DEBOUNCE_MS);

        return () => clearTimeout(timer);
    }, [search]);

    const list = useApi<IUserdataList>(`/api/userdata?${new URLSearchParams({ seite: String(page), filter, ...(wanted ? { q: wanted } : {}) }).toString()}`);
    const data = list.data;
    const most = Math.max(1, ...(data?.people ?? []).map((person) => person.rows));
    const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

    return (
        <>
            <PageHeader title="Nutzerdaten" />

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
                            <p className={styles.count} aria-live="polite">
                                {formatNumber(data.total)} {data.total === 1 ? "Person" : "Personen"} mit Daten
                            </p>

                            {data.people.length === 0 ? (
                                <p className={styles.empty}>Niemand passt zu Suche und Filter.</p>
                            ) : (
                                <ul className={styles.people}>
                                    {data.people.map((person) => (
                                        <li key={person.id}>
                                            <Link to={`/datenschutz/${person.id}`} className={styles.row} aria-current={person.id === id ? "page" : undefined}>
                                                <span className={styles.initial} aria-hidden="true">
                                                    {initialOf(person.name)}
                                                </span>
                                                <span className={styles.rowText}>
                                                    <b>{person.name ?? "Unbekannt"}</b>
                                                    <small>{person.id}</small>
                                                </span>
                                                <span className={styles.amount} title={`${formatNumber(person.rows)} Einträge`} aria-hidden="true">
                                                    <span className={styles.bar} style={{ width: `${Math.max(4, (person.rows / most) * 100)}%` }} />
                                                </span>
                                                <span className={styles.sr}>{formatNumber(person.rows)} Einträge</span>
                                            </Link>
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
