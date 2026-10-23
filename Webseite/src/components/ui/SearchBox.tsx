import type { JSX } from "react";
import { Icon } from "./Icon";
import styles from "./SearchBox.module.scss";

export interface ISearchBoxProps {
    readonly value: string;
    readonly onChange: (value: string) => void;
    readonly placeholder: string;
    /** Der Name für Bildschirmleser. Sichtbar steht nur die Lupe. */
    readonly label: string;
}

/** Das Suchfeld über den Listen - Module und Commands. */
export function SearchBox({ value, onChange, placeholder, label }: ISearchBoxProps): JSX.Element {
    return (
        <div className={styles.box}>
            <Icon name="search" size={18} />
            <input
                className={styles.input}
                type="search"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder={placeholder}
                aria-label={label}
            />
        </div>
    );
}
