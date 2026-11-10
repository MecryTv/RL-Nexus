import { type DragEvent, type JSX, type KeyboardEvent, useState } from "react";
import { EXTRA_SECTIONS_FOR, REPEATABLE, SECTION_LABELS, type IEntryInput } from "../../shared/partners";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { moveTo, removeAt } from "../editor/list";
import { addSection, sectionAction } from "./draft.ts";
import styles from "./studio.module.scss";

export interface ISectionsTrayProps {
    readonly value: IEntryInput;
    readonly set: (next: IEntryInput, key?: string) => void;
    readonly selected: number | null;
    readonly onSelect: (index: number | null) => void;
}

/**
 * W-0062 Teil 2: Fach „Abschnitte“ (S3, S5). Reihenfolge wie auf der Webseite,
 * Ziehen oder Pfeiltasten sortieren, das Auge blendet aus, „Dazunehmen“ fügt
 * Galerie, Video, Zitat oder freien Text an. Der Kopf steht immer oben, bei
 * Unterstützern die Links immer im Fuß.
 */
export function SectionsTray({ value, set, selected, onSelect }: ISectionsTrayProps): JSX.Element {
    const [dragged, setDragged] = useState<number | null>(null);
    const supporter = value.kind === "supporter";
    const setSections = (sections: IEntryInput["sections"]): void => set({ ...value, sections });

    const moveKey = (index: number) => (event: KeyboardEvent<HTMLButtonElement>) => {
        const action = event.key === "ArrowUp" ? "hoch" : event.key === "ArrowDown" ? "runter" : null;

        if (!action) return;

        event.preventDefault();
        setSections(sectionAction(value.sections, index, action));
        onSelect(action === "hoch" ? Math.max(0, index - 1) : Math.min(value.sections.length - 1, index + 1));
    };

    return (
        <div>
            <ul className={styles.sections}>
                <li className={styles.sectionRow} aria-current={selected === null}>
                    <span aria-hidden="true" />
                    <button type="button" className={styles.sectionName} onClick={() => onSelect(null)}>
                        {supporter ? "Kopf mit Logo" : "Kopf mit Banner"}
                    </button>
                    <span className={styles.fixed}>immer</span>
                </li>
                {value.sections.map((section, index) => {
                    const fixed = supporter && section.type === "links";
                    const removable = REPEATABLE.has(section.type);

                    return (
                        <li
                            key={`${section.type}-${index}`}
                            className={styles.sectionRow}
                            aria-current={selected === index}
                            data-hidden={!section.visible}
                            onDragOver={(event) => {
                                if (dragged !== null) event.preventDefault();
                            }}
                            onDragEnter={() => {
                                if (dragged === null || dragged === index) return;
                                // Ein Ziehen ist ein Schritt beim Rückgängig.
                                set({ ...value, sections: moveTo([...value.sections], dragged, index) }, "abschnitte-ziehen");
                                setDragged(index);
                                onSelect(index);
                            }}
                        >
                            {fixed ? (
                                <span aria-hidden="true" />
                            ) : (
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
                                    aria-label={`${SECTION_LABELS[section.type]} verschieben, Pfeiltasten hoch und runter`}
                                >
                                    <Icon name="grip" size={16} />
                                </button>
                            )}
                            <button type="button" className={styles.sectionName} onClick={() => onSelect(index)}>
                                {section.title || SECTION_LABELS[section.type]}
                            </button>
                            <span>
                                {fixed ? (
                                    <span className={styles.fixed}>immer</span>
                                ) : (
                                    <button
                                        type="button"
                                        className={styles.iconButton}
                                        aria-pressed={section.visible}
                                        aria-label={section.visible ? `${SECTION_LABELS[section.type]} ausblenden` : `${SECTION_LABELS[section.type]} einblenden`}
                                        title={section.visible ? "Ausblenden" : "Einblenden"}
                                        onClick={() => setSections(sectionAction(value.sections, index, "aus"))}
                                    >
                                        <Icon name="eye" size={16} />
                                    </button>
                                )}
                                {removable && (
                                    <button
                                        type="button"
                                        className={styles.iconButton}
                                        aria-label={`${SECTION_LABELS[section.type]} entfernen`}
                                        title="Entfernen"
                                        onClick={() => {
                                            setSections(removeAt(value.sections, index));
                                            onSelect(null);
                                        }}
                                    >
                                        <Icon name="trash" size={16} />
                                    </button>
                                )}
                            </span>
                        </li>
                    );
                })}
            </ul>

            {EXTRA_SECTIONS_FOR[value.kind].length > 0 && (
                <div className={styles.extras} role="group" aria-label="Dazunehmen">
                    {EXTRA_SECTIONS_FOR[value.kind].map((type) => (
                        <Button
                            key={type}
                            size="sm"
                            variant="ghost"
                            icon="plus"
                            onClick={() => {
                                const next = addSection(value.sections, value.kind, type);

                                setSections(next);
                                if (next.length > value.sections.length) onSelect(next.length - 1);
                            }}
                        >
                            {SECTION_LABELS[type]}
                        </Button>
                    ))}
                </div>
            )}
            <p className={styles.trayNote}>
                {supporter
                    ? "Weniger Abschnitte als beim Sponsor, damit alles in ein Fenster passt. „Unterstützt bei“ füllt sich aus den verknüpften Turnieren."
                    : value.kind === "partner"
                      ? "Bei Sponsoren stehen hier „Was wir zusammen machen“ und Angebot statt Teams und Erfolgen."
                      : "Bei Partnern stehen hier Teams aus RL Nexus und Erfolge statt Angebot."}
            </p>
        </div>
    );
}
