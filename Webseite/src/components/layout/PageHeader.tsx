import type { JSX, ReactNode } from "react";
import styles from "./PageHeader.module.scss";

export interface IPageHeaderProps {
    readonly eyebrow: string;
    readonly title: ReactNode;
    readonly lead?: ReactNode;
    readonly children?: ReactNode;
}

/**
 * Der Kopf einer Unterseite.
 *
 * Dasselbe Muster wie der Hero der Startseite, nur schmaler und ohne Bild -
 * damit man beim Wechsel zwischen den Seiten nicht das Gefühl hat, woanders
 * gelandet zu sein.
 */
export function PageHeader({ eyebrow, title, lead, children }: IPageHeaderProps): JSX.Element {
    return (
        <header className={styles.header}>
            <div className={["u-shell", styles.inner].join(" ")}>
                <p className={styles.eyebrow}>
                    <span className={styles.rule} aria-hidden="true" />
                    {eyebrow}
                </p>
                <h1 className={styles.title}>{title}</h1>
                {lead !== undefined && <p className={styles.lead}>{lead}</p>}
                {children}
            </div>
        </header>
    );
}
