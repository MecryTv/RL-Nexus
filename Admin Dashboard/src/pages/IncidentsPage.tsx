import { useEffect, useState, type FormEvent, type JSX } from "react";
import {
    INCIDENT_KIND_LABELS,
    INCIDENT_LIMITS,
    INCIDENT_STATE_LABELS,
    INCIDENT_STATES_OF,
    STATUS_SERVICE_LABELS,
    STATUS_SERVICES,
    type DetailRange,
    type IIncident,
    type IIncidentList,
    type IncidentKind,
    type IncidentState,
    type IStatusDetail,
    type StatusService,
} from "../../shared/status";
import { api } from "../api/client";
import { useLive } from "../api/live";
import { useApi } from "../api/useApi";
import { Badge, type BadgeTone } from "../components/Badge";
import { Button, LinkButton } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Field } from "../components/Field";
import { PageHeader } from "../components/PageHeader";
import { Panel } from "../components/Panel";
import { Segmented } from "../components/Segmented";
import { Failure, Loading } from "../components/Status";
import { formatDateTime, formatNumber, fromLocalInput, toLocalInput } from "../format";
import { ago, countdown } from "../status/format";
import { Leitstand } from "../status/Leitstand";
import { useToast } from "../toast/context";
import { useTitle } from "../useTitle";
import styles from "./IncidentsPage.module.scss";

const KIND_OPTIONS = (["stoerung", "wartung"] as const).map((value) => ({ value, label: INCIDENT_KIND_LABELS[value] }));

const STATE_TONES: Readonly<Record<IncidentState, BadgeTone>> = { geplant: "info", untersucht: "warn", erkannt: "warn", beobachtet: "info", geloest: "ok" };

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function servicesText(services: readonly StatusService[]): string {
    return services.map((service) => STATUS_SERVICE_LABELS[service]).join(", ");
}

/** Die Zeile unter dem Titel: „Geprüft vor 38 Sek., nächste Prüfung in 1:22 · 2.871 Prüfungen in 24 Std.“ */
function headline(detail: IStatusDetail | null, now: number): string {
    if (detail === null) return "Eigene Meldungen für die Statusseite und die Statusmeldung in Discord. Ausfälle erkennt das System selbst, alle zwei Minuten.";
    if (detail.checkedAt === null || detail.nextCheckAt === null) return "Noch nicht geprüft. Die erste Prüfung kommt gleich.";

    const next = countdown(detail.nextCheckAt, now);

    return `Geprüft ${ago(detail.checkedAt, now)}, nächste Prüfung ${next === "gleich" ? "gleich" : `in ${next}`} · ${formatNumber(detail.checksDay)} Prüfungen in 24 Std.`;
}

/**
 * Eine neue Meldung. Bei einer Wartung kommen Beginn und Ende dazu, bei einer Störung der Stand.
 * `initialServices`: aus einem laufenden Ausfall im Leitstand, schon angehakt.
 */
