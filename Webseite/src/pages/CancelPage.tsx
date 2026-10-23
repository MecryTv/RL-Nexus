import { type CSSProperties, type FormEvent, type JSX, useEffect, useId, useRef, useState } from "react";
import { PageHeader } from "../components/layout/PageHeader";
import { Section } from "../components/layout/Section";
import { Button } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { usePageMeta } from "../hooks/usePageMeta";
import { siteConfig } from "../services/SiteConfig";
import { ShopError, loadState, sendCancellation } from "../shop/api.ts";
import { formatDay } from "../shop/logic.ts";
import type { CancelKind, ICancelInput, ICancelReceipt, IShopMe } from "../shop/types.ts";
import form from "../components/sections/ContactForm.module.scss";
import styles from "./Account.module.scss";

const FAILED = "Die Kündigung ist nicht angekommen, der Shop ist gerade nicht erreichbar. Versuch es gleich noch einmal oder schreib an support@nexus-emb.de.";
const STAMP = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });

type Errors = Partial<Record<"name" | "reference" | "email" | "reason", string>>;

/** Prüft vor dem Abschicken, was der Server sonst mit einem Satz ablehnen würde. */
function validate(input: ICancelInput, loggedIn: boolean): Errors {
    const errors: Errors = {};

    if (input.name.trim() === "") errors.name = "Wie heißt du?";
    if (input.reference.trim() === "") errors.reference = "Dein Discord-Name oder die Bestellnummer aus der Bestätigung.";
    if (input.email.trim() === "" && !loggedIn) errors.email = "An diese Mail geht die Bestätigung.";
    else if (input.email.trim() !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) errors.email = "Das sieht nicht wie eine Mail-Adresse aus.";
    if (input.kind === "extraordinary" && input.reason.trim() === "") errors.reason = "Bei einer außerordentlichen Kündigung brauchen wir den Grund.";

    return errors;
}

function Field({ id, label, hint, error, children }: { readonly id: string; readonly label: string; readonly hint?: string; readonly error?: string; readonly children: JSX.Element }): JSX.Element {
    return (
        <div className={[form.field, error !== undefined && form.invalid].filter(Boolean).join(" ")}>
            <label className={form.label} htmlFor={id}>
                {label}
            </label>
            {children}
            {error !== undefined ? (
                <p id={`${id}-note`} className={form.error}>
                    {error}
                </p>
            ) : (
                hint !== undefined && (
                    <p id={`${id}-note`} className={form.hint}>
                        {hint}
                    </p>
                )
            )}
        </div>
    );
}

/**
 * Kündigen ohne Anmeldung (§ 312k BGB), in zwei Schritten. Angemeldet ist
 * alles vorausgefüllt. Ob sich die Kündigung einem Abo zuordnen lässt,
 * entscheidet der Server; eine Eingangsbestätigung gibt es immer.
 */
