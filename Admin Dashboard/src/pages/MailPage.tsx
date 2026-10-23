import { useEffect, useState, type JSX } from "react";
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { IMailAllPage, IMailBox, IMailPage } from "../../shared/api";
import { MAIL_LIST_FILTERS, type MailListFilter } from "../../shared/limits";
import { useLive } from "../api/live";
import { allPath, boxColor, mailPath, unreadOf, useMailOverview } from "../api/mail";
import { useApi } from "../api/useApi";
import { Icon } from "../components/Icon";
import { PageHeader } from "../components/PageHeader";
import { Failure, Loading } from "../components/Status";
import { AccountsPanel } from "../mail/AccountsPanel";
import { EMPTY_DRAFT, type MailSelection } from "../mail/draft";
import { Folders } from "../mail/Folders";
import { LazyComposer } from "../mail/LazyComposer";
import { MessageList } from "../mail/MessageList";
import { Reader } from "../mail/Reader";
import styles from "../mail/mail.module.scss";
import { useMe } from "../session/context";
import { useTitle } from "../useTitle";

/** Ab hier stehen alle drei Spalten nebeneinander, dann wird sofort etwas geöffnet. */
const WIDE = "(min-width: 1100px)";

function pageOf(params: URLSearchParams): number {
    return Math.max(1, Math.floor(Number(params.get("seite"))) || 1);
}

function isMailFilter(value: string | null): value is MailListFilter {
    return (MAIL_LIST_FILTERS as readonly (string | null)[]).includes(value);
}

const numberOf = (value: string | undefined): number | null => (value !== undefined && /^\d+$/.test(value) ? Number(value) : null);

/** Filter, Suche und Seite aus der Adresse, und wie eine Änderung zurück in die Adresse kommt. */
function useListParams(): {
    readonly filter: MailListFilter;
    readonly query: string;
    readonly page: number;
    readonly search: string;
    readonly onChange: (next: { readonly filter?: MailListFilter; readonly query?: string; readonly page?: number }) => void;
} {
    const [params, setParams] = useSearchParams();
    const filter: MailListFilter = isMailFilter(params.get("filter")) ? (params.get("filter") as MailListFilter) : "alle";
    const query = params.get("q") ?? "";
    const page = pageOf(params);

    return {
        filter,
        query,
        page,
        search: `page=${page}&filter=${filter}&q=${encodeURIComponent(query)}`,
        onChange: (next) => {
            const values: Record<string, string> = {};
            const nextFilter = next.filter ?? filter;
            const nextQuery = next.query ?? query;
            const nextPage = next.page ?? page;

            if (nextFilter !== "alle") values.filter = nextFilter;
            if (nextQuery) values.q = nextQuery;
            if (nextPage > 1) values.seite = String(nextPage);

            setParams(values);
        },
    };
}

/** Die Liste eines Ordners. Eigene Komponente, damit sie nur lädt, wenn ein Ordner offen ist. */
function FolderPane({ box, folder, uid }: { readonly box: IMailBox; readonly folder: string; readonly uid: number | null }): JSX.Element {
    const list = useListParams();
    const state = useApi<IMailPage>(`/api/mail/${box.id}/messages?folder=${encodeURIComponent(folder)}&${list.search}`);
    const name = box.folders?.find((entry) => entry.path === folder)?.name ?? folder;

    useLive("mail", state.reload);

    return (
        <MessageList
            title={`${name} · ${box.label}`}
            state={state}
            filter={list.filter}
            query={list.query}
            page={list.page}
            linkOf={(entry) => mailPath(box.id, folder, entry.uid)}
            isSelected={(entry) => entry.uid === uid}
            onChange={list.onChange}
        />
    );
}

/** Die Posteingänge aller Postfächer in einer Liste, mit dem Punkt des Postfachs je Zeile. */
function AllPane({ boxes, account, uid }: { readonly boxes: readonly IMailBox[]; readonly account: number | null; readonly uid: number | null }): JSX.Element {
    const list = useListParams();
    const state = useApi<IMailAllPage>(`/api/mail/all?${list.search}`);
    const labelOf = (id: number): string => boxes.find((box) => box.id === id)?.label ?? "Ein Postfach";
    const notice = state.data?.errors.map((entry) => `${labelOf(entry.account)}: ${entry.message}`).join(" ");

    useLive("mail", state.reload);

    return (
        <MessageList
            title="Alle Posteingänge"
            state={state}
            filter={list.filter}
            query={list.query}
            page={list.page}
            notice={notice || undefined}
            linkOf={(entry) => allPath(entry.account, entry.uid)}
            isSelected={(entry) => entry.account === account && entry.uid === uid}
            boxOf={(entry) => {
                const index = boxes.findIndex((box) => box.id === entry.account);

                return index < 0 ? null : { label: boxes[index].label, color: boxColor(index) };
            }}
            onChange={list.onChange}
        />
    );
}

