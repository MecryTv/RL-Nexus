import { useRef, useState, type CSSProperties, type JSX } from "react";
import { formatPrice, parsePrice, type ICustomerDetail, type ICustomerGrant, type IShopProduct } from "../../shared/shop";
import { ApiError, api } from "../api/client";
import { useLive } from "../api/live";
import { useApi } from "../api/useApi";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { CopyText } from "../components/CopyText";
import { Field } from "../components/Field";
import { Failure, Loading } from "../components/Status";
import { Switch } from "../components/Switch";
import { formatDateTime } from "../format";
import { SOURCE, STATUS, endLine as endLineAt, isPaid, running, shortDay } from "./customer";
import styles from "./shop.module.scss";

const SYNC_STEP: Readonly<Record<string, string>> = { done: "erledigt", warn: "mit Problem", skip: "nicht nötig" };

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

type EndMode = "period_end" | "now";
type Confirm = { readonly kind: "end"; readonly grant: ICustomerGrant } | { readonly kind: "ban" } | { readonly kind: "trial-end" } | null;

/**
 * Alles zu einer Person, im Seitenpanel. Jede Aktion geht an den Server,
 * der antwortet mit dem neuen Stand. Beenden und Sperren fragen vorher nach.
 */
export function CustomerPanel({ id, products, onChanged }: { readonly id: string; readonly products: readonly IShopProduct[]; readonly onChanged: () => void }): JSX.Element {
    const detail = useApi<ICustomerDetail>(`/api/shop/customers/${id}`);
    useLive("shop", detail.reload);

    const [busy, setBusy] = useState(false);
    const [lastSync, setLastSync] = useState<ICustomerDetail["lastSync"] | null>(null);
    const [trialDate, setTrialDate] = useState("");
    const [gift, setGift] = useState<{ productId: number | null; until: string; unlimited: boolean } | null>(null);
    const [giftError, setGiftError] = useState<string | null>(null);
    const [confirm, setConfirm] = useState<Confirm>(null);
    const [mode, setMode] = useState<EndMode>("period_end");
    const [refund, setRefund] = useState("");
    const [reason, setReason] = useState("");
    const [now] = useState(() => Date.now());
    // Statt Toast: Der Stapel liegt unter dem modalen Panel und wäre unsichtbar.
    const [feedback, setFeedback] = useState<{ readonly text: string; readonly tone: "ok" | "danger" } | null>(null);
    const feedbackRef = useRef<HTMLDivElement>(null);

    const person = detail.data;
    if (detail.error && !person) return <Failure message={detail.error.message} onRetry={detail.reload} />;
    if (!person) return <Loading label="Person wird geladen" />;

    const trial = person.grants.find((grant) => grant.source === "trial") ?? null;
    const paidRunning = person.grants.filter((grant) => isPaid(grant) && running(grant, now));
    const endable = person.grants.filter((grant) => grant.source !== "trial" && running(grant, now));
    const endLine = (grant: ICustomerGrant): string => endLineAt(grant, now);

    /** true: geändert. Bei 502 hat sich auch etwas geändert (etwa Zugang beendet, Erstattung offen), dann mit Fehler-Satz. */
    const run = async (path: string, body: unknown, done: (next: ICustomerDetail) => string): Promise<boolean> => {
        setBusy(true);
        setFeedback(null);

        try {
            const next = await api<ICustomerDetail>(`/api/shop/customers/${id}/${path}`, { method: "POST", body });
            setLastSync(next.lastSync ?? null);
            setFeedback({ text: done(next), tone: "ok" });
            detail.reload();
            onChanged();
            return true;
        } catch (failure) {
            setFeedback({ text: messageOf(failure), tone: "danger" });
            if (!(failure instanceof ApiError) || failure.status !== 502) return false;

            detail.reload();
            onChanged();
            return true;
        } finally {
            setBusy(false);
        }
    };

    /** Nach Aktionen, deren Knopf danach verschwindet: Fokus auf die Rückmeldung statt ins Leere. */
    const focusFeedback = (): void => {
        window.setTimeout(() => feedbackRef.current?.focus(), 0);
    };

    const trialDone = (next: ICustomerDetail): string => {
        const current = next.grants.find((grant) => grant.source === "trial");
        if (!current || current.endedAt !== null || current.endsAt === null) return "Der Test ist beendet.";

        return `Der Test läuft jetzt bis ${shortDay(current.endsAt)}.`;
    };

    const openConfirm = (next: Confirm): void => {
        // Erst „bis zum Ende“, das ist das Mildere. Beim Beenden geht das nur bei einem Abo, das noch nicht gekündigt ist.
        const grant = next?.kind === "end" ? next.grant : next?.kind === "ban" && paidRunning.length === 1 ? paidRunning[0] : null;
        const milder = next?.kind === "ban" ? paidRunning.length > 0 : grant !== null && grant.source === "subscription" && !grant.cancelAtPeriodEnd;
        setMode(milder ? "period_end" : "now");
        setRefund(grant?.refundSuggestionCents ? formatPrice(grant.refundSuggestionCents).replace(/\s*€/, "") : "");
        setReason("");
        setFeedback(null);
        setConfirm(next);
    };

    // Im Dialog: der Zugang, um den es geht, und ob Erstattung und Wahl dazugehören.
    const target = confirm?.kind === "end" ? confirm.grant : confirm?.kind === "ban" && paidRunning.length === 1 ? paidRunning[0] : null;
    const canPeriodEnd = confirm?.kind === "ban" ? paidRunning.length > 0 : target?.source === "subscription" && !target.cancelAtPeriodEnd;
    const askMode = confirm?.kind === "ban" ? paidRunning.length > 0 : target !== null && isPaid(target) && canPeriodEnd;
    const askRefund = target !== null && isPaid(target) && mode === "now" && (target.paidCents ?? 0) > 0;
    const refundCents = askRefund ? (refund.trim() === "" ? 0 : parsePrice(refund)) : 0;
    const refundError = refundCents === null ? "Gib einen Betrag wie 3,40 ein, oder lass das Feld leer." : undefined;

    const submitConfirm = async (): Promise<void> => {
        if (!confirm || refundCents === null) return;

        let ok = false;

        if (confirm.kind === "trial-end") {
            ok = await run("trial-end", {}, () => "Der Test ist beendet.");
        } else if (confirm.kind === "end") {
            const grant = confirm.grant;
            const endMode: EndMode = isPaid(grant) ? mode : "now";
            ok = await run("end", { grantId: grant.id, mode: endMode, refundCents }, () =>
                endMode === "period_end" && grant.endsAt
                    ? `Das Abo ist zum ${shortDay(grant.endsAt)} gekündigt.`
                    : `Der Zugang ist beendet${refundCents > 0 ? `, ${formatPrice(refundCents)} gehen zurück` : ""}.`
            );
        } else {
            ok = await run("ban", { reason, ...(paidRunning.length > 0 ? { mode, refundCents } : {}) }, () => `${person.name ?? "Die Person"} ist gesperrt.`);
        }

        if (ok) {
            setConfirm(null);
            focusFeedback();
        }
    };

    const submitGift = async (): Promise<void> => {
        if (!gift) return;

        const productId = gift.productId ?? products[0]?.id ?? null;
        if (productId === null) return setGiftError("Es gibt noch kein Produkt zum Schenken.");
        if (!gift.unlimited && gift.until === "") return setGiftError("Wähl ein Datum oder „unbegrenzt“.");

        setGiftError(null);
        const title = products.find((product) => product.id === productId)?.title ?? "Zugang";

        if (await run("gift", { productId, until: gift.unlimited ? null : gift.until }, () => `Geschenkt: ${title}, ${gift.unlimited ? "unbegrenzt" : `bis ${shortDay(gift.until)}`}.`)) {
            setGift(null);
        }
    };

    return (
        <div className={styles.customer}>
            <div ref={feedbackRef} className={styles.feedback} role="status" aria-live="polite" tabIndex={-1}>
                {feedback && confirm === null && <p className={feedback.tone === "ok" ? styles.feedbackOk : styles.formError}>{feedback.text}</p>}
            </div>
            <dl className={styles.facts}>
                <div>
                    <dt>Status</dt>
                    <dd>
                        <Badge tone={STATUS[person.status].tone}>{STATUS[person.status].label}</Badge>
                    </dd>
                </div>
                <div>
                    <dt>Discord-ID</dt>
                    <dd>
                        <CopyText value={person.id} />
                    </dd>
                </div>
                <div>
                    <dt>Mail (Discord)</dt>
                    <dd>{person.email ?? "keine"}</dd>
                </div>
                <div>
                    <dt>Auf dem Server</dt>
                    <dd>
                        {person.onServer === null ? (
                            "unbekannt, Discord antwortet nicht"
                        ) : person.onServer ? (
                            <span className={styles.roles}>
                                ja
                                {person.roles.map((role) => (
                                    <span key={role.id} className={styles.role} style={{ "--role": role.color ?? "var(--c-text-faint)" } as CSSProperties}>
                                        {role.name}
                                    </span>
                                ))}
                            </span>
                        ) : (
                            "nein"
                        )}
                    </dd>
                </div>
                {person.banned && (
                    <div>
                        <dt>Gesperrt</dt>
                        <dd>
                            seit {shortDay(person.banned.at)}
                            {person.banned.reason && `: ${person.banned.reason}`}
                        </dd>
                    </div>
                )}
                {person.stripeUrl && (
                    <div>
                        <dt>Stripe</dt>
                        <dd>
                            <a href={person.stripeUrl} target="_blank" rel="noreferrer">
                                Stripe-Kunde öffnen ↗
                            </a>
                        </dd>
                    </div>
                )}
            </dl>

            {trial && trial.endedAt === null && person.banned === null && (
                <section className={styles.section} aria-labelledby={`${id}-test`}>
                    <h3 id={`${id}-test`} className={styles.boxTitle}>
                        Test anpassen
                    </h3>
                    <p className={styles.fact}>{trial.endsAt ? `${trial.active ? "Läuft bis" : "Abgelaufen am"} ${shortDay(trial.endsAt)}.` : "Ohne Ende."}</p>
                    <div className={styles.actions}>
                        <Button size="sm" disabled={busy} onClick={() => void run("trial", { days: -1 }, trialDone)}>
                            −1 Tag
                        </Button>
                        <Button size="sm" disabled={busy} onClick={() => void run("trial", { days: 1 }, trialDone)}>
                            +1 Tag
                        </Button>
                        <Button size="sm" disabled={busy} onClick={() => void run("trial", { days: 7 }, trialDone)}>
                            +7 Tage
                        </Button>
                    </div>
                    <div className={styles.inline}>
                        <Field id={`${id}-trial-date`} label="Neues Ende">
                            <input id={`${id}-trial-date`} type="date" value={trialDate} onChange={(event) => setTrialDate(event.target.value)} />
                        </Field>
                        <Button disabled={busy || trialDate === ""} onClick={() => void run("trial", { until: trialDate }, trialDone)}>
                            Setzen
                        </Button>
                    </div>
                </section>
            )}

            <section className={styles.section} aria-labelledby={`${id}-zugang`}>
                <h3 id={`${id}-zugang`} className={styles.boxTitle}>
                    Zugang
                </h3>
                <div className={styles.actions}>
                    <Button
                        size="sm"
                        icon="plus"
                        aria-expanded={gift !== null}
                        disabled={person.banned !== null}
                        onClick={() => setGift(gift ? null : { productId: products[0]?.id ?? null, until: "", unlimited: false })}
                    >
                        Zugang schenken
                    </Button>
                    <Button size="sm" icon="refresh" busy={busy && confirm === null && gift === null} onClick={() => void run("resync", {}, (next) => (next.lastSync?.notes.length ? "Abgleich mit Problemen, Details unten." : "Rolle neu gesetzt."))}>
                        Rolle neu setzen
                    </Button>
                    {trial?.active && trial.endedAt === null && (
                        <Button size="sm" disabled={busy} onClick={() => openConfirm({ kind: "trial-end" })}>
                            Test beenden
                        </Button>
                    )}
                </div>

                {gift && (
                    <div className={styles.giftForm}>
                        <Field id={`${id}-gift-product`} label="Produkt">
                            <select id={`${id}-gift-product`} value={gift.productId ?? ""} onChange={(event) => setGift({ ...gift, productId: Number(event.target.value) })}>
                                {products.map((product) => (
                                    <option key={product.id} value={product.id}>
                                        {product.title}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field id={`${id}-gift-until`} label="Bis" error={giftError ?? undefined}>
                            <input
                                id={`${id}-gift-until`}
                                type="date"
                                value={gift.until}
                                disabled={gift.unlimited}
                                aria-invalid={giftError !== null || undefined}
                                aria-describedby={giftError ? `${id}-gift-until-error` : undefined}
                                onChange={(event) => setGift({ ...gift, until: event.target.value })}
                            />
                        </Field>
                        <Switch checked={gift.unlimited} label="unbegrenzt" onChange={(unlimited) => setGift({ ...gift, unlimited })} />
                        <div className={styles.actions}>
                            <Button variant="primary" size="sm" busy={busy} onClick={() => void submitGift()}>
                                Schenken
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setGift(null)}>
                                Abbrechen
                            </Button>
                        </div>
                    </div>
                )}

                {lastSync && (
                    <div className={styles.sync} role="status">
                        <p>
                            Server: {SYNC_STEP[lastSync.joined] ?? lastSync.joined} · Rollen: {SYNC_STEP[lastSync.roles] ?? lastSync.roles}
                        </p>
                        {lastSync.notes.length > 0 && (
                            <ul>
                                {lastSync.notes.map((note) => (
                                    <li key={note}>{note}</li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}
            </section>

            {person.grants.length > 0 && (
                <section className={styles.section} aria-labelledby={`${id}-zugaenge`}>
                    <h3 id={`${id}-zugaenge`} className={styles.boxTitle}>
                        Zugänge
                    </h3>
                    <ul className={styles.grants}>
                        {person.grants.map((grant) => (
                            <li key={grant.id}>
                                <div>
                                    <b>
                                        {SOURCE[grant.source]}
                                        {grant.productTitle && grant.source !== "trial" && `: ${grant.productTitle}`}
                                    </b>
                                    <span>
                                        {endLine(grant)}
                                        {grant.paidCents !== null && ` · bezahlt ${formatPrice(grant.paidCents)}`}
                                    </span>
                                </div>
                                {endable.includes(grant) && (
                                    <Button
                                        size="sm"
                                        variant="danger"
                                        disabled={busy}
                                        aria-label={`${SOURCE[grant.source]}${grant.productTitle ? ` „${grant.productTitle}“` : ""} beenden …`}
                                        onClick={() => openConfirm({ kind: "end", grant })}
                                    >
                                        Beenden …
                                    </Button>
                                )}
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            <div className={styles.actions}>
                {person.banned ? (
                    <Button size="sm" busy={busy && confirm === null} onClick={() => void run("unban", {}, () => `${person.name ?? "Die Person"} ist entsperrt.`).then((ok) => ok && focusFeedback())}>
                        Entsperren
                    </Button>
                ) : (
                    <Button size="sm" variant="danger" icon="ban" disabled={busy} onClick={() => openConfirm({ kind: "ban" })}>
                        Sperren …
                    </Button>
                )}
            </div>

            <section className={styles.section} aria-labelledby={`${id}-verlauf`}>
                <h3 id={`${id}-verlauf`} className={styles.boxTitle}>
                    Verlauf
                </h3>
                {person.events.length === 0 ? (
                    <p className={styles.fact}>Noch nichts passiert.</p>
                ) : (
                    <ol className={styles.history}>
                        {person.events.map((event, index) => (
                            <li key={`${event.at}-${index}`}>
                                <b>{event.text}</b>
                                {event.detail && ` ${event.detail}`}
                                <time dateTime={event.at}> · {formatDateTime(event.at)}</time>
                            </li>
                        ))}
                    </ol>
                )}
            </section>

            <ConfirmDialog
                open={confirm !== null}
                title={
                    confirm?.kind === "ban"
                        ? `${person.name ?? "Person"} sperren?`
                        : confirm?.kind === "trial-end"
                          ? "Test beenden?"
                          : `${confirm?.kind === "end" ? (confirm.grant.productTitle ?? SOURCE[confirm.grant.source]) : "Zugang"} beenden?`
                }
                confirmLabel={confirm?.kind === "ban" ? "Sperren" : "Beenden"}
                tone="danger"
                busy={busy}
                onConfirm={() => void submitConfirm()}
                onCancel={() => setConfirm(null)}
            >
                <div className={styles.confirm}>
                    {feedback?.tone === "danger" && (
                        <p className={styles.formError} role="alert">
                            {feedback.text}
                        </p>
                    )}
                    {confirm?.kind === "ban" && (
                        <p>
                            Danach kein Test und kein Kauf mehr. Die Preisseite sagt der Person, dass sie sich an den Support wenden soll. Ein laufender Test und geschenkte
                            Zugänge enden sofort.
                            {paidRunning.length > 0 && ` Gerade läuft: ${paidRunning.map((grant) => `${grant.productTitle ?? SOURCE[grant.source]} (${endLine(grant)})`).join(", ")}.`}
                        </p>
                    )}
                    {confirm?.kind === "trial-end" && <p>Der Test endet jetzt, die Rolle wird entfernt. Die Person bekommt eine Mail.</p>}
                    {confirm?.kind === "end" && !isPaid(confirm.grant) && <p>Der Zugang endet jetzt, die Rolle wird entfernt. Die Person bekommt eine Mail.</p>}
                    {confirm?.kind === "end" && confirm.grant.source === "one_time" && <p>Ein Einmalkauf läuft ohnehin aus. Hier geht nur sofort beenden.</p>}
                    {confirm?.kind === "end" && confirm.grant.source === "subscription" && confirm.grant.cancelAtPeriodEnd && (
                        <p>Das Abo ist schon zum Ende gekündigt. Hier geht nur sofort beenden.</p>
                    )}

                    {askMode && (
                        <fieldset className={styles.choices}>
                            <legend className="u-sr">Wann endet der Zugang?</legend>
                            {canPeriodEnd && (
                                <label className={styles.choice}>
                                    <input type="radio" name={`${id}-mode`} checked={mode === "period_end"} onChange={() => setMode("period_end")} />
                                    <span>
                                        <b>Bis zum Ende laufen lassen</b>
                                        {target?.source === "subscription" && target.endsAt
                                            ? `Abo wird zum ${shortDay(target.endsAt)} gekündigt, bis dahin bleibt der Zugang.`
                                            : "Abos werden zum Periodenende gekündigt, Einmalkäufe laufen aus."}
                                    </span>
                                </label>
                            )}
                            <label className={styles.choice}>
                                <input type="radio" name={`${id}-mode`} checked={mode === "now"} onChange={() => setMode("now")} />
                                <span>
                                    <b>Sofort beenden</b>
                                    {`${target?.source === "subscription" ? "Abo endet jetzt" : "Zugang endet jetzt"}${refundCents ? `, Stripe erstattet ${formatPrice(refundCents)}` : ""}. Rolle wird entfernt.`}
                                </span>
                            </label>
                        </fieldset>
                    )}

                    {askRefund && target && (
                        <Field
                            id={`${id}-refund`}
                            label="Erstattung in Euro"
                            hint={`Bezahlt ${formatPrice(target.paidCents ?? 0)}.${target.refundSuggestionCents === null ? "" : ` Vorschlag nach Resttagen: ${formatPrice(target.refundSuggestionCents)}.`} Leer heißt keine Erstattung.`}
                            error={refundError}
                        >
                            <input
                                id={`${id}-refund`}
                                type="text"
                                inputMode="decimal"
                                value={refund}
                                onChange={(event) => setRefund(event.target.value)}
                                aria-invalid={refundError !== undefined || undefined}
                                aria-describedby={`${id}-refund-hint${refundError ? ` ${id}-refund-error` : ""}`}
                            />
                        </Field>
                    )}

                    {confirm?.kind === "ban" && (
                        <Field id={`${id}-reason`} label="Grund (nur intern, steht im Protokoll)" counter={{ value: reason.length, max: 190 }}>
                            <input id={`${id}-reason`} type="text" maxLength={190} value={reason} onChange={(event) => setReason(event.target.value)} />
                        </Field>
                    )}
                </div>
            </ConfirmDialog>
        </div>
    );
}