function NewIncident({ onDone, initialServices = [] }: { readonly onDone: () => void; readonly initialServices?: readonly StatusService[] }): JSX.Element {
    const notify = useToast();
    const [kind, setKind] = useState<IncidentKind>("stoerung");
    const [title, setTitle] = useState("");
    const [services, setServices] = useState<readonly StatusService[]>(initialServices);

    // Das Formular steht oben, der Knopf im Leitstand weit unten: Der Fokus holt es ins Bild.
    useEffect(() => document.getElementById("meldung-titel")?.focus(), []);
    const [state, setState] = useState<IncidentState>("untersucht");
    const [body, setBody] = useState("");
    const [startsAt, setStartsAt] = useState<string | undefined>(undefined);
    const [endsAt, setEndsAt] = useState<string | undefined>(undefined);
    const [saving, setSaving] = useState(false);

    function toggle(service: StatusService): void {
        setServices((current) => (current.includes(service) ? current.filter((entry) => entry !== service) : [...current, service]));
    }

    async function submit(event: FormEvent): Promise<void> {
        event.preventDefault();
        setSaving(true);

        try {
            await api("/api/status/incidents", {
                method: "POST",
                body: { kind, title, services, body, ...(kind === "stoerung" ? { state } : { startsAt, endsAt }) },
            });
            notify(kind === "stoerung" ? "Die Meldung steht auf der Statusseite und in Discord." : "Die Wartung ist angekündigt.");
            onDone();
        } catch (failure) {
            notify(messageOf(failure), "danger");
        } finally {
            setSaving(false);
        }
    }

    return (
        <Panel className={styles.formPanel}>
            <h2 className={styles.heading}>Neue Meldung</h2>
            <form className={styles.form} onSubmit={(event) => void submit(event)} noValidate>
                <Segmented name="meldung-art" legend="Art" options={KIND_OPTIONS} value={kind} onChange={setKind} />

                <Field id="meldung-titel" label="Titel" hint="Was Nutzer sehen, etwa „Login über Discord hakt“." counter={{ value: title.length, max: INCIDENT_LIMITS.title.max }}>
                    <input id="meldung-titel" type="text" maxLength={INCIDENT_LIMITS.title.max} value={title} onChange={(event) => setTitle(event.target.value)} aria-describedby="meldung-titel-hint" />
                </Field>

                <fieldset className={styles.services}>
                    <legend className={styles.legend}>Betroffen</legend>
                    {STATUS_SERVICES.map((service) => (
                        <label key={service} className={styles.check}>
                            <input type="checkbox" checked={services.includes(service)} onChange={() => toggle(service)} />
                            {STATUS_SERVICE_LABELS[service]}
                        </label>
                    ))}
                </fieldset>

                {kind === "stoerung" ? (
                    <Field id="meldung-stand" label="Stand">
                        <select id="meldung-stand" value={state} onChange={(event) => setState(event.target.value as IncidentState)}>
                            {INCIDENT_STATES_OF.stoerung
                                .filter((entry) => entry !== "geloest")
                                .map((entry) => (
                                    <option key={entry} value={entry}>
                                        {INCIDENT_STATE_LABELS[entry]}
                                    </option>
                                ))}
                        </select>
                    </Field>
                ) : (
                    <div className={styles.row}>
                        <Field id="meldung-beginn" label="Beginn">
                            <input id="meldung-beginn" type="datetime-local" value={toLocalInput(startsAt)} onChange={(event) => setStartsAt(fromLocalInput(event.target.value))} />
                        </Field>
                        <Field id="meldung-ende" label="Ende, etwa">
                            <input id="meldung-ende" type="datetime-local" value={toLocalInput(endsAt)} onChange={(event) => setEndsAt(fromLocalInput(event.target.value))} />
                        </Field>
                    </div>
                )}

                <Field
                    id="meldung-text"
                    label={kind === "stoerung" ? "Erste Nachricht" : "Was passiert"}
                    hint="Ein, zwei Sätze für Nutzer: was los ist, was sie merken."
                    counter={{ value: body.length, max: INCIDENT_LIMITS.body.max }}
                >
                    <textarea id="meldung-text" rows={3} maxLength={INCIDENT_LIMITS.body.max} value={body} onChange={(event) => setBody(event.target.value)} aria-describedby="meldung-text-hint" />
                </Field>

                <div className={styles.actions}>
                    <Button type="submit" variant="primary" icon="send" busy={saving}>
                        {kind === "stoerung" ? "Meldung veröffentlichen" : "Wartung ankündigen"}
                    </Button>
                    <Button variant="ghost" onClick={onDone}>
                        Abbrechen
                    </Button>
                </div>
            </form>
        </Panel>
    );
}

