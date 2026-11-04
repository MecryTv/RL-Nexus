import { useEffect, useRef } from "react";

/** W-0065: So oft und so schnell fragt eine Liste nach, solange der Server noch Namen bei Discord holt. */
const NAME_REFILLS = 30;
const NAME_REFILL_MS = 2_000;

/**
 * Fehlende Namen holt der Server im Hintergrund (namesPending in der Antwort).
 * Kurz danach noch einmal fragen, höchstens 30 Mal (eine Minute) hintereinander. Eine neue
 * Seite, ein neuer Filter oder eine neue Suche (key) fängt wieder von vorn an.
 */
export function useNameRefill(pending: number, reload: () => void, key: string, data: unknown): void {
    const refills = useRef(0);

    useEffect(() => {
        refills.current = 0;
    }, [key]);

    useEffect(() => {
        if (pending === 0) {
            refills.current = 0;

            return;
        }
        if (refills.current >= NAME_REFILLS) return;

        const timer = setTimeout(() => {
            refills.current += 1;
            reload();
        }, NAME_REFILL_MS);

        return () => clearTimeout(timer);
    }, [data, pending, reload]);
}
