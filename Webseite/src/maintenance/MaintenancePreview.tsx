import { useEffect, useState, type JSX } from "react";
import { parseMaintenance, type IWebsiteMaintenance } from "./logic";
import { MaintenanceScreen } from "./MaintenanceScreen";

/** Nur dieser Rahmen darf Werte schicken, wie bei der Vorschau im Modul-Editor (pages/PreviewPage.tsx). */
const ADMIN_ORIGIN = import.meta.env.VITE_ADMIN_ORIGIN || (import.meta.env.DEV ? "http://localhost:5174" : "https://admin.nexus-emb.de");

/**
 * Die Vorschau des Wartungsbildschirms für das Admin Dashboard (/vorschau/wartung).
 * Die Werte kommen per postMessage und durchlaufen dieselbe Prüfung wie die
 * Antwort von /api/wartung. Aus der Adresse liest die Seite nichts: Sonst ließe
 * sich ein Link bauen, der fremden Text als Wartungsmeldung zeigt.
 */
export function MaintenancePreview(): JSX.Element {
    const [state, setState] = useState<IWebsiteMaintenance | null>(null);

    useEffect(() => {
        const robots = document.createElement("meta");
        robots.name = "robots";
        robots.content = "noindex";
        document.head.append(robots);
        document.title = "Vorschau";

        function receive(event: MessageEvent): void {
            const data = event.data as { type?: unknown; state?: unknown } | null;

            if (event.origin !== ADMIN_ORIGIN || data?.type !== "rlnexus:wartung") return;

            const parsed = parseMaintenance({ website: data.state });
            if (parsed) setState(parsed);
        }

        window.addEventListener("message", receive);
        if (window.parent !== window) window.parent.postMessage({ type: "rlnexus:vorschau-bereit" }, ADMIN_ORIGIN);

        return () => {
            window.removeEventListener("message", receive);
            robots.remove();
        };
    }, []);

    if (state === null) return <p style={{ padding: 24, color: "var(--c-text-dim)" }}>Warte auf die Werte aus dem Admin Dashboard …</p>;

    return <MaintenanceScreen state={state} preview />;
}
