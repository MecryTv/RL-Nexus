import { useState, type JSX } from "react";
import { Link, useParams } from "react-router-dom";
import { BLOCK_LABELS, PRESET_LABELS, SERVICE_LABELS, normalScope, type IBanChangeView, type IBanProfile, type IEvidenceView } from "../../shared/security.ts";
import { api } from "../api/client";
import { useLive } from "../api/live";
import { useApi } from "../api/useApi";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { PageHeader } from "../components/PageHeader";
import { Segmented } from "../components/Segmented";
import { Failure, Loading } from "../components/Status";
import { formatBytes, formatNumber } from "../format";
import { day, stamp } from "../servers/util.ts";
import { useToast } from "../toast/context";
import { useTitle } from "../useTitle";
import { BanDialog, type BanDialogMode } from "./BanDialog";
import { Avatar, EvidencePicker } from "./parts";
import { PRESET_TONE, evidenceBody, suspectHint, type PendingEvidence } from "./util.ts";
import kpi from "../servers/servers.module.scss";
import styles from "./security.module.scss";

type Tab = "server" | "belege" | "treffer" | "protokoll";

const ACTION_LABELS: Readonly<Record<IBanChangeView["action"], string>> = {
    ban: "Gesperrt",
    change: "Umfang geändert",
    lift: "Aufgehoben",
    server: "Server",
    evidence: "Beleg hinzugefügt",
    dm: "DM",
};

const scopeNames = (value: string | null): string => (value ? normalScope(value.split(",")).map((block) => BLOCK_LABELS[block]).join(", ") : "–");

function Change({ change }: { readonly change: IBanChangeView }): JSX.Element {
    const detail = change.action === "change" ? `${scopeNames(change.before)} → ${scopeNames(change.after)}` : change.action === "ban" ? scopeNames(change.after) : null;

    return (
        <li>
            <span className={styles.when}>{stamp(change.at)}</span>
            <span className={styles.grow}>
                <b>{ACTION_LABELS[change.action]}</b> von {change.by}
                {detail && <small>{detail}</small>}
                {change.note && <small>„{change.note}“</small>}
            </span>
        </li>
    );
}

function Evidence({ entry }: { readonly entry: IEvidenceView }): JSX.Element {
    if (entry.kind === "file") {
        return (
            <li className={styles.evidence}>
                <a href={`/api/security/evidence/${entry.id}`} target="_blank" rel="noreferrer">
                    <img src={`/api/security/evidence/${entry.id}`} alt={`Beleg ${entry.name}`} loading="lazy" />
                </a>
                <span className={styles.grow}>
                    {entry.name}
                    <small>
                        {formatBytes(entry.size)} · {stamp(entry.at)}
                    </small>
                </span>
            </li>
        );
    }

    const message = entry.message as { author?: { name?: string }; channel?: { name?: string | null }; guild?: { name?: string } | null; content?: string; at?: string; images?: { name: string; url: string }[] } | null;

    return (
        <li className={styles.evidence}>
            <span className={styles.fileTag} data-discord="">
                DC
            </span>
            <span className={styles.grow}>
                {message ? (
                    <>
                        <b>{message.author?.name ?? "Unbekannt"}</b>
                        <small>
                            {[message.guild?.name, message.channel?.name ? `#${message.channel.name}` : null, message.at ? stamp(message.at) : null].filter(Boolean).join(" · ")} · gespeichert
                        </small>
                        {message.content && <span className={styles.quote}>{message.content}</span>}
                        {message.images?.map((image) => <img key={image.name} className={styles.shot} src={image.url} alt={`Bild ${image.name}`} loading="lazy" />)}
                    </>
                ) : (
                    <>
                        {entry.name}
                        <small className={styles.warnText}>{entry.error ?? "nicht gespeichert"}</small>
                    </>
                )}
            </span>
        </li>
    );
}

