import { useState, type JSX, type ReactNode } from "react";
import type { IContentMeta, IEnvelope } from "../../shared/content";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Field } from "../components/Field";
import { Icon } from "../components/Icon";
import { Failure } from "../components/Status";
import { formatDateTime } from "../format";
import { colorValue, iconUrl } from "./iconUrl";
import { moveTo, removeAt, replaceAt } from "./list";
import styles from "./editor.module.scss";

/** Was Leiste und Zurücksetzen von einem Dokument brauchen. Jedes IContentDoc passt, egal welcher Inhalt. */
export interface IDocControls {
    readonly saved: IEnvelope<unknown> | null;
    readonly problem: string | null;
    readonly conflict: boolean;
    readonly dirty: boolean;
    readonly busy: boolean;
    readonly discard: () => void;
    readonly save: () => Promise<boolean>;
    readonly reset: () => Promise<void>;
    readonly reload: () => void;
}

/** Woher der Stand kommt, in einem Satz. */
function savedState(saved: IEnvelope<unknown>): string {
    if (saved.revision === 0 || saved.updatedAt === null) return "Stand der Webseite, hier noch nie gespeichert";

    return `Gespeichert von ${saved.updatedBy ?? "unbekannt"} am ${formatDateTime(saved.updatedAt)}`;
}

/**
 * Die Leiste unten am Editor: bleibt beim Scrollen stehen, damit Speichern
 * auch am Ende eines langen Modultexts erreichbar ist. Was beim Speichern
 * nicht gepasst hat, steht direkt darüber.
 */
export function EditorBar({ doc }: { readonly doc: IDocControls }): JSX.Element | null {
    if (doc.saved === null) return null;

    return (
        <div className={styles.bar}>
            {doc.problem && <Failure message={doc.problem} onRetry={doc.conflict ? doc.reload : undefined} />}
            <div className={styles.barInner}>
                <p className={styles.state} aria-live="polite">
                    {doc.dirty ? <strong>Ungespeicherte Änderungen</strong> : savedState(doc.saved)}
                </p>
                <div className={styles.barActions}>
                    <Button variant="ghost" onClick={doc.discard} disabled={!doc.dirty || doc.busy}>
                        Verwerfen
                    </Button>
                    <Button variant="primary" icon="save" onClick={() => void doc.save()} busy={doc.busy} disabled={!doc.dirty}>
                        Speichern
                    </Button>
                </div>
            </div>
        </div>
    );
}

/** „Auf Stand der Webseite zurücksetzen“ mit Rückfrage. Nur da, wo es etwas zurückzusetzen gibt. */
export function ResetAction({ doc, what }: { readonly doc: IDocControls; readonly what: string }): JSX.Element | null {
    const [asking, setAsking] = useState(false);

    if (doc.saved === null || doc.saved.revision === 0) return null;

    return (
        <>
            <Button variant="ghost" size="sm" icon="refresh" onClick={() => setAsking(true)} disabled={doc.busy}>
                Auf Stand der Webseite zurücksetzen
            </Button>
            <ConfirmDialog
                open={asking}
                title="Auf Stand der Webseite zurücksetzen?"
                confirmLabel="Zurücksetzen"
                tone="danger"
                busy={doc.busy}
                onConfirm={() => void doc.reset().finally(() => setAsking(false))}
                onCancel={() => setAsking(false)}
            >
                <p>
                    {what} aus dem Admin Dashboard wird gelöscht. Danach zeigt die Webseite wieder, was in ihrem Code steht.
                </p>
            </ConfirmDialog>
        </>
    );
}

