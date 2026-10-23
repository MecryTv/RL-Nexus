import { type CSSProperties, type FormEvent, type JSX, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CONTACT_TOPIC_META, CONTACT_TOPIC_ORDER, ContactTopic } from "../../domain/enums/ContactTopic";
import type { ContactErrors, ContactDelivery, IContactSubmission } from "../../domain/interfaces/IContact";
import { EMPTY_SUBMISSION, contactService } from "../../services/ContactService";
import { siteConfig } from "../../services/SiteConfig";
import { Panel } from "../ui/Panel";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import styles from "./ContactForm.module.scss";

type FormState = "idle" | "sending" | "sent" | "failed";

/**
 * Das Kontaktformular.
 *
 * Erst das Thema, dann die Felder - und die Felder richten sich nach dem Thema:
 * Wer einen Fehler meldet, bekommt ein zusätzliches Feld für Modul, Server und
 * Schritte. Ohne diese Angaben ist eine Fehlermeldung eine Behauptung, und
 * genau deshalb wird sie hier verlangt statt hinterher nachgefragt.
 *
 * Geprüft wird beim Absenden, nicht bei jedem Tastendruck: eine rote Meldung,
 * die erscheint, während man noch am Tippen ist, ist keine Hilfe. Nach dem
 * ersten fehlgeschlagenen Versuch verschwindet ein Fehler dann aber sofort,
 * sobald das Feld stimmt.
 */
