import { useCallback, useEffect, useRef, useState, type CSSProperties, type JSX, type RefObject } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { ILogEntry, ILogFeed, ILogView } from "../../shared/api";
import { LOG_LEVEL_FILTERS, LOG_LEVEL_LABELS, LOG_SEARCH } from "../../shared/limits";
import { api } from "../api/client";
import { useApi } from "../api/useApi";
import { Button, LinkButton } from "../components/Button";
import { Field } from "../components/Field";
import { Icon } from "../components/Icon";
import { LogLine, LogList } from "../components/LogLine";
import { toneOf } from "../components/logTone";
import { PageHeader } from "../components/PageHeader";
import { Pager } from "../components/Pager";
import { Segmented } from "../components/Segmented";
import { Failure, Loading } from "../components/Status";
import { formatBytes, formatDateTime, formatNumber, formatSessionDuration } from "../format";
import { useTitle } from "../useTitle";
import { SessionState } from "./LogsPage";
import styles from "./dev.module.scss";

const LEVEL_OPTIONS = LOG_LEVEL_FILTERS.map((value) => ({ value, label: LOG_LEVEL_LABELS[value] }));

/** So oft fragt das Mitlesen nach, was dazukam. */
const LIVE_INTERVAL = 3000;

/** So nah am Ende der Liste gilt man als „unten“: Dann scrollt das Mitlesen mit. */
const STICK_DISTANCE = 120;

/** Wie lange der Textfilter nach dem letzten Tastendruck wartet. */
const FILTER_DELAY = 300;

interface ITail {
    /** Die Ansicht, an die angehängt wird. Kommt eine neue, fängt das Mitlesen von vorn an. */
    readonly base: ILogView;
    readonly entries: readonly ILogEntry[];
    readonly last: number;
    /** Zählt die Abrufe. Jeder neue Wert stellt den nächsten Abruf an. */
    readonly round: number;
    /** Das Ende der Liste war zu sehen, als Neues kam: Dann scrollt sie mit. */
    readonly stick: boolean;
    readonly failed: boolean;
}

/**
 * Mitlesen: alle paar Sekunden holen, was seit der letzten Zeile dazukam, und
 * anhängen. `onReload` kommt, wenn das nicht mehr reicht: Die Session ist zu
 * Ende, ein neuer Teil hat begonnen oder die Liste ist lang genug geworden.
 */
