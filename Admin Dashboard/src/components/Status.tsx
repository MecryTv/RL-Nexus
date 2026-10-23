import type { JSX, ReactNode } from "react";
import { Button } from "./Button";
import { Icon } from "./Icon";
import styles from "./Status.module.scss";

/** Lädt noch. role="status", damit Bildschirmleser es ansagen. */
export function Loading({ label = "Lädt" }: { readonly label?: string }): JSX.Element {
    return (
        <div className={styles.loading} role="status">
            <span className={styles.spinner} aria-hidden="true" />
            <span>{label}</span>
        </div>
    );
}

/** Etwas ist schiefgegangen: was, und ein Weg weiter. */
export function Failure({ message, onRetry }: { readonly message: string; readonly onRetry?: () => void }): JSX.Element {
    return (
        <div className={styles.failure} role="alert">
            <Icon name="alert" size={18} />
            <p>{message}</p>
            {onRetry && (
                <Button size="sm" icon="refresh" onClick={onRetry}>
                    Neu laden
                </Button>
            )}
        </div>
    );
}

/** Ganzer Bildschirm, Inhalt in der Mitte. Für den Moment vor der Shell. */
export function Centered({ children }: { readonly children: ReactNode }): JSX.Element {
    return <div className={styles.centered}>{children}</div>;
}
