import { useEffect, useRef, useState, type JSX } from "react";
import { Link } from "react-router-dom";
import type { IBotStatus } from "../../shared/api";
import { api } from "../api/client";
import { useToast } from "../toast/context";
import { Button } from "./Button";
import { ConfirmDialog } from "./ConfirmDialog";
import styles from "./RestartBot.module.scss";

const POLL = 2000;
const LIMIT = 90_000;

/**
 * Bot neu starten und warten, bis er wieder da ist. Nur für Developer, der
 * Server prüft das selbst. Zurück heißt: Der Bot meldet ein anderes
 * startedAt als vor dem Neustart.
 */
export function RestartBot({ onBack }: { readonly onBack: () => void }): JSX.Element {
    const notify = useToast();
    const [asking, setAsking] = useState(false);
    const [waiting, setWaiting] = useState(false);
    const [result, setResult] = useState<{ readonly ok: boolean; readonly text: string } | null>(null);
    // Wer die Seite verlässt, beendet das Nachfragen.
    const alive = useRef(true);

    useEffect(() => {
        alive.current = true;

        return () => {
            alive.current = false;
        };
    }, []);

    async function restart(): Promise<void> {
        setAsking(false);
        setResult(null);

        try {
            const before = await api<IBotStatus>("/api/bot/status");

            await api("/api/bot/restart", { method: "POST" });
            setWaiting(true);

            const started = Date.now();

            while (alive.current && Date.now() - started < LIMIT) {
                await new Promise((resolve) => setTimeout(resolve, POLL));

                const status = await api<IBotStatus>("/api/bot/status").catch(() => null);

                if (status?.online && status.startedAt !== before.startedAt) {
                    setResult({ ok: true, text: `Wieder da nach ${Math.round((Date.now() - started) / 1000)} Sekunden.` });
                    onBack();
                    return;
                }
            }

            if (alive.current) setResult({ ok: false, text: "Der Bot ist nach 90 Sekunden noch nicht zurück." });
        } catch (failure) {
            notify(failure instanceof Error ? failure.message : String(failure), "danger");
        } finally {
            setWaiting(false);
        }
    }

    return (
        <div className={styles.restart}>
            <p className={styles.result} aria-live="polite">
                {waiting && "Warte, bis der Bot wieder da ist."}
                {result && (
                    <span className={result.ok ? styles.ok : styles.late}>
                        {result.text}
                        {!result.ok && (
                            <>
                                {" "}
                                <Link to="/dev/logs">Zu den Logs</Link>
                            </>
                        )}
                    </span>
                )}
            </p>
            <Button size="sm" icon="power" busy={waiting} onClick={() => setAsking(true)}>
                {waiting ? "Bot startet neu" : "Bot neu starten"}
            </Button>

            <ConfirmDialog open={asking} title="Bot neu starten?" confirmLabel="Neu starten" tone="danger" onConfirm={() => void restart()} onCancel={() => setAsking(false)}>
                <p>Der Bot ist dann etwa eine halbe Minute weg. Befehle in Discord laufen so lange ins Leere, das Bot-Dashboard zeigt einen Fehler.</p>
            </ConfirmDialog>
        </div>
    );
}
