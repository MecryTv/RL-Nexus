import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { PageHeader } from "../components/layout/PageHeader";
import { Section } from "../components/layout/Section";
import { Button } from "../components/ui/Button";
import { PageLoader } from "../components/ui/PageLoader";
import { usePageMeta } from "../hooks/usePageMeta";
import { siteConfig } from "../services/SiteConfig";
import { sellsNow } from "../services/navigation.ts";
import { ShopError, loadState, loginUrl, logout, startTrial } from "../shop/api.ts";
import { Avatar } from "../shop/Avatar";
import { Checkout } from "../shop/Checkout";
import { DevBar } from "../shop/DevBar";
import { ORDER_NO, cardAction, formatDay, loginNotice, trialStrip } from "../shop/logic.ts";
import { ProductCard } from "../shop/ProductCard";
import { TAX_NOTE, type IShopPublicProduct, type IShopState, type IUnlockProgress } from "../shop/types.ts";
import { Unlock } from "../shop/Unlock";
import styles from "./PricingPage.module.scss";

const FAILED = "Der Shop ist gerade nicht erreichbar. Versuch es gleich noch einmal.";

function messageOf(error: unknown): string {
    return error instanceof ShopError ? error.message : FAILED;
}

/**
 * Die Preisseite nach Entwurf A: Kopf mit Anmeldung, grüne Testleiste,
 * Karten aus dem Admin-Server, Satz zu § 19 UStG, Fragen.
 *
 * Alles, was die Seite anbietet, kommt aus `GET /api/shop/state`. Was eine
 * Karte zeigt, entscheidet `cardAction`, prüfen tut der Server beim Kauf.
 */
