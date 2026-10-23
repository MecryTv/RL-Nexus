import { useState, type JSX } from "react";
import type { ICommandsContent, IEnvelope } from "../../shared/content";
import { api } from "../api/client";
import { useLive } from "../api/live";
import { useApi } from "../api/useApi";
import { Button } from "../components/Button";
import { Loading } from "../components/Status";
import { formatDateTime } from "../format";
import { useToast } from "../toast/context";
import styles from "./BotCommands.module.scss";

/**
 * Die Commands eines Moduls, nur zum Ansehen: Sie kommen aus dem Bot
 * (commands.json), der Server gleicht alle fünf Minuten ab. „Jetzt abholen“
 * fragt sofort. Meldet der Bot für das Modul nichts, zeigt die Webseite weiter
 * die Commands aus modules.json, die stehen hier als „bisher“.
 */
export function BotCommands({ moduleId, fallback }: { readonly moduleId: string; readonly fallback: readonly string[] }): JSX.Element {
    const notify = useToast();
    const state = useApi<IEnvelope<ICommandsContent | null>>("/api/content/commands");
    const [busy, setBusy] = useState(false);
    const content = state.data?.data ?? null;
    const commands = content?.modules[moduleId] ?? [];

    useLive("content", state.reload);

    async function fetchNow(): Promise<void> {
        setBusy(true);

        try {
            const result = await api<{ readonly result: "changed" | "same" }>("/api/content/commands/abholen", { method: "POST" });
            notify(result.result === "changed" ? "Neue Commands vom Bot übernommen" : "Die Commands sind schon auf dem Stand des Bots");
            state.reload();
        } catch (failure) {
            notify(failure instanceof Error ? failure.message : String(failure), "danger");
        } finally {
            setBusy(false);
        }
    }

    return (
        <fieldset className={styles.box}>
            <legend className={styles.legend}>Commands</legend>

            {!state.data ? (
                <Loading label="Commands werden geladen" />
            ) : commands.length > 0 ? (
                <ul className={styles.list}>
                    {commands.map((entry) => (
                        <li key={entry.path}>
                            <code>/{entry.path}</code>
                            <span>{entry.description}</span>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className={styles.note}>
                    Der Bot meldet für dieses Modul keine Commands.
                    {fallback.length > 0 && <> Bisher auf der Webseite: {fallback.map((entry) => `/${entry}`).join(", ")}.</>}
                </p>
            )}

            <div className={styles.foot}>
                <span>
                    {content === null
                        ? "Noch nichts vom Bot abgeholt."
                        : `Stand ${formatDateTime(content.updatedAt)} · aus dem Bot`}
                </span>
                <Button size="sm" icon="refresh" busy={busy} onClick={() => void fetchNow()}>
                    Jetzt abholen
                </Button>
            </div>
        </fieldset>
    );
}
