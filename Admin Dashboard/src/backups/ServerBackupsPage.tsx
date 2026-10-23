import { useState, type FormEvent, type JSX } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AREAS, BACKUP_NOTE_MAX, type IBackupDetail, type IBackupMeta, type IGuildBackups } from "../../shared/backups";
import { api } from "../api/client";
import { useLive } from "../api/live";
import { useApi } from "../api/useApi";
import { Badge, type BadgeTone } from "../components/Badge";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Field } from "../components/Field";
import { Icon } from "../components/Icon";
import { PageHeader } from "../components/PageHeader";
import { Panel } from "../components/Panel";
import { Failure, Loading } from "../components/Status";
import { formatBytes, formatDateTime, formatNumber } from "../format";
import { useToast } from "../toast/context";
import { useTitle } from "../useTitle";
import { initials, kindLabel, planSentence, timelineLayout } from "./format";
import styles from "./backups.module.scss";

const KIND_TONES: Readonly<Record<IBackupMeta["kind"], BadgeTone>> = { nacht: "ok", vorher: "neutral", hand: "info", plan: "ok" };

function message(reason: unknown): string {
    return reason instanceof Error ? reason.message : String(reason);
}

/** Notiz eintippen, „Sichern“ legt ein Backup von Hand an. */
function HandForm({ guildId, onDone, onCancel }: { readonly guildId: string; readonly onDone: (backup: IBackupMeta) => void; readonly onCancel: () => void }): JSX.Element {
    const notify = useToast();
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);

    async function submit(event: FormEvent): Promise<void> {
        event.preventDefault();
        setBusy(true);
        try {
            onDone(await api<IBackupMeta>(`/api/backups/${guildId}`, { method: "POST", body: { note } }));
        } catch (reason) {
            notify(message(reason), "danger");
        } finally {
            setBusy(false);
        }
    }

    return (
        <Panel cut="sm" className={styles.handForm}>
            <form onSubmit={(event) => void submit(event)}>
                <Field id="backup-notiz" label="Notiz" hint="Freiwillig, etwa warum du sicherst." counter={{ value: note.length, max: BACKUP_NOTE_MAX }}>
                    <input id="backup-notiz" type="text" value={note} maxLength={BACKUP_NOTE_MAX} onChange={(event) => setNote(event.target.value)} placeholder="vor dem Umbau der Rollen" autoFocus />
                </Field>
                <div className={styles.actions}>
                    <Button variant="ghost" onClick={onCancel} disabled={busy}>
                        Abbrechen
                    </Button>
                    <Button type="submit" variant="primary" icon="save" busy={busy}>
                        Sichern
                    </Button>
                </div>
            </form>
        </Panel>
    );
}

/** Die Backups als Punkte: Nächte auf der Linie, von Hand als Fähnchen darüber. */
function Timeline({ backups, chosen, onChoose }: { readonly backups: readonly IBackupMeta[]; readonly chosen: number | null; readonly onChoose: (id: number) => void }): JSX.Element {
    const byId = new Map(backups.map((backup) => [backup.id, backup]));
    const layout = timelineLayout(backups);
    const ends = layout.length > 1 ? [layout[0], layout.at(-1)!] : layout;

    return (
        <Panel className={styles.timelinePanel}>
            <div className={styles.timeline} role="group" aria-label="Backups nach Zeit, ältestes links">
                <span className={styles.axis} aria-hidden="true" />
                {layout.map((point) => {
                    const backup = byId.get(point.id)!;
                    const text = `${formatDateTime(backup.createdAt)} · ${kindLabel(backup)}${backup.note ? ` · ${backup.note}` : ""}`;
                    const classes = [styles.point, styles[point.lane], backup.kind === "vorher" ? styles.before : null, chosen === backup.id ? styles.on : null];

                    return (
                        <button
                            key={point.id}
                            type="button"
                            className={classes.filter(Boolean).join(" ")}
                            style={{ left: `${point.left}%` }}
                            aria-pressed={chosen === backup.id}
                            aria-label={text}
                            title={text}
                            onClick={() => onChoose(backup.id)}
                        />
                    );
                })}
                {ends.map((point, index) => (
                    <span key={point.id} className={[styles.day, ends.length > 1 ? (index === 0 ? styles.dayStart : styles.dayEnd) : null].filter(Boolean).join(" ")} style={{ left: `${point.left}%` }} aria-hidden="true">
                        {formatDateTime(byId.get(point.id)!.createdAt)}
                    </span>
                ))}
            </div>
            <ul className={styles.pointLegend} aria-label="Legende">
                <li>
                    <i className={styles.night} aria-hidden="true" />
                    nachts
                </li>
                <li>
                    <i className={[styles.night, styles.before].join(" ")} aria-hidden="true" />
                    vor dem Zurückladen
                </li>
                <li>
                    <i className={styles.flag} aria-hidden="true" />
                    von Hand
                </li>
            </ul>
        </Panel>
    );
}

