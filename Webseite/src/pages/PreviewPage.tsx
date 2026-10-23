import { useEffect, useState, type JSX } from "react";
import { ModuleCard } from "../components/ui/ModuleCard";
import { ModuleStatus } from "../domain/enums/ModuleCategory";
import { BotModule } from "../domain/models/BotModule";
import { isPreviewMessage, type IPreviewMessage } from "../services/Content";
import { setCategories } from "../services/categories";
import { ModuleDetailView } from "./ModuleDetailPage";
import styles from "./PreviewPage.module.scss";

/** Nur dieser Rahmen darf Entwürfe schicken. Alles andere wird ignoriert. */
const ADMIN_ORIGIN = import.meta.env.VITE_ADMIN_ORIGIN || (import.meta.env.DEV ? "http://localhost:5174" : "https://admin.nexus-emb.de");
const STATUSES = Object.values(ModuleStatus);

/**
 * Die Live-Vorschau für den Modul-Editor im Admin Dashboard.
 *
 * Ohne Kopf, Fuß und Banner und nicht für Suchmaschinen. Das Dashboard bettet
 * die Seite ein und schickt per postMessage den Entwurf. Gezeigt wird er mit
 * denselben Komponenten wie auf der echten Seite: Kachel oder Detailseite.
 * Nachrichten durchlaufen dieselben Prüfungen wie geladene Inhalte.
 */
export function PreviewPage(): JSX.Element {
    const [message, setMessage] = useState<IPreviewMessage | null>(null);

    useEffect(() => {
        const robots = document.createElement("meta");
        robots.name = "robots";
        robots.content = "noindex";
        document.head.append(robots);
        document.title = "Vorschau";

        function receive(event: MessageEvent): void {
            if (event.origin !== ADMIN_ORIGIN || !isPreviewMessage(event.data, STATUSES)) return;

            setCategories(event.data.categories);
            setMessage(event.data);
        }

        window.addEventListener("message", receive);
        // Sagen, dass die Seite bereit ist. Erst danach schickt das Dashboard den Entwurf.
        if (window.parent !== window) window.parent.postMessage({ type: "rlnexus:vorschau-bereit" }, ADMIN_ORIGIN);

        return () => {
            window.removeEventListener("message", receive);
            robots.remove();
        };
    }, []);

    if (message === null) return <p className={styles.wait}>Warte auf den Entwurf aus dem Admin Dashboard …</p>;

    const module = new BotModule({ ...message.module, ...(message.commands.length > 0 ? { commands: message.commands.map((entry) => entry.path) } : {}) });

    return message.view === "kachel" ? (
        <div className={styles.card}>
            <ModuleCard module={module} />
        </div>
    ) : (
        <ModuleDetailView module={module} detail={message.detail} />
    );
}
