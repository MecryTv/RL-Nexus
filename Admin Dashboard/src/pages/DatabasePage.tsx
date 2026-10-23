import { type JSX, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { IDbRows, IDbTable } from "../../shared/api";
import { useApi } from "../api/useApi";
import { Badge } from "../components/Badge";
import { Button, LinkButton } from "../components/Button";
import { Field } from "../components/Field";
import { Icon } from "../components/Icon";
import { PageHeader } from "../components/PageHeader";
import { Pager } from "../components/Pager";
import { Failure, Loading } from "../components/Status";
import { formatBytes, formatNumber } from "../format";
import { useTitle } from "../useTitle";
import styles from "./DatabasePage.module.scss";

/** Was in der Zelle steht, gekürzt. Das Ganze zeigt der Titel und die Seitenspalte. */
const CELL_MAX = 160;

/**
 * Die Datenbank ansehen.
 *
 * Ohne Tabelle in der Adresse die Liste aller Tabellen, mit Tabelle ihr Inhalt.
 * Gelesen wird nur: Es gibt kein Formular, das schreibt, und kein Feld für
 * eigenes SQL. Wer das braucht, nimmt phpMyAdmin.
 */
export function DatabasePage(): JSX.Element {
    const { table } = useParams();

    return table === undefined ? <TableList /> : <TableRows table={table} />;
}

function TableList(): JSX.Element {
    useTitle("Datenbank");

    const { data, error, reload } = useApi<{ tables: readonly IDbTable[] }>("/api/db/tables");
    const total = data?.tables.reduce((sum, entry) => sum + (entry.bytes ?? 0), 0) ?? 0;

    return (
        <>
            <PageHeader
                title="Datenbank"
                meta={data ? `${data.tables.length} Tabellen, zusammen ${formatBytes(total)}. Nur ansehen, nichts lässt sich hier ändern.` : undefined}
            />

            {error && !data ? (
                <Failure message={error.message} onRetry={reload} />
            ) : !data ? (
                <Loading label="Tabellen werden geladen" />
            ) : (
                <div className={styles.frame}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th scope="col">Tabelle</th>
                                <th scope="col" className={styles.right}>
                                    Zeilen
                                </th>
                                <th scope="col" className={styles.right}>
                                    Größe
                                </th>
                                <th scope="col">Wofür</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.tables.map((entry) => (
                                <tr key={entry.name}>
                                    <td>
                                        <Link className={styles.link} to={`/dev/datenbank/${entry.name}`}>
                                            <code>{entry.name}</code>
                                        </Link>
                                    </td>
                                    {/* Bei InnoDB schätzt MariaDB die Zeilen. Genau wird sie erst beim Öffnen gezählt. */}
                                    <td className={styles.right}>{entry.rows === null ? "–" : `≈ ${formatNumber(entry.rows)}`}</td>
                                    <td className={styles.right}>{entry.bytes === null ? "–" : formatBytes(entry.bytes)}</td>
                                    <td className={styles.comment}>{entry.comment || "–"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </>
    );
}

function TableRows({ table }: { readonly table: string }): JSX.Element {
    useTitle(table);

    const [params, setParams] = useSearchParams();
    const page = Math.max(1, Math.floor(Number(params.get("seite"))) || 1);
    const search = params.get("suche") ?? "";
    const sort = params.get("sortierung") ?? "";
    const dir = params.get("richtung") === "desc" ? "desc" : "asc";

    // Was im Feld steht, bevor es abgeschickt ist: Jeder Tastendruck eine
    // Abfrage wäre bei einer Tabelle mit vielen Zeilen zu viel.
    const [draft, setDraft] = useState(search);
    const [open, setOpen] = useState<{ readonly column: string; readonly value: string } | null>(null);

    const query = new URLSearchParams({
        page: String(page),
        ...(search ? { q: search } : {}),
        ...(sort ? { sort, dir } : {}),
    });

    const { data, error, reload } = useApi<IDbRows>(`/api/db/tables/${encodeURIComponent(table)}?${query}`);

    function go(change: { readonly suche?: string; readonly sortierung?: string; readonly richtung?: string; readonly seite?: number }): void {
        const next = {
            suche: change.suche ?? search,
            sortierung: change.sortierung ?? sort,
            richtung: change.richtung ?? dir,
            seite: change.seite ?? 1,
        };
        const values: Record<string, string> = {};

        if (next.suche) values.suche = next.suche;
        if (next.sortierung) values.sortierung = next.sortierung;
        if (next.sortierung && next.richtung === "desc") values.richtung = "desc";
        if (next.seite > 1) values.seite = String(next.seite);

        setParams(values);
    }

    /** Dieselbe Spalte noch einmal dreht die Richtung um. */
    function sortBy(column: string): void {
        go({ sortierung: column, richtung: sort === column && dir === "asc" ? "desc" : "asc" });
    }

    const shown = data?.columns.filter((column) => !column.masked) ?? [];
    const download = `/api/db/tables/${encodeURIComponent(table)}/download?${new URLSearchParams({ ...(search ? { q: search } : {}), ...(sort ? { sort, dir } : {}) })}`;

    return (
        <>
            <Link className={styles.back} to="/dev/datenbank">
                <Icon name="arrow-left" size={15} />
                Alle Tabellen
            </Link>

            <PageHeader
                title={table}
                meta={data ? `${formatNumber(data.total)} Zeilen${search ? " für diese Suche" : ""}, ${data.columns.length} Spalten.` : undefined}
            />

            <div className={styles.toolbar}>
                <form
                    className={styles.searchForm}
                    onSubmit={(event) => {
                        event.preventDefault();
                        go({ suche: draft.trim() });
                    }}
                >
                    <Field id="db-suche" label="Suchen">
                        <input
                            id="db-suche"
                            type="search"
                            value={draft}
                            onChange={(event) => setDraft(event.target.value)}
                            placeholder="In allen Spalten"
                            maxLength={100}
                        />
                    </Field>
                    <Button type="submit" size="sm" icon="search">
                        Suchen
                    </Button>
                    {search !== "" && (
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            icon="close"
                            onClick={() => {
                                setDraft("");
                                go({ suche: "" });
                            }}
                        >
                            Zurücksetzen
                        </Button>
                    )}
                </form>

                {data && data.total > 0 && (
                    <LinkButton href={download} size="sm" variant="outline" icon="download">
                        Als CSV
                    </LinkButton>
                )}
            </div>

            {error && !data ? (
                <Failure message={error.message} onRetry={reload} />
            ) : !data ? (
                <Loading label="Zeilen werden geladen" />
            ) : (
                <>
                    {data.columns.some((column) => column.masked) && (
                        <p className={styles.note}>
                            <Icon name="shield-check" size={15} />
                            Verborgen, weil der Name nach einem Geheimnis aussieht:{" "}
                            {data.columns
                                .filter((column) => column.masked)
                                .map((column) => column.name)
                                .join(", ")}
                        </p>
                    )}

                    {data.rows.length === 0 ? (
                        <p className={styles.empty}>{search ? `Keine Zeile enthält „${search}“.` : "Diese Tabelle ist leer."}</p>
                    ) : (
                        <div className={styles.frame}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        {shown.map((column) => (
                                            <th key={column.name} scope="col" aria-sort={sort === column.name ? (dir === "asc" ? "ascending" : "descending") : "none"}>
                                                <button type="button" className={styles.sort} onClick={() => sortBy(column.name)} title={`${column.type}${column.comment ? ` · ${column.comment}` : ""}`}>
                                                    {column.name}
                                                    {column.key === "PRI" && <Badge tone="info">Schlüssel</Badge>}
                                                    <Icon name={sort === column.name ? (dir === "asc" ? "chevron-up" : "chevron-down") : "chevron-up-down"} size={14} className={sort === column.name ? undefined : styles.faint} />
                                                </button>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.rows.map((row, index) => (
                                        // Eine Zeile hat nicht zwingend einen Schlüssel, den wir kennen:
                                        // die Stelle auf der Seite ist hier der einzige verlässliche.
                                        <tr key={index}>
                                            {shown.map((column) => {
                                                const value = row[column.name] ?? null;
                                                const long = value !== null && value.length > CELL_MAX;

                                                return (
                                                    <td key={column.name}>
                                                        {value === null ? (
                                                            <span className={styles.null}>NULL</span>
                                                        ) : long ? (
                                                            <button type="button" className={styles.more} onClick={() => setOpen({ column: column.name, value })}>
                                                                {value.slice(0, CELL_MAX)}…
                                                            </button>
                                                        ) : (
                                                            value
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <Pager page={data.page} pages={data.pages} onPage={(next) => go({ seite: next })} />
                </>
            )}

            {open !== null && (
                <div className={styles.full}>
                    <div className={styles.fullHead}>
                        <h2>{open.column}</h2>
                        <Button size="sm" variant="ghost" icon="close" onClick={() => setOpen(null)}>
                            Schließen
                        </Button>
                    </div>
                    <pre className={styles.fullText}>{open.value}</pre>
                </div>
            )}
        </>
    );
}
