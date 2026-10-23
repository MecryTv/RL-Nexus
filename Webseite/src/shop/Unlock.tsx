import { type CSSProperties, type JSX, useEffect, useId, useState } from "react";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { ShopError, loginUrl, orderProgress } from "./api.ts";
import { Avatar } from "./Avatar";
import { passLine, paymentFailed, settled, stepsOf, waitingHint } from "./logic.ts";
import { Overlay } from "./Overlay";
import type { IShopMe, IUnlockProgress } from "./types.ts";
import styles from "./Unlock.module.scss";

export interface IUnlockProps {
    /** Beim Test: das fertige Ergebnis. Dann fragt die Komponente nichts ab. */
    readonly initial: IUnlockProgress | null;
    /** Beim Kauf: die Bestellung, deren Fortschritt sie abfragt. */
    readonly orderNo: string | null;
    readonly me: IShopMe | null;
    readonly dashboardUrl: string;
    readonly onClose: () => void;
}

/** Funken der Pass-Karte: Richtung und Farbe je Funke. */
const SPARKS: readonly { readonly x: number; readonly y: number; readonly blue: boolean }[] = [
    { x: -150, y: -90, blue: false },
    { x: 140, y: -110, blue: true },
    { x: -170, y: 20, blue: true },
    { x: 165, y: 30, blue: false },
    { x: -90, y: 130, blue: false },
    { x: 100, y: 125, blue: true },
    { x: -20, y: -150, blue: true },
    { x: 30, y: 160, blue: false },
];

/** Erst jede Sekunde, nach zwei Minuten alle zehn: Eine Lastschrift dauert Tage, die Seite darf trotzdem offen bleiben. */
const FAST = 1_000;
const SLOW = 10_000;
const FAST_TRIES = 120;

/**
 * Das Freischalten nach Entwurf C: erst die Liste, deren Schritte der Server
 * meldet, und wenn keiner mehr wartet, die Pass-Karte. Ohne Bewegung steht
 * das Ergebnis sofort da (alle Animationen hängen an `@include motion`).
 */
