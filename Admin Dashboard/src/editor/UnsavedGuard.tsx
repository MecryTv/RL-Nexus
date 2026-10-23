import { useEffect, type JSX } from "react";
import { useBlocker } from "react-router-dom";
import { ConfirmDialog } from "../components/ConfirmDialog";

/**
 * Warnt, wenn ein Editor mit ungespeicherten Änderungen verlassen wird: beim
 * Wechsel im Router mit einer eigenen Rückfrage, beim Schließen oder
 * Neuladen des Tabs mit der des Browsers (deren Text lässt sich nicht ändern).
 */
export function UnsavedGuard({ dirty }: { readonly dirty: boolean }): JSX.Element {
    const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);

    useEffect(() => {
        if (!dirty) return;

        const warn = (event: BeforeUnloadEvent): void => event.preventDefault();

        window.addEventListener("beforeunload", warn);

        return () => window.removeEventListener("beforeunload", warn);
    }, [dirty]);

    return (
        <ConfirmDialog
            open={blocker.state === "blocked"}
            title="Änderungen verwerfen?"
            confirmLabel="Verwerfen"
            tone="danger"
            onConfirm={() => {
                if (blocker.state === "blocked") blocker.proceed();
            }}
            onCancel={() => {
                if (blocker.state === "blocked") blocker.reset();
            }}
        >
            <p>Du hast hier etwas geändert und noch nicht gespeichert. Verlässt du die Seite, ist das weg.</p>
        </ConfirmDialog>
    );
}
