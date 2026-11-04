import { type JSX, useState } from "react";
import type { IDumpFile, IDumpProbe, IDumpRun, IDumpsOverview } from "../../shared/dumps";
import { useApi } from "../api/useApi";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { PageHeader } from "../components/PageHeader";
import { Failure, Loading } from "../components/Status";
import { formatBytes, formatDate, formatDateTime, formatNumber } from "../format";
import { useToast } from "../toast/context";
import { useNow } from "../useNow";
import { useTitle } from "../useTitle";
import { DbTabs, Kpis } from "./dbParts";
import { LIVE_EVERY, duration } from "./dbUtil.ts";
import db from "./DatabasePage.module.scss";
import styles from "./DumpsPage.module.scss";

/** So viele Nächte zeigt der Streifen. */
const NIGHTS = 30;

type Night = "probe" | "ok" | "bad" | "none";

const NIGHT_LABELS: Readonly<Record<Night, string>> = { probe: "gesichert, mit Probe", ok: "gesichert", bad: "fehlgeschlagen", none: "keine Sicherung" };

// Ohne Jahr: Alles hier ist höchstens 30 Tage alt, und die Kennzahlen bleiben auch am Handy lesbar.
const SHORT = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const DAY = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short" });
const short = (iso: string): string => SHORT.format(new Date(iso));
const day = (iso: string): string => DAY.format(new Date(iso));

const dayKey = (date: Date): string => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
const ago = (iso: string, now: number): string => duration(Math.max(0, Math.round((now - Date.parse(iso)) / 1000)));
/** Ein nächster Lauf, der schon vorbei ist, sagt nichts: dann keiner. */
const upcoming = (next: string | null, now: number): string | null => (next && Date.parse(next) > now ? next : null);
const rowId = (name: string): string => `sicherung-${name.replace(/[^a-z0-9]/gi, "-")}`;

/** Je Nacht der letzten 30 Tage, älteste zuerst: was der Lauf der Nacht ergab. */
function nightsOf(runs: readonly IDumpRun[], probe: IDumpProbe | null, now: number): { readonly day: Date; readonly state: Night; readonly file: string | null }[] {
    return Array.from({ length: NIGHTS }, (_, index) => {
        const day = new Date(now);
        day.setHours(0, 0, 0, 0);
        day.setDate(day.getDate() - (NIGHTS - 1 - index));

        const ofDay = runs.filter((run) => run.kind === "nacht" && dayKey(new Date(run.at)) === dayKey(day));
        const good = ofDay.find((run) => run.ok);
        const state: Night = good ? (probe?.ok && probe.file === good.file ? "probe" : "ok") : ofDay.length > 0 ? "bad" : "none";

        return { day, state, file: good?.file ?? null };
    });
}

/**
 * Dev → Datenbank, Reiter Sicherungen (W-0067, Entwurf S-A): die nächtliche
 * Sicherung auf dem Server, 30 Tage, mit monatlicher Probe. Nur lesen, dazu
 * Herunterladen mit Bestätigung und Eintrag im Protokoll.
 */
export function DumpsPage(): JSX.Element {
    useTitle("Sicherungen");

    const { data, error, reload, updatedAt } = useApi<IDumpsOverview>("/api/db/dumps", LIVE_EVERY);
    const [picked, setPicked] = useState<IDumpFile | null>(null);

    return (
        <>
            <PageHeader title="Datenbank" />
            <DbTabs dumps={data?.configured ? data.files.length : undefined} dumpsOk={data?.configured ? data.state === "ok" : undefined} updatedAt={updatedAt} />

            {error && !data ? (
                <Failure message={error.message} onRetry={reload} />
            ) : !data ? (
                <Loading label="Sicherungen werden gelesen" />
            ) : !data.configured ? (
                <p className={db.empty}>Auf diesem Server ist die Sicherung nicht eingerichtet: DB_DUMPS_DIR fehlt. Anleitung: Discord Bot/docs/Hosting.md, Abschnitt Sicherungen.</p>
            ) : (
                <Content data={data} onDownload={setPicked} />
            )}

            <DownloadDialog file={picked} onClose={() => setPicked(null)} />
        </>
    );
}

