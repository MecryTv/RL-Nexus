import { useState, type JSX } from "react";
import { USERDATA_NOTE_MAX, type IUserdataRule } from "../../shared/userdata.ts";
import { api } from "../api/client";
import { useApi } from "../api/useApi";
import { Button } from "../components/Button";
import { PageHeader } from "../components/PageHeader";
import { Failure, Loading } from "../components/Status";
import { useToast } from "../toast/context";
import { useTitle } from "../useTitle";
import styles from "./userdata.module.scss";

/** Eine Zeile: löschen oder behalten, beim Behalten der Satz für die DM. */
function RuleRow({ rule, onSaved }: { readonly rule: IUserdataRule; readonly onSaved: () => void }): JSX.Element {
    const notify = useToast();
    const [keep, setKeep] = useState(rule.keep);
    const [note, setNote] = useState(rule.note ?? "");
    const [busy, setBusy] = useState(false);
    const changed = keep !== rule.keep || (keep && note.trim() !== (rule.note ?? ""));

    async function save(): Promise<void> {
        setBusy(true);

        try {
            await api(`/api/userdata/regeln/${rule.area}`, { method: "PUT", body: { keep, note: keep ? note.trim() || null : null } });
            notify(keep ? `${rule.label} bleibt bei einer Löschung.` : `${rule.label} wird bei einer Löschung gelöscht.`);
            onSaved();
        } catch (error) {
            notify(error instanceof Error ? error.message : String(error), "danger");
        } finally {
            setBusy(false);
        }
    }

    return (
        <li className={styles.rule}>
            <span className={styles.ruleName}>{rule.label}</span>
            <div className={styles.toggle} role="group" aria-label={`${rule.label}: bei einer Löschung`}>
                <button type="button" aria-pressed={!keep} onClick={() => setKeep(false)}>
                    löschen
                </button>
                <button type="button" aria-pressed={keep} onClick={() => setKeep(true)}>
                    behalten
                </button>
            </div>
            {keep && (
                <input
                    className={styles.note}
                    type="text"
                    value={note}
                    maxLength={USERDATA_NOTE_MAX}
                    aria-label={`${rule.label}: Satz für die DM`}
                    placeholder="Warum es bleibt, steht so in der DM"
                    onChange={(event) => setNote(event.target.value)}
                />
            )}
            <Button
                className={styles.save}
                size="sm"
                variant={changed ? "primary" : "outline"}
                busy={busy}
                disabled={!changed || (keep && !note.trim())}
                aria-describedby={keep && !note.trim() ? `satz-${rule.area}` : undefined}
                onClick={() => void save()}
            >
                Speichern
            </Button>
            {keep && !note.trim() && (
                <p id={`satz-${rule.area}`} className={styles.hint}>
                    Zum Behalten gehört ein Satz: Er steht in der DM an die Person.
                </p>
            )}
        </li>
    );
}

/** Was bei einer Löschung bleibt (W-0051). Vorgaben bis W-0009: Shop, Moderation und Protokoll „zu klären“. */
export function RulesPage(): JSX.Element {
    useTitle("Was bleibt");

    const rules = useApi<IUserdataRule[]>("/api/userdata/regeln");

    return (
        <>
            <PageHeader title="Was bleibt" />

            {rules.error && !rules.data && <Failure message={rules.error.message} onRetry={rules.reload} />}
            {!rules.data && !rules.error && <Loading label="Regeln werden geladen" />}

            {rules.data && (
                <ul className={styles.rules}>
                    {rules.data.map((rule) => (
                        <RuleRow key={`${rule.area}-${String(rule.keep)}-${rule.note ?? ""}`} rule={rule} onSaved={rules.reload} />
                    ))}
                </ul>
            )}
        </>
    );
}
