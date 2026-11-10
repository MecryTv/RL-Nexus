import type { JSX, ReactNode } from "react";
import { Icon } from "../components/Icon";
import styles from "./Studio.module.scss";

export interface IStudioTray {
    readonly id: string;
    readonly label: string;
    /** Name aus `components/Icon.tsx`. */
    readonly icon: string;
    readonly content: ReactNode;
}

export interface IStudioProps {
    readonly title: ReactNode;
    /** Art, Ansicht, Stand und Knöpfe in der Leiste oben. */
    readonly bar: ReactNode;
    readonly undo: { readonly canUndo: boolean; readonly canRedo: boolean; readonly onUndo: () => void; readonly onRedo: () => void };
    readonly trays: readonly IStudioTray[];
    readonly openTray: string | null;
    readonly onTray: (id: string | null) => void;
    readonly stage: ReactNode;
    readonly inspector: ReactNode;
}

/**
 * W-0062 Teil 2: die Studio-Hülle nach `2026-10-31-studio-design.md`. Oben die
 * Leiste, links die Fächer (eins offen, zweiter Klick schließt), in der Mitte
 * die Bühne, rechts der Inspektor. Die Breite richtet sich nach dem Studio,
 * nicht nach dem Fenster (Container Query). W-0077 baut die übrigen Builder
 * darauf um.
 */
export function Studio({ title, bar, undo, trays, openTray, onTray, stage, inspector }: IStudioProps): JSX.Element {
    const open = trays.find((tray) => tray.id === openTray) ?? null;

    return (
        <section className={styles.studio} aria-label="Studio">
            <div className={styles.bar}>
                <h2 className={styles.title}>{title}</h2>
                <div className={styles.steps}>
                    <button type="button" className={styles.step} onClick={undo.onUndo} disabled={!undo.canUndo} aria-label="Rückgängig (Strg+Z)" title="Rückgängig (Strg+Z)">
                        <Icon name="undo" size={18} />
                    </button>
                    <button type="button" className={styles.step} onClick={undo.onRedo} disabled={!undo.canRedo} aria-label="Wiederholen (Strg+Y)" title="Wiederholen (Strg+Y)">
                        <Icon name="redo" size={18} />
                    </button>
                </div>
                <div className={styles.barSlot}>{bar}</div>
            </div>

            <div className={[styles.body, open ? styles.withTray : ""].filter(Boolean).join(" ")}>
                <nav className={styles.rail} aria-label="Fächer">
                    {trays.map((tray) => (
                        <button
                            key={tray.id}
                            type="button"
                            className={styles.railButton}
                            aria-pressed={tray.id === openTray}
                            aria-controls={`fach-${tray.id}`}
                            onClick={() => onTray(tray.id === openTray ? null : tray.id)}
                        >
                            <Icon name={tray.icon} size={20} />
                            <span>{tray.label}</span>
                        </button>
                    ))}
                </nav>

                {open && (
                    <aside className={styles.tray} id={`fach-${open.id}`} aria-label={open.label}>
                        <h3 className={styles.trayTitle}>{open.label}</h3>
                        {open.content}
                    </aside>
                )}

                <div className={styles.stage}>{stage}</div>

                <aside className={styles.inspector} aria-label="Inspektor">
                    {inspector}
                </aside>
            </div>
        </section>
    );
}

/** Eine Gruppe im Inspektor mit Überschrift. */
export function InspectorGroup({ title, children }: { readonly title: string; readonly children: ReactNode }): JSX.Element {
    return (
        <section className={styles.group}>
            <h3 className={styles.groupTitle}>{title}</h3>
            {children}
        </section>
    );
}
