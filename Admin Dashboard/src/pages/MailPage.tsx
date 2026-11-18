import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { IMailBox, IMailPage } from "../../shared/api";
import { MAIL_LIST_FILTERS, type MailListFilter } from "../../shared/limits";
import { api } from "../api/client";
import { useLive } from "../api/live";
import { boxColor, mailPath, unreadOf, useMailOverview } from "../api/mail";
import { useApi } from "../api/useApi";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { PageHeader } from "../components/PageHeader";
import { PageTabs } from "../components/PageTabs";
import { Failure, Loading } from "../components/Status";
import { AccountsPanel } from "../mail/AccountsPanel";
import { EMPTY_DRAFT } from "../mail/draft";
import { FolderSelect, Folders } from "../mail/Folders";
import { LazyComposer } from "../mail/LazyComposer";
import { MessageList } from "../mail/MessageList";
import { Reader } from "../mail/Reader";
import { pendingDone, pendingFailed, pendingFresh, pendingOpened, pendingStart, withPending, type MailPending, type PendingState } from "../mail/pending.ts";
import { inboxOf, inboxUnread, legacyAllPath, startPath } from "../mail/route.ts";
import styles from "../mail/mail.module.scss";
import { useMe } from "../session/context";
import { useTitle } from "../useTitle";

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

/** W-0141: kein Auftrag unterwegs, als feste Instanz, damit die Liste nicht neu rechnet. */
const NO_PENDING: PendingState = new Map();

/** Die Liste eines Ordners. Eigene Komponente, damit sie nur lädt, wenn ein Ordner offen ist. */
function FolderPane({ box, folder, uid, pending, onFresh }: { readonly box: IMailBox; readonly folder: string; readonly uid: number | null; readonly pending: PendingState; readonly onFresh: () => void }): JSX.Element {
    const list = useListParams();
    const navigate = useNavigate();
    const state = useApi<IMailPage>(`/api/mail/${box.id}/messages?folder=${encodeURIComponent(folder)}&${list.search}`);
    const current = box.folders?.find((entry) => entry.path === folder);
    const name = current?.name ?? folder;

    useLive("mail", state.reload);

    // W-0141: was gerade verschoben oder als ungelesen markiert wird, zeigt die Liste schon so.
    // Kommen frische Daten, zeigen sie bestätigte Aufträge selbst.
    useEffect(() => {
        if (state.data) onFresh();
    }, [state.data, onFresh]);

    const shown = useMemo(() => (state.data ? { ...state, data: { ...state.data, messages: withPending(state.data.messages, pending) } } : state), [state, pending]);

    // W-0128: Mehrere auf einmal gibt es nur im Papierkorb. War die offene Mail dabei, schließt der Lesebereich.
    const deleteMany =
        current?.role === "trash"
            ? async (uids: readonly number[]): Promise<void> => {
                  await api(`/api/mail/${box.id}/trash/delete`, { method: "POST", body: { folder, uids } });
                  if (uid !== null && uids.includes(uid)) navigate(mailPath(box.id, folder));
              }
            : undefined;

    return (
        <MessageList
            title={`${name} · ${box.label}`}
            state={shown}
            filter={list.filter}
            query={list.query}
            page={list.page}
            linkOf={(entry) => mailPath(box.id, folder, entry.uid)}
            isSelected={(entry) => entry.uid === uid}
            onChange={list.onChange}
            onDeleteMany={deleteMany}
        />
    );
}

/**
 * Das Postfach (W-0053, Entwurf P2 überarbeitet): ein Reiter je Postfach,
 * links seine Ordner, dann Liste und Lesebereich. Was offen ist, steht in der
 * Adresse, damit Zurück im Browser und Links in Hinweis-Mails funktionieren.
 */
