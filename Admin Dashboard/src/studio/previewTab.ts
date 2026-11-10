import { api } from "../api/client";
import type { ITarget } from "./PreviewStage";
import { readStageMessage } from "./stage.ts";

/**
 * „Vorschau ↗“: /vorschau in einem neuen Tab. Die Seite meldet sich dort beim
 * öffnenden Fenster; dann bekommt sie den Entwurf einmal.
 */
export async function openPreviewTab(message: unknown): Promise<void> {
    const target = await api<ITarget>("/api/content/vorschau");
    const tab = window.open(target.url, "_blank");

    if (!tab) return;

    const payload = JSON.stringify(message);

    function receive(event: MessageEvent): void {
        if (event.origin !== target.origin || event.source !== tab || readStageMessage(event.data)?.kind !== "bereit") return;

        tab!.postMessage(JSON.parse(payload), target.origin);
        window.removeEventListener("message", receive);
    }

    window.addEventListener("message", receive);
    // Kommt nichts, hört das Fenster nach einer Minute auf zu warten.
    window.setTimeout(() => window.removeEventListener("message", receive), 60_000);
}
