import { useEffect, useId, useRef, type JSX, type ReactNode } from "react";
import { Button } from "./Button";
import { Icon } from "./Icon";
import styles from "./SidePanel.module.scss";

/**
 * Ein Panel, das von rechts hereinkommt, zum Bearbeiten eines Eintrags neben
 * der Liste. Das native <dialog> bringt Fokusfalle und Escape mit. Änderungen
 * landen sofort im Entwurf der Seite, „Fertig“ schließt nur. Mit `footer`
 * speichert die Seite selbst, etwa beim Shop, wo jedes Speichern zu Stripe geht.
 */
export function SidePanel({
    open,
    title,
    onClose,
    footer,
    children,
}: {
    readonly open: boolean;
    readonly title: string;
    readonly onClose: () => void;
    /** Ersetzt den Knopf „Fertig“, etwa durch Speichern und Abbrechen. */
    readonly footer?: ReactNode;
    readonly children: ReactNode;
}): JSX.Element {
    const ref = useRef<HTMLDialogElement>(null);
    const titleId = useId();

    useEffect(() => {
        const dialog = ref.current;
        if (!dialog) return;

        if (open && !dialog.open) dialog.showModal();
        if (!open && dialog.open) dialog.close();
    }, [open]);

    return (
        <dialog
            ref={ref}
            className={styles.panel}
            aria-labelledby={titleId}
            // React reicht cancel und close eines Dialogs im Panel (etwa einer Rückfrage) bis hierher durch. Nur die eigenen zählen.
            onCancel={(event) => {
                if (event.target !== event.currentTarget) return;
                event.preventDefault();
                onClose();
            }}
            onClose={(event) => {
                // Ein verspätetes close nach dem Wiederöffnen zählt nicht.
                if (event.target === event.currentTarget && open && !event.currentTarget.open) onClose();
            }}
        >
            <header className={styles.head}>
                <h2 id={titleId} className={styles.title}>
                    {title}
                </h2>
                <button type="button" className={styles.close} onClick={onClose}>
                    <Icon name="close" />
                    <span className="u-sr">Panel schließen</span>
                </button>
            </header>
            <div className={styles.body}>{open && children}</div>
            <footer className={styles.foot}>
                {footer ?? (
                    <Button variant="primary" onClick={onClose}>
                        Fertig
                    </Button>
                )}
            </footer>
        </dialog>
    );
}
