import { useState, type JSX } from "react";
import { AREA_LABELS, CHANGE_AREAS, CHANGE_KINDS, CHANGELOG_LIMITS, KIND_LABELS, parseWorksChangelog, type ChangeArea, type ChangeKind } from "../../shared/changelog.ts";
import { Button } from "../components/Button";
import { Field } from "../components/Field";
import { draftItem, type IDraft, type IDraftItem } from "./draft.ts";
import styles from "./changelog.module.scss";

/**
 * Formular einer Version (W-0061, Spec „Eine Version schreiben“): Version,
 * Datum, Titel und die Zeilen. „Aus works einfügen“ legt erkannte Zeilen ins
 * Formular, der Rest bleibt im Feld. Gespeichert wird erst über die Seite.
 */

export function VersionEditor({ value, onChange, problem, works: worksOpen }: { readonly value: IDraft; readonly onChange: (value: IDraft) => void; readonly problem: string | null; readonly works: boolean }): JSX.Element {
    const [showWorks, setShowWorks] = useState(worksOpen);
    const [pasted, setPasted] = useState("");
    const [taken, setTaken] = useState<string | null>(null);
    const set = (patch: Partial<IDraft>): void => onChange({ ...value, ...patch });
    const setItem = (index: number, patch: Partial<IDraftItem>): void => set({ items: value.items.map((item, at) => (at === index ? { ...item, ...patch } : item)) });
    const move = (index: number, by: -1 | 1): void => {
        const items = [...value.items];
        const [item] = items.splice(index, 1);

        items.splice(index + by, 0, item!);
        set({ items });
    };
    const full = value.items.length >= CHANGELOG_LIMITS.items;

    function take(): void {
        const { items, rest } = parseWorksChangelog(pasted);
        // Eine leere erste Zeile aus „Neue Version“ macht Platz.
        const kept = value.items.filter((item) => item.text.trim() !== "" || item.task.trim() !== "");
        const room = CHANGELOG_LIMITS.items - kept.length;
        const added = items.slice(0, room).map((item) => draftItem({ ...item, task: item.task ?? "" }));

        set({ items: [...kept, ...added] });
        setPasted(rest);
        setTaken(items.length === 0 ? "Keine Zeile erkannt. Erwartet: ### Neu und darunter - Text (W-0014)." : `${added.length} ${added.length === 1 ? "Zeile" : "Zeilen"} übernommen${items.length > added.length ? `, ${items.length - added.length} passten nicht mehr (höchstens ${CHANGELOG_LIMITS.items})` : ""}.`);
    }

    return (
        <div className={styles.editor}>
            <div className={styles.editorHead}>
                <Field id="cl-version" label="Version" hint="Form 1.4.0">
                    <input id="cl-version" type="text" inputMode="decimal" autoComplete="off" maxLength={11} placeholder="1.4.0" value={value.version} onChange={(event) => set({ version: event.target.value })} />
                </Field>
                <Field id="cl-datum" label="Datum">
                    <input id="cl-datum" type="date" value={value.releasedOn} onChange={(event) => set({ releasedOn: event.target.value })} />
                </Field>
                <Field id="cl-titel" label="Titel" counter={{ value: value.title.length, max: CHANGELOG_LIMITS.title }}>
                    <input id="cl-titel" type="text" maxLength={CHANGELOG_LIMITS.title} placeholder="Einstellungen für alle Module" value={value.title} onChange={(event) => set({ title: event.target.value })} />
                </Field>
            </div>

            <div className={styles.works}>
                <Button variant="ghost" size="sm" icon={showWorks ? "chevron-up" : "chevron-down"} aria-expanded={showWorks} aria-controls="cl-works" onClick={() => setShowWorks(!showWorks)}>
                    Aus works einfügen
                </Button>
                {showWorks && (
                    <div id="cl-works" className={styles.worksBody}>
                        <Field id="cl-works-text" label="Ausgabe von works changelog" hint="Abschnitte ### Neu, ### Verbessert, ### Behoben, ### Sonstiges (wird Intern), Zeilen - Text (W-0014). Was nicht passt, bleibt stehen.">
                            <textarea id="cl-works-text" rows={5} value={pasted} onChange={(event) => setPasted(event.target.value)} />
                        </Field>
                        <div className={styles.worksFoot}>
                            <Button size="sm" icon="plus" disabled={!pasted.trim() || full} onClick={take}>
                                Zeilen übernehmen
                            </Button>
                            {taken && (
                                <span className={styles.dim} role="status">
                                    {taken}
                                </span>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <fieldset className={styles.rows}>
                <legend className={styles.rowsLegend}>
                    Änderungen · {value.items.length} von {CHANGELOG_LIMITS.items}
                </legend>
                {value.items.map((item, index) => (
                    <div key={item.key} className={styles.row}>
                        <input className={styles.rowText} type="text" aria-label={`Text der Zeile ${index + 1}`} maxLength={CHANGELOG_LIMITS.text} placeholder="Was sich geändert hat" value={item.text} onChange={(event) => setItem(index, { text: event.target.value })} />
                        <select aria-label={`Art der Zeile ${index + 1}`} value={item.kind} onChange={(event) => setItem(index, { kind: event.target.value as ChangeKind })}>
                            {CHANGE_KINDS.map((kind) => (
                                <option key={kind} value={kind}>
                                    {KIND_LABELS[kind]}
                                </option>
                            ))}
                        </select>
                        <select aria-label={`Bereich der Zeile ${index + 1}`} value={item.area} onChange={(event) => setItem(index, { area: event.target.value as ChangeArea })}>
                            {CHANGE_AREAS.map((area) => (
                                <option key={area} value={area}>
                                    {AREA_LABELS[area]}
                                </option>
                            ))}
                        </select>
                        <input className={styles.rowTask} type="text" aria-label={`Aufgabe der Zeile ${index + 1}`} maxLength={6} placeholder="W-0014" value={item.task} onChange={(event) => setItem(index, { task: event.target.value })} />
                        <div className={styles.rowTools}>
                            <Button variant="ghost" size="sm" icon="chevron-up" aria-label={`Zeile ${index + 1} nach oben`} disabled={index === 0} onClick={() => move(index, -1)}>
                                <span className="u-sr">Nach oben</span>
                            </Button>
                            <Button variant="ghost" size="sm" icon="chevron-down" aria-label={`Zeile ${index + 1} nach unten`} disabled={index === value.items.length - 1} onClick={() => move(index, 1)}>
                                <span className="u-sr">Nach unten</span>
                            </Button>
                            <Button variant="ghost" size="sm" icon="trash" aria-label={`Zeile ${index + 1} entfernen`} disabled={value.items.length === 1} onClick={() => set({ items: value.items.filter((_, at) => at !== index) })}>
                                <span className="u-sr">Entfernen</span>
                            </Button>
                        </div>
                    </div>
                ))}
                <Button size="sm" icon="plus" disabled={full} onClick={() => set({ items: [...value.items, draftItem()] })}>
                    Zeile
                </Button>
            </fieldset>

            {problem && (
                <p className={styles.problem} role="alert">
                    {problem}
                </p>
            )}
        </div>
    );
}
