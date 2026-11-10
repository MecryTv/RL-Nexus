import { type JSX, useId } from "react";
import type { IPost } from "../../shared/news";
import {
    ENTRY_COLORS,
    ENTRY_LIMITS,
    LINK_KEYS,
    PARTNER_TYPE_LABELS,
    PARTNER_TYPES,
    SPONSOR_TIERS,
    SUPPORTER_TYPE_LABELS,
    SUPPORTER_TYPES,
    TIER_LABELS,
    type EntryColor,
    type IEntry,
    type IEntryInput,
    type IEntryLinks,
} from "../../shared/partners";
import { Button } from "../components/Button";
import { Field } from "../components/Field";
import { Segmented } from "../components/Segmented";
import { Switch } from "../components/Switch";
import { InspectorGroup } from "../studio/Studio";
import type { IContactInfo } from "./ContactField";
import { COLOR_LABELS } from "./labels.ts";
import styles from "./studio.module.scss";

const LINK_LABELS: Readonly<Record<keyof IEntryLinks, string>> = { website: "Webseite", discord: "Discord-Einladung", x: "X", twitch: "Twitch", youtube: "YouTube", tiktok: "TikTok" };

export interface IEntrySettingsProps {
    readonly value: IEntryInput;
    readonly set: (next: IEntryInput, key?: string) => void;
    readonly entry: IEntry;
    readonly entries: readonly IEntry[];
    readonly posts: readonly IPost[];
    readonly contact: IContactInfo | null;
    readonly onDelete: () => void;
}

/** Acht Farben der Webseite als Knöpfe, für das Fach Stil und den Inspektor. */
export function ColorSwatches({ value, onChange }: { readonly value: EntryColor; readonly onChange: (color: EntryColor) => void }): JSX.Element {
    return (
        <div className={styles.swatches} role="radiogroup" aria-label="Farbe">
            {ENTRY_COLORS.map((color) => (
                <button key={color} type="button" role="radio" aria-checked={value === color} className={styles.swatch} data-color={color} title={COLOR_LABELS[color]} onClick={() => onChange(color)}>
                    <span className="u-sr">{COLOR_LABELS[color]}</span>
                </button>
            ))}
        </div>
    );
}

/** Die Links eines Eintrags, nur https. Wird auch vom Abschnitt „Links“ benutzt. */
export function LinksEditor({ value, onChange }: { readonly value: IEntryLinks; readonly onChange: (links: IEntryLinks, key: string) => void }): JSX.Element {
    const id = useId();

    return (
        <>
            {LINK_KEYS.map((key) => {
                const link = value[key] ?? "";

                return (
                    <Field key={key} id={`${id}-${key}`} label={LINK_LABELS[key]} error={link && !link.startsWith("https://") ? "Links müssen mit https:// beginnen." : undefined}>
                        <input
                            id={`${id}-${key}`}
                            type="url"
                            inputMode="url"
                            placeholder="https://"
                            value={link}
                            onChange={(event) => {
                                const next = { ...value, [key]: event.target.value.trim() };

                                if (!next[key]) delete next[key];
                                onChange(next, `link-${key}`);
                            }}
                        />
                    </Field>
                );
            })}
        </>
    );
}

/**
 * W-0062 Teil 2: Inspektor ohne Auswahl. Partner und Sponsoren (S3): Name, Art
 * bzw. Stufe, Texte, Farbe, Adresse, Links, Server, Sichtbarkeit. Unterstützer
 * (S5): Name, Link, Art mit Untertitel, Leiste, Platz, Zeitraum, Turniere.
 */
