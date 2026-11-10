import { type JSX, useEffect, useRef, useState } from "react";
import { useApi } from "../api/useApi";
import { readStageMessage, type StageAction } from "./stage.ts";
import styles from "./PreviewStage.module.scss";

export interface ITarget {
    readonly url: string;
    readonly origin: string;
}

export interface IPreviewStageProps {
    /** Die Nachricht an /vorschau (`rlnexus:vorschau-partner` oder `-news`), `null` solange nichts da ist. */
    readonly message: unknown;
    readonly device: "desktop" | "handy";
    readonly onPick: (part: string) => void;
    readonly onAction: (part: string, action: StageAction) => void;
}

/**
 * W-0062 Teil 2: die Bühne der Studios. Die echte Webseite /vorschau im iframe,
 * wie im Modul-Editor: Sie meldet „bereit“, danach kommt der Entwurf, 200 ms
 * nach jeder Änderung. Zurück kommen die Wahl eines Teils und die Aktionen der
 * kleinen Leiste, nur vom Origin der Webseite und nur in gültiger Form.
 */
export function PreviewStage({ message, device, onPick, onAction }: IPreviewStageProps): JSX.Element {
    const target = useApi<ITarget>("/api/content/vorschau");
    const frame = useRef<HTMLIFrameElement>(null);
    const [ready, setReady] = useState(0);
    const [silent, setSilent] = useState(false);
    const [invalid, setInvalid] = useState(false);
    const handlers = useRef({ onPick, onAction });
    const origin = target.data?.origin ?? null;

    useEffect(() => {
        handlers.current = { onPick, onAction };
    });

    useEffect(() => {
        if (origin === null) return;

        function receive(event: MessageEvent): void {
            if (event.origin !== origin || event.source !== frame.current?.contentWindow) return;

            const reply = readStageMessage(event.data);

            if (!reply) return;

            if (reply.kind === "bereit") {
                setReady((count) => count + 1);
                setSilent(false);
            } else if (reply.kind === "ungueltig") setInvalid(true);
            else if (reply.kind === "wahl") handlers.current.onPick(reply.part);
            else handlers.current.onAction(reply.part, reply.action);
        }

        window.addEventListener("message", receive);
        const timer = window.setTimeout(() => setSilent(true), 5000);

        return () => {
            window.removeEventListener("message", receive);
            window.clearTimeout(timer);
        };
    }, [origin]);

    const key = message === null ? null : JSON.stringify(message);

    useEffect(() => {
        if (ready === 0 || origin === null || key === null) return;

        const timer = window.setTimeout(() => {
            setInvalid(false);
            frame.current?.contentWindow?.postMessage(JSON.parse(key), origin);
        }, 200);

        return () => window.clearTimeout(timer);
    }, [key, ready, origin]);

    return (
        <section className={styles.preview} aria-label="Vorschau auf der Webseite">
            {silent && ready === 0 && (
                <p className={styles.note} role="status">
                    Die Vorschau antwortet nicht. Läuft die Webseite unter {target.data?.url ?? "der eingestellten Adresse"} mit dem neuen Stand?
                </p>
            )}
            {invalid && (
                <p className={styles.note} role="status">
                    Die Vorschau zeigt den letzten gültigen Stand. Was gerade fehlt, steht neben „Speichern“.
                </p>
            )}
            {target.data && (
                <div className={styles.stage}>
                    <iframe
                        ref={frame}
                        className={styles.frame}
                        data-device={device}
                        title="Vorschau auf der Webseite"
                        src={target.data.url}
                        referrerPolicy="no-referrer"
                    />
                </div>
            )}
        </section>
    );
}
