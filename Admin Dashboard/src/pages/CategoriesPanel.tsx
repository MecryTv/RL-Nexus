import { useState, type CSSProperties, type DragEvent, type JSX, type KeyboardEvent } from "react";
import { CONTENT_LIMITS, MODULE_ID, type ICategories, type ICategory, type IContentMeta, type IModules } from "../../shared/content";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { EditorBar } from "../editor/EditorParts";
import { colorValue } from "../editor/iconUrl";
import { replaceAt } from "../editor/list";
import type { IContentDoc } from "../editor/useContentDoc";
import styles from "./CategoriesPanel.module.scss";

const LIMITS = CONTENT_LIMITS.categories;

/** Die Farben der Webseite, die sich als Akzent eignen. Alles andere geht als Hex. */
const PALETTE = ["--c-mod-community", "--c-mod-competition", "--c-mod-moderation", "--c-mod-engagement", "--c-mod-content", "--c-mod-utility", "--c-blue", "--c-purple"];

const HEX = /^#[0-9a-f]{6}$/i;

/** Die ID aus dem Namen: klein, Umlaute ausgeschrieben, Bindestriche statt Leerzeichen. */
function categoryId(label: string): string {
    return label
        .trim()
        .toLowerCase()
        .replace(/ä/g, "ae")
        .replace(/ö/g, "oe")
        .replace(/ü/g, "ue")
        .replace(/ß/g, "ss")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .replace(/^[^a-z]+/, "")
        .slice(0, LIMITS.id);
}

function move<T>(list: readonly T[], from: number, to: number): T[] {
    const next = [...list];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);

    return next;
}

/** Hex für den Farbwähler: eine Farbe der Webseite wird über meta.colors aufgelöst. */
function hexOf(color: string, meta: IContentMeta): string {
    const value = colorValue(color, meta);

    return HEX.test(value) ? value.toLowerCase() : "#000000";
}

function CategoryRow({
    category,
    index,
    count,
    total,
    meta,
    onChange,
    onMove,
    onRemove,
    dragging,
    onDragStart,
    onDragEnd,
}: {
    readonly category: ICategory;
    readonly index: number;
    readonly count: number;
    readonly total: number;
    readonly meta: IContentMeta;
    readonly onChange: (next: ICategory) => void;
    readonly onMove: (to: number) => void;
    readonly onRemove: () => void;
    readonly dragging: boolean;
    readonly onDragStart: () => void;
    readonly onDragEnd: () => void;
}): JSX.Element {
    const [renaming, setRenaming] = useState(false);
    const [label, setLabel] = useState(category.label);
    const [hex, setHex] = useState(HEX.test(category.color) ? category.color : "");

    function moveKey(event: KeyboardEvent<HTMLButtonElement>): void {
        if (event.key === "ArrowUp" && index > 0) {
            event.preventDefault();
            onMove(index - 1);
        }

        if (event.key === "ArrowDown" && index < total - 1) {
            event.preventDefault();
            onMove(index + 1);
        }
    }

    function finishRename(): void {
        const trimmed = label.trim();
        if (trimmed.length >= LIMITS.label.min) onChange({ ...category, label: trimmed });
        else setLabel(category.label);
        setRenaming(false);
    }

    return (
        <li className={[styles.row, dragging && styles.dragging].filter(Boolean).join(" ")} style={{ "--swatch": colorValue(category.color, meta) } as CSSProperties}>
            <button
                type="button"
                className={styles.grip}
                draggable
                onDragStart={(event: DragEvent<HTMLButtonElement>) => {
                    event.dataTransfer.effectAllowed = "move";
                    onDragStart();
                }}
                onDragEnd={onDragEnd}
                onKeyDown={moveKey}
                aria-label={`${category.label} verschieben, Position ${index + 1} von ${total}. Pfeiltasten hoch und runter.`}
            >
                <Icon name="grip" size={16} />
            </button>

            <span className={styles.swatch} aria-hidden="true" />

            <span className={styles.name}>
                {renaming ? (
                    <input
                        className={styles.rename}
                        value={label}
                        maxLength={LIMITS.label.max}
                        aria-label="Neuer Name"
                        autoFocus
                        onChange={(event) => setLabel(event.target.value)}
                        onBlur={finishRename}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") finishRename();
                            if (event.key === "Escape") {
                                setLabel(category.label);
                                setRenaming(false);
                            }
                        }}
                    />
                ) : (
                    <strong>{category.label}</strong>
                )}
                <small>{category.id}</small>
            </span>

            <span className={styles.colors} role="group" aria-label={`Farbe von ${category.label}`}>
                {PALETTE.filter((token) => meta.colors.some((entry) => entry.token === token)).map((token) => {
                    const value = `var(${token})`;

                    return (
                        <button
                            key={token}
                            type="button"
                            className={styles.color}
                            style={{ "--p": colorValue(value, meta) } as CSSProperties}
                            aria-pressed={category.color === value}
                            aria-label={token.replace("--c-", "")}
                            onClick={() => onChange({ ...category, color: value })}
                        />
                    );
                })}
                <input
                    type="color"
                    className={styles.picker}
                    value={hexOf(category.color, meta)}
                    aria-label={`Eigene Farbe für ${category.label}`}
                    onChange={(event) => {
                        setHex(event.target.value);
                        onChange({ ...category, color: event.target.value });
                    }}
                />
                <input
                    className={styles.hex}
                    value={hex}
                    placeholder="#rrggbb"
                    maxLength={7}
                    aria-label={`Hex-Farbe für ${category.label}`}
                    onChange={(event) => {
                        setHex(event.target.value);
                        if (HEX.test(event.target.value)) onChange({ ...category, color: event.target.value.toLowerCase() });
                    }}
                />
            </span>

            <span className={styles.count}>{count === 1 ? "1 Modul" : `${count} Module`}</span>

            <span className={styles.actions}>
                <button type="button" onClick={() => setRenaming(true)}>
                    Umbenennen
                </button>
                <button type="button" onClick={onRemove} disabled={count > 0} title={count > 0 ? `${category.label} hat noch ${count} Module.` : undefined}>
                    Löschen
                </button>
            </span>
        </li>
    );
}

