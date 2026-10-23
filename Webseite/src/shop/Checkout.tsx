import type { Appearance, StripeCheckoutLoadActionsSuccess } from "@stripe/stripe-js";
import { type JSX, useEffect, useId, useRef, useState } from "react";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { ShopError, startCheckout } from "./api.ts";
import { Avatar } from "./Avatar";
import { checkoutSummary, durationLabel, endingLabel, formatPrice, priceSuffix, renewalLabel } from "./logic.ts";
import { Overlay } from "./Overlay";
import { TAX_NOTE, type IShopMe, type IShopPublicProduct } from "./types.ts";
import styles from "./Checkout.module.scss";

export interface ICheckoutProps {
    readonly product: IShopPublicProduct;
    readonly me: IShopMe;
    readonly stripeKey: string;
    readonly onPaid: (orderNo: string) => void;
    readonly onClose: () => void;
}

/** Das Zahlungsfeld von Stripe in den Farben der Seite. Schriften lädt Stripe hier keine nach. */
const APPEARANCE: Appearance = {
    theme: "night",
    variables: {
        colorPrimary: "#ff1e2d",
        colorBackground: "#0b1016",
        colorText: "#f2f4f7",
        colorDanger: "#ff4d5e",
        fontFamily: "system-ui, sans-serif",
        borderRadius: "0px",
    },
};

type Phase = "consent" | "loading" | "pay" | "paying";

function messageOf(error: unknown): string {
    return error instanceof ShopError ? error.message : "Die Kasse ließ sich nicht öffnen. Versuch es gleich noch einmal.";
}

/**
 * Die Kasse nach Entwurf B: ein Fenster über der Seite, links die Bestellung,
 * rechts die Zahlung. Erst die drei Häkchen, dann „Weiter zur Zahlung“: Erst
 * jetzt entsteht die Bestellung beim Server, und erst jetzt lädt Stripe.
 *
 * Das Fenster ist ein `Overlay` (kein modales `<dialog>`, sonst läge die
 * Abfrage von 3-D Secure darunter). Esc schließt. Die offene Bestellung
 * bleibt beim Schließen einfach liegen.
 */
