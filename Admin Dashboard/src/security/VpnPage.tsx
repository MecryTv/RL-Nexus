import { useState, type JSX } from "react";
import { SERVICE_LABELS, type IVpnLoginView, type IVpnView } from "../../shared/security.ts";
import { api } from "../api/client";
import { useLive } from "../api/live";
import { useApi } from "../api/useApi";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Field } from "../components/Field";
import { PageHeader } from "../components/PageHeader";
import { Segmented } from "../components/Segmented";
import { Failure, Loading } from "../components/Status";
import { formatNumber } from "../format";
import { stamp } from "../servers/util.ts";
import { useTitle } from "../useTitle";
import { PersonLine } from "./parts";
import { RESULT_LABELS, RESULT_TONE } from "./util.ts";
import kpi from "../servers/servers.module.scss";
import styles from "./security.module.scss";

type Filter = "alle" | IVpnLoginView["result"];

const FILTERS: readonly { readonly value: Filter; readonly label: string }[] = [
    { value: "alle", label: "Alle" },
    { value: "in", label: "Rein" },
    { value: "marked", label: "Markiert" },
    { value: "blocked", label: "Blockiert" },
    { value: "unchecked", label: "Ohne Prüfung" },
    { value: "banned", label: "Gesperrt" },
];

interface ITestResult {
    readonly vpn: boolean;
    readonly type: string | null;
    readonly asn: string | null;
    readonly provider: string | null;
    readonly ms: number;
}

/** Testabfrage für eine eingetippte IP. Das Ergebnis steht nur hier, gespeichert wird nichts. */
function TestQuery({ keySet }: { readonly keySet: boolean }): JSX.Element {
    const [ip, setIp] = useState("");
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<ITestResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const run = async (): Promise<void> => {
        setBusy(true);
        setError(null);

        try {
            setResult(await api<ITestResult>("/api/security/vpn/test", { method: "POST", body: { ip: ip.trim() } }));
        } catch (reason) {
            setResult(null);
            setError(reason instanceof Error ? reason.message : String(reason));
        }

        setBusy(false);
    };

    return (
        <form
            className={styles.test}
            onSubmit={(event) => {
                event.preventDefault();
                void run();
            }}
        >
            <Field id="vpn-test" label="Testabfrage" hint="Das Ergebnis wird angezeigt, aber nicht gespeichert." error={error ?? undefined}>
                <div className={styles.linkRow}>
                    <input id="vpn-test" value={ip} inputMode="decimal" autoComplete="off" placeholder="203.0.113.7" onChange={(event) => setIp(event.target.value)} disabled={!keySet} />
                    <Button type="submit" variant="outline" busy={busy} disabled={!keySet || !ip.trim()}>
                        Prüfen
                    </Button>
                </div>
            </Field>
            {result && (
                <p className={styles.testResult} aria-live="polite">
                    <Badge tone={result.vpn ? "warn" : "ok"}>{result.vpn ? (result.type ?? "VPN") : "kein VPN"}</Badge> {[result.provider, result.asn].filter(Boolean).join(" · ")} · {formatNumber(result.ms)} ms
                </p>
            )}
        </form>
    );
}

/** Seite „VPN-Prüfung“: Zustand von Proxycheck, Prüfungen der letzten 30 Tage und eine Testabfrage. */
export function VpnPage(): JSX.Element {
    useTitle("VPN-Prüfung");

    const state = useApi<IVpnView>("/api/security/vpn");
    const [filter, setFilter] = useState<Filter>("alle");
    const data = state.data;

    useLive("security", state.reload);

    if (state.error && !data) return <Failure message={state.error.message} onRetry={state.reload} />;
    if (!data) return <Loading label="Prüfungen werden geladen" />;

    const logins = filter === "alle" ? data.logins : data.logins.filter((login) => login.result === filter);

    return (
        <section>
            <PageHeader title="VPN-Prüfung" />

            <dl className={kpi.kpis}>
                <div>
                    <dt>Proxycheck-Key</dt>
                    <dd className={data.keySet ? undefined : kpi.warn}>{data.keySet ? "gesetzt" : "fehlt"}</dd>
                    <small>{data.keySet ? "in der .env des Servers" : "ohne Key kommt jeder herein, nur protokolliert"}</small>
                </div>
                <div>
                    <dt>Zuletzt geantwortet</dt>
                    <dd>{data.lastAnswer ? stamp(data.lastAnswer) : "noch nie"}</dd>
                    <small>bei einer Anmeldung</small>
                </div>
                <div>
                    <dt>Prüfungen</dt>
                    <dd>{formatNumber(data.logins.length)}</dd>
                    <small>letzte 30 Tage</small>
                </div>
            </dl>

            <TestQuery keySet={data.keySet} />

            <div className={styles.toolbar}>
                <Segmented name="ergebnis" legend="Ergebnis" options={FILTERS} value={filter} onChange={setFilter} />
            </div>

            {logins.length === 0 ? (
                <p className={kpi.empty}>Keine Anmeldungen mit diesem Ergebnis.</p>
            ) : (
                <table className={kpi.table}>
                    <thead>
                        <tr>
                            <th>Zeit</th>
                            <th>Konto</th>
                            <th>Wo</th>
                            <th>Ergebnis</th>
                            <th>Grund</th>
                        </tr>
                    </thead>
                    <tbody>
                        {logins.map((login, index) => (
                            <tr key={`${login.at}-${index}`}>
                                <td>{stamp(login.at)}</td>
                                <td>
                                    <PersonLine person={login.person} to={`/datenschutz/${login.person.id}`} />
                                </td>
                                <td>{SERVICE_LABELS[login.service]}</td>
                                <td>
                                    <Badge tone={RESULT_TONE[login.result]}>{RESULT_LABELS[login.result]}</Badge>
                                </td>
                                <td>{login.reason ?? "–"}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </section>
    );
}