/** Ein Update unter einer offenen Meldung. */
function UpdateForm({ incident, onDone }: { readonly incident: IIncident; readonly onDone: () => void }): JSX.Element {
    const notify = useToast();
    const choices = INCIDENT_STATES_OF[incident.kind];
    const [state, setState] = useState<IncidentState>(incident.kind === "wartung" ? "geloest" : incident.state);
    const [body, setBody] = useState("");
    const [saving, setSaving] = useState(false);
    const idPrefix = `update-${incident.id}`;

    async function submit(event: FormEvent): Promise<void> {
        event.preventDefault();
        setSaving(true);

        try {
            await api(`/api/status/incidents/${incident.id}/updates`, { method: "POST", body: { state, body } });
            notify(state === "geloest" ? "Gelöst. Die Meldung wandert zu den vergangenen." : "Das Update steht auf der Statusseite.");
            onDone();
        } catch (failure) {
            notify(messageOf(failure), "danger");
        } finally {
            setSaving(false);
        }
    }

    return (
        <form className={styles.update} onSubmit={(event) => void submit(event)} noValidate>
            <Field id={`${idPrefix}-stand`} label="Neuer Stand">
                <select id={`${idPrefix}-stand`} value={state} onChange={(event) => setState(event.target.value as IncidentState)}>
                    {choices.map((entry) => (
                        <option key={entry} value={entry}>
                            {INCIDENT_STATE_LABELS[entry]}
                        </option>
                    ))}
                </select>
            </Field>
            <Field id={`${idPrefix}-text`} label="Was es Neues gibt" counter={{ value: body.length, max: INCIDENT_LIMITS.body.max }}>
                <textarea id={`${idPrefix}-text`} rows={2} maxLength={INCIDENT_LIMITS.body.max} value={body} onChange={(event) => setBody(event.target.value)} />
            </Field>
            <div className={styles.actions}>
                <Button type="submit" size="sm" variant="primary" icon="send" busy={saving}>
                    Update veröffentlichen
                </Button>
                <Button size="sm" variant="ghost" onClick={onDone}>
                    Abbrechen
                </Button>
            </div>
        </form>
    );
}

function IncidentCard({ incident, onChanged, onDelete }: { readonly incident: IIncident; readonly onChanged: () => void; readonly onDelete: (incident: IIncident) => void }): JSX.Element {
    const [updating, setUpdating] = useState(false);

    return (
        <article className={[styles.card, incident.kind === "wartung" && styles.planned].filter(Boolean).join(" ")} aria-labelledby={`meldung-${incident.id}`}>
            <header className={styles.cardHead}>
                <div>
                    <p className={styles.kind}>{INCIDENT_KIND_LABELS[incident.kind]}</p>
                    <h3 id={`meldung-${incident.id}`} className={styles.title}>
                        {incident.title}
                    </h3>
                    <p className={styles.meta}>
                        Betrifft {servicesText(incident.services)}
                        {incident.kind === "wartung" && incident.startsAt && incident.endsAt
                            ? ` · ${formatDateTime(incident.startsAt)} bis ${formatDateTime(incident.endsAt)}`
                            : ` · seit ${formatDateTime(incident.createdAt)}`}
                    </p>
                </div>
                <Badge tone={STATE_TONES[incident.state]}>{INCIDENT_STATE_LABELS[incident.state]}</Badge>
            </header>

            <ol className={styles.timeline}>
                {incident.updates.map((update) => (
                    <li key={update.id}>
                        <span className={styles.when}>
                            {formatDateTime(update.createdAt)} · {INCIDENT_STATE_LABELS[update.state]}
                            {update.by && ` · ${update.by}`}
                        </span>
                        <p>{update.body}</p>
                    </li>
                ))}
            </ol>

            {updating ? (
                <UpdateForm
                    incident={incident}
                    onDone={() => {
                        setUpdating(false);
                        onChanged();
                    }}
                />
            ) : (
                <div className={styles.actions}>
                    <Button size="sm" icon="pencil" onClick={() => setUpdating(true)}>
                        {incident.kind === "wartung" ? "Abschließen oder ergänzen" : "Update schreiben"}
                    </Button>
                    <Button size="sm" variant="ghost" icon="trash" onClick={() => onDelete(incident)}>
                        Löschen
                    </Button>
                </div>
            )}
        </article>
    );
}

