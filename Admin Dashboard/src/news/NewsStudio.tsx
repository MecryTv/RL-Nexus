import { type JSX, useCallback, useEffect, useId, useMemo, useState } from "react";
import { NEWS_KIND_LABELS, NEWS_KINDS, type BlockType, type IPost, type IPostInput, type PostState } from "../../shared/news";
import type { IEntry } from "../../shared/partners";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Segmented } from "../components/Segmented";
import { useMe } from "../session/context";
import { MediaPicker } from "../studio/MediaPicker";
import { PreviewStage } from "../studio/PreviewStage";
import { openPreviewTab } from "../studio/previewTab";
import { partShortcut } from "../studio/shortcut.ts";
import { InspectorGroup, Studio, type IStudioTray } from "../studio/Studio";
import { partIndex, type StageAction } from "../studio/stage.ts";
import type { IStudioDoc } from "../studio/useStudioDoc";
import { BlockInspector } from "./BlockInspector";
import { BlocksTray, LayoutTray, MediaTray } from "./BlocksTray";
import { blockAction, insertBlock, saveLabel, switchPostKind, templatePost, type NewsTemplate } from "./draft.ts";
import { PostSettings } from "./PostSettings";
import { newsMessage } from "./preview.ts";
import styles from "./news.module.scss";

