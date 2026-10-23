import { createContext, useContext } from "react";

export type ToastTone = "ok" | "danger";
export type Notify = (message: string, tone?: ToastTone) => void;

export const ToastContext = createContext<Notify | null>(null);

/** Kurze Rückmeldung unten rechts, etwa „Gespeichert“. Verschwindet von selbst. */
export function useToast(): Notify {
    const notify = useContext(ToastContext);
    if (notify === null) throw new Error("useToast() braucht den ToastProvider.");

    return notify;
}
