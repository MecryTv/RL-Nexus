import { type JSX, useId, useState } from "react";
import { Link } from "react-router-dom";
import { CATEGORY_LABELS, NEWS_KIND_LABELS, type IPost } from "../../shared/news";
import type { IStatusChannelOption } from "../../shared/status";
import { api, ApiError } from "../api/client";
import { useLive } from "../api/live";
import { useApi } from "../api/useApi";
import { Badge } from "../components/Badge";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { PageHeader } from "../components/PageHeader";
import { Panel } from "../components/Panel";
import { Failure, Loading } from "../components/Status";
import { useToast } from "../toast/context";
import styles from "./news.module.scss";

type Tab = "alle" | "draft" | "scheduled" | "published";

const at = (iso: string): string => new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }).format(new Date(iso));

function stateOf(post: IPost): { readonly label: string; readonly tone: "neutral" | "info" | "ok" } {
    if (post.status === "published") return { label: post.publishedAt ? `Veröffentlicht am ${at(post.publishedAt)}` : "Veröffentlicht", tone: "ok" };
    if (post.status === "scheduled") return { label: post.publishAt ? `Geplant für ${at(post.publishAt)}` : "Geplant", tone: "info" };

    return { label: "Entwurf", tone: "neutral" };
}

/** Kanal für „In Discord ankündigen“. */
function ChannelBox({ channel, onSaved }: { readonly channel: string | null; readonly onSaved: () => void }): JSX.Element {
    const id = useId();
    const notify = useToast();
    const channels = useApi<readonly IStatusChannelOption[]>("/api/news/channels");
    const current = channels.data?.find((item) => item.id === channel) ?? null;

    const choose = async (channelId: string): Promise<void> => {
        try {
            await api("/api/news/channel", { method: "PUT", body: { channelId } });
            notify("Kanal für Ankündigungen gespeichert.");
            onSaved();
        } catch (error) {
            notify(error instanceof ApiError ? error.message : "Speichern ging nicht.", "danger");
        }
    };

    return (
        <Panel className={styles.channel}>
            <label htmlFor={`${id}-kanal`}>Ankündigungen in Discord</label>
            <select id={`${id}-kanal`} value={channel ?? ""} disabled={!channels.data} onChange={(event) => void choose(event.target.value)}>
                <option value="" disabled>
                    Kanal wählen …
                </option>
                {(channels.data ?? []).map((item) => (
                    <option key={item.id} value={item.id}>
                        {item.category ? `${item.category} › ` : ""}#{item.name}
                    </option>
                ))}
            </select>
            <p className={styles.muted}>
                {current && current.missing.length > 0
                    ? `Dem Bot fehlt dort: ${current.missing.join(", ")}.`
                    : "Beiträge mit „In Discord ankündigen“ erscheinen dort beim Veröffentlichen, genau einmal."}
            </p>
        </Panel>
    );
}

/** W-0062 Teil 2: Webseite › News. Alle Beiträge, Kurzmeldungen und Termine mit Stand. */
export function NewsPage(): JSX.Element {
    const list = useApi<{ readonly posts: readonly IPost[]; readonly channel: string | null }>("/api/news");
    const site = useApi<{ readonly url: string; readonly origin: string }>("/api/content/vorschau");
    const notify = useToast();
    const [tab, setTab] = useState<Tab>("alle");
    const [deleting, setDeleting] = useState<IPost | null>(null);
    const [busy, setBusy] = useState(false);

    useLive("news", list.reload);

    if (list.error && !list.data) return <Failure message={list.error.message} onRetry={list.reload} />;

    const posts = list.data?.posts ?? [];
    const count = (state: Tab): number => (state === "alle" ? posts.length : posts.filter((post) => post.status === state).length);
    const shown = tab === "alle" ? posts : posts.filter((post) => post.status === tab);

    const remove = async (): Promise<void> => {
        if (!deleting) return;

        setBusy(true);

        try {
            await api(`/api/news/${deleting.id}`, { method: "DELETE" });
            notify(`„${deleting.title}“ ist gelöscht.`);
            list.reload();
        } catch (error) {
            notify(error instanceof ApiError ? error.message : "Löschen ging nicht.", "danger");
        } finally {
            setBusy(false);
            setDeleting(null);
        }
    };

    return (
        <>
            <PageHeader title="News">
                <div className={styles.headActions}>
                    {site.data && (
                        <a className={styles.textLink} href={`${site.data.origin}/news`} target="_blank" rel="noopener noreferrer">
                            News ansehen ↗
                        </a>
                    )}
                    <span className={styles.newLabel}>Neu:</span>
                    {(["beitrag", "kurz", "termin"] as const).map((kind) => (
                        <Link key={kind} className={styles.newLink} to={`/webseite/news/neu?art=${kind}`}>
                            + {NEWS_KIND_LABELS[kind]}
                        </Link>
                    ))}
                </div>
            </PageHeader>

            {!list.data ? (
                <Loading label="News werden geladen" />
            ) : (
                <>
                    <ChannelBox channel={list.data.channel} onSaved={list.reload} />

                    <div className={styles.tabs} role="tablist" aria-label="Stand">
                        {(
                            [
                                ["alle", "Alle"],
                                ["draft", "Entwürfe"],
                                ["scheduled", "Geplant"],
                                ["published", "Veröffentlicht"],
                            ] as const
                        ).map(([id, label]) => (
                            <button key={id} type="button" role="tab" aria-selected={tab === id} className={styles.tab} onClick={() => setTab(id)}>
                                {label} <span>{count(id)}</span>
                            </button>
                        ))}
                    </div>

                    {shown.length === 0 ? (
                        <p className={styles.muted}>{posts.length === 0 ? "Noch keine News. Fang mit einem Beitrag an." : "Hier ist nichts."}</p>
                    ) : (
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Titel</th>
                                    <th>Art</th>
                                    <th>Kategorie</th>
                                    <th>Stand</th>
                                    <th>Angeheftet</th>
                                    <th>Discord</th>
                                    <th aria-label="Aktionen" />
                                </tr>
                            </thead>
                            <tbody>
                                {shown.map((post) => {
                                    const state = stateOf(post);

                                    return (
                                        <tr key={post.id}>
                                            <td className={styles.title}>{post.title}</td>
                                            <td>{NEWS_KIND_LABELS[post.kind]}</td>
                                            <td>{CATEGORY_LABELS[post.category]}</td>
                                            <td>
                                                <Badge tone={state.tone}>{state.label}</Badge>
                                            </td>
                                            <td>{post.pinned === "big" ? "groß" : post.pinned === "small" ? "klein" : "–"}</td>
                                            <td>{post.announcedAt ? "angekündigt" : post.announce ? "kündigt an" : "–"}</td>
                                            <td className={styles.actions}>
                                                <Link className={styles.rowLink} to={`/webseite/news/${post.id}`}>
                                                    Bearbeiten
                                                </Link>
                                                <button type="button" className={styles.rowDanger} onClick={() => setDeleting(post)}>
                                                    Löschen
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </>
            )}

            <ConfirmDialog open={deleting !== null} title="Beitrag löschen?" confirmLabel="Löschen" tone="danger" busy={busy} onConfirm={() => void remove()} onCancel={() => setDeleting(null)}>
                <p>„{deleting?.title}“ verschwindet von der Webseite. Eine Ankündigung in Discord bleibt stehen. Das lässt sich nicht rückgängig machen.</p>
            </ConfirmDialog>
        </>
    );
}
