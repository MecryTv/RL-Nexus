import { type JSX, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/layout/PageHeader";
import { Section } from "../components/layout/Section";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { PageLoader } from "../components/ui/PageLoader";
import { Panel } from "../components/ui/Panel";
import { usePageMeta } from "../hooks/usePageMeta";
import { siteConfig } from "../services/SiteConfig";
import { sellsNow } from "../services/navigation.ts";
import { ShopError, loadState, loginUrl, logout, openPortal } from "../shop/api.ts";
import { Avatar } from "../shop/Avatar";
import { accessRows, accessStatus } from "../shop/logic.ts";
import type { IShopState, ShopStatus } from "../shop/types.ts";
import styles from "./Account.module.scss";

const FAILED = "Der Shop ist gerade nicht erreichbar. Versuch es gleich noch einmal.";
const RUNNING: readonly ShopStatus[] = ["trial", "subscription", "one_time", "gift"];

function messageOf(error: unknown): string {
    return error instanceof ShopError ? error.message : FAILED;
}

/** Farbe des Status: grün läuft, rot gesperrt, sonst blass. Die Farbe steht nie allein, der Text sagt es. */
function accentOf(status: ShopStatus): string {
    if (RUNNING.includes(status)) return "var(--c-win)";

    return status === "banned" ? "var(--c-loss)" : "var(--c-text-faint)";
}

/**
 * „Mein Zugang“: Status, Produkt, nächste Zahlung oder Ende, Rolle. Zahlungsart
 * und Rechnungen laufen über das Kundenportal von Stripe, Kündigen über
 * /kuendigen. Alles kommt aus `GET /api/shop/state`.
 */
export function AccessPage(): JSX.Element {
    usePageMeta("Mein Zugang", "Dein Zugang zum Bot-Dashboard: Status, nächste Zahlung, Rechnungen und Kündigung.");

    const [state, setState] = useState<IShopState | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [portalBusy, setPortalBusy] = useState(false);
    const [portalError, setPortalError] = useState<string | null>(null);
    // Ein Doppelklick vor dem nächsten Rendern öffnet sonst zwei Sitzungen.
    const busy = useRef(false);

    useEffect(() => {
        let alive = true;

        loadState().then(
            (next) => {
                if (alive) setState(next);
            },
            (failure: unknown) => {
                if (alive) setError(messageOf(failure));
            }
        );

        return () => {
            alive = false;
        };
    }, []);

    const portal = async (): Promise<void> => {
        if (busy.current) return;
        busy.current = true;
        setPortalBusy(true);
        setPortalError(null);

        try {
            // Danach verlässt die Seite den Browser-Tab Richtung Stripe, der Knopf bleibt gesperrt.
            window.location.assign(await openPortal());
        } catch (failure) {
            setPortalError(messageOf(failure));
            busy.current = false;
            setPortalBusy(false);
        }
    };

    const signOut = async (): Promise<void> => {
        try {
            await logout();
        } finally {
            setState((current) => (current ? { ...current, me: null } : current));
        }
    };

    const me = state?.me ?? null;
    const rows = me ? accessRows(me, state?.products ?? [], !sellsNow(state?.mode)) : [];

    return (
        <>
            <PageHeader eyebrow="Shop" title="Mein Zugang" lead="Status, Zahlung und Rechnungen. Kündigen geht hier auch, jederzeit." />

            <Section flush>
                <div className="u-shell">
                    <div className={styles.page}>
                    {error !== null ? (
                        <Panel className={styles.card}>
                            <p className={styles.problem} role="alert">
                                {error}
                            </p>
                            <div className={styles.actions}>
                                <Button variant="outline" onClick={() => window.location.reload()}>
                                    Nochmal versuchen
                                </Button>
                            </div>
                        </Panel>
                    ) : state === null ? (
                        <PageLoader />
                    ) : me === null ? (
                        <Panel className={styles.card}>
                            <p className={styles.text}>Melde dich mit Discord an, dann siehst du deinen Zugang. Kündigen geht auch ohne Anmeldung.</p>
                            <div className={styles.actions}>
                                <Button href={loginUrl(undefined, "zugang")} icon="discord">
                                    Mit Discord anmelden
                                </Button>
                                <Button to="/kuendigen" variant="ghost">
                                    Vertrag kündigen
                                </Button>
                            </div>
                        </Panel>
                    ) : (
                        <Panel className={styles.card} accent={accentOf(me.status)}>
                            <div className={styles.person}>
                                <Avatar me={me} size={48} />
                                <div>
                                    <b>{me.name}</b>
                                    <small>{me.email}</small>
                                </div>
                                <Badge className={styles.status} accent={accentOf(me.status)}>
                                    {accessStatus(me)}
                                </Badge>
                            </div>

                            {!sellsNow(state.mode) && me.status !== "banned" && (
                                <p className={styles.text}>
                                    {state.mode === "beta"
                                        ? rows.length > 0
                                            ? "RL Nexus ist gerade in der geschlossenen Beta. Dein Zugang ist pausiert und läuft weiter, sobald es wieder Preise gibt. Ins Bot-Dashboard kommst du in der Beta mit einem Beta-Code."
                                            : "RL Nexus ist gerade in der geschlossenen Beta. Ins Bot-Dashboard kommst du mit einem Beta-Code."
                                        : rows.length > 0
                                          ? "RL Nexus ist gerade kostenlos. Dein Zugang ist pausiert und läuft weiter, sobald es wieder Preise gibt."
                                          : "RL Nexus ist gerade kostenlos. Im Bot-Dashboard kannst du alles nutzen, ohne Zugang."}
                                </p>
                            )}

                            {rows.length > 0 ? (
                                <dl className={styles.rows}>
                                    {rows.map((row) => (
                                        <div key={row.label}>
                                            <dt>{row.label}</dt>
                                            <dd>{row.value}</dd>
                                        </div>
                                    ))}
                                </dl>
                            ) : me.status === "banned" ? (
                                <p className={styles.text}>
                                    Dein Konto ist für Käufe gesperrt. Wende dich bitte an <a href={`mailto:${siteConfig.contactMail}`}>{siteConfig.contactMail}</a>.
                                </p>
                            ) : !sellsNow(state.mode) ? null : (
                                <p className={styles.text}>
                                    Du hast gerade keinen Zugang. Auf der <Link to="/preise">Preisseite</Link> gibt es den Test und alle Produkte.
                                </p>
                            )}

                            {portalError !== null && (
                                <p className={styles.problem} role="alert">
                                    {portalError}
                                </p>
                            )}

                            <div className={styles.actions}>
                                {me.hasBilling && (
                                    <Button onClick={() => void portal()} disabled={portalBusy} icon="arrow-right">
                                        {portalBusy ? "Wird geöffnet …" : "Zahlungsart und Rechnungen"}
                                    </Button>
                                )}
                                {RUNNING.includes(me.status) && (
                                    <Button href={siteConfig.dashboardURL} variant={me.hasBilling ? "outline" : "primary"}>
                                        Zum Dashboard
                                    </Button>
                                )}
                                {me.status === "subscription" && !me.cancelAtPeriodEnd && (
                                    <Button to="/kuendigen" variant="ghost">
                                        Vertrag kündigen
                                    </Button>
                                )}
                                <Button variant="ghost" onClick={() => void signOut()}>
                                    Abmelden
                                </Button>
                            </div>

                            {me.hasBilling && <p className={styles.note}>„Zahlungsart und Rechnungen“ öffnet das Kundenportal von Stripe. Von dort geht es zurück hierher.</p>}
                        </Panel>
                    )}
                    </div>
                </div>
            </Section>
        </>
    );
}
