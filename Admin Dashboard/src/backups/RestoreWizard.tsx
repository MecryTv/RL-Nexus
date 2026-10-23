import { useState, type JSX } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { AREAS, type AreaId, type IBackupMeta, type IBotRestoreReport, type IGuildBackups, type IRestoreResult } from "../../shared/backups";
import { api } from "../api/client";
import { useApi } from "../api/useApi";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Field } from "../components/Field";
import { Icon } from "../components/Icon";
import { Panel } from "../components/Panel";
import { Failure, Loading } from "../components/Status";
import { Switch } from "../components/Switch";
import { formatBytes, formatDateTime, formatNumber } from "../format";
import { useToast } from "../toast/context";
import { useTitle } from "../useTitle";
import { carriedAreas, initials, kindLabel, lossText } from "./format";
import styles from "./backups.module.scss";

type Step = 1 | 2 | 3;

const AREA_LABELS = new Map(AREAS.map((area) => [area.id, area.label]));

function message(reason: unknown): string {
    return reason instanceof Error ? reason.message : String(reason);
}

/** Vorschlag für Schritt 2: was keine Daten der Mitglieder kostet und im Backup nicht leer ist. */
function suggested(backup: IBackupMeta | undefined): Set<AreaId> {
    return new Set(AREAS.filter((area) => !area.members && (backup?.counts[area.id] ?? 0) > 0).map((area) => area.id));
}

function Steps({ step, backup, onStep }: { readonly step: Step; readonly backup: IBackupMeta; readonly onStep: (step: Step) => void }): JSX.Element {
    const items: readonly [Step, string][] = [
        [1, `Backup: ${formatDateTime(backup.createdAt)}`],
        [2, "Was zurückkommt"],
        [3, "Prüfen und los"],
    ];

    return (
        <ol className={styles.steps}>
            {items.map(([value, label]) => {
                const state = value < step ? styles.done : value === step ? styles.now : null;
                const content = (
                    <>
                        <span className={styles.label}>Schritt {value}</span>
                        <b>{label}</b>
                    </>
                );

                return (
                    <li key={value} className={[styles.step, state].filter(Boolean).join(" ")} aria-current={value === step ? "step" : undefined}>
                        {value < step ? (
                            <button type="button" className={styles.stepButton} onClick={() => onStep(value)}>
                                {content}
                            </button>
                        ) : (
                            content
                        )}
                    </li>
                );
            })}
        </ol>
    );
}

function Report({ report }: { readonly report: IBotRestoreReport }): JSX.Element {
    const lines: readonly [string, readonly string[]][] = [
        ["Neu gepostet", report.reposted],
        ["Gelöscht", report.removed],
        ["Probleme", report.problems],
    ];

    if (report.reached && lines.every(([, list]) => list.length === 0)) return <p className={styles.dim}>Alle Panels waren an ihrem Platz.</p>;

    return (
        <dl className={styles.facts}>
            {lines
                .filter(([, list]) => list.length > 0)
                .map(([label, list]) => (
                    <div key={label} className={styles.factRow}>
                        <dt>{label}</dt>
                        <dd className={label === "Probleme" ? styles.meh : undefined}>{list.join(" · ")}</dd>
                    </div>
                ))}
        </dl>
    );
}

function Result({ guildId, result }: { readonly guildId: string; readonly result: IRestoreResult }): JSX.Element {
    const notify = useToast();
    const navigate = useNavigate();
    const [report, setReport] = useState(result.bot);
    const [checking, setChecking] = useState(false);

    async function recheck(): Promise<void> {
        setChecking(true);
        try {
            setReport(await api<IBotRestoreReport>(`/api/backups/${guildId}/panels`, { method: "POST" }));
        } catch (reason) {
            notify(message(reason), "danger");
        } finally {
            setChecking(false);
        }
    }

    return (
        <Panel className={styles.chosen}>
            <div className={styles.chosenHead}>
                <h2 className={[styles.chosenTitle, styles.grow].join(" ")}>Zurückgeladen</h2>
                <Badge tone="ok">Fertig</Badge>
            </div>

            <ul className={styles.areas}>
                {result.areas.map((entry) => (
                    <li key={entry.area}>
                        <span className={styles.grow}>{AREA_LABELS.get(entry.area)}</span>
                        <strong>{formatNumber(entry.rows)} Zeilen</strong>
                    </li>
                ))}
            </ul>

            <div>
                <h3 className={styles.label}>Panels in Discord</h3>
                <Report report={report} />
            </div>

            <p className={styles.dim}>Der Stand davor liegt als Backup bereit. Damit lässt sich das Zurückladen rückgängig machen.</p>

            <div className={styles.actions}>
                <Link to={`/backups/${guildId}`} className={styles.open}>
                    Zur Seite des Servers
                </Link>
                <Button icon="refresh" busy={checking} onClick={() => void recheck()}>
                    Panels jetzt prüfen
                </Button>
                <Button icon="undo" onClick={() => navigate(`/backups/${guildId}/zurueckladen/${result.safetyId}`, { state: { areas: result.areas.map((entry) => entry.area) } })}>
                    Rückgängig machen
                </Button>
            </div>
        </Panel>
    );
}

