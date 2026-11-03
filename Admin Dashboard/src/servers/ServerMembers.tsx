import { useEffect, useState, type JSX } from "react";
import { Link } from "react-router-dom";
import { SEARCH_DEBOUNCE_MS } from "../../shared/search.ts";
import { MEMBERS_PER_PAGE, type IMemberPage, type MemberFilter } from "../../shared/servers.ts";
import { useApi } from "../api/useApi";
import { CopyText } from "../components/CopyText";
import { Pager } from "../components/Pager";
import { Failure, Loading } from "../components/Status";
import { formatNumber } from "../format";
import { day, initials } from "./util.ts";
import styles from "./servers.module.scss";

const FILTERS: readonly { readonly id: MemberFilter; readonly label: string; readonly count: (page: IMemberPage) => number }[] = [
    { id: "alle", label: "Alle", count: (page) => page.total },
    { id: "personen", label: "Personen", count: (page) => page.persons },
    { id: "bots", label: "Bots", count: (page) => page.bots },
    { id: "daten", label: "Mit Daten bei uns", count: (page) => page.withData },
];
const CLOCK = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" });

/** Mitglieder eines Servers, live vom Bot (W-0064, 3d+): Filter, Suche, 50 je Seite, sortiert nach Beitritt. */
export function ServerMembers({ guildId, name }: { readonly guildId: string; readonly name: string }): JSX.Element {
    const [filter, setFilter] = useState<MemberFilter>("alle");
    const [typed, setTyped] = useState("");
    const [query, setQuery] = useState("");
    const [page, setPage] = useState(0);
    const state = useApi<IMemberPage>(`/api/servers/${guildId}/members?${new URLSearchParams({ filter, q: query, seite: String(page) }).toString()}`);
    const data = state.data;

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setQuery(typed);
            setPage(0);
        }, SEARCH_DEBOUNCE_MS);

        return () => window.clearTimeout(timer);
    }, [typed]);

    if (state.error && !data) return <Failure message={state.error.message} onRetry={state.reload} />;
    if (!data) return <Loading label={`Mitglieder von ${name} werden geladen`} />;

    return (
        <div>
            <div className={styles.memberBar}>
                <b>{formatNumber(data.total)} Mitglieder</b>
                <span>{formatNumber(data.persons)} Personen</span>
                <span>{formatNumber(data.bots)} Bots</span>
                <span>{formatNumber(data.team)} vom Team von RL Nexus</span>
                <span className={styles.sub}>Stand {CLOCK.format(new Date(data.at))}</span>
            </div>

            {!data.complete ? (
                <p className={styles.empty}>Die Liste fehlt: Der Bot liest Mitglieder nur mit dem Members-Intent (GUILD_MEMBER_INTENT). Die Zahl stimmt trotzdem.</p>
            ) : (
                <>
                    <div className={styles.memberBar}>
                        <div className={styles.filter} role="group" aria-label="Mitglieder filtern">
                            {FILTERS.map((entry) => (
                                <button
                                    key={entry.id}
                                    type="button"
                                    aria-pressed={filter === entry.id}
                                    onClick={() => {
                                        setFilter(entry.id);
                                        setPage(0);
                                    }}
                                >
                                    {entry.label}
                                    <small>{formatNumber(entry.count(data))}</small>
                                </button>
                            ))}
                        </div>
                        <input type="search" value={typed} onChange={(event) => setTyped(event.target.value)} placeholder="Name oder ID …" aria-label={`Mitglieder von ${name} durchsuchen`} />
                    </div>

                    {data.rows.length === 0 ? (
                        <p className={styles.empty}>Niemand passt dazu.</p>
                    ) : (
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Mitglied</th>
                                    <th>ID</th>
                                    <th>Beigetreten</th>
                                    <th>Rollen</th>
                                    <th aria-label="Profil" />
                                </tr>
                            </thead>
                            <tbody>
                                {data.rows.map((member) => (
                                    <tr key={member.id}>
                                        <td>
                                            <div className={styles.person}>
                                                {member.avatar ? <img src={member.avatar} alt="" /> : <span className={styles.initial}>{initials(member.name)}</span>}
                                                <span>
                                                    <b>{member.name}</b>
                                                    {member.owner && <span className={styles.badge}>OWNER</span>}
                                                    {member.bot && <span className={[styles.badge, styles.badgeBot].join(" ")}>BOT</span>}
                                                    <small>@{member.handle}</small>
                                                </span>
                                            </div>
                                        </td>
                                        <td>
                                            <span className={styles.id}>{member.id}</span> <CopyText value={member.id} />
                                        </td>
                                        <td>{member.joinedAt ? day(member.joinedAt) : "–"}</td>
                                        <td>
                                            {member.roles.length === 0
                                                ? "–"
                                                : member.roles.slice(0, 4).map((role) => (
                                                      <span key={role.name} className={styles.role} style={role.color ? { color: role.color } : undefined}>
                                                          {role.name}
                                                      </span>
                                                  ))}
                                            {member.roles.length > 4 && <span className={styles.sub}>+{member.roles.length - 4}</span>}
                                        </td>
                                        <td>{member.hasData ? <Link to={`/datenschutz/${member.id}`}>Profil →</Link> : <span className={styles.sub}>keine Daten</span>}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    <p className={styles.sub}>
                        {formatNumber(data.page * MEMBERS_PER_PAGE + (data.rows.length ? 1 : 0))}–{formatNumber(data.page * MEMBERS_PER_PAGE + data.rows.length)} von {formatNumber(data.matches)} · sortiert nach Beitritt
                    </p>
                    <Pager page={data.page + 1} pages={Math.max(1, Math.ceil(data.matches / MEMBERS_PER_PAGE))} onPage={(next) => setPage(next - 1)} />
                </>
            )}
        </div>
    );
}
