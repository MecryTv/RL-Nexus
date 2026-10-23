import { useState, type FormEvent, type JSX } from "react";
import { Link } from "react-router-dom";
import { BETA_LIMITS, type IBetaCode, type IBetaTester, type IBetaView } from "../../shared/beta";
import { api } from "../api/client";
import { useLive } from "../api/live";
import { useApi } from "../api/useApi";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { CopyText } from "../components/CopyText";
import { Field } from "../components/Field";
import { PageHeader } from "../components/PageHeader";
import { Panel } from "../components/Panel";
import { Failure, Loading } from "../components/Status";
import { UserChip } from "../components/UserChip";
import { formatDateTime } from "../format";
import shop from "../shop/shop.module.scss";
import { useToast } from "../toast/context";
import { useTitle } from "../useTitle";
import styles from "./beta.module.scss";

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/** Wie ein Code gerade steht. */
function stateOf(code: IBetaCode): { label: string; tone: "ok" | "neutral" | "danger" } {
    if (code.revokedAt) return { label: "Gesperrt", tone: "danger" };
    if (code.uses >= code.maxUses) return { label: "Aufgebraucht", tone: "neutral" };

    return { label: "Offen", tone: "ok" };
}

/**
 * Bot → Beta Access (Plan 22): Codes erzeugen und sperren, Tester sehen und
 * entziehen. Umgeschaltet wird der Modus unter Shop → Einstellungen, damit
 * Free, Paid und Beta an einer Stelle stehen.
 */