/** Profil einer Sperre (A2): Kopf mit Umfang, seit und von wem, dazu die Reiter Server, Belege, Treffer und Protokoll. */
export function BanProfilePage(): JSX.Element {
    const { id = "" } = useParams();
    const notify = useToast();
    const state = useApi<IBanProfile>(`/api/security/bans/${id}`);
    const [tab, setTab] = useState<Tab>("server");
    const [dialog, setDialog] = useState<BanDialogMode | null>(null);
    const [uploading, setUploading] = useState(false);
    const data = state.data;

    useTitle(data ? `Sperre · ${data.person.name}` : "Sperre");
    useLive("security", state.reload);

    if (state.error && !data) return <Failure message={state.error.message} onRetry={state.reload} />;
    if (!data) return <Loading label="Sperre wird geladen" />;

    const active = data.state === "active";
    const upload = async (entries: PendingEvidence[]): Promise<void> => {
        setUploading(true);

        for (const entry of entries) {
            try {
                await api(`/api/security/bans/${data.id}/evidence`, { method: "POST", body: evidenceBody(entry) });
            } catch (error) {
                notify(error instanceof Error ? error.message : String(error), "danger");
            }
        }

        setUploading(false);
        state.reload();
    };

    const tabs = [
        { value: "server", label: `Server (${data.servers.length})` },
        { value: "belege", label: `Belege (${data.evidence.length})` },
        { value: "treffer", label: `Treffer (${data.hits})` },
        { value: "protokoll", label: "Protokoll" },
    ] as const;

    return (
        <section>
            <p className={styles.back}>
                <Link to="/sicherheit">← Sperren</Link>
            </p>
            <PageHeader title={data.person.name} meta={`${active ? "gesperrt" : "aufgehoben"} · seit ${day(data.since)} von ${data.by}${data.liftedAt ? ` · aufgehoben am ${day(data.liftedAt)}` : ""}`}>
                {active && (
                    <>
                        <Button variant="outline" onClick={() => setDialog({ kind: "change", profile: data })}>
                            Umfang ändern
                        </Button>
                        <Button variant="danger" onClick={() => setDialog({ kind: "lift", profile: data })}>
                            Aufheben
                        </Button>
                    </>
                )}
            </PageHeader>

            {dialog && (
                <BanDialog
                    mode={dialog}
                    onClose={() => setDialog(null)}
                    onDone={() => {
                        setDialog(null);
                        state.reload();
                    }}
                />
            )}

            <div className={styles.head}>
                <Avatar person={data.person} size={44} />
                <div className={styles.grow}>
                    <Badge tone={active ? PRESET_TONE[data.preset] : "neutral"}>{active ? PRESET_LABELS[data.preset] : "Aufgehoben"}</Badge>
                    <p className={styles.blocks}>{data.scope.map((block) => BLOCK_LABELS[block]).join(" · ")}</p>
                    <p className={styles.dim}>
                        ID {data.person.id}
                        {data.reasons.length > 0 && ` · ${data.reasons.join(", ")}`}
                        {data.linkedTo && (
                            <>
                                {" · verknüpft mit "}
                                <Link to={`/sicherheit/sperre/${data.linkedTo}`}>Sperre {data.linkedTo}</Link>
                            </>
                        )}
                    </p>
                    {data.note && <p className={styles.quote}>{data.note}</p>}
                </div>
            </div>

            <div className={styles.toolbar}>
                <Segmented name="reiter" legend="Reiter" options={tabs} value={tab} onChange={setTab} />
            </div>

            {tab === "server" &&
                (data.servers.length === 0 ? (
                    <p className={kpi.empty}>Die Person hat keinen Server mit dem Bot.</p>
                ) : (
                    <table className={kpi.table}>
                        <thead>
                            <tr>
                                <th>Server</th>
                                <th>Mitglieder</th>
                                <th>Seit</th>
                                <th>Bot verlässt</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.servers.map((server) => (
                                <tr key={server.id}>
                                    <td>
                                        <b>{server.name}</b>
                                        {!server.active && <span className={kpi.sub}>Bot ist nicht mehr dort</span>}
                                    </td>
                                    <td className={styles.num}>{formatNumber(server.members)}</td>
                                    <td>{day(server.since)}</td>
                                    <td>
                                        {server.owner ? (
                                            <label className={styles.leave}>
                                                <span className="u-sr">Bot verlässt {server.name}</span>
                                                <input type="checkbox" role="switch" checked={server.leave} disabled={!active} onChange={() => setDialog({ kind: "change", profile: data, flip: server.id })} />
                                            </label>
                                        ) : (
                                            <span className={styles.dim}>nur eingeladen</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ))}

            {tab === "belege" && (
                <>
                    {data.evidence.length === 0 ? <p className={kpi.empty}>Noch keine Belege.</p> : <ul className={styles.files}>{data.evidence.map((entry) => <Evidence key={entry.id} entry={entry} />)}</ul>}
                    {active && (
                        <div className={styles.addEvidence} aria-busy={uploading}>
                            <EvidencePicker onAdd={(entries) => void upload(entries)} />
                        </div>
                    )}
                </>
            )}

            {tab === "treffer" &&
                (data.suspects.length === 0 ? (
                    <p className={kpi.empty}>{data.hits ? `${formatNumber(data.hits)} abgewiesene Anmeldungen, kein Verdachtsfall.` : "Seit der Sperre ist nichts aufgefallen."}</p>
                ) : (
                    <table className={kpi.table}>
                        <tbody>
                            {data.suspects.map((suspect) => (
                                <tr key={suspect.id}>
                                    <td>{stamp(suspect.at)}</td>
                                    <td>
                                        <b>{suspect.person.name}</b>
                                        <span className={kpi.sub}>{suspectHint(suspect)}</span>
                                    </td>
                                    <td>{SERVICE_LABELS[suspect.service]}</td>
                                    <td>
                                        <Badge tone={suspect.state === "open" ? "warn" : suspect.state === "banned" ? "danger" : "ok"}>{suspect.state === "open" ? "offen" : suspect.state === "banned" ? "gesperrt" : "passt"}</Badge>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ))}

            {tab === "protokoll" && (
                <ul className={styles.log}>
                    {data.changes.map((change, index) => (
                        <Change key={index} change={change} />
                    ))}
                </ul>
            )}
        </section>
    );
}