export function IncidentsPage(): JSX.Element {
    useTitle("Status");

    const notify = useToast();
    const list = useApi<IIncidentList>("/api/status/incidents");
    const [range, setRange] = useState<DetailRange>("24h");
    const detail = useApi<IStatusDetail>(`/api/status/detail?range=${range}`);
    const [now, setNow] = useState(() => Date.now());
    /** null: kein Formular offen. Sonst die vorausgewählten Dienste (leer bei „Neue Meldung“). */
    const [creating, setCreating] = useState<readonly StatusService[] | null>(null);
    const [deleting, setDeleting] = useState<IIncident | null>(null);
    const [busy, setBusy] = useState(false);

    useLive("status", () => {
        list.reload();
        detail.reload();
    });

    // Für „vor 38 Sek.“ und den Countdown bis zur nächsten Prüfung.
    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 1000);

        return () => window.clearInterval(timer);
    }, []);

    async function remove(incident: IIncident): Promise<void> {
        setBusy(true);

        try {
            await api(`/api/status/incidents/${incident.id}`, { method: "DELETE" });
            notify("Die Meldung ist gelöscht.");
            list.reload();
        } catch (failure) {
            notify(messageOf(failure), "danger");
        } finally {
            setBusy(false);
            setDeleting(null);
        }
    }

    const data = list.data;

    return (
        <>
            <PageHeader title="Status" meta={headline(detail.data, now)}>
                {data && (
                    <LinkButton href={data.statusUrl} size="sm" icon="arrow-right">
                        Statusseite
                    </LinkButton>
                )}
                {creating === null && (
                    <Button variant="primary" icon="plus" onClick={() => setCreating([])}>
                        Neue Meldung
                    </Button>
                )}
            </PageHeader>

            {creating !== null && (
                <NewIncident
                    key={creating.join(",")}
                    initialServices={creating}
                    onDone={() => {
                        setCreating(null);
                        list.reload();
                    }}
                />
            )}

            {detail.data ? (
                <Leitstand detail={detail.data} now={now} range={range} onRange={setRange} onReport={setCreating} />
            ) : detail.error ? (
                <Failure message={detail.error.message} onRetry={detail.reload} />
            ) : (
                <Loading label="Leitstand wird geladen" />
            )}

            {list.error && !data ? (
                <Failure message={list.error.message} onRetry={list.reload} />
            ) : !data ? (
                <Loading label="Meldungen werden geladen" />
            ) : (
                <>
                    <section className={styles.section} aria-labelledby="offen">
                        <h2 id="offen" className={styles.heading}>
                            Offen
                        </h2>
                        {data.open.length === 0 ? (
                            <p className={styles.empty}>Keine offene Meldung. Die Statusseite zeigt nur, was die Prüfungen messen.</p>
                        ) : (
                            <div className={styles.cards}>
                                {data.open.map((incident) => (
                                    <IncidentCard key={incident.id} incident={incident} onChanged={list.reload} onDelete={setDeleting} />
                                ))}
                            </div>
                        )}
                    </section>

                    <section className={styles.section} aria-labelledby="vergangen">
                        <h2 id="vergangen" className={styles.heading}>
                            Vergangen
                        </h2>
                        {data.past.length === 0 ? (
                            <p className={styles.empty}>Noch keine abgeschlossene Meldung.</p>
                        ) : (
                            <ul className={styles.past}>
                                {data.past.map((incident) => (
                                    <li key={incident.id}>
                                        <span className={styles.pastTitle} id={`meldung-${incident.id}`}>
                                            {incident.title}
                                            <span className={styles.meta}>
                                                {" "}
                                                · {INCIDENT_KIND_LABELS[incident.kind]} · {servicesText(incident.services)}
                                            </span>
                                        </span>
                                        <span className={styles.meta}>gelöst {incident.resolvedAt ? formatDateTime(incident.resolvedAt) : "–"}</span>
                                        <Button size="sm" variant="ghost" icon="trash" onClick={() => setDeleting(incident)} aria-label={`${incident.title} löschen`}>
                                            Löschen
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                </>
            )}

            <ConfirmDialog
                open={deleting !== null}
                title="Meldung löschen?"
                confirmLabel="Löschen"
                tone="danger"
                busy={busy}
                onConfirm={() => {
                    if (deleting) void remove(deleting);
                }}
                onCancel={() => setDeleting(null)}
            >
                {deleting && <p>„{deleting.title}“ verschwindet samt allen Updates von der Statusseite und aus Discord. Das lässt sich nicht zurücknehmen.</p>}
            </ConfirmDialog>
        </>
    );
}
