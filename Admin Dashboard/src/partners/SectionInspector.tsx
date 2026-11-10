import { type JSX, useId } from "react";
import type { IPost } from "../../shared/news";
import { ENTRY_LIMITS, isVideoLink, SECTION_LABELS, type IEntryInput, type ISection, type ISectionItem } from "../../shared/partners";
import { Button } from "../components/Button";
import { Field } from "../components/Field";
import { Switch } from "../components/Switch";
import { removeAt, replaceAt } from "../editor/list";
import { MediaPicker } from "../studio/MediaPicker";
import { InspectorGroup } from "../studio/Studio";
import { LinksEditor } from "./EntrySettings";
import styles from "./studio.module.scss";

type ItemField = "label" | "value" | "text" | "date";

/** Welche Felder ein Eintrag je Abschnitt hat, und wie viele es höchstens gibt. */
const ITEMS: Partial<Record<ISection["type"], { readonly fields: readonly ItemField[]; readonly max: number; readonly add: string; readonly labels: Partial<Record<ItemField, string>> }>> = {
    stats: { fields: ["label", "value"], max: ENTRY_LIMITS.stats, add: "Kennzahl", labels: { label: "Beschriftung", value: "Wert" } },
    achievements: { fields: ["label", "date"], max: ENTRY_LIMITS.items, add: "Erfolg", labels: { label: "Erfolg", date: "Wann" } },
    together: { fields: ["label", "text"], max: ENTRY_LIMITS.items, add: "Punkt", labels: { label: "Was", text: "Ein Satz dazu" } },
    help: { fields: ["label"], max: ENTRY_LIMITS.items, add: "Punkt", labels: { label: "Wie ihr helft" } },
    facts: { fields: ["label", "value"], max: ENTRY_LIMITS.items, add: "Zeile", labels: { label: "Beschriftung", value: "Wert" } },
};

const TEXT_TYPES: ReadonlySet<ISection["type"]> = new Set(["about", "intro", "text", "discord", "quote"]);

function ItemsEditor({ items, config, onChange }: { readonly items: readonly ISectionItem[]; readonly config: NonNullable<(typeof ITEMS)[keyof typeof ITEMS]>; readonly onChange: (items: ISectionItem[], key: string) => void }): JSX.Element {
    const id = useId();

    return (
        <>
            {items.map((item, index) => (
                <div key={index} className={styles.itemRow}>
                    {config.fields.map((field) => (
                        <Field key={field} id={`${id}-${index}-${field}`} label={config.labels[field] ?? field}>
                            <input
                                id={`${id}-${index}-${field}`}
                                type={field === "date" ? "date" : "text"}
                                maxLength={field === "text" ? 300 : 80}
                                value={item[field] ?? ""}
                                onChange={(event) => {
                                    // Leere Zusatzfelder fallen weg; die Beschriftung bleibt immer.
                                    const next = Object.fromEntries(Object.entries({ ...item, [field]: event.target.value }).filter(([key, text]) => key === "label" || text !== "")) as unknown as ISectionItem;

                                    onChange(replaceAt([...items], index, next), `item-${index}-${field}`);
                                }}
                            />
                        </Field>
                    ))}
                    <Button size="sm" variant="ghost" icon="trash" onClick={() => onChange(removeAt([...items], index), "item-remove")}>
                        Entfernen
                    </Button>
                </div>
            ))}
            {items.length < config.max && (
                <Button size="sm" variant="ghost" icon="plus" onClick={() => onChange([...items, { label: "" }], "item-add")}>
                    {config.add}
                </Button>
            )}
            <p className={styles.muted}>
                {items.length} von höchstens {config.max}. Leere Beschriftungen lassen sich nicht speichern.
            </p>
        </>
    );
}

export interface ISectionInspectorProps {
    readonly value: IEntryInput;
    readonly set: (next: IEntryInput, key?: string) => void;
    readonly index: number;
    readonly posts: readonly IPost[];
}