export function EntrySettings({ value, set, entry, entries, posts, contact, onDelete }: IEntrySettingsProps): JSX.Element {
    const id = useId();
    const supporter = value.kind === "supporter";
    const patch = (change: Partial<IEntryInput>, key?: string): void => set({ ...value, ...change }, key);
    const supporters = entries.filter((item) => item.kind === "supporter").sort((a, b) => a.position - b.position);
    const place = supporters.findIndex((item) => item.id === entry.id);
    const events = posts.filter((post) => post.kind === "termin");

    return (
        <>
            <InspectorGroup title={supporter ? "Unterstützer" : value.kind === "sponsor" ? "Sponsor" : "Partner"}>
                <Field id={`${id}-name`} label="Name" counter={{ value: value.name.length, max: ENTRY_LIMITS.name }}>
                    <input id={`${id}-name`} value={value.name} maxLength={ENTRY_LIMITS.name} onChange={(event) => patch({ name: event.target.value }, "name")} />
                </Field>
                {value.kind === "partner" && (
                    <Segmented name={`${id}-typ`} legend="Art" options={PARTNER_TYPES.map((item) => ({ value: item, label: PARTNER_TYPE_LABELS[item] }))} value={value.partnerType ?? "organisation"} onChange={(partnerType) => patch({ partnerType })} />
                )}
                {value.kind === "sponsor" && (
                    <Segmented name={`${id}-stufe`} legend="Stufe" options={SPONSOR_TIERS.map((item) => ({ value: item, label: TIER_LABELS[item] }))} value={value.tier ?? "sponsor"} onChange={(tier) => patch({ tier })} />
                )}
                {supporter && (
                    <Segmented name={`${id}-art`} legend="Art" options={SUPPORTER_TYPES.map((item) => ({ value: item, label: SUPPORTER_TYPE_LABELS[item] }))} value={value.supporterType ?? "firma"} onChange={(supporterType) => patch({ supporterType })} />
                )}
                <Field id={`${id}-sub`} label={supporter ? "Untertitel · steht über dem Namen" : "Untertitel oder Branche"} counter={{ value: value.subtitle.length, max: ENTRY_LIMITS.subtitle }}>
                    <input id={`${id}-sub`} value={value.subtitle} maxLength={ENTRY_LIMITS.subtitle} onChange={(event) => patch({ subtitle: event.target.value }, "subtitle")} />
                </Field>
                {supporter && (
                    <Field id={`${id}-strip`} label="In der Leiste · beim Drüberfahren" counter={{ value: (value.stripText ?? "").length, max: ENTRY_LIMITS.stripText }}>
                        <input id={`${id}-strip`} value={value.stripText ?? ""} maxLength={ENTRY_LIMITS.stripText} onChange={(event) => patch({ stripText: event.target.value }, "strip")} />
                    </Field>
                )}
                <Field id={`${id}-short`} label="Kurztext" hint="Steht auf Karten, in der Vorschau beim Teilen und im Fenster." counter={{ value: value.shortText.length, max: ENTRY_LIMITS.shortText }}>
                    <textarea id={`${id}-short`} rows={3} value={value.shortText} maxLength={ENTRY_LIMITS.shortText} onChange={(event) => patch({ shortText: event.target.value }, "short")} />
                </Field>
            </InspectorGroup>

            {!supporter && (
                <InspectorGroup title="Farbe">
                    <ColorSwatches value={value.color} onChange={(color) => patch({ color })} />
                </InspectorGroup>
            )}

            <InspectorGroup title="Adresse">
                <p className={styles.address}>{supporter ? `/partner?unterstuetzer=${entry.slug}` : `/partner/${entry.slug}`}</p>
                <p className={styles.muted}>Die Adresse entsteht beim Anlegen aus dem Namen und bleibt dann, damit geteilte Links nicht brechen.</p>
            </InspectorGroup>

            <InspectorGroup title={supporter ? "Link" : "Links"}>
                {supporter ? (
                    <Field id={`${id}-web`} label="Webseite" error={value.links.website && !value.links.website.startsWith("https://") ? "Links müssen mit https:// beginnen." : undefined}>
                        <input id={`${id}-web`} type="url" placeholder="https://" value={value.links.website ?? ""} onChange={(event) => patch({ links: { ...value.links, website: event.target.value.trim() || undefined } }, "link-website")} />
                    </Field>
                ) : (
                    <LinksEditor value={value.links} onChange={(links, key) => patch({ links }, key)} />
                )}
            </InspectorGroup>

            <InspectorGroup title="Zeitraum">
                <Field id={`${id}-since`} label={supporter ? "Seit" : value.kind === "sponsor" ? "Sponsor seit" : "Partner seit"}>
                    <input id={`${id}-since`} type="date" value={value.since ?? ""} onChange={(event) => patch({ since: event.target.value || null })} />
                </Field>
                {supporter && (
                    <>
                        <Field id={`${id}-end`} label="Ende · freiwillig">
                            <input id={`${id}-end`} type="date" value={value.endsOn ?? ""} onChange={(event) => patch({ endsOn: event.target.value || null })} />
                        </Field>
                        <Switch checked={value.hideAfterEnd} label="Am Ende aus der Leiste nehmen" disabled={!value.endsOn} onChange={(hideAfterEnd) => patch({ hideAfterEnd })} />
                    </>
                )}
            </InspectorGroup>

            {supporter && (
                <InspectorGroup title="In der Leiste">
                    <p className={styles.muted}>{place >= 0 ? `Platz ${place + 1} von ${supporters.length}. Die Reihenfolge änderst du durch Ziehen in der Liste.` : "Der Platz steht nach dem Speichern fest."}</p>
                    <fieldset className={styles.fieldset}>
                        <legend>Unterstützt bei</legend>
                        {events.length === 0 && <p className={styles.muted}>Noch keine Termine in den News.</p>}
                        {events.map((post) => (
                            <label key={post.id} className={styles.check}>
                                <input
                                    type="checkbox"
                                    checked={value.tournamentIds.includes(post.id)}
                                    onChange={(event) => patch({ tournamentIds: event.target.checked ? [...value.tournamentIds, post.id] : value.tournamentIds.filter((item) => item !== post.id) })}
                                />
                                {post.title}
                            </label>
                        ))}
                    </fieldset>
                </InspectorGroup>
            )}

            {!supporter && (
                <InspectorGroup title="Discord-Server">
                    {!value.contactId ? (
                        <p className={styles.muted}>Mit Ansprechpartner (Reiter „Konto, Zugang und Rolle“) wählst du hier seinen Server. Von dort kommen Mitglieder, Module und Teams.</p>
                    ) : (
                        <Field id={`${id}-guild`} label="Server mit RL Nexus" hint="Ohne Server fallen Discord-Kasten, Module und Teams weg.">
                            <select id={`${id}-guild`} value={value.guildId ?? ""} onChange={(event) => patch({ guildId: event.target.value || null })}>
                                <option value="">Keiner</option>
                                {(contact?.servers ?? []).map((server) => (
                                    <option key={server.id} value={server.id}>
                                        {server.name}
                                    </option>
                                ))}
                                {value.guildId && !(contact?.servers ?? []).some((server) => server.id === value.guildId) && <option value={value.guildId}>Server {value.guildId}</option>}
                            </select>
                        </Field>
                    )}
                </InspectorGroup>
            )}

            <InspectorGroup title="Sichtbarkeit">
                <Switch checked={value.visible} label="Auf der Webseite zeigen" onChange={(visible) => patch({ visible })} />
                {!supporter && <Switch checked={value.onHome} label="Auf der Startseite zeigen" hint="Zuerst im Band „Wer dabei ist“." onChange={(onHome) => patch({ onHome })} />}
            </InspectorGroup>

            <InspectorGroup title="Eintrag">
                <Button variant="danger" size="sm" onClick={onDelete}>
                    Eintrag löschen
                </Button>
            </InspectorGroup>
        </>
    );
}
