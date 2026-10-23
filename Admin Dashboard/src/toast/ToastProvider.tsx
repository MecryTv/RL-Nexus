import { useCallback, useRef, useState, type JSX, type ReactNode } from "react";
import { Icon } from "../components/Icon";
import { ToastContext, type ToastTone } from "./context";
import styles from "./Toast.module.scss";

interface IToast {
    readonly id: number;
    readonly message: string;
    readonly tone: ToastTone;
}

const DURATION = 4000;
/** Mehr als drei auf einmal liest niemand. */
const MAX_VISIBLE = 3;

export function ToastProvider({ children }: { readonly children: ReactNode }): JSX.Element {
    const [toasts, setToasts] = useState<readonly IToast[]>([]);
    const next = useRef(0);

    const dismiss = useCallback((id: number) => setToasts((list) => list.filter((toast) => toast.id !== id)), []);

    const notify = useCallback(
        (message: string, tone: ToastTone = "ok") => {
            const id = ++next.current;

            setToasts((list) => [...list.slice(-(MAX_VISIBLE - 1)), { id, message, tone }]);
            window.setTimeout(() => dismiss(id), DURATION);
        },
        [dismiss]
    );

    return (
        <ToastContext value={notify}>
            {children}
            <div className={styles.stack} role="status" aria-live="polite">
                {toasts.map((toast) => (
                    <div key={toast.id} className={[styles.toast, styles[toast.tone]].join(" ")}>
                        <Icon name={toast.tone === "ok" ? "check" : "alert"} size={18} />
                        <p>{toast.message}</p>
                        <button type="button" className={styles.close} onClick={() => dismiss(toast.id)}>
                            <Icon name="close" size={16} />
                            <span className="u-sr">Hinweis schließen</span>
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext>
    );
}
