import type { JSX, ReactNode } from "react";
import styles from "./Badge.module.scss";

export type BadgeTone = "ok" | "warn" | "danger" | "info" | "pro" | "neutral";

/**
 * Ein kleines Schild: Status, Rolle, Modul. Der Punkt trägt die Farbe, das
 * Wort daneben die Bedeutung. Die Farbe steht nie allein.
 */
export function Badge({
    children,
    tone = "neutral",
    className,
}: {
    readonly children: ReactNode;
    readonly tone?: BadgeTone;
    readonly className?: string;
}): JSX.Element {
    return (
        <span className={[styles.badge, styles[tone], className].filter(Boolean).join(" ")}>
            <span className={styles.dot} aria-hidden="true" />
            {children}
        </span>
    );
}