export function MailPage(): JSX.Element {
    useTitle("Postfach");

    const me = useMe();
    const developer = me.role === "developer";
    const navigate = useNavigate();
    const params = useParams();
    const [search] = useSearchParams();
    const overview = useMailOverview();
    // Das Schreibfenster liegt über allem. Solange es offen ist, lässt sich nichts anderes anklicken.
    const [composing, setComposing] = useState(false);
    const [managing, setManaging] = useState(false);

    const accountId = numberOf(params.account);
    const folder = accountId !== null ? (params.folder ?? "INBOX") : null;
    const uid = accountId !== null ? numberOf(params.uid) : null;

    const boxes = overview.data?.boxes ?? [];
    const index = boxes.findIndex((entry) => entry.id === accountId);
    const box = index < 0 ? null : boxes[index];
    const listSearch = search.toString() ? `?${search.toString()}` : "";
    const view = uid !== null ? "read" : "list";

    // Ohne Postfach in der Adresse, oder mit einem, das es nicht mehr gibt: ins erste mit ungelesener Post.
    useEffect(() => {
        if (!overview.data || box !== null) return;

        const target = startPath(overview.data.boxes);

        if (target) navigate(target, { replace: true });
    }, [overview.data, box, navigate]);

    const unread = unreadOf(overview.data);
    const listPath = box !== null && folder !== null ? `${mailPath(box.id, folder)}${listSearch}` : "/post";

    // W-0141: was die Liste schon zeigt, bevor der Server antwortet (mail/pending.ts), je Ordner.
    // Im Ref steht der Stand sofort, damit ein Doppelklick die laufende Aktion sieht; der State rendert.
    const here = box !== null && folder !== null ? `${box.id}-${folder}` : "";
    const pendingRef = useRef<{ readonly key: string; readonly state: PendingState }>({ key: "", state: new Map() });
    const [pending, setPending] = useState<{ readonly key: string; readonly state: PendingState }>({ key: "", state: new Map() });
    const change = useCallback(
        (next: (state: PendingState) => PendingState | null): boolean => {
            const current = pendingRef.current.key === here ? pendingRef.current.state : new Map();
            const updated = next(current);

            if (updated === null) return false;
            if (updated !== current || pendingRef.current.key !== here) {
                pendingRef.current = { key: here, state: updated };
                setPending(pendingRef.current);
            }

            return true;
        },
        [here]
    );
    const pendingHere = pending.key === here ? pending.state : NO_PENDING;
    const pendingActions = useMemo(
        () => ({
            start: (entry: number, kind: MailPending) => change((state) => pendingStart(state, entry, kind)),
            done: (entry: number) => void change((state) => pendingDone(state, entry)),
            failed: (entry: number) => void change((state) => pendingFailed(state, entry)),
        }),
        [change]
    );
    const onFresh = useCallback(() => void change(pendingFresh), [change]);

    // Wieder geöffnet: Ab jetzt gilt der Stand der Mail selbst (beim Öffnen setzt der Server \Seen).
    useEffect(() => {
        if (uid !== null) change((state) => pendingOpened(state, uid));
    }, [uid, change]);

    function closeReader(): void {
        navigate(listPath);
    }

    if (overview.error && !overview.data) return <Failure message={overview.error.message} onRetry={overview.reload} />;
    if (!overview.data) return <Loading label="Postfach wird geladen" />;

    return (
        <>
            <PageHeader title="Postfach" meta={unread === null ? undefined : unread === 0 ? "Alles gelesen" : `${unread} ungelesen`}>
                {developer && (
                    <Button variant="ghost" size="sm" icon="wrench" onClick={() => setManaging(true)}>
                        Postfächer verwalten
                    </Button>
                )}
                <Button variant="primary" size="sm" icon="plus" onClick={() => setComposing(true)} disabled={boxes.length === 0}>
                    Neue Mail
                </Button>
            </PageHeader>

            <PageTabs
                label="Postfächer"
                tabs={boxes.map((entry, position) => ({
                    to: mailPath(entry.id, inboxOf(entry)),
                    label: entry.label,
                    dot: boxColor(position),
                    active: entry.id === accountId,
                    count: inboxUnread(entry),
                    warn: entry.error !== null,
                    title: entry.error ? `${entry.address} · ${entry.error}` : entry.address,
                }))}
            />

            {boxes.length === 0 ? (
                <Folders box={null} color="" folder={null} developer={developer} onManage={() => setManaging(true)} />
            ) : (
                <div className={styles.mail} data-view={view}>
                    <aside className={`${styles.column} ${styles.boxes}`} aria-label="Ordner">
                        <Folders box={box} color={boxColor(index)} folder={folder} developer={developer} onManage={() => setManaging(true)} />
                    </aside>

                    <section className={`${styles.column} ${styles.listPane}`} aria-label="Liste">
                        {box !== null && folder !== null && (
                            <>
                                <FolderSelect box={box} folder={folder} />
                                {/* Eigener key je Ordner: Beim Wechsel lädt die Liste frisch, statt kurz die des alten Ordners zu zeigen. */}
                                <FolderPane key={`${box.id}-${folder}`} box={box} folder={folder} uid={uid} pending={pendingHere} onFresh={onFresh} />
                            </>
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
                                    accounts={boxes}
                                    folder={folder}
                                    uid={uid}
                                    folders={box.folders ?? []}
                                    onChanged={overview.reload}
                                    onGone={() => navigate(listPath)}
                                    pending={pendingActions}
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
            )}

            {composing && <LazyComposer accounts={boxes} start={{ ...EMPTY_DRAFT, from: box?.id ?? null }} onSent={() => setComposing(false)} onClose={() => setComposing(false)} />}

            {developer && <AccountsPanel open={managing} onClose={() => setManaging(false)} onChanged={overview.reload} />}
        </>
    );
}

/** Alte Links auf /post/formular und /kontakt (aus Hinweis-Mails und Discord) landen im Postfach. */
export function MailRedirect(): JSX.Element {
    return <Navigate to="/post" replace />;
}

/** „Alle Posteingänge“ gibt es nicht mehr (W-0053). Alte Links öffnen die Mail im Posteingang ihres Postfachs. */
export function MailAllRedirect(): JSX.Element {
    const { account, uid } = useParams();
    const overview = useMailOverview();

    if (overview.error && !overview.data) return <Navigate to="/post" replace />;
    if (!overview.data) return <Loading label="Postfach wird geladen" />;

    return <Navigate to={legacyAllPath(overview.data.boxes, numberOf(account), numberOf(uid))} replace />;
}
