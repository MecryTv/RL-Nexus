import { useState, type JSX } from "react";
import { DELETION_MAX_MS, DELETION_MIN_MS, type IDeletion, type IUserdataProfile } from "../../shared/userdata.ts";
import { api } from "../api/client";
import { useApi } from "../api/useApi";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Field } from "../components/Field";
import { Icon } from "../components/Icon";
import { Segmented } from "../components/Segmented";
import { Failure, Loading } from "../components/Status";
import { formatNumber, toLocalInput } from "../format";
import { useToast } from "../toast/context";
import { QUICK_MINUTES, dueFrom, dueValid, type DueChoice } from "./plan.ts";
import styles from "./userdata.module.scss";

type Mode = `${(typeof QUICK_MINUTES)[number]}` | "eigene" | "zeitpunkt";
type Unit = "minuten" | "stunden" | "tage";

const MODES: readonly { readonly value: Mode; readonly label: string }[] = [
    ...QUICK_MINUTES.map((minutes) => ({ value: `${minutes}` as Mode, label: minutes < 60 ? `${minutes} Min.` : `${minutes / 60} Std.` })),
    { value: "eigene", label: "Eigene Dauer" },
    { value: "zeitpunkt", label: "Zeitpunkt" },
];
const UNITS: readonly { readonly value: Unit; readonly label: string }[] = [
    { value: "minuten", label: "Minuten" },
    { value: "stunden", label: "Stunden" },
    { value: "tage", label: "Tage" },
];
const FINAL = new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

function choiceOf(mode: Mode, amount: string, unit: Unit, at: string): DueChoice {
    if (mode === "eigene") return { kind: "eigene", amount: amount.trim() === "" ? Number.NaN : Number(amount), unit };
    if (mode === "zeitpunkt") return { kind: "zeitpunkt", value: at };

    return { kind: "schnell", minutes: Number(mode) };
}

/** Beim Absenden neu gerechnet: Das Fenster kann eine Weile offen gewesen sein. */
function dueNow(choice: DueChoice): Date | null {
    return dueFrom(choice, Date.now());
}

/**
 * Löschung planen (Entwurf D1): Frist, Grund, was gelöscht wird und was
 * bleibt, die DM als Bild und die ID zur Bestätigung. replace: „Neu planen“
 * nach „Das war ich nicht“, die angehaltene endet dabei still.
 */