export function PricingPage(): JSX.Element {
    usePageMeta("Preise", "Zugang zum Bot-Dashboard von RL Nexus: alle Module auf allen deinen Servern. Mit kostenlosem Test.");

    const [searchParams, setSearchParams] = useSearchParams();
    const [state, setState] = useState<IShopState | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    // Was Discord beim Rücksprung meldet, bleibt stehen, auch wenn die Adresse wieder sauber ist.
    const [notice, setNotice] = useState<string | null>(() => loginNotice(searchParams));
    const [trialBusy, setTrialBusy] = useState(false);
    // Sperrt sofort, nicht erst nach dem nächsten Rendern: Ein schneller Doppelklick käme sonst zweimal durch.
    const trialLock = useRef(false);
    const [trialError, setTrialError] = useState<string | null>(null);
    const [checkout, setCheckout] = useState<IShopPublicProduct | null>(null);
    // Zurück von Stripe (PayPal, 3-D Secure) oder neu geladen: ?bestellung= öffnet das Freischalten wieder.
    const [unlock, setUnlock] = useState<{ readonly initial: IUnlockProgress | null; readonly orderNo: string | null } | null>(() => {
        const no = searchParams.get("bestellung");

        return no !== null && ORDER_NO.test(no) ? { initial: null, orderNo: no } : null;
    });
    // Nach der Anmeldung mit ?produkt=: diese Kasse geht auf, sobald der Stand da ist.
    const wanted = useRef<number | null>(Number(searchParams.get("produkt")) || null);

    const reload = useCallback(async (): Promise<IShopState | null> => {
        try {
            const next = await loadState();
            setState(next);
            setLoadError(null);
            return next;
        } catch (error) {
            setLoadError(messageOf(error));
            return null;
        }
    }, []);

    // Kartenzahlung ohne Weiterleitung: Die Bestellnummer kommt in die Adresse, damit Neuladen das Freischalten wieder zeigt.
    const openUnlock = (orderNo: string): void => {
        setUnlock({ initial: null, orderNo });
        setSearchParams(
            (current) => {
                const next = new URLSearchParams(current);
                next.set("bestellung", orderNo);
                return next;
            },
            { replace: true }
        );
    };

    // Der erste Stand. Später lädt `reload` neu, etwa nach dem Test oder dem Abmelden.
    useEffect(() => {
        let alive = true;

        loadState().then(
            (next) => {
                if (!alive) return;

                setState(next);

                const product = next.products.find((entry) => entry.id === wanted.current);
                wanted.current = null;
                if (product && next.stripeKey !== null && cardAction(product, next.me, next.open).kind === "buy") setCheckout(product);
            },
            (error: unknown) => {
                if (alive) setLoadError(messageOf(error));
            }
        );

        return () => {
            alive = false;
        };
    }, []);

    // Die Rückmeldung der Anmeldung steht im Zustand, aus der Adresse kann sie weg.
    useEffect(() => {
        if (!searchParams.has("anmeldung") && !searchParams.has("produkt")) return;

        const next = new URLSearchParams(searchParams);
        next.delete("anmeldung");
        next.delete("produkt");
        setSearchParams(next, { replace: true });
    }, [searchParams, setSearchParams]);

    const onLogin = (product?: IShopPublicProduct): void => location.assign(loginUrl(product?.id));

    const onLogout = async (): Promise<void> => {
        try {
            await logout();
        } finally {
            await reload();
        }
    };

    const onTrial = async (): Promise<void> => {
        if (state?.me === null) return onLogin();
        if (trialLock.current) return;

        trialLock.current = true;
        setTrialBusy(true);
        setTrialError(null);

        try {
            setUnlock({ initial: await startTrial(), orderNo: null });
            await reload();
        } catch (error) {
            setTrialError(messageOf(error));
        } finally {
            trialLock.current = false;
            setTrialBusy(false);
        }
    };

    if (state === null) {
        return loadError === null ? (
            <PageLoader />
        ) : (
            <Section>
                <div className="u-shell">
                    <div className={styles.failure} role="alert">
                        <p>{loadError}</p>
                        <Button variant="outline" onClick={() => void reload()}>
                            Nochmal versuchen
                        </Button>
                    </div>
                </div>
            </Section>
        );
    }

    // Free und Beta Access: Es gibt nichts zu kaufen.
    if (!sellsNow(state.mode)) return <Navigate to="/" replace />;

    const me = state.me;
    const sellable = state.open && state.stripeKey !== null;
    const strip = trialStrip(state);

    return (
        <>
            <PageHeader
                eyebrow="Bot-Dashboard freischalten"
                title={
                    <>
                        Ein Zugang. <em>Alle Module.</em>
                    </>
                }
                lead="Richte RL Nexus auf allen deinen Servern im Dashboard ein: Teams, Rang-Rollen, Tickets, 6 Mans und der Rest. Jeder Zugang schaltet dasselbe frei."
            >
                <div className={styles.account}>
                    {!state.open && <span className={styles.closed}>Gerade kein Verkauf</span>}
                    {me === null ? (
                        <Button icon="discord" onClick={() => onLogin()}>
                            Mit Discord anmelden
                        </Button>
                    ) : (
                        <div className={styles.who}>
                            <Avatar me={me} />
                            <span>
                                Angemeldet als <b>{me.name}</b>
                            </span>
                            <Button variant="ghost" onClick={() => void onLogout()}>
                                Abmelden
                            </Button>
                        </div>
                    )}
                </div>
            </PageHeader>

            <Section flush>
                <div className={["u-shell", styles.page].join(" ")}>
                    {notice !== null && (
                        <div className={styles.notice} role="status">
                            <p>{notice}</p>
                            <button type="button" className={styles.noticeClose} onClick={() => setNotice(null)} aria-label="Hinweis schließen">
                                ×
                            </button>
                        </div>
                    )}

                    {strip !== "hidden" && (
                        <div className={[styles.trial, strip === "used" && styles.trialUsed].filter(Boolean).join(" ")}>
                            <span className={[styles.tag, styles.tagGreen].join(" ")}>Test</span>
                            <div className={styles.trialText}>
                                {strip === "offer" && (
                                    <>
                                        <b>{state.trial.days} Tage kostenlos testen</b>
                                        <p>Ohne Karte. Einmal pro Discord-Konto. Danach entscheidest du.</p>
                                    </>
                                )}
                                {strip === "running" && me?.until && <b>Dein Test läuft bis {formatDay(me.until)}.</b>}
                                {strip === "used" && <p>Dein Test ist vorbei. Mit einem Zugang geht es weiter.</p>}
                                {trialError !== null && (
                                    <p className={styles.trialError} role="alert">
                                        {trialError}
                                    </p>
                                )}
                            </div>
                            {strip === "offer" && (
                                <Button variant="outline" className={styles.trialButton} onClick={() => void onTrial()} disabled={trialBusy}>
                                    {trialBusy ? "Wird gestartet …" : "Test starten"}
                                </Button>
                            )}
                        </div>
                    )}

                    {state.products.length === 0 ? (
                        <p className={styles.empty}>Gerade gibt es keine Angebote.</p>
                    ) : (
                        <div className={styles.grid}>
                            {state.products.map((product) => (
                                <ProductCard
                                    key={product.id}
                                    product={product}
                                    action={cardAction(product, me, sellable)}
                                    highlighted={product.badge !== ""}
                                    onLogin={onLogin}
                                    onSelect={setCheckout}
                                />
                            ))}
                        </div>
                    )}

                    <p className={styles.tax}>Endpreise. {TAX_NOTE}</p>

                    <div className={styles.faq}>
                        {state.trial.enabled && (
                            <details>
                                <summary>Was passiert nach dem Test?</summary>
                                <p>
                                    Der Test endet nach {state.trial.days} Tagen von selbst. Es wird nichts abgebucht und nichts verlängert. Danach kaufst du einen Zugang oder lässt
                                    es.
                                </p>
                            </details>
                        )}
                        <details>
                            <summary>Wie kündige ich?</summary>
                            <p>Ein Abo kündigst du jederzeit zum Ende des bezahlten Monats, über „Verträge hier kündigen“ unten auf jeder Seite. Einmalkäufe laufen einfach aus.</p>
                        </details>
                        <details>
                            <summary>Warum Discord-Anmeldung?</summary>
                            <p>
                                Der Zugang hängt an deinem Discord-Konto. Damit holt dich der Bot auf den RL-Nexus-Server, gibt dir die Rolle und schaltet das Dashboard für deine Server frei. Deine Mail von Discord nutzen wir nur für die Bestätigung.
                            </p>
                        </details>
                        <details>
                            <summary>Welche Zahlungsarten?</summary>
                            <p>Karte, PayPal und weitere, je nachdem, was gerade angeboten wird. Bezahlt wird über Stripe, deine Zahlungsdaten sehen wir nicht.</p>
                        </details>
                    </div>

                    <DevBar
                        state={state}
                        onDone={(message, orderNo) => {
                            if (orderNo !== undefined) openUnlock(orderNo);
                            if (message !== null) setNotice(message);
                            void reload();
                        }}
                    />
                </div>
            </Section>

            {checkout !== null && me !== null && state.stripeKey !== null && (
                <Checkout
                    product={checkout}
                    me={me}
                    stripeKey={state.stripeKey}
                    onPaid={(orderNo) => {
                        setCheckout(null);
                        openUnlock(orderNo);
                    }}
                    onClose={() => setCheckout(null)}
                />
            )}

            {unlock !== null && (
                <Unlock
                    initial={unlock.initial}
                    orderNo={unlock.orderNo}
                    me={me}
                    dashboardUrl={siteConfig.dashboardURL}
                    onClose={() => {
                        setUnlock(null);
                        if (searchParams.has("bestellung")) {
                            const next = new URLSearchParams(searchParams);
                            next.delete("bestellung");
                            setSearchParams(next, { replace: true });
                        }
                        void reload();
                    }}
                />
            )}
        </>
    );
}
