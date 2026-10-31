import { useEffect, useState, type FormEvent, type JSX } from "react";
import type { IMaintenancePlan, IMaintenanceStart, MaintenanceArea } from "../../shared/api";
import { MAINTENANCE_LIMITS } from "../../shared/limits";
import { api } from "../api/client";
import { Button } from "../components/Button";
import { Field } from "../components/Field";
import { Panel } from "../components/Panel";
import { Segmented } from "../components/Segmented";
import { useToast } from "../toast/context";
import { Preview } from "./Preview";
import { AREA_NAMES, untilOf, type EndChoice } from "./time";
import styles from "./maintenance.module.scss";

const END_OPTIONS: readonly { readonly value: EndChoice; readonly label: string }[] = [
    { value: "15", label: "in 15 Min." },
    { value: "30", label: "in 30 Min." },
    { value: "60", label: "in 1 Std." },
    { value: "120", label: "in 2 Std." },
    { value: "time", label: "um Uhrzeit" },
    { value: "open", label: "offen" },
];

const DEFAULT_TITLE = "Wir bauen um, gleich geht es weiter.";
const DEFAULT_STEPS = ["Backup", "Update", "Test", "Wieder online"];

/** Wartung ist aus: Bereiche, Text, Ende und Fahrplan wählen, rechts die Seite, wie sie gleich aussieht. */
export function PlanForm({ onStarted }: { readonly onStarted: () => void }): JSX.Element {
    const notify = useToast();
    const [areas, setAreas] = useState<readonly MaintenanceArea[]>(["website", "dashboard"]);
    const [title, setTitle] = useState(DEFAULT_TITLE);
    const [text, setText] = useState("");
    const [end, setEnd] = useState<EndChoice>("60");
    const [time, setTime] = useState("");
    const [steps, setSteps] = useState<readonly string[]>(DEFAULT_STEPS);
    const [busy, setBusy] = useState(false);
    // Die Vorschau rechnet ab jetzt. Die Uhr läuft mit, damit „in 1 Std.“ stimmt, wenn das Formular länger offen ist.
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 30_000);

        return () => window.clearInterval(timer);
    }, []);

    const named = steps.map((step) => step.trim()).filter(Boolean);
    const until = end === "time" && !time ? null : untilOf(end, time, now);
    const preview: IMaintenancePlan = {
        areas: areas.length ? areas : ["website"],
        title: title.trim() || DEFAULT_TITLE,
        text: text.trim(),
        since: new Date(now).toISOString(),
        until,
        steps: named.map((name, index) => ({ name, startedAt: index === 0 ? new Date(now).toISOString() : null })),
        current: named.length ? 0 : null,
    };

    function toggleArea(area: MaintenanceArea): void {
        setAreas((current) => (current.includes(area) ? current.filter((entry) => entry !== area) : [...current, area]));
    }

    async function submit(event: FormEvent): Promise<void> {
        event.preventDefault();

        if (end === "time" && !time) {
            notify("Trag die Uhrzeit ein, bis wann es ungefähr dauert.", "danger");
            return;
        }

        const body: IMaintenanceStart = { areas, title: title.trim(), text: text.trim(), until: untilOf(end, time, Date.now()), steps: named };

        setBusy(true);

        try {
            await api("/api/maintenance/start", { method: "POST", body });
            notify(`Wartung läuft: ${areas.map((area) => AREA_NAMES[area]).join(" und ")}.`);
            onStarted();
        } catch (failure) {
            notify(failure instanceof Error ? failure.message : String(failure), "danger");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className={styles.layout}>
            <Panel className={styles.panel}>
                <form className={styles.form} onSubmit={(event) => void submit(event)}>
                    <h2 className={styles.heading}>Wartung planen</h2>

                    <fieldset className={styles.chips}>
                        <legend className={styles.legend}>Wo</legend>
                        {(Object.keys(AREA_NAMES) as MaintenanceArea[]).map((area) => (
                            <label key={area} className={styles.chip}>
                                <input type="checkbox" checked={areas.includes(area)} onChange={() => toggleArea(area)} />
                                <span>{AREA_NAMES[area]}</span>
                            </label>
                        ))}
                    </fieldset>

                    <Field id="wartung-title" label="Überschrift" counter={{ value: title.length, max: MAINTENANCE_LIMITS.title }}>
                        <input id="wartung-title" type="text" value={title} maxLength={MAINTENANCE_LIMITS.title} required onChange={(event) => setTitle(event.target.value)} />
                    </Field>

                    <Field id="wartung-text" label="Zusatz, freiwillig" hint="Etwa: Der Bot in Discord läuft weiter." counter={{ value: text.length, max: MAINTENANCE_LIMITS.text }}>
                        <input id="wartung-text" type="text" value={text} maxLength={MAINTENANCE_LIMITS.text} aria-describedby="wartung-text-hint" onChange={(event) => setText(event.target.value)} />
                    </Field>

                    <div className={styles.group}>
                        <Segmented name="wartung-ende" legend="Voraussichtlich fertig" options={END_OPTIONS} value={end} onChange={setEnd} />
                        {end === "time" && (
                            <label className={styles.inline}>
                                <span>Uhrzeit</span>
                                <input type="time" value={time} required onChange={(event) => setTime(event.target.value)} />
                            </label>
                        )}
                        <p className={styles.hint}>„offen“ zeigt keine Restzeit, nur seit wann die Wartung läuft.</p>
                    </div>

                    <fieldset className={styles.group}>
                        <legend className={styles.legend}>Fahrplan, freiwillig</legend>
                        <ol className={styles.stepEditor}>
                            {steps.map((step, index) => (
                                <li key={index}>
                                    <span className={styles.stepNumber}>{index + 1}</span>
                                    <input
                                        type="text"
                                        value={step}
                                        maxLength={MAINTENANCE_LIMITS.step}
                                        aria-label={`Schritt ${index + 1}`}
                                        onChange={(event) => setSteps(steps.map((entry, at) => (at === index ? event.target.value : entry)))}
                                    />
                                    <Button variant="ghost" size="sm" icon="close" aria-label={`Schritt ${index + 1} entfernen`} onClick={() => setSteps(steps.filter((_, at) => at !== index))}>
                                        <span className={styles.srOnly}>Entfernen</span>
                                    </Button>
                                </li>
                            ))}
                        </ol>
                        <Button variant="outline" size="sm" icon="plus" disabled={steps.length >= MAINTENANCE_LIMITS.steps} onClick={() => setSteps([...steps, ""])}>
                            Schritt
                        </Button>
                        <p className={styles.hint}>Der erste Schritt startet beim Einschalten. Die Uhrzeit eines Schritts steht auf der Seite, sobald er beginnt.</p>
                    </fieldset>

                    <div className={styles.row}>
                        <Button type="submit" variant="danger" icon="wrench" busy={busy} disabled={areas.length === 0 || !title.trim()}>
                            Wartung einschalten
                        </Button>
                        <span className={styles.hint}>Wirkt sofort, ohne Neustart.</span>
                    </div>
                </form>
            </Panel>

            <Preview plan={preview} label="Vorschau" />
        </div>
    );
}