export function CancelPage(): JSX.Element {
    usePageMeta("Vertrag kündigen", "Kündige dein Abo bei RL Nexus, auch ohne Anmeldung. Die Bestätigung kommt sofort per Mail.");

    const id = useId();
    const [me, setMe] = useState<IShopMe | null>(null);
    const [input, setInput] = useState<ICancelInput>({ kind: "ordinary", reason: "", name: "", reference: "", email: "" });
    const [errors, setErrors] = useState<Errors>({});
    const [problem, setProblem] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [receipt, setReceipt] = useState<ICancelReceipt | null>(null);
    const lock = useRef(false);
    const doneHeading = useRef<HTMLHeadingElement>(null);

    // Angemeldet vorausfüllen. Klappt das nicht, geht das Formular trotzdem.
    useEffect(() => {
        let alive = true;

        loadState().then(
            (state) => {
                if (!alive || state.me === null) return;
                const person = state.me;
                setMe(person);
                setInput((current) => ({ ...current, name: current.name || person.name, reference: current.reference || person.name }));
            },
            () => undefined
        );

        return () => {
            alive = false;
        };
    }, []);

    // Schritt 2: Der Fokus springt auf die Bestätigung, damit ein Vorleser sie gleich vorliest.
    useEffect(() => {
        if (receipt) doneHeading.current?.focus();
    }, [receipt]);

    const field = <K extends keyof ICancelInput>(key: K, value: ICancelInput[K]): void => {
        setInput((current) => ({ ...current, [key]: value }));
        setErrors((current) => ({ ...current, [key]: undefined }));
    };

    const submit = async (event: FormEvent): Promise<void> => {
        event.preventDefault();
        if (lock.current) return;

        const found = validate(input, me !== null);
        setErrors(found);
        const first = (["reason", "name", "reference", "email"] as const).find((key) => found[key] !== undefined);
        if (first) {
            // Sonst bliebe der Fokus auf dem Knopf, und ein Vorleser sagte nichts von den Fehlern.
            document.getElementById(`${id}-${first}`)?.focus();
            return;
        }

        lock.current = true;
        setBusy(true);
        setProblem(null);

        try {
            setReceipt(await sendCancellation({ ...input, email: input.email.trim(), name: input.name.trim(), reference: input.reference.trim(), reason: input.reason.trim() }));
        } catch (failure) {
            // Eingabefehler (4xx) sagt der Server selbst. Bei 5xx oder ohne Antwort: der Satz mit dem Weg über support@.
            setProblem(failure instanceof ShopError && failure.status >= 400 && failure.status < 500 ? failure.message : FAILED);
        } finally {
            lock.current = false;
            setBusy(false);
        }
    };

    const note = (key: keyof Errors, hint?: string): string | undefined => (errors[key] !== undefined || hint !== undefined ? `${id}-${key}-note` : undefined);

    return (
        <>
            <PageHeader eyebrow="Shop" title="Vertrag kündigen" lead="Geht ohne Anmeldung. Angemeldet ist alles schon ausgefüllt." />

            <Section flush>
                <div className="u-shell">
                    <div className={styles.page}>
                    {receipt ? (
                        <Panel className={[styles.card, styles.done].join(" ")} accent="var(--c-win)">
                            <p className={styles.step}>Schritt 2 von 2</p>
                            <h2 ref={doneHeading} tabIndex={-1}>
                                Deine Kündigung ist eingegangen
                            </h2>
                            <p className={styles.text}>
                                Eingegangen am <b>{STAMP.format(new Date(receipt.receivedAt))} Uhr</b>.
                            </p>
                            {receipt.matched && receipt.endsAt ? (
                                <p className={styles.text}>
                                    {receipt.title ? `${receipt.title}: ` : ""}Vertragsende ist der <b>{formatDay(receipt.endsAt)}</b>. Bis dahin bleibt dein Zugang, danach
                                    wird nichts mehr abgebucht.
                                </p>
                            ) : (
                                <p className={styles.text}>Wir ordnen sie von Hand deinem Vertrag zu und melden uns, spätestens in zwei Werktagen.</p>
                            )}
                            {input.kind === "extraordinary" && <p className={styles.text}>Deine außerordentliche Kündigung schauen wir uns an und melden uns dazu.</p>}
                            {receipt.mailed ? (
                                <p className={styles.note}>Die Bestätigung geht an {receipt.email}. Kommt keine Mail, schau im Spam-Ordner nach.</p>
                            ) : (
                                <p className={styles.problem}>
                                    Die Bestätigung per Mail an {receipt.email} ging gerade nicht raus. Die Kündigung ist trotzdem eingegangen. Mach dir am besten ein
                                    Bildschirmfoto von dieser Seite.
                                </p>
                            )}
                            <div className={styles.actions}>
                                <Button to={me ? "/zugang" : "/"} variant="outline">
                                    {me ? "Zu Mein Zugang" : "Zur Startseite"}
                                </Button>
                            </div>
                        </Panel>
                    ) : (
                        <Panel className={[form.form, styles.card].join(" ")} accent="var(--c-red)" style={{ ["--accent" as string]: "var(--c-red)" } as CSSProperties}>
                            <form onSubmit={(event) => void submit(event)} noValidate>
                                <p className={styles.step}>Schritt 1 von 2</p>

                                <Field id={`${id}-kind`} label="Art der Kündigung" hint="Ordentlich heißt: zum Ende des bezahlten Monats.">
                                    <select id={`${id}-kind`} className={form.input} aria-describedby={`${id}-kind-note`} value={input.kind} onChange={(event) => field("kind", event.target.value as CancelKind)}>
                                        <option value="ordinary">Ordentlich, zum Monatsende</option>
                                        <option value="extraordinary">Außerordentlich, wichtiger Grund</option>
                                    </select>
                                </Field>

                                {input.kind === "extraordinary" && (
                                    <Field id={`${id}-reason`} label="Grund" error={errors.reason}>
                                        <textarea
                                            id={`${id}-reason`}
                                            className={[form.input, form.area, form.areaSmall].join(" ")}
                                            value={input.reason}
                                            maxLength={1000}
                                            onChange={(event) => field("reason", event.target.value)}
                                            aria-invalid={errors.reason !== undefined}
                                            aria-describedby={note("reason")}
                                        />
                                    </Field>
                                )}

                                <div className={form.row}>
                                    <Field id={`${id}-name`} label="Dein Name" error={errors.name}>
                                        <input
                                            id={`${id}-name`}
                                            className={form.input}
                                            type="text"
                                            value={input.name}
                                            maxLength={100}
                                            autoComplete="name"
                                            onChange={(event) => field("name", event.target.value)}
                                            aria-invalid={errors.name !== undefined}
                                            aria-describedby={note("name")}
                                        />
                                    </Field>

                                    <Field id={`${id}-reference`} label="Discord-Name oder Bestellnummer" error={errors.reference} hint="Etwa RLN-2026-0042 aus der Bestätigung.">
                                        <input
                                            id={`${id}-reference`}
                                            className={form.input}
                                            type="text"
                                            value={input.reference}
                                            maxLength={100}
                                            onChange={(event) => field("reference", event.target.value)}
                                            aria-invalid={errors.reference !== undefined}
                                            aria-describedby={note("reference", "hint")}
                                        />
                                    </Field>
                                </div>

                                <Field
                                    id={`${id}-email`}
                                    label="E-Mail für die Bestätigung"
                                    error={errors.email}
                                    hint={me ? `Leer lassen: Die Bestätigung geht an deine Discord-Mail (${me.email}).` : "Am besten die Mail deines Discord-Kontos, dann ordnen wir die Kündigung sofort zu."}
                                >
                                    <input
                                        id={`${id}-email`}
                                        className={form.input}
                                        type="email"
                                        value={input.email}
                                        maxLength={190}
                                        autoComplete="email"
                                        onChange={(event) => field("email", event.target.value)}
                                        aria-invalid={errors.email !== undefined}
                                        aria-describedby={note("email", "hint")}
                                    />
                                </Field>

                                {problem !== null && (
                                    <p className={styles.problem} role="alert">
                                        {problem}
                                    </p>
                                )}

                                <div className={styles.actions}>
                                    <Button type="submit" disabled={busy}>
                                        {busy ? "Wird gesendet …" : "Jetzt kündigen"}
                                    </Button>
                                </div>
                                <p className={styles.note}>
                                    Danach siehst du Datum und Uhrzeit des Eingangs und, wenn wir dein Abo zuordnen können, wann es endet. Dieselbe Bestätigung
                                    kommt sofort per Mail. Fragen? <a href={`mailto:${siteConfig.contactMail}`}>{siteConfig.contactMail}</a>
                                </p>
                            </form>
                        </Panel>
                    )}
                    </div>
                </div>
            </Section>
        </>
    );
}
