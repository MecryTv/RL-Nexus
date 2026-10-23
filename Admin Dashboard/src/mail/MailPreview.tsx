import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import { api } from "../api/client";
import { Segmented } from "../components/Segmented";
import styles from "./mail.module.scss";

/** Die Vorschau zeigt nur, was der Server gebaut hat: keine Skripte, Bilder nur eingebettet oder von Discord. */
const CSP = "default-src 'none'; img-src data: https://cdn.discordapp.com; style-src 'unsafe-inline'";

export interface IPreviewInput {
    readonly from: number | null;
    readonly subject: string;
    readonly html: string;
    readonly quote: string;
    readonly plain: boolean;
    readonly reply: boolean;
}

type Device = "desktop" | "handy";

const DEVICES = [
    { value: "desktop", label: "Desktop" },
    { value: "handy", label: "Handy" },
] as const;

/**
 * Die Mail, wie sie ankommt, ohne Verzögerung beim Tippen.
 *
 * Das Gerüst (Kopf, Signatur, Fuß, Zitat) baut der Server mit derselben
 * Vorlage wie beim Senden. Neu geholt wird es nur, wenn sich Postfach,
 * „Vorlage weglassen“ oder Antworten/Weiterleiten ändern. Text und Betreff
 * schreibt der Browser bei jedem Tastendruck direkt hinein: Die Vorlage bringt
 * dafür die Stellen `rl-live-body` und `rl-live-subject` und dieselben Styles
 * als Regeln mit. Das iframe darf deshalb same-origin sein, Skripte laufen
 * darin trotzdem keine (kein allow-scripts, CSP ohne script-src).
 */
export function MailPreview({ input }: { readonly input: IPreviewInput }): JSX.Element {
    const frame = useRef<HTMLIFrameElement>(null);
    const latest = useRef(input);
    const [shell, setShell] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [device, setDevice] = useState<Device>("desktop");
    // Nur was das Gerüst ändert. Text und Betreff gehören nicht dazu.
    const shellKey = JSON.stringify({ from: input.from, quote: input.quote, plain: input.plain, reply: input.reply });

    useEffect(() => {
        latest.current = input;
    });

    useEffect(() => {
        const current = latest.current;
        if (current.from === null) return;

        const controller = new AbortController();
        const timer = window.setTimeout(() => {
            api<{ html: string }>("/api/mail/preview", { method: "POST", body: latest.current, signal: controller.signal })
                .then((result) => {
                    setShell(result.html.replace("<head>", `<head><meta http-equiv="Content-Security-Policy" content="${CSP}"><base target="_blank">`));
                    setError(null);
                })
                .catch((failure: unknown) => {
                    if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : String(failure));
                });
        }, 120);

        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [shellKey]);

    // Text und Betreff direkt ins Gerüst, ohne Netz und ohne Neuladen.
    const write = useCallback(() => {
        const doc = frame.current?.contentDocument;
        if (!doc) return;

        const body = doc.getElementById("rl-live-body");
        if (body) body.innerHTML = input.html;

        const subject = doc.getElementById("rl-live-subject");
        if (subject) subject.textContent = input.subject.trim() || "(kein Betreff)";
    }, [input.html, input.subject]);

    useEffect(write, [write, shell]);

    return (
        <section className={styles.preview} aria-label="Vorschau">
            <div className={styles.previewHead}>
                <span>Vorschau · so kommt sie an</span>
                <Segmented name="vorschau-breite" legend="Breite der Vorschau" options={DEVICES} value={device} onChange={setDevice} />
            </div>
            {error && (
                <p className={styles.error} role="alert">
                    {error}
                </p>
            )}
            {shell === null ? (
                <p className={styles.listNote}>Die Vorschau erscheint gleich.</p>
            ) : (
                <iframe
                    ref={frame}
                    className={styles.previewFrame}
                    data-device={device}
                    title="Vorschau der Mail"
                    sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                    srcDoc={shell}
                    referrerPolicy="no-referrer"
                    onLoad={write}
                />
            )}
        </section>
    );
}
