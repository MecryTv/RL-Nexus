import { useState, type FormEvent, type JSX } from "react";
import type { IGroupList, INotificationInput, ISentList } from "../../shared/api";
import {
    GROUPS,
    GROUP_LABELS,
    NOTIFICATION_KINDS,
    NOTIFICATION_KIND_LABELS,
    NOTIFICATION_LIMITS,
    SNOWFLAKE,
    type Group,
    type NotificationKind,
} from "../../shared/limits";
import { isSafeLink } from "../../shared/links";
import { api } from "../api/client";
import { useApi } from "../api/useApi";
import { Badge, type BadgeTone } from "../components/Badge";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Field } from "../components/Field";
import { PageHeader } from "../components/PageHeader";
import { Panel } from "../components/Panel";
import { Segmented } from "../components/Segmented";
import { Failure, Loading } from "../components/Status";
import { formatDateTime } from "../format";
import { useToast } from "../toast/context";
import { useTitle } from "../useTitle";
import styles from "./NotificationsPage.module.scss";

type Mode = "group" | "ids";
/** Zugleich das Ende der Feld-ID: meldung-gruppe, meldung-title … */
type FieldName = "gruppe" | "ids" | "title" | "text" | "link";

const KIND_TONE: Readonly<Record<NotificationKind, BadgeTone>> = { info: "info", success: "ok", warn: "warn" };

const MODES = [
    { value: "group", label: "An eine Gruppe" },
    { value: "ids", label: "An Discord-IDs" },
] as const;

const KINDS = NOTIFICATION_KINDS.map((value) => ({ value, label: NOTIFICATION_KIND_LABELS[value] }));

/** IDs aus dem Textfeld: getrennt durch Zeilen, Leerzeichen, Kommas oder Semikolons, doppelte zählen einmal. */
function parseIds(raw: string): string[] {
    return [...new Set(raw.split(/[\s,;]+/).filter(Boolean))];
}

function people(count: number): string {
    return count === 1 ? "1 Person" : `${count} Personen`;
}

function isGroup(value: string): value is Group {
    return (GROUPS as readonly string[]).includes(value);
}

