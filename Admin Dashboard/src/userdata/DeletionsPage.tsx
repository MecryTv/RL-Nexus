import { useEffect, useState, type JSX } from "react";
import { Link } from "react-router-dom";
import { SEARCH_DEBOUNCE_MS } from "../../shared/search.ts";
import { DELETION_FILTERS, type DeletionFilter, type IDeletion, type IDeletionCounts } from "../../shared/userdata.ts";
import { useLive } from "../api/live";
import { useApi } from "../api/useApi";
import { Field } from "../components/Field";
import { Metric } from "../components/Metric";
import { PageHeader } from "../components/PageHeader";
import { Failure, Loading } from "../components/Status";
import { formatNumber } from "../format";
import { useNow } from "../useNow";
import { useTitle } from "../useTitle";
import { DeletionActions, Due, StateBadge, Steps } from "./DeletionParts";
import { personName, remaining } from "./plan.ts";
import styles from "./userdata.module.scss";

interface IDeletionList {
    readonly deletions: readonly IDeletion[];
    readonly counts: IDeletionCounts;
}

const FILTER_LABELS: Readonly<Record<DeletionFilter, string>> = { offen: "Offen", erledigt: "Erledigt", abgebrochen: "Abgebrochen", alle: "Alle" };
/** So viele zeigt „Zuletzt erledigt“ unter den offenen. */
const RECENT = 5;

function listPath(filter: DeletionFilter, q: string): string {
    return `/api/userdata/loeschungen?${new URLSearchParams({ filter, ...(q ? { q } : {}) }).toString()}`;
}

