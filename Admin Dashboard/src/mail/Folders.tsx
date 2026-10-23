import { useState, type CSSProperties, type JSX } from "react";
import { Link } from "react-router-dom";
import type { IMailOverview } from "../../shared/api";
import type { MailFolderRole } from "../../shared/limits";
import { allPath, boxColor, mailPath, unreadOf } from "../api/mail";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import type { MailSelection } from "./draft";
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

const COLLAPSED_KEY = "rlnexus.mail.collapsed";

function readCollapsed(): number[] {
    try {
        const value: unknown = JSON.parse(window.localStorage.getItem(COLLAPSED_KEY) ?? "[]");

        return Array.isArray(value) ? value.filter((entry): entry is number => Number.isInteger(entry)) : [];
    } catch {
        return [];
    }
}

/** Welche Postfächer zugeklappt sind. Der Browser merkt es sich, ein gesperrter Speicher bis zum Neuladen. */
function useCollapsed(): [readonly number[], (id: number) => void] {
    const [collapsed, setCollapsed] = useState<readonly number[]>(readCollapsed);

    function toggle(id: number): void {
        const next = collapsed.includes(id) ? collapsed.filter((entry) => entry !== id) : [...collapsed, id];
        setCollapsed(next);

        try {
            window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next));
        } catch {
            // Gesperrter Speicher: Dann gilt es nur bis zum Neuladen.
        }
    }

    return [collapsed, toggle];
}

/** Die linke Spalte: Neue Mail, alle Posteingänge, Postfächer zum Auf- und Zuklappen. */
export function Folders({
    overview,
    selection,
    developer,
    onCompose,
    onManage,
}: {
    readonly overview: IMailOverview;
    readonly selection: MailSelection;
    readonly developer: boolean;
    readonly onCompose: () => void;
    readonly onManage: () => void;
}): JSX.Element {
    const [collapsed, toggle] = useCollapsed();
    const hasBoxes = overview.boxes.length > 0;
    const total = unreadOf(overview) ?? 0;
    const allOn = selection?.kind === "all";

    return (
        <>
            <div className={`${styles.scroll} ${styles.boxesInner}`}>
                <button type="button" className={styles.compose} onClick={onCompose} disabled={!hasBoxes}>
                    <Icon name="plus" size={16} /> Neue Mail
                </button>

                {hasBoxes && (
                    <Link to={allPath()} className={[styles.folder, styles.allInboxes, allOn && styles.folderOn].filter(Boolean).join(" ")} aria-current={allOn ? "page" : undefined}>
                        <Icon name="inbox" size={16} />
                        <span className={styles.folderName}>Alle Posteingänge</span>
                        {total > 0 && (
                            <span className={styles.count}>
                                {total}
                                <span className="u-sr"> ungelesen</span>
                            </span>
                        )}
                    </Link>
                )}

                {overview.boxes.map((box, index) => {
                    // Das Postfach, in dem gerade ein Ordner offen ist, bleibt offen.
                    const open = !collapsed.includes(box.id) || (selection?.kind === "folder" && selection.account === box.id);
                    const inboxUnread = box.folders?.find((folder) => folder.role === "inbox")?.unread ?? 0;

                    return (
                        <nav key={box.id} aria-label={box.address} className={styles.box} style={{ "--dot": boxColor(index) } as CSSProperties}>
                            <button type="button" className={styles.boxToggle} aria-expanded={open} aria-controls={`postfach-${box.id}`} onClick={() => toggle(box.id)} title={box.address}>
                                <span className={styles.boxDot} aria-hidden="true" />
                                <span className={styles.boxName}>{box.label}</span>
                                {!open && inboxUnread > 0 && (
                                    <span className={styles.count}>
                                        {inboxUnread}
                                        <span className="u-sr"> ungelesen</span>
                                    </span>
                                )}
                                <Icon name={open ? "chevron-down" : "chevron-right"} size={16} />
                            </button>
                            <div id={`postfach-${box.id}`} className={styles.boxFolders} hidden={!open}>
                                {box.folders === null ? (
                                    <p className={styles.boxError}>{box.error ?? "Gerade nicht erreichbar."}</p>
                                ) : (
                                    box.folders.map((folder) => {
                                        const on = selection?.kind === "folder" && selection.account === box.id && selection.folder === folder.path;

                                        return (
                                            <Link
                                                key={folder.path}
                                                to={mailPath(box.id, folder.path)}
                                                className={[styles.folder, on && styles.folderOn].filter(Boolean).join(" ")}
                                                aria-current={on ? "page" : undefined}
                                            >
                                                <Icon name={ROLE_ICONS[folder.role]} size={16} />
                                                <span className={styles.folderName}>{folder.name}</span>
                                                {folder.unread > 0 && folder.role !== "sent" && folder.role !== "trash" && (
                                                    <span className={styles.count}>
                                                        {folder.unread}
                                                        <span className="u-sr"> ungelesen</span>
                                                    </span>
                                                )}
                                            </Link>
                                        );
                                    })
                                )}
                            </div>
                        </nav>
                    );
                })}

                {!hasBoxes &&
                    (developer ? (
                        <div className={styles.boxesNote}>
                            <p>Noch kein Postfach. Trag eins mit Adresse und Passwort ein, dann erscheinen hier seine Ordner.</p>
                            <Button size="sm" variant="primary" icon="plus" onClick={onManage}>
                                Postfach hinzufügen
                            </Button>
                        </div>
                    ) : (
                        <p className={styles.boxesNote}>Noch kein Postfach eingetragen. Das macht ein Developer.</p>
                    ))}
            </div>

            {developer && hasBoxes && (
                <div className={styles.manage}>
                    <Button size="sm" variant="ghost" icon="wrench" onClick={onManage}>
                        Postfächer verwalten
                    </Button>
                </div>
            )}
        </>
    );
}