export function NotificationsPage(): JSX.Element {
    useTitle("Meldungen");

    const notify = useToast();
    const groups = useApi<IGroupList>("/api/groups");
    const recent = useApi<ISentList>("/api/notifications/recent");
    const [mode, setMode] = useState<Mode>("group");
    const [group, setGroup] = useState<Group>("partner");
    const [rawIds, setRawIds] = useState("");
    const [kind, setKind] = useState<NotificationKind>("info");
    const [title, setTitle] = useState("");
    const [text, setText] = useState("");
    const [link, setLink] = useState("");
    const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
    const [confirming, setConfirming] = useState(false);
    const [sending, setSending] = useState(false);

    const ids = parseIds(rawIds);
    const groupSize = groups.data ? groups.data.entries.filter((entry) => entry.group === group).length : null;

    function clear(field: FieldName): void {
        if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
    }

    function validate(): FieldName | null {
        const next: Partial<Record<FieldName, string>> = {};

        if (mode === "group" && groupSize === 0) next.gruppe = "In dieser Gruppe ist gerade niemand.";

        if (mode === "ids") {
            if (ids.length === 0) next.ids = "Trag mindestens eine Discord-ID ein.";
            else if (ids.some((entry) => !SNOWFLAKE.test(entry))) next.ids = "Jede ID besteht aus 17 bis 20 Ziffern.";
            else if (ids.length > NOTIFICATION_LIMITS.ids) next.ids = `Höchstens ${NOTIFICATION_LIMITS.ids} IDs auf einmal.`;
        }

        if (!title.trim()) next.title = "Der Titel fehlt.";
        if (!text.trim()) next.text = "Der Text fehlt.";
        if (link.trim() && !isSafeLink(link.trim())) next.link = "Der Link muss mit https:// oder mit / beginnen.";

        setErrors(next);

        return (Object.keys(next)[0] as FieldName | undefined) ?? null;
    }

    function submit(event: FormEvent): void {
        event.preventDefault();

        const invalid = validate();

        if (invalid) document.getElementById(`meldung-${invalid}`)?.focus();
        else setConfirming(true);
    }

    // Die Rückfrage geht danach in jedem Fall zu: ein Fehler-Hinweis läge sonst
    // unsichtbar hinter dem abgedunkelten Hintergrund des Dialogs.
    async function send(): Promise<void> {
        const input: INotificationInput = {
            recipients: mode === "group" ? { group } : { ids },
            kind,
            title: title.trim(),
            body: text.trim(),
            ...(link.trim() ? { link: link.trim() } : {}),
        };

        setSending(true);

        try {
            const result = await api<{ count: number }>("/api/notifications", { method: "POST", body: input });

            notify(`Meldung an ${people(result.count)} verschickt.`);
            setTitle("");
            setText("");
            setLink("");
            setRawIds("");
            recent.reload();
        } catch (failure) {
            notify(failure instanceof Error ? failure.message : String(failure), "danger");
        } finally {
            setSending(false);
            setConfirming(false);
        }
    }

    const describedBy = (field: FieldName, hint: boolean): string | undefined =>
        errors[field] ? `meldung-${field}-error` : hint ? `meldung-${field}-hint` : undefined;

    return (
        <>
            <PageHeader title="Meldungen" meta="Landen im Postfach des Bot-Dashboards. Das holt neue Meldungen jede Minute nach." />

            <div className={styles.layout}>
                <Panel className={styles.formPanel}>
                    <form className={styles.form} onSubmit={submit} noValidate>
                        <Segmented name="meldung-empfaenger" legend="Empfänger" options={MODES} value={mode} onChange={setMode} />

                        {mode === "group" ? (
                            <Field
                                id="meldung-gruppe"
                                label="Gruppe"
                                hint={groupSize === null ? undefined : `In dieser Gruppe ${groupSize === 1 ? "ist" : "sind"} gerade ${people(groupSize)}.`}
                                error={errors.gruppe}
                            >
                                <select
                                    id="meldung-gruppe"
                                    value={group}
                                    onChange={(event) => {
                                        if (isGroup(event.target.value)) setGroup(event.target.value);
                                        clear("gruppe");
                                    }}
                                    aria-invalid={errors.gruppe ? true : undefined}
                                    aria-describedby={describedBy("gruppe", groupSize !== null)}
                                >
                                    {GROUPS.map((value) => (
                                        <option key={value} value={value}>
                                            {GROUP_LABELS[value]}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                        ) : (
                            <Field
                                id="meldung-ids"
                                label="Discord-IDs"
                                hint={`Eine pro Zeile oder mit Komma getrennt, höchstens ${NOTIFICATION_LIMITS.ids}. Erkannt: ${ids.length}.`}
                                error={errors.ids}
                            >
                                <textarea
                                    id="meldung-ids"
                                    rows={4}
                                    value={rawIds}
                                    onChange={(event) => {
                                        setRawIds(event.target.value);
                                        clear("ids");
                                    }}
                                    aria-invalid={errors.ids ? true : undefined}
                                    aria-describedby={describedBy("ids", true)}
                                />
                            </Field>
                        )}

                        <Segmented name="meldung-art" legend="Art" options={KINDS} value={kind} onChange={setKind} />

                        <Field id="meldung-title" label="Titel" error={errors.title} counter={{ value: title.length, max: NOTIFICATION_LIMITS.title }}>
                            <input
                                id="meldung-title"
                                type="text"
                                maxLength={NOTIFICATION_LIMITS.title}
                                value={title}
                                onChange={(event) => {
                                    setTitle(event.target.value);
                                    clear("title");
                                }}
                                aria-invalid={errors.title ? true : undefined}
                                aria-describedby={describedBy("title", false)}
                            />
                        </Field>

                        <Field id="meldung-text" label="Text" error={errors.text} counter={{ value: text.length, max: NOTIFICATION_LIMITS.body }}>
                            <textarea
                                id="meldung-text"
                                rows={5}
                                maxLength={NOTIFICATION_LIMITS.body}
                                value={text}
                                onChange={(event) => {
                                    setText(event.target.value);
                                    clear("text");
                                }}
                                aria-invalid={errors.text ? true : undefined}
                                aria-describedby={describedBy("text", false)}
                            />
                        </Field>

                        <Field
                            id="meldung-link"
                            label="Link"
                            hint="Optional. Ein Pfad im Bot-Dashboard wie /guild/123/uebersicht oder eine volle https-Adresse."
                            error={errors.link}
                        >
                            <input
                                id="meldung-link"
                                type="text"
                                maxLength={NOTIFICATION_LIMITS.link}
                                value={link}
                                onChange={(event) => {
                                    setLink(event.target.value);
                                    clear("link");
                                }}
                                aria-invalid={errors.link ? true : undefined}
                                aria-describedby={describedBy("link", true)}
                            />
                        </Field>

                        <Button type="submit" variant="primary" icon="send">
                            Meldung senden
                        </Button>
                    </form>
                </Panel>

                <aside className={styles.side} aria-labelledby="meldung-vorschau">
                    <h2 id="meldung-vorschau" className={styles.heading}>
                        Vorschau
                    </h2>
                    <Panel cut="sm" className={styles.preview}>
                        <Badge tone={KIND_TONE[kind]}>{NOTIFICATION_KIND_LABELS[kind]}</Badge>
                        <p className={title.trim() ? styles.previewTitle : styles.placeholder}>{title.trim() || "Hier steht der Titel"}</p>
                        <p className={text.trim() ? styles.previewText : styles.placeholder}>{text.trim() || "Darunter der Text."}</p>
                        {link.trim() && <p className={styles.previewLink}>Führt zu {link.trim()}</p>}
                    </Panel>
                </aside>
            </div>

            <section className={styles.recent} aria-labelledby="meldung-zuletzt">
                <h2 id="meldung-zuletzt" className={styles.heading}>
                    Zuletzt verschickt
                </h2>

                {recent.error && !recent.data ? (
                    <Failure message={recent.error.message} onRetry={recent.reload} />
                ) : !recent.data ? (
                    <Loading />
                ) : recent.data.sent.length === 0 ? (
                    <p className={styles.empty}>Noch keine Meldung verschickt.</p>
                ) : (
                    <div className={styles.frame}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th scope="col">Wann</th>
                                    <th scope="col">Titel</th>
                                    <th scope="col">Art</th>
                                    <th scope="col">An</th>
                                    <th scope="col">Von</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recent.data.sent.map((entry, index) => (
                                    <tr key={`${entry.sentAt}-${index}`}>
                                        <td className={styles.when}>{formatDateTime(entry.sentAt)}</td>
                                        <td>{entry.title}</td>
                                        <td>{entry.kind ? <Badge tone={KIND_TONE[entry.kind]}>{NOTIFICATION_KIND_LABELS[entry.kind]}</Badge> : "–"}</td>
                                        <td>
                                            {entry.to}
                                            {entry.count !== null && <span className={styles.count}> ({people(entry.count)})</span>}
                                        </td>
                                        <td>{entry.by}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <ConfirmDialog
                open={confirming}
                title="Meldung senden?"
                confirmLabel="Senden"
                busy={sending}
                onConfirm={() => void send()}
                onCancel={() => setConfirming(false)}
            >
                <p>
                    „{title.trim()}“ geht an{" "}
                    {mode === "group"
                        ? `alle aus der Gruppe ${GROUP_LABELS[group]}${groupSize !== null ? `, das sind ${people(groupSize)}` : ""}`
                        : people(ids.length)}
                    . Zurückholen lässt sich eine Meldung nicht.
                </p>
            </ConfirmDialog>
        </>
    );
}