/** Eine Zeile, auf dem Handy eine Karte. Angehalten gelb, laufend blau markiert. */
function Row({ deletion, now, onChanged }: { readonly deletion: IDeletion; readonly now: number; readonly onChanged: () => void }): JSX.Element {
    const name = personName(deletion);
    const mark = deletion.state === "angehalten" ? styles.halt : deletion.state === "geplant" ? styles.run : undefined;

    return (
        <tr className={mark}>
            <td className={styles.cellWho}>
                <div className={styles.person}>
                    <span className={styles.initial} aria-hidden="true">
                        {name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className={styles.rowText}>
                        {deletion.state === "geloescht" ? <b>{name}</b> : <Link to={`/datenschutz/${deletion.userId}`}>{name}</Link>}
                        <small>{deletion.userId}</small>
                    </span>
                </div>
            </td>
            <td className={styles.cellState}>
                <StateBadge state={deletion.state} />
                <Steps deletion={deletion} />
            </td>
            <td className={styles.cellDue}>
                <Due deletion={deletion} now={now} />
            </td>
            <td className={styles.cellBy}>
                {deletion.plannedName} · {deletion.reason}
            </td>
            <td className={styles.cellActions}>
                <DeletionActions deletion={deletion} onChanged={onChanged} />
            </td>
        </tr>
    );
}

function Table({ deletions, now, onChanged }: { readonly deletions: readonly IDeletion[]; readonly now: number; readonly onChanged: () => void }): JSX.Element {
    return (
        <table className={styles.deletions}>
            <thead>
                <tr>
                    <th scope="col" className={styles.colWho}>
                        Person
                    </th>
                    <th scope="col" className={styles.colState}>
                        Stand
                    </th>
                    <th scope="col" className={styles.colDue}>
                        Endgültig
                    </th>
                    <th scope="col" className={styles.cellBy}>
                        Geplant von · Grund
                    </th>
                    <th scope="col" className={styles.colActions}>
                        <span className="u-sr">Aktionen</span>
                    </th>
                </tr>
            </thead>
            <tbody>
                {deletions.map((deletion) => (
                    <Row key={deletion.id} deletion={deletion} now={now} onChanged={onChanged} />
                ))}
            </tbody>
        </table>
    );
}

/** Unter den offenen: die letzten erledigten und abgebrochenen, gekürzt. */
function RecentDone({ q, now, onAll }: { readonly q: string; readonly now: number; readonly onAll: () => void }): JSX.Element | null {
    const list = useApi<IDeletionList>(listPath("alle", q));

    useLive("userdata", list.reload);

    const done = (list.data?.deletions ?? []).filter((deletion) => deletion.state === "geloescht" || deletion.state === "abgebrochen");
    if (done.length === 0) return null;

    return (
        <section aria-labelledby="loeschungen-erledigt">
            <div className={styles.sect}>
                <h2 id="loeschungen-erledigt">Zuletzt erledigt</h2>
                {done.length > RECENT && (
                    <button type="button" className={styles.linkish} onClick={onAll}>
                        alle {formatNumber(done.length)} zeigen
                    </button>
                )}
            </div>
            <Table deletions={done.slice(0, RECENT)} now={now} onChanged={list.reload} />
        </section>
    );
}

/** Löschungen (W-0051, Entwurf LA+): oben die Zahlen, Offenes für sich, Erledigtes darunter gekürzt. */
export function DeletionsPage(): JSX.Element {
    useTitle("Löschungen");

    const now = useNow(1000);
    const [filter, setFilter] = useState<DeletionFilter>("offen");
    const [search, setSearch] = useState("");
    const [wanted, setWanted] = useState("");

    useEffect(() => {
        const timer = setTimeout(() => setWanted(search.trim()), SEARCH_DEBOUNCE_MS);

        return () => clearTimeout(timer);
    }, [search]);

    const list = useApi<IDeletionList>(listPath(filter, wanted));

    useLive("userdata", list.reload);

    const data = list.data;
    const counts = data?.counts;

    return (
        <>
            <PageHeader title="Löschungen" />

            <div className={styles.metrics}>
                <Metric
                    label="Läuft"
                    value={
                        counts && (
                            <>
                                {formatNumber(counts.running)}
                                <small className={styles.metricSub}>{counts.nextDueAt ? `nächste in ${remaining(counts.nextDueAt, now)}` : "keine geplant"}</small>
                            </>
                        )
                    }
                />
                <Metric
                    label="Angehalten"
                    value={
                        counts && (
                            <>
                                <span className={counts.halted > 0 ? styles.goldText : undefined}>{formatNumber(counts.halted)}</span>
                                <small className={styles.metricSub}>{counts.halted > 0 ? "wartet auf das Team" : "nichts angehalten"}</small>
                            </>
                        )
                    }
                />
                <Metric
                    label="Gelöscht"
                    value={
                        counts && (
                            <>
                                {formatNumber(counts.deleted)}
                                <small className={styles.metricSub}>in den letzten 30 Tagen</small>
                            </>
                        )
                    }
                />
                <Metric
                    label="Abgebrochen"
                    value={
                        counts && (
                            <>
                                {formatNumber(counts.cancelled)}
                                <small className={styles.metricSub}>in den letzten 30 Tagen</small>
                            </>
                        )
                    }
                />
            </div>

            <div className={styles.toolbar}>
                <div className={styles.chips} role="group" aria-label="Filter">
                    {DELETION_FILTERS.map((entry) => (
                        <button key={entry} type="button" className={styles.chip} aria-pressed={filter === entry} onClick={() => setFilter(entry)}>
                            {FILTER_LABELS[entry]}
                            {entry === "offen" && counts && <span className={styles.chipCount}>{formatNumber(counts.running + counts.halted)}</span>}
                        </button>
                    ))}
                </div>
                <div className={styles.toolbarSearch} role="search">
                    <Field id="loeschung-suche" label="Suchen">
                        <input id="loeschung-suche" type="search" value={search} placeholder="Name oder ID …" autoComplete="off" onChange={(event) => setSearch(event.target.value)} />
                    </Field>
                </div>
            </div>

            {list.error && !data && <Failure message={list.error.message} onRetry={list.reload} />}
            {!data && !list.error && <Loading label="Löschungen werden geladen" />}

            {data && (
                <section aria-labelledby="loeschungen-liste">
                    <div className={styles.sect}>
                        <h2 id="loeschungen-liste">{FILTER_LABELS[filter]}</h2>
                    </div>
                    {data.deletions.length === 0 ? (
                        <p className={styles.empty}>{wanted ? "Keine Löschung passt zur Suche." : filter === "offen" ? "Gerade läuft keine Löschung." : "Hier steht noch nichts."}</p>
                    ) : (
                        <Table deletions={data.deletions} now={now} onChanged={list.reload} />
                    )}
                </section>
            )}

            {filter === "offen" && <RecentDone q={wanted} now={now} onAll={() => setFilter("alle")} />}
        </>
    );
}