export function PlanDialog({
    userId,
    replace = false,
    onClose,
    onPlanned,
}: {
    readonly userId: string;
    readonly replace?: boolean;
    readonly onClose: () => void;
    readonly onPlanned: () => void;
}): JSX.Element {
    const notify = useToast();
    const profile = useApi<IUserdataProfile>(`/api/userdata/${userId}`);
    const [mode, setMode] = useState<Mode>("30");
    const [amount, setAmount] = useState("2");
    const [unit, setUnit] = useState<Unit>("stunden");
    const [at, setAt] = useState("");
    // Die Zeit, von der aus die Frist zählt. Neu bei jeder Änderung, damit die Vorschau nicht bei jedem Rendern neu lädt.
    const [now, setNow] = useState(() => Date.now());
    const [reason, setReason] = useState("");
    const [confirm, setConfirm] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const choice = choiceOf(mode, amount, unit, at);
    const due = dueFrom(choice, now);
    const valid = dueValid(due, now);
    const data = profile.data;
    const name = data?.name ?? userId;
    const areas = data?.areas.filter((area) => area.rows > 0) ?? [];

    const changed = <T,>(set: (value: T) => void) => (value: T) => {
        set(value);
        setNow(Date.now());
    };

    async function plan(): Promise<void> {
        setBusy(true);
        setError(null);

        try {
            const dueAt = dueNow(choice);
            const deletion = await api<IDeletion>(`/api/userdata/${userId}/loeschung`, {
                method: "POST",
                body: { dueAt: dueAt?.toISOString(), reason: reason.trim(), confirm: confirm.trim(), replace },
            });

            notify(deletion.dmState === "nicht_zustellbar" ? `Geplant. Die DM kam bei ${name} nicht an, gelöscht wird trotzdem zur Frist.` : `Geplant. ${name} hat die DM bekommen.`);
            onPlanned();
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : String(failure));
        } finally {
            setBusy(false);
        }
    }

    return (
        <ConfirmDialog
            open
            wide
            title={`${replace ? "Neu planen" : "Löschung planen"} · ${name}`}
            confirmLabel="Planen und DM senden"
            tone="danger"
            busy={busy}
            confirmDisabled={!data || !valid || reason.trim() === "" || confirm.trim() !== userId}
            onConfirm={() => void plan()}
            onCancel={onClose}
        >
            {profile.error && !data ? (
                <Failure message={profile.error.message} onRetry={profile.reload} />
            ) : !data ? (
                <Loading label="Daten werden geladen" />
            ) : (
                <div className={styles.planForm}>
                    <div>
                        <Segmented name="frist" legend="Gelöscht wird in" options={MODES} value={mode} onChange={changed(setMode)} />

                        {mode === "eigene" && (
                            <div className={styles.planRow}>
                                <Field id="frist-zahl" label="Dauer">
                                    <input id="frist-zahl" type="number" min={1} step={1} inputMode="numeric" value={amount} onChange={(event) => changed(setAmount)(event.target.value)} />
                                </Field>
                                <Field id="frist-einheit" label="Einheit">
                                    <select id="frist-einheit" value={unit} onChange={(event) => changed(setUnit)(event.target.value as Unit)}>
                                        {UNITS.map((entry) => (
                                            <option key={entry.value} value={entry.value}>
                                                {entry.label}
                                            </option>
                                        ))}
                                    </select>
                                </Field>
                            </div>
                        )}

                        {mode === "zeitpunkt" && (
                            <div className={styles.planRow}>
                                <Field id="frist-zeit" label="Zeitpunkt">
                                    <input
                                        id="frist-zeit"
                                        type="datetime-local"
                                        value={at}
                                        min={toLocalInput(new Date(now + DELETION_MIN_MS).toISOString())}
                                        max={toLocalInput(new Date(now + DELETION_MAX_MS).toISOString())}
                                        onChange={(event) => changed(setAt)(event.target.value)}
                                    />
                                </Field>
                            </div>
                        )}

                        <p className={valid ? styles.final : styles.hint} aria-live="polite">
                            {valid && due ? `→ endgültig am ${FINAL.format(due)} Uhr` : "Die Frist liegt zwischen 5 Minuten und 30 Tagen."}
                        </p>
                    </div>

                    <Field id="plan-grund" label="Grund (steht im Protokoll und im Beleg an die Person)" counter={{ value: reason.length, max: 200 }}>
                        <input id="plan-grund" type="text" value={reason} maxLength={200} placeholder="etwa: Anfrage per Mail vom 01.11." onChange={(event) => setReason(event.target.value)} />
                    </Field>

                    <div>
                        <p className={styles.planLabel}>Bereiche</p>
                        <ul className={styles.planAreas}>
                            {areas.map((area) => (
                                <li key={area.id}>
                                    <span>{area.label}</span>
                                    <b>{formatNumber(area.rows)}</b>
                                    {area.keep ? (
                                        <span className={styles.stays}>
                                            <Icon name="lock" size={14} /> bleibt
                                        </span>
                                    ) : (
                                        <span className={styles.goes}>wird gelöscht</span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div>
                        <p className={styles.planLabel}>Vorschau der DM</p>
                        {valid && due ? (
                            <img className={styles.preview} src={`/api/userdata/${userId}/vorschau?dueAt=${encodeURIComponent(due.toISOString())}`} alt={`Vorschau: die Ankündigung an ${name} als Bild.`} width={800} />
                        ) : (
                            <p className={styles.hint}>Erst mit einer gültigen Frist.</p>
                        )}
                    </div>

                    <Field id="plan-id" label="Zum Bestätigen die ID eintippen" hint={userId}>
                        <input id="plan-id" type="text" inputMode="numeric" autoComplete="off" value={confirm} onChange={(event) => setConfirm(event.target.value)} />
                    </Field>

                    {error && (
                        <p className={styles.error} role="alert">
                            {error}
                        </p>
                    )}
                </div>
            )}
        </ConfirmDialog>
    );
}
