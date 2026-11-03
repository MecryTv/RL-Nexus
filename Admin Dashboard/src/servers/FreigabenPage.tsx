import { useState, type JSX } from "react";
import type { IFreigaben, IRequestView } from "../../shared/servers.ts";
import { useLive } from "../api/live";
import { useApi } from "../api/useApi";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { PageHeader } from "../components/PageHeader";
import { Failure, Loading } from "../components/Status";
import { formatNumber } from "../format";
import { useTitle } from "../useTitle";
import { PersonCell, Seal } from "./parts";
import { day, dropText, since, stamp, useAct } from "./util.ts";
import styles from "./servers.module.scss";

/**
 * Seite „Server-Freigaben“ unter Bot (W-0064, Entwurf 3c): offene Anfragen
 * (weiterer Server oder Wechsel), Freigegebene mit Signatur, laufende Wahlen.
 * Solange die Regel nicht läuft, steht oben der Knopf zum Start.
 */
export function FreigabenPage(): JSX.Element {
    useTitle("Server-Freigaben");

    const state = useApi<IFreigaben>("/api/servers/freigaben");
    const act = useAct();
    const [starting, setStarting] = useState(false);
    const [busy, setBusy] = useState<number | null>(null);
    const [confirm, setConfirm] = useState<{ readonly request: IRequestView; readonly action: "decline" | "revoke" } | null>(null);
    const data = state.data;

    useLive("servers", state.reload);

    if (state.error && !data) return <Failure message={state.error.message} onRetry={state.reload} />;
    if (!data) return <Loading label="Freigaben werden geladen" />;

    const oldest = data.open[0];
    const decide = async (request: IRequestView, action: "approve" | "decline" | "revoke", done: string): Promise<void> => {
        setBusy(request.id);
        await act(`/api/servers/requests/${request.id}/${action}`, done);
        setBusy(null);
        state.reload();
    };

    return (
        <section>
            <PageHeader title="Server-Freigaben" meta={data.started ? `Regel läuft seit ${stamp(data.started)}` : "Regel noch nicht gestartet"} />

            {!data.started && (
                <div className={styles.start}>
                    <p>
                        <b>Ein Server pro Person ist noch aus.</b> Beim Start bekommen {formatNumber(data.preview)} {data.preview === 1 ? "Person" : "Personen"} mit zwei oder mehr Servern die Wahl-DM und haben 24 Stunden Zeit. Danach geht der Bot von jedem zweiten
                        Server ohne Freigabe sofort wieder.
                    </p>
                    <Button variant="danger" icon="power" onClick={() => setStarting(true)}>
                        Regel starten
                    </Button>
                </div>
            )}

            <ConfirmDialog
                open={starting}
                title="Ein Server pro Person starten?"
                confirmLabel="Jetzt starten"
                tone="danger"
                onCancel={() => setStarting(false)}
                onConfirm={() => {
                    setStarting(false);
                    void act("/api/servers/start", "Regel gestartet, die Wahl-DMs sind unterwegs.").then(state.reload);
                }}
            >
                <p>
                    {formatNumber(data.preview)} {data.preview === 1 ? "Person bekommt" : "Personen bekommen"} jetzt eine DM und müssen sich in 24 Stunden für einen Server entscheiden. Das lässt sich nicht zurücknehmen.
                </p>
            </ConfirmDialog>

            <ConfirmDialog
                open={confirm !== null}
                title={confirm?.action === "revoke" ? `Freigabe ${confirm.request.signature ?? ""} zurücknehmen?` : `Anfrage von ${confirm?.request.person.name ?? ""} ablehnen?`}
                confirmLabel={confirm?.action === "revoke" ? "Zurücknehmen" : "Ablehnen"}
                tone="danger"
                onCancel={() => setConfirm(null)}
                onConfirm={() => {
                    if (!confirm) return;

                    setConfirm(null);
                    void decide(confirm.request, confirm.action, confirm.action === "revoke" ? "Freigabe zurückgenommen." : "Abgelehnt, die Person bekommt eine DM.");
                }}
            >
                {confirm && <p>{dropText(confirm.request)}</p>}
            </ConfirmDialog>

            <dl className={styles.kpis}>
                <div>
                    <dt>Offene Anfragen</dt>
                    <dd className={data.open.length ? styles.warn : undefined}>{data.open.length}</dd>
                    <small>{oldest ? `älteste ${since(oldest.createdAt)}` : "keine offen"}</small>
                </div>
                <div>
                    <dt>Freigegeben</dt>
                    <dd>{data.approved.length}</dd>
                    <small>mit Signatur</small>
                </div>
                <div>
                    <dt>Wahl läuft</dt>
                    <dd>{data.choices.length}</dd>
                    <small>Personen mit 2+ Servern</small>
                </div>
                <div>
                    <dt>Ausgenommen</dt>
                    <dd>Team</dd>
                    <small>Administrator, Developer, Partner</small>
                </div>
            </dl>

            <h2 className={styles.section}>Offene Anfragen</h2>
            {data.open.length === 0 ? (
                <p className={styles.empty}>Gerade wartet niemand auf eine Freigabe.</p>
            ) : (
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Person</th>
                            <th>Server</th>
                            <th>Hat schon</th>
                            <th>Grund</th>
                            <th aria-label="Aktionen" />
                        </tr>
                    </thead>
                    <tbody>
                        {data.open.map((request) => (
                            <tr key={request.id}>
                                <td>
                                    <PersonCell person={request.person} />
                                </td>
                                <td>
                                    <b>{request.guildName}</b> <Badge tone={request.kind === "switch" ? "info" : "warn"}>{request.kind === "switch" ? "Wechsel" : "Weiterer Server"}</Badge>
                                    <span className={styles.sub}>
                                        {request.members === null ? "" : `${formatNumber(request.members)} Mitglieder · `}wartet {since(request.createdAt)}
                                        {request.botThere ? " · Bot ist noch da" : ""}
                                    </span>
                                </td>
                                <td>
                                    {request.main ? (
                                        <>
                                            {request.main.name} <Badge tone="ok">Hauptserver</Badge>
                                        </>
                                    ) : (
                                        "–"
                                    )}
                                </td>
                                <td>{request.reason || "–"}</td>
                                <td>
                                    <div className={styles.actions}>
                                        <Button size="sm" variant="primary" busy={busy === request.id} onClick={() => void decide(request, "approve", request.kind === "switch" ? "Wechsel freigegeben." : "Freigegeben, die Person bekommt eine DM.")}>
                                            Freigeben
                                        </Button>
                                        <Button size="sm" variant="outline" disabled={busy === request.id} onClick={() => setConfirm({ request, action: "decline" })}>
                                            Ablehnen
                                        </Button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            <h2 className={styles.section}>Freigegeben</h2>
            {data.approved.length === 0 ? (
                <p className={styles.empty}>Noch keine Freigaben.</p>
            ) : (
                <table className={styles.table}>
                    <tbody>
                        {data.approved.map((request) => (
                            <tr key={request.id}>
                                <td>
                                    <PersonCell person={request.person} />
                                </td>
                                <td>
                                    <b>{request.guildName}</b>
                                    <span className={styles.sub}>{request.members === null ? "Bot nicht auf dem Server" : `${formatNumber(request.members)} Mitglieder`}</span>
                                </td>
                                <td>
                                    <Seal request={request} />
                                    {request.decided && (
                                        <span className={styles.sub}>
                                            von {request.decided.name} am {day(request.decided.at)}
                                            {request.reason ? ` · „${request.reason}“` : ""}
                                        </span>
                                    )}
                                </td>
                                <td>
                                    <div className={styles.actions}>
                                        <Button size="sm" variant="outline" busy={busy === request.id} onClick={() => setConfirm({ request, action: "revoke" })}>
                                            Zurücknehmen
                                        </Button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            <h2 className={styles.section}>Wahl läuft</h2>
            {data.choices.length === 0 ? (
                <p className={styles.empty}>Gerade wählt niemand.</p>
            ) : (
                <table className={styles.table}>
                    <tbody>
                        {data.choices.map((choice) => (
                            <tr key={choice.person.id}>
                                <td>
                                    <PersonCell person={choice.person} />
                                </td>
                                <td>{choice.servers.map((server) => server.name).join(", ")}</td>
                                <td>
                                    {choice.chosen ? (
                                        <>
                                            gewählt: <b>{choice.chosen}</b>
                                        </>
                                    ) : (
                                        `bis ${stamp(choice.deadline)}`
                                    )}
                                    {choice.dmError && (
                                        <span className={styles.sub}>
                                            <Badge tone="danger">DM nicht zustellbar</Badge>
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </section>
    );
}
