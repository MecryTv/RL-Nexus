import { type JSX, useId, useMemo, useState } from "react";
import { NEWS_KIND_LABELS, NEWS_KINDS, type IPost, type IPostInput, type PostState } from "../../shared/news";
import type { IEntry } from "../../shared/partners";
import { Button } from "../components/Button";
import { Segmented } from "../components/Segmented";
import { useMe } from "../session/context";
import { PreviewStage } from "../studio/PreviewStage";
import { openPreviewTab } from "../studio/previewTab";
import { Studio, type IStudioTray } from "../studio/Studio";
import type { IStudioDoc } from "../studio/useStudioDoc";
import { switchPostKind } from "./draft.ts";
import { PostSettings } from "./PostSettings";
import { newsMessage } from "./preview.ts";
import styles from "./news.module.scss";

const time = (iso: string): string => new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }).format(new Date(iso));
const day = (iso: string): string => new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" }).format(new Date(iso));

/** Stand in der Leiste: „Entwurf · 21:52“, „Geplant: 12.11., 18:00“, „Veröffentlicht“. */
function stateLabel(saved: IPost | null, dirty: boolean): string {
    if (!saved) return "Neu · ungespeichert";

    const base = saved.status === "published" ? "Veröffentlicht" : saved.status === "scheduled" && saved.publishAt ? `Geplant: ${day(saved.publishAt)}, ${time(saved.publishAt)}` : `Entwurf · ${time(saved.updatedAt)}`;

    return dirty ? `${base} · ungespeichert` : base;
}

export interface INewsStudioProps {
    readonly doc: IStudioDoc<IPostInput>;
    readonly saved: IPost | null;
    readonly entries: readonly IEntry[];
    readonly channel: string | null;
    readonly saving: boolean;
    readonly problem: string | null;
    /** Speichern; mit `status` als „Veröffentlichen“. */
    readonly onSave: (status?: PostState) => void;
}

/**
 * W-0062 Teil 2: News-Studio (S1, S2). Mitte die echte Beitragsseite der
 * Webseite, rechts der gewählte Baustein oder die Einstellungen des Beitrags.
 */
export function NewsStudio({ doc, saved, entries, channel, saving, problem, onSave }: INewsStudioProps): JSX.Element {
    const id = useId();
    const me = useMe();
    const value = doc.value;
    const [tray, setTray] = useState<string | null>(null);
    const [selected, setSelected] = useState<string | null>(null);
    const [device, setDevice] = useState<"desktop" | "handy">("desktop");
    // Ein Entwurf ohne Zeitpunkt zeigt „jetzt“; ein Zeitpunkt je geöffnetem Studio reicht.
    const [now] = useState(() => new Date());

    const message = useMemo(
        () => newsMessage(value, { id: saved?.id ?? null, slug: saved?.slug ?? null, publishedAt: saved?.publishedAt ?? null, author: saved?.authorName ?? me.name, entries, now }, selected),
        [value, saved, me.name, entries, now, selected]
    );

    const trays: IStudioTray[] = [];
    const canSave = (doc.dirty || !saved) && problem === null;

    const bar = (
        <>
            <Segmented
                name={`${id}-art`}
                legend="Art"
                options={NEWS_KINDS.map((kind) => ({ value: kind, label: NEWS_KIND_LABELS[kind] }))}
                value={value.kind}
                onChange={(kind) => doc.set(switchPostKind(value, kind))}
            />
            <Segmented
                name={`${id}-ansicht`}
                legend="Ansicht"
                options={[
                    { value: "desktop", label: "Desktop" },
                    { value: "handy", label: "Handy" },
                ]}
                value={device}
                onChange={setDevice}
            />
            <span className={styles.state} role="status">
                {stateLabel(saved, doc.dirty)}
            </span>
            <Button variant="ghost" size="sm" onClick={() => void openPreviewTab(message)}>
                Vorschau ↗
            </Button>
            {problem && <span className={styles.problem}>{problem}</span>}
            <Button variant={value.status === "draft" ? "outline" : "primary"} size="sm" busy={saving} disabled={!canSave} onClick={() => onSave()}>
                Speichern
            </Button>
            {value.status === "draft" && (
                <Button variant="primary" size="sm" busy={saving} disabled={problem !== null} onClick={() => onSave("published")}>
                    Veröffentlichen
                </Button>
            )}
        </>
    );

    return (
        <Studio
            title={`News › ${value.title || "ohne Titel"}`}
            bar={bar}
            undo={{ canUndo: doc.canUndo, canRedo: doc.canRedo, onUndo: doc.undo, onRedo: doc.redo }}
            trays={trays}
            openTray={trays.some((item) => item.id === tray) ? tray : null}
            onTray={setTray}
            stage={<PreviewStage message={message} device={device} onPick={(picked) => setSelected(picked === "kopf" ? null : picked)} onAction={() => undefined} />}
            inspector={<PostSettings value={value} set={doc.set} saved={saved} entries={entries} channel={channel} />}
        />
    );
}
