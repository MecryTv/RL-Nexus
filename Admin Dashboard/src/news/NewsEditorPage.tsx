import { type JSX, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { checkPostInput, NEWS_KINDS, type IPost, type IPostInput, type NewsKind, type PostState } from "../../shared/news";
import type { IEntry } from "../../shared/partners";
import { api, ApiError } from "../api/client";
import { useLive } from "../api/live";
import { useApi } from "../api/useApi";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { PageHeader } from "../components/PageHeader";
import { Failure, Loading } from "../components/Status";
import { UnsavedGuard } from "../editor/UnsavedGuard";
import { useStudioDoc } from "../studio/useStudioDoc";
import { useToast } from "../toast/context";
import { newPost, postInput } from "./draft.ts";
import { NewsStudio } from "./NewsStudio";
import styles from "./news.module.scss";

const kindOf = (value: string | null): NewsKind => NEWS_KINDS.find((kind) => kind === value) ?? "beitrag";

interface IEditorProps {
    /** null: neuer Beitrag. */
    readonly post: IPost | null;
    readonly entries: readonly IEntry[];
    readonly channel: string | null;
    /** Schlüssel dieses Editors; bleibt nach dem ersten Speichern gleich, damit nichts neu startet. */
    readonly editorKey: string;
    readonly onSaved: () => void;
}

function NewsEditor({ post, entries, channel, editorKey, onSaved }: IEditorProps): JSX.Element {
    const navigate = useNavigate();
    const notify = useToast();
    const [params] = useSearchParams();
    const [saved, setSaved] = useState<IPost | null>(post);
    const doc = useStudioDoc<IPostInput>(post ? postInput(post) : newPost(kindOf(params.get("art"))));
    const [saving, setSaving] = useState(false);
    const [announcing, setAnnouncing] = useState<IPostInput | null>(null);
    const [created, setCreated] = useState<number | null>(null);
    const checked = checkPostInput(doc.value);
    const problem = "problem" in checked ? checked.problem : null;

    const write = async (input: IPostInput): Promise<void> => {
        setSaving(true);

        try {
            const result = await api<{ readonly post: IPost; readonly warning: string | null }>(saved ? `/api/news/${saved.id}` : "/api/news", { method: saved ? "PUT" : "POST", body: input });
            const fresh = result.post.status === "published" && saved?.status !== "published";

            setSaved(result.post);
            doc.markSaved(postInput(result.post));
            notify(fresh ? "Veröffentlicht." : result.post.status === "scheduled" ? "Gespeichert und geplant." : "Gespeichert.");
            if (result.warning) notify(result.warning, "danger");
            if (!saved) setCreated(result.post.id);
            onSaved();
        } catch (error) {
            notify(error instanceof ApiError ? error.message : "Speichern ging nicht.", "danger");
        } finally {
            setSaving(false);
        }
    };

    const save = (status?: PostState): void => {
        const next = checkPostInput(status ? { ...doc.value, status, publishAt: null } : doc.value);

        if (!("input" in next)) return;

        // Eine Ankündigung in Discord lässt sich nicht zurückholen: vorher fragen.
        if (next.input.status === "published" && next.input.announce && !saved?.announcedAt) setAnnouncing(next.input);
        else void write(next.input);
    };

    // Nach dem ersten Speichern die Adresse mit der ID, ohne den Editor neu zu starten.
    useEffect(() => {
        if (created !== null && !doc.dirty) navigate(`/webseite/news/${created}`, { replace: true, state: { keep: editorKey } });
    }, [created, doc.dirty, navigate, editorKey]);

    return (
        <>
            <UnsavedGuard dirty={doc.dirty} />
            <PageHeader title={saved ? doc.value.title : "Neuer Beitrag"}>
                <Link className={styles.textLink} to="/webseite/news">
                    ← Alle News
                </Link>
            </PageHeader>

            <NewsStudio doc={doc} saved={saved} entries={entries} channel={channel} saving={saving} problem={problem} onSave={save} />

            <ConfirmDialog
                open={announcing !== null}
                title="Veröffentlichen und in Discord ankündigen?"
                confirmLabel="Veröffentlichen"
                busy={saving}
                onConfirm={() => {
                    if (announcing) void write(announcing);
                    setAnnouncing(null);
                }}
                onCancel={() => setAnnouncing(null)}
            >
                <p>Der Beitrag erscheint auf der Webseite und im Kanal für Ankündigungen. Die Nachricht in Discord geht genau einmal raus und bleibt auch, wenn du den Beitrag später änderst.</p>
            </ConfirmDialog>
        </>
    );
}

/** `/webseite/news/:id`, `neu` für einen neuen Beitrag (`?art=beitrag|kurz|termin`). */
export function NewsEditorPage(): JSX.Element {
    const { id = "neu" } = useParams();
    const location = useLocation();
    const list = useApi<{ readonly posts: readonly IPost[]; readonly channel: string | null }>("/api/news");
    const partners = useApi<{ readonly entries: readonly IEntry[] }>("/api/partners");

    useLive("news", list.reload);

    if (list.error && !list.data) return <Failure message={list.error.message} onRetry={list.reload} />;
    if (!list.data || !partners.data) return <Loading label="Beitrag wird geladen" />;

    const keep = (location.state as { readonly keep?: string } | null)?.keep;
    const post = id === "neu" ? null : (list.data.posts.find((item) => String(item.id) === id) ?? null);

    if (id !== "neu" && !post && !keep) return <Failure message="Diesen Beitrag gibt es nicht mehr." />;

    // Jeder Besuch von „neu“ startet frisch; nach dem ersten Speichern bleibt der Schlüssel.
    const editorKey = keep ?? (id === "neu" ? `neu:${location.key}` : id);

    return <NewsEditor key={editorKey} editorKey={editorKey} post={post} entries={partners.data.entries} channel={list.data.channel} onSaved={list.reload} />;
}
