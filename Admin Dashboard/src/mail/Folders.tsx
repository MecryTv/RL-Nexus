import { Fragment, type CSSProperties, type JSX } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { IMailBox, IMailFolder } from "../../shared/api";
import type { MailFolderRole } from "../../shared/limits";
import { mailPath } from "../api/mail";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import styles from "./mail.module.scss";

const ROLE_ICONS: Readonly<Record<MailFolderRole, string>> = {
    inbox: "inbox",
    sent: "send",
    drafts: "pencil",
    archive: "archive",
    junk: "ban",
    trash: "trash",
    other: "folder",
};

/** Oben die Ordner zum Arbeiten, unter einem Strich Spam und Papierkorb, danach die übrigen in der Reihenfolge des Servers. */
const ORDER: Readonly<Record<MailFolderRole, number>> = { inbox: 0, sent: 1, drafts: 2, archive: 3, junk: 4, trash: 5, other: 6 };

function sorted(box: IMailBox): IMailFolder[] {
    return [...(box.folders ?? [])].sort((a, b) => ORDER[a.role] - ORDER[b.role]);
}

/** In Gesendet und Papierkorb heißt „ungelesen“ nichts. */
function countOf(folder: IMailFolder): number {
    return folder.role === "sent" || folder.role === "trash" ? 0 : folder.unread;
}

/** Die linke Spalte (W-0053): Name und Adresse des offenen Postfachs, darunter seine Ordner. */
export function Folders({
    box,
    color,
    folder,
    developer,
    onManage,
}: {
    readonly box: IMailBox | null;
    readonly color: string;
    readonly folder: string | null;
    readonly developer: boolean;
    readonly onManage: () => void;
}): JSX.Element {
    if (box === null) {
        return developer ? (
            <div className={styles.boxesNote}>
                <p>Noch kein Postfach. Trag eins mit Adresse und Passwort ein, dann erscheinen hier seine Ordner.</p>
                <Button size="sm" variant="primary" icon="plus" onClick={onManage}>
                    Postfach hinzufügen
                </Button>
            </div>
        ) : (
            <p className={styles.boxesNote}>Noch kein Postfach eingetragen. Das macht ein Developer.</p>
        );
    }

    const folders = sorted(box);

    return (
        <div className={`${styles.scroll} ${styles.boxesInner}`}>
            <div className={styles.boxHead}>
                <span className={styles.boxDot} style={{ "--dot": color } as CSSProperties} aria-hidden="true" />
                <span className={styles.boxName}>
                    <strong>{box.label}</strong>
                    <span className={styles.boxAddress}>{box.address}</span>
                </span>
            </div>

            {box.folders === null ? (
                <p className={styles.boxError}>{box.error ?? "Gerade nicht erreichbar."}</p>
            ) : (
                <nav aria-label={`Ordner von ${box.label}`} className={styles.folders}>
                    {folders.map((entry, index) => {
                        const on = entry.path === folder;
                        const count = countOf(entry);
                        const rule = index > 0 && ORDER[entry.role] >= ORDER.junk && ORDER[folders[index - 1].role] < ORDER.junk;

                        return (
                            <Fragment key={entry.path}>
                                {rule && <hr className={styles.folderRule} />}
                                <Link to={mailPath(box.id, entry.path)} className={[styles.folder, on && styles.folderOn].filter(Boolean).join(" ")} aria-current={on ? "page" : undefined}>
                                    <Icon name={ROLE_ICONS[entry.role]} size={16} />
                                    <span className={styles.folderName}>{entry.name}</span>
                                    {count > 0 && (
                                        <span className={[styles.count, entry.role === "drafts" && styles.countDim].filter(Boolean).join(" ")}>
                                            {count}
                                            <span className="u-sr">{entry.role === "drafts" ? " Entwürfe" : " ungelesen"}</span>
                                        </span>
                                    )}
                                </Link>
                            </Fragment>
                        );
                    })}
                </nav>
            )}
        </div>
    );
}

/** Auf dem Handy stehen die Ordner als Auswahl über der Liste statt in der Spalte. */
export function FolderSelect({ box, folder }: { readonly box: IMailBox; readonly folder: string }): JSX.Element | null {
    const navigate = useNavigate();

    if (box.folders === null) return null;

    return (
        <select className={styles.folderSelect} aria-label="Ordner" value={folder} onChange={(event) => navigate(mailPath(box.id, event.target.value))}>
            {sorted(box).map((entry) => (
                <option key={entry.path} value={entry.path}>
                    {countOf(entry) > 0 ? `${entry.name} · ${countOf(entry)}` : entry.name}
                </option>
            ))}
        </select>
    );
}
