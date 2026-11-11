import { type JSX, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { IPost } from "../../shared/news";
import { checkEntryInput, type EntryKind, type IEntry, type IEntryInput } from "../../shared/partners";
import { api, ApiError } from "../api/client";
import { useLive } from "../api/live";
import { useApi } from "../api/useApi";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { PageHeader } from "../components/PageHeader";
import { Failure, Loading } from "../components/Status";
import { UnsavedGuard } from "../editor/UnsavedGuard";
import { useStudioDoc } from "../studio/useStudioDoc";
import { useToast } from "../toast/context";
import { inputOf, roleNotice, switchKind } from "./draft.ts";
import { useContact } from "./hooks";
import { AccountTab, ProtocolTab } from "./AccountTab";
import { PartnerStudio } from "./PartnerStudio";
import styles from "./studio.module.scss";

type Tab = "seite" | "konto" | "protokoll";

interface IEditorProps {
    readonly entry: IEntry;
    readonly entries: readonly IEntry[];
    readonly posts: readonly IPost[];
    readonly siteOrigin: string | null;
    readonly onSaved: () => void;
}

/**
 * W-0062 Teil 2: Ein Eintrag mit den Reitern „Seite gestalten“ (Studio),
 * „Konto, Zugang und Rolle“ und „Protokoll“. Der Entwurf liegt über den
 * Reitern: Ein Wechsel verwirft nichts.
 */
function PartnerEditor({ entry, entries, posts, siteOrigin, onSaved }: IEditorProps): JSX.Element {
    const navigate = useNavigate();
    const notify = useToast();
    const doc = useStudioDoc<IEntryInput>(inputOf(entry));
    const [tab, setTab] = useState<Tab>("seite");
    const [saving, setSaving] = useState(false);
    const [pending, setPending] = useState<{ readonly text: string; readonly run: () => void } | null>(null);
    const [acknowledged, setAcknowledged] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);
    // Stand je Art beim Verlassen: Zurückwechseln holt ihn wieder (Review).
    const left = useRef<Partial<Record<EntryKind, IEntryInput>>>({});
    // Nach dem Löschen erst weg, wenn der Entwurf nicht mehr als ungespeichert gilt.
    const [gone, setGone] = useState(false);
    const contact = useContact(doc.value.contactId);
    const before = useContact(entry.contactId);
    const checked = checkEntryInput(doc.value);
    const problem = "problem" in checked ? checked.problem : null;
    const group = before?.group ?? null;

    const save = async (): Promise<void> => {
        if (!("input" in checked)) return;

        const sent = doc.value;

        setSaving(true);

        try {
            const saved = await api<IEntry>(`/api/partners/${entry.id}`, { method: "PUT", body: checked.input });

            doc.markSaved(inputOf(saved), sent);
            setAcknowledged(null);
            notify("Gespeichert.");
            onSaved();
        } catch (error) {
            notify(error instanceof ApiError ? error.message : "Speichern ging nicht.", "danger");
        } finally {
            setSaving(false);
        }
    };

    const requestSave = (): void => {
        const notice = "input" in checked ? roleNotice(entry, checked.input, group) : null;

        if (notice && notice !== acknowledged) setPending({ text: notice, run: () => void save() });
        else void save();
    };

    const changeKind = (kind: EntryKind): void => {
        const next = switchKind(doc.value, kind, left.current[kind]);
        const notice = roleNotice(entry, next, group);

        if (notice) {
            setPending({
                text: `${notice} Das passiert beim Speichern.`,
                run: () => {
                    left.current[doc.value.kind] = doc.value;
                    doc.set(next);
                    setAcknowledged(notice);
                },
            });
        } else {
            left.current[doc.value.kind] = doc.value;
            doc.set(next);
        }
    };

    const remove = async (): Promise<void> => {
        setSaving(true);

        try {
            await api(`/api/partners/${entry.id}`, { method: "DELETE" });
            doc.markSaved(doc.value);
            notify(`${entry.name} ist gelöscht.`);
            setGone(true);
        } catch (error) {
            notify(error instanceof ApiError ? error.message : "Löschen ging nicht.", "danger");
        } finally {
            setSaving(false);
            setDeleting(false);
        }
    };

    useEffect(() => {
        if (gone && !doc.dirty) navigate("/webseite/partner");
    }, [gone, doc.dirty, navigate]);

    const tabs: readonly { readonly id: Tab; readonly label: string }[] = [
        { id: "seite", label: "Seite gestalten" },
        ...(doc.value.kind === "supporter" ? [] : [{ id: "konto" as const, label: "Konto, Zugang und Rolle" }]),
        { id: "protokoll", label: "Protokoll" },
    ];
    const shown = tabs.some((item) => item.id === tab) ? tab : "seite";

    return (
        <>
            <UnsavedGuard dirty={doc.dirty} />
            <PageHeader title={doc.value.name || entry.name}>
                <Link className={styles.back} to="/webseite/partner">
                    ← Alle Partner/Sponsorings
                </Link>
            </PageHeader>

            <div className={styles.pageTabs} role="tablist" aria-label="Bereiche des Eintrags">
                {tabs.map((item) => (
                    <button key={item.id} type="button" role="tab" aria-selected={shown === item.id} className={styles.pageTab} onClick={() => setTab(item.id)}>
                        {item.label}
                    </button>
                ))}
            </div>

            {shown === "seite" && (
                <PartnerStudio
                    doc={doc}
                    entry={entry}
                    entries={entries}
                    posts={posts}
                    contact={contact}
                    siteOrigin={siteOrigin}
                    saving={saving}
                    problem={problem}
                    onSave={requestSave}
                    onDelete={() => setDeleting(true)}
                    onKind={changeKind}
                />
            )}
            {shown === "konto" && <AccountTab value={doc.value} set={doc.set} entry={entry} dirty={doc.dirty} saving={saving} problem={problem} onSave={requestSave} onChanged={onSaved} onEntry={(updated) => doc.markSaved(inputOf(updated))} />}
            {shown === "protokoll" && <ProtocolTab entry={entry} />}

            <ConfirmDialog
                open={pending !== null}
                title="Gruppe und Rolle ändern sich"
                confirmLabel="Weiter"
                onConfirm={() => {
                    pending?.run();
                    setPending(null);
                }}
                onCancel={() => setPending(null)}
            >
                <p>{pending?.text}</p>
            </ConfirmDialog>

            <ConfirmDialog open={deleting} title={`${entry.name} löschen?`} confirmLabel="Löschen" tone="danger" busy={saving} onConfirm={() => void remove()} onCancel={() => setDeleting(false)}>
                <p>Der Eintrag verschwindet von der Webseite. Das lässt sich nicht rückgängig machen.</p>
                {roleNotice(entry, "loeschen", group) && <p>{roleNotice(entry, "loeschen", group)}</p>}
            </ConfirmDialog>
        </>
    );
}

/** `/webseite/partner/:id` */
export function PartnerEditorPage(): JSX.Element {
    const { id } = useParams();
    const list = useApi<{ readonly entries: readonly IEntry[] }>("/api/partners");
    const news = useApi<{ readonly posts: readonly IPost[] }>("/api/news");
    const site = useApi<{ readonly url: string; readonly origin: string }>("/api/content/vorschau");

    useLive("partners", list.reload);

    if (list.error && !list.data) return <Failure message={list.error.message} onRetry={list.reload} />;
    if (!list.data || !news.data) return <Loading label="Eintrag wird geladen" />;

    const entry = list.data.entries.find((item) => String(item.id) === id);

    if (!entry) return <Failure message="Diesen Eintrag gibt es nicht mehr." />;

    return <PartnerEditor key={entry.id} entry={entry} entries={list.data.entries} posts={news.data.posts} siteOrigin={site.data?.origin ?? null} onSaved={list.reload} />;
}