/** Hoch, runter, entfernen für einen Eintrag einer Liste. */
export function ListControls({
    index,
    count,
    label,
    onMove,
    onRemove,
}: {
    readonly index: number;
    readonly count: number;
    /** Wie der Eintrag heißt, für Bildschirmleser: „Stichpunkt 2“. */
    readonly label: string;
    readonly onMove: (to: number) => void;
    readonly onRemove: () => void;
}): JSX.Element {
    return (
        <div className={styles.controls}>
            <button type="button" className={styles.control} disabled={index === 0} onClick={() => onMove(index - 1)} title="Nach oben">
                <Icon name="chevron-up" size={16} />
                <span className="u-sr">{label} nach oben</span>
            </button>
            <button type="button" className={styles.control} disabled={index === count - 1} onClick={() => onMove(index + 1)} title="Nach unten">
                <Icon name="chevron-down" size={16} />
                <span className="u-sr">{label} nach unten</span>
            </button>
            <button type="button" className={[styles.control, styles.remove].join(" ")} onClick={onRemove} title="Entfernen">
                <Icon name="trash" size={16} />
                <span className="u-sr">{label} entfernen</span>
            </button>
        </div>
    );
}

/** Eine Liste von Texten, etwa Stichpunkte oder Absätze. */
export function TextList({
    legend,
    itemLabel,
    values,
    onChange,
    max,
    maxLength,
    addLabel,
    hint,
    rows,
}: {
    readonly legend: string;
    readonly itemLabel: string;
    readonly values: readonly string[];
    readonly onChange: (values: string[]) => void;
    readonly max: number;
    readonly maxLength: number;
    readonly addLabel: string;
    readonly hint?: string;
    /** Mehrzeilig mit so vielen Zeilen, sonst einzeilig. */
    readonly rows?: number;
}): JSX.Element {
    return (
        <fieldset className={styles.group}>
            <legend className={styles.legend}>{legend}</legend>
            {hint && <p className={styles.hint}>{hint}</p>}
            {values.length > 0 && (
                <ol className={styles.items}>
                    {values.map((value, index) => (
                        <li key={index} className={styles.item}>
                            {rows ? (
                                <textarea
                                    aria-label={`${itemLabel} ${index + 1}`}
                                    rows={rows}
                                    maxLength={maxLength}
                                    value={value}
                                    onChange={(event) => onChange(replaceAt(values, index, event.target.value))}
                                />
                            ) : (
                                <input
                                    type="text"
                                    aria-label={`${itemLabel} ${index + 1}`}
                                    maxLength={maxLength}
                                    value={value}
                                    onChange={(event) => onChange(replaceAt(values, index, event.target.value))}
                                />
                            )}
                            <ListControls
                                index={index}
                                count={values.length}
                                label={`${itemLabel} ${index + 1}`}
                                onMove={(to) => onChange(moveTo(values, index, to))}
                                onRemove={() => onChange(removeAt(values, index))}
                            />
                        </li>
                    ))}
                </ol>
            )}
            <Button size="sm" variant="ghost" icon="plus" disabled={values.length >= max} onClick={() => onChange([...values, ""])}>
                {addLabel}
            </Button>
        </fieldset>
    );
}

/** Eine Liste von Einträgen mit mehreren Feldern, jeder in einem eigenen Kasten mit Hoch, Runter, Entfernen. */
export function ObjectList<T>({
    legend,
    items,
    onChange,
    max,
    create,
    addLabel,
    itemLabel,
    children,
}: {
    readonly legend: string;
    readonly items: readonly T[];
    readonly onChange: (items: T[]) => void;
    readonly max: number;
    /** Ein neuer, leerer Eintrag. */
    readonly create: () => T;
    readonly addLabel: string;
    /** Überschrift des Kastens, auch für Bildschirmleser: „Begriff 2: Offen“. */
    readonly itemLabel: (item: T, index: number) => string;
    readonly children: (item: T, update: (next: T) => void, index: number) => ReactNode;
}): JSX.Element {
    return (
        <fieldset className={styles.group}>
            <legend className={styles.legend}>{legend}</legend>
            {items.length > 0 && (
                <ol className={styles.items}>
                    {items.map((item, index) => (
                        <li key={index} className={styles.entry}>
                            <div className={styles.entryHead}>
                                <span className={styles.entryLabel}>{itemLabel(item, index)}</span>
                                <ListControls
                                    index={index}
                                    count={items.length}
                                    label={itemLabel(item, index)}
                                    onMove={(to) => onChange(moveTo(items, index, to))}
                                    onRemove={() => onChange(removeAt(items, index))}
                                />
                            </div>
                            <div className={styles.entryBody}>{children(item, (next) => onChange(replaceAt(items, index, next)), index)}</div>
                        </li>
                    ))}
                </ol>
            )}
            <Button size="sm" variant="ghost" icon="plus" disabled={items.length >= max} onClick={() => onChange([...items, create()])}>
                {addLabel}
            </Button>
        </fieldset>
    );
}

