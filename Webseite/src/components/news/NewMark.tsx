import type { JSX } from "react";
import styles from "./news.module.scss";

/** W-0062: „Neu“ seit dem letzten Besuch. */
export function NewMark(): JSX.Element {
    return <span className={styles.newMark}>Neu</span>;
}
