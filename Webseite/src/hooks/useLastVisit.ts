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
 * Der Stand von vorher für diese Seite. Mit `remember` setzt die Seite gleich
 * beim Öffnen den neuen Zeitpunkt: Wer den Tab schließt, verlässt die Seite
 * nicht, und ein Schreiben erst beim Verlassen ginge dann verloren. Die Marken
 * auf dieser Seite bleiben trotzdem, weil `before` beim ersten Rendern gelesen
 * wird und im Zustand bleibt.
 */
export function useLastVisit(remember: boolean): string | null {
    const [before] = useState(readLastVisit);

    useEffect(() => {
        if (!remember) return;

        try {
            localStorage.setItem(KEY, new Date().toISOString());
        } catch {
            // Ohne Speicher gibt es keine Marken.
        }
    }, [remember]);

    return before;
}
