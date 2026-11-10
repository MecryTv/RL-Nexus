import { useEffect, useState } from "react";

/**
 * W-0062: Wann jemand zuletzt in den News oder im Changelog war. Daran hängt die
 * „Neu“-Marke und der rote Punkt am Menüpunkt Changelog. Liegt im localStorage
 * und steht in der Datenschutzerklärung. Ohne Speicher (privater Modus) ist eben
 * nichts als neu markiert.
 */
const KEY = "rlnexus.news.besuch";

export function readLastVisit(): string | null {
    try {
        return localStorage.getItem(KEY);
    } catch {
        return null;
    }
}

/**
 * Der Stand von vorher für diese Seite. Mit `remember` setzt die Seite beim
 * Verlassen den neuen Zeitpunkt, damit die Marken beim Lesen nicht verschwinden.
 */
export function useLastVisit(remember: boolean): string | null {
    const [before] = useState(readLastVisit);

    useEffect(() => {
        if (!remember) return;

        return () => {
            try {
                localStorage.setItem(KEY, new Date().toISOString());
            } catch {
                // Ohne Speicher gibt es keine Marken.
            }
        };
    }, [remember]);

    return before;
}
