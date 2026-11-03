import { useEffect, useState, type JSX } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SEARCH_DEBOUNCE_MS } from "../../shared/search.ts";
import { PRESET_LABELS, type ISecurityOverview } from "../../shared/security.ts";
import type { IUserdataList } from "../../shared/userdata.ts";
import { useLive } from "../api/live";
import { useApi } from "../api/useApi";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Field } from "../components/Field";
import { PageHeader } from "../components/PageHeader";
import { Segmented } from "../components/Segmented";
import { Failure, Loading } from "../components/Status";
import { formatNumber } from "../format";
import { day } from "../servers/util.ts";
import { useTitle } from "../useTitle";
import { BanDialog } from "./BanDialog";
import { PersonLine } from "./parts";
import { PRESET_TONE } from "./util.ts";
import kpi from "../servers/servers.module.scss";
import styles from "./security.module.scss";

const SNOWFLAKE = /^\d{17,20}$/;
const STATES = [
    { value: "aktiv", label: "Aktiv" },
    { value: "aufgehoben", label: "Aufgehoben" },
] as const;

/** Treffer zur Suche; eine ID geht auch ohne gespeicherte Daten. */
function Hits({ wanted, onPick }: { readonly wanted: string; readonly onPick: (userId: string) => void }): JSX.Element {
    const list = useApi<IUserdataList>(`/api/userdata?${new URLSearchParams({ seite: "1", filter: "alle", sort: "eintraege", q: wanted }).toString()}`);
    const people = list.data?.people.slice(0, 8) ?? [];
    const direct = SNOWFLAKE.test(wanted) && !people.some((person) => person.id === wanted);

    if (!direct && list.data && people.length === 0) return <p className={styles.dim}>Niemand gefunden. Mit der Discord-ID geht es immer.</p>;

    return (
        <ul className={styles.hits}>
            {direct && (
                <li>
                    <button type="button" onClick={() => onPick(wanted)}>
                        <b>ID {wanted}</b> <small>direkt sperren</small>
                    </button>
                </li>
            )}
            {people.map((person) => (
                <li key={person.id}>
                    <button type="button" onClick={() => onPick(person.id)}>
                        <b>{person.name ?? person.id}</b> <small>{person.id}</small>
                    </button>
                </li>
            ))}
        </ul>
    );
}

/** „Person sperren“: Suche nach Name oder Discord-ID wie bei den Nutzerdaten. */
function PersonSearch({ onPick }: { readonly onPick: (userId: string) => void }): JSX.Element {
    const [search, setSearch] = useState("");
    const [wanted, setWanted] = useState("");

    useEffect(() => {
        const timer = setTimeout(() => setWanted(search.trim()), SEARCH_DEBOUNCE_MS);

        return () => clearTimeout(timer);
    }, [search]);

    return (
        <div className={styles.picker} role="search">
            <Field id="sperre-suche" label="Wen sperren?" hint="Name oder Discord-ID">
                <input id="sperre-suche" type="search" value={search} autoComplete="off" autoFocus placeholder="Name oder ID …" onChange={(event) => setSearch(event.target.value)} />
            </Field>
            {wanted && <Hits wanted={wanted} onPick={onPick} />}
        </div>
    );
}

/** Seite „Sperren“ (A2): Zahlen, „Person sperren“ und die Liste der Sperren. */
export function BansPage(): JSX.Element {
    useTitle("Sperren");

    const navigate = useNavigate();
    const [state, setState] = useState<(typeof STATES)[number]["value"]>("aktiv");
    const [searching, setSearching] = useState(false);
    const [banning, setBanning] = useState<string | null>(null);
    const overview = useApi<ISecurityOverview>(`/api/security${state === "aufgehoben" ? "?stand=aufgehoben" : ""}`);
    const data = overview.data;

    useLive("security", overview.reload);

    return (
        <section>
            <PageHeader title="Sperren">
                <Button variant="danger" icon="ban" onClick={() => setSearching(!searching)} aria-expanded={searching}>
                    Person sperren
                </Button>
            </PageHeader>

            {searching && (
                <PersonSearch
                    onPick={(userId) => {
                        setSearching(false);
                        setBanning(userId);
                    }}
                />
            )}

            {banning && <BanDialog mode={{ kind: "ban", userId: banning }} onClose={() => setBanning(null)} onDone={(banId) => navigate(`/sicherheit/sperre/${banId}`)} />}

            {overview.error && !data && <Failure message={overview.error.message} onRetry={overview.reload} />}
            {!data && !overview.error && <Loading label="Sperren werden geladen" />}

            {data && (
                <>
                    <dl className={kpi.kpis}>
                        <div>
                            <dt>Gesperrt</dt>
                            <dd>{formatNumber(data.active)}</dd>
                            <small>aktive Sperren</small>
                        </div>
                        <div>
                            <dt>Offener Verdacht</dt>
                            <dd className={data.suspects ? kpi.warn : undefined}>{formatNumber(data.suspects)}</dd>
                            <small>
                                <Link to="/sicherheit/verdacht">{data.suspects ? "jetzt ansehen" : "nichts offen"}</Link>
                            </small>
                        </div>
                        <div>
                            <dt>VPN heute</dt>
                            <dd>{formatNumber(data.vpnToday)}</dd>
                            <small>blockiert seit Mitternacht</small>
                        </div>
                    </dl>

                    <div className={styles.toolbar}>
                        <Segmented name="stand" legend="Stand" options={STATES} value={state} onChange={setState} />
                    </div>

                    {data.bans.length === 0 ? (
                        <p className={kpi.empty}>{state === "aktiv" ? "Gerade ist niemand gesperrt." : "Noch keine Sperre aufgehoben."}</p>
                    ) : (
                        <table className={kpi.table}>
                            <thead>
                                <tr>
                                    <th>Person</th>
                                    <th>Umfang</th>
                                    <th>Seit</th>
                                    <th>Von</th>
                                    <th>Treffer</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.bans.map((ban) => (
                                    <tr key={ban.id}>
                                        <td>
                                            <PersonLine person={ban.person} to={`/sicherheit/sperre/${ban.id}`} />
                                        </td>
                                        <td>
                                            <Badge tone={PRESET_TONE[ban.preset]}>{PRESET_LABELS[ban.preset]}</Badge>
                                        </td>
                                        <td>{day(ban.since)}</td>
                                        <td>{ban.by}</td>
                                        <td>{ban.hits ? <Badge tone="warn">{formatNumber(ban.hits)}</Badge> : "–"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </>
            )}
        </section>
    );
}