export function Unlock({ initial, orderNo, me, dashboardUrl, onClose }: IUnlockProps): JSX.Element {
    const titleId = useId();
    const [progress, setProgress] = useState<IUnlockProgress | null>(initial);
    const [seconds, setSeconds] = useState(0);
    const [missing, setMissing] = useState<string | null>(null);
    // 401: nicht (mehr) angemeldet. Dann hilft die Anmeldung, nicht das Warten.
    const [signedOut, setSignedOut] = useState(false);

    useEffect(() => {
        if (orderNo === null) return;

        let alive = true;
        let timer: number | undefined;
        let tries = 0;
        const started = Date.now();

        const tick = async (): Promise<void> => {
            try {
                const next = await orderProgress(orderNo);
                if (!alive) return;

                setProgress(next);
                setSeconds(Math.round((Date.now() - started) / 1000));
                tries++;
                // Fertig oder nicht durchgegangen: Weiter fragen bringt nichts.
                if (!settled(next) && !paymentFailed(next)) timer = window.setTimeout(() => void tick(), tries < FAST_TRIES ? FAST : SLOW);
            } catch (error) {
                if (!alive) return;

                // Fremd, unbekannt oder nicht angemeldet: Warten bringt nichts, der Satz des Servers sagt, warum.
                if (error instanceof ShopError && (error.status === 404 || error.status === 401)) {
                    setMissing(error.message);
                    setSignedOut(error.status === 401);
                    return;
                }

                // Server kurz weg: weiter fragen, nur langsamer.
                timer = window.setTimeout(() => void tick(), SLOW);
            }
        };

        void tick();

        return () => {
            alive = false;
            window.clearTimeout(timer);
        };
    }, [orderNo]);

    const failed = progress !== null && paymentFailed(progress);
    const done = progress !== null && !failed && settled(progress);
    const counted = progress === null ? 0 : stepsOf(progress).filter((step) => step.state !== "wait").length;
    const trial = progress?.kind === "trial";
    const hint = progress === null ? null : waitingHint(progress, seconds);

    return (
        <Overlay labelledBy={titleId} onClose={onClose} className={styles.dialog}>
            <div className={[styles.stage, done && styles.finished, trial && styles.trial].filter(Boolean).join(" ")}>
                {missing !== null || failed ? (
                    <div className={styles.list}>
                        <p className={styles.message} id={titleId} role="alert">
                            {missing ?? stepsOf(progress as IUnlockProgress)[0].hint}
                        </p>
                        {failed && <p className={styles.waiting}>Schließ das Fenster und versuch es noch einmal, gern mit einer anderen Zahlungsart.</p>}
                        {signedOut && (
                            <Button href={loginUrl()} icon="discord">
                                Mit Discord anmelden
                            </Button>
                        )}
                        <Button variant="outline" onClick={onClose}>
                            Schließen
                        </Button>
                    </div>
                ) : (
                    <>
                        <div className={styles.list} aria-hidden={done}>
                            <p className={styles.heading} id={done ? undefined : titleId}>
                                Wird freigeschaltet …
                            </p>
                            {/* Für Screenreader: jeder neue Haken und am Ende das Ergebnis werden angesagt. */}
                            <p className="u-sr" aria-live="polite">
                                {done ? "Freigeschaltet." : `${counted} von 4 Schritten erledigt.`}
                            </p>
                            <ul className={styles.steps} aria-live="polite">
                                {(progress === null ? [] : stepsOf(progress)).map((step) => (
                                    <li key={step.key} className={styles[step.state]}>
                                        <span className={styles.icon} aria-hidden="true">
                                            {step.state === "done" && <Icon name="check" size={14} />}
                                            {step.state === "warn" && "!"}
                                        </span>
                                        <span className={styles.stepText}>
                                            {step.label}
                                            <span className="u-sr">{step.state === "wait" ? " (läuft)" : step.state === "done" ? " (erledigt)" : " (mit Hinweis)"}</span>
                                            {step.hint !== null && <small>{step.hint}</small>}
                                            {step.key === "joined" && step.state === "warn" && progress?.invite && (
                                                <a href={progress.invite} target="_blank" rel="noopener noreferrer">
                                                    Zum Server beitreten
                                                </a>
                                            )}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                            {hint !== null && <p className={styles.waiting}>{hint}</p>}
                        </div>

                        {done && progress !== null && (
                            <div className={styles.pass}>
                                <div className={styles.card}>
                                    <span className={styles.sweep} aria-hidden="true" />
                                    <span className={styles.stamp} aria-hidden="true">
                                        Aktiv
                                    </span>
                                    <p className={styles.label}>RL Nexus</p>
                                    <h2 className={styles.name} id={titleId}>
                                        Nexus Pass
                                    </h2>
                                    <span className={styles.stripe} aria-hidden="true" />
                                    <p className={styles.line}>{passLine(progress)}</p>
                                    {me !== null && (
                                        <p className={styles.who}>
                                            <Avatar me={me} size={26} />
                                            <b>{me.name}</b>
                                        </p>
                                    )}
                                    {progress.role === "done" && (
                                        <span className={styles.role}>
                                            <i aria-hidden="true" />
                                            Rolle vergeben
                                        </span>
                                    )}
                                </div>

                                <div className={styles.sparks} aria-hidden="true">
                                    {SPARKS.map((spark) => (
                                        <span
                                            key={`${spark.x}:${spark.y}`}
                                            className={spark.blue ? styles.blue : undefined}
                                            style={{ "--x": `${spark.x}px`, "--y": `${spark.y}px` } as CSSProperties}
                                        />
                                    ))}
                                </div>

                                {/* Was gelb blieb, steht auch nach dem Wechsel zur Karte noch da, samt Einladung. */}
                                {stepsOf(progress).some((step) => step.state === "warn") && (
                                    <ul className={styles.notes}>
                                        {stepsOf(progress)
                                            .filter((step) => step.state === "warn")
                                            .map((step) => (
                                                <li key={step.key}>
                                                    <b>{step.label}:</b> {step.hint}
                                                    {step.key === "joined" && progress.invite && (
                                                        <>
                                                            {" "}
                                                            <a href={progress.invite} target="_blank" rel="noopener noreferrer">
                                                                Zum Server beitreten
                                                            </a>
                                                        </>
                                                    )}
                                                </li>
                                            ))}
                                    </ul>
                                )}

                                <div className={styles.actions}>
                                    <Button href={dashboardUrl} trailingIcon="arrow-up-right">
                                        Zum Dashboard
                                    </Button>
                                    <Button variant="ghost" onClick={onClose}>
                                        Schließen
                                    </Button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </Overlay>
    );
}
