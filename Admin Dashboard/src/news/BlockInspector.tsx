import { type JSX, useEffect, useId, useRef } from "react";
import { BLOCK_LABELS, NEWS_LIMITS, type IBlock } from "../../shared/news";
import { isHttpsLink, isVideoLink, type IEntry } from "../../shared/partners";
import { Button } from "../components/Button";
import { Field } from "../components/Field";
import { Segmented } from "../components/Segmented";
import { removeAt, replaceAt } from "../editor/list";
import { MediaPicker } from "../studio/MediaPicker";
import { InspectorGroup } from "../studio/Studio";
import { berlinToIso, isoToBerlin } from "../studio/time.ts";
import { type TextMark, wrapSelection } from "./draft.ts";
import styles from "./news.module.scss";

const MARKS: readonly { readonly mark: TextMark; readonly label: string; readonly title: string }[] = [
    { mark: "fett", label: "B", title: "Fett" },
    { mark: "kursiv", label: "I", title: "Kursiv" },
    { mark: "link", label: "Link", title: "Link" },
    { mark: "liste", label: "•", title: "Liste" },
    { mark: "nummern", label: "1.", title: "Nummerierte Liste" },
];

export interface IBlockInspectorProps {
    readonly block: IBlock;
    readonly index: number;
    readonly count: number;
    readonly entries: readonly IEntry[];
    /** Ändert den Baustein; `key` fasst Tippen zu einem Schritt zusammen. */
    readonly onChange: (block: IBlock, key?: string) => void;
    readonly onAction: (action: "hoch" | "runter" | "kopie" | "weg") => void;
    /** Steigt bei jeder Wahl auf der Bühne: dann bekommt der Inspektor den Fokus. */
    readonly focus: number;
}