/** Was im gewählten Backup steckt, mit Zurückladen und, bei „von Hand“, Löschen. */
function Chosen({ guildId, backup, onDeleted }: { readonly guildId: string; readonly backup: IBackupMeta; readonly onDeleted: () => void }): JSX.Element {
    const notify = useToast();
    const navigate = useNavigate();
    const detail = useApi<IBackupDetail>(`/api/backups/${guildId}/${backup.id}`);
    const [asking, setAsking] = useState(false);
    const [busy, setBusy] = useState(false);

    async function remove(): Promise<void> {
        setBusy(true);
        try {
            await api(`/api/backups/${guildId}/${backup.id}`, { method: "DELETE" });
            notify("Backup gelöscht.");
            setAsking(false);
            onDeleted();
        } catch (reason) {
            notify(message(reason), "danger");
        } finally {
            setBusy(false);
        }
    }

    const tablesOf = (tables: readonly string[]): string =>
        detail.data
            ? tables
                  .filter((table) => (detail.data!.tables[table] ?? 0) > 0)
                  .map((table) => `${table} ${formatNumber(detail.data!.tables[table])}`)
                  .join(" · ")
            : "";

    const group = (members: boolean): JSX.Element => (
        <div>
            <h3 className={styles.label}>{members ? "Daten der Mitglieder" : "Einstellungen und Inhalte"}</h3>
            <ul className={styles.areas}>
                {AREAS.filter((area) => area.members === members).map((area) => (
                    <li key={area.id}>
                        <span className={styles.grow}>
                            {area.label}
                            <small className={styles.faint}>{tablesOf([...area.tables, ...area.children.map((child) => child.table)])}</small>
                        </span>
                        <strong>{formatNumber(backup.counts[area.id] ?? 0)}</strong>
                    </li>
                ))}
            </ul>
        </div>
    );

    return (
        <Panel className={styles.chosen}>
            <div className={styles.chosenHead}>
                <div className={styles.grow}>
                    <p className={styles.label}>Gewähltes Backup</p>
                    <h2 className={styles.chosenTitle}>{formatDateTime(backup.createdAt)}</h2>
                </div>
                <Badge tone={KIND_TONES[backup.kind]}>{kindLabel(backup)}</Badge>
            </div>

            <dl className={styles.facts}>
                <dt>Von</dt>
                <dd>{backup.byName ?? "automatisch"}</dd>
                {backup.note && (
                    <>
                        <dt>Notiz</dt>
                        <dd>{backup.note}</dd>
                    </>
                )}
                <dt>Größe</dt>
                <dd>{formatBytes(backup.bytes)}</dd>
                <dt>Bleibt</dt>
                <dd>{backup.kind === "hand" ? "bis jemand es löscht" : `bis etwa ${formatDateTime(new Date(Date.parse(backup.createdAt) + 72 * 3_600_000).toISOString())}`}</dd>
            </dl>

            <div className={styles.groups}>
                {group(false)}
                {group(true)}
            </div>
            {detail.error && <p className={styles.faint}>Die Tabellen im Einzelnen fehlen gerade: {detail.error.message}</p>}

            <div className={styles.actions}>
                {backup.kind === "hand" && (
                    <Button variant="ghost" icon="trash" onClick={() => setAsking(true)}>
                        Löschen
                    </Button>
                )}
                <Button variant="primary" icon="undo" onClick={() => navigate(`/backups/${guildId}/zurueckladen/${backup.id}`)}>
                    Zurückladen
                </Button>
            </div>

            <ConfirmDialog open={asking} title="Backup löschen?" confirmLabel="Löschen" tone="danger" busy={busy} onConfirm={() => void remove()} onCancel={() => setAsking(false)}>
                <p>
                    Das Backup vom {formatDateTime(backup.createdAt)}
                    {backup.note ? ` („${backup.note}“)` : ""} ist danach weg. Das lässt sich nicht zurücknehmen.
                </p>
            </ConfirmDialog>
        </Panel>
    );
}

