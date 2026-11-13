import { type CSSProperties, type FormEvent, type JSX, useCallback, useEffect, useId, useRef, useState } from "react";
import { PageHeader } from "../components/layout/PageHeader";
import { Section } from "../components/layout/Section";
import { Button } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { usePageMeta } from "../hooks/usePageMeta";
import { siteConfig } from "../services/SiteConfig";
import { ShopError, loadState, loadWithdrawOrders, sendWithdrawal } from "../shop/api.ts";
import { ORDER_NO, formatDay, withdrawOrderLabel } from "../shop/logic.ts";
import type { IShopMe, IWithdrawInput, IWithdrawOrder, IWithdrawReceipt } from "../shop/types.ts";
import form from "../components/sections/ContactForm.module.scss";
import { Field } from "./CancelPage";
import styles from "./Account.module.scss";

const FAILED = "Der Widerruf ist nicht angekommen, der Shop ist gerade nicht erreichbar. Versuch es gleich noch einmal oder schreib an support@nexus-emb.de.";
const INVOICE_FORMAT = "So sieht sie aus: RLN-2026-0042. Sie steht in der Bestätigung und auf der Rechnung.";
const STAMP = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });

/** Wie auf /kuendigen: Fokus und Rahmen der Felder in Rot. */
const RED = { ["--accent" as string]: "var(--c-red)" } as CSSProperties;

type Errors = Partial<Record<keyof IWithdrawInput, string>>;

/** Groß und ohne Leerzeichen am Rand, so speichert sie auch der Server. */
function invoiceOf(value: string): string {
    return value.trim().toUpperCase();
}

/** Prüft vor dem Weiter, was der Server sonst mit einem Satz ablehnen würde. */
function validate(input: IWithdrawInput, loggedIn: boolean): Errors {
    const errors: Errors = {};

    if (input.name.trim() === "") errors.name = "Wie heißt du?";
    if (!ORDER_NO.test(invoiceOf(input.invoiceNo))) errors.invoiceNo = INVOICE_FORMAT;
    if (input.email.trim() === "" && !loggedIn) errors.email = "An diese Mail geht die Bestätigung.";
    else if (input.email.trim() !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) errors.email = "Das sieht nicht wie eine Mail-Adresse aus.";

    return errors;
}

/**
 * Widerrufen ohne Anmeldung (W-0096), in zwei Schritten wie /kuendigen:
 * eingeben, dann prüfen und bestätigen. Die Rechnungsnummer ist Pflicht, damit
 * der Support den Kauf gleich findet. Erstattet wird nach der Prüfung von Hand.
 */