export function Checkout({ product, me, stripeKey, onPaid, onClose }: ICheckoutProps): JSX.Element {
    const titleId = useId();
    const mount = useRef<HTMLDivElement>(null);
    const actions = useRef<StripeCheckoutLoadActionsSuccess | null>(null);
    // Das Zahlungsfeld. Beim Schließen und nach einem Fehler abbauen, sonst hängt beim nächsten Versuch ein zweites drin.
    const element = useRef<{ destroy: () => void } | null>(null);

    useEffect(
        () => () => {
            element.current?.destroy();
            element.current = null;
        },
        []
    );
    // Sperrt sofort, nicht erst nach dem nächsten Rendern: Ein schneller Doppelklick legte sonst zwei Bestellungen an.
    const busy = useRef(false);
    const [consent, setConsent] = useState({ terms: false, start: false, adult: false });
    const [phase, setPhase] = useState<Phase>("consent");
    const [orderNo, setOrderNo] = useState<string | null>(null);
    const [canConfirm, setCanConfirm] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const total = `${formatPrice(product.priceCents)} ${priceSuffix(product.kind)}`;
    const renewal = renewalLabel(product.kind);
    const ending = endingLabel(product.kind);
    const agreed = consent.terms && consent.start && consent.adult;

    const startPayment = async (): Promise<void> => {
        if (busy.current) return;

        busy.current = true;
        setPhase("loading");
        setError(null);

        try {
            const start = await startCheckout(product.id);
            const { loadStripe } = await import("@stripe/stripe-js");
            const stripe = await loadStripe(stripeKey);
            if (!stripe || !mount.current) throw new ShopError("Stripe ließ sich nicht laden. Blockiert ein Werbeblocker js.stripe.com?", 0);

            const sdk = stripe.initCheckoutElementsSdk({ clientSecret: start.clientSecret, elementsOptions: { appearance: APPEARANCE } });
            sdk.on("change", (session) => setCanConfirm(session.canConfirm));
            element.current?.destroy();
            const payment = sdk.createPaymentElement({ layout: { type: "tabs" } });
            payment.mount(mount.current);
            element.current = payment;

            const loaded = await sdk.loadActions();
            if (loaded.type === "error") {
                // Die Meldung von Stripe ist Englisch für Entwickler: in die Konsole, auf die Seite ein Satz.
                console.error("Kasse:", loaded.error);
                throw new ShopError("Das Zahlungsfeld ließ sich nicht laden. Lade die Seite neu und versuch es nochmal.", 0);
            }

            actions.current = loaded.actions;
            setOrderNo(start.orderNo);
            setPhase("pay");
        } catch (failure) {
            // Was Stripe selbst meldet, ist Englisch für Entwickler: in die Konsole, auf die Seite ein Satz.
            if (!(failure instanceof ShopError)) console.error("Kasse:", failure);
            element.current?.destroy();
            element.current = null;
            setError(messageOf(failure));
            setPhase("consent");
        } finally {
            busy.current = false;
        }
    };

    const pay = async (): Promise<void> => {
        if (actions.current === null || orderNo === null || busy.current) return;

        busy.current = true;
        setPhase("paying");
        setError(null);

        try {
            // Die Rücksprung-Adresse steht schon in der Session. Karten bleiben hier, PayPal und 3-D Secure leiten weiter.
            const result = await actions.current.confirm({ redirect: "if_required" });

            if (result.type === "success") {
                onPaid(orderNo);
                return;
            }

            // Ablehnungen der Bank kommen von Stripe schon als Satz für Kunden.
            setError(result.error.message);
            setPhase("pay");
        } catch (failure) {
            console.error("Kasse:", failure);
            setError("Die Zahlung ließ sich nicht abschicken. Versuch es noch einmal.");
            setPhase("pay");
        } finally {
            busy.current = false;
        }
    };

    const box = (key: keyof typeof consent, label: JSX.Element): JSX.Element => (
        <label className={styles.check}>
            <input type="checkbox" checked={consent[key]} disabled={phase !== "consent"} onChange={(event) => setConsent((now) => ({ ...now, [key]: event.target.checked }))} />
            <span>{label}</span>
        </label>
    );

    return (
        <Overlay labelledBy={titleId} onClose={onClose} className={styles.dialog}>
            <div className={styles.box}>
                <button type="button" className={styles.close} onClick={onClose} aria-label="Kasse schließen">
                    <Icon name="close" size={20} />
                </button>

                <section className={styles.order}>
                    <h2 className={styles.label} id={titleId}>
                        Bestellung
                    </h2>
                    <div className={styles.who}>
                        <Avatar me={me} size={28} />
                        <span>
                            <b>{me.name}</b>
                            <small>{me.email}</small>
                        </span>
                    </div>
                    <dl className={styles.lines}>
                        <div>
                            <dt>Produkt</dt>
                            <dd>{product.title}</dd>
                        </div>
                        <div>
                            <dt>Laufzeit</dt>
                            <dd>{durationLabel(product.kind, product.durationDays)}</dd>
                        </div>
                        <div>
                            <dt>Verlängerung</dt>
                            <dd>{renewal}</dd>
                        </div>
                        <div>
                            <dt>Kündigung</dt>
                            <dd>{ending}</dd>
                        </div>
                        <div className={styles.total}>
                            <dt>Gesamt</dt>
                            <dd>{total}</dd>
                        </div>
                    </dl>
                    <p className={styles.tax}>{TAX_NOTE}</p>
                </section>

                <section className={styles.payment}>
                    <h2 className={styles.label}>Zahlung</h2>

                    {box(
                        "terms",
                        <>
                            Ich habe die{" "}
                            <a href="/agb" target="_blank" rel="noopener">
                                AGB
                            </a>{" "}
                            gelesen und bin einverstanden.
                        </>
                    )}
                    {box(
                        "start",
                        <>
                            Ich verlange, dass mein Zugang sofort beginnt, und weiß, dass mein Widerrufsrecht damit vorzeitig erlischt beziehungsweise ich bei einem Widerruf Wertersatz für die Zeit bis dahin schulde (
                            <a href="/widerruf" target="_blank" rel="noopener">
                                Widerrufsbelehrung
                            </a>
                            ).
                        </>
                    )}
                    {box("adult", <>Ich bin volljährig oder meine Eltern sind einverstanden.</>)}

                    {(phase === "consent" || phase === "loading") && (
                        <Button className={styles.wide} onClick={() => void startPayment()} disabled={!agreed || phase === "loading"}>
                            {phase === "loading" ? "Kasse wird vorbereitet …" : "Weiter zur Zahlung"}
                        </Button>
                    )}

                    {/* Hier baut Stripe das Zahlungsfeld ein. */}
                    <div ref={mount} className={styles.stripe} />

                    {error !== null && (
                        <p className={styles.error} role="alert">
                            {error}
                        </p>
                    )}

                    {(phase === "pay" || phase === "paying") && (
                        <>
                            <p className={styles.summary}>{checkoutSummary(product)}</p>
                            <Button className={styles.wide} onClick={() => void pay()} disabled={!canConfirm || phase === "paying"}>
                                {phase === "paying" ? "Wird bezahlt …" : "Zahlungspflichtig bestellen"}
                            </Button>
                        </>
                    )}
                </section>
            </div>
        </Overlay>
    );
}
