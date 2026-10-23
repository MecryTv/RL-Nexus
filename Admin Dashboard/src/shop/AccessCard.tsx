import { useState, type JSX } from "react";
import { Link } from "react-router-dom";
import type { AccessMode, IAccessPreview } from "../../shared/shop";
import { api } from "../api/client";
import { useLive } from "../api/live";
import { useApi } from "../api/useApi";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Panel } from "../components/Panel";
import { formatDateTime } from "../format";
import { useToast } from "../toast/context";
import { noticeText, stripeWarning, switchFacts, switchTitle } from "./access";
import styles from "./shop.module.scss";

const MODES: readonly { mode: AccessMode; tag: string; title: string; points: readonly string[]; className: string }[] = [
    {
        mode: "free",
        tag: "Free Access",
        title: "Kostenlos für alle",
        points: [
            "Jeder kommt ins Bot-Dashboard und kann alles nutzen",
            "Keine Preise und keine Kaufen-Knöpfe auf der Webseite",
            "Laufende Abos werden bei Stripe pausiert, Tage und Tests angehalten",
        ],
        className: styles.modeFree,
    },
    {
        mode: "paid",
        tag: "Paid Access",
        title: "Nur mit Kauf oder Testzeitraum",
        points: [
            "Ins Bot-Dashboard kommt, wer einen Zugang hat",
            "Preise-Seite, Test und Rabattcodes sind aktiv",
            "Pausierte Abos laufen weiter, angehaltene Tage zählen weiter",
        ],
        className: styles.modePaid,
    },
    {
        mode: "beta",
        tag: "Beta Access",
        title: "Nur mit Beta-Code",
        points: [
            "Ins Bot-Dashboard kommt nur, wer einen Beta-Code eingelöst hat",
            "Weder Kauf noch freier Zugang, keine Preise auf der Webseite",
            "Laufende Abos bleiben pausiert wie bei Free Access",
        ],
        className: styles.modeBeta,
    },
];

const DONE: Record<AccessMode, string> = {
    free: "RL Nexus ist jetzt kostenlos (Free Access).",
    paid: "Paid Access gilt wieder.",
    beta: "Beta Access gilt: Ins Bot-Dashboard kommen nur noch Beta-Tester.",
};

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Shop → Einstellungen, ganz oben: Free, Paid oder Beta Access (Entwurf
 * zugang-free-paid.html, Abschnitte 1 bis 3; Beta seit Plan 22). Umgestellt
 * wird erst nach der Rückfrage, die Auswahl zeigt bis dahin den Stand des Servers.
 */
