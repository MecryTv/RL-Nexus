import { type JSX, useRef, useState } from "react";
import { Button } from "../components/ui/Button";
import { ShopError, devAction, type DevPath } from "./api.ts";
import type { IShopState } from "./types.ts";
import styles from "../pages/PricingPage.module.scss";

export interface IDevBarProps {
    readonly state: IShopState;
    /** Nach jeder Aktion: ein Satz für die Seite, beim simulierten Kauf die Bestellung fürs Freischalten. */
    readonly onDone: (message: string | null, orderNo?: string) => void;
}

/**
 * Nur wenn der Admin-Server mit --dev läuft und jemand angemeldet ist. Alles
 * ohne Stripe, Discord und Mails sind aber echt: genau das, was man beim
 * Ausprobieren sehen will.
 */
export function DevBar({ state, onDone }: IDevBarProps): JSX.Element | null {
    const [productId, setProductId] = useState<number | null>(state.products[0]?.id ?? null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const lock = useRef(false);

    if (!state.dev || state.me === null) return null;

    const run = async (path: DevPath, message: string | null, body?: unknown): Promise<void> => {
        if (lock.current) return;

        lock.current = true;
        setBusy(true);
        setError(null);

        try {
            const result = await devAction(path, body);
            onDone(message, result.orderNo);
        } catch (failure) {
            setError(failure instanceof ShopError ? failure.message : "Die Aktion hat nicht geklappt.");
        } finally {
            lock.current = false;
            setBusy(false);
        }
    };

    return (
        <aside className={styles.dev} aria-label="Dev-Modus">
            <span className={[styles.tag, styles.tagDev].join(" ")}>Dev-Modus</span>
            <p className={styles.devText}>Nur lokal: Nichts hier läuft über Stripe, Discord und Mails sind echt.</p>

            <div className={styles.devActions}>
                <label className={styles.devSelect}>
                    <span className="u-sr">Produkt für den simulierten Kauf</span>
                    <select value={productId ?? ""} onChange={(event) => setProductId(Number(event.target.value))} disabled={busy}>
                        {state.products.map((product) => (
                            <option key={product.id} value={product.id}>
                                {product.title}
                            </option>
                        ))}
                    </select>
                </label>
                <Button variant="outline" disabled={busy || productId === null} onClick={() => void run("kauf", null, { productId })}>
                    Kauf simulieren
                </Button>
                <Button variant="ghost" disabled={busy} onClick={() => void run("ablauf", "Laufende Zugänge sind jetzt abgelaufen.")}>
                    Zugang ablaufen lassen
                </Button>
                <Button variant="ghost" disabled={busy} onClick={() => void run("zahlung-fehlgeschlagen", "Die Mail ‚Zahlung hat nicht geklappt‘ ist raus.")}>
                    Zahlung fehlgeschlagen
                </Button>
                <Button variant="ghost" disabled={busy} onClick={() => void run("kuendigen", "Das Abo ist zum Ende gekündigt, die Mail ist raus.")}>
                    Abo kündigen
                </Button>
                <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                        if (confirm("Alles von dir im Shop löschen und abmelden?")) void run("zuruecksetzen", "Alles von dir ist weg, du bist abgemeldet.");
                    }}
                >
                    Alles zurücksetzen
                </Button>
            </div>

            {error !== null && (
                <p className={styles.devError} role="alert">
                    {error}
                </p>
            )}
        </aside>
    );
}
