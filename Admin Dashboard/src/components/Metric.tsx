import type { JSX, ReactNode } from "react";
import { Panel } from "./Panel";
import styles from "./Metric.module.scss";

/** Eine Kennzahl: kleine Überschrift, großer Wert. Ohne Wert steht ein Strich, der Platz bleibt reserviert. */
export function Metric({ label, value }: { readonly label: string; readonly value: ReactNode }): JSX.Element {
    return (
        <Panel cut="sm" className={styles.metric}>
            <p className={styles.label}>{label}</p>
            <div className={styles.value}>{value ?? "—"}</div>
        </Panel>
    );
}