function Wizard({ guildId, initial, carried }: { readonly guildId: string; readonly initial: number; readonly carried: Set<AreaId> | null }): JSX.Element {
    const { data, error, updatedAt, reload } = useApi<IGuildBackups>(`/api/backups/${guildId}`);
    const [step, setStep] = useState<Step>(1);
    const [backupId, setBackupId] = useState(initial);
    const [areas, setAreas] = useState<Set<AreaId> | null>(carried);
    const [confirm, setConfirm] = useState("");
    const [busy, setBusy] = useState(false);
    const [failure, setFailure] = useState<string | null>(null);
    const [result, setResult] = useState<IRestoreResult | null>(null);

    useTitle(data ? `Zurückladen · ${data.guild.name}` : "Zurückladen");

    if (error && !data) return <Failure message={error.message} onRetry={reload} />;
    if (!data) return <Loading label="Backups werden geladen" />;

    const backup = data.backups.find((entry) => entry.id === backupId);
    if (!backup) return <Failure message="Dieses Backup gibt es nicht mehr. Automatische löschen sich nach 72 Stunden." />;

    const chosen = areas ?? suggested(backup);
    const now = updatedAt ?? 0;
    const matches = confirm.trim().toLowerCase() === backup.guildName.trim().toLowerCase();

    function toggle(area: AreaId, on: boolean): void {
        const next = new Set(chosen);
        if (on) next.add(area);
        else next.delete(area);
        setAreas(next);
    }

    async function restore(): Promise<void> {
        setBusy(true);
        setFailure(null);
        try {
            setResult(await api<IRestoreResult>(`/api/backups/${guildId}/${backupId}/restore`, { method: "POST", body: { areas: AREAS.filter((area) => chosen.has(area.id)).map((area) => area.id), confirm } }));
        } catch (reason) {
            setFailure(message(reason));
        } finally {
            setBusy(false);
        }
    }

    return (
        <>
            <div className={styles.head}>
                <span className={[styles.avatar, styles.big].join(" ")} aria-hidden="true">
                    {initials(data.guild.name)}
                </span>
                <div className={styles.grow}>
                    <h1 className={styles.wizardTitle}>{data.guild.name} zurückladen</h1>
                    <p className={styles.dim}>
                        Backup vom {formatDateTime(backup.createdAt)}, {kindLabel(backup)}
                        {result ? "." : ". Nichts passiert vor dem letzten Klick."}
                    </p>
                </div>
                {!result && (
                    <Link to={`/backups/${guildId}`} className={styles.back}>
                        <Icon name="close" size={16} />
                        Abbrechen
                    </Link>
                )}
            </div>

            {result ? (
                <Result guildId={guildId} result={result} />
            ) : (
                <>
                    <Steps step={step} backup={backup} onStep={setStep} />

                    {step === 1 && (
                        <Panel className={styles.chosen}>
                            <fieldset className={styles.pick}>
                                <legend className={styles.label}>Welches Backup?</legend>
                                {data.backups.map((entry) => (
                                    <label key={entry.id} className={[styles.pickRow, entry.id === backupId ? styles.picked : null].filter(Boolean).join(" ")}>
                                        <input
                                            type="radio"
                                            name="backup"
                                            checked={entry.id === backupId}
                                            onChange={() => {
                                                setBackupId(entry.id);
                                                setAreas(null);
                                            }}
                                        />
                                        <span className={styles.grow}>
                                            <b>{formatDateTime(entry.createdAt)}</b>
                                            <small className={styles.faint}>
                                                {kindLabel(entry)} · {formatBytes(entry.bytes)}
                                                {entry.note ? ` · ${entry.note}` : ""}
                                            </small>
                                        </span>
                                    </label>
                                ))}
                            </fieldset>
                            <div className={styles.actions}>
                                <Button variant="primary" onClick={() => setStep(2)}>
                                    Weiter
                                </Button>
                            </div>
                        </Panel>
                    )}

                    {step === 2 && (
                        <>
                            <div className={styles.listHead}>
                                <h2 className={styles.label}>Was zurückkommen soll</h2>
                                <div className={styles.actions}>
                                    <Button size="sm" variant="ghost" onClick={() => setAreas(new Set(AREAS.map((area) => area.id)))}>
                                        Alle an
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => setAreas(new Set())}>
                                        Alle aus
                                    </Button>
                                </div>
                            </div>
                            <ul className={styles.cards}>
                                {AREAS.map((area) => {
                                    const count = backup.counts[area.id] ?? 0;
                                    const on = chosen.has(area.id);

                                    return (
                                        <Panel as="li" cut="sm" key={area.id} accent={on ? "rgb(255 30 45 / 55%)" : undefined} className={[styles.card, on ? styles.cardOn : null].filter(Boolean).join(" ")}>
                                            <Switch checked={on} label={area.label} onChange={(value) => toggle(area.id, value)} />
                                            <span className={styles.faint}>{count === 0 ? "Im Backup leer: zurückladen löscht, was jetzt da ist." : `${formatNumber(count)} Zeilen`}</span>
                                            {/* Gelb erst, wenn es zählt: eingeschaltet geht verloren, was seither passiert ist. */}
                                            {area.members && (on ? <span className={[styles.meh, styles.small].join(" ")}>Daten der Mitglieder, {lossText(backup.createdAt, now)}</span> : <span className={styles.faint}>Daten der Mitglieder</span>)}
                                        </Panel>
                                    );
                                })}
                            </ul>
                            <Panel cut="sm" className={styles.summary}>
                                <p className={styles.grow}>
                                    <b>
                                        {chosen.size} von {AREAS.length} Bereichen
                                    </b>
                                    <span className={styles.dim}> · Vorher wird der jetzige Stand gesichert, du kannst also zurück.</span>
                                </p>
                                <Button variant="primary" disabled={chosen.size === 0} onClick={() => setStep(3)}>
                                    Weiter zu Schritt 3
                                </Button>
                            </Panel>
                        </>
                    )}

                    {step === 3 && (
                        <Panel className={styles.chosen}>
                            <div>
                                <h2 className={styles.label}>Diese Bereiche kommen zurück</h2>
                                <ul className={styles.areas}>
                                    {AREAS.filter((area) => chosen.has(area.id)).map((area) => (
                                        <li key={area.id}>
                                            <span className={styles.grow}>
                                                {area.label}
                                                {area.members && <small className={styles.meh}>{lossText(backup.createdAt, now)}</small>}
                                            </span>
                                            <strong>{formatNumber(backup.counts[area.id] ?? 0)}</strong>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <p className={styles.dim}>
                                Alles andere bleibt, wie es ist. Vorher sichert das Dashboard den jetzigen Stand als eigenes Backup, damit lässt es sich rückgängig machen. Panels, die
                                fehlen, postet der Bot danach neu.
                            </p>
                            <Field id="restore-name" label="Zum Bestätigen den Namen des Servers eintippen" hint={`„${backup.guildName}“, Groß- und Kleinschreibung egal.`}>
                                <input id="restore-name" type="text" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="off" spellCheck={false} />
                            </Field>
                            {failure && <Failure message={failure} />}
                            <div className={styles.actions}>
                                <Button variant="danger" icon="undo" disabled={!matches} busy={busy} onClick={() => void restore()}>
                                    {busy ? "Wird zurückgeladen …" : "Zurückladen"}
                                </Button>
                            </div>
                        </Panel>
                    )}
                </>
            )}
        </>
    );
}

/** Neue Adresse, neuer Assistent: „Rückgängig machen“ springt mit dem Backup von davor hierher. */
export function RestoreWizard(): JSX.Element {
    const { guildId = "", backupId = "" } = useParams();
    const carried = carriedAreas(useLocation().state);

    return <Wizard key={`${guildId}-${backupId}`} guildId={guildId} initial={Number(backupId)} carried={carried} />;
}
