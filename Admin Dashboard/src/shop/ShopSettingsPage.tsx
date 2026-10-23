import { useState, type FormEvent, type JSX } from "react";
import { SHOP_LIMITS, type IGuildRole, type IShopSettings, type IShopSettingsView } from "../../shared/shop";
import { api } from "../api/client";
import { useLive } from "../api/live";
import { useApi } from "../api/useApi";
import { Button } from "../components/Button";
import { Field } from "../components/Field";
import { PageHeader } from "../components/PageHeader";
import { Panel } from "../components/Panel";
import { Failure, Loading } from "../components/Status";
import { Switch } from "../components/Switch";
import { formatDateTime } from "../format";
import { useToast } from "../toast/context";
import { useTitle } from "../useTitle";
import { AccessCard } from "./AccessCard";
import { settingsUntouched } from "./draft";
import styles from "./shop.module.scss";

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/** Shop → Einstellungen: alles, was für alle Produkte gilt (Entwurf in admin-produkte.html). */
export function ShopSettingsPage(): JSX.Element {
    useTitle("Shop-Einstellungen");
    const notify = useToast();
    const view = useApi<IShopSettingsView>("/api/shop/settings");
    const roleList = useApi<{ roles: IGuildRole[] }>("/api/shop/roles");
    const [draft, setDraft] = useState<IShopSettings | null>(null);
    const [days, setDays] = useState("");
    const [busy, setBusy] = useState(false);
    const [seen, setSeen] = useState<IShopSettings | null>(null);

    useLive("shop", view.reload);

    const saved = view.data?.settings ?? null;
    const dirty = draft !== null && saved !== null && (JSON.stringify(draft) !== JSON.stringify(saved) || days !== String(draft.trialDays));

    // Ein neuer Stand vom Server (auch aus einem anderen Tab) ersetzt den
    // Entwurf, solange hier seit dem vorigen Stand nichts geändert wurde. Beim
    // Rendern statt in einem Effect, wie React es für das Übernehmen von Props
    // in den State empfiehlt.
    if (saved !== seen) {
        const untouched = settingsUntouched(draft, days, seen);
        setSeen(saved);

        if (saved && untouched) {
            setDraft(saved);
            setDays(String(saved.trialDays));
        }
    }

    const set = <K extends keyof IShopSettings>(key: K, value: IShopSettings[K]): void => setDraft((current) => (current ? { ...current, [key]: value } : current));

    const submit = async (event: FormEvent): Promise<void> => {
        event.preventDefault();
        if (!draft) return;

        const trialDays = /^\d{1,3}$/.test(days.trim()) ? Number(days.trim()) : Number.NaN;

        setBusy(true);

        try {
            await api("/api/shop/settings", { method: "PUT", body: { ...draft, trialDays } });
            // Der Entwurf ist jetzt der gespeicherte Stand, sonst bliebe „geändert“ hängen.
            setDraft({ ...draft, trialDays });
            setDays(String(trialDays));
            notify("Die Shop-Einstellungen sind gespeichert.");
            view.reload();
        } catch (failure) {
            notify(messageOf(failure), "danger");
        } finally {
            setBusy(false);
        }
    };

    if (view.error && !view.data) return <Failure message={view.error.message} onRetry={view.reload} />;
    if (!view.data || !draft) return <Loading label="Einstellungen werden geladen" />;

    const { stripe } = view.data;
    const roles = roleList.data?.roles ?? [];
    // Bei Free Access gelten Test und Rabattcodes nicht. Ändern geht trotzdem, etwa um den Wechsel vorzubereiten.
    // Free und Beta: Test und Rabattcodes gelten erst wieder bei Paid Access.
    const free = view.data.settings.mode !== "paid";
    const LATER = "Gilt erst wieder bei Paid Access. Ändern geht trotzdem.";

    return (
        <form onSubmit={(event) => void submit(event)} noValidate>
            <PageHeader title="Shop-Einstellungen" meta={`Gilt für alle Produkte. Zuletzt gespeichert ${formatDateTime(view.data.updatedAt)}.`}>
                <Button type="submit" variant="primary" icon="save" busy={busy} disabled={!dirty}>
                    Speichern
                </Button>
            </PageHeader>

            <AccessCard onChanged={view.reload} />

            <div className={styles.settings}>
                <Panel className={styles.box}>
                    <h2 className={styles.boxTitle}>Verkauf</h2>
                    <p className={styles.fact}>
                        Discord-Server: <b>{view.data.guildId}</b>
                        {view.data.developerMode ? " (Dev Server, wegen --dev)" : ""}. Dorthin holt der Bot die Käufer und vergibt die Rollen.
                    </p>
                </Panel>

                <Panel className={`${styles.box} ${free ? styles.greyed : ""}`}>
                    <h2 className={styles.boxTitle}>Testzeitraum</h2>
                    {free && <p className={styles.fact}>{LATER}</p>}
                    <Switch checked={draft.trialEnabled} label="Test anbieten" onChange={(value) => set("trialEnabled", value)} />
                    <Field id="test-tage" label="Dauer in Tagen" hint={`1 bis ${SHOP_LIMITS.maxTrialDays}. Gilt für neue Tests, laufende ändert man je Person unter Kunden.`}>
                        <input id="test-tage" type="text" inputMode="numeric" value={days} onChange={(event) => setDays(event.target.value)} aria-describedby="test-tage-hint" />
                    </Field>
                    <Field id="test-rolle" label="Test-Rolle" hint="Bekommt, wer testet. Nach dem Test nimmt der Bot sie wieder weg." error={roleList.error?.message}>
                        <select
                            id="test-rolle"
                            value={draft.trialRoleId ?? ""}
                            disabled={roleList.error !== null}
                            onChange={(event) => set("trialRoleId", event.target.value || null)}
                            aria-describedby={roleList.error ? "test-rolle-error" : "test-rolle-hint"}
                        >
                            <option value="">Keine Rolle</option>
                            {roles.map((role) => (
                                <option key={role.id} value={role.id}>
                                    {role.name}
                                </option>
                            ))}
                        </select>
                    </Field>
                </Panel>

                <Panel className={styles.box}>
                    <h2 className={styles.boxTitle}>Stripe</h2>
                    <p className={styles.fact}>
                        {stripe.mode === null ? (
                            <>
                                <b>Nicht eingerichtet.</b> Die Schlüssel kommen in die .env, siehe README unter „Shop“.
                            </>
                        ) : (
                            <>
                                <b>Verbunden, {stripe.mode === "test" ? "Testmodus" : "Livemodus"}</b>
                                {view.data.developerMode ? " (wegen --dev)" : ""}. Die Schlüssel stehen in der .env, nicht hier.
                            </>
                        )}
                    </p>
                    <p className={styles.fact}>
                        Letzter Webhook: <b>{stripe.lastWebhook ? `${formatDateTime(stripe.lastWebhook.at)} (${stripe.lastWebhook.type})` : "noch keiner"}</b>
                    </p>
                    <div className={free ? styles.greyed : undefined}>
                        <Switch
                            checked={draft.promoCodes}
                            label="Rabattcodes im Checkout erlauben"
                            hint={`Die Codes selbst legst du im Stripe-Dashboard an.${free ? ` ${LATER}` : ""}`}
                            onChange={(value) => set("promoCodes", value)}
                        />
                    </div>
                </Panel>

                <Panel className={styles.box}>
                    <h2 className={styles.boxTitle}>Mails und Rechtliches</h2>
                    <p className={styles.fact}>
                        Absender: <b>RL Nexus &lt;{view.data.mailFrom}&gt;</b>. Antworten gehen an support@. Das Postfach muss unter Postfach → Postfächer verwalten
                        eingetragen sein.
                    </p>
                    <Field id="agb-stand" label="Stand von AGB und Widerruf" hint="Wird bei jedem Kauf mitgespeichert, damit klar ist, welcher Text galt.">
                        <input
                            id="agb-stand"
                            type="date"
                            value={draft.termsVersion}
                            onChange={(event) => set("termsVersion", event.target.value)}
                            aria-describedby="agb-stand-hint"
                        />
                    </Field>
                </Panel>
            </div>
        </form>
    );
}
