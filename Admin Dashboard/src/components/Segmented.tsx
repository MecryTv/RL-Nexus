import type { JSX } from "react";
import styles from "./Segmented.module.scss";

export interface ISegmentedOption<T extends string> {
    readonly value: T;
    readonly label: string;
}

/** Eine Auswahl aus wenigen Möglichkeiten nebeneinander. Echte Radio-Knöpfe, also Pfeiltasten und Vorleser inklusive. */
export function Segmented<T extends string>({
    name,
    legend,
    options,
    value,
    onChange,
}: {
    readonly name: string;
    readonly legend: string;
    readonly options: readonly ISegmentedOption<T>[];
    readonly value: T;
    readonly onChange: (value: T) => void;
}): JSX.Element {
    return (
        <fieldset className={styles.group}>
            <legend className={styles.legend}>{legend}</legend>
            <div className={styles.options}>
                {options.map((option) => (
                    <label key={option.value} className={styles.option}>
                        <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
                        <span>{option.label}</span>
                    </label>
                ))}
            </div>
        </fieldset>
    );
}
