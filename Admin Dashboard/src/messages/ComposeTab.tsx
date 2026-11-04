import { useEffect, useMemo, useState, type CSSProperties, type JSX } from "react";
import { useSearchParams } from "react-router-dom";
import { COLOR_HEX, EMPTY_CONTENT, checkMessage, minutesFor, type IMessageAudience, type IMessageContent, type IMessagePerson, type IMessageRun, type IMessageTemplate, type ISendResult } from "../../shared/messages.ts";
import { ApiError, api } from "../api/client";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Field } from "../components/Field";
import { Panel } from "../components/Panel";
import { Segmented } from "../components/Segmented";
import { formatNumber } from "../format";
import { useToast } from "../toast/context";
import { MessageForm, MessagePreview } from "./MessageForm";
import styles from "./messages.module.scss";

const SNOWFLAKE = /^\d{17,20}$/;
const CONFIRM = "SENDEN";

type Mode = "all" | "one";

const message = (error: unknown): string => (error instanceof ApiError || error instanceof Error ? error.message : String(error));
const people = (count: number): string => `${formatNumber(count)} ${count === 1 ? "Person" : "Personen"}`;

/** Satz zu einer Person, die nichts bekommen kann (Spec Teil 4). */
const REFUSED: Readonly<Record<Exclude<IMessagePerson["state"], "ok">, string>> = {
    nodata: "Zu dieser ID hat RL Nexus keine Daten.",
    deleted: "Diese Person hat ihre Daten löschen lassen.",
    banned: "Gesperrt. RL Nexus schickt dieser Person keine Nachrichten.",
};

/** Name, Bild und Zustand zu einer Discord-ID, sobald sie vollständig ist. */
function usePerson(userId: string | null): { readonly data: IMessagePerson | null; readonly error: string | null } {
    const [found, setFound] = useState<{ readonly id: string; readonly data: IMessagePerson | null; readonly error: string | null } | null>(null);

    useEffect(() => {
        if (!userId) return;

        const controller = new AbortController();

        api<IMessagePerson>(`/api/messages/person/${userId}`, { signal: controller.signal })
            .then((data) => setFound({ id: userId, data, error: null }))
            .catch((reason: unknown) => {
                if (!controller.signal.aborted) setFound({ id: userId, data: null, error: message(reason) });
            });

        return () => controller.abort();
    }, [userId]);

    return found && found.id === userId ? found : { data: null, error: null };
}

/** Der Kasten über dem Formular, solange eine Nachricht an alle läuft oder angehalten ist. */
function RunBox({ run, developer }: { readonly run: IMessageRun; readonly developer: boolean }): JSX.Element {
    const notify = useToast();
    const [busy, setBusy] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const done = run.sent + run.failed + run.skipped;
    const share = run.total > 0 ? Math.min(100, Math.round((done / run.total) * 100)) : 100;
    const act = (action: "pause" | "resume" | "cancel", sentence: string): void => {
        setBusy(true);
        api(`/api/messages/${run.id}/${action}`, { method: "POST" })
            .then(() => notify(sentence))
            .catch((reason: unknown) => notify(message(reason), "danger"))
            .finally(() => {
                setBusy(false);
                setCancelling(false);
            });
    };

    return (
        <Panel className={styles.run} accent={run.state === "paused" ? "var(--c-mod-engagement)" : "var(--c-blue)"}>
            <div className={styles.runHead}>
                <div>
                    <h2>
                        An alle: „{run.title}“ <Badge tone={run.state === "paused" ? "warn" : "info"}>{run.state === "paused" ? "Angehalten" : "Läuft"}</Badge>
                    </h2>
                    {run.pauseReason && <p className={styles.warnText}>{run.pauseReason}</p>}
                </div>
                {developer && (
                    <div className={styles.actions}>
                        {run.state === "running" ? (
                            <Button size="sm" busy={busy} onClick={() => act("pause", "Angehalten. Es geht erst weiter, wenn du „Weiter“ drückst.")}>
                                Anhalten
                            </Button>
                        ) : (
                            <Button size="sm" variant="primary" busy={busy} onClick={() => act("resume", "Geht weiter, eine DM alle 2 Sekunden.")}>
                                Weiter
                            </Button>
                        )}
                        <Button size="sm" variant="danger" disabled={busy} onClick={() => setCancelling(true)}>
                            Abbrechen …
                        </Button>
                    </div>
                )}
            </div>
            <div className={styles.bar} role="progressbar" aria-label="Fortschritt" aria-valuemin={0} aria-valuemax={100} aria-valuenow={share}>
                <span style={{ "--share": `${share}%` } as CSSProperties} />
            </div>
            <dl className={styles.runFacts}>
                <div>
                    <dt>Zugestellt</dt>
                    <dd>{formatNumber(run.sent)}</dd>
                </div>
                <div>
                    <dt>Nicht erreicht</dt>
                    <dd>{formatNumber(run.failed + run.skipped)}</dd>
                </div>
                <div>
                    <dt>Noch offen</dt>
                    <dd>{formatNumber(run.open)}</dd>
                </div>
                <div>
                    <dt>Restzeit</dt>
                    <dd>{run.open === 0 ? "–" : `≈ ${formatNumber(minutesFor(run.open))} Min.`}</dd>
                </div>
            </dl>
            <ConfirmDialog
                open={cancelling}
                title="Nachricht an alle abbrechen?"
                confirmLabel="Abbrechen"
                tone="danger"
                busy={busy}
                onConfirm={() => act("cancel", "Abgebrochen. Wer noch offen war, bekommt die Nachricht nicht.")}
                onCancel={() => setCancelling(false)}
            >
                <p>
                    {people(run.open)} bekommen die Nachricht dann nicht mehr. Wer sie schon hat, behält sie. Danach lässt sich die Nachricht nicht fortsetzen.
                </p>
            </ConfirmDialog>
        </Panel>
    );
}