/** Ein Symbol der Webseite. Natives select, daneben das Symbol, wie die Webseite es zeichnet. */
export function IconPicker({
    id,
    label,
    value,
    meta,
    onChange,
}: {
    readonly id: string;
    readonly label: string;
    readonly value: string;
    readonly meta: IContentMeta;
    readonly onChange: (value: string) => void;
}): JSX.Element {
    const current = meta.icons.find((icon) => icon.name === value);

    return (
        <Field id={id} label={label}>
            <div className={styles.picker}>
                <span className={styles.swatch} aria-hidden="true">
                    {current && <img src={iconUrl(current.svg)} alt="" width={20} height={20} />}
                </span>
                <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
                    {!current && <option value={value}>{value === "" ? "Symbol wählen" : `${value} (unbekannt)`}</option>}
                    {meta.icons.map((icon) => (
                        <option key={icon.name} value={icon.name}>
                            {icon.name}
                        </option>
                    ))}
                </select>
            </div>
        </Field>
    );
}

/** Deutsche Namen der Farben. Was hier fehlt, steht mit seinem Token da. */
const COLOR_NAMES: Readonly<Record<string, string>> = {
    "--c-red": "Rot",
    "--c-red-bright": "Hellrot",
    "--c-blue": "Blau",
    "--c-rank-blue": "Rangblau",
    "--c-purple": "Lila",
    "--c-win": "Grün (Sieg)",
    "--c-loss": "Rot (Niederlage)",
    "--c-text": "Text",
    "--c-text-dim": "Text gedämpft",
    "--c-text-faint": "Text blass",
    "--c-mod-community": "Community",
    "--c-mod-competition": "Wettbewerb",
    "--c-mod-moderation": "Moderation",
    "--c-mod-engagement": "Aktivität",
    "--c-mod-content": "Inhalte",
    "--c-mod-utility": "Werkzeug",
};

/** Flächen und Linien taugen nicht als Akzent. Steht so ein Wert schon im Inhalt, bleibt er wählbar. */
const SURFACES = new Set(["--c-base", "--c-panel", "--c-panel-solid", "--c-panel-fill", "--c-line", "--c-line-strong"]);

/** Eine Farbe der Webseite, mit Farbfeld in ihrem echten Wert. */
export function ColorPicker({
    id,
    label,
    value,
    meta,
    onChange,
}: {
    readonly id: string;
    readonly label: string;
    readonly value: string;
    readonly meta: IContentMeta;
    readonly onChange: (value: string) => void;
}): JSX.Element {
    const options = meta.colors.filter((color) => !SURFACES.has(color.token)).map((color) => `var(${color.token})`);
    const listed = options.includes(value);

    return (
        <Field id={id} label={label}>
            <div className={styles.picker}>
                <span className={styles.swatch} aria-hidden="true">
                    <span className={styles.color} style={{ background: colorValue(value, meta) }} />
                </span>
                <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
                    {!listed && <option value={value}>{value.startsWith("color-mix") ? "Mischfarbe (bleibt)" : value || "Farbe wählen"}</option>}
                    {options.map((option) => {
                        const token = option.slice(4, -1);

                        return (
                            <option key={option} value={option}>
                                {COLOR_NAMES[token] ?? token}
                            </option>
                        );
                    })}
                </select>
            </div>
        </Field>
    );
}
