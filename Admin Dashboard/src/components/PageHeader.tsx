import type { JSX, ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { pageOf } from "../nav/areas.ts";
import styles from "./PageHeader.module.scss";

/**
 * Kopf jeder Seite: Überschrift, der Satz zur Seite aus nav/areas.ts, eine
 * Zeile zu Stand oder Anzahl, rechts Aktionen.
 */
export function PageHeader({
    title,
    meta,
    children,
}: {
    readonly title: string;
    readonly meta?: string;
    readonly children?: ReactNode;
}): JSX.Element {
    const lead = pageOf(useLocation().pathname)?.page.description;

    return (
        <header className={styles.header}>
            <div>
                <h1 className={styles.title}>{title}</h1>
                {lead && <p className={styles.lead}>{lead}</p>}
                {meta && <p className={styles.meta}>{meta}</p>}
            </div>
            {children && <div className={styles.actions}>{children}</div>}
        </header>
    );
}
