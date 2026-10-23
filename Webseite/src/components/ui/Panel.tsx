import type { CSSProperties, ElementType, JSX, ReactNode } from "react";
import styles from "./Panel.module.scss";

export interface IPanelProps {
    readonly children: ReactNode;
    /** Randfarbe. Jede CSS-Farbe, üblicherweise ein `var(--c-mod-*)`. */
    readonly accent?: string;
    /** Hebt sich beim Überfahren an und leuchtet - für alles Anklickbare. */
    readonly interactive?: boolean;
    /** Ein sichtbares Leuchten auch im Ruhezustand. Sparsam einsetzen. */
    readonly glow?: boolean;
    /** Wie groß die abgeschrägte Ecke ist. */
    readonly cut?: "sm" | "md" | "lg";
    /** Welches Element daraus wird - `section`, `article`, `li`, ... */
    readonly as?: ElementType;
    readonly className?: string;
    readonly style?: CSSProperties;
}

/**
 * Ein dunkles Feld mit abgeschrägten Ecken und leuchtender Kante.
 *
 * Der Baustein, aus dem die Seite besteht - dasselbe Element, aus dem die
 * Rang-Karte des Bots besteht. Fast alles Sichtbare steht in einem davon.
 */
export function Panel({
    children,
    accent,
    interactive = false,
    glow = false,
    cut = "md",
    as: Tag = "div",
    className,
    style,
}: IPanelProps): JSX.Element {
    const classes = [styles.panel, styles[cut], interactive && styles.interactive, glow && styles.glow, className]
        .filter(Boolean)
        .join(" ");

    // Die Akzentfarbe geht als Custom Property hinein, nicht als `border-color`:
    // das Innenleben (Symbol, Zahlen, Fokusring) greift sie darüber ebenfalls ab.
    return (
        <Tag className={classes} style={accent !== undefined ? ({ ...style, "--accent": accent } as CSSProperties) : style}>
            {children}
        </Tag>
    );
}
