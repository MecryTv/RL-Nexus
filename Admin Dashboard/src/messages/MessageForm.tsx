import { useEffect, useRef, useState, type CSSProperties, type JSX } from "react";
import { COLOR_HEX, COLOR_LABELS, MESSAGE_COLORS, MESSAGE_LIMITS, type IMessageBox, type IMessageButton, type IMessageContent } from "../../shared/messages.ts";
import { Button } from "../components/Button";
import { Field } from "../components/Field";
import { Switch } from "../components/Switch";
import styles from "./messages.module.scss";

/**
 * Das Formular einer Nachricht oder Vorlage (Spec Teil 1) und die Vorschau
 * daneben. Jedes Feld zeigt, wie viele Zeichen übrig sind; den Satz aus
 * checkMessage zeigt die Seite unter dem Formular und statt der Vorschau.
 */

const PLACEHOLDER_HINT = "Platzhalter: {name} für den Namen, {datum} für den Tag des Versands.";

export function MessageForm({ id, value, onChange }: { readonly id: string; readonly value: IMessageContent; readonly onChange: (value: IMessageContent) => void }): JSX.Element {
    const set = (patch: Partial<IMessageContent>): void => onChange({ ...value, ...patch });
    const big = value.big ?? { text: "", note: "" };
    const setBig = (patch: Partial<{ text: string; note: string }>): void => {
        const next = { ...big, ...patch };

        // Beides leer heißt: keine große Zeile.
        set({ big: next.text || next.note ? next : null });
    };
    const setBox = (index: number, patch: Partial<IMessageBox>): void => set({ boxes: value.boxes.map((box, at) => (at === index ? { ...box, ...patch } : box)) });
    const setButton = (index: number, patch: Partial<IMessageButton>): void => set({ buttons: value.buttons.map((button, at) => (at === index ? { ...button, ...patch } : button)) });

    return (
        <div className={styles.form}>
            <fieldset className={styles.colors}>
                <legend>Farbe</legend>
                <div>
                    {MESSAGE_COLORS.map((color) => (
                        <label key={color} className={styles.color} style={{ "--swatch": COLOR_HEX[color] } as CSSProperties}>
                            <input type="radio" name={`${id}-farbe`} value={color} checked={value.color === color} onChange={() => set({ color })} />
                            <span>{COLOR_LABELS[color]}</span>
                        </label>
                    ))}
                </div>
            </fieldset>

            <div className={styles.pair}>
                <Field id={`${id}-stempel`} label="Stempel" counter={{ value: value.stamp.length, max: MESSAGE_LIMITS.stamp }}>
                    <input id={`${id}-stempel`} type="text" value={value.stamp} maxLength={MESSAGE_LIMITS.stamp} onChange={(event) => set({ stamp: event.target.value })} />
                </Field>
                <Field id={`${id}-titel`} label="Titel" counter={{ value: value.title.length, max: MESSAGE_LIMITS.title }}>
                    <input id={`${id}-titel`} type="text" value={value.title} maxLength={MESSAGE_LIMITS.title} onChange={(event) => set({ title: event.target.value })} />
                </Field>
            </div>

            <Field id={`${id}-einleitung`} label="Einleitung" hint={PLACEHOLDER_HINT} counter={{ value: value.intro.length, max: MESSAGE_LIMITS.intro }}>
                <input
                    id={`${id}-einleitung`}
                    type="text"
                    value={value.intro}
                    maxLength={MESSAGE_LIMITS.intro}
                    aria-describedby={`${id}-einleitung-hint`}
                    onChange={(event) => set({ intro: event.target.value })}
                />
            </Field>

            <div className={styles.pair}>
                <Field id={`${id}-gross`} label="Große Zeile" hint="Termin oder Zahl, frei lassen für keine" counter={{ value: big.text.length, max: MESSAGE_LIMITS.big }}>
                    <input id={`${id}-gross`} type="text" value={big.text} maxLength={MESSAGE_LIMITS.big} aria-describedby={`${id}-gross-hint`} onChange={(event) => setBig({ text: event.target.value })} />
                </Field>
                <Field id={`${id}-notiz`} label="Zeile darunter" counter={{ value: big.note.length, max: MESSAGE_LIMITS.note }}>
                    <input id={`${id}-notiz`} type="text" value={big.note} maxLength={MESSAGE_LIMITS.note} onChange={(event) => setBig({ note: event.target.value })} />
                </Field>
            </div>

            <fieldset className={styles.group}>
                <legend>Kacheln</legend>
                {value.boxes.map((box, index) => (
                    <div key={index} className={styles.item}>
                        <Field id={`${id}-kachel-${index}`} label={`Überschrift ${index + 1}`} counter={{ value: box.label.length, max: MESSAGE_LIMITS.boxLabel }}>
                            <input id={`${id}-kachel-${index}`} type="text" value={box.label} maxLength={MESSAGE_LIMITS.boxLabel} placeholder="Ohne Überschrift" onChange={(event) => setBox(index, { label: event.target.value })} />
                        </Field>
                        <Field id={`${id}-kacheltext-${index}`} label={`Text ${index + 1}`} counter={{ value: box.text.length, max: MESSAGE_LIMITS.boxText }}>
                            <textarea id={`${id}-kacheltext-${index}`} rows={4} value={box.text} maxLength={MESSAGE_LIMITS.boxText} onChange={(event) => setBox(index, { text: event.target.value })} />
                        </Field>
                        <Button size="sm" variant="ghost" icon="trash" onClick={() => set({ boxes: value.boxes.filter((_, at) => at !== index) })}>
                            Kachel entfernen
                        </Button>
                    </div>
                ))}
                {value.boxes.length < MESSAGE_LIMITS.boxes && (
                    <Button size="sm" icon="plus" onClick={() => set({ boxes: [...value.boxes, { label: "", text: "" }] })}>
                        Kachel
                    </Button>
                )}
            </fieldset>

            <fieldset className={styles.group}>
                <legend>Knöpfe unter dem Bild</legend>
                <p className={styles.dim}>Nur Links auf nexus-emb.de oder in einen Kanal des RL-Nexus-Servers.</p>
                {value.buttons.map((button, index) => (
                    <div key={index} className={[styles.item, styles.pair].join(" ")}>
                        <Field id={`${id}-knopf-${index}`} label={`Beschriftung ${index + 1}`} counter={{ value: button.label.length, max: MESSAGE_LIMITS.buttonLabel }}>
                            <input id={`${id}-knopf-${index}`} type="text" value={button.label} maxLength={MESSAGE_LIMITS.buttonLabel} onChange={(event) => setButton(index, { label: event.target.value })} />
                        </Field>
                        <Field id={`${id}-link-${index}`} label={`Link ${index + 1}`}>
                            <input
                                id={`${id}-link-${index}`}
                                type="url"
                                value={button.url}
                                maxLength={MESSAGE_LIMITS.url}
                                placeholder="https://nexus-emb.de/…"
                                onChange={(event) => setButton(index, { url: event.target.value })}
                            />
                        </Field>
                        <Button size="sm" variant="ghost" icon="trash" onClick={() => set({ buttons: value.buttons.filter((_, at) => at !== index) })}>
                            Knopf entfernen
                        </Button>
                    </div>
                ))}
                {value.buttons.length < MESSAGE_LIMITS.buttons && (
                    <Button size="sm" icon="plus" onClick={() => set({ buttons: [...value.buttons, { label: "", url: "https://nexus-emb.de/" }] })}>
                        Knopf
                    </Button>
                )}
            </fieldset>

            <Switch checked={value.signed} label="Mit meinem Namen unterschreiben" hint="Sonst steht „Nachricht vom Team von RL Nexus“ unten im Bild." onChange={(signed) => set({ signed })} />
        </div>
    );
}

