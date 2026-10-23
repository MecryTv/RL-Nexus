import type { CSSProperties, ElementType, JSX, ReactNode } from "react";
import styles from "./Panel.module.scss";

export interface IPanelProps {
    readonly children: ReactNode;
    /** Randfarbe, üblicherweise ein var(--c-*). */
    readonly accent?: string;
    readonly cut?: "sm" | "md" | "lg";
    /** Welches Element daraus wird: section, article, li ... */
    readonly as?: ElementType;
    readonly className?: string;
}

/** Ein dunkles Feld mit abgeschrägten Ecken, derselbe Baustein wie auf der Webseite. */
export function Panel({ children, accent, cut = "md", as: Tag = "div", className }: IPanelProps): JSX.Element {
    const classes = [styles.panel, styles[cut], className].filter(Boolean).join(" ");

    return (
        <Tag className={classes} style={accent !== undefined ? ({ "--accent": accent } as CSSProperties) : undefined}>
            {children}
        </Tag>
    );
}