/**
 * Das Postfach: alle Mailcow-Postfächer in einer Ansicht, nach Entwurf A.
 * Was offen ist, steht in der Adresse, damit Zurück im Browser und Links in
 * Hinweis-Mails funktionieren.
 */
export function MailPage(): JSX.Element {
    useTitle("Postfach");

    const me = useMe();
    const developer = me.role === "developer";
    const navigate = useNavigate();
    const location = useLocation();
    const params = useParams();
    const [search] = useSearchParams();
    const overview = useMailOverview();
    // Das Schreibfenster liegt über allem. Solange es offen ist, lässt sich nichts anderes anklicken.
    const [composing, setComposing] = useState(false);
    const [managing, setManaging] = useState(false);

    const isAll = location.pathname.startsWith("/post/alle");
    const accountId = numberOf(params.account);
    const folder = isAll ? "INBOX" : accountId !== null ? (params.folder ?? "INBOX") : null;
    const uid = accountId !== null ? numberOf(params.uid) : null;

    const boxes = overview.data?.boxes ?? [];
    const accounts = boxes;
    const box = boxes.find((entry) => entry.id === accountId) ?? null;
    const listSearch = search.toString() ? `?${search.toString()}` : "";

    const selection: MailSelection = isAll ? { kind: "all" } : accountId !== null && folder !== null ? { kind: "folder", account: accountId, folder } : null;
    const view = uid !== null ? "read" : selection !== null ? "list" : "nav";

    // Auf breiten Bildschirmen gleich alle Posteingänge zeigen statt einer leeren Mitte.
    const nothingOpen = selection === null;

    useEffect(() => {
        if (!nothingOpen || !overview.data || overview.data.boxes.length === 0 || !window.matchMedia(WIDE).matches) return;

        navigate(allPath(), { replace: true });
    }, [nothingOpen, overview.data, navigate]);

    const unread = unreadOf(overview.data);
    const listPath = isAll ? `${allPath()}${listSearch}` : accountId !== null && folder !== null ? `${mailPath(accountId, folder)}${listSearch}` : "/post";

    function closeReader(): void {
        navigate(listPath);
    }

    if (overview.error && !overview.data) return <Failure message={overview.error.message} onRetry={overview.reload} />;
    if (!overview.data) return <Loading label="Postfach wird geladen" />;

    return (
        <>
            <PageHeader title="Postfach" meta={unread === null ? undefined : unread === 0 ? "Alles gelesen" : `${unread} ungelesen`} />

            <div className={styles.mail} data-view={view}>
                <aside className={`${styles.column} ${styles.boxes}`} aria-label="Postfächer">
                    <Folders overview={overview.data} selection={selection} developer={developer} onCompose={() => setComposing(true)} onManage={() => setManaging(true)} />
                </aside>

                <section className={`${styles.column} ${styles.listPane}`} aria-label="Liste">
                    <button type="button" className={`${styles.back} ${styles.backPhone}`} onClick={() => navigate("/post")}>
                        <Icon name="arrow-left" size={16} /> Postfächer
                    </button>
                    {isAll ? (
                        <AllPane boxes={boxes} account={accountId} uid={uid} />
                    ) : box !== null && folder !== null ? (
                        // Eigener key je Ordner: Beim Wechsel lädt die Liste frisch, statt kurz die des alten Ordners zu zeigen.
                        <FolderPane key={`${box.id}-${folder}`} box={box} folder={folder} uid={uid} />
                    ) : accountId !== null ? (
                        <p className={styles.listNote}>Dieses Postfach gibt es nicht mehr.</p>
                    ) : (
                        <p className={styles.listNote}>Wähl links einen Ordner.</p>
                    )}
                </section>

                <section className={`${styles.column} ${styles.readPane}`} aria-label="Lesebereich">
                    <button type="button" className={`${styles.back} ${styles.backTablet}`} onClick={closeReader}>
                        <Icon name="arrow-left" size={16} /> Zurück zur Liste
                    </button>
                    <div className={styles.scroll}>
                        {box !== null && folder !== null && uid !== null ? (
                            <Reader
                                key={`${box.id}-${folder}-${uid}`}
                                account={box}
                                accounts={accounts}
                                folder={folder}
                                uid={uid}
                                folders={box.folders ?? []}
                                onChanged={overview.reload}
                                onGone={() => navigate(listPath)}
                            />
                        ) : (
                            <div className={styles.pick}>
                                <Icon name="mail-open" size={32} />
                                <span>Wähl eine Mail aus der Liste.</span>
                            </div>
                        )}
                    </div>
                </section>
            </div>

            {composing && <LazyComposer accounts={accounts} start={EMPTY_DRAFT} onSent={() => setComposing(false)} onClose={() => setComposing(false)} />}

            {developer && <AccountsPanel open={managing} onClose={() => setManaging(false)} onChanged={overview.reload} />}
        </>
    );
}

/** Alte Links auf /post/formular und /kontakt (aus Hinweis-Mails und Discord) landen im Postfach. */
export function MailRedirect(): JSX.Element {
    return <Navigate to="/post" replace />;
}
