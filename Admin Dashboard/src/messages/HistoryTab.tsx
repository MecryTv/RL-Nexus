import { useState, type JSX } from "react";
import { MESSAGE_STATE_LABELS, type IMessageDetail, type IMessageEntry, type MessageState } from "../../shared/messages.ts";
import { useLive } from "../api/live";
import { useApi } from "../api/useApi";
import { Badge, type BadgeTone } from "../components/Badge";
import { SidePanel } from "../components/SidePanel";
import { Failure, Loading } from "../components/Status";
import { formatDateTime, formatNumber } from "../format";
import styles from "./messages.module.scss";

const TONE: Readonly<Record<MessageState, BadgeTone>> = { running: "info", paused: "warn", done: "ok", cancelled: "neutral" };

const recipient = (entry: IMessageEntry): string => (entry.target ? (entry.target.name ?? entry.target.id) : `Alle (${formatNumber(entry.total)})`);

/** Eine Nachricht im SidePanel: das Bild mit dem eigenen Namen und wer sie nicht bekam. */
function Detail({ id }: { readonly id: number }): JSX.Element {
    const detail = useApi<IMessageDetail>(`/api/messages/${id}`);
    const data = detail.data;

    useLive("messages", detail.reload);

    if (detail.error && !data) return <Failure message={detail.error.message} onRetry={detail.reload} />;
    if (!data) return <Loading label="Nachricht wird geladen" />;

    return (
        <div className={styles.detail}>
            <img src={`/api/messages/${id}/bild`} alt={`Die Nachricht „${data.title}“, mit deinem Namen`} />
            <dl className={styles.runFacts}>
                <div>
                    <dt>Zugestellt</dt>
                    <dd>{formatNumber(data.sent)}</dd>
                </div>
                <div>
                    <dt>Nicht erreicht</dt>
                    <dd>{formatNumber(data.failed + data.skipped)}</dd>
                </div>
                <div>
                    <dt>Stand</dt>
                    <dd>
                        <Badge tone={TONE[data.state]}>{MESSAGE_STATE_LABELS[data.state]}</Badge>
                    </dd>
                </div>
            </dl>
            <p className={styles.dim}>
                {data.templateName || "Ohne Vorlage"} · von {data.createdName} · {formatDateTime(data.createdAt)}
                {data.finishedAt && ` · fertig ${formatDateTime(data.finishedAt)}`}
            </p>
            {data.pauseReason && <p className={styles.warnText}>{data.pauseReason}</p>}

            <h3>Nicht erreicht</h3>
            {data.misses.length === 0 ? (
                <p className={styles.dim}>{data.failed + data.skipped > 0 ? "Wer sie nicht bekam, ist nach 90 Tagen nicht mehr gespeichert." : "Alle haben sie bekommen."}</p>
            ) : (
                <ul className={styles.misses}>
                    {data.misses.map((miss) => (
                        <li key={miss.id}>
                            <span>
                                <b>{miss.name ?? "Unbekannt"}</b>
                                <small>{miss.id}</small>
                            </span>
                            <span>{miss.reason}</span>
                        </li>
                    ))}
                </ul>
            )}
            {data.misses.length > 0 && data.misses.length < data.failed + data.skipped && (
                <p className={styles.dim}>
                    Gezeigt: die ersten {formatNumber(data.misses.length)} von {formatNumber(data.failed + data.skipped)}.
                </p>
            )}
        </div>
    );
}

/** Reiter „Verlauf“: die neuesten 50 Nachrichten mit Zahlen. */
export function HistoryTab(): JSX.Element {
    const list = useApi<IMessageEntry[]>("/api/messages");
    const [open, setOpen] = useState<IMessageEntry | null>(null);

    useLive("messages", list.reload);

    if (list.error && !list.data) return <Failure message={list.error.message} onRetry={list.reload} />;
    if (!list.data) return <Loading label="Verlauf wird geladen" />;

    return (
        <>
            {list.data.length === 0 ? (
                <p className={styles.dim}>Noch keine Nachricht verschickt.</p>
            ) : (
                <div className={styles.scroll}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Wann</th>
                                <th>Vorlage</th>
                                <th>Titel</th>
                                <th>An</th>
                                <th className={styles.num}>Zugestellt</th>
                                <th className={styles.num}>Nicht erreicht</th>
                                <th>Von</th>
                                <th>Stand</th>
                            </tr>
                        </thead>
                        <tbody>
                            {list.data.map((entry) => (
                                <tr key={entry.id}>
                                    <td>{formatDateTime(entry.createdAt)}</td>
                                    <td>{entry.templateName || "–"}</td>
                                    <td>
                                        <button type="button" className={styles.linkish} onClick={() => setOpen(entry)}>
                                            {entry.title}
                                        </button>
                                    </td>
                                    <td>{recipient(entry)}</td>
                                    <td className={styles.num}>{formatNumber(entry.sent)}</td>
                                    <td className={styles.num}>{formatNumber(entry.failed + entry.skipped)}</td>
                                    <td>{entry.createdName}</td>
                                    <td>
                                        <Badge tone={TONE[entry.state]}>{MESSAGE_STATE_LABELS[entry.state]}</Badge>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <p className={styles.dim}>Wer eine Nachricht bekam, bleibt 90 Tage gespeichert. Eine Nachricht an eine Person ist nach 90 Tagen ganz weg.</p>

            <SidePanel open={open !== null} title={open ? `„${open.title}“ an ${recipient(open)}` : "Nachricht"} onClose={() => setOpen(null)}>
                {open && <Detail id={open.id} />}
            </SidePanel>
        </>
    );
}
