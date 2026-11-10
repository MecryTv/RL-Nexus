import { type JSX, useId, useMemo, useState } from "react";
import type { IPost } from "../../shared/news";
import { KIND_LABELS, type EntryKind, type IEntry, type IEntryInput } from "../../shared/partners";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Segmented } from "../components/Segmented";
import { MediaPicker } from "../studio/MediaPicker";
import { PreviewStage } from "../studio/PreviewStage";
import { openPreviewTab } from "../studio/previewTab";
import { Studio, type IStudioTray } from "../studio/Studio";
import { partIndex } from "../studio/stage.ts";
import type { IStudioDoc } from "../studio/useStudioDoc";
import type { IContactInfo } from "./ContactField";
import { sectionAction, templateSections, type Template } from "./draft.ts";
import { ColorSwatches, EntrySettings } from "./EntrySettings";
import { guildIconUrl } from "./labels.ts";
import { partnerMessage } from "./preview.ts";
import { useShowcase } from "./hooks";
import { SectionInspector } from "./SectionInspector";
import { SectionsTray } from "./SectionsTray";
import styles from "./studio.module.scss";

type View = "gross" | "karte" | "leiste" | "handy";

const TEMPLATES: Readonly<Record<EntryKind, readonly { readonly id: Template; readonly label: string }[]>> = {
    partner: [
        { id: "organisation", label: "Organisation" },
        { id: "creator", label: "Creator" },
        { id: "liga", label: "Liga" },
        { id: "community", label: "Community" },
    ],
    sponsor: [{ id: "firma", label: "Sponsor-Firma" }],
    supporter: [
        { id: "firma", label: "Firma" },
        { id: "creator", label: "Creator" },
        { id: "community", label: "Community" },
    ],
};

export interface IPartnerStudioProps {
    readonly doc: IStudioDoc<IEntryInput>;
    readonly entry: IEntry;
    readonly entries: readonly IEntry[];
    readonly posts: readonly IPost[];
    readonly contact: IContactInfo | null;
    readonly siteOrigin: string | null;
    readonly saving: boolean;
    readonly problem: string | null;
    readonly onSave: () => void;
    readonly onDelete: () => void;
    readonly onKind: (kind: EntryKind) => void;
}

const timeOf = (iso: string): string => new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }).format(new Date(iso));

/**
 * W-0062 Teil 2: „Seite gestalten“ für Partner, Sponsoren und Unterstützer
 * (S3, S5). Mitte die echte Webseite, rechts der gewählte Abschnitt oder die
 * Einstellungen des Eintrags.
 */
