import { useEffect, useState, type JSX } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { IMailBox, IMailPage } from "../../shared/api";
import { MAIL_LIST_FILTERS, type MailListFilter } from "../../shared/limits";
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
                                <FolderPane key={`${box.id}-${folder}`} box={box} folder={folder} uid={uid} />
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
