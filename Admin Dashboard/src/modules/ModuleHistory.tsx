import { useState, type JSX } from "react";
import type { IGuildRow } from "../../shared/api";
import type { IBotModuleChange, IBotModuleChangePage, IBotModuleView, IBotModuleWritten } from "../../shared/botModules";
import { api } from "../api/client";
import { useLive } from "../api/live";
import { useApi } from "../api/useApi";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Panel } from "../components/Panel";
import { Failure, Loading } from "../components/Status";
import { formatDate } from "../format";
import { useToast } from "../toast/context";
import styles from "./botModules.module.scss";

/**
 * W-0133: Reiter „Verlauf“. Jede Änderung an den Modul-Einstellungen, nach Tag,
 * mit Filtern. Zurücknehmen schreibt den Stand davor als neue Änderung zurück;
 * das geht nur bei der neuesten Änderung eines Bereichs.
 */
type Kind = "" | "status" | "notice" | "values";

const KINDS: readonly { readonly id: Kind; readonly label: string }[] = [
    { id: "", label: "Alle Arten" },
    { id: "status", label: "Status" },
    { id: "notice", label: "Hinweis" },
    { id: "values", label: "Werte" },
];

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function dayLabel(iso: string): string {
    const day = new Date(iso);
    const today = new Date();
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    const same = (a: Date, b: Date): boolean => a.toDateString() === b.toDateString();

    return `${same(day, today) ? "Heute, " : same(day, yesterday) ? "Gestern, " : ""}${formatDate(iso)}`;
}

const time = (iso: string): string => new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

