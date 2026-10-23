import { useEffect, useId, useRef, type JSX, type ReactNode } from "react";
import { Button } from "./Button";
import { Panel } from "./Panel";
import styles from "./ConfirmDialog.module.scss";

export interface IConfirmDialogProps {
    readonly open: boolean;
    readonly title: string;
    readonly children: ReactNode;
    readonly confirmLabel: string;
    /** danger für alles, was sich nicht zurücknehmen lässt. */
    readonly tone?: "primary" | "danger";
    readonly busy?: boolean;
    readonly onConfirm: () => void;
    readonly onCancel: () => void;
}

/**
 * Rückfrage vor allem, was sich schwer zurücknehmen lässt. Das native
 * <dialog> bringt Fokusfalle und Escape mit. Beim Öffnen landet der Fokus auf
 * dem ersten Knopf, und das ist „Abbrechen“: wer nur Enter drückt, löscht
 * nichts.
 */
export function ConfirmDialog({ open, title, children, confirmLabel, tone = "primary", busy = false, onConfirm, onCancel }: IConfirmDialogProps): JSX.Element {
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
            className={styles.dialog}
            aria-labelledby={titleId}
            onCancel={(event) => {
                event.preventDefault();
                if (!busy) onCancel();
            }}
            // Chrome schließt nach dem zweiten Escape auch gegen preventDefault.
            // Dann zieht der Zustand hier nach, sonst ginge der Dialog nie wieder auf.
            // Das close kommt verzögert: Ist der Dialog inzwischen wieder offen, gilt es nicht mehr.
            onClose={(event) => {
                if (open && !event.currentTarget.open) onCancel();
            }}
        >
            <Panel className={styles.panel}>
                <h2 id={titleId} className={styles.title}>
                    {title}
                </h2>
                <div className={styles.body}>{children}</div>
                <div className={styles.actions}>
                    <Button variant="ghost" onClick={onCancel} disabled={busy}>
                        Abbrechen
                    </Button>
                    <Button variant={tone} onClick={onConfirm} busy={busy}>
                        {confirmLabel}
                    </Button>
                </div>
            </Panel>
        </dialog>
    );
}