function useTail(path: string | null, base: ILogView | null, onReload: (feed: ILogFeed) => void, list: RefObject<HTMLOListElement | null>): ITail | null {
    const [tail, setTail] = useState<ITail | null>(null);
    const current = base !== null && tail?.base === base ? tail : null;
    const last = current?.last ?? base?.entries.at(-1)?.line ?? 0;
    const round = current?.round ?? 0;

    useEffect(() => {
        if (path === null || base === null) return;

        const controller = new AbortController();

        // Nichts Neues, aber weiterzählen, damit der nächste Abruf kommt.
        const again = (failed: boolean): void =>
            setTail((previous) => ({
                base,
                entries: previous?.base === base ? previous.entries : base.entries,
                last,
                round: round + 1,
                stick: false,
                failed,
            }));

        const timer = window.setTimeout(() => {
            if (document.visibilityState !== "visible") return again(false);

            api<ILogFeed>(`${path}&nach=${last}`, { signal: controller.signal })
                .then((feed) => {
                    if (feed.partChanged || !feed.running) return onReload(feed);

                    const bottom = list.current?.getBoundingClientRect().bottom;
                    const stick = feed.last > last && bottom !== undefined && bottom <= window.innerHeight + STICK_DISTANCE;

                    setTail((previous) => {
                        const before = previous?.base === base ? previous.entries : base.entries;
                        // Ab dem ersten neuen Eintrag ersetzen: Der letzte alte kann Folgezeilen bekommen haben.
                        const from = feed.entries[0]?.line ?? Number.POSITIVE_INFINITY;

                        return { base, entries: [...before.filter((entry) => entry.line < from), ...feed.entries], last: feed.last, round: round + 1, stick, failed: false };
                    });
                })
                .catch(() => {
                    if (!controller.signal.aborted) again(true);
                });
        }, LIVE_INTERVAL);

        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [path, base, last, round, onReload, list]);

    // Ist die Liste doppelt so lang wie eine Seite, lädt die Ansicht neu und beginnt wieder mit einer Seite.
    useEffect(() => {
        if (current !== null && current.entries.length > current.base.pageSize * 2) onReload({ entries: [], last: current.last, running: true, partChanged: false });
    }, [current, onReload]);

    return current;
}

export function LogViewPage(): JSX.Element {
    const { n = "" } = useParams();
    const [params, setParams] = useSearchParams();

    useTitle(`Session ${n}`);

    // In der Adresse zählen Teile ab 1 wie auf der Seite, die API zählt ab 0.
    const part = params.get("teil");
    const page = params.get("seite");
    const line = params.get("zeile");
    const hiddenList = params.get("aus") ?? "";
    const level = LOG_LEVEL_FILTERS.find((value) => value === params.get("stufe")) ?? "alle";
    const q = params.get("q") ?? "";
    const hidden = new Set(hiddenList.split(",").filter(Boolean));
    const filtered = hidden.size > 0 || level !== "alle" || q !== "";

    // Die Filter gehen so an die API, wie sie in der Adresse stehen.
    const filter = new URLSearchParams({ ...(hiddenList ? { aus: hiddenList } : {}), ...(level !== "alle" ? { stufe: level } : {}), ...(q ? { q } : {}) });
    const query = new URLSearchParams(filter);
    if (part) query.set("part", String(Number(part) - 1));
    if (page) query.set("page", page);
    if (line) query.set("zeile", line);

    const { data, error, reload } = useApi<ILogView>(`/api/logs/sessions/${n}?${query}`);

    const update = useCallback(
        (change: Readonly<Record<string, string | null>>, replace = false): void => {
            setParams(
                (current) => {
                    const next = new URLSearchParams(current);
                    for (const [key, value] of Object.entries(change)) {
                        if (value === null || value === "") next.delete(key);
                        else next.set(key, value);
                    }
                    return next;
                },
                { replace }
            );
        },
        [setParams]
    );

    // --- Textfilter: tippen, kurz warten, dann in die Adresse ---------------

    const [term, setTerm] = useState(q);
    const [seenQ, setSeenQ] = useState(q);
    const filterInput = useRef<HTMLInputElement>(null);

    // Zurück im Browser ändert q von außen: Das Feld zieht nach.
    if (seenQ !== q) {
        setSeenQ(q);
        setTerm(q);
    }

    useEffect(() => {
        const value = term.trim();
        if (value === q || (value !== "" && value.length < LOG_SEARCH.min)) return;

        const timer = window.setTimeout(() => update({ q: value, seite: null }, true), FILTER_DELAY);

        return () => window.clearTimeout(timer);
    }, [term, q, update]);

    function resetFilter(): void {
        setTerm("");
        update({ aus: null, stufe: null, q: null, seite: null });
    }

    function toggle(name: string): void {
        const next = new Set(hidden);
        if (!next.delete(name)) next.add(name);

        update({ aus: [...next].join(","), seite: null });
    }

    // --- Springen zwischen Fehlern ------------------------------------------

    const [cursor, setCursor] = useState<{ readonly filter: string; readonly index: number } | null>(null);
    const errors = data?.marks.filter((mark) => mark.level === "error") ?? [];
    const pageStart = data ? (data.page - 1) * data.pageSize : 0;
    // Wo man gerade steht: am letzten Sprung, sonst an der Zeile aus der Adresse.
    const position = cursor?.filter === filter.toString() ? cursor.index : (data?.target?.index ?? null);

    function neighbour(direction: 1 | -1): { readonly index: number } | undefined {
        if (!data) return undefined;

        const from = position ?? (direction > 0 ? pageStart - 1 : pageStart + data.entries.length);

        return direction > 0 ? errors.find((mark) => mark.index > from) : errors.findLast((mark) => mark.index < from);
    }

    function jump(direction: 1 | -1): void {
        const mark = neighbour(direction);
        if (!mark || !data) return;

        setCursor({ filter: filter.toString(), index: mark.index });

        const target = Math.floor(mark.index / data.pageSize) + 1;
        if (target !== data.page) update({ seite: String(target), zeile: null });
    }

    // Zum Eintrag scrollen und den Fokus dorthin, sobald er auf der Seite steht.
    useEffect(() => {
        if (data === null || position === null) return;

        const entry = data.entries[position - pageStart];
        const row = entry ? document.getElementById(`z${entry.line}`) : null;

        row?.focus({ preventScroll: true });
        row?.scrollIntoView({ block: "center" });
    }, [data, position, pageStart]);

    // Tasten: / zum Filter, n und N zum nächsten und vorigen Fehler. Nicht beim Tippen.
    const jumpRef = useRef(jump);
    useEffect(() => {
        jumpRef.current = jump;
    });

    useEffect(() => {
        const onKey = (event: KeyboardEvent): void => {
            if (event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return;
            if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable='true']")) return;

            if (event.key === "/") {
                event.preventDefault();
                filterInput.current?.focus();
            } else if (event.key === "n" || event.key === "N") {
                event.preventDefault();
                jumpRef.current(event.key === "n" ? 1 : -1);
            }
        };

        window.addEventListener("keydown", onKey);

        return () => window.removeEventListener("keydown", onKey);
    }, []);

    // --- Mitlesen -----------------------------------------------------------

    const [live, setLive] = useState(true);
    const list = useRef<HTMLOListElement>(null);
    const running = data !== null && data.session.running && data.part === data.session.parts.length - 1;
    const atEnd = data !== null && data.page === data.pages;

    const onReload = useCallback(
        (feed: ILogFeed): void => {
            if (feed.partChanged && part !== null) update({ teil: null, seite: null, zeile: null });
            else reload();
        },
        [part, update, reload]
    );

    const tail = useTail(running && atEnd && live ? `/api/logs/sessions/${n}/neu?${filter}${filter.size > 0 ? "&" : ""}part=${data.part}` : null, data, onReload, list);

    useEffect(() => {
        if (tail?.stick) list.current?.lastElementChild?.scrollIntoView({ block: "end" });
    }, [tail]);

    function toEnd(): void {
        setCursor(null);
        setLive(true);
        update({ seite: null, zeile: null });
    }

    // --- Ansicht ------------------------------------------------------------

    const session = data?.session;
    const entries = tail?.entries ?? data?.entries ?? [];
    const partTotal = data?.categories.reduce((sum, category) => sum + category.count, 0) ?? 0;
    const needle = q.toLowerCase();
    const at = position === null ? -1 : errors.findIndex((mark) => mark.index === position);

    const linkTo = (target: number): string => {
        const next = new URLSearchParams(params);
        next.delete("seite");
        next.set("zeile", String(target));
        return `?${next}`;
    };

    const onPage = (next: number): void => {
        setCursor(null);
        update({ seite: String(next), zeile: null });
    };

    return (
        <>
            <PageHeader
                title={`Session #${n}`}
                meta={session ? `Gestartet ${formatDateTime(session.startedAt)}, Dauer ${formatSessionDuration(session)}` : undefined}
            >
                <Link to="/dev/logs" className={styles.back}>
                    <Icon name="arrow-left" size={16} /> Alle Sessions
                </Link>
                {data && (
                    <LinkButton href={`/api/logs/sessions/${n}/download?part=${data.part}`} size="sm" icon="download">
                        Herunterladen
                    </LinkButton>
                )}
            </PageHeader>

            {error && !data ? (
                <Failure message={error.message} onRetry={reload} />
            ) : !data || !session ? (
                <Loading label="Log wird geladen" />
            ) : (
                <>
                    <dl className={styles.facts}>
                        <div>
                            <dt>Status</dt>
                            <dd>
                                <SessionState session={session} />
                            </dd>
                        </div>
                        {data.ended && (
                            <div>
                                <dt>Ende</dt>
                                <dd>
                                    {data.ended.reason}, nach {data.ended.duration}
                                </dd>
                            </div>
                        )}
                        <div>
                            <dt>Im Teil</dt>
                            <dd>
                                {formatNumber(partTotal)} Einträge, <span className={data.errors > 0 ? styles.bad : undefined}>{formatNumber(data.errors)} Fehler</span>,{" "}
                                <span className={data.warnings > 0 ? styles.careful : undefined}>
                                    {formatNumber(data.warnings)} {data.warnings === 1 ? "Warnung" : "Warnungen"}
                                </span>
                            </dd>
                        </div>
                        {data.header?.fields.map((field) => (
                            <div key={field.label}>
                                <dt>{field.label}</dt>
                                <dd>{field.value}</dd>
                            </div>
                        ))}
                    </dl>

                    <div className={styles.toolbar}>
                        {session.parts.length > 1 && (
                            <Field id="log-teil" label="Teil">
                                <select
                                    id="log-teil"
                                    value={data.part}
                                    onChange={(event) => {
                                        setCursor(null);
                                        update({ teil: String(Number(event.target.value) + 1), seite: null, zeile: null });
                                    }}
                                >
                                    {session.parts.map((entry) => (
                                        <option key={entry.index} value={entry.index} disabled={entry.size === null}>
                                            Teil {entry.index + 1} ({entry.size === null ? "gelöscht" : formatBytes(entry.size)})
                                        </option>
                                    ))}
                                </select>
                            </Field>
                        )}

                        <Segmented name="log-stufe" legend="Stufe" options={LEVEL_OPTIONS} value={level} onChange={(value) => update({ stufe: value === "alle" ? null : value, seite: null })} />

                        <div className={styles.filterField}>
                            <Field id="log-filter" label="Text filtern" hint={term.trim().length === 1 ? `Ab ${LOG_SEARCH.min} Zeichen.` : undefined}>
                                <input
                                    ref={filterInput}
                                    id="log-filter"
                                    type="search"
                                    value={term}
                                    maxLength={LOG_SEARCH.max}
                                    placeholder="z. B. pool oder 500 · Taste /"
                                    aria-describedby={term.trim().length === 1 ? "log-filter-hint" : undefined}
                                    aria-keyshortcuts="/"
                                    onChange={(event) => setTerm(event.target.value)}
                                />
                            </Field>
                        </div>
                    </div>

                    {data.categories.length > 0 && (
                        <div className={styles.chips} role="group" aria-label="Kategorien ein- und ausblenden">
                            {data.categories.map((category) => (
                                <button
                                    key={category.name}
                                    type="button"
                                    className={styles.chip}
                                    aria-pressed={!hidden.has(category.name)}
                                    style={{ "--tone": toneOf(category.name) } as CSSProperties}
                                    onClick={() => toggle(category.name)}
                                >
                                    <span className={styles.chipDot} aria-hidden="true" />
                                    {category.name}
                                    <span className={styles.chipCount}>{formatNumber(category.count)}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    <div className={styles.statusBar}>
                        <p className={styles.shown} aria-live="polite">
                            {filtered ? `${formatNumber(data.total)} von ${formatNumber(partTotal)} Einträgen` : `${formatNumber(partTotal)} Einträge`}
                            {filtered && (
                                <button type="button" className={styles.textButton} onClick={resetFilter}>
                                    Filter zurücksetzen
                                </button>
                            )}
                        </p>

                        {errors.length === 0 ? (
                            <span className={styles.shown}>Keine Fehler{filtered ? " im Filter" : ""}</span>
                        ) : (
                            <div className={styles.jumps} role="group" aria-label="Zwischen Fehlern springen">
                                <Button size="sm" variant="ghost" icon="chevron-up" disabled={!neighbour(-1)} onClick={() => jump(-1)} aria-keyshortcuts="Shift+N" title="Taste Umschalt+N">
                                    Voriger
                                </Button>
                                <span className={styles.jumpState}>{at === -1 ? `${formatNumber(errors.length)} Fehler` : `Fehler ${at + 1} von ${formatNumber(errors.length)}`}</span>
                                <Button size="sm" variant="ghost" icon="chevron-down" disabled={!neighbour(1)} onClick={() => jump(1)} aria-keyshortcuts="N" title="Taste N">
                                    Nächster
                                </Button>
                            </div>
                        )}

                        {running &&
                            (atEnd ? (
                                <Button size="sm" variant={live ? "outline" : "ghost"} aria-pressed={live} onClick={() => setLive(!live)}>
                                    <span className={[styles.pulse, live && styles.pulsing].filter(Boolean).join(" ")} aria-hidden="true" />
                                    {live ? (tail?.failed ? "Mitlesen hakt" : "Liest mit") : "Mitlesen pausiert"}
                                </Button>
                            ) : (
                                <Button size="sm" icon="chevron-down" onClick={toEnd}>
                                    Zum Ende und mitlesen
                                </Button>
                            ))}
                    </div>

                    {data.target && data.target.index === null && (
                        <p className={styles.targetHint} role="status">
                            Zeile {data.target.line} ist durch den Filter ausgeblendet.
                            <button type="button" className={styles.textButton} onClick={resetFilter}>
                                Filter zurücksetzen
                            </button>
                        </p>
                    )}

                    <Pager page={data.page} pages={data.pages} onPage={onPage} />

                    {entries.length === 0 ? (
                        <p className={styles.empty}>{filtered ? "Kein Eintrag passt zum Filter." : "In diesem Teil steht noch kein Eintrag."}</p>
                    ) : (
                        <LogList ref={list} label={`Einträge, Seite ${data.page} von ${data.pages}`}>
                            {entries.map((entry, index) => (
                                <LogLine
                                    key={entry.line}
                                    entry={entry}
                                    link={linkTo(entry.line)}
                                    showDate={index === 0 || entries[index - 1].date !== entry.date}
                                    needle={needle}
                                    marked={pageStart + index === position}
                                />
                            ))}
                        </LogList>
                    )}

                    <Pager page={data.page} pages={data.pages} onPage={onPage} />
                </>
            )}
        </>
    );
}
