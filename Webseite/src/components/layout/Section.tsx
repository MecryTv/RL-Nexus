import type { JSX, ReactNode } from "react";
import { useReveal } from "../../hooks/useReveal";
import styles from "./Section.module.scss";

export interface ISectionProps {
    readonly children: ReactNode;
    readonly id?: string;
    /** Ohne Innenabstand oben - für Abschnitte direkt unter einem anderen. */
    readonly flush?: boolean;
    readonly className?: string;
}

/**
 * Ein Abschnitt der Seite.
 *
 * Kümmert sich um den senkrechten Abstand und darum, dass der Inhalt beim
 * Hereinscrollen erscheint. Zusammen an einer Stelle, weil beides sonst in
 * jedem Abschnitt einzeln stünde - und der Abstand dabei jedes Mal ein bisschen
 * anders ausfiele.
 */
export function Section({ children, id, flush = false, className }: ISectionProps): JSX.Element {
    const ref = useReveal<HTMLElement>();

    return (
        <section
            ref={ref}
            className={[styles.section, flush && styles.flush, className].filter(Boolean).join(" ")}
            id={id}
        >
            {children}
        </section>
    );
}
