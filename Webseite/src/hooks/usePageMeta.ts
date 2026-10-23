import { useEffect } from "react";
import { siteConfig } from "../services/SiteConfig";

/**
 * Setzt Titel und Beschreibung der Seite.
 *
 * Eine Einzelseiten-Anwendung wechselt den Inhalt, ohne dass der Browser eine
 * neue Seite lädt - Titel und Meta-Beschreibung bleiben sonst auf dem Stand des
 * ersten Aufrufs. Das sieht man im Tab, im Verlauf und in jedem Lesezeichen.
 *
 * Reicht für eine Bibliothek wie react-helmet nicht aus, sobald die Seite
 * serverseitig gerendert werden soll - für eine rein clientseitige Seite ist
 * das hier alles, was passieren muss.
 */
export function usePageMeta(title: string, description?: string): void {
    useEffect(() => {
        document.title = `${title} · ${siteConfig.name}`;

        if (description === undefined) return;

        const tag = document.querySelector<HTMLMetaElement>('meta[name="description"]');

        if (tag !== null) tag.content = description;
    }, [title, description]);
}
