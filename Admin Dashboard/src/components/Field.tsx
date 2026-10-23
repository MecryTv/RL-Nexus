import type { JSX, ReactNode } from "react";
import styles from "./Field.module.scss";

/**
 * Ein Feld mit sichtbarem Label, Hinweis und Fehler darunter. Das Eingabefeld
 * kommt als Kind und trägt `id={id}`. Hinweis und Fehler stehen unter
 * `${id}-hint` und `${id}-error`, für aria-describedby am Eingabefeld. Der
 * Zähler ist nur fürs Auge: maxLength am Feld setzt die Grenze, und ein
 * Bildschirmleser soll nicht jeden Tastendruck mitzählen.
 */
export function Field({
    id,
    label,
    hint,
    error,
    counter,
    children,
}: {
    readonly id: string;
    readonly label: string;
    readonly hint?: string;
    readonly error?: string;
    readonly counter?: { readonly value: number; readonly max: number };
    readonly children: ReactNode;
}): JSX.Element {
    return (
        <div className={styles.field}>
            <div className={styles.head}>
                <label htmlFor={id} className={styles.label}>
                    {label}
                </label>
                {counter && (
                    <span className={styles.counter} aria-hidden="true">
                        {counter.value} / {counter.max}
                    </span>
                )}
            </div>
            {children}
            {hint && (
                <p id={`${id}-hint`} className={styles.hint}>
                    {hint}
                </p>
            )}
            {error && (
                <p id={`${id}-error`} className={styles.error}>
                    {error}
                </p>
            )}
        </div>
    );
}
