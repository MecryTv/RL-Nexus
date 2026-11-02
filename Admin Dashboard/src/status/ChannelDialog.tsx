import { useEffect, useRef, useState, type JSX } from "react";
import type { IDiscordPostResult, IStatusChannelOption } from "../../shared/status";
import { api } from "../api/client";
import { useApi } from "../api/useApi";
import { Button } from "../components/Button";
import { Panel } from "../components/Panel";
import { Failure, Loading } from "../components/Status";
import { useToast } from "../toast/context";
import { fold } from "../nav/search.ts";
import { postSummary } from "./discord.ts";
import styles from "./ChannelDialog.module.scss";

/**
 * „Statuskanal wählen“ (W-0052, Entwurf K2): Textkanäle des einen Servers,
 * nach Kategorie, mit dem, was dem Bot dort fehlt. Steht nur im DOM, solange
 * es offen ist.
 */
export function ChannelDialog({ current, onClose, onChanged }: { readonly current: string | null; readonly onClose: () => void; readonly onChanged: () => void }): JSX.Element {
    const ref = useRef<HTMLDialogElement>(null);
    const options = useApi<IStatusChannelOption[]>("/api/status/discord/channels");
    const notify = useToast();
    const [query, setQuery] = useState("");
    const [picked, setPicked] = useState<string | null>(current);
    const [busy, setBusy] = useState(false);
    const [confirmed, setConfirmed] = useState(false);

    useEffect(() => {
        const dialog = ref.current;
        if (dialog && !dialog.open) dialog.showModal();
    }, []);

    const wanted = fold(query.trim());
    const shown = (options.data ?? []).filter((option) => !wanted || fold(`${option.name} ${option.category ?? ""}`).includes(wanted));
    const groups = [...new Set(shown.map((option) => option.category))];
    const currentName = options.data?.find((option) => option.id === current)?.name;
    const pickedName = options.data?.find((option) => option.id === picked)?.name;
    const changing = picked !== null && picked !== current;

    async function save(): Promise<void> {
        if (picked === null || picked === current) return onClose();

        setBusy(true);

        try {
            const result = await api<IDiscordPostResult | null>("/api/status/discord/channel", { method: "PUT", body: { channelId: picked, confirm: true } });
            const summary = result ? postSummary(result) : { text: "Statuskanal gewechselt.", ok: true };

            notify(summary.text, summary.ok ? "ok" : "danger");
            onChanged();
            onClose();
        } catch (error) {
            notify(error instanceof Error ? error.message : String(error), "danger");
        } finally {
            setBusy(false);
        }
    }

    return (
        <dialog
            ref={ref}
            className={styles.dialog}
            aria-labelledby="kanal-titel"
            onCancel={(event) => {
                event.preventDefault();
                if (!busy) onClose();
            }}
        >
            <Panel className={styles.panel}>
                <h2 id="kanal-titel" className={styles.title}>
                    Statuskanal wählen
                </h2>
                <p className={styles.sub}>Textkanäle auf dem Server des Teams. Der Bot braucht dort „Nachrichten senden“, „Dateien anhängen“ und „Nachrichten verwalten“ (zum Aufräumen).</p>

                <input className={styles.search} type="search" placeholder="Kanal suchen …" aria-label="Kanal suchen" value={query} onChange={(event) => setQuery(event.target.value)} />

                {options.error && !options.data ? (
                    <Failure message={options.error.message} onRetry={options.reload} />
                ) : !options.data ? (
                    <Loading label="Kanäle werden geladen" />
                ) : (
                    <fieldset className={styles.list}>
                        <legend className="u-sr">Kanal</legend>
                        {shown.length === 0 && <p className={styles.sub}>Kein Kanal passt zu „{query.trim()}“.</p>}
                        {groups.map((group) => (
                            <div key={group ?? "ohne"} className={styles.group}>
                                <p className={styles.groupName}>{group ?? "Ohne Kategorie"}</p>
                                {shown
                                    .filter((option) => option.category === group)
                                    .map((option) => (
                                        <label key={option.id} className={[styles.row, picked === option.id && styles.on].filter(Boolean).join(" ")}>
                                            <input
                                                type="radio"
                                                name="kanal"
                                                value={option.id}
                                                checked={picked === option.id}
                                                onChange={() => {
                                                    setPicked(option.id);
                                                    setConfirmed(false);
                                                }}
                                                className="u-sr"
                                            />
                                            <span className={styles.hash} aria-hidden="true">
                                                #
                                            </span>
                                            <span className={styles.name}>{option.name}</span>
                                            {option.id === current ? (
                                                <span className={styles.now}>jetzt</span>
                                            ) : option.missing.length === 0 ? (
                                                <span className={styles.ok}>✓ alles da</span>
                                            ) : (
                                                <span className={styles.miss}>fehlt: {option.missing.join(", ")}</span>
                                            )}
                                        </label>
                                    ))}
                            </div>
                        ))}
                    </fieldset>
                )}

                {changing && (
                    <div className={styles.warn} role="alert">
                        <p>
                            <strong>Achtung:</strong> Der Bot hält den Statuskanal sauber und löscht in #{pickedName} <strong>alle anderen Nachrichten</strong>, auch angepinnte. Nimm einen eigenen Kanal nur für die Statusmeldung.
                            {currentName && ` Die Meldung in #${currentName} wird gelöscht.`}
                        </p>
                        <label className={styles.confirm}>
                            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
                            Verstanden, in #{pickedName} darf alles andere weg
                        </label>
                    </div>
                )}

                <div className={styles.foot}>
                    <Button variant="ghost" onClick={onClose} disabled={busy}>
                        Abbrechen
                    </Button>
                    <Button variant="primary" onClick={() => void save()} busy={busy} disabled={!changing || !confirmed}>
                        Übernehmen
                    </Button>
                </div>
            </Panel>
        </dialog>
    );
}
