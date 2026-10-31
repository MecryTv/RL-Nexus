import { useEffect, useState, type JSX } from "react";
import type { IMaintenanceState, MaintenanceArea } from "../../shared/api";
import { api } from "../api/client";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Panel } from "../components/Panel";
import { useToast } from "../toast/context";
import { Preview } from "./Preview";
import { AREA_NAMES, clock, nextAt, remainingText } from "./time";
import styles from "./maintenance.module.scss";

const RING = 553;

/** Wartung läuft: Fahrplan weiterschalten, Ende verschieben, beenden. */
export function RunningPanel({ state, onChange }: { readonly state: IMaintenanceState; readonly onChange: () => void }): JSX.Element {
    const notify = useToast();
    const [now, setNow] = useState(() => Date.now());
    const [busy, setBusy] = useState<string | null>(null);
    const [time, setTime] = useState("");
    const [asking, setAsking] = useState(false);
    const plan = state.plan;

    // Die Restzeit läuft mit, auch ohne neuen Stand vom Server.
    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 15_000);

        return () => window.clearInterval(timer);
    }, []);

    async function send(key: string, path: string, method: "POST" | "PUT", body: unknown, done?: string): Promise<void> {
        setBusy(key);

        try {
            await api(path, { method, body });
            if (done) notify(done);
            onChange();
        } catch (failure) {
            notify(failure instanceof Error ? failure.message : String(failure), "danger");
        } finally {
            setBusy(null);
            setAsking(false);
        }
    }

    function moveEnd(minutes: number | null, at?: string): void {
        const base = Math.max(plan?.until ? Date.parse(plan.until) : 0, Date.now());
        const until = at ?? (minutes === null ? null : new Date(base + minutes * 60_000).toISOString());

        void send(`until-${minutes ?? at ?? "offen"}`, "/api/maintenance/until", "POST", { until });
    }

    function endAt(): void {
        moveEnd(null, nextAt(time, Date.now()));
    }

    // Auch ein Bereich, der nur noch im Plan steht (Schalter von Hand gelöscht), lässt sich beenden.
    const on = (area: MaintenanceArea): boolean => state[area] !== null || (plan?.areas.includes(area) ?? false);
    const active = (Object.keys(AREA_NAMES) as MaintenanceArea[]).filter(on);
    const current = plan?.current ?? null;
    const next = plan && current !== null ? plan.steps[current + 1] : undefined;
    const late = plan?.until ? Date.parse(plan.until) <= now : false;
    const progress = plan?.until ? Math.min(1, Math.max(0, (now - Date.parse(plan.since)) / Math.max(1, Date.parse(plan.until) - Date.parse(plan.since)))) : 0.2;

    return (
        <div className={styles.layout}>
            <div className={styles.stack}>
                <Panel className={styles.panel}>
                    {plan ? (
                        <>
                            <div className={styles.live}>
                                <svg className={styles.mini} viewBox="0 0 200 200" aria-hidden="true">
                                    <circle cx="100" cy="100" r="88" className={styles.miniTrack} />
                                    <circle cx="100" cy="100" r="88" className={styles.miniArc} strokeDasharray={RING} strokeDashoffset={RING * (1 - progress)} />
                                </svg>
                                <div>
                                    <p className={styles.big}>{late ? "Länger als geplant" : remainingText(plan.until, now)}</p>
                                    <p className={styles.hint}>{plan.until ? `${late ? "geplant war" : "voraussichtlich bis"} ${clock(plan.until)} Uhr` : `offen, seit ${clock(plan.since)} Uhr`}</p>
                                </div>
                            </div>

                            {plan.steps.length > 0 && (
                                <>
                                    <h2 className={styles.legend}>Fahrplan</h2>
                                    <ol className={styles.plan}>
                                        {plan.steps.map((step, index) => {
                                            const phase = current === null || index > current ? "next" : index < current ? "done" : "now";

                                            return (
                                                <li key={index} className={styles[phase]} aria-current={phase === "now" ? "step" : undefined}>
                                                    <span>{step.name}</span>
                                                    <time>{step.startedAt ? `${phase === "now" ? "seit " : ""}${clock(step.startedAt)}` : index === plan.steps.length - 1 && plan.until ? `${clock(plan.until)} geplant` : ""}</time>
                                                </li>
                                            );
                                        })}
                                    </ol>
                                    <div className={styles.row}>
                                        <Button variant="primary" icon="arrow-right" disabled={!next} busy={busy === "next"} onClick={() => void send("next", "/api/maintenance/step", "POST", { direction: "next" })}>
                                            {next ? `Weiter zu „${next.name}“` : "Letzter Schritt"}
                                        </Button>
                                        <Button variant="ghost" icon="undo" disabled={current === null || current === 0} busy={busy === "back"} onClick={() => void send("back", "/api/maintenance/step", "POST", { direction: "back" })}>
                                            Schritt zurück
                                        </Button>
                                    </div>
                                </>
                            )}

                            <h2 className={styles.legend}>Ende</h2>
                            <div className={styles.row}>
                                <Button size="sm" busy={busy === "until-15"} onClick={() => moveEnd(15)}>
                                    +15 Min.
                                </Button>
                                <Button size="sm" busy={busy === "until-30"} onClick={() => moveEnd(30)}>
                                    +30 Min.
                                </Button>
                                <label className={styles.inline}>
                                    <span>um</span>
                                    <input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
                                </label>
                                <Button size="sm" disabled={!time} onClick={endAt}>
                                    Übernehmen
                                </Button>
                                <Button size="sm" variant="ghost" busy={busy === "until-offen"} disabled={plan.until === null} onClick={() => moveEnd(null)}>
                                    offen
                                </Button>
                            </div>
                            <p className={styles.hint}>Die Seite rückt innerhalb von 30 Sekunden nach.</p>
                        </>
                    ) : (
                        <p className={styles.hint}>Die Wartung läuft ohne Fahrplan, der Schalter wurde wohl von Hand gesetzt. Die Seite zeigt „Gleich wieder da.“. Beende sie hier, dann lässt sich eine neue mit Plan starten.</p>
                    )}
                </Panel>

                <Panel className={styles.panel}>
                    {(Object.keys(AREA_NAMES) as MaintenanceArea[]).map((area) => (
                        <div key={area} className={styles.area}>
                            <span>
                                {AREA_NAMES[area]} <Badge tone={on(area) ? "warn" : "ok"}>{on(area) ? "Wartung" : "Normal"}</Badge>
                            </span>
                            {on(area) && (
                                <Button size="sm" icon="power" busy={busy === `end-${area}`} onClick={() => void send(`end-${area}`, "/api/maintenance", "PUT", { [area]: false }, `${AREA_NAMES[area]}: wieder normal erreichbar.`)}>
                                    Beenden
                                </Button>
                            )}
                        </div>
                    ))}
                    <div className={styles.row}>
                        <Button variant="primary" icon="check" disabled={active.length === 0} onClick={() => setAsking(true)}>
                            Alles beenden, wieder online
                        </Button>
                    </div>
                </Panel>
            </div>

            <Preview plan={plan} label="So sieht es gerade aus" />

            <ConfirmDialog
                open={asking}
                title="Wartung beenden?"
                confirmLabel="Beenden"
                busy={busy === "end-all"}
                onConfirm={() => void send("end-all", "/api/maintenance", "PUT", Object.fromEntries(active.map((area) => [area, false])), "Alles wieder online.")}
                onCancel={() => setAsking(false)}
            >
                <p>
                    {active.map((area) => AREA_NAMES[area]).join(" und ")} {active.length === 1 ? "ist" : "sind"} sofort wieder erreichbar. Offene Wartungsseiten laden sich innerhalb von 30 Sekunden neu.
                </p>
            </ConfirmDialog>
        </div>
    );
}