/**
 * „So kommt sie an“: das Bild vom Server, 400 ms nach der letzten Änderung
 * neu, mit Name und Bild der ansehenden Person. Bei einem Fehler in den
 * Regeln steht der Satz statt des Bilds da.
 */
export function MessagePreview({ content, problem }: { readonly content: IMessageContent; readonly problem: string | null }): JSX.Element {
    const [url, setUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const latest = useRef<string | null>(null);
    const body = JSON.stringify({ content });

    useEffect(() => {
        if (problem) return;

        const controller = new AbortController();
        const timer = window.setTimeout(() => {
            setBusy(true);
            fetch("/api/messages/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body, credentials: "same-origin", signal: controller.signal })
                .then(async (response) => {
                    if (!response.ok) throw new Error(((await response.json().catch(() => null)) as { error?: string } | null)?.error ?? "Die Vorschau ließ sich nicht laden.");

                    return response.blob();
                })
                .then((blob) => {
                    const next = URL.createObjectURL(blob);

                    if (latest.current) URL.revokeObjectURL(latest.current);
                    latest.current = next;
                    setUrl(next);
                    setError(null);
                })
                .catch((reason: unknown) => {
                    if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason));
                })
                .finally(() => {
                    if (!controller.signal.aborted) setBusy(false);
                });
        }, 400);

        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [body, problem]);

    // Beim Verlassen das letzte Bild freigeben.
    useEffect(
        () => () => {
            if (latest.current) URL.revokeObjectURL(latest.current);
        },
        []
    );

    const shown = problem ?? error;

    return (
        <figure className={styles.preview} aria-busy={busy || undefined}>
            <figcaption>So kommt sie an</figcaption>
            {shown ? (
                <p className={styles.problem} role="status">
                    {shown}
                </p>
            ) : url ? (
                <img src={url} alt={`Vorschau: ${content.title}`} />
            ) : (
                <p className={styles.dim}>Vorschau wird gezeichnet …</p>
            )}
            <p className={styles.dim}>Mit deinem Namen und Bild. Knöpfe stehen in Discord unter dem Bild.</p>
        </figure>
    );
}
