import { useEffect, useState, type JSX } from "react";
import { Link } from "react-router-dom";
import type { IMailSummary } from "../../shared/api";
import type { MailListFilter } from "../../shared/limits";
import { displayName, listTime } from "../api/mail";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { Failure, Loading } from "../components/Status";
import type { IApiState } from "../api/useApi";
import styles from "./mail.module.scss";

const MAIL_FILTERS: readonly { readonly value: MailListFilter; readonly label: string }[] = [
    { value: "alle", label: "Alle" },
    { value: "ungelesen", label: "Ungelesen" },
    { value: "anhang", label: "Mit Anhang" },
];

function Pager({ page, pages, onPage }: { readonly page: number; readonly pages: number; readonly onPage: (page: number) => void }): JSX.Element | null {
    if (pages <= 1) return null;

    return (
        <nav className={styles.pager} aria-label="Seiten">
            <Button size="sm" variant="ghost" icon="chevron-left" disabled={page <= 1} onClick={() => onPage(page - 1)}>
                Zurück
            </Button>
            <span>
                Seite {page} von {pages}
            </span>
            <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>
                Weiter <Icon name="chevron-right" size={16} />
            </Button>
        </nav>
    );
}

/**
 * Die Suche schickt erst, wenn eine Pause im Tippen ist. Ändert sich die
 * Suche von außen (Zurück im Browser), setzt der Schlüssel am Aufrufer das
 * Feld neu auf.
 */
function SearchField({ label, value, onSearch }: { readonly label: string; readonly value: string; readonly onSearch: (value: string) => void }): JSX.Element {
    const [draft, setDraft] = useState(value);

    useEffect(() => {
        if (draft === value) return;

        const timer = window.setTimeout(() => onSearch(draft.trim()), 350);

        return () => window.clearTimeout(timer);
    }, [draft, value, onSearch]);

    return (
        <div className={styles.search}>
            <Icon name="search" size={16} />
            <input type="search" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={label} aria-label={label} maxLength={100} />
        </div>
    );
}

/** Eine Zeile der Liste. In „Alle Posteingänge“ steht dabei, aus welchem Postfach sie stammt. */
export interface IListItem extends IMailSummary {
    readonly account?: number;
}

interface IListData {
    readonly messages: readonly IListItem[];
    readonly total: number;
    readonly pageSize: number;
}

/** Mails eines Ordners oder aller Posteingänge: neueste zuerst, Ungelesenes mit blauem Rand. */
export function MessageList({
    title,
    state,
    filter,
    query,
    page,
    notice,
    linkOf,
    isSelected,
    boxOf,
    onChange,
}: {
    readonly title: string;
    readonly state: IApiState<IListData>;
    readonly filter: MailListFilter;
    readonly query: string;
    readonly page: number;
    /** Ein Satz über der Liste, etwa welches Postfach gerade fehlt. */
    readonly notice?: string;
    /** Die Adresse einer Mail, ohne Suche und Filter: Die hängt die Liste an. */
    readonly linkOf: (entry: IListItem) => string;
    readonly isSelected: (entry: IListItem) => boolean;
    /** Name und Farbe des Postfachs für den Punkt vor dem Absender. */
    readonly boxOf?: (entry: IListItem) => { readonly label: string; readonly color: string } | null;
    readonly onChange: (next: { readonly filter?: MailListFilter; readonly query?: string; readonly page?: number }) => void;
}): JSX.Element {
    const { data, error, reload } = state;
    const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
    const search = new URLSearchParams({ ...(filter === "alle" ? {} : { filter }), ...(query ? { q: query } : {}), ...(page > 1 ? { seite: String(page) } : {}) }).toString();

    return (
        <>
            <div className={styles.listHead}>
                <div className={styles.listTitle}>
                    <h2>{title}</h2>
                    {data && <span>{data.total === 1 ? "1 Mail" : `${data.total} Mails`}</span>}
                </div>
                <SearchField key={query} label={`In ${title} suchen`} value={query} onSearch={(value) => onChange({ query: value, page: 1 })} />
                <div className={styles.filters} role="group" aria-label="Anzeigen">
                    {MAIL_FILTERS.map((entry) => (
                        <button key={entry.value} type="button" className={styles.filter} aria-pressed={filter === entry.value} onClick={() => onChange({ filter: entry.value, page: 1 })}>
                            {entry.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className={styles.scroll}>
                {notice && <p className={styles.listNotice}>{notice}</p>}
                {error && !data ? (
                    <Failure message={error.message} onRetry={reload} />
                ) : !data ? (
                    <Loading label="Mails werden geladen" />
                ) : data.messages.length === 0 ? (
                    <p className={styles.listNote}>{query ? `Nichts gefunden zu „${query}“.` : filter === "ungelesen" ? "Alles gelesen." : "Hier liegt keine Mail."}</p>
                ) : (
                    <ul className={styles.rows}>
                        {data.messages.map((entry) => {
                            const on = isSelected(entry);
                            const box = boxOf?.(entry) ?? null;

                            return (
                                <li key={`${entry.account ?? 0}-${entry.uid}`}>
                                    <Link
                                        to={`${linkOf(entry)}${search ? `?${search}` : ""}`}
                                        className={[styles.row, !entry.seen && styles.rowUnread, on && styles.rowOn].filter(Boolean).join(" ")}
                                        aria-current={on ? "page" : undefined}
                                    >
                                        <span className={styles.rowTop}>
                                            <span className={styles.rowFrom}>
                                                {box && <span className={styles.rowDot} style={{ background: box.color }} title={box.label} aria-hidden="true" />}
                                                {!entry.seen && <span className="u-sr">Ungelesen: </span>}
                                                {displayName(entry.from)}
                                            </span>
                                            <time className={styles.rowTime} dateTime={entry.date}>
                                                {listTime(entry.date)}
                                            </time>
                                        </span>
                                        <span className={styles.rowSubject}>
                                            {entry.answered && (
                                                <>
                                                    <Icon name="reply" size={14} />
                                                    <span className="u-sr">Beantwortet: </span>
                                                </>
                                            )}
                                            <span>{entry.subject}</span>
                                            {entry.attachments && (
                                                <>
                                                    <Icon name="paperclip" size={14} />
                                                    <span className="u-sr">, mit Anhang</span>
                                                </>
                                            )}
                                        </span>
                                        {(box || entry.preview) && (
                                            <span className={styles.rowPreview}>
                                                {box && <span className={styles.rowBox}>{box.label}</span>}
                                                {box && entry.preview ? " · " : ""}
                                                {entry.preview}
                                            </span>
                                        )}
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            <Pager page={page} pages={pages} onPage={(next) => onChange({ page: next })} />
        </>
    );
}
