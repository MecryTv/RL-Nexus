import type { JSX, ReactNode } from "react";
import styles from "./SectionHeading.module.scss";

export interface ISectionHeadingProps {
    /** Die Zeile über der Überschrift, klein und gesperrt. */
    readonly eyebrow?: string;
    readonly title: ReactNode;
    readonly lead?: ReactNode;
    /** Mittig statt linksbündig - für Abschnitte, die die volle Breite haben. */
    readonly centered?: boolean;
    /** Farbe der Zierlinie und der Zeile darüber. */
    readonly accent?: string;
    readonly id?: string;
    readonly className?: string;
}

/**
 * Der Kopf eines Abschnitts: Zeile, Überschrift, Einleitung.
 *
 * Steht in jedem Abschnitt der Seite. Als eigene Komponente, damit der Abstand
 * zwischen den drei Teilen überall derselbe ist - genau das rutscht sonst von
 * Abschnitt zu Abschnitt um ein paar Pixel auseinander.
 */
export function SectionHeading({
    eyebrow,
    title,
    lead,
    centered = false,
    accent,
    id,
    className,
}: ISectionHeadingProps): JSX.Element {
    const classes = [styles.heading, centered && styles.centered, className].filter(Boolean).join(" ");

    return (
        <header className={classes} style={accent !== undefined ? { color: accent } : undefined}>
            {eyebrow !== undefined && (
                <p className={styles.eyebrow}>
                    <span className={styles.rule} aria-hidden="true" />
                    {eyebrow}
                </p>
            )}
            <h2 className={styles.title} id={id}>
                {title}
            </h2>
            {lead !== undefined && <p className={styles.lead}>{lead}</p>}
        </header>
    );
}
