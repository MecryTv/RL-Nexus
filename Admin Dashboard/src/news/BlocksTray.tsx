import { type DragEvent, type JSX, type KeyboardEvent, useState } from "react";
import { BLOCK_LABELS, BLOCK_TYPES, NEWS_LIMITS, type BlockType, type IPostInput } from "../../shared/news";
import { Icon } from "../components/Icon";
import { MediaGallery } from "../studio/MediaPicker";
import { blockAction, blockLabel, moveBlock } from "./draft.ts";
import styles from "./news.module.scss";

/** Fach „Bausteine“ (S1): ein Klick fügt unter dem gewählten ein. */
export function BlocksTray({ count, onAdd }: { readonly count: number; readonly onAdd: (type: BlockType) => void }): JSX.Element {
    const full = count >= NEWS_LIMITS.blocks;

    return (
        <div>
            <div className={styles.blockGrid}>
                {BLOCK_TYPES.map((type) => (
                    <button key={type} type="button" className={styles.blockButton} disabled={full} onClick={() => onAdd(type)}>
                        {BLOCK_LABELS[type]}
                    </button>
                ))}
            </div>
            <p className={styles.trayNote}>{full ? `Mehr als ${NEWS_LIMITS.blocks} Bausteine gehen nicht.` : "Ein Klick fügt den Baustein unter dem gewählten ein. Die Reihenfolge änderst du im Fach Aufbau."}</p>
            <p className={styles.trayNote}>Video: YouTube oder Twitch per Link. Knopf: ein Link wie „Zur Anmeldung“.</p>
        </div>
    );
}

export interface ILayoutTrayProps {
    readonly value: IPostInput;
    readonly set: (next: IPostInput, key?: string) => void;
    /** „titelbild“, „block:<i>“ oder null. */
    readonly selected: string | null;
    readonly onSelect: (part: string | null) => void;
}

/** Fach „Aufbau“ (S2): Titelbild fest oben, Ziehen oder Pfeiltasten sortieren, ein Klick wählt. */
export function LayoutTray({ value, set, selected, onSelect }: ILayoutTrayProps): JSX.Element {
    const [dragged, setDragged] = useState<number | null>(null);

    const moveKey = (index: number) => (event: KeyboardEvent<HTMLButtonElement>) => {
        const action = event.key === "ArrowUp" ? "hoch" : event.key === "ArrowDown" ? "runter" : null;

        if (!action) return;

        event.preventDefault();

        const next = blockAction(value.blocks, index, action);

        set({ ...value, blocks: next.blocks });
        onSelect(next.selected === null ? null : `block:${next.selected}`);
    };

    return (
        <div>
            <p className={styles.trayCount}>{value.blocks.length === 1 ? "1 Baustein" : `${value.blocks.length} Bausteine`}</p>
            <ul className={styles.layers}>
                <li className={styles.layer} aria-current={selected === "titelbild"}>
                    <span aria-hidden="true" />
                    <button type="button" className={styles.layerName} onClick={() => onSelect("titelbild")}>
                        Titelbild
                    </button>
                    <span className={styles.fixed}>fest</span>
                </li>
                {value.blocks.map((block, index) => (
                    <li
                        key={`${block.type}-${index}`}
                        className={styles.layer}
                        aria-current={selected === `block:${index}`}
                        onDragOver={(event) => {
                            if (dragged !== null) event.preventDefault();
                        }}
                        onDragEnter={() => {
                            if (dragged === null || dragged === index) return;
                            // Ein Ziehen ist ein Schritt beim Rückgängig.
                            set({ ...value, blocks: moveBlock(value.blocks, dragged, index) }, "bausteine-ziehen");
                            setDragged(index);
                            onSelect(`block:${index}`);
                        }}
                    >
                        <button
                            type="button"
                            className={styles.iconButton}
                            draggable
                            onDragStart={(event: DragEvent<HTMLButtonElement>) => {
                                event.dataTransfer.effectAllowed = "move";
                                setDragged(index);
                            }}
                            onDragEnd={() => setDragged(null)}
                            onKeyDown={moveKey(index)}
                            aria-label={`${BLOCK_LABELS[block.type]} verschieben, Pfeiltasten hoch und runter`}
                        >
                            <Icon name="grip" size={16} />
                        </button>
                        <button type="button" className={styles.layerName} onClick={() => onSelect(`block:${index}`)}>
                            {blockLabel(block)}
                        </button>
                        <span />
                    </li>
                ))}
            </ul>
            <p className={styles.trayNote}>Ziehen sortiert um. Ein Klick wählt den Baustein auf der Bühne.</p>
        </div>
    );
}

/** Fach „Medien“: mit gewähltem Titelbild setzt ein Klick das Titelbild, sonst kommt ein Bild-Baustein dazu. */
export function MediaTray({ cover, onPick }: { readonly cover: boolean; readonly onPick: (url: string) => void }): JSX.Element {
    return (
        <div>
            <p className={styles.trayNote}>{cover ? "Ein Klick setzt das Titelbild." : "Ein Klick fügt das Bild unter dem gewählten Baustein ein."}</p>
            <MediaGallery value={null} onChange={onPick} />
        </div>
    );
}
