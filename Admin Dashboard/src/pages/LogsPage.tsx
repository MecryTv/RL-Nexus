import { useState, type FormEvent, type JSX } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { ILogSearch, ILogSession, ILogSessionPage } from "../../shared/api";
import { LOG_LEVEL_FILTERS, LOG_LEVEL_LABELS, LOG_SEARCH, LOG_SESSION_FILTERS, type LogSessionFilter } from "../../shared/limits";
import { useApi } from "../api/useApi";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Field } from "../components/Field";
import { LogLine, LogList } from "../components/LogLine";
import { PageHeader } from "../components/PageHeader";
import { Pager } from "../components/Pager";
import { Segmented } from "../components/Segmented";
import { Failure, Loading } from "../components/Status";
import { formatBytes, formatDateTime, formatNumber, formatSessionDuration } from "../format";
import { useTitle } from "../useTitle";
import styles from "./dev.module.scss";

const SESSION_FILTER_LABELS: Readonly<Record<LogSessionFilter, string>> = {
    alle: "Alle",
    fehler: "Mit Fehlern",
    absturz: "Abgestürzt",
    laeuft: "Läuft",
};

const SESSION_FILTER_OPTIONS = LOG_SESSION_FILTERS.map((value) => ({ value, label: SESSION_FILTER_LABELS[value] }));

/** Die Liste bleibt aktuell, solange sie offen ist: Die laufende Session zählt weiter. */
const LIST_INTERVAL = 15_000;

/** Läuft, beendet, abgestürzt: als Wort mit Farbe, nie nur als Farbe. */
export function SessionState({ session }: { readonly session: ILogSession }): JSX.Element {
    if (session.running) return <Badge tone="ok">Läuft</Badge>;
    if (session.crashed) return <Badge tone="danger">Abgestürzt</Badge>;
    if (session.endedAt) return <Badge tone="neutral">{session.exitReason ? `Beendet (${session.exitReason})` : "Beendet"}</Badge>;

    return <Badge tone="warn">Ohne Ende</Badge>;
}

function sizeOf(session: ILogSession): string {
    const size = formatBytes(session.parts.reduce((sum, part) => sum + (part.size ?? 0), 0));
    const deleted = session.parts.filter((part) => part.size === null).length;

    if (session.parts.length === 0) return "keine Datei";
    if (session.parts.length === 1) return deleted ? "gelöscht" : size;

    return `${size}, ${session.parts.length} Teile${deleted ? `, ${deleted} gelöscht` : ""}`;
}

/** Eine Zahl in der Tabelle. Über null mit Farbe und als Link in die gefilterte Ansicht. */
function Count({ value, to, tone }: { readonly value: number | undefined; readonly to: string; readonly tone: string }): JSX.Element {
    if (value === undefined) return <span className={styles.faint}>–</span>;
    if (value === 0) return <span className={styles.faint}>0</span>;

    return (
        <Link to={to} className={tone}>
            {formatNumber(value)}
        </Link>
    );
}