const TEMPLATES: readonly { readonly id: NewsTemplate; readonly label: string }[] = [
    { id: "update", label: "Update" },
    { id: "partner", label: "Partner/Sponsoring vorstellen" },
    { id: "turnier", label: "Turnier ankündigen" },
    { id: "wartung", label: "Wartung" },
];

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
    const [tray, setTray] = useState<string | null>("bausteine");
    const [selected, setSelected] = useState<string | null>(null);
    const [template, setTemplate] = useState<NewsTemplate | null>(null);
    // Nach einer Wahl auf der Bühne holt sich der Inspektor einmal den Fokus (Tasten im iframe erreichen das Studio nicht).
    const [focusPick, setFocusPick] = useState(false);
    const focused = useCallback(() => setFocusPick(false), []);
    const [device, setDevice] = useState<"desktop" | "handy">("desktop");
    // Ein Entwurf ohne Zeitpunkt zeigt „jetzt“; ein Zeitpunkt je geöffnetem Studio reicht.
    const [now] = useState(() => new Date());

    const message = useMemo(
        () => newsMessage(value, { id: saved?.id ?? null, slug: saved?.slug ?? null, publishedAt: saved?.publishedAt ?? null, author: saved?.authorName ?? me.name, entries, now }, selected),
        [value, saved, me.name, entries, now, selected]
    );

    const blockIndex = selected === null ? null : partIndex(selected, "block");
    const block = blockIndex === null ? undefined : value.blocks[blockIndex];

    const act = (index: number, action: StageAction): void => {
        if (action === "aus") return;

        const next = blockAction(value.blocks, index, action);

        doc.set({ ...value, blocks: next.blocks });
        setSelected(next.selected === null ? null : `block:${next.selected}`);
    };

    const add = (type: BlockType): void => {
        const next = insertBlock(value.blocks, blockIndex, type);

        doc.set({ ...value, blocks: next.blocks });
        setSelected(`block:${next.index}`);
    };

    // Entf, Strg+D und Alt+Pfeile, solange ein Baustein gewählt ist und der Fokus nicht in einem Feld steht.
    useEffect(() => {
        if (blockIndex === null || !block) return;

        const onKey = (event: KeyboardEvent): void => {
            const action = partShortcut(event);

            if (!action) return;

            event.preventDefault();
            act(blockIndex, action);
        };

        window.addEventListener("keydown", onKey);

        return () => window.removeEventListener("keydown", onKey);
    });

    const trays: IStudioTray[] = [
        {
            id: "vorlagen",
            label: "Vorlagen",
            icon: "sparkle",
            content: (
                <div className={styles.templates}>
                    {TEMPLATES.map((item) => (
                        <button key={item.id} type="button" className={styles.template} onClick={() => setTemplate(item.id)}>
                            {item.label}
                        </button>
                    ))}
                    <p className={styles.trayNote}>Eine Vorlage ersetzt die Bausteine. Titel, Kurztext, Titelbild und Verknüpfung bleiben.</p>
                </div>
            ),
        },
        { id: "bausteine", label: "Bausteine", icon: "puzzle", content: <BlocksTray count={value.blocks.length} onAdd={add} /> },
        { id: "aufbau", label: "Aufbau", icon: "list-ordered", content: <LayoutTray value={value} set={doc.set} selected={selected} onSelect={setSelected} /> },
        {
            id: "medien",
            label: "Medien",
            icon: "image",
            content: (
                <MediaTray
                    cover={selected === "titelbild"}
                    onPick={(url) => {
                        if (selected === "titelbild") {
                            doc.set({ ...value, cover: url });

                            return;
                        }

                        const next = insertBlock(value.blocks, blockIndex, "image");

                        doc.set({ ...value, blocks: next.blocks.map((item, at) => (at === next.index && item.type === "image" ? { ...item, url } : item)) });
                        setSelected(`block:${next.index}`);
                    }}
                />
            ),
        },
    ];

    const inspector =
        block && blockIndex !== null ? (
            <BlockInspector
                key={blockIndex}
                block={block}
                index={blockIndex}
                count={value.blocks.length}
                entries={entries}
                focus={focusPick}
                onFocused={focused}
                onChange={(next, key) => doc.set({ ...value, blocks: value.blocks.map((item, at) => (at === blockIndex ? next : item)) }, key ? `b${blockIndex}-${key}` : undefined)}
                onAction={(action) => act(blockIndex, action)}
            />
        ) : selected === "titelbild" ? (
            <InspectorGroup title="Titelbild">
                <MediaPicker label="Titelbild · freiwillig" value={value.cover} onChange={(cover) => doc.set({ ...value, cover })} />
                <p className={styles.muted}>Steht fest über dem Text. Solange das Titelbild gewählt ist, setzt ein Klick im Fach Medien das Bild.</p>
            </InspectorGroup>
        ) : (
            <PostSettings value={value} set={doc.set} saved={saved} entries={entries} channel={channel} />
        );
    const canSave = (doc.dirty || !saved) && problem === null;
    const savedStatus = saved?.status ?? "draft";
    // Wie in S1: ein Entwurf bleibt mit „Speichern“ Entwurf, daneben steht „Veröffentlichen“.
    const publishNow = value.status === "draft" && savedStatus === "draft";

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
            <Button variant={publishNow ? "outline" : "primary"} size="sm" busy={saving} disabled={!canSave} title={problem ?? undefined} onClick={() => onSave()}>
                {saveLabel(value.status, savedStatus)}
            </Button>
            {publishNow && (
                <Button variant="primary" size="sm" busy={saving} disabled={problem !== null} title={problem ?? undefined} onClick={() => onSave("published")}>
                    Veröffentlichen
                </Button>
            )}
        </>
    );

    return (
        <>
            <Studio
                title={`News › ${value.title || "ohne Titel"}`}
                bar={bar}
                undo={{ canUndo: doc.canUndo, canRedo: doc.canRedo, onUndo: doc.undo, onRedo: doc.redo }}
                trays={trays}
                openTray={trays.some((item) => item.id === tray) ? tray : null}
                onTray={setTray}
                stage={
                    <PreviewStage
                        message={message}
                        device={device}
                        problem={problem}
                        onPick={(part) => {
                            setSelected(part === "kopf" ? null : part);
                            setFocusPick(true);
                        }}
                        onAction={(part, action) => {
                            const index = partIndex(part, "block");
    
                            if (index !== null) act(index, action);
                        }}
                    />
                }
                inspector={inspector}
            />
    
            <ConfirmDialog
                open={template !== null}
                title="Vorlage übernehmen?"
                confirmLabel="Übernehmen"
                onConfirm={() => {
                    if (template) doc.set(templatePost(template, value));
                    setTemplate(null);
                    setSelected(null);
                }}
                onCancel={() => setTemplate(null)}
            >
                <p>Art, Kategorie und Bausteine kommen aus der Vorlage. Titel, Kurztext, Titelbild und Verknüpfung bleiben. Rückgängig geht mit Strg+Z.</p>
            </ConfirmDialog>
        </>
    );
}
