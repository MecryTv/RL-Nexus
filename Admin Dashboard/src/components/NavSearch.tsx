import { useEffect, useId, useRef, useState, type JSX } from "react";
import { useNavigate } from "react-router-dom";
import { searchNav, type INavEntry } from "../nav/search.ts";
import { Icon } from "./Icon";
import { Panel } from "./Panel";
import styles from "./NavSearch.module.scss";

/**
 * Das Suchfenster der Leiste (W-0053). Steht nur im DOM, solange es offen
 * ist. Das native <dialog> bringt Fokusfalle und Escape mit; beim Schließen
 * kommt der Fokus dorthin zurück, wo er vorher war.
 */
export function NavSearch({ entries, initial, onClose }: { readonly entries: readonly INavEntry[]; readonly initial: readonly INavEntry[]; readonly onClose: () => void }): JSX.Element {
    const ref = useRef<HTMLDialogElement>(null);
    const navigate = useNavigate();
    const id = useId();
    const [query, setQuery] = useState("");
    const [active, setActive] = useState(0);
    const hits = query.trim() ? searchNav(entries, query) : initial;

    useEffect(() => {
        const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;

        ref.current?.showModal();

        return () => before?.focus();
    }, []);

    function open(entry: INavEntry | undefined): void {
        if (!entry) return;

        onClose();
        navigate(entry.href);
    }

    return (
        <dialog
            ref={ref}
            className={styles.dialog}
            aria-label="Seite suchen"
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
                        aria-activedescendant={hits[active] ? `${id}-${active}` : undefined}
                        aria-autocomplete="list"
                        placeholder="Seite suchen …"
                        autoComplete="off"
                        spellCheck={false}
                        value={query}
                        onChange={(event) => {
                            setQuery(event.target.value);
                            setActive(0);
                        }}
                        onKeyDown={(event) => {
                            if (event.key === "ArrowDown") setActive((index) => Math.min(index + 1, hits.length - 1));
                            else if (event.key === "ArrowUp") setActive((index) => Math.max(index - 1, 0));
                            else if (event.key === "Enter") open(hits[active]);
                            else return;

                            event.preventDefault();
                        }}
                    />
                </div>

                <ul id={`${id}-liste`} role="listbox" aria-label="Seiten" className={styles.list}>
                    {hits.map((entry, index) => (
                        // Die Tastatur bleibt im Feld (aria-activedescendant); die Maus wählt direkt.
                        <li
                            key={entry.href}
                            id={`${id}-${index}`}
                            role="option"
                            aria-selected={index === active}
                            className={styles.option}
                            onMouseMove={() => setActive(index)}
                            onClick={() => open(entry)}
                        >
                            <Icon name={entry.icon} size={18} />
                            <span className={styles.name}>{entry.name}</span>
                            <span className={styles.area}>{entry.area}</span>
                            <span className={styles.text}>{entry.text}</span>
                        </li>
                    ))}
                </ul>

                {hits.length === 0 && <p className={styles.empty}>Nichts gefunden zu „{query.trim()}“.</p>}

                <p className={styles.keys} aria-hidden="true">
                    <kbd>↑</kbd>
                    <kbd>↓</kbd> wählen · <kbd>Enter</kbd> öffnen · <kbd>Esc</kbd> schließen
                </p>
            </Panel>
        </dialog>
    );
}
