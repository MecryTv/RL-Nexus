import { useEffect, useId, useRef, useState, type JSX } from "react";
import { useNavigate } from "react-router-dom";
import { markOf, parseQuery, SEARCH_LABELS, SEARCH_MIN, type ISearchHit, type SearchKind } from "../../shared/search.ts";
import { countLabel, entryHit, FILTERS, nextFilter, pageHits, shownHits, type INavEntry, type SearchFilter } from "../nav/search.ts";
import { useSearch } from "../nav/useSearch.ts";
import { Icon } from "./Icon";
import { Panel } from "./Panel";
import styles from "./NavSearch.module.scss";

/** Was nach einem Kürzel allein dasteht. */
const HINTS: Partial<Record<SearchKind, string>> = {
    personen: "Name, Discord-ID oder Mail einer Person eingeben.",
    server: "Name oder ID eines Servers eingeben.",
    seiten: "Namen einer Seite eingeben.",
};

/** Der Titel mit markiertem Begriff, wenn er wörtlich drinsteht. */
function Title({ title, text }: { readonly title: string; readonly text: string }): JSX.Element {
    const mark = markOf(title, text);

    return mark ? (
        <>
            {mark.before}
            <mark>{mark.match}</mark>
            {mark.after}
        </>
    ) : (
        <>{title}</>
    );
}

/**
 * Das Suchfenster der Leiste (W-0053, W-0059 Variante SC): oben die Filter
 * mit Zahl, darunter eine Liste. Steht nur im DOM, solange es offen ist. Das
 * native <dialog> bringt Fokusfalle und Escape mit; beim Schließen kommt der
 * Fokus dorthin zurück, wo er vorher war.
 */
