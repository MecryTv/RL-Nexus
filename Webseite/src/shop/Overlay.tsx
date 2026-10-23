import { type JSX, type ReactNode, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import styles from "./Overlay.module.scss";

export interface IOverlayProps {
    readonly labelledBy: string;
    readonly onClose: () => void;
    readonly className?: string;
    readonly children: ReactNode;
}

/**
 * Ein Fenster über der Seite für Kasse und Freischalten.
 *
 * Kein `<dialog>` mit showModal: Das legt sich in den Top Layer, und alles
 * andere wird inert, auch die Abfrage von 3-D Secure, die Stripe an `body`
 * hängt. Die läge dann unsichtbar oder unbedienbar darunter. Deshalb hier:
 * Portal an `body`, die eigentliche Seite (`#root`) inert, Esc schließt, und
 * beim Schließen bekommt das Element den Fokus zurück, das ihn vorher hatte.
 */
export function Overlay({ labelledBy, onClose, className, children }: IOverlayProps): JSX.Element {
    const box = useRef<HTMLDivElement>(null);
    // Immer der aktuelle Rückruf, ohne dass der Effekt bei jedem Rendern neu läuft.
    const close = useRef(onClose);

    useLayoutEffect(() => {
        close.current = onClose;
    });

    // Layout-Effekt: Sein Aufräumen läuft, bevor React das Fenster entfernt. So geht der Fokus sauber zurück.
    useLayoutEffect(() => {
        const root = document.getElementById("root");
        const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const onKey = (event: KeyboardEvent): void => {
            if (event.key === "Escape") close.current();
        };

        root?.setAttribute("inert", "");
        box.current?.focus();
        document.addEventListener("keydown", onKey);

        return () => {
            document.removeEventListener("keydown", onKey);
            root?.removeAttribute("inert");
            previous?.focus();
        };
    }, []);

    return createPortal(
        <div className={styles.backdrop}>
            <div ref={box} className={[styles.box, className].filter(Boolean).join(" ")} role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1}>
                {children}
            </div>
        </div>,
        document.body
    );
}
