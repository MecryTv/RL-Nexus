import { useState, type ClipboardEvent, type DragEvent, type JSX } from "react";
import { Link } from "react-router-dom";
import { BLOCK_LABELS, BLOCKS, PRESET_LABELS, presetOf, scopeOf, type Block, type IPersonRefView, type Preset } from "../../shared/security.ts";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { Segmented } from "../components/Segmented";
import { formatBytes } from "../format";
import { initials } from "../servers/util.ts";
import { useToast } from "../toast/context";
import { DISCORD_MESSAGE, readEvidence, type PendingEvidence } from "./util.ts";
import styles from "./security.module.scss";

/** Bausteine für den Bereich Sicherheit (W-0057). */

export function Avatar({ person, size = 32 }: { readonly person: IPersonRefView; readonly size?: number }): JSX.Element {
    return person.avatar ? (
        <img className={styles.avatar} src={person.avatar} alt="" width={size} height={size} />
    ) : (
        <span className={styles.avatar} style={{ width: size, height: size }} aria-hidden="true">
            {initials(person.name)}
        </span>
    );
}

/** Person mit Bild und ID; to: wohin der Name führt. */
export function PersonLine({ person, to }: { readonly person: IPersonRefView; readonly to?: string }): JSX.Element {
    return (
        <div className={styles.person}>
            <Avatar person={person} />
            <span>
                {to ? <Link to={to}>{person.name}</Link> : <b>{person.name}</b>}
                <small>{person.id}</small>
            </span>
        </div>
    );
}

const PRESET_OPTIONS = (["voll", "besitz", "eigene"] as const).map((value) => ({ value, label: PRESET_LABELS[value] }));

/** Umfang (F2): Umschalter Voll, Nur Besitz, Eigene Auswahl und darunter die fünf Schalter. Rot ist nur, was gesperrt wird. */
export function ScopePicker({ scope, onChange }: { readonly scope: readonly Block[]; readonly onChange: (scope: Block[]) => void }): JSX.Element {
    const [custom, setCustom] = useState(presetOf(scope) === "eigene");
    const preset: Preset = custom ? "eigene" : presetOf(scope);

    return (
        <div>
            <Segmented
                name="umfang"
                legend="Vorgabe"
                options={PRESET_OPTIONS}
                value={preset}
                onChange={(value) => {
                    setCustom(value === "eigene");
                    if (value !== "eigene") onChange(scopeOf(value));
                }}
            />
            <div className={styles.scope}>
                {BLOCKS.map((block) => {
                    const on = scope.includes(block);

                    return (
                        <label key={block} className={styles.block} data-on={on ? "" : undefined}>
                            <input
                                type="checkbox"
                                role="switch"
                                checked={on}
                                onChange={(event) => {
                                    setCustom(true);
                                    onChange(BLOCKS.filter((entry) => (entry === block ? event.target.checked : scope.includes(entry))));
                                }}
                            />
                            <span>{BLOCK_LABELS[block]}</span>
                        </label>
                    );
                })}
            </div>
        </div>
    );
}

/** Belege: Bilder hineinziehen, mit Strg V einfügen oder auswählen, dazu Links zu Discord-Nachrichten. */
export function EvidencePicker({ onAdd }: { readonly onAdd: (entries: PendingEvidence[]) => void }): JSX.Element {
    const notify = useToast();
    const [link, setLink] = useState("");
    const [over, setOver] = useState(false);

    const take = async (files: readonly File[]): Promise<void> => {
        const added: PendingEvidence[] = [];

        for (const file of files) {
            try {
                added.push(await readEvidence(file));
            } catch (error) {
                notify(error instanceof Error ? error.message : String(error), "danger");
            }
        }

        if (added.length) onAdd(added);
    };

    const addLink = (): void => {
        const value = link.trim();

        if (!DISCORD_MESSAGE.test(value)) {
            notify("Das ist kein Link zu einer Discord-Nachricht.", "danger");

            return;
        }

        onAdd([{ kind: "link", link: value }]);
        setLink("");
    };

    return (
        <div
            className={styles.drop}
            data-over={over ? "" : undefined}
            onDragOver={(event: DragEvent) => {
                event.preventDefault();
                setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(event: DragEvent) => {
                event.preventDefault();
                setOver(false);
                void take([...event.dataTransfer.files]);
            }}
            onPaste={(event: ClipboardEvent) => {
                const files = [...event.clipboardData.files];

                if (files.length) {
                    event.preventDefault();
                    void take(files);
                }
            }}
        >
            <label className={styles.pick}>
                <Icon name="image" size={16} />
                Bild wählen, hineinziehen oder mit Strg+V einfügen
                <input type="file" accept="image/png,image/jpeg,image/webp" multiple className="u-sr" onChange={(event) => void take([...(event.target.files ?? [])]).then(() => (event.target.value = ""))} />
            </label>
            <div className={styles.linkRow}>
                <input
                    type="url"
                    aria-label="Link zu einer Discord-Nachricht"
                    placeholder="https://discord.com/channels/…"
                    value={link}
                    onChange={(event) => setLink(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") {
                            event.preventDefault();
                            addLink();
                        }
                    }}
                />
                <Button size="sm" variant="outline" icon="link" onClick={addLink} disabled={!link.trim()}>
                    Link hinzufügen
                </Button>
            </div>
        </div>
    );
}

/** Noch nicht hochgeladene Belege als Liste mit Größe. */
export function PendingList({ entries, onRemove, note }: { readonly entries: readonly PendingEvidence[]; readonly onRemove: (index: number) => void; readonly note: string }): JSX.Element | null {
    if (entries.length === 0) return null;

    return (
        <ul className={styles.files}>
            {entries.map((entry, index) => (
                <li key={entry.kind === "link" ? entry.link : `${entry.name}-${index}`}>
                    <span className={styles.fileTag} data-discord={entry.kind === "link" ? "" : undefined}>
                        {entry.kind === "link" ? "DC" : entry.mime.split("/")[1]?.toUpperCase().replace("JPEG", "JPG")}
                    </span>
                    <span className={styles.grow}>
                        {entry.kind === "link" ? entry.link.replace(/^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/channels\//, "") : entry.name}
                        <small>{entry.kind === "link" ? note : formatBytes(entry.size)}</small>
                    </span>
                    <button type="button" className={styles.remove} aria-label="Beleg entfernen" onClick={() => onRemove(index)}>
                        <Icon name="close" size={14} />
                    </button>
                </li>
            ))}
        </ul>
    );
}
