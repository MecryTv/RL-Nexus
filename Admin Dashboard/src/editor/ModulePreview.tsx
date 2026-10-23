import { useEffect, useRef, useState, type JSX } from "react";
import type { ICommandPath, ICommandsContent, IContentMeta, IEnvelope, IModuleDefinition, IModuleDetail } from "../../shared/content";
import { useApi } from "../api/useApi";
import { Segmented } from "../components/Segmented";
import styles from "./ModulePreview.module.scss";

type Device = "desktop" | "handy";

const DEVICES = [
    { value: "desktop", label: "Desktop" },
    { value: "handy", label: "Handy" },
] as const;

/**
 * Die echte Webseite als Vorschau: die Seite /vorschau im iframe. Sie meldet
 * sich mit „bereit“, danach bekommt sie den Entwurf, 200 ms nach jeder
 * Änderung. Kachel oder Detailseite folgen dem offenen Reiter des Editors.
 */
export function ModulePreview({
    view,
    module,
    detail,
    meta,
}: {
    readonly view: "kachel" | "detail";
    readonly module: IModuleDefinition;
    readonly detail: IModuleDetail | null;
    readonly meta: IContentMeta;
}): JSX.Element {
    const target = useApi<{ readonly url: string; readonly origin: string }>("/api/content/vorschau");
    const commands = useApi<IEnvelope<ICommandsContent | null>>("/api/content/commands");
    const frame = useRef<HTMLIFrameElement>(null);
    // Wie oft die Seite „bereit“ gemeldet hat. Nach jedem Neuladen schickt der Editor den Entwurf neu.
    const [ready, setReady] = useState(0);
    const [silent, setSilent] = useState(false);
    const [device, setDevice] = useState<Device>("desktop");
    const origin = target.data?.origin ?? null;

    // Die Seite sagt, wann sie zuhört. Nur Nachrichten von ihrem Ursprung zählen.
    useEffect(() => {
        if (origin === null) return;

        function receive(event: MessageEvent): void {
            if (event.origin === origin && (event.data as { type?: unknown } | null)?.type === "rlnexus:vorschau-bereit") {
                setReady((count) => count + 1);
                setSilent(false);
            }
        }

        window.addEventListener("message", receive);
        const timer = window.setTimeout(() => setSilent(true), 5000);

        return () => {
            window.removeEventListener("message", receive);
            window.clearTimeout(timer);
        };
    }, [origin]);

    const botCommands: readonly ICommandPath[] = commands.data?.data?.modules[module.id] ?? [];
    const payload = {
        type: "rlnexus:vorschau",
        view,
        // Ein neues Modul hat noch keine ID. Die Webseite verlangt eine, also ein Platzhalter.
        module: { ...module, id: module.id || "vorschau" },
        detail: view === "detail" ? detail : null,
        categories: meta.categories.map((entry) => ({ id: entry.id, label: entry.label, color: entry.accent })),
        commands: botCommands,
    };
    const key = JSON.stringify(payload);

    useEffect(() => {
        if (ready === 0 || origin === null) return;

        const timer = window.setTimeout(() => frame.current?.contentWindow?.postMessage(JSON.parse(key), origin), 200);

        return () => window.clearTimeout(timer);
    }, [key, ready, origin]);

    return (
        <section className={styles.preview} aria-label="Vorschau auf der Webseite">
            <div className={styles.head}>
                <span>Vorschau · {view === "kachel" ? "Kachel" : "Detailseite"} auf der Webseite</span>
                <Segmented name="modul-vorschau-breite" legend="Breite der Vorschau" options={DEVICES} value={device} onChange={setDevice} />
            </div>
            {silent && ready === 0 && (
                <p className={styles.note} role="status">
                    Die Vorschau antwortet nicht. Läuft die Webseite unter {target.data?.url ?? "der eingestellten Adresse"} mit dem neuen Stand?
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