export function BetaPage(): JSX.Element {
    useTitle("Beta Access");
    const notify = useToast();
    const view = useApi<IBetaView>("/api/beta");
    const [count, setCount] = useState("5");
    const [uses, setUses] = useState("1");
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [fresh, setFresh] = useState<IBetaCode[]>([]);
    const [revoking, setRevoking] = useState<IBetaCode | null>(null);
    const [removing, setRemoving] = useState<IBetaTester | null>(null);

    useLive("beta", view.reload);
    useLive("shop", view.reload);

    const create = async (event: FormEvent): Promise<void> => {
        event.preventDefault();
        setBusy(true);

        try {
            const answer = await api<{ codes: IBetaCode[] }>("/api/beta/codes", { method: "POST", body: { count: Number(count), maxUses: Number(uses), note } });
            setFresh(answer.codes);
            notify(answer.codes.length === 1 ? "Ein Beta-Code ist erzeugt." : `${answer.codes.length} Beta-Codes sind erzeugt.`);
            view.reload();
        } catch (failure) {
            notify(messageOf(failure), "danger");
        } finally {
            setBusy(false);
        }
    };

    const act = async (run: () => Promise<unknown>, done: string): Promise<void> => {
        setBusy(true);

        try {
            await run();
            notify(done);
            setRevoking(null);
            setRemoving(null);
            view.reload();
        } catch (failure) {
            notify(messageOf(failure), "danger");
        } finally {
            setBusy(false);
        }
    };

    if (view.error && !view.data) return <Failure message={view.error.message} onRetry={view.reload} />;
    if (!view.data) return <Loading label="Beta Access wird geladen" />;

    const { mode, changedAt, codes, testers } = view.data;
    const open = codes.filter((code) => stateOf(code).label === "Offen").length;

    return (
        <>
            <PageHeader title="Beta Access" meta={`${testers.length} Tester, ${open} ${open === 1 ? "offener Code" : "offene Codes"}.`} />

            <Panel className={`${styles.status} ${mode === "beta" ? styles.on : ""}`}>
                <p>
                    {mode === "beta" ? (
                        <>
                            <b>Beta Access ist an{changedAt ? ` seit ${formatDateTime(changedAt)}` : ""}.</b> Ins Bot-Dashboard kommt nur, wer unten als Tester
                            steht, dazu Administrator und Developer.
                        </>
                    ) : (
                        <>
                            <b>Beta Access ist aus.</b> Codes kannst du schon erzeugen und verteilen. Einlösen lassen sie sich, sobald du auf Beta Access
                            stellst: Dann zeigt die Sperrseite im Bot-Dashboard das Feld für den Code.
                        </>
                    )}
                </p>
                <Link className={styles.statusLink} to="/shop/einstellungen">
                    Umstellen unter Shop → Einstellungen
                </Link>
            </Panel>

            <div className={styles.grid}>
                <Panel className={shop.box}>
                    <h2 className={shop.boxTitle}>Codes erzeugen</h2>
                    <form className={styles.form} onSubmit={(event) => void create(event)} noValidate>
                        <Field id="beta-anzahl" label="Anzahl" hint={`1 bis ${BETA_LIMITS.count} auf einmal.`}>
                            <input id="beta-anzahl" type="text" inputMode="numeric" value={count} onChange={(event) => setCount(event.target.value)} aria-describedby="beta-anzahl-hint" />
                        </Field>
                        <Field id="beta-nutzungen" label="Nutzungen je Code" hint="1 heißt: ein Code für genau eine Person.">
                            <input id="beta-nutzungen" type="text" inputMode="numeric" value={uses} onChange={(event) => setUses(event.target.value)} aria-describedby="beta-nutzungen-hint" />
                        </Field>
                        <Field id="beta-notiz" label="Notiz" hint="Nur für dich, etwa für wen die Codes sind." counter={{ value: note.length, max: BETA_LIMITS.note }}>
                            <input id="beta-notiz" type="text" value={note} maxLength={BETA_LIMITS.note} onChange={(event) => setNote(event.target.value)} aria-describedby="beta-notiz-hint" />
                        </Field>
                        <Button type="submit" variant="primary" icon="plus" busy={busy}>
                            Erzeugen
                        </Button>
                    </form>

                    {fresh.length > 0 && (
                        <div className={styles.fresh}>
                            <p className={shop.fact}>Gerade erzeugt. Zum Weitergeben kopieren:</p>
                            <ul>
                                {fresh.map((code) => (
                                    <li key={code.id}>
                                        <CopyText value={code.code} />
                                    </li>
                                ))}
                            </ul>
                            {fresh.length > 1 && (
                                <>
                                    <p className={shop.fact}>Alle auf einmal, je Zeile ein Code:</p>
                                    <CopyText value={fresh.map((code) => code.code).join("\n")} />
                                </>
                            )}
                        </div>
                    )}
                </Panel>

                <Panel className={shop.box}>
                    <h2 className={shop.boxTitle}>So kommen Tester rein</h2>
                    <ol className={styles.steps}>
                        <li>Du gibst jemandem einen Code.</li>
                        <li>Die Person meldet sich im Bot-Dashboard mit Discord an und sieht im Beta-Modus eine Sperrseite.</li>
                        <li>Dort tippt sie den Code ein und ist sofort drin. Groß- und Kleinschreibung zählen nicht.</li>
                    </ol>
                    <p className={shop.fact}>Wer schon Tester ist, verbraucht keinen weiteren Code. Entziehst du den Zugang, ist die Person nach spätestens einer Minute draußen.</p>
                </Panel>
            </div>

            <section className={styles.section} aria-labelledby="beta-tester">
                <h2 id="beta-tester" className={styles.heading}>
                    Beta-Tester
                </h2>
                {testers.length === 0 ? (
                    <p className={styles.empty}>Noch hat niemand einen Code eingelöst.</p>
                ) : (
                    <div className={shop.frame}>
                        <table className={`${shop.table} ${styles.table}`}>
                            <thead>
                                <tr>
                                    <th scope="col">Person</th>
                                    <th scope="col">Code</th>
                                    <th scope="col">Eingelöst</th>
                                    <th scope="col">
                                        <span className={shop.srOnly}>Aktion</span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {testers.map((tester) => (
                                    <tr key={tester.userId}>
                                        <td>
                                            <UserChip user={{ id: tester.userId, name: tester.name, avatar: tester.avatar }} />
                                        </td>
                                        <td>
                                            <code>{tester.code ?? "–"}</code>
                                        </td>
                                        <td>{formatDateTime(tester.redeemedAt)}</td>
                                        <td className={styles.action}>
                                            <Button size="sm" variant="ghost" icon="ban" onClick={() => setRemoving(tester)}>
                                                Entziehen
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <section className={styles.section} aria-labelledby="beta-codes">
                <h2 id="beta-codes" className={styles.heading}>
                    Codes
                </h2>
                {codes.length === 0 ? (
                    <p className={styles.empty}>Noch keine Codes.</p>
                ) : (
                    <div className={shop.frame}>
                        <table className={`${shop.table} ${styles.table}`}>
                            <thead>
                                <tr>
                                    <th scope="col">Code</th>
                                    <th scope="col">Genutzt</th>
                                    <th scope="col">Notiz</th>
                                    <th scope="col">Erzeugt</th>
                                    <th scope="col">Stand</th>
                                    <th scope="col">
                                        <span className={shop.srOnly}>Aktion</span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {codes.map((code) => {
                                    const state = stateOf(code);

                                    return (
                                        <tr key={code.id}>
                                            <td>
                                                <CopyText value={code.code} />
                                            </td>
                                            <td>
                                                {code.uses} / {code.maxUses}
                                            </td>
                                            <td className={styles.note}>{code.note ?? "–"}</td>
                                            <td>{formatDateTime(code.createdAt)}</td>
                                            <td>
                                                <Badge tone={state.tone}>{state.label}</Badge>
                                            </td>
                                            <td className={styles.action}>
                                                {!code.revokedAt && (
                                                    <Button size="sm" variant="ghost" icon="ban" onClick={() => setRevoking(code)}>
                                                        Sperren
                                                    </Button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <ConfirmDialog
                open={revoking !== null}
                title="Code sperren?"
                confirmLabel="Sperren"
                tone="danger"
                busy={busy}
                onConfirm={() => revoking && void act(() => api(`/api/beta/codes/${revoking.id}/revoke`, { method: "POST" }), `${revoking.code} ist gesperrt.`)}
                onCancel={() => setRevoking(null)}
            >
                <p className={shop.fact}>
                    <b>{revoking?.code}</b> lässt sich danach nicht mehr einlösen. Wer ihn schon eingelöst hat, bleibt Tester.
                </p>
            </ConfirmDialog>

            <ConfirmDialog
                open={removing !== null}
                title="Beta-Zugang entziehen?"
                confirmLabel="Entziehen"
                tone="danger"
                busy={busy}
                onConfirm={() => removing && void act(() => api(`/api/beta/members/${removing.userId}`, { method: "DELETE" }), "Der Beta-Zugang ist entzogen.")}
                onCancel={() => setRemoving(null)}
            >
                <p className={shop.fact}>
                    <b>{removing?.name ?? removing?.userId}</b> kommt im Beta-Modus nach spätestens einer Minute nicht mehr ins Bot-Dashboard. Mit einem neuen
                    Code geht es wieder.
                </p>
            </ConfirmDialog>
        </>
    );
}
