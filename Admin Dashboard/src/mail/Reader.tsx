import { useState, type JSX } from "react";
import type { IMailAccount, IMailFolder, IMailMessage } from "../../shared/api";
import type { MailMoveTarget } from "../../shared/limits";
import { api } from "../api/client";
import { displayName, formatAddress, formatSize, initialsOf } from "../api/mail";
import { useApi } from "../api/useApi";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Icon } from "../components/Icon";
import { Failure, Loading } from "../components/Status";
import { formatDateTime } from "../format";
import { useToast } from "../toast/context";
import { draftFor, type ReplyKind } from "./draft";
import { LazyComposer } from "./LazyComposer";
import styles from "./mail.module.scss";

/** Das Dokument im iframe: eigene CSP, Links öffnen sich in einem neuen Tab. */
function frameDocument(html: string, images: boolean): string {
    const csp = `default-src 'none'; img-src data:${images ? " https: http:" : ""}; style-src 'unsafe-inline'; font-src data:`;

    return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>html,body{margin:0}body{padding:16px;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;font-size:15px;line-height:1.5;color:#1d232b;background:#fff;overflow-wrap:anywhere}img{max-width:100%;height:auto}img[data-blocked]{display:inline-block;min-width:24px;min-height:16px;background:#eef1f4;outline:1px dashed #b8c0ca}table{max-width:100%}pre{white-space:pre-wrap}</style></head><body>${html}</body></html>`;
}

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/** Eine Mail lesen, beantworten, verschieben oder löschen. */
export function Reader({
    account,
    accounts,
    folder,
    uid,
    folders,
    onChanged,
    onGone,
}: {
    readonly account: IMailAccount;
    readonly accounts: readonly IMailAccount[];
    readonly folder: string;
    readonly uid: number;
    readonly folders: readonly IMailFolder[];
    readonly onChanged: () => void;
    readonly onGone: () => void;
}): JSX.Element {
    const notify = useToast();
    const [images, setImages] = useState(false);
    const [reply, setReply] = useState<ReplyKind | null>(null);
    const [busy, setBusy] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const base = `/api/mail/${account.id}/message?folder=${encodeURIComponent(folder)}&uid=${uid}`;
    const { data, error, reload } = useApi<IMailMessage>(`${base}${images ? "&bilder=1" : ""}`);
    const role = folders.find((entry) => entry.path === folder)?.role ?? "other";

    async function run(action: () => Promise<unknown>, done: string, gone: boolean): Promise<void> {
        setBusy(true);

        try {
            await action();
            notify(done);
            onChanged();
            if (gone) onGone();
        } catch (failure) {
            notify(messageOf(failure), "danger");
        } finally {
            setBusy(false);
            setConfirmDelete(false);
        }
    }

    const move = (target: MailMoveTarget, done: string) => run(() => api(`/api/mail/${account.id}/message/move?folder=${encodeURIComponent(folder)}&uid=${uid}`, { method: "POST", body: { target } }), done, true);
    const markUnread = () => run(() => api(base, { method: "PATCH", body: { seen: false } }), "Als ungelesen markiert", true);
    const remove = () => run(() => api(base, { method: "DELETE" }), role === "trash" ? "Endgültig gelöscht" : "In den Papierkorb gelegt", true);

    if (error && !data) return <Failure message={error.message} onRetry={reload} />;
    if (!data) return <Loading label="Mail wird geladen" />;

    const recipients = [`an ${data.to.map((entry) => displayName(entry)).join(", ") || "unbekannt"}`, ...(data.cc.length > 0 ? [`Cc ${data.cc.map((entry) => displayName(entry)).join(", ")}`] : [])];

    return (
        <article className={styles.reader} aria-labelledby="mail-betreff">
            <h2 id="mail-betreff" className={styles.subject}>
                {data.subject}
            </h2>

            <div className={styles.sender}>
                <span className={styles.avatar} aria-hidden="true">
                    {initialsOf(data.from)}
                </span>
                <div className={styles.senderText}>
                    <strong>{data.from === null ? "Unbekannt" : formatAddress(data.from)}</strong>
                    <span>
                        {recipients.join(" · ")} · {formatDateTime(data.date)}
                    </span>
                </div>
            </div>

            <div className={styles.actions}>
                <Button variant="primary" size="sm" icon="reply" onClick={() => setReply("reply")}>
                    Antworten
                </Button>
                <Button size="sm" icon="reply-all" onClick={() => setReply("all")}>
                    Allen
                </Button>
                <Button size="sm" icon="forward" onClick={() => setReply("forward")}>
                    Weiterleiten
                </Button>
                <Button size="sm" variant="ghost" icon="mail" disabled={busy} onClick={() => void markUnread()}>
                    Ungelesen
                </Button>
                {role !== "archive" && (
                    <Button size="sm" variant="ghost" icon="archive" disabled={busy} onClick={() => void move("archive", "Archiviert")}>
                        Archiv
                    </Button>
                )}
                {role === "junk" ? (
                    <Button size="sm" variant="ghost" icon="inbox" disabled={busy} onClick={() => void move("inbox", "In den Posteingang verschoben")}>
                        Kein Spam
                    </Button>
                ) : (
                    <Button size="sm" variant="ghost" icon="ban" disabled={busy} onClick={() => void move("junk", "Als Spam verschoben")}>
                        Spam
                    </Button>
                )}
                <Button size="sm" variant="danger" icon="trash" disabled={busy} onClick={() => (role === "trash" ? setConfirmDelete(true) : void remove())}>
                    Löschen
                </Button>
            </div>

            {data.blockedImages > 0 && !images && (
                <p className={styles.notice}>
                    <span>
                        {data.blockedImages === 1 ? "Ein externes Bild ist" : `${data.blockedImages} externe Bilder sind`} blockiert. Der Absender könnte sonst sehen, dass die Mail geöffnet wurde.
                    </span>
                    <Button size="sm" icon="image" onClick={() => setImages(true)}>
                        Laden
                    </Button>
                </p>
            )}

            <iframe
                className={styles.frame}
                title={`Inhalt: ${data.subject}`}
                sandbox="allow-popups allow-popups-to-escape-sandbox"
                srcDoc={frameDocument(data.html, images)}
                referrerPolicy="no-referrer"
            />

            {data.attachments.length > 0 && (
                <ul className={styles.attachments} aria-label="Anhänge">
                    {data.attachments.map((entry) => (
                        <li key={entry.index}>
                            <a className={styles.attachment} href={`/api/mail/${account.id}/attachment?folder=${encodeURIComponent(folder)}&uid=${uid}&index=${entry.index}`} download={entry.filename}>
                                <Icon name="paperclip" size={16} />
                                <span>{entry.filename}</span>
                                <small>{formatSize(entry.size)}</small>
                            </a>
                        </li>
                    ))}
                </ul>
            )}

            {reply !== null && (
                <LazyComposer
                    key={reply}
                    accounts={accounts}
                    start={draftFor(reply, { account, message: data }, accounts.map((entry) => entry.address.toLowerCase()))}
                    onSent={() => {
                        setReply(null);
                        onChanged();
                    }}
                    onClose={() => setReply(null)}
                />
            )}

            <ConfirmDialog
                open={confirmDelete}
                title="Endgültig löschen?"
                confirmLabel="Löschen"
                tone="danger"
                busy={busy}
                onConfirm={() => void remove()}
                onCancel={() => setConfirmDelete(false)}
            >
                <p>„{data.subject}“ liegt schon im Papierkorb und ist danach weg, auch in Mailcow.</p>
            </ConfirmDialog>
        </article>
    );
}