/**
 * Die Kategorien der Module, oben auf der Modulseite (Entwurf vom 9. Oktober).
 * Gespeichert wird erst mit „Speichern“. Eine Kategorie mit Modulen lässt sich
 * nicht löschen, das prüft auch der Server.
 */
export function CategoriesPanel({ doc, modules, meta }: { readonly doc: IContentDoc<ICategories>; readonly modules: IModules; readonly meta: IContentMeta }): JSX.Element {
    const categories = doc.draft.categories;
    const [name, setName] = useState("");
    const [dragged, setDragged] = useState<number | null>(null);
    const id = categoryId(name);
    const taken = categories.some((entry) => entry.id === id);
    const full = categories.length >= LIMITS.count;
    const nameProblem =
        name.trim() === ""
            ? null
            : name.trim().length < LIMITS.label.min
              ? `Mindestens ${LIMITS.label.min} Zeichen.`
              : !MODULE_ID.test(id)
                ? "Der Name braucht mindestens einen Buchstaben."
                : taken
                  ? `Die ID „${id}“ gibt es schon.`
                  : null;

    const set = (next: readonly ICategory[]): void => doc.update(() => ({ categories: next }));
    const countOf = (categoryIdValue: string): number => modules.modules.filter((module) => module.category === categoryIdValue).length;

    function add(): void {
        if (nameProblem !== null || name.trim() === "" || full) return;

        const used = new Set(categories.map((entry) => entry.color));
        const color = PALETTE.map((token) => `var(${token})`).find((value) => !used.has(value)) ?? "var(--c-blue)";

        set([...categories, { id, label: name.trim(), color }]);
        setName("");
    }

    return (
        <section className={styles.panel} aria-labelledby="kategorien-titel">
            <div className={styles.head}>
                <h2 id="kategorien-titel" className={styles.title}>
                    Kategorien
                </h2>
                <span className={styles.hint}>
                    {categories.length} von {LIMITS.count}. Ziehen oder mit den Pfeiltasten am Griff sortieren.
                </span>
            </div>

            <ol
                className={styles.list}
                onDragOver={(event) => {
                    if (dragged !== null) event.preventDefault();
                }}
            >
                {categories.map((category, index) => (
                    <div
                        key={category.id}
                        onDragEnter={() => {
                            if (dragged === null || dragged === index) return;
                            set(move(categories, dragged, index));
                            setDragged(index);
                        }}
                    >
                        <CategoryRow
                            category={category}
                            index={index}
                            count={countOf(category.id)}
                            total={categories.length}
                            meta={meta}
                            onChange={(next) => set(replaceAt(categories, index, next))}
                            onMove={(to) => set(move(categories, index, to))}
                            onRemove={() => set(categories.filter((_, other) => other !== index))}
                            dragging={dragged === index}
                            onDragStart={() => setDragged(index)}
                            onDragEnd={() => setDragged(null)}
                        />
                    </div>
                ))}
            </ol>

            <div className={styles.add}>
                <input
                    value={name}
                    maxLength={LIMITS.label.max}
                    placeholder="Name der neuen Kategorie"
                    aria-label="Name der neuen Kategorie"
                    aria-invalid={nameProblem !== null || undefined}
                    disabled={full}
                    onChange={(event) => setName(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") add();
                    }}
                />
                <Button size="sm" icon="plus" onClick={add} disabled={full || name.trim() === "" || nameProblem !== null}>
                    Kategorie anlegen
                </Button>
                <span className={styles.hint}>{full ? `Mehr als ${LIMITS.count} Kategorien gehen nicht.` : (nameProblem ?? (name.trim() ? `ID: ${id}` : "Die ID entsteht aus dem Namen und bleibt danach fest."))}</span>
            </div>

            <EditorBar doc={doc} />
        </section>
    );
}
