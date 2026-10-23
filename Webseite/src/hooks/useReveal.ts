import { useEffect, useRef } from "react";

/**
 * Blendet ein Element ein, sobald es in Sicht kommt.
 *
 * Über einen `IntersectionObserver` statt über Scroll-Positionen: der Browser
 * meldet sich von selbst, statt dass bei jedem Scroll-Ereignis Maße berechnet
 * werden. Nach dem ersten Mal meldet sich der Beobachter ab - ein Abschnitt,
 * der sich beim Zurückscrollen wieder ausblendet, wirkt kaputt und nicht
 * lebendig.
 *
 * Wer Bewegung abbestellt hat, bekommt das Element sofort sichtbar; die
 * Zielzustände stehen im Stylesheet, nicht hier.
 */
export function useReveal<T extends HTMLElement>(): React.RefObject<T | null> {
    const ref = useRef<T>(null);

    useEffect(() => {
        const element = ref.current;

        if (element === null) return;

        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            element.dataset.revealed = "true";

            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry?.isIntersecting !== true) return;

                element.dataset.revealed = "true";
                observer.disconnect();
            },
            // Etwas vor dem unteren Rand auslösen, damit die Bewegung fertig
            // ist, wenn der Abschnitt tatsächlich gelesen wird.
            { rootMargin: "0px 0px -12% 0px", threshold: 0.05 }
        );

        observer.observe(element);

        return () => observer.disconnect();
    }, []);

    return ref;
}
