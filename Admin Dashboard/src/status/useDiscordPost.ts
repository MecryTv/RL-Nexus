import { useState } from "react";
import type { IDiscordPostResult, IDiscordPostState } from "../../shared/status";
import { api } from "../api/client";
import { useApi, type IApiState } from "../api/useApi";
import { useToast } from "../toast/context";
import { postSummary } from "./discord.ts";

export interface IDiscordPost {
    readonly state: IApiState<IDiscordPostState>;
    readonly busy: boolean;
    /** Bis wann der Knopf noch aus ist (Millisekunden), aus der Antwort des Servers. */
    readonly waitUntil: number;
    readonly refresh: () => Promise<void>;
}

/**
 * „In Discord aktualisieren“ (W-0052). Eine Instanz je Seite, damit Knopf im
 * Kopf und Karte denselben Stand haben. Die Sperre von zehn Sekunden prüft
 * der Server; hier steht nur, wie lange der Knopf aus bleibt.
 */
export function useDiscordPost(): IDiscordPost {
    const state = useApi<IDiscordPostState>("/api/status/discord", 60_000);
    const notify = useToast();
    const [busy, setBusy] = useState(false);
    const waitUntil = state.data && state.updatedAt !== null ? state.updatedAt + state.data.waitSeconds * 1000 : 0;

    async function refresh(): Promise<void> {
        setBusy(true);

        try {
            const summary = postSummary(await api<IDiscordPostResult>("/api/status/discord", { method: "POST", body: {} }));

            notify(summary.text, summary.ok ? "ok" : "danger");
        } catch (error) {
            notify(error instanceof Error ? error.message : String(error), "danger");
        } finally {
            setBusy(false);
            // Neuer Stand: zuletzt, nächste Runde und wie lange der Knopf aus bleibt.
            state.reload();
        }
    }

    return { state, busy, waitUntil, refresh };
}