function SessionTable({ sessions }: { readonly sessions: readonly ILogSession[] }): JSX.Element {
    return (
        <div className={styles.frame}>
            <table className={styles.table}>
                <thead>
                    <tr>
                        <th scope="col">Session</th>
                        <th scope="col">Start</th>
                        <th scope="col">Dauer</th>
                        <th scope="col">Ende</th>
                        <th scope="col" className={styles.number}>
                            Fehler
                        </th>
                        <th scope="col" className={styles.number}>
                            Warnungen
                        </th>
                        <th scope="col" className={styles.number}>
                            Einträge
                        </th>
                        <th scope="col">Größe</th>
                    </tr>
                </thead>
                <tbody>
                    {sessions.map((session) => (
                        <tr key={session.number}>
                            <td>
                                <Link to={`/dev/logs/${session.number}`} className={styles.link}>
                                    #{session.number}
                                </Link>
                            </td>
                            <td className={styles.nowrap}>{formatDateTime(session.startedAt)}</td>
                            <td className={styles.nowrap}>{formatSessionDuration(session)}</td>
                            <td>
                                <SessionState session={session} />
                            </td>
                            <td className={styles.number}>
                                <Count value={session.counts?.errors} to={`/dev/logs/${session.number}?stufe=error`} tone={styles.bad} />
                            </td>
                            <td className={styles.number}>
                                <Count value={session.counts?.warnings} to={`/dev/logs/${session.number}?stufe=warn`} tone={styles.careful} />
                            </td>
                            <td className={[styles.number, styles.nowrap].join(" ")}>{session.counts ? formatNumber(session.counts.entries) : "–"}</td>
                            <td className={styles.nowrap}>{sizeOf(session)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

/** Die Treffer der Suche, nach Session gruppiert. Ein Klick auf die Zeilennummer öffnet die Stelle. */
function SearchResults({ path, needle, onClear }: { readonly path: string; readonly needle: string; readonly onClear: () => void }): JSX.Element {
    const { data, error, reload } = useApi<ILogSearch>(path);

    if (error && !data) return <Failure message={error.message} onRetry={reload} />;
    if (!data) return <Loading label="Alle Sessions werden durchsucht" />;

    const what = [data.query && `„${data.query}“`, data.level !== "alle" && LOG_LEVEL_LABELS[data.level].toLowerCase()].filter(Boolean).join(", ");

    return (
        <section className={styles.results} aria-labelledby="log-treffer">
            <div className={styles.resultsHead}>
                <h2 id="log-treffer" className={styles.heading}>
                    {data.total === 0
                        ? `Kein Treffer für ${what}`
                        : `${data.limited ? "Die ersten " : ""}${formatNumber(data.total)} Treffer für ${what} in ${data.sessions.length} ${data.sessions.length === 1 ? "Session" : "Sessions"}`}
                </h2>
                <button type="button" className={styles.textButton} onClick={onClear}>
                    Zurück zur Liste
                </button>
            </div>

            <p className={styles.hint}>
                {data.total === 0
                    ? `${formatNumber(data.scanned)} Sessions durchsucht. Groß und klein ist egal; ein kürzerer Begriff oder „Alle“ statt nur Fehler findet mehr.`
                    : data.limited
                      ? `Es gibt mehr. Schärfer suchen, etwa mit einem längeren Begriff oder nur nach Fehlern. Die Nummer links öffnet die Stelle im Log.`
                      : `${formatNumber(data.scanned)} Sessions durchsucht, neueste zuerst. Die Nummer links öffnet die Stelle im Log.`}
            </p>

            {data.sessions.map((group) => (
                <section key={group.session.number} className={styles.group} aria-labelledby={`treffer-${group.session.number}`}>
                    <h3 id={`treffer-${group.session.number}`} className={styles.groupHead}>
                        <Link to={`/dev/logs/${group.session.number}`} className={styles.link}>
                            Session #{group.session.number}
                        </Link>
                        <SessionState session={group.session} />
                        <span className={styles.faint}>
                            {formatDateTime(group.session.startedAt)}, {formatNumber(group.hits.length)} Treffer
                        </span>
                    </h3>
                    <LogList label={`Treffer in Session ${group.session.number}`}>
                        {group.hits.map((hit, index) => (
                            <LogLine
                                key={`${hit.part}-${hit.entry.line}`}
                                entry={hit.entry}
                                link={`/dev/logs/${group.session.number}?teil=${hit.part + 1}&zeile=${hit.entry.line}`}
                                showDate={index === 0 || group.hits[index - 1].entry.date !== hit.entry.date}
                                needle={needle}
                                jump
                            />
                        ))}
                    </LogList>
                </section>
            ))}
        </section>
    );
}

export function LogsPage(): JSX.Element {
    useTitle("Logs");

    const [params, setParams] = useSearchParams();
    const page = Math.max(1, Math.floor(Number(params.get("seite"))) || 1);
    const filter = LOG_SESSION_FILTERS.find((value) => value === params.get("filter")) ?? "alle";
    const q = params.get("q") ?? "";
    const level = LOG_LEVEL_FILTERS.find((value) => value === params.get("stufe")) ?? "alle";
    const searching = q !== "" || level !== "alle";

    const listQuery = new URLSearchParams({ page: String(page), ...(filter !== "alle" ? { filter } : {}) });
    const { data, error, reload } = useApi<ILogSessionPage>(`/api/logs/sessions?${listQuery}`, page === 1 && !searching ? LIST_INTERVAL : undefined);
    const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

    const [term, setTerm] = useState(q);
    const [searchLevel, setSearchLevel] = useState(level);
    const [seen, setSeen] = useState(`${level} ${q}`);

    // Zurück im Browser ändert die Suche von außen: Die Felder ziehen nach.
    if (seen !== `${level} ${q}`) {
        setSeen(`${level} ${q}`);
        setTerm(q);
        setSearchLevel(level);
    }

    const tooShort = term.trim().length > 0 && term.trim().length < LOG_SEARCH.min;
    const canSearch = !tooShort && (term.trim() !== "" || searchLevel !== "alle");

    function search(event: FormEvent): void {
        event.preventDefault();
        if (!canSearch) return;

        const next = new URLSearchParams();
        if (term.trim()) next.set("q", term.trim());
        if (searchLevel !== "alle") next.set("stufe", searchLevel);
        setParams(next);
    }

    function clear(): void {
        setTerm("");
        setSearchLevel("alle");
        setParams({});
    }

    const searchQuery = new URLSearchParams({ ...(q ? { q } : {}), ...(level !== "alle" ? { stufe: level } : {}) });

    return (
        <>
            <PageHeader
                title="Logs"
                meta={data ? `${formatNumber(data.all)} Sessions des Bots, neueste zuerst. Logdateien verschwinden 30 Tage nach dem letzten Eintrag.` : undefined}
            />

            <form className={styles.searchForm} onSubmit={search} role="search">
                <div className={styles.filterField}>
                    <Field id="log-suche" label="In allen Sessions suchen" error={tooShort ? `Mindestens ${LOG_SEARCH.min} Zeichen.` : undefined}>
                        <input
                            id="log-suche"
                            type="search"
                            value={term}
                            maxLength={LOG_SEARCH.max}
                            placeholder="Text, Kategorie, Fehler-ID …"
                            aria-invalid={tooShort || undefined}
                            aria-describedby={tooShort ? "log-suche-error" : undefined}
                            onChange={(event) => setTerm(event.target.value)}
                        />
                    </Field>
                </div>
                <Field id="log-suche-stufe" label="Stufe">
                    <select id="log-suche-stufe" value={searchLevel} onChange={(event) => setSearchLevel(LOG_LEVEL_FILTERS.find((value) => value === event.target.value) ?? "alle")}>
                        {LOG_LEVEL_FILTERS.map((value) => (
                            <option key={value} value={value}>
                                {LOG_LEVEL_LABELS[value]}
                            </option>
                        ))}
                    </select>
                </Field>
                <Button type="submit" icon="search" disabled={!canSearch}>
                    Suchen
                </Button>
            </form>

            {searching ? (
                <SearchResults path={`/api/logs/search?${searchQuery}`} needle={q.toLowerCase()} onClear={clear} />
            ) : (
                <>
                    <div className={styles.listFilter}>
                        <Segmented name="log-sessions" legend="Zeigen" options={SESSION_FILTER_OPTIONS} value={filter} onChange={(value) => setParams(value === "alle" ? {} : { filter: value })} />
                        {data && filter !== "alle" && (
                            <span className={styles.faint}>
                                {formatNumber(data.total)} von {formatNumber(data.all)}
                            </span>
                        )}
                    </div>

                    {error && !data ? (
                        <Failure message={error.message} onRetry={reload} />
                    ) : !data ? (
                        <Loading label={filter === "fehler" ? "Sessions werden gezählt, beim ersten Mal dauert das" : "Sessions werden geladen"} />
                    ) : data.sessions.length === 0 ? (
                        <p className={styles.empty}>
                            {filter === "alle" ? "Noch keine Session. Der Bot legt sein erstes Log beim Start an." : `Keine Session unter „${SESSION_FILTER_LABELS[filter]}“.`}
                        </p>
                    ) : (
                        <SessionTable sessions={data.sessions} />
                    )}

                    <Pager
                        page={page}
                        pages={pages}
                        onPage={(next) => setParams({ ...(filter !== "alle" ? { filter } : {}), ...(next > 1 ? { seite: String(next) } : {}) })}
                    />
                </>
            )}
        </>
    );
}
