import type { JSX, ReactNode } from "react";
import { ModuleStatus } from "../../domain/enums/ModuleCategory";
import styles from "./Badge.module.scss";

export interface IBadgeProps {
    readonly children: ReactNode;
    /** Färbt das Abzeichen nach dem Stand des Moduls. */
    readonly status?: ModuleStatus;
    /** Freie Farbe, wenn es nicht um einen Modulstand geht. */
    readonly accent?: string;
    readonly className?: string;
}

const STATUS_CLASS: Readonly<Record<ModuleStatus, string>> = {
    [ModuleStatus.Live]: styles.live,
    [ModuleStatus.Beta]: styles.beta,
    [ModuleStatus.Planned]: styles.planned,
};

/**
 * Ein kleines Schild - Modulstand, Kategorie, Hinweis.
 *
 * Der Punkt davor trägt die Farbe, nicht der Text: farbige Schrift auf dunklem
 * Grund wird bei dieser Größe schnell schlecht lesbar, ein Punkt daneben nicht.
 */
export function Badge({ children, status, accent, className }: IBadgeProps): JSX.Element {
    const classes = [styles.badge, status !== undefined && STATUS_CLASS[status], className].filter(Boolean).join(" ");

    return (
        <span className={classes} style={accent !== undefined ? { color: accent } : undefined}>
            <span className={styles.dot} aria-hidden="true" />
            {children}
        </span>
    );
}
