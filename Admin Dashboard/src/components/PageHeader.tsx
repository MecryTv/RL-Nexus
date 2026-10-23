import type { JSX, ReactNode } from "react";
import styles from "./PageHeader.module.scss";

/** Kopf jeder Seite: Überschrift, eine Zeile zu Stand oder Anzahl, rechts Aktionen. */
export function PageHeader({
    title,
    meta,
    children,
}: {
    readonly title: string;
    readonly meta?: string;
    readonly children?: ReactNode;
}): JSX.Element {
    return (
        <header className={styles.header}>
            <div>
                <h1 className={styles.title}>{title}</h1>
                {meta && <p className={styles.meta}>{meta}</p>}
            </div>
            {children && <div className={styles.actions}>{children}</div>}
        </header>
    );
}
