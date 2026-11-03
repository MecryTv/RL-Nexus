import { useState, type JSX } from "react";
import { useNavigate } from "react-router-dom";
import { SERVICE_LABELS, type ISuspectView } from "../../shared/security.ts";
import { useLive } from "../api/live";
import { useApi } from "../api/useApi";
import { Button } from "../components/Button";
import { PageHeader } from "../components/PageHeader";
import { Failure, Loading } from "../components/Status";
import { stamp, useAct } from "../servers/util.ts";
import { useTitle } from "../useTitle";
import { BanDialog } from "./BanDialog";
import { PersonLine } from "./parts";
import { ageText, suspectHint } from "./util.ts";
import kpi from "../servers/servers.module.scss";
import styles from "./security.module.scss";

/** Seite „Verdacht“: offene Fälle aus der Prüfung bei der Anmeldung (D3), sperren oder „Passt“. */
export function SuspectsPage(): JSX.Element {
    useTitle("Verdacht");

    const navigate = useNavigate();
    const act = useAct();
    const state = useApi<ISuspectView[]>("/api/security/suspects");
    const [banning, setBanning] = useState<ISuspectView | null>(null);
    const [busy, setBusy] = useState<number | null>(null);
    const data = state.data;

    useLive("security", state.reload);

    if (state.error && !data) return <Failure message={state.error.message} onRetry={state.reload} />;
    if (!data) return <Loading label="Verdachtsfälle werden geladen" />;

    return (
        <section>
            <PageHeader title="Verdacht" meta={data.length ? `${data.length} offen` : "nichts offen"} />

            {banning && (
                <BanDialog
                    mode={{ kind: "ban", userId: banning.person.id, reasons: ["Sperre umgangen"], ref: banning.banId }}
                    onClose={() => setBanning(null)}
                    onDone={(banId) => navigate(`/sicherheit/sperre/${banId}`)}
                />
            )}

            {data.length === 0 ? (
                <p className={kpi.empty}>Keine offenen Fälle. Neue tauchen hier auf, sobald sich jemand verdächtig anmeldet.</p>
            ) : (
                <table className={kpi.table}>
                    <thead>
                        <tr>
                            <th>Konto</th>
                            <th>Hinweis</th>
                            <th>Konto alt</th>
                            <th>Wann, wo</th>
                            <th aria-label="Aktionen" />
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((suspect) => (
                            <tr key={suspect.id}>
                                <td>
                                    <PersonLine person={suspect.person} to={`/datenschutz/${suspect.person.id}`} />
                                </td>
                                <td>{suspectHint(suspect)}</td>
                                <td className={suspect.accountDays < 30 ? styles.warnText : undefined}>{ageText(suspect.accountDays)}</td>
                                <td>
                                    {stamp(suspect.at)}
                                    <span className={kpi.sub}>{SERVICE_LABELS[suspect.service]}</span>
                                </td>
                                <td>
                                    <div className={kpi.actions}>
                                        <Button size="sm" variant="danger" disabled={busy === suspect.id} onClick={() => setBanning(suspect)}>
                                            Sperren
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            busy={busy === suspect.id}
                                            onClick={() => {
                                                setBusy(suspect.id);
                                                void act(`/api/security/suspects/${suspect.id}/ok`, "Fall geschlossen.").then(() => {
                                                    setBusy(null);
                                                    state.reload();
                                                });
                                            }}
                                        >
                                            Passt
                                        </Button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </section>
    );
}