export function PartnerStudio({ doc, entry, entries, posts, contact, siteOrigin, saving, problem, onSave, onDelete, onKind }: IPartnerStudioProps): JSX.Element {
    const id = useId();
    const value = doc.value;
    const supporter = value.kind === "supporter";
    const [tray, setTray] = useState<string | null>("abschnitte");
    const [selected, setSelected] = useState<string | null>(null);
    const [chosenView, setView] = useState<View>("gross");
    const [template, setTemplate] = useState<Template | null>(null);
    // Nur für „Ende erreicht“ bei Unterstützern; ein Zeitpunkt je geöffnetem Studio reicht.
    const [now] = useState(() => new Date());
    const view: View = supporter && chosenView === "karte" ? "leiste" : !supporter && chosenView === "leiste" ? "karte" : chosenView;
    const showcase = useShowcase(value.guildId);
    const server = contact?.servers.find((item) => item.id === value.guildId) ?? null;
    const sectionIndex = selected === null ? null : partIndex(selected, "abschnitt");

    const message = useMemo(
        () => partnerMessage(value, { id: entry.id, slug: entry.slug, entries, posts, showcase, now }, view === "handy" ? "gross" : view, selected),
        [value, entry.id, entry.slug, entries, posts, showcase, view, selected, now]
    );

    const act = (part: string, action: string): void => {
        const index = partIndex(part, "abschnitt");

        if (index === null || (action !== "hoch" && action !== "runter" && action !== "aus")) return;

        doc.set({ ...value, sections: sectionAction(value.sections, index, action) });

        if (action !== "aus") {
            const target = action === "hoch" ? index - 1 : index + 1;

            if (target >= 0 && target < value.sections.length) setSelected(`abschnitt:${target}`);
        }
    };

    const look = (): void => {
        if (entry.visible && !doc.dirty && siteOrigin) {
            window.open(supporter ? `${siteOrigin}/partner?unterstuetzer=${entry.slug}` : `${siteOrigin}/partner/${entry.slug}`, "_blank", "noopener");
        } else {
            void openPreviewTab(message);
        }
    };

    const select = (index: number | null): void => setSelected(index === null ? null : `abschnitt:${index}`);
    const part = {
        tray: <SectionsTray value={value} set={doc.set} selected={sectionIndex} onSelect={select} />,
        inspector: sectionIndex !== null && value.sections[sectionIndex] ? <SectionInspector value={value} set={doc.set} index={sectionIndex} posts={posts} /> : null,
    };
    const trays: IStudioTray[] = [
        {
            id: "vorlagen",
            label: "Vorlagen",
            icon: "sparkle",
            content: (
                <div className={styles.templates}>
                    {TEMPLATES[value.kind].map((item) => (
                        <button key={item.id} type="button" className={styles.template} onClick={() => setTemplate(item.id)}>
                            {item.label}
                        </button>
                    ))}
                    <p className={styles.muted}>Eine Vorlage ersetzt die Abschnitte. Name, Bilder und Texte oben bleiben.</p>
                </div>
            ),
        },
        { id: "abschnitte", label: "Abschnitte", icon: "list", content: part.tray },
        {
            id: "bilder",
            label: "Bilder",
            icon: "image",
            content: (
                <div className={styles.stack}>
                    {!supporter && <MediaPicker label="Banner" value={value.banner} onChange={(banner) => doc.set({ ...value, banner })} />}
                    {supporter && <MediaPicker label="Banner · freiwillig, sonst ein Verlauf in der Farbe" value={value.banner} onChange={(banner) => doc.set({ ...value, banner })} />}
                    <MediaPicker label="Logo" value={value.logo} onChange={(logo) => doc.set({ ...value, logo })} discordIcon={server ? guildIconUrl(server.id, server.icon) : null} />
                </div>
            ),
        },
        { id: "stil", label: "Stil", icon: "sliders", content: <ColorSwatches value={value.color} onChange={(color) => doc.set({ ...value, color })} /> },
    ];

    const bar = (
        <>
            <Segmented
                name={`${id}-art`}
                legend="Art"
                options={(["partner", "sponsor", "supporter"] as const).map((kind) => ({ value: kind, label: KIND_LABELS[kind] }))}
                value={value.kind}
                onChange={onKind}
            />
            <Segmented
                name={`${id}-ansicht`}
                legend="Ansicht"
                options={[
                    { value: "gross", label: "Große Ansicht" },
                    supporter ? { value: "leiste", label: "In der Leiste" } : { value: "karte", label: "Karte" },
                    { value: "handy", label: "Handy" },
                ]}
                value={view}
                onChange={setView}
            />
            <span className={styles.state} role="status">
                {doc.dirty ? "Ungespeichert" : `${entry.visible ? "Sichtbar" : "Versteckt"} · gespeichert ${timeOf(entry.updatedAt)}`}
            </span>
            <Button variant="ghost" size="sm" onClick={look}>
                Ansehen ↗
            </Button>
            {problem && doc.dirty && <span className={styles.problem}>{problem}</span>}
            <Button variant="primary" size="sm" busy={saving} disabled={!doc.dirty || problem !== null} onClick={onSave}>
                Speichern
            </Button>
        </>
    );

    return (
        <>
            <Studio
                title={`${supporter ? "Unterstützer" : "Partner/Sponsorings"} · ${value.name || "ohne Namen"}`}
                bar={bar}
                undo={{ canUndo: doc.canUndo, canRedo: doc.canRedo, onUndo: doc.undo, onRedo: doc.redo }}
                trays={trays}
                openTray={trays.some((item) => item.id === tray) ? tray : null}
                onTray={setTray}
                stage={<PreviewStage message={message} device={view === "handy" ? "handy" : "desktop"} onPick={(picked) => setSelected(picked === "kopf" ? null : picked)} onAction={act} />}
                inspector={part.inspector ?? <EntrySettings value={value} set={doc.set} entry={entry} entries={entries} posts={posts} contact={contact} onDelete={onDelete} />}
            />

            <ConfirmDialog
                open={template !== null}
                title="Vorlage übernehmen?"
                confirmLabel="Übernehmen"
                onConfirm={() => {
                    if (template) doc.set({ ...value, sections: templateSections(value.kind, template) });
                    setTemplate(null);
                    setSelected(null);
                }}
                onCancel={() => setTemplate(null)}
            >
                <p>Die Abschnitte werden durch die Vorlage ersetzt. Name, Bilder und die Texte oben bleiben. Rückgängig geht mit Strg+Z.</p>
            </ConfirmDialog>
        </>
    );
}
