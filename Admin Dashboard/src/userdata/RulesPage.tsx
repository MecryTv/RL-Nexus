import { useState, type JSX } from "react";
import {
    USERDATA_AREAS,
    USERDATA_BASES,
    USERDATA_BASIS,
    USERDATA_DEFAULTS,
    USERDATA_LAW_MAX,
    USERDATA_NOTE_MAX,
    USERDATA_OPEN_NOTE,
    basisText,
    type IUserdataRuleView,
    type UserdataArea,
    type UserdataBasis,
} from "../../shared/userdata.ts";
import { api } from "../api/client";
import { useApi } from "../api/useApi";
import { Button } from "../components/Button";
import { Field } from "../components/Field";
import { Icon } from "../components/Icon";
import { PageHeader } from "../components/PageHeader";
import { Failure, Loading } from "../components/Status";
import { Switch } from "../components/Switch";
import { UnsavedGuard } from "../editor/UnsavedGuard";
import { formatNumber } from "../format";
import { useToast } from "../toast/context";
import { useTitle } from "../useTitle";
import styles from "./userdata.module.scss";

type Draft = Pick<IUserdataRuleView, "keep" | "note" | "basis" | "law" | "years">;

const AREAS = new Map(USERDATA_AREAS.map((area) => [area.id, area]));
const YEARS = [1, 2, 3, 4, 5, 6, 8, 10, 15, 20, 30];
/** Vorschläge für den Satz, je nach Grundlage. */
const GENERIC: Readonly<Record<UserdataBasis, string>> = {
    pflicht: "Das Gesetz verpflichtet uns, das aufzubewahren.",
    ansprueche: "Wir bewahren das auf, solange sich Ansprüche daraus ergeben können.",
};

function same(a: Draft, b: Draft): boolean {
    return a.keep === b.keep && (a.note ?? "").trim() === (b.note ?? "").trim() && a.basis === b.basis && (a.law ?? "").trim() === (b.law ?? "").trim() && a.years === b.years;
}

/** Was das Speichern verhindert. null: nichts. */
function problem(rule: Draft): string | null {
    if (!rule.keep) return null;
    if (!rule.note?.trim()) return "Satz fehlt";
    if (!rule.basis) return "Rechtsgrundlage fehlt";

    return null;
}

function isOpen(rule: Draft): boolean {
    return rule.keep && (rule.note?.trim() === USERDATA_OPEN_NOTE || !rule.note?.trim() || !rule.basis);
}