export function ContactForm(): JSX.Element {
    const [form, setForm] = useState<IContactSubmission>(EMPTY_SUBMISSION);
    const [errors, setErrors] = useState<ContactErrors>({});
    const [state, setState] = useState<FormState>("idle");
    const [delivery, setDelivery] = useState<ContactDelivery>("endpoint");
    const [failure, setFailure] = useState("");

    // Nach dem ersten Fehlversuch wird bei jeder Änderung neu geprüft.
    const submitted = useRef(false);
    const id = useId();

    const field = <K extends keyof IContactSubmission>(key: K, value: IContactSubmission[K]): void => {
        const next = { ...form, [key]: value };

        setForm(next);
        if (submitted.current) setErrors(contactService.validate(next));
    };

    const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
        event.preventDefault();
        submitted.current = true;

        const found = contactService.validate(form);

        setErrors(found);

        if (Object.keys(found).length > 0) {
            // Zum ersten beanstandeten Feld springen, statt oben eine Liste zu
            // zeigen - bei acht Feldern sucht man sonst selbst.
            document.getElementById(`${id}-${Object.keys(found)[0]}`)?.focus();

            return;
        }

        setState("sending");

        const result = await contactService.send(form);

        setDelivery(result.delivery);

        if (result.ok) {
            setState("sent");
            setForm(EMPTY_SUBMISSION);
            submitted.current = false;
        } else {
            setState("failed");
            setFailure(result.error ?? "Unbekannter Fehler.");
        }
    };

    if (state === "sent") {
        return (
            <Panel className={styles.done} accent="var(--c-win)">
                <span className={styles.doneIcon}>
                    <Icon name="check" size={30} />
                </span>
                <h2>{delivery === "mail" ? "Dein Mailprogramm ist offen" : "Angekommen"}</h2>
                <p>
                    {delivery === "mail"
                        ? "Die Nachricht steht fertig darin, abschicken musst du sie noch selbst. Falls sich nichts geöffnet hat, schreib direkt an die Adresse unten."
                        : "Wir melden uns über den Weg, den du hinterlassen hast. Bei Fehlermeldungen kann eine Rückfrage kommen, bevor sich etwas tut."}
                </p>
                <div className={styles.doneActions}>
                    <Button variant="outline" onClick={() => setState("idle")} icon="arrow-right">
                        Noch eine Nachricht
                    </Button>
                    <Button href={siteConfig.supportURL} variant="ghost" icon="discord">
                        Support-Server
                    </Button>
                </div>
            </Panel>
        );
    }

    const meta = CONTACT_TOPIC_META[form.topic];
    const isBug = form.topic === ContactTopic.Bug;

    return (
        <Panel className={styles.form} accent={meta.accent} style={{ ["--accent" as string]: meta.accent } as CSSProperties}>
            <form onSubmit={onSubmit} noValidate>
                {/* --- Thema ------------------------------------------------ */}
                <fieldset className={styles.topics}>
                    <legend className={styles.legend}>Worum geht es?</legend>
                    <div className={styles.topicGrid}>
                        {CONTACT_TOPIC_ORDER.map((topic) => {
                            const topicMeta = CONTACT_TOPIC_META[topic];
                            const active = form.topic === topic;

                            return (
                                <label
                                    key={topic}
                                    className={[styles.topic, active && styles.topicActive].filter(Boolean).join(" ")}
                                    style={{ ["--accent" as string]: topicMeta.accent } as CSSProperties}
                                >
                                    <input
                                        type="radio"
                                        name="topic"
                                        value={topic}
                                        checked={active}
                                        onChange={() => field("topic", topic)}
                                    />
                                    <Icon name={topicMeta.icon} size={19} />
                                    <span className={styles.topicLabel}>{topicMeta.label}</span>
                                    <span className={styles.topicHint}>{topicMeta.hint}</span>
                                </label>
                            );
                        })}
                    </div>
                </fieldset>

                {/* --- Wer schreibt ----------------------------------------- */}
                <div className={styles.row}>
                    <Field
                        id={`${id}-name`}
                        label="Name"
                        error={errors.name}
                        hint="Wie sollen wir dich ansprechen?"
                    >
                        <input
                            id={`${id}-name`}
                            className={styles.input}
                            type="text"
                            value={form.name}
                            onChange={(event) => field("name", event.target.value)}
                            autoComplete="name"
                            maxLength={80}
                            aria-invalid={errors.name !== undefined}
                        />
                    </Field>

                    <Field
                        id={`${id}-email`}
                        label="E-Mail"
                        error={errors.email}
                        hint="Oder lass sie leer und trag deinen Discord-Namen ein."
                    >
                        <input
                            id={`${id}-email`}
                            className={styles.input}
                            type="email"
                            value={form.email}
                            onChange={(event) => field("email", event.target.value)}
                            autoComplete="email"
                            maxLength={160}
                            aria-invalid={errors.email !== undefined}
                        />
                    </Field>

                    <Field id={`${id}-discord`} label="Discord" hint="Optional, wenn eine E-Mail dasteht.">
                        <input
                            id={`${id}-discord`}
                            className={styles.input}
                            type="text"
                            value={form.discord}
                            onChange={(event) => field("discord", event.target.value)}
                            placeholder="@name"
                            maxLength={64}
                        />
                    </Field>
                </div>

                {/* --- Worum es geht ---------------------------------------- */}
                <Field id={`${id}-subject`} label="Betreff" error={errors.subject}>
                    <input
                        id={`${id}-subject`}
                        className={styles.input}
                        type="text"
                        value={form.subject}
                        onChange={(event) => field("subject", event.target.value)}
                        maxLength={120}
                        aria-invalid={errors.subject !== undefined}
                    />
                </Field>

                {isBug && (
                    <Field
                        id={`${id}-context`}
                        label="Was ist passiert?"
                        error={errors.context}
                        hint="Modul, Server-ID und die Schritte davor. Was sich nicht nachstellen lässt, lässt sich nicht beheben."
                    >
                        <textarea
                            id={`${id}-context`}
                            className={[styles.input, styles.area, styles.areaSmall].join(" ")}
                            value={form.context}
                            onChange={(event) => field("context", event.target.value)}
                            rows={3}
                            maxLength={1000}
                            aria-invalid={errors.context !== undefined}
                        />
                    </Field>
                )}

                <Field
                    id={`${id}-message`}
                    label="Nachricht"
                    error={errors.message}
                    hint={`${form.message.trim().length} von mindestens 20 Zeichen`}
                >
                    <textarea
                        id={`${id}-message`}
                        className={[styles.input, styles.area].join(" ")}
                        value={form.message}
                        onChange={(event) => field("message", event.target.value)}
                        rows={7}
                        maxLength={4000}
                        aria-invalid={errors.message !== undefined}
                    />
                </Field>

                {/*
                    Die Falle. Für Menschen unsichtbar und aus der Tabulator-
                    Reihenfolge genommen; ein Skript füllt sie trotzdem aus und
                    verrät sich damit.
                */}
                <div className={styles.trap} aria-hidden="true">
                    <label htmlFor={`${id}-website`}>Website (bitte leer lassen)</label>
                    <input
                        id={`${id}-website`}
                        name="website"
                        type="text"
                        tabIndex={-1}
                        autoComplete="off"
                        value={form.website}
                        onChange={(event) => field("website", event.target.value)}
                    />
                </div>

                {/* --- Absenden --------------------------------------------- */}
                <div className={styles.footer}>
                    <Button type="submit" size="lg" disabled={state === "sending"} trailingIcon="arrow-right">
                        {state === "sending" ? "Wird gesendet…" : "Nachricht senden"}
                    </Button>
                    <p className={styles.note}>
                        <Icon name="lock" size={14} />
                        {contactService.hasEndpoint ? (
                            <span>
                                Deine Angaben bleiben auf unserem eigenen Server, lesen kann sie nur das Team.{" "}
                                <Link to="/datenschutz#kontakt">Mehr dazu</Link>
                            </span>
                        ) : (
                            <span>Deine Angaben gehen an {siteConfig.contactMail} und sonst nirgendwohin.</span>
                        )}
                    </p>
                </div>

                {/* Der Live-Bereich meldet den Fehlschlag auch dann, wenn
                    jemand die Seite nicht sieht. */}
                <div aria-live="polite">
                    {state === "failed" && (
                        <p className={styles.failure}>
                            <Icon name="close" size={15} />
                            {failure}
                        </p>
                    )}
                </div>
            </form>
        </Panel>
    );
}

/** Ein beschriftetes Feld samt Hinweis und Fehlermeldung. */
function Field({
    id,
    label,
    hint,
    error,
    children,
}: {
    readonly id: string;
    readonly label: string;
    readonly hint?: string;
    readonly error?: string;
    readonly children: JSX.Element;
}): JSX.Element {
    return (
        <div className={[styles.field, error !== undefined && styles.invalid].filter(Boolean).join(" ")}>
            <label className={styles.label} htmlFor={id}>
                {label}
            </label>
            {children}
            {error !== undefined ? (
                <p className={styles.error}>{error}</p>
            ) : (
                hint !== undefined && <p className={styles.hint}>{hint}</p>
            )}
        </div>
    );
}