export function AccessCard({ onChanged }: { readonly onChanged: () => void }): JSX.Element | null {
    const notify = useToast();
    const preview = useApi<IAccessPreview>("/api/shop/access");
    const [asking, setAsking] = useState<AccessMode | null>(null);
    const [busy, setBusy] = useState(false);

    useLive("shop", preview.reload);
    useLive("beta", preview.reload);

    const data = preview.data;
    if (!data) return null;

    const ask = (mode: AccessMode): void => {
        if (mode === data.mode) return;
        // Frische Zahlen für die Rückfrage.
        preview.reload();
        setAsking(mode);
    };

    const confirm = async (): Promise<void> => {
        if (!asking) return;
        setBusy(true);

        try {
            await api("/api/shop/access", { method: "PUT", body: { mode: asking } });
            notify(DONE[asking]);
            setAsking(null);
            preview.reload();
            onChanged();
        } catch (failure) {
            notify(messageOf(failure), "danger");
        } finally {
            setBusy(false);
        }
    };

    const warning = stripeWarning(data);
    const since = data.changedAt ? ` seit ${formatDateTime(data.changedAt)}` : "";
    const facts = asking && asking !== "paid" ? switchFacts(data, asking) : [];

    return (
        <>
            {data.mode !== "paid" && (
                <div className={`${styles.freeNotice} ${data.mode === "beta" ? styles.betaNotice : ""}`}>
                    <p>
                        <b>{data.mode === "beta" ? `Beta Access${since}.` : `Free Access${since}.`}</b> {noticeText(data)}
                        {warning && <span className={styles.freeWarn}> {warning}</span>}
                        {data.mode === "beta" && (
                            <>
                                {" "}
                                <Link to="/beta">Codes und Tester verwalten</Link>
                            </>
                        )}
                    </p>
                    <Button onClick={() => ask("paid")}>Auf Paid Access</Button>
                </div>
            )}

            <Panel className={styles.access}>
                <h2 className={styles.boxTitle}>Zugang zum Bot</h2>
                <div>
                    <p className={styles.accessTitle}>Wer darf RL Nexus nutzen?</p>
                    <p className={styles.fact}>Gilt sofort für den ganzen Bot: Bot-Dashboard, Webseite und Shop.</p>
                    {data.mode === "paid" && warning && <p className={`${styles.fact} ${styles.freeWarn}`}>{warning}</p>}
                </div>

                <fieldset className={styles.modes}>
                    <legend className={styles.srOnly}>Zugang zum Bot</legend>
                    {MODES.map((entry) => (
                        <label key={entry.mode} className={`${styles.mode} ${entry.className}`}>
                            <span className={styles.modeTop}>
                                <span className={styles.modeTag}>{entry.tag}</span>
                                <input
                                    type="radio"
                                    name="zugang"
                                    value={entry.mode}
                                    aria-label={`${entry.tag}: ${entry.title}`}
                                    checked={data.mode === entry.mode}
                                    onChange={() => ask(entry.mode)}
                                />
                            </span>
                            <b>{entry.title}</b>
                            <ul>
                                {entry.points.map((point) => (
                                    <li key={point}>{point}</li>
                                ))}
                            </ul>
                        </label>
                    ))}
                </fieldset>
            </Panel>

            <ConfirmDialog
                open={asking === "free" || asking === "beta"}
                title={asking ? switchTitle(asking) : ""}
                confirmLabel={asking === "beta" ? "Auf Beta Access umstellen" : "Auf Free Access umstellen"}
                busy={busy}
                onConfirm={() => void confirm()}
                onCancel={() => setAsking(null)}
            >
                <div className={styles.confirm}>
                    <p className={styles.fact}>
                        {asking === "beta" ? "Ins Bot-Dashboard kommt danach nur, wer einen Beta-Code eingelöst hat. Das passiert sofort:" : "RL Nexus ist danach für alle kostenlos. Das passiert sofort:"}
                    </p>
                    <ul className={styles.accessFacts}>
                        {facts.map((fact) => (
                            <li key={fact.lead}>
                                <span className={styles.factCount}>{fact.count ?? "·"}</span>
                                <span>
                                    <b>{fact.lead}</b> {fact.detail}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            </ConfirmDialog>

            <ConfirmDialog
                open={asking === "paid"}
                title={switchTitle("paid")}
                confirmLabel="Auf Paid Access umstellen"
                busy={busy}
                onConfirm={() => void confirm()}
                onCancel={() => setAsking(null)}
            >
                <div className={styles.confirm}>
                    <p className={styles.fact}>
                        <b>Pausierte Abos und angehaltene Zugänge laufen weiter.</b> Die Tage aus der Pause zählen nicht mit, Abos buchen erst nach ihren
                        Resttagen wieder ab.
                        {data.customers > 0 && ` ${data.customers} ${data.customers === 1 ? "Kunde bekommt" : "Kunden bekommen"} eine kurze Mail dazu.`}
                    </p>
                    <p className={styles.fact}>
                        Ins Bot-Dashboard kommt danach nur, wer einen Zugang hat oder testet. Die Webseite zeigt wieder Preise.
                        {data.mode === "beta" && " Beta-Codes zählen dann nicht mehr, auch Beta-Tester brauchen einen Zugang."}
                    </p>
                </div>
            </ConfirmDialog>
        </>
    );
}