function Content({ data, onDownload }: { readonly data: IDumpsOverview; readonly onDownload: (file: IDumpFile) => void }): JSX.Element {
    const now = useNow(60_000);
    const last = data.runs[0] ?? null;
    const lastOk = data.runs.find((run) => run.ok) ?? null;
    const oldest = data.files.at(-1) ?? null;
    const probe = data.probe;
    const found = probe ? Object.values(probe.tables).reduce((sum, [, count]) => sum + count, 0) : 0;
    const nights = nightsOf(data.runs, probe, now);
    const next = upcoming(data.next, now);

    return (
        <>
            <StateNote data={data} now={now} />

            <Kpis
                items={[
                    {
                        label: "Letzte Sicherung",
                        value: last ? short(last.at) : "noch keine",
                        tone: last ? (last.ok ? "ok" : "bad") : undefined,
                        sub: last ? `${last.ok ? "ok" : "fehlgeschlagen"}${last.seconds === null ? "" : ` · ${duration(last.seconds)}`} · vor ${ago(last.at, now)}` : undefined,
                    },
                    { label: "Nächste", value: next ? short(next) : "–", sub: next ? `in ${duration(Math.round((Date.parse(next) - now) / 1000))}` : "Timer unbekannt" },
                    { label: "Größe", value: lastOk?.bytes ? formatBytes(lastOk.bytes) : "–", sub: "gepackt" },
                    { label: "Aufbewahrt", value: `${formatNumber(data.files.length)} ${data.files.length === 1 ? "Datei" : "Dateien"}`, sub: `${formatBytes(data.totalBytes)}${oldest ? ` · älteste ${day(oldest.at)}` : ""}` },
                    {
                        label: "Letzte Probe",
                        value: probe ? (probe.ok ? "bestanden" : "nicht bestanden") : "noch keine",
                        tone: probe ? (probe.ok ? "ok" : "bad") : undefined,
                        sub: probe ? `${day(probe.at)} · ${formatNumber(found)} Tabellen${probe.seconds === null ? "" : ` · ${duration(probe.seconds)}`}` : "am 1. jedes Monats",
                    },
                    { label: "Freier Platz", value: data.free ? formatBytes(data.free.bytes) : "–", sub: data.free ? `von ${formatBytes(data.free.total)}` : undefined },
                ]}
            />

            <div className={styles.nights}>
                <ol className={styles.row} aria-label={`Die letzten ${NIGHTS} Nächte`}>
                    {nights.map((night) => {
                        const label = `${formatDate(night.day.toISOString())}: ${NIGHT_LABELS[night.state]}`;

                        return (
                            <li key={night.day.toISOString()}>
                                {night.file ? (
                                    <a className={[styles.night, styles[night.state]].join(" ")} href={`#${rowId(night.file)}`} title={label} aria-label={label} />
                                ) : (
                                    <span className={[styles.night, styles[night.state]].join(" ")} title={label} aria-label={label} role="img" />
                                )}
                            </li>
                        );
                    })}
                </ol>
                <p className={styles.ends}>
                    <span>{formatDate(nights[0].day.toISOString())}</span>
                    <span>heute</span>
                </p>
                <p className={db.legend}>
                    <span>
                        <i className={styles.ok} />
                        gesichert
                    </span>
                    <span>
                        <i className={styles.probe} />
                        mit Probe
                    </span>
                    <span>
                        <i className={styles.bad} />
                        fehlgeschlagen
                    </span>
                    <span>
                        <i className={styles.none} />
                        keine Sicherung
                    </span>
                    <span className={db.faintText}>Ein Klick auf eine Nacht springt zur Datei.</span>
                </p>
            </div>

            {/* Untereinander statt nebeneinander: Neben dem Kasten der Probe wäre kein Platz für den Knopf zum Herunterladen. */}
            <div className={styles.stack}>
                <div className={db.frame}>
                    {data.files.length === 0 ? (
                        <p className={styles.emptyText}>Im Ordner liegt noch keine Sicherung.</p>
                    ) : (
                        <table className={db.table}>
                            <thead>
                                <tr>
                                    <th scope="col">Datei</th>
                                    <th scope="col">Art</th>
                                    <th scope="col" className={db.right}>
                                        Größe
                                    </th>
                                    <th scope="col">Prüfsumme</th>
                                    <th scope="col">Wird gelöscht</th>
                                    <th scope="col" aria-label="Herunterladen" />
                                </tr>
                            </thead>
                            <tbody>
                                {data.files.map((file) => (
                                    <tr key={file.name} id={rowId(file.name)}>
                                        <td>
                                            <code>{file.name}</code>
                                        </td>
                                        <td>
                                            <Badge tone={file.kind === "vor-deploy" ? "warn" : "neutral"}>{file.kind === "vor-deploy" ? "vor Deploy" : "Nacht"}</Badge>
                                            {probe?.file === file.name && (
                                                <>
                                                    {" "}
                                                    <Badge tone={probe.ok ? "ok" : "danger"}>Probe</Badge>
                                                </>
                                            )}
                                        </td>
                                        <td className={db.right}>{formatBytes(file.bytes)}</td>
                                        <td className={file.checksum ? db.ok : db.bad}>{file.checksum ? "da" : "fehlt"}</td>
                                        <td>{formatDate(file.deleteAt)}</td>
                                        <td className={db.right}>
                                            <Button size="sm" icon="download" disabled={!file.checksum} onClick={() => onDownload(file)}>
                                                Herunterladen
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                <section className={db.panel} aria-labelledby="letzte-probe">
                    <header className={db.panelHead}>
                        <h2 id="letzte-probe">Letzte Probe</h2>
                        {probe && (
                            <span className={db.faintText}>
                                {formatDateTime(probe.at)}
                                {probe.seconds === null ? "" : `, ${duration(probe.seconds)}`}
                            </span>
                        )}
                    </header>
                    {probe ? <ProbeSteps probe={probe} /> : <p className={styles.emptyText}>Noch keine Probe. Sie läuft am 1. jedes Monats und gleich bei der Einrichtung.</p>}
                </section>
            </div>
        </>
    );
}

function ProbeSteps({ probe }: { readonly probe: IDumpProbe }): JSX.Element {
    const tables = Object.entries(probe.tables);

    return (
        <>
            <ol className={styles.steps}>
                <li>
                    <b>Zweite MariaDB</b> für ein paar Minuten gestartet, eigener Ordner, ohne Netz
                </li>
                <li>
                    <b>Eingespielt:</b> <code>{probe.file ?? "–"}</code>
                </li>
                <li>
                    <b>Gezählt:</b> {tables.length === 0 ? "–" : tables.map(([name, [expected, found]]) => `${name} ${found} von ${expected} Tabellen`).join(", ")}
                    {probe.rows === null ? "" : `, ${formatNumber(probe.rows)} Zeilen`}
                </li>
                <li>
                    <b>Ergebnis:</b> <span className={probe.ok ? db.ok : db.bad}>{probe.ok ? "bestanden" : `nicht bestanden${probe.error ? `: ${probe.error}` : ""}`}</span>
                </li>
            </ol>
            <p className={styles.footnote}>Die echte Datenbank fasst die Probe nie an.</p>
        </>
    );
}

function StateNote({ data, now }: { readonly data: IDumpsOverview; readonly now: number }): JSX.Element | null {
    const last = data.runs[0];
    const lastOk = data.runs.find((run) => run.ok);
    const goodSince = lastOk ? `Die letzte gute ist von ${formatDateTime(lastOk.at)}.` : "Eine gute gibt es noch nicht.";

    switch (data.state) {
        case "failed":
            return (
                <div className={[styles.note, styles.alert].join(" ")} role="alert">
                    <b>Letzte Sicherung fehlgeschlagen: {formatDateTime(last.at)}</b>
                    {last.error && <code>{last.error}</code>}
                    <p>
                        {goodSince} {upcoming(data.next, now) ? `Nächster Versuch: ${formatDateTime(upcoming(data.next, now) ?? "")}.` : ""}
                    </p>
                </div>
            );
        case "stale":
            return (
                <div className={[styles.note, styles.caution].join(" ")} role="status">
                    <b>{lastOk ? `Keine gute Sicherung seit ${formatDateTime(lastOk.at)}` : "Keine gute Sicherung"}</b>
                    <p>Läuft der Timer? Auf dem Server: systemctl list-timers rlnexus-sicherung.timer</p>
                </div>
            );
        case "probe-failed":
            return (
                <div className={[styles.note, styles.caution].join(" ")} role="status">
                    <b>Die letzte Probe ist nicht bestanden</b>
                    {data.probe?.error && <code>{data.probe.error}</code>}
                    <p>Die nächste Nacht probt noch einmal. Bis dahin lieber eine ältere Sicherung als Rückfall im Kopf behalten.</p>
                </div>
            );
        case "never":
            return (
                <div className={[styles.note, styles.caution].join(" ")} role="status">
                    <b>Noch keine Sicherung</b>
                    <p>Ist die Sicherung auf dem Server eingerichtet? sudo bash scripts/sicherung-einrichten.sh im Ordner des Bots.</p>
                </div>
            );
        case "unknown":
            return (
                <div className={[styles.note, styles.caution].join(" ")} role="status">
                    <b>Zustand unbekannt</b>
                    <p>Der Ordner oder status.json lässt sich nicht lesen. Wurde der Container nach der Einrichtung neu angelegt (docker compose -f docker-compose.prod.yml up -d admin)?</p>
                </div>
            );
        default:
            return null;
    }
}

function DownloadDialog({ file, onClose }: { readonly file: IDumpFile | null; readonly onClose: () => void }): JSX.Element {
    const notify = useToast();
    const [agreed, setAgreed] = useState(false);
    const [busy, setBusy] = useState(false);
    const until = file ? formatDate(file.deleteAt) : "";

    const close = (): void => {
        setAgreed(false);
        onClose();
    };

    const download = async (): Promise<void> => {
        if (!file) return;

        setBusy(true);
        try {
            const response = await fetch(`/api/db/dumps/${encodeURIComponent(file.name)}/download`, { credentials: "same-origin", headers: { "x-rlnexus-download": "1" } });
            if (!response.ok) {
                const payload = (await response.json().catch(() => null)) as { error?: string } | null;
                throw new Error(payload?.error ?? "Die Sicherung ließ sich nicht herunterladen.");
            }

            const url = URL.createObjectURL(await response.blob());
            const link = document.createElement("a");
            link.href = url;
            link.download = file.name;
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 10_000);
            close();
        } catch (error) {
            notify(error instanceof Error ? error.message : String(error), "danger");
        } finally {
            setBusy(false);
        }
    };

    return (
        <ConfirmDialog open={file !== null} title="Sicherung herunterladen" confirmLabel="Herunterladen" busy={busy} confirmDisabled={!agreed} onCancel={close} onConfirm={() => void download()}>
            {file && (
                <div className={styles.dialogText}>
                    <p className={styles.file}>
                        <code>{file.name}</code>
                        <span>{formatBytes(file.bytes)}</span>
                    </p>
                    <p>In der Datei steht die ganze Datenbank, auch personenbezogene Daten: Käufe, Sperren, Nutzerdaten und Löschnachweise.</p>
                    <p>
                        Lege sie nur auf einem verschlüsselten Datenträger ab und lösche sie spätestens am <b>{until}</b>. Sonst stimmt der Satz in der Datenschutzerklärung nicht mehr, dass Sicherungen nach 30 Tagen weg sind.
                    </p>
                    <label className={styles.agree}>
                        <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
                        Ich lösche die Datei spätestens am {until}.
                    </label>
                </div>
            )}
        </ConfirmDialog>
    );
}
