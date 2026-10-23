import { useEffect, useState } from "react";

/**
 * Ob die Seite über einen Schwellwert hinaus gescrollt ist.
 *
 * Der Kopf der Seite ist oben durchsichtig und wird beim Scrollen fest - dieser
 * Haken sagt ihm, wann. Der Zustand wechselt nur beim Überschreiten der
 * Schwelle, nicht bei jedem Scroll-Ereignis: sonst würde die Kopfzeile
 * hundertmal pro Sekunde neu gezeichnet, obwohl sich nichts ändert.
 */
export function useScrolled(threshold = 24): boolean {
    const [scrolled, setScrolled] = useState(() => window.scrollY > threshold);

    useEffect(() => {
        const onScroll = (): void => setScrolled(window.scrollY > threshold);

        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });

        return () => window.removeEventListener("scroll", onScroll);
    }, [threshold]);

    return scrolled;
}
