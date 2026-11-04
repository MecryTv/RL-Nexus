import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

/* Selbst ausgeliefert, nur die Schnitte, die vorkommen, und nur latin, wie auf der Webseite. */
import "@fontsource/oxanium/latin-400.css";
import "@fontsource/oxanium/latin-500.css";
import "@fontsource/oxanium/latin-700.css";
import "@fontsource/oxanium/latin-800.css";
import "@fontsource/rajdhani/latin-600.css";
import "@fontsource/orbitron/latin-700.css";
import "./styles/main.scss";

/**
 * Nach einem Deploy fehlen einem offenen Tab die alten Dateien (neue Prüfsumme
 * im Namen). Lädt ein Teil nicht, holt sich die Seite einmal neu, statt mit
 * „Unable to preload CSS“ stehen zu bleiben. Höchstens einmal je Minute, sonst
 * liefe ein echter Fehler im Kreis.
 */
window.addEventListener("vite:preloadError", (event) => {
    const key = "rln:neu-geladen";
    let last = 0;

    try {
        last = Number(sessionStorage.getItem(key) ?? 0);
        sessionStorage.setItem(key, String(Date.now()));
    } catch {
        // Ohne Speicher (privates Fenster): trotzdem einmal neu laden.
    }
    if (Date.now() - last < 60_000) return;

    event.preventDefault();
    window.location.reload();
});

const container = document.getElementById("root");

// Ohne das Wurzelelement gibt es nichts zu tun.
if (container === null) throw new Error("Kein Element mit der ID 'root' gefunden.");

createRoot(container).render(
    <StrictMode>
        <App />
    </StrictMode>
);

/**
 * Den Ladeschirm aus index.html wegnehmen.
 *
 * Erst ausblenden, dann aus dem Baum nehmen: Bleibt er stehen, liegt er über
 * allem. Angestoßen wird das zweifach, weil beide Wege je einen Fall nicht
 * abdecken: `requestAnimationFrame` wartet aufs erste Bild, läuft aber in
 * einem Tab im Hintergrund gar nicht - wer das Dashboard in einem zweiten Tab
 * öffnet, säße sonst vor dem Ladeschirm. Der Zeitgeber läuft immer, zeigt für
 * sich allein aber kurz einen leeren Rahmen. Doppelt aufgerufen schadet
 * nichts: Beim zweiten Mal ist nichts mehr zu tun.
 */
const start = document.getElementById("start");

if (start !== null) {
    const hide = (): void => {
        if (!start.isConnected) return;

        start.classList.add("gone");
        start.addEventListener("transitionend", () => start.remove(), { once: true });
        // Ohne Übergang (abbestellte Bewegung, Hintergrund-Tab) feuert transitionend nie.
        setTimeout(() => start.remove(), 600);
    };

    requestAnimationFrame(hide);
    setTimeout(hide, 400);
}
