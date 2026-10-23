import { useId, type JSX } from "react";
import styles from "./Switch.module.scss";

/** Ein Schalter wie auf Banner- und Modulseite: ein echtes Kästchen mit Text daneben, auf Wunsch mit Hinweis darunter. */
export function Switch({
    checked,
    label,
    onChange,
    hint,
    disabled = false,
}: {
    readonly checked: boolean;
    readonly label: string;
    readonly onChange: (checked: boolean) => void;
    readonly hint?: string;
    readonly disabled?: boolean;
}): JSX.Element {
    const hintId = useId();

    return (
        <div className={styles.wrap}>
            <label className={styles.switch}>
                <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={(event) => onChange(event.target.checked)}
                    aria-describedby={hint ? hintId : undefined}
                />
                <span>{label}</span>
            </label>
            {hint && (
                <p id={hintId} className={styles.hint}>
                    {hint}
                </p>
            )}
        </div>
    );
}