export function NavSearch({ entries, initial, onClose }: { readonly entries: readonly INavEntry[]; readonly initial: readonly INavEntry[]; readonly onClose: () => void }): JSX.Element {
    const ref = useRef<HTMLDialogElement>(null);
    const navigate = useNavigate();
    const id = useId();
    const [input, setInput] = useState("");
    const [chosen, setChosen] = useState<SearchFilter>("alles");
    const [active, setActive] = useState(0);
    const { kind: prefixed, text } = parseQuery(input);
    const filter = prefixed ?? chosen;
    // Nur ein Kürzel grenzt schon die Anfrage ein; Tab filtert die fertige Antwort.
    const { result, loading } = useSearch(text, prefixed);
    const pages = pageHits(entries, text);
    const hits: readonly ISearchHit[] = text ? shownHits(pages, result, filter) : prefixed ? [] : initial.map((entry) => entryHit(entry));
    const current = Math.min(active, hits.length - 1);

    useEffect(() => {
        const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;

        ref.current?.showModal();

        return () => before?.focus();
    }, []);

    // Mit den Pfeiltasten bleibt die gewählte Zeile im Blick, auch unter dem Rand der Liste.
    useEffect(() => {
        document.getElementById(`${id}-${current}`)?.scrollIntoView({ block: "nearest" });
    }, [id, current, input, filter]);

    function open(hit: ISearchHit | undefined): void {
        if (!hit) return;

        onClose();
        navigate(hit.href);
    }

    /** Ein anderer Filter löst ein Kürzel ab: Der Begriff bleibt, das Kürzel geht. */
    function choose(next: SearchFilter): void {
        setChosen(next);
        if (prefixed) setInput(text);
        setActive(0);
    }

    const failed = result?.failed ?? [];

    return (
        <dialog
            ref={ref}
            className={styles.dialog}
            aria-label="Suchen"
            onCancel={(event) => {
                event.preventDefault();
                onClose();
            }}
            // Ein Klick neben das Fenster landet auf dem <dialog> selbst.
            onClick={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <Panel className={styles.panel}>
                <div className={styles.field}>
                    <Icon name="search" size={18} />
                    <input
                        className={styles.input}
                        type="text"
                        role="combobox"
                        aria-expanded="true"
                        aria-controls={`${id}-liste`}
                        aria-activedescendant={hits[current] ? `${id}-${current}` : undefined}
                        aria-autocomplete="list"
                        placeholder="Suchen …"
                        autoComplete="off"
                        spellCheck={false}
                        value={input}
                        onChange={(event) => {
                            setInput(event.target.value);
                            setActive(0);
                        }}
                        onKeyDown={(event) => {
                            if (event.key === "ArrowDown") setActive(Math.max(0, Math.min(current + 1, hits.length - 1)));
                            else if (event.key === "ArrowUp") setActive(Math.max(current - 1, 0));
                            else if (event.key === "Enter") open(hits[current]);
                            else if (event.key === "Tab") choose(nextFilter(filter, event.shiftKey ? -1 : 1));
                            else return;

                            event.preventDefault();
                        }}
                    />
                    <span className={styles.prefixes} aria-hidden="true">
                        @ Personen · # Server · / Seiten
                    </span>
                </div>

                <div className={styles.filters} role="group" aria-label="Filter">
                    {FILTERS.map((entry) => {
                        // Mit Kürzel wird nur dort gesucht: Die anderen Filter hätten nichtssagende Zahlen.
                        const count = text && (!prefixed || entry === prefixed) ? countLabel(entry, pages.length, result, loading) : null;

                        return (
                            <button
                                key={entry}
                                type="button"
                                // Tab bleibt im Feld und wechselt dort den Filter; die Maus klickt direkt.
                                tabIndex={-1}
                                className={styles.filter}
                                aria-pressed={entry === filter}
                                data-none={count === "0" || undefined}
                                onClick={() => choose(entry)}
                            >
                                {entry === "alles" ? "Alles" : SEARCH_LABELS[entry]}
                                {count !== null && <small>{count}</small>}
                            </button>
                        );
                    })}
                </div>

                <ul id={`${id}-liste`} role="listbox" aria-label="Treffer" className={styles.list}>
                    {hits.map((hit, index) => (
                        // Die Tastatur bleibt im Feld (aria-activedescendant); die Maus wählt direkt.
                        // Gleiche Titel und Ziele kommen vor (Meldungen, Protokoll); die Zeilen haben keinen eigenen Zustand.
                        <li
                            key={`${index}-${hit.href}`}
                            id={`${id}-${index}`}
                            role="option"
                            aria-selected={index === current}
                            className={styles.option}
                            onMouseMove={() => setActive(index)}
                            onClick={() => open(hit)}
                        >
                            <span className={styles.icon}>
                                <Icon name={hit.icon} size={16} />
                            </span>
                            <span className={styles.name}>
                                <Title title={hit.title} text={text} />
                            </span>
                            <span className={styles.area}>{hit.place}</span>
                            <span className={styles.text}>{hit.context}</span>
                        </li>
                    ))}
                </ul>

                {prefixed && !text && <p className={styles.empty}>{HINTS[prefixed]}</p>}
                {text && !loading && hits.length === 0 && (
                    <p className={styles.empty}>{text.length < SEARCH_MIN && filter !== "seiten" ? `Ab ${SEARCH_MIN} Zeichen wird auch hier gesucht.` : `Nichts gefunden zu „${text}“.`}</p>
                )}
                {failed.length > 0 && <p className={styles.failed}>{failed.map((kind) => SEARCH_LABELS[kind]).join(", ")} gerade nicht erreichbar.</p>}

                <p className={styles.sr} aria-live="polite">
                    {text && !loading ? `${filter === "alles" ? "Alles" : SEARCH_LABELS[filter]}: ${hits.length} Treffer` : ""}
                </p>

                <p className={styles.keys} aria-hidden="true">
                    <kbd>Tab</kbd> Filter wechseln · <kbd>↑</kbd>
                    <kbd>↓</kbd> wählen · <kbd>Enter</kbd> öffnen · <kbd>Esc</kbd> schließen
                </p>
            </Panel>
        </dialog>
    );
}