/** Reiter „Neue Nachricht“ (Spec Teil 6, Entwurf N-A): Empfänger, Vorlagen, Formular, Vorschau, Senden. */
export function ComposeTab({
    audience,
    templates,
    developer,
    onSent,
}: {
    readonly audience: IMessageAudience;
    readonly templates: readonly IMessageTemplate[];
    readonly developer: boolean;
    readonly onSent: () => void;
}): JSX.Element {
    const notify = useToast();
    const [params] = useSearchParams();
    const given = params.get("an") ?? "";
    const allBlocked = !developer || audience.running !== null;
    const [mode, setMode] = useState<Mode>(given || !developer ? "one" : "all");
    const [target, setTarget] = useState(given);
    const [seen, setSeen] = useState(given);
    const first = templates.find((template) => template.audience === mode);
    const [templateName, setTemplateName] = useState(first?.name ?? "");
    const [content, setContent] = useState<IMessageContent>(first?.content ?? EMPTY_CONTENT);
    const [asking, setAsking] = useState<Mode | null>(null);
    const [typed, setTyped] = useState("");
    const [busy, setBusy] = useState<"test" | "send" | null>(null);

    // Aus dem Profil („Nachricht schicken“) mit neuer Person: beim Rendern angleichen statt in einem Effekt.
    if (seen !== given) {
        setSeen(given);
        if (given) {
            setTarget(given);
            setMode("one");
        }
    }

    const effectiveMode: Mode = mode === "all" && allBlocked ? "one" : mode;
    const wanted = target.trim();
    const person = usePerson(effectiveMode === "one" && SNOWFLAKE.test(wanted) ? wanted : null);
    const checked = useMemo(() => checkMessage(content, audience.guildId), [content, audience.guildId]);
    const problem = "problem" in checked ? checked.problem : null;
    const name = person.data?.name ?? wanted;
    const canSend = !problem && (effectiveMode === "all" ? !allBlocked && audience.recipients > 0 : person.data?.state === "ok");

    const send = (): void => {
        setBusy("send");

        const request =
            effectiveMode === "all"
                ? api<{ id: number; total: number }>("/api/messages/all", { method: "POST", body: { template: templateName, content, confirm: typed } }).then(() =>
                      notify(`Läuft: ${people(audience.recipients)}, eine DM alle 2 Sekunden.`)
                  )
                : api<ISendResult>("/api/messages/one", { method: "POST", body: { userId: wanted, template: templateName, content } }).then((result) =>
                      notify(result.sent ? `Bei ${name} angekommen.` : `Nicht angekommen: ${result.reason ?? "unbekannt"}`, result.sent ? "ok" : "danger")
                  );

        request
            .then(() => {
                setAsking(null);
                setTyped("");
                onSent();
            })
            .catch((reason: unknown) => notify(message(reason), "danger"))
            .finally(() => setBusy(null));
    };

    const test = (): void => {
        setBusy("test");
        api<ISendResult>("/api/messages/test", { method: "POST", body: { content } })
            .then((result) => notify(result.sent ? "Test ist bei dir angekommen. Schau in deine DMs." : `Test nicht angekommen: ${result.reason ?? "unbekannt"}`, result.sent ? "ok" : "danger"))
            .catch((reason: unknown) => notify(message(reason), "danger"))
            .finally(() => setBusy(null));
    };

    const load = (template: IMessageTemplate): void => {
        setTemplateName(template.name);
        setContent(template.content);
    };

    return (
        <div className={styles.compose}>
            {audience.running && <RunBox run={audience.running} developer={developer} />}

            <div className={styles.toolbar}>
                <Segmented
                    name="empfaenger"
                    legend="An"
                    options={[
                        {
                            value: "all",
                            label: `An alle (${formatNumber(audience.recipients)})`,
                            disabled: allBlocked,
                            title: !developer ? "Nur Developer" : audience.running ? "Es läuft schon eine Nachricht an alle." : undefined,
                        },
                        { value: "one", label: "An eine Person" },
                    ]}
                    value={effectiveMode}
                    onChange={setMode}
                />
                {effectiveMode === "all" ? (
                    <ul className={styles.chips}>
                        <li>
                            {formatNumber(audience.banned)} gesperrt, {audience.banned === 1 ? "bekommt" : "bekommen"} nichts
                        </li>
                        <li>≈ {formatNumber(minutesFor(audience.recipients))} Min. zum Senden</li>
                    </ul>
                ) : (
                    !developer && <p className={styles.dim}>An alle schicken nur Developer.</p>
                )}
            </div>

            {effectiveMode === "one" && (
                <div className={styles.target}>
                    <Field id="nachricht-an" label="Discord-ID" hint="17 bis 20 Ziffern, etwa aus dem Profil der Nutzerdaten">
                        <input
                            id="nachricht-an"
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            value={target}
                            maxLength={20}
                            aria-describedby="nachricht-an-hint"
                            onChange={(event) => setTarget(event.target.value.replace(/\D/g, ""))}
                        />
                    </Field>
                    {person.data && (
                        <div className={styles.person}>
                            {person.data.avatar ? (
                                <img src={person.data.avatar} alt="" />
                            ) : (
                                <span aria-hidden="true">{(person.data.name ?? "?").trim().charAt(0).toUpperCase() || "?"}</span>
                            )}
                            <div>
                                <b>{person.data.name ?? "Unbekannt"}</b>
                                <small>{person.data.id}</small>
                            </div>
                            {person.data.state !== "ok" && <p className={styles.warnText}>{REFUSED[person.data.state]}</p>}
                        </div>
                    )}
                    {person.error && <p className={styles.warnText}>{person.error}</p>}
                </div>
            )}

            <div className={styles.layout}>
                <nav className={styles.templates} aria-label="Vorlagen">
                    <h2>Vorlagen</h2>
                    {templates.length === 0 ? (
                        <p className={styles.dim}>Noch keine Vorlage.</p>
                    ) : (
                        <ul>
                            {templates.map((template) => (
                                <li key={template.id}>
                                    <button type="button" className={template.name === templateName ? styles.picked : undefined} aria-pressed={template.name === templateName} onClick={() => load(template)}>
                                        <span className={styles.swatch} style={{ "--swatch": COLOR_HEX[template.content.color] } as CSSProperties} aria-hidden="true" />
                                        <span>
                                            {template.name}
                                            <small>{template.audience === "all" ? "an alle" : "an eine Person"}</small>
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </nav>

                <div>
                    <MessageForm id="nachricht" value={content} onChange={setContent} />
                    {problem && (
                        <p className={styles.problem} role="status">
                            {problem}
                        </p>
                    )}
                    <div className={styles.send}>
                        <Button icon="send" busy={busy === "test"} disabled={problem !== null || busy !== null} onClick={test}>
                            An mich testen
                        </Button>
                        <Button variant={effectiveMode === "all" ? "danger" : "primary"} icon="send" disabled={!canSend || busy !== null} onClick={() => setAsking(effectiveMode)}>
                            {effectiveMode === "all" ? `An ${formatNumber(audience.recipients)} senden …` : "Senden …"}
                        </Button>
                    </div>
                </div>

                <MessagePreview content={content} problem={problem} />
            </div>

            <ConfirmDialog
                open={asking === "all"}
                title="An alle senden?"
                confirmLabel={`An ${formatNumber(audience.recipients)} senden`}
                tone="danger"
                busy={busy === "send"}
                confirmDisabled={typed !== CONFIRM}
                onConfirm={send}
                onCancel={() => {
                    setAsking(null);
                    setTyped("");
                }}
            >
                <dl className={styles.confirmFacts}>
                    <div>
                        <dt>Personen mit Daten</dt>
                        <dd>{formatNumber(audience.people)}</dd>
                    </div>
                    <div>
                        <dt>Gesperrt, bekommen nichts</dt>
                        <dd>{formatNumber(audience.banned)}</dd>
                    </div>
                    <div>
                        <dt>Bekommen die Nachricht</dt>
                        <dd>{formatNumber(audience.recipients)}</dd>
                    </div>
                    <div>
                        <dt>Dauer</dt>
                        <dd>≈ {formatNumber(minutesFor(audience.recipients))} Min.</dd>
                    </div>
                </dl>
                <p>Eine DM alle 2 Sekunden. Eine DM, die angekommen ist, lässt sich nicht zurückholen.</p>
                <Field id="nachricht-bestaetigen" label={`Zum Bestätigen ${CONFIRM} eintippen`}>
                    <input id="nachricht-bestaetigen" type="text" autoComplete="off" value={typed} onChange={(event) => setTyped(event.target.value)} />
                </Field>
            </ConfirmDialog>

            <ConfirmDialog open={asking === "one"} title={`An ${name} senden?`} confirmLabel="Senden" busy={busy === "send"} onConfirm={send} onCancel={() => setAsking(null)}>
                <p>„{content.title}“ geht sofort als DM über den Bot hinaus und lässt sich nicht zurückholen.</p>
            </ConfirmDialog>
        </div>
    );
}