export function WithdrawPage(): JSX.Element {
    usePageMeta("Vertrag widerrufen", "Widerrufe einen Kauf bei RL Nexus, auch ohne Anmeldung. Mit Rechnungsnummer, die Bestätigung kommt per Mail.");

    const id = useId();
    const [me, setMe] = useState<IShopMe | null>(null);
    const [orders, setOrders] = useState<readonly IWithdrawOrder[]>([]);
    const [other, setOther] = useState(false);
    const [input, setInput] = useState<IWithdrawInput>({ name: "", invoiceNo: "", email: "" });
    const [errors, setErrors] = useState<Errors>({});
    const [reviewing, setReviewing] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [receipt, setReceipt] = useState<IWithdrawReceipt | null>(null);
    const lock = useRef(false);
    const moved = useRef(false);

    // Ein neuer Schritt holt den Fokus an seinen Anfang, damit ein Vorleser dort weiterliest. Beim ersten Laden nicht.
    // Jeder Schritt hat dafür sein eigenes Panel (key): Sonst bliebe der Fokus auf „Weiter“, das zu „Widerruf bestätigen“ würde.
    const focusStep = useCallback((node: HTMLElement | null) => {
        if (node && moved.current) node.focus();
    }, []);

    // Angemeldet vorausfüllen und die eigenen Käufe zur Auswahl holen. Klappt das nicht, geht das Formular wie ohne Anmeldung.
    useEffect(() => {
        let alive = true;

        loadState()
            .then(async (state) => {
                if (!alive || state.me === null) return;
                const person = state.me;
                setMe(person);
                setInput((current) => ({ ...current, name: current.name || person.name }));

                const list = await loadWithdrawOrders();
                if (!alive || list.length === 0) return;
                setOrders(list);
                // Die neueste vorauswählen. Wer schon eine Nummer getippt hat, behält sie.
                setInput((current) => (current.invoiceNo === "" ? { ...current, invoiceNo: list[0].orderNo } : current));
            })
            .catch(() => undefined);

        return () => {
            alive = false;
        };
    }, []);

    const field = <K extends keyof IWithdrawInput>(key: K, value: IWithdrawInput[K]): void => {
        setInput((current) => ({ ...current, [key]: value }));
        setErrors((current) => ({ ...current, [key]: undefined }));
    };

    // Mit Käufen steht eine Auswahl da. Das Textfeld nur bei „Andere Nummer eingeben“ (Wert "") oder einer Nummer, die nicht in der Liste steht.
    const chosen = orders.find((order) => order.orderNo === input.invoiceNo);
    const typing = other || chosen === undefined;
    const pick = (value: string): void => {
        setOther(value === "");
        field("invoiceNo", value);
    };

    // Beim Verlassen prüfen, leer erst beim Weiter. Stimmt die Nummer, steht sie danach so da, wie sie gespeichert wird.
    const checkInvoice = (): void => {
        if (input.invoiceNo.trim() === "") return;

        if (ORDER_NO.test(invoiceOf(input.invoiceNo))) setInput((current) => ({ ...current, invoiceNo: invoiceOf(current.invoiceNo) }));
        else setErrors((current) => ({ ...current, invoiceNo: INVOICE_FORMAT }));
    };

    const next = (event: FormEvent): void => {
        event.preventDefault();

        const found = validate(input, me !== null);
        setErrors(found);
        const first = (["name", "invoiceNo", "email"] as const).find((key) => found[key] !== undefined);
        if (first) {
            // Sonst bliebe der Fokus auf dem Knopf, und ein Vorleser sagte nichts von den Fehlern.
            document.getElementById(`${id}-${first}`)?.focus();
            return;
        }

        moved.current = true;
        setInput((current) => ({ name: current.name.trim(), invoiceNo: invoiceOf(current.invoiceNo), email: current.email.trim() }));
        setProblem(null);
        setReviewing(true);
    };

    const confirm = async (event: FormEvent): Promise<void> => {
        event.preventDefault();
        if (lock.current) return;

        lock.current = true;
        setBusy(true);
        setProblem(null);

        try {
            setReceipt(await sendWithdrawal(input));
        } catch (failure) {
            // Eingabefehler (4xx) sagt der Server selbst. Bei 5xx oder ohne Antwort: der Satz mit dem Weg über support@.
            setProblem(failure instanceof ShopError && failure.status >= 400 && failure.status < 500 ? failure.message : FAILED);
        } finally {
            lock.current = false;
            setBusy(false);
        }
    };

    const note = (key: keyof Errors, hint?: string): string | undefined => (errors[key] !== undefined || hint !== undefined ? `${id}-${key}-note` : undefined);
    const invoiceField = (
        <Field id={`${id}-invoiceNo`} label="Rechnungsnummer *" error={errors.invoiceNo} hint="Etwa RLN-2026-0042 aus der Bestätigung.">
            <input
                id={`${id}-invoiceNo`}
                className={form.input}
                type="text"
                value={input.invoiceNo}
                maxLength={30}
                autoComplete="off"
                spellCheck={false}
                required
                onChange={(event) => field("invoiceNo", event.target.value)}
                onBlur={checkInvoice}
                aria-invalid={errors.invoiceNo !== undefined}
                aria-describedby={note("invoiceNo", "hint")}
            />
        </Field>
    );
    const questions = (
        <>
            Fragen? <a href={`mailto:${siteConfig.contactMail}`}>{siteConfig.contactMail}</a>
        </>
    );

    return (
        <>
            <PageHeader eyebrow="Shop" title="Vertrag widerrufen" lead="Ohne Angabe von Gründen. Frist und Ausnahmen stehen in der Widerrufsbelehrung." />

            <Section flush>
                <div className="u-shell">
                    <div className={styles.page}>
                        {receipt ? (
                            <Panel key="done" className={[styles.card, styles.done].join(" ")} accent="var(--c-win)">
                                <h2 ref={focusStep} tabIndex={-1}>
                                    Dein Widerruf ist eingegangen
                                </h2>
                                <p className={styles.text}>
                                    Eingegangen am <b>{STAMP.format(new Date(receipt.receivedAt))} Uhr</b>.
                                </p>
                                {receipt.matched && receipt.boughtAt ? (
                                    <p className={styles.text}>
                                        Rechnungsnummer {input.invoiceNo}: {receipt.title ? `${receipt.title}, ` : ""}gekauft am <b>{formatDay(receipt.boughtAt)}</b>.
                                    </p>
                                ) : (
                                    <p className={styles.text}>Die Rechnungsnummer {input.invoiceNo} ordnen wir von Hand deiner Bestellung zu.</p>
                                )}
                                <p className={styles.text}>Wir prüfen den Widerruf und melden uns.</p>
                                {receipt.mailed ? (
                                    <p className={styles.note}>
                                        Die Bestätigung geht an {receipt.email}. Kommt keine Mail, schau im Spam-Ordner nach. {questions}
                                    </p>
                                ) : (
                                    <p className={styles.problem}>
                                        Die Bestätigung per Mail an {receipt.email} ging gerade nicht raus. Der Widerruf ist trotzdem eingegangen. Mach dir am besten ein
                                        Bildschirmfoto von dieser Seite. {questions}
                                    </p>
                                )}
                                <div className={styles.actions}>
                                    <Button to={me ? "/zugang" : "/"} variant="outline">
                                        {me ? "Zu Mein Zugang" : "Zur Startseite"}
                                    </Button>
                                </div>
                            </Panel>
                        ) : reviewing ? (
                            <Panel key="review" className={[form.form, styles.card].join(" ")} accent="var(--c-red)" style={RED}>
                                <form onSubmit={(event) => void confirm(event)}>
                                    <p ref={focusStep} tabIndex={-1} className={styles.step}>
                                        Schritt 2 von 2
                                    </p>
                                    <dl className={styles.rows}>
                                        <div>
                                            <dt>Name</dt>
                                            <dd>{input.name}</dd>
                                        </div>
                                        <div>
                                            <dt>Rechnungsnummer</dt>
                                            <dd>{input.invoiceNo}</dd>
                                        </div>
                                        {chosen && (
                                            <div>
                                                <dt>Kauf</dt>
                                                <dd>
                                                    {chosen.title ? `${chosen.title}, ` : ""}gekauft am {formatDay(chosen.boughtAt)}
                                                </dd>
                                            </div>
                                        )}
                                        <div>
                                            <dt>Bestätigung an</dt>
                                            <dd>{input.email !== "" ? input.email : `deine Discord-Mail (${me?.email ?? ""})`}</dd>
                                        </div>
                                    </dl>

                                    {problem !== null && (
                                        <p className={styles.problem} role="alert">
                                            {problem}
                                        </p>
                                    )}

                                    <div className={styles.actions}>
                                        <Button type="submit" disabled={busy}>
                                            {busy ? "Wird gesendet …" : "Widerruf bestätigen"}
                                        </Button>
                                        <Button variant="ghost" disabled={busy} onClick={() => setReviewing(false)}>
                                            Zurück
                                        </Button>
                                    </div>
                                    <p className={styles.note}>Danach siehst du Datum und Uhrzeit des Eingangs. Dieselbe Bestätigung kommt sofort per Mail. {questions}</p>
                                </form>
                            </Panel>
                        ) : (
                            <Panel key="form" className={[form.form, styles.card].join(" ")} accent="var(--c-red)" style={RED}>
                                <form onSubmit={next} noValidate>
                                    <p ref={focusStep} tabIndex={-1} className={styles.step}>
                                        Schritt 1 von 2
                                    </p>

                                    <div className={form.row}>
                                        <Field id={`${id}-name`} label="Dein Name *" error={errors.name}>
                                            <input
                                                id={`${id}-name`}
                                                className={form.input}
                                                type="text"
                                                value={input.name}
                                                maxLength={100}
                                                autoComplete="name"
                                                required
                                                onChange={(event) => field("name", event.target.value)}
                                                aria-invalid={errors.name !== undefined}
                                                aria-describedby={note("name")}
                                            />
                                        </Field>

                                        {orders.length === 0 && invoiceField}
                                    </div>

                                    {orders.length > 0 && (
                                        <Field id={`${id}-order`} label="Welche Bestellung? *" hint="Deine Käufe, der neueste oben. Fehlt einer, nimm „Andere Nummer eingeben“.">
                                            <select id={`${id}-order`} className={form.input} value={typing ? "" : input.invoiceNo} required onChange={(event) => pick(event.target.value)} aria-describedby={`${id}-order-note`}>
                                                {orders.map((order) => (
                                                    <option key={order.orderNo} value={order.orderNo}>
                                                        {withdrawOrderLabel(order)}
                                                    </option>
                                                ))}
                                                <option value="">Andere Nummer eingeben</option>
                                            </select>
                                        </Field>
                                    )}
                                    {orders.length > 0 && typing && invoiceField}

                                    <Field
                                        id={`${id}-email`}
                                        label={me ? "E-Mail für die Bestätigung" : "E-Mail für die Bestätigung *"}
                                        error={errors.email}
                                        hint={me ? `Leer lassen: Die Bestätigung geht an deine Discord-Mail (${me.email}).` : "Am besten die Mail deines Discord-Kontos."}
                                    >
                                        <input
                                            id={`${id}-email`}
                                            className={form.input}
                                            type="email"
                                            value={input.email}
                                            maxLength={190}
                                            autoComplete="email"
                                            required={me === null}
                                            onChange={(event) => field("email", event.target.value)}
                                            aria-invalid={errors.email !== undefined}
                                            aria-describedby={note("email", "hint")}
                                        />
                                    </Field>

                                    <div className={styles.actions}>
                                        <Button type="submit">Weiter</Button>
                                    </div>
                                    <p className={styles.note}>Im nächsten Schritt siehst du alles noch einmal und bestätigst den Widerruf. {questions}</p>
                                </form>
                            </Panel>
                        )}
                    </div>
                </div>
            </Section>
        </>
    );
}