/** W-0062 Teil 2: Inspektor des gewählten Bausteins (S1). */
export function BlockInspector({ block, index, count, entries, onChange, onAction, focus }: IBlockInspectorProps): JSX.Element {
    const id = useId();
    const root = useRef<HTMLDivElement>(null);
    const area = useRef<HTMLTextAreaElement>(null);

    // Nach einem Klick auf der Bühne: bei Text die Schreibmarke ans Ende, sonst der Inspektor,
    // damit Entf, Strg+D und Alt+Pfeile gleich wirken (sie gehen nicht durch die Bühne).
    useEffect(() => {
        if (focus === 0) return;

        if (area.current) {
            area.current.focus();
            area.current.setSelectionRange(area.current.value.length, area.current.value.length);
        } else root.current?.focus();
    }, [focus]);

    const mark = (which: TextMark): void => {
        if (block.type !== "text" || !area.current) return;

        const next = wrapSelection(block.md, area.current.selectionStart, area.current.selectionEnd, which);

        onChange({ ...block, md: next.text });
        requestAnimationFrame(() => {
            area.current?.focus();
            area.current?.setSelectionRange(next.start, next.end);
        });
    };

    const fields = ((): JSX.Element | null => {
        switch (block.type) {
            case "text":
                return (
                    <>
                        <div className={styles.marks} role="toolbar" aria-label="Format">
                            {MARKS.map((item) => (
                                <button key={item.mark} type="button" className={styles.mark} title={item.title} aria-label={item.title} onClick={() => mark(item.mark)}>
                                    {item.label}
                                </button>
                            ))}
                        </div>
                        <Field id={`${id}-md`} label="Text" hint="Markdown-Kürzel gehen auch: **fett**, *kursiv*, - Liste." counter={{ value: block.md.length, max: NEWS_LIMITS.text }}>
                            <textarea ref={area} id={`${id}-md`} rows={9} maxLength={NEWS_LIMITS.text} value={block.md} onChange={(event) => onChange({ ...block, md: event.target.value }, "md")} />
                        </Field>
                        <Segmented
                            name={`${id}-size`}
                            legend="Größe"
                            options={[
                                { value: "normal", label: "Normal" },
                                { value: "lead", label: "Groß (Einleitung)" },
                            ]}
                            value={block.size}
                            onChange={(size) => onChange({ ...block, size })}
                        />
                        <Segmented
                            name={`${id}-width`}
                            legend="Breite"
                            options={[
                                { value: "text", label: "Text-Breite" },
                                { value: "full", label: "Ganze Breite" },
                            ]}
                            value={block.width}
                            onChange={(width) => onChange({ ...block, width })}
                        />
                    </>
                );
            case "heading":
                return (
                    <Field id={`${id}-text`} label="Überschrift" counter={{ value: block.text.length, max: 120 }}>
                        <input id={`${id}-text`} maxLength={120} value={block.text} onChange={(event) => onChange({ ...block, text: event.target.value }, "text")} />
                    </Field>
                );
            case "image":
                return (
                    <>
                        <MediaPicker label="Bild" value={block.url || null} onChange={(url) => onChange({ ...block, url: url ?? "" })} />
                        <Field id={`${id}-alt`} label="Alternativtext" hint="Was auf dem Bild zu sehen ist, für Screenreader." error={block.url && !block.alt.trim() ? "Ein Bild braucht einen Alternativtext." : undefined} counter={{ value: block.alt.length, max: 200 }}>
                            <input id={`${id}-alt`} maxLength={200} value={block.alt} onChange={(event) => onChange({ ...block, alt: event.target.value }, "alt")} />
                        </Field>
                        <Field id={`${id}-caption`} label="Bildunterschrift · freiwillig">
                            <input id={`${id}-caption`} maxLength={200} value={block.caption ?? ""} onChange={(event) => onChange({ ...block, caption: event.target.value || null }, "caption")} />
                        </Field>
                    </>
                );
            case "gallery":
                return (
                    <>
                        {block.images.map((image, at) => (
                            <MediaPicker
                                key={`${image}-${at}`}
                                label={`Bild ${at + 1}`}
                                value={image}
                                onChange={(url) => onChange({ ...block, images: url ? replaceAt([...block.images], at, url) : removeAt([...block.images], at) })}
                            />
                        ))}
                        {block.images.length < 12 && <MediaPicker label="Bild dazu" value={null} onChange={(url) => url && onChange({ ...block, images: [...block.images, url] })} />}
                        <p className={styles.muted}>{block.images.length} von 2 bis 12 Bildern.</p>
                    </>
                );
            case "callout":
                return (
                    <>
                        <Field id={`${id}-title`} label="Überschrift · freiwillig">
                            <input id={`${id}-title`} maxLength={80} value={block.title ?? ""} onChange={(event) => onChange({ ...block, title: event.target.value || null }, "title")} />
                        </Field>
                        <Field id={`${id}-text`} label="Hinweis" counter={{ value: block.text.length, max: 1000 }}>
                            <textarea id={`${id}-text`} rows={4} maxLength={1000} value={block.text} onChange={(event) => onChange({ ...block, text: event.target.value }, "text")} />
                        </Field>
                    </>
                );
            case "quote":
                return (
                    <>
                        <Field id={`${id}-text`} label="Zitat" counter={{ value: block.text.length, max: 600 }}>
                            <textarea id={`${id}-text`} rows={4} maxLength={600} value={block.text} onChange={(event) => onChange({ ...block, text: event.target.value }, "text")} />
                        </Field>
                        <Field id={`${id}-by`} label="Von wem · freiwillig">
                            <input id={`${id}-by`} maxLength={80} value={block.by ?? ""} onChange={(event) => onChange({ ...block, by: event.target.value || null }, "by")} />
                        </Field>
                    </>
                );
            case "partner":
                return (
                    <Field id={`${id}-entry`} label="Partner oder Sponsor" error={block.entryId ? undefined : "Wähl einen Eintrag."}>
                        <select id={`${id}-entry`} value={block.entryId || ""} onChange={(event) => onChange({ ...block, entryId: Number(event.target.value) || 0 })}>
                            <option value="" disabled>
                                Eintrag wählen …
                            </option>
                            {entries
                                .filter((entry) => entry.kind !== "supporter")
                                .map((entry) => (
                                    <option key={entry.id} value={entry.id}>
                                        {entry.name}
                                        {entry.visible ? "" : " (versteckt)"}
                                    </option>
                                ))}
                        </select>
                    </Field>
                );
            case "event":
                return (
                    <>
                        <Field id={`${id}-title`} label="Termin" counter={{ value: block.title.length, max: 80 }}>
                            <input id={`${id}-title`} maxLength={80} value={block.title} onChange={(event) => onChange({ ...block, title: event.target.value }, "title")} />
                        </Field>
                        <Field id={`${id}-start`} label="Beginn · in Berlin">
                            <input
                                id={`${id}-start`}
                                type="datetime-local"
                                value={isoToBerlin(block.startsAt)}
                                onChange={(event) => {
                                    const iso = berlinToIso(event.target.value);

                                    if (iso) onChange({ ...block, startsAt: iso });
                                }}
                            />
                        </Field>
                        <Field id={`${id}-place`} label="Ort · freiwillig">
                            <input id={`${id}-place`} maxLength={80} value={block.place ?? ""} onChange={(event) => onChange({ ...block, place: event.target.value || null }, "place")} />
                        </Field>
                    </>
                );
            case "video":
                return (
                    <>
                        <Field id={`${id}-url`} label="Link zu YouTube oder Twitch" error={block.url && !isVideoLink(block.url) ? "Videos gehen nur als Link zu YouTube oder Twitch." : undefined}>
                            <input id={`${id}-url`} type="url" placeholder="https://www.youtube.com/watch?v=…" value={block.url} onChange={(event) => onChange({ ...block, url: event.target.value.trim() }, "url")} />
                        </Field>
                        <p className={styles.muted}>Auf der Webseite lädt das Video erst nach einem Klick.</p>
                    </>
                );
            case "button":
                return (
                    <>
                        <Field id={`${id}-label`} label="Beschriftung" counter={{ value: block.label.length, max: 40 }}>
                            <input id={`${id}-label`} maxLength={40} value={block.label} onChange={(event) => onChange({ ...block, label: event.target.value }, "label")} />
                        </Field>
                        <Field id={`${id}-url`} label="Link" error={isHttpsLink(block.url) ? undefined : "Ein Knopf braucht einen Link mit https://."}>
                            <input id={`${id}-url`} type="url" value={block.url} onChange={(event) => onChange({ ...block, url: event.target.value.trim() }, "url")} />
                        </Field>
                    </>
                );
            case "divider":
                return <p className={styles.muted}>Ein Trenner hat keine Einstellungen.</p>;
        }
    })();

    return (
        <div ref={root} tabIndex={-1} className={styles.inspector} aria-label={`${BLOCK_LABELS[block.type]}, Baustein ${index + 1}`}>
            <InspectorGroup title={`${BLOCK_LABELS[block.type]} · ${index + 1} von ${count}`}>{fields}</InspectorGroup>
            <InspectorGroup title="Baustein">
                <div className={styles.blockActions}>
                    <Button size="sm" variant="ghost" icon="chevron-up" disabled={index === 0} onClick={() => onAction("hoch")}>
                        Hoch
                    </Button>
                    <Button size="sm" variant="ghost" icon="chevron-down" disabled={index === count - 1} onClick={() => onAction("runter")}>
                        Runter
                    </Button>
                    <Button size="sm" variant="ghost" icon="copy" disabled={count >= NEWS_LIMITS.blocks} onClick={() => onAction("kopie")}>
                        Duplizieren
                    </Button>
                    <Button size="sm" variant="danger" icon="trash" onClick={() => onAction("weg")}>
                        Löschen
                    </Button>
                </div>
                <p className={styles.muted}>Tastatur: Entf löscht den Baustein, Strg+D dupliziert, Alt+↑/↓ verschiebt.</p>
            </InspectorGroup>
        </div>
    );
}
