import { type JSX, useId } from "react";
import { CATEGORY_LABELS, NEWS_CATEGORIES, NEWS_LIMITS, type IPost, type IPostInput, type PinState, type PostState } from "../../shared/news";
import { slugify, type IEntry } from "../../shared/partners";
import { Field } from "../components/Field";
import { Segmented } from "../components/Segmented";
import { Switch } from "../components/Switch";
import { MediaPicker } from "../studio/MediaPicker";
import { InspectorGroup } from "../studio/Studio";
import { berlinToIso, isoToBerlin, todayBerlin } from "../studio/time.ts";
import styles from "./news.module.scss";

const at = (iso: string): string => new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(iso));

/** Morgen 18 Uhr in Berlin: Vorschlag, wenn „Geplant“ noch keinen Zeitpunkt hat. */
const tomorrowSix = (): string => berlinToIso(`${todayBerlin(new Date(Date.now() + 24 * 3600_000))}T18:00`)!;

/** Ein Zeitpunkt als `datetime-local` in Berlin. Unvollständige Eingaben ändern nichts. */
function Moment({ id, label, value, onChange, optional = false }: { readonly id: string; readonly label: string; readonly value: string | null; readonly onChange: (iso: string | null) => void; readonly optional?: boolean }): JSX.Element {
    return (
        <Field id={id} label={label}>
            <input
                id={id}
                type="datetime-local"
                value={value ? isoToBerlin(value) : ""}
                onChange={(event) => {
                    if (!event.target.value) {
                        if (optional) onChange(null);

                        return;
                    }

                    const iso = berlinToIso(event.target.value);

                    if (iso) onChange(iso);
                }}
            />
        </Field>
    );
}

export interface IPostSettingsProps {
    readonly value: IPostInput;
    readonly set: (next: IPostInput, key?: string) => void;
    /** null: noch nicht gespeichert. */
    readonly saved: IPost | null;
    readonly entries: readonly IEntry[];
    /** Kanal für Ankündigungen, null ohne. */
    readonly channel: string | null;
}

/** W-0062 Teil 2: Inspektor des News-Studios, wenn nichts gewählt ist (S2). */
export function PostSettings({ value, set, saved, entries, channel }: IPostSettingsProps): JSX.Element {
    const id = useId();
    const patch = (next: Partial<IPostInput>, key?: string): void => set({ ...value, ...next }, key);
    const linkable = entries.filter((entry) => entry.kind !== "supporter");
    const announced = saved?.announcedAt ?? null;

    return (
        <>
            <InspectorGroup title="Beitrag">
                <Field id={`${id}-title`} label="Titel" counter={{ value: value.title.length, max: NEWS_LIMITS.title }}>
                    <input id={`${id}-title`} maxLength={NEWS_LIMITS.title} value={value.title} onChange={(event) => patch({ title: event.target.value }, "title")} />
                </Field>
                {saved ? (
                    <p className={styles.address}>/news/{saved.slug}</p>
                ) : (
                    <Field id={`${id}-slug`} label="Adresse · nach dem ersten Speichern fest" hint="Kleinbuchstaben, Ziffern und Bindestriche.">
                        <input
                            id={`${id}-slug`}
                            maxLength={60}
                            placeholder={slugify(value.title, new Set())}
                            value={value.slug ?? ""}
                            onChange={(event) => {
                                const { slug: _slug, ...rest } = value;

                                set(event.target.value ? { ...rest, slug: event.target.value } : rest, "slug");
                            }}
                        />
                    </Field>
                )}
                <Field id={`${id}-summary`} label="Kurztext" hint="Steht in der Liste, auf der Startseite und beim Teilen." counter={{ value: value.summary.length, max: NEWS_LIMITS.summary }}>
                    <textarea id={`${id}-summary`} rows={3} maxLength={NEWS_LIMITS.summary} value={value.summary} onChange={(event) => patch({ summary: event.target.value }, "summary")} />
                </Field>
            </InspectorGroup>

            <InspectorGroup title="Art und Verknüpfung">
                <Field id={`${id}-category`} label="Kategorie">
                    <select id={`${id}-category`} value={value.category} onChange={(event) => patch({ category: event.target.value as IPostInput["category"] })}>
                        {NEWS_CATEGORIES.map((category) => (
                            <option key={category} value={category}>
                                {CATEGORY_LABELS[category]}
                            </option>
                        ))}
                    </select>
                </Field>
                <Field id={`${id}-entry`} label="Partner oder Sponsor · freiwillig" hint="Der Beitrag steht dann auch auf seiner Seite.">
                    <select id={`${id}-entry`} value={value.entryId ?? ""} onChange={(event) => patch({ entryId: event.target.value ? Number(event.target.value) : null })}>
                        <option value="">Keiner</option>
                        {linkable.map((entry) => (
                            <option key={entry.id} value={entry.id}>
                                {entry.name}
                            </option>
                        ))}
                    </select>
                </Field>
            </InspectorGroup>

            <InspectorGroup title="Titelbild">
                <MediaPicker label="Titelbild · freiwillig" value={value.cover} onChange={(cover) => patch({ cover })} />
            </InspectorGroup>

            {value.kind === "termin" && value.event && (
                <InspectorGroup title="Termin">
                    <Moment id={`${id}-start`} label="Beginn" value={value.event.startsAt} onChange={(startsAt) => startsAt && patch({ event: { ...value.event!, startsAt } })} />
                    <Moment id={`${id}-end`} label="Ende · freiwillig" value={value.event.endsAt} optional onChange={(endsAt) => patch({ event: { ...value.event!, endsAt } })} />
                    <Field id={`${id}-place`} label="Ort · freiwillig">
                        <input id={`${id}-place`} maxLength={80} placeholder="Discord, Bühne 1" value={value.event.place ?? ""} onChange={(event) => patch({ event: { ...value.event!, place: event.target.value || null } }, "place")} />
                    </Field>
                    <p className={styles.muted}>Zeiten gelten in Berlin.</p>
                </InspectorGroup>
            )}

            <InspectorGroup title="Veröffentlichen">
                <Segmented
                    name={`${id}-status`}
                    legend="Stand"
                    options={[
                        { value: "draft", label: "Entwurf" },
                        { value: "published", label: "Sofort" },
                        { value: "scheduled", label: "Geplant" },
                    ]}
                    value={value.status}
                    onChange={(status: PostState) => patch({ status, publishAt: status === "scheduled" ? (value.publishAt ?? tomorrowSix()) : null })}
                />
                {value.status === "scheduled" && <Moment id={`${id}-publish`} label="Erscheint am" value={value.publishAt} onChange={(publishAt) => publishAt && patch({ publishAt })} />}
                {saved?.status === "published" && saved.publishedAt && <p className={styles.muted}>Veröffentlicht am {at(saved.publishedAt)}.</p>}
                <Segmented
                    name={`${id}-pin`}
                    legend="Oben anheften"
                    options={[
                        { value: "none", label: "Aus" },
                        { value: "big", label: "Groß" },
                        { value: "small", label: "Klein" },
                    ]}
                    value={value.pinned}
                    onChange={(pinned: PinState) => patch({ pinned })}
                />
                <Switch
                    checked={value.announce}
                    disabled={!channel || announced !== null}
                    label="In Discord ankündigen"
                    hint={announced ? `Angekündigt am ${at(announced)}. Das geht nur einmal.` : channel ? "Beim Veröffentlichen, genau einmal." : "Erst einen Kanal auf der Seite News wählen."}
                    onChange={(announce) => patch({ announce })}
                />
            </InspectorGroup>
        </>
    );
}