export function ModuleHistory({ modules, guilds }: { readonly modules: readonly IBotModuleView[]; readonly guilds: readonly IGuildRow[] }): JSX.Element {
    const notify = useToast();
    const [module, setModule] = useState("");
    const [scope, setScope] = useState("");
    const [user, setUser] = useState("");
    const [kind, setKind] = useState<Kind>("");
    const [more, setMore] = useState<{ readonly key: string; readonly entries: readonly IBotModuleChange[]; readonly page: number }>({ key: "", entries: [], page: 1 });
    const [loadingMore, setLoadingMore] = useState(false);
    const [undoing, setUndoing] = useState<IBotModuleChange | null>(null);
    const [busy, setBusy] = useState(false);
    const query = new URLSearchParams(Object.entries({ module, server: scope, user, kind }).filter(([, value]) => value !== "")).toString();
    const path = `/api/bot-modules/history${query ? `?${query}` : ""}`;
    const first = useApi<IBotModuleChangePage>(path);

    useLive("modules", first.reload);

    // Weitere Seiten gehören zu Filter und Stand der ersten; ändert sich eins, fallen sie weg.
    const key = `${path}|${first.updatedAt ?? 0}`;
    const extra = more.key === key ? more.entries : [];
    const page = more.key === key ? more.page : 1;

    const nameOf = (id: string): string => modules.find((entry) => entry.module === id)?.name ?? id;
    const guildName = (id: string): string => guilds.find((entry) => entry.id === id)?.name ?? `Server ${id}`;

    if (first.error && !first.data) return <Failure message={first.error.message} onRetry={first.reload} />;
    if (!first.data) return <Loading label="Verlauf wird geladen" />;

    const entries = [...first.data.entries, ...extra];
    const people = new Map(entries.map((entry) => [entry.userId, entry.userName]));
    const servers = [...new Set(first.data.entries.map((entry) => entry.guildId).filter((id): id is string => id !== null))];
    const days = new Map<string, IBotModuleChange[]>();

    for (const entry of entries) {
        const label = dayLabel(entry.createdAt);

        days.set(label, [...(days.get(label) ?? []), entry]);
    }

    const loadMore = async (): Promise<void> => {
        setLoadingMore(true);

        try {
            const next = await api<IBotModuleChangePage>(`${path}${query ? "&" : "?"}page=${page + 1}`);

            setMore({ key, entries: [...extra, ...next.entries], page: page + 1 });
        } catch (failure) {
            notify(messageOf(failure), "danger");
        } finally {
            setLoadingMore(false);
        }
    };

    const undo = async (): Promise<void> => {
        if (!undoing) return;
        setBusy(true);

        try {
            const answer = await api<IBotModuleWritten>(`/api/bot-modules/history/${undoing.id}/undo`, { method: "POST", body: {} });

            notify(answer.bot ? "Zurückgenommen, Bot hat es übernommen." : "Zurückgenommen, Bot gerade nicht erreichbar. Er übernimmt es in spätestens 5 Minuten.");
            first.reload();
        } catch (failure) {
            notify(messageOf(failure), "danger");
        } finally {
            setBusy(false);
            setUndoing(null);
        }
    };

    return (
        <Panel className={styles.historyPanel}>
            <div className={styles.historyFilters}>
                <label>
                    <span>Modul</span>
                    <select value={module} onChange={(event) => setModule(event.target.value)}>
                        <option value="">Alle Module</option>
                        {modules.map((entry) => (
                            <option key={entry.module} value={entry.module}>
                                {entry.name}
                            </option>
                        ))}
                    </select>
                </label>
                <label>
                    <span>Gilt für</span>
                    <select value={scope} onChange={(event) => setScope(event.target.value)}>
                        <option value="">Alle und Server</option>
                        <option value="all">Nur Alle Server</option>
                        {[...new Set([...servers, ...(scope && scope !== "all" ? [scope] : [])])].map((id) => (
                            <option key={id} value={id}>
                                {guildName(id)}
                            </option>
                        ))}
                    </select>
                </label>
                <label>
                    <span>Person</span>
                    <select value={user} onChange={(event) => setUser(event.target.value)}>
                        <option value="">Alle</option>
                        {[...people].map(([id, name]) => (
                            <option key={id} value={id}>
                                {name}
                            </option>
                        ))}
                    </select>
                </label>
                <label>
                    <span>Art</span>
                    <select value={kind} onChange={(event) => setKind(event.target.value as Kind)}>
                        {KINDS.map((entry) => (
                            <option key={entry.id} value={entry.id}>
                                {entry.label}
                            </option>
                        ))}
                    </select>
                </label>
                <span className={styles.historyTotal}>{first.data.total === 1 ? "1 Änderung" : `${first.data.total} Änderungen`}</span>
            </div>

            {entries.length === 0 && <p className={styles.empty}>Keine Änderung passt zu den Filtern.</p>}

            {[...days].map(([day, list]) => (
                <section key={day} className={styles.day}>
                    <h3>{day}</h3>
                    <ol className={styles.changes}>
                        {list.map((entry) => (
                            <li key={entry.id}>
                                <time dateTime={entry.createdAt}>{time(entry.createdAt)}</time>
                                <div>
                                    <p>
                                        <b>{nameOf(entry.module)}</b> · {entry.summary}
                                    </p>
                                    <small>
                                        <span className={entry.guildId ? styles.scopeServer : styles.scopeAll}>{entry.guildId ? guildName(entry.guildId) : "Alle Server"}</span>
                                        {entry.userName}
                                        {entry.botOk === true && " · Bot hat es übernommen"}
                                        {entry.botOk === false && " · Bot nicht erreicht, nach 5 Min. übernommen"}
                                        {entry.undoOf !== null && ` · nimmt #${entry.undoOf} zurück`}
                                    </small>
                                    {entry.note && !entry.note.startsWith("Zurückgenommen") && <small className={styles.changeNote}>Warum: {entry.note}</small>}
                                </div>
                                <Button variant="ghost" onClick={() => setUndoing(entry)}>
                                    Zurücknehmen
                                </Button>
                            </li>
                        ))}
                    </ol>
                </section>
            ))}

            {entries.length < first.data.total && (
                <div className={styles.moreRow}>
                    <Button variant="ghost" onClick={() => void loadMore()} busy={loadingMore}>
                        Weitere laden
                    </Button>
                </div>
            )}

            <ConfirmDialog
                open={undoing !== null}
                title="Änderung zurücknehmen?"
                confirmLabel="Zurücknehmen"
                tone="danger"
                busy={busy}
                onConfirm={() => void undo()}
                onCancel={() => setUndoing(null)}
            >
                {undoing && (
                    <p>
                        {nameOf(undoing.module)}, {undoing.guildId ? guildName(undoing.guildId) : "Alle Server"}: <b>{undoing.summary}</b>. Der Stand davor kommt zurück und steht als neue
                        Änderung im Verlauf. Das geht nur, wenn seitdem dort nichts mehr geändert wurde.
                    </p>
                )}
            </ConfirmDialog>
        </Panel>
    );
}
