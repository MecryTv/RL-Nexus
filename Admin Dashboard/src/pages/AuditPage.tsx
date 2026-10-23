import type { JSX } from "react";
import { useSearchParams } from "react-router-dom";
import type { IAuditEntry, IAuditPage } from "../../shared/api";
import { AUDIT_LABELS } from "../../shared/limits";
import { useApi } from "../api/useApi";
import { Field } from "../components/Field";
import { PageHeader } from "../components/PageHeader";
import { Pager } from "../components/Pager";
import { Failure, Loading } from "../components/Status";
import { formatDateTime, formatNumber } from "../format";
import { useTitle } from "../useTitle";
import styles from "./dev.module.scss";

/** Bei Meldungen steht im Protokoll JSON. Das wird lesbar, alles andere bleibt, wie es ist. */
function detailOf(entry: IAuditEntry): string {
    if (entry.detail === null) return "–";
    if (entry.action !== "notification.send") return entry.detail;

    try {
        const value = JSON.parse(entry.detail) as { title?: unknown; count?: unknown };

        return `„${String(value.title ?? "")}“${typeof value.count === "number" ? `, ${value.count} Empfänger` : ""}`;
    } catch {
        return entry.detail;
    }
}

export function AuditPage(): JSX.Element {
    useTitle("Protokoll");

    const [params, setParams] = useSearchParams();
    const page = Math.max(1, Math.floor(Number(params.get("seite"))) || 1);
    const action = params.get("aktion") ?? "";
    const user = params.get("person") ?? "";
    const query = new URLSearchParams({ page: String(page), ...(action ? { action } : {}), ...(user ? { user } : {}) });
    const { data, error, reload } = useApi<IAuditPage>(`/api/audit?${query}`);
    const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

    function filter(change: { readonly aktion?: string; readonly person?: string; readonly seite?: number }): void {
        const next = { aktion: change.aktion ?? action, person: change.person ?? user, seite: change.seite ?? 1 };
        const values: Record<string, string> = {};

        if (next.aktion) values.aktion = next.aktion;
        if (next.person) values.person = next.person;
        if (next.seite > 1) values.seite = String(next.seite);

        setParams(values);
    }

    return (
        <>
            <PageHeader title="Protokoll" meta={data ? `${formatNumber(data.total)} Einträge. Einträge verschwinden nach 365 Tagen.` : undefined} />

            {data && (
                <div className={styles.filters}>
                    <Field id="protokoll-aktion" label="Aktion">
                        <select id="protokoll-aktion" value={action} onChange={(event) => filter({ aktion: event.target.value })}>
                            <option value="">Alle Aktionen</option>
                            {data.actions.map((entry) => (
                                <option key={entry} value={entry}>
                                    {AUDIT_LABELS[entry] ?? entry}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field id="protokoll-person" label="Person">
                        <select id="protokoll-person" value={user} onChange={(event) => filter({ person: event.target.value })}>
                            <option value="">Alle Personen</option>
                            {data.users.map((entry) => (
                                <option key={entry.id} value={entry.id}>
                                    {entry.name}
                                </option>
                            ))}
                        </select>
                    </Field>
                </div>
            )}

            {error && !data ? (
                <Failure message={error.message} onRetry={reload} />
            ) : !data ? (
                <Loading label="Protokoll wird geladen" />
            ) : data.entries.length === 0 ? (
                <p className={styles.empty}>Keine Einträge{action || user ? " für diesen Filter" : ""}.</p>
            ) : (
                <div className={styles.frame}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th scope="col">Wann</th>
                                <th scope="col">Wer</th>
                                <th scope="col">Aktion</th>
                                <th scope="col">Ziel</th>
                                <th scope="col">Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.entries.map((entry) => (
                                <tr key={entry.id}>
                                    <td className={styles.nowrap}>{formatDateTime(entry.createdAt)}</td>
                                    <td>{entry.userName}</td>
                                    <td>{AUDIT_LABELS[entry.action] ?? entry.action}</td>
                                    <td>{entry.target ?? "–"}</td>
                                    <td className={styles.detail}>{detailOf(entry)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <Pager page={page} pages={pages} onPage={(next) => filter({ seite: next })} />
        </>
    );
}
