import { useEffect, useRef, useState, type JSX } from "react";
import type { IMaintenance } from "../../shared/api";
import { REASON_MAX, whenText, type IMaintenanceState, type MaintenanceArea } from "../../shared/maintenance";
import { api } from "../api/client";
import { useApi } from "../api/useApi";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Field } from "../components/Field";
import { PageHeader } from "../components/PageHeader";
import { Panel } from "../components/Panel";
import { Failure, Loading } from "../components/Status";
import { formatDateTime, fromLocalInput, toLocalInput } from "../format";
import { quickEnd, rowLine, withEnd } from "../maintenance/format";
import { useToast } from "../toast/context";
import { useTitle } from "../useTitle";
import styles from "./dev.module.scss";

const AREAS: readonly { readonly area: MaintenanceArea; readonly name: string; readonly effect: string }[] = [
    { area: "website", name: "Webseite", effect: "Wer nexus-emb.de öffnet, sieht nur noch die Wartung. Kontaktformular und Shop nehmen nichts an, Impressum, Datenschutz, AGB und Widerruf bleiben erreichbar." },
    {
        area: "dashboard",
        name: "Bot-Dashboard",
        effect: "Das Bot-Dashboard zeigt die Wartungsseite. Administrator und Developer kommen weiter herein. Der Bot selbst läuft weiter, Bilder für Discord und die API auch.",
    },
];

const QUICK: readonly { readonly label: string; readonly minutes: number | null }[] = [
    { label: "in 30 Min.", minutes: 30 },
    { label: "in 1 Std.", minutes: 60 },
    { label: "in 2 Std.", minutes: 120 },
    { label: "ohne Endzeit", minutes: null },
];

interface IDraft {
    readonly area: MaintenanceArea;
    readonly editing: boolean;
    readonly reason: string;
    /** ISO, undefined: ohne Endzeit. */
    readonly endsAt: string | undefined;
    readonly autoEnd: boolean;
}

/** Was auf der Wartungsseite unter dem Titel steht, wie auf der Webseite. */
function etaLine(endsAt: string | undefined, now: Date): string {
    return endsAt ? `Voraussichtlich zurück ${whenText(endsAt, now)}` : "Wie lange es dauert, steht noch nicht fest.";
}

/** Die Zeit für Zeile und Vorschau, alle 30 Sekunden neu: „in 1 Std. 30 Min.“ soll nicht stehen bleiben. */
function useNow(interval: number): number {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), interval);

        return () => window.clearInterval(timer);
    }, [interval]);

    return now;
}

function draftOf(area: MaintenanceArea, running: IMaintenanceState | null): IDraft {
    return running
        ? { area, editing: true, reason: running.reason ?? "", endsAt: running.endsAt ?? undefined, autoEnd: running.autoEnd }
        : { area, editing: false, reason: "", endsAt: undefined, autoEnd: true };
}

/**
 * Der echte Wartungsbildschirm der Webseite als Vorschau: /vorschau/wartung im
 * iframe. Die Seite meldet „bereit“, danach bekommt sie die Werte per
 * postMessage, wie die Vorschau im Modul-Editor. Aus der Adresse liest sie nichts.
 */
function MaintenancePreview({ state }: { readonly state: { readonly reason: string | null; readonly startedAt: string; readonly endsAt: string | null; readonly autoEnd: boolean } }): JSX.Element {
    const target = useApi<{ readonly url: string; readonly origin: string }>("/api/content/vorschau");
    const frame = useRef<HTMLIFrameElement>(null);
    const [ready, setReady] = useState(0);
    const origin = target.data?.origin ?? null;
    const key = JSON.stringify({ type: "rlnexus:wartung", state });

    useEffect(() => {
        if (origin === null) return;

        function receive(event: MessageEvent): void {
            if (event.origin === origin && (event.data as { type?: unknown } | null)?.type === "rlnexus:vorschau-bereit") setReady((count) => count + 1);
        }

        window.addEventListener("message", receive);

        return () => window.removeEventListener("message", receive);
    }, [origin]);

    useEffect(() => {
        if (ready === 0 || origin === null) return;

        frame.current?.contentWindow?.postMessage(JSON.parse(key), origin);
    }, [key, ready, origin]);

    if (!target.data) return <p className={styles.hint}>Die Vorschau lädt.</p>;

    return <iframe ref={frame} src={`${target.data.url}/wartung`} title="Vorschau der Wartung auf der Webseite" referrerPolicy="no-referrer" loading="lazy" className={styles.preview} />;
}