/** Ein Bereich, der bei einer Löschung bleibt (W3): was drin ist, Satz mit Vorschlägen, Rechtsgrundlage, Norm, Dauer. */
function KeepCard({ rule, onChange }: { readonly rule: IUserdataRuleView; readonly onChange: (change: Partial<Draft>) => void }): JSX.Element {
    const area = AREAS.get(rule.area);
    const id = `regel-${rule.area}`;
    const note = rule.note ?? "";
    const suggestions = [USERDATA_DEFAULTS[rule.area]?.note, rule.basis ? GENERIC[rule.basis] : null].filter((entry): entry is string => Boolean(entry) && entry !== note.trim());
    const warning = !note.trim()
        ? "Ohne Satz lässt sich nicht speichern. Er steht in der DM und im Beleg."
        : !rule.basis
          ? "Wähl eine Rechtsgrundlage, sie steht im Beleg."
          : note.trim() === USERDATA_OPEN_NOTE
            ? "Solange hier „zu klären“ steht, sieht die Person genau das in der DM."
            : null;

    return (
        <section className={styles.keepCard} aria-labelledby={`${id}-name`}>
            <div className={styles.cardHead}>
                <Icon name={area?.icon ?? "lock"} size={18} />
                <h3 id={`${id}-name`}>{rule.label}</h3>
                <span className={styles.cardCounts}>
                    {formatNumber(rule.people)} {rule.people === 1 ? "Person" : "Personen"} · {formatNumber(rule.rows)} Einträge
                </span>
                <Switch checked label="bleibt" onChange={(on) => !on && onChange({ keep: false })} />
            </div>

            <ul className={styles.inside} aria-label="Was drin ist">
                {area?.inside.map((word) => (
                    <li key={word}>{word}</li>
                ))}
            </ul>

            <div className={styles.keepFields}>
                <div>
                    <Field id={`${id}-satz`} label="Satz in der DM und im Beleg" counter={{ value: note.length, max: USERDATA_NOTE_MAX }}>
                        <textarea id={`${id}-satz`} rows={2} value={note} maxLength={USERDATA_NOTE_MAX} onChange={(event) => onChange({ note: event.target.value })} />
                    </Field>
                    {suggestions.length > 0 && (
                        <div className={styles.suggestions} role="group" aria-label="Vorschläge für den Satz">
                            {suggestions.map((entry) => (
                                <button key={entry} type="button" onClick={() => onChange({ note: entry })}>
                                    {entry}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <div className={styles.keepLaw}>
                    <Field id={`${id}-grund`} label="Rechtsgrundlage" hint={rule.basis ? USERDATA_BASIS[rule.basis].article : "Art. 17 Abs. 3 DSGVO"}>
                        <select id={`${id}-grund`} value={rule.basis ?? ""} onChange={(event) => onChange({ basis: (event.target.value || null) as UserdataBasis | null })}>
                            <option value="">Bitte wählen</option>
                            {USERDATA_BASES.map((basis) => (
                                <option key={basis} value={basis}>
                                    {USERDATA_BASIS[basis].label}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field id={`${id}-norm`} label="Norm (freiwillig)">
                        <input id={`${id}-norm`} type="text" value={rule.law ?? ""} maxLength={USERDATA_LAW_MAX} placeholder="etwa § 147 AO" onChange={(event) => onChange({ law: event.target.value })} />
                    </Field>
                </div>
                <Field id={`${id}-dauer`} label="Wie lange">
                    <select id={`${id}-dauer`} value={rule.years ?? ""} onChange={(event) => onChange({ years: event.target.value ? Number(event.target.value) : null })}>
                        <option value="">offen</option>
                        {YEARS.map((years) => (
                            <option key={years} value={years}>
                                {years} {years === 1 ? "Jahr" : "Jahre"}
                            </option>
                        ))}
                    </select>
                </Field>
            </div>

            {warning && (
                <p className={styles.keepAlert}>
                    <Icon name="alert" size={16} /> {warning}
                </p>
            )}
        </section>
    );
}

/** Ein Bereich, der gelöscht wird: was drin ist, wie viele Personen, Schalter zum Behalten. */
function DeleteCard({ rule, onKeep }: { readonly rule: IUserdataRuleView; readonly onKeep: () => void }): JSX.Element {
    const area = AREAS.get(rule.area);

    return (
        <section className={styles.deleteCard} aria-labelledby={`regel-${rule.area}-name`}>
            <div className={styles.cardHead}>
                <Icon name={area?.icon ?? "trash"} size={18} />
                <h3 id={`regel-${rule.area}-name`}>{rule.label}</h3>
                <Switch checked={false} label="bleibt" onChange={(on) => on && onKeep()} />
            </div>
            <p className={styles.insideText}>{area?.inside.join(", ")}</p>
            <p className={styles.cardFoot}>
                <span className={styles.goes}>wird gelöscht</span>
                <span>
                    {formatNumber(rule.people)} {rule.people === 1 ? "Person" : "Personen"}
                </span>
            </p>
        </section>
    );
}

function RulesEditor({ rules, onSaved }: { readonly rules: readonly IUserdataRuleView[]; readonly onSaved: () => void }): JSX.Element {
    const notify = useToast();
    const [drafts, setDrafts] = useState<Partial<Record<UserdataArea, Draft>>>({});
    const [busy, setBusy] = useState(false);

    const current = rules.map((rule) => ({ ...rule, ...drafts[rule.area] }));
    const changed = current.filter((rule, index) => !same(rule, rules[index]));
    const invalid = current.find((rule) => problem(rule) !== null);
    const kept = current.filter((rule) => rule.keep);
    const deleted = current.filter((rule) => !rule.keep);
    const open = kept.filter(isOpen).length;
    const rowsOf = (list: readonly IUserdataRuleView[]): number => list.reduce((sum, rule) => sum + rule.rows, 0);

    const change = (area: UserdataArea, next: Partial<Draft>): void => {
        setDrafts((before) => {
            const base = before[area] ?? rules.find((rule) => rule.area === area);
            if (!base) return before;

            return { ...before, [area]: { keep: base.keep, note: base.note, basis: base.basis, law: base.law, years: base.years, ...next } };
        });
    };
    const keep = (rule: IUserdataRuleView): void => {
        const fallback = USERDATA_DEFAULTS[rule.area];

        change(rule.area, { keep: true, note: rule.note ?? fallback?.note ?? "", basis: rule.basis ?? fallback?.basis ?? null, law: rule.law ?? fallback?.law ?? null, years: rule.years ?? fallback?.years ?? null });
    };

    async function save(): Promise<void> {
        setBusy(true);

        try {
            await api("/api/userdata/regeln", {
                method: "PUT",
                body: { rules: changed.map((rule) => ({ area: rule.area, keep: rule.keep, note: rule.note?.trim() || null, basis: rule.basis, law: rule.law?.trim() || null, years: rule.years })) },
            });
            notify(changed.length === 1 ? `${changed[0].label} gespeichert.` : `${changed.length} Bereiche gespeichert.`);
            setDrafts({});
            onSaved();
        } catch (error) {
            notify(error instanceof Error ? error.message : String(error), "danger");
        } finally {
            setBusy(false);
        }
    }

    return (
        <>
            <UnsavedGuard dirty={changed.length > 0} />

            <div className={styles.ruleSummary}>
                <div className={styles.summaryGoes}>
                    <span className={styles.planLabel}>Wird gelöscht</span>
                    <b>
                        {deleted.length} {deleted.length === 1 ? "Bereich" : "Bereiche"}
                    </b>
                    <small>{formatNumber(rowsOf(deleted))} Einträge</small>
                </div>
                <div className={styles.summaryStays}>
                    <span className={styles.planLabel}>Bleibt</span>
                    <b>
                        {kept.length} {kept.length === 1 ? "Bereich" : "Bereiche"}
                    </b>
                    <small>{formatNumber(rowsOf(kept))} Einträge</small>
                </div>
                <div className={open > 0 ? styles.summaryOpen : undefined}>
                    <span className={styles.planLabel}>Noch offen</span>
                    <b>{open === 0 ? "Nichts" : `${open} ${open === 1 ? "Bereich" : "Bereiche"}`}</b>
                    <small>{open === 0 ? "Satz und Grundlage überall gesetzt" : "„zu klären“ oder ohne Grundlage"}</small>
                </div>
            </div>

            <div className={styles.rulesLayout}>
                <div>
                    <div className={styles.sect}>
                        <h2>Bleibt bei einer Löschung</h2>
                        <span className={styles.dim}>
                            {kept.length} von {current.length}
                        </span>
                    </div>
                    {kept.length === 0 ? (
                        <p className={styles.empty}>Nichts bleibt: Bei einer Löschung verschwindet alles.</p>
                    ) : (
                        kept.map((rule) => <KeepCard key={rule.area} rule={rule} onChange={(next) => change(rule.area, next)} />)
                    )}

                    <div className={styles.sect}>
                        <h2>Wird gelöscht</h2>
                        <span className={styles.dim}>
                            {deleted.length} von {current.length} · Schalter an heißt: bleibt
                        </span>
                    </div>
                    <div className={styles.deleteGrid}>
                        {deleted.map((rule) => (
                            <DeleteCard key={rule.area} rule={rule} onKeep={() => keep(rule)} />
                        ))}
                    </div>
                </div>

                <aside className={styles.previews} aria-label="Vorschau">
                    <div className={styles.previewBox}>
                        <p className={styles.planLabel}>So steht es in der Ankündigung (DM)</p>
                        <div className={styles.dmPreview}>
                            <b>Deine Daten werden gelöscht</b>
                            {kept.length === 0 ? (
                                <p>Ohne „Bleibt“: Es wird alles gelöscht.</p>
                            ) : (
                                <div className={styles.dmKept}>
                                    <span className={styles.planLabel}>
                                        <Icon name="lock" size={12} /> Bleibt
                                    </span>
                                    {kept.map((rule) => (
                                        <p key={rule.area}>
                                            {rule.label}: {rule.note?.trim() || "…"}
                                        </p>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className={styles.previewBox}>
                        <p className={styles.planLabel}>So steht es im Beleg (PDF)</p>
                        <div className={styles.pdfPreview}>
                            {kept.length === 0 ? (
                                <p>Nichts aufbewahrt.</p>
                            ) : (
                                kept.map((rule) => (
                                    <p key={rule.area}>
                                        <b>{rule.label}</b> · {rule.note?.trim() || "…"}
                                        <span className={styles.law}>{basisText(rule)}</span>
                                    </p>
                                ))
                            )}
                        </div>
                    </div>
                </aside>
            </div>

            <div className={styles.saveBar}>
                <p aria-live="polite">
                    {changed.length === 0 ? (
                        "Alles gespeichert."
                    ) : (
                        <>
                            <b>
                                {changed.length} {changed.length === 1 ? "Änderung" : "Änderungen"}
                            </b>{" "}
                            · {changed.map((rule) => rule.label).join(", ")}
                        </>
                    )}
                    {invalid && (
                        <span className={styles.saveProblem}>
                            {" "}
                            · {invalid.label}: {problem(invalid)}
                        </span>
                    )}
                </p>
                <div className={styles.actions}>
                    <Button variant="ghost" onClick={() => setDrafts({})} disabled={changed.length === 0 || busy}>
                        Verwerfen
                    </Button>
                    <Button variant="primary" icon="save" busy={busy} disabled={changed.length === 0 || invalid !== undefined} onClick={() => void save()}>
                        Speichern
                    </Button>
                </div>
            </div>
        </>
    );
}

/** Was bei einer Löschung bleibt (W-0051, Entwurf W3). Vorgaben aus der Datenschutzerklärung, Entscheidung 44 und 45. */
export function RulesPage(): JSX.Element {
    useTitle("Was bleibt");

    const rules = useApi<IUserdataRuleView[]>("/api/userdata/regeln");

    return (
        <>
            <PageHeader title="Was bleibt" />

            {rules.error && !rules.data && <Failure message={rules.error.message} onRetry={rules.reload} />}
            {!rules.data && !rules.error && <Loading label="Regeln werden geladen" />}
            {rules.data && <RulesEditor rules={rules.data} onSaved={rules.reload} />}
        </>
    );
}