export function ServerBackupsPage(): JSX.Element {
    const { guildId = "" } = useParams();
    const notify = useToast();
    const { data, error, reload } = useApi<IGuildBackups>(`/api/backups/${guildId}`);
    const [selected, setSelected] = useState<number | null>(null);
    const [writing, setWriting] = useState(false);
    const [catching, setCatching] = useState(false);

    useLive("backups", reload);
    useTitle(data ? `Backups · ${data.guild.name}` : "Backups");

    const chosen = data?.backups.find((backup) => backup.id === selected) ?? data?.backups[0] ?? null;

    async function catchUp(): Promise<void> {
        setCatching(true);
        try {
            await api(`/api/backups/${guildId}/run`, { method: "POST" });
            notify("Wird nachgeholt. Die Seite zeigt es, sobald es fertig ist.");
        } catch (reason) {
            notify(message(reason), "danger");
        } finally {
            setCatching(false);
        }
    }

    const back = (
        <Link to="/backups" className={styles.back}>
            <Icon name="chevron-left" size={16} />
            Alle Server
        </Link>
    );

    if (error && !data) {
        return (
            <>
                {back}
                <Failure message={error.message} onRetry={reload} />
            </>
        );
    }

    if (!data) return <Loading label="Backups werden geladen" />;

    const { guild, backups } = data;
    const bytes = backups.reduce((sum, backup) => sum + backup.bytes, 0);

    return (
        <>
            {back}
            <div className={styles.head}>
                <span className={[styles.avatar, styles.big].join(" ")} aria-hidden="true">
                    {initials(guild.name)}
                </span>
                <PageHeader title={guild.name} meta={`${backups.length === 1 ? "1 Backup" : `${backups.length} Backups`} · ${formatBytes(bytes)} · automatische bleiben 72 Stunden`}>
                    {!writing && (
                        <Button variant="primary" icon="plus" onClick={() => setWriting(true)}>
                            Jetzt sichern
                        </Button>
                    )}
                </PageHeader>
            </div>

            <p className={[styles.planLine, data.plan.lastError ? styles.meh : null].filter(Boolean).join(" ")}>{planSentence(data.plan)}</p>

            {writing && (
                <HandForm
                    guildId={guildId}
                    onCancel={() => setWriting(false)}
                    onDone={(backup) => {
                        notify("Backup angelegt.");
                        setWriting(false);
                        setSelected(backup.id);
                        reload();
                    }}
                />
            )}

            {!guild.present && (
                <Panel className={styles.notice}>
                    <Badge>Nicht mehr da</Badge>
                    <p>Der Bot ist nicht mehr auf diesem Server. Nachts wird nichts mehr gesichert, die Backups von früher bleiben.</p>
                </Panel>
            )}

            {guild.problem && guild.present && (
                <Panel className={styles.notice} accent="rgb(255 197 61 / 55%)">
                    <Badge tone="warn">Letzte Nacht</Badge>
                    <p>Hat nicht geklappt: {guild.problem}</p>
                    <Button size="sm" variant="primary" icon="refresh" busy={catching} onClick={() => void catchUp()}>
                        Nachholen
                    </Button>
                </Panel>
            )}

            {backups.length === 0 || !chosen ? (
                <p className={styles.dim}>Für diesen Server gibt es noch kein Backup.</p>
            ) : (
                <>
                    <Timeline backups={backups} chosen={chosen.id} onChoose={setSelected} />
                    <Chosen key={chosen.id} guildId={guildId} backup={chosen} onDeleted={() => {
                            setSelected(null);
                            reload();
                        }}
                    />
                </>
            )}
        </>
    );
}