export function MaintenancePage(): JSX.Element {
    useTitle("Wartung");

    const notify = useToast();
    const { data, error, reload } = useApi<IMaintenance>("/api/maintenance");
    const [draft, setDraft] = useState<IDraft | null>(null);
    const [busy, setBusy] = useState<MaintenanceArea | null>(null);
    const [problem, setProblem] = useState<{ readonly field: "reason" | "end"; readonly text: string } | null>(null);
    const now = new Date(useNow(30_000));

    function open(area: MaintenanceArea): void {
        setProblem(null);
        setDraft(draftOf(area, data?.[area] ?? null));
    }

    async function save(area: MaintenanceArea, body: Record<string, unknown>, done: string): Promise<void> {
        setBusy(area);
        setProblem(null);

        try {
            await api("/api/maintenance", { method: "PUT", body: { area, ...body } });
            notify(done);
            setDraft(null);
            reload();
        } catch (failure) {
            const text = failure instanceof Error ? failure.message : String(failure);

            // Ablehnungen zu einem Feld stehen am Feld, alles andere als Hinweis.
            if (/Grund/.test(text)) setProblem({ field: "reason", text });
            else if (/Endzeit/.test(text)) setProblem({ field: "end", text });
            else notify(text, "danger");
        } finally {
            setBusy(null);
        }
    }

    const named = AREAS.find((entry) => entry.area === draft?.area);
    const preview = draft?.area === "website" ? draft : data?.website ? draftOf("website", data.website) : null;

    return (
        <>
            <PageHeader title="Wartung" meta="Webseite und Bot-Dashboard lesen den Schalter selbst. Es wirkt sofort, ohne Neustart." />

            {error && !data ? (
                <Failure message={error.message} onRetry={reload} />
            ) : !data ? (
                <Loading label="Wartung wird geladen" />
            ) : (
                <div className={styles.switches}>
                    {AREAS.map(({ area, name, effect }) => {
                        const running = data[area];

                        return (
                            <Panel key={area} className={styles.switchRow}>
                                <div className={styles.switchText}>
                                    <h2 className={styles.switchName}>{name}</h2>
                                    <p>{effect}</p>
                                    <p className={styles.switchState}>
                                        <Badge tone={running ? "warn" : "ok"}>{running ? "Wartung" : "Normal"}</Badge>
                                        {running && <span>{`An seit ${formatDateTime(running.startedAt)}${running.startedBy ? `, von ${running.startedBy}` : ""}`}</span>}
                                    </p>
                                    {running && <p className={styles.maintenanceLine}>{rowLine(running, now)}</p>}
                                    {running?.reason && <blockquote className={styles.maintenanceReason}>„{running.reason}“</blockquote>}
                                </div>
                                <div className={styles.maintenanceActions}>
                                    {running ? (
                                        <>
                                            <Button disabled={busy !== null} onClick={() => open(area)}>
                                                Ändern
                                            </Button>
                                            <Button icon="power" busy={busy === area} onClick={() => void save(area, { on: false }, `${name}: wieder normal erreichbar.`)}>
                                                Wartung beenden
                                            </Button>
                                        </>
                                    ) : (
                                        <Button variant="danger" icon="wrench" disabled={busy !== null} onClick={() => open(area)}>
                                            Wartung einschalten
                                        </Button>
                                    )}
                                </div>
                            </Panel>
                        );
                    })}
                </div>
            )}

            <section className={styles.section} aria-labelledby="wartung-vorschau">
                <h2 id="wartung-vorschau" className={styles.heading}>
                    So sieht die Wartung auf der Webseite aus
                </h2>
                <MaintenancePreview
                    state={{
                        reason: preview?.reason.trim() || null,
                        startedAt: data?.website?.startedAt ?? now.toISOString(),
                        endsAt: preview?.endsAt ?? null,
                        autoEnd: preview?.autoEnd ?? false,
                    }}
                />
            </section>

            <ConfirmDialog
                open={draft !== null}
                title={`${named?.name ?? ""}: Wartung ${draft?.editing ? "ändern" : "einschalten"}?`}
                confirmLabel={draft?.editing ? "Speichern" : "Einschalten"}
                tone={draft?.editing ? "primary" : "danger"}
                busy={busy !== null}
                onConfirm={() => {
                    if (!draft) return;

                    const body = { on: true, reason: draft.reason.trim() || null, endsAt: draft.endsAt ?? null, autoEnd: draft.endsAt !== undefined && draft.autoEnd };

                    void save(draft.area, body, draft.editing ? `${named?.name}: Wartung geändert.` : `${named?.name}: Wartung ist an.`);
                }}
                onCancel={() => setDraft(null)}
            >
                {draft && (
                    <div className={styles.maintenanceForm}>
                        <p>{named?.effect}</p>
                        <Field
                            id="wartung-grund"
                            label="Grund (freiwillig)"
                            hint="Steht so auf der Wartungsseite. Ein Satz reicht."
                            error={problem?.field === "reason" ? problem.text : undefined}
                            counter={{ value: draft.reason.length, max: REASON_MAX }}
                        >
                            <textarea
                                id="wartung-grund"
                                rows={3}
                                maxLength={REASON_MAX}
                                value={draft.reason}
                                placeholder="Wir spielen ein Update ein."
                                aria-describedby={problem?.field === "reason" ? "wartung-grund-error" : "wartung-grund-hint"}
                                onChange={(event) => setDraft({ ...draft, reason: event.target.value })}
                            />
                        </Field>
                        <Field
                            id="wartung-ende"
                            label="Voraussichtlich zurück (freiwillig)"
                            hint="Auf der Seite steht nur die Uhrzeit, bei einem anderen Tag auch das Datum."
                            error={problem?.field === "end" ? problem.text : undefined}
                        >
                            <div className={styles.maintenanceQuick} role="group" aria-label="Schnellwahl für das Ende">
                                {QUICK.map(({ label, minutes }) => (
                                    <Button
                                        key={label}
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => setDraft({ ...draft, endsAt: minutes === null ? undefined : quickEnd(minutes, new Date()), autoEnd: minutes === null ? draft.autoEnd : true })}
                                    >
                                        {label}
                                    </Button>
                                ))}
                            </div>
                            <input
                                id="wartung-ende"
                                type="datetime-local"
                                value={toLocalInput(draft.endsAt)}
                                aria-describedby={problem?.field === "end" ? "wartung-ende-error" : "wartung-ende-hint"}
                                onChange={(event) => setDraft(withEnd(draft, fromLocalInput(event.target.value)))}
                            />
                        </Field>
                        <label className={styles.maintenanceCheck}>
                            <input
                                type="checkbox"
                                checked={draft.endsAt !== undefined && draft.autoEnd}
                                disabled={draft.endsAt === undefined}
                                onChange={(event) => setDraft({ ...draft, autoEnd: event.target.checked })}
                            />
                            <span>
                                Zur Endzeit automatisch beenden
                                <small>Ohne Haken bleibt die Wartung an, bis du sie selbst beendest. Nach der Endzeit steht dann „Es dauert etwas länger als geplant.“</small>
                            </span>
                        </label>
                        <div className={styles.maintenanceSays} aria-live="polite">
                            <small>So steht es auf der Seite</small>
                            <b>{draft.reason.trim() || "Wir arbeiten gerade am System."}</b>
                            <span>{etaLine(draft.endsAt, now)}</span>
                        </div>
                    </div>
                )}
            </ConfirmDialog>
        </>
    );
}