/** W-0062 Teil 2: Inspektor des gewählten Abschnitts. */
export function SectionInspector({ value, set, index, posts }: ISectionInspectorProps): JSX.Element | null {
    const id = useId();
    const section = value.sections[index];

    if (!section) return null;

    const update = (next: ISection, key?: string): void => set({ ...value, sections: replaceAt([...value.sections], index, next) }, key ? `s${index}-${key}` : undefined);
    const items = ITEMS[section.type];
    const events = posts.filter((post) => post.kind === "termin");

    return (
        <>
            <InspectorGroup title={SECTION_LABELS[section.type]}>
                <Switch checked={section.visible} label="Auf der Seite zeigen" onChange={(visible) => update({ ...section, visible })} />
                {section.type !== "quote" && section.type !== "links" && (
                    <Field id={`${id}-title`} label="Überschrift · freiwillig" counter={{ value: (section.title ?? "").length, max: 80 }}>
                        <input
                            id={`${id}-title`}
                            maxLength={80}
                            placeholder={SECTION_LABELS[section.type]}
                            value={section.title ?? ""}
                            onChange={(event) => {
                                const next = { ...section, title: event.target.value };

                                if (!event.target.value) delete (next as { title?: string }).title;
                                update(next, "title");
                            }}
                        />
                    </Field>
                )}
            </InspectorGroup>

            {TEXT_TYPES.has(section.type) && (
                <InspectorGroup title={section.type === "quote" ? "Zitat" : "Text"}>
                    <Field id={`${id}-text`} label={section.type === "quote" ? "Zitat" : "Text"} hint="Leerzeilen trennen Absätze." counter={{ value: (section.text ?? "").length, max: ENTRY_LIMITS.sectionText }}>
                        <textarea id={`${id}-text`} rows={8} maxLength={ENTRY_LIMITS.sectionText} value={section.text ?? ""} onChange={(event) => update({ ...section, text: event.target.value }, "text")} />
                    </Field>
                    {section.type === "quote" && (
                        <Field id={`${id}-by`} label="Von wem · freiwillig">
                            <input id={`${id}-by`} maxLength={80} value={section.title ?? ""} onChange={(event) => update({ ...section, title: event.target.value || undefined }, "by")} />
                        </Field>
                    )}
                    {section.type === "discord" && <p className={styles.muted}>Mitglieder und „online“ kommen vom verknüpften Server.</p>}
                </InspectorGroup>
            )}

            {items && (
                <InspectorGroup title="Einträge">
                    <ItemsEditor items={section.items ?? []} config={items} onChange={(next, key) => update({ ...section, items: next }, key)} />
                </InspectorGroup>
            )}

            {section.type === "teams" && (
                <InspectorGroup title="Teams aus RL Nexus">
                    <Switch checked={value.showTeams} label="Teams mit Rang und MMR zeigen" onChange={(showTeams) => set({ ...value, showTeams })} />
                    {!value.guildId && <p className={styles.muted}>Ohne verknüpften Discord-Server bleibt der Abschnitt leer.</p>}
                </InspectorGroup>
            )}

            {(section.type === "modules" || section.type === "news") && (
                <p className={styles.muted}>
                    {section.type === "modules" ? "Welche Module er nutzt, kommt vom verknüpften Server." : "Hier stehen die News, die mit diesem Eintrag verknüpft sind."}
                </p>
            )}

            {section.type === "offer" && (
                <InspectorGroup title="Angebot">
                    <Field id={`${id}-offer`} label="Text">
                        <textarea id={`${id}-offer`} rows={3} maxLength={ENTRY_LIMITS.sectionText} value={section.text ?? ""} onChange={(event) => update({ ...section, text: event.target.value }, "text")} />
                    </Field>
                    <Field id={`${id}-code`} label="Rabattcode" counter={{ value: (section.code ?? "").length, max: 40 }}>
                        <input id={`${id}-code`} maxLength={40} value={section.code ?? ""} onChange={(event) => update({ ...section, code: event.target.value }, "code")} />
                    </Field>
                    <Field id={`${id}-until`} label="Gültig bis · freiwillig" hint="Danach verschwindet das Angebot von der Webseite.">
                        <input id={`${id}-until`} type="date" value={section.until ?? ""} onChange={(event) => update({ ...section, until: event.target.value || null })} />
                    </Field>
                </InspectorGroup>
            )}

            {section.type === "tournaments" && (
                <InspectorGroup title="Turniere">
                    {events.length === 0 && <p className={styles.muted}>Noch keine Termine in den News.</p>}
                    {events.map((post) => (
                        <label key={post.id} className={styles.check}>
                            <input
                                type="checkbox"
                                checked={value.tournamentIds.includes(post.id)}
                                onChange={(event) => set({ ...value, tournamentIds: event.target.checked ? [...value.tournamentIds, post.id] : value.tournamentIds.filter((item) => item !== post.id) })}
                            />
                            {post.title}
                        </label>
                    ))}
                </InspectorGroup>
            )}

            {section.type === "links" && (
                <InspectorGroup title="Links">
                    <LinksEditor value={value.links} onChange={(links, key) => set({ ...value, links }, key)} />
                </InspectorGroup>
            )}

            {section.type === "gallery" && (
                <InspectorGroup title="Bilder">
                    {(section.images ?? []).map((image, at) => (
                        <MediaPicker
                            key={`${image}-${at}`}
                            label={`Bild ${at + 1}`}
                            value={image}
                            onChange={(url) => update({ ...section, images: url ? replaceAt([...(section.images ?? [])], at, url) : removeAt([...(section.images ?? [])], at) })}
                        />
                    ))}
                    {(section.images ?? []).length < 12 && <MediaPicker label="Bild dazu" value={null} onChange={(url) => url && update({ ...section, images: [...(section.images ?? []), url] })} />}
                </InspectorGroup>
            )}

            {section.type === "video" && (
                <InspectorGroup title="Video">
                    <Field id={`${id}-video`} label="Link zu YouTube oder Twitch" error={section.url && !isVideoLink(section.url) ? "Videos gehen nur als Link zu YouTube oder Twitch." : undefined}>
                        <input id={`${id}-video`} type="url" placeholder="https://www.youtube.com/watch?v=…" value={section.url ?? ""} onChange={(event) => update({ ...section, url: event.target.value.trim() || undefined }, "url")} />
                    </Field>
                    <p className={styles.muted}>Auf der Webseite lädt das Video erst nach einem Klick.</p>
                </InspectorGroup>
            )}
        </>
    );
}
