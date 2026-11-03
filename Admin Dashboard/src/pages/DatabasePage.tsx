import { type JSX, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { IDbOverview, IDbRows, IDbTableDetail, IDbTableInfo } from "../../shared/api";
import { useApi } from "../api/useApi";
import { Badge } from "../components/Badge";
import { Button, LinkButton } from "../components/Button";
import { Field } from "../components/Field";
import { Icon } from "../components/Icon";
import { JsonView } from "../components/JsonView";
import { PageHeader } from "../components/PageHeader";
import { Pager } from "../components/Pager";
import { Segmented } from "../components/Segmented";
import { Failure, Loading } from "../components/Status";
import { formatBytes, formatDateTime, formatDuration, formatNumber } from "../format";
import { useTitle } from "../useTitle";
import { DbTabs, Kpis, SizeBar } from "./dbParts";
import { LIVE_EVERY, useCopy } from "./dbUtil.ts";
import styles from "./DatabasePage.module.scss";

/** Was in der Zelle steht, gekürzt. Das Ganze zeigt der Titel und die Seitenspalte. */
const CELL_MAX = 160;

type Sort = "groesse" | "name" | "zeilen";
type View = "zeilen" | "spalten" | "indizes" | "sql";

const VIEWS: readonly { readonly value: View; readonly label: string }[] = [
    { value: "zeilen", label: "Zeilen" },
    { value: "spalten", label: "Spalten" },
    { value: "indizes", label: "Indizes" },
    { value: "sql", label: "SQL" },
];

const size = (table: IDbTableInfo): number => (table.dataBytes ?? 0) + (table.indexBytes ?? 0);

/**
 * Dev → Datenbank, Reiter MariaDB (W-0066, Entwurf D-A++). Ohne Tabelle in der
 * Adresse die Übersicht, mit Tabelle ihr Inhalt. Gelesen wird nur: Es gibt kein
 * Formular, das schreibt, und kein Feld für eigenes SQL. Wer das braucht,
 * nimmt phpMyAdmin.
 */
export function DatabasePage(): JSX.Element {
    const { table } = useParams();

    // key: Eine andere Tabelle fängt mit leerer Auswahl und leerem Suchfeld an.
    return table === undefined ? <TableList /> : <TableRows key={table} table={table} />;
}

function Origin({ origin }: { readonly origin: IDbTableInfo["origin"] }): JSX.Element {
    return <Badge tone={origin === "admin" ? "danger" : "info"}>{origin === "admin" ? "Admin" : "Bot"}</Badge>;
}

function TableList(): JSX.Element {
    useTitle("Datenbank");

    const { data, error, reload, updatedAt } = useApi<IDbOverview>("/api/db/overview", LIVE_EVERY);
    const [search, setSearch] = useState("");
    const [sort, setSort] = useState<Sort>("groesse");

    const tables = data?.tables ?? [];
    const dataBytes = tables.reduce((sum, table) => sum + (table.dataBytes ?? 0), 0);
    const indexBytes = tables.reduce((sum, table) => sum + (table.indexBytes ?? 0), 0);
    const biggest = Math.max(1, ...tables.map(size));
    const shown = tables
        .filter((table) => table.name.includes(search.trim().toLowerCase()) || (table.area ?? "").toLowerCase().includes(search.trim().toLowerCase()))
        .sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : sort === "zeilen" ? (b.rows ?? 0) - (a.rows ?? 0) : size(b) - size(a)));
    const server = data?.server;

    return (
        <>
            <PageHeader title="Datenbank" />
            <DbTabs tables={data?.tables.length} updatedAt={updatedAt} />

            {error && !data ? (
                <Failure message={error.message} onRetry={reload} />
            ) : !data || !server ? (
                <Loading label="Tabellen werden geladen" />
            ) : (
                <>
                    <Kpis
                        items={[
                            { label: "Verbindung", value: `online · ${server.ping ?? "–"} ms`, tone: "ok", sub: server.host ?? undefined },
                            { label: "Version", value: `MariaDB ${server.version ?? "?"}`, sub: server.uptime === null ? undefined : `läuft seit ${formatDuration(server.uptime)}` },
                            { label: "Datenbank", value: server.database ?? "–", sub: server.collation ?? undefined },
                            { label: "Größe", value: formatBytes(dataBytes + indexBytes), sub: `Daten ${formatBytes(dataBytes)} · Index ${formatBytes(indexBytes)}` },
                            { label: "Zeilen", value: `≈ ${formatNumber(tables.reduce((sum, table) => sum + (table.rows ?? 0), 0))}`, sub: "InnoDB schätzt" },
                            {
                                label: "Verbindungen",
                                value: `${server.connections ?? "–"} / ${server.maxConnections ?? "–"}`,
                                sub: "offen / höchstens",
                                tone: server.connections !== null && server.maxConnections !== null && server.connections > server.maxConnections * 0.8 ? "warn" : undefined,
                            },
                        ]}
                    />

                    <div className={styles.toolbar}>
                        <Field id="db-tabellen" label="Tabelle suchen">
                            <input id="db-tabellen" type="search" value={search} placeholder="Name oder Datenschutz-Bereich" onChange={(event) => setSearch(event.target.value)} />
                        </Field>
                        <p className={styles.faintText}>
                            Migrationen: Bot {formatNumber(server.migrations.bot)} · Admin {formatNumber(server.migrations.admin)}
                        </p>
                    </div>

                    <div className={styles.frame}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th scope="col" aria-sort={sort === "name" ? "ascending" : "none"}>
                                        <button type="button" className={styles.sort} onClick={() => setSort("name")}>
                                            Tabelle
                                        </button>
                                    </th>
                                    <th scope="col">Herkunft</th>
                                    <th scope="col">Datenschutz</th>
                                    <th scope="col" className={styles.right} aria-sort={sort === "zeilen" ? "descending" : "none"}>
                                        <button type="button" className={styles.sort} onClick={() => setSort("zeilen")}>
                                            Zeilen ≈
                                        </button>
                                    </th>
                                    <th scope="col" className={styles.right} aria-sort={sort === "groesse" ? "descending" : "none"}>
                                        <button type="button" className={styles.sort} onClick={() => setSort("groesse")}>
                                            Größe
                                        </button>
                                    </th>
                                    <th scope="col" className={styles.right}>
                                        Daten · Index
                                    </th>
                                    <th scope="col" className={styles.right}>
                                        Auto-Inc
                                    </th>
                                    <th scope="col">Zuletzt geändert</th>
                                </tr>
                            </thead>
                            <tbody>
                                {shown.map((table) => (
                                    <tr key={table.name}>
                                        <td>
                                            <Link className={styles.link} to={`/dev/datenbank/${table.name}`} title={table.comment || undefined}>
                                                <code>{table.name}</code>
                                            </Link>
                                        </td>
                                        <td>
                                            <Origin origin={table.origin} />
                                        </td>
                                        <td className={table.area ? undefined : styles.faintText}>{table.area ?? "ohne Bereich"}</td>
                                        <td className={styles.right}>{table.rows === null ? "–" : formatNumber(table.rows)}</td>
                                        <td className={styles.right}>
                                            <span className={styles.sizeCell}>
                                                {formatBytes(size(table))}
                                                <SizeBar share={size(table) / biggest} />
                                            </span>
                                        </td>
                                        <td className={styles.right}>
                                            {formatBytes(table.dataBytes ?? 0)} · {formatBytes(table.indexBytes ?? 0)}
                                        </td>
                                        <td className={styles.right}>{table.autoIncrement === null ? "–" : formatNumber(table.autoIncrement)}</td>
                                        <td>{table.updatedAt ? formatDateTime(table.updatedAt) : "–"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {shown.length === 0 && <p className={styles.empty}>Keine Tabelle passt zu „{search}“.</p>}
                </>
            )}
        </>
    );
}

function TableRows({ table }: { readonly table: string }): JSX.Element {
    useTitle(table);

    const copy = useCopy();
    const [params, setParams] = useSearchParams();
    const page = Math.max(1, Math.floor(Number(params.get("seite"))) || 1);
    const search = params.get("suche") ?? "";
    const sort = params.get("sortierung") ?? "";
    const dir = params.get("richtung") === "desc" ? "desc" : "asc";
    const view = (VIEWS.find((entry) => entry.value === params.get("ansicht"))?.value ?? "zeilen") as View;

    // Was im Feld steht, bevor es abgeschickt ist: Jeder Tastendruck eine
    // Abfrage wäre bei einer Tabelle mit vielen Zeilen zu viel.
    const [draft, setDraft] = useState(search);
    const [open, setOpen] = useState<{ readonly column: string; readonly value: string } | null>(null);
    const [picked, setPicked] = useState<number | null>(null);
    const [pickedFor, setPickedFor] = useState(params.toString());

    // Zurück und Vor im Browser ändern die Adresse ohne go(): dann gilt die Auswahl der alten Seite nicht mehr.
    if (pickedFor !== params.toString()) {
        setPickedFor(params.toString());
        setPicked(null);
    }

    const query = new URLSearchParams({
        page: String(page),
        ...(search ? { q: search } : {}),
        ...(sort ? { sort, dir } : {}),
    });

    const info = useApi<IDbTableDetail>(`/api/db/tables/${encodeURIComponent(table)}/info`);
    const { data, error, reload } = useApi<IDbRows>(`/api/db/tables/${encodeURIComponent(table)}?${query}`);
    const detail = info.data;

    function go(change: { readonly suche?: string; readonly sortierung?: string; readonly richtung?: string; readonly seite?: number; readonly ansicht?: View }): void {
        const next = {
            suche: change.suche ?? search,
            sortierung: change.sortierung ?? sort,
            richtung: change.richtung ?? dir,
            seite: change.seite ?? 1,
            ansicht: change.ansicht ?? view,
        };
        const values: Record<string, string> = {};

        if (next.suche) values.suche = next.suche;
        if (next.sortierung) values.sortierung = next.sortierung;
        if (next.sortierung && next.richtung === "desc") values.richtung = "desc";
        if (next.seite > 1) values.seite = String(next.seite);
        if (next.ansicht !== "zeilen") values.ansicht = next.ansicht;

        setPicked(null);
        setParams(values);
    }

    /** Dieselbe Spalte noch einmal dreht die Richtung um. */
    function sortBy(column: string): void {
        go({ sortierung: column, richtung: sort === column && dir === "asc" ? "desc" : "asc" });
    }

    const shown = data?.columns.filter((column) => !column.masked) ?? [];
    const download = `/api/db/tables/${encodeURIComponent(table)}/download?${new URLSearchParams({ ...(search ? { q: search } : {}), ...(sort ? { sort, dir } : {}) })}`;
    const row = picked === null ? null : (data?.rows[picked] ?? null);
    const bytes = detail ? (detail.table.dataBytes ?? 0) + (detail.table.indexBytes ?? 0) : 0;

    return (
        <>
            <Link className={styles.back} to="/dev/datenbank">
                <Icon name="arrow-left" size={15} />
                Alle Tabellen
            </Link>

            <PageHeader title={table} meta={data ? `${formatNumber(data.total)} Zeilen${search ? " für diese Suche" : ""}, ${data.columns.length} Spalten.` : undefined} />

            {detail && (
                <ul className={styles.chips} aria-label="Über die Tabelle">
                    <li>
                        <Origin origin={detail.table.origin} />
                    </li>
                    <li>Datenschutz: {detail.table.area ?? "ohne Bereich"}</li>
                    {detail.table.engine && <li>{detail.table.engine}</li>}
                    {detail.table.collation && <li>{detail.table.collation}</li>}
                    <li>{formatNumber(detail.exactRows)} Zeilen (gezählt)</li>
                    <li>
                        {formatBytes(bytes)}
                        {detail.exactRows > 0 && ` · ≈ ${formatBytes(Math.round(bytes / detail.exactRows))} je Zeile`}
                    </li>
                    {detail.table.autoIncrement !== null && <li>Auto-Inc {formatNumber(detail.table.autoIncrement)}</li>}
                    {detail.table.createdAt && <li>angelegt {formatDateTime(detail.table.createdAt)}</li>}
                </ul>
            )}

            <div className={styles.toolbar}>
                <Segmented name="ansicht" legend="Ansicht" options={VIEWS} value={view} onChange={(next) => go({ ansicht: next })} />

                {view === "zeilen" && (
                    <form
                        className={styles.searchForm}
                        onSubmit={(event) => {
                            event.preventDefault();
                            go({ suche: draft.trim() });
                        }}
                    >
                        <Field id="db-suche" label="Suchen">
                            <input id="db-suche" type="search" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="In allen Spalten" maxLength={100} />
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
                )}

                {view === "zeilen" && data && data.total > 0 && (
                    <div className={styles.actions}>
                        <Button size="sm" variant="outline" icon="copy" onClick={() => copy(JSON.stringify(data.rows, null, 2), "Seite als JSON kopiert.")}>
                            Seite als JSON
                        </Button>
                        <LinkButton href={download} size="sm" variant="outline" icon="download">
                            Als CSV
                        </LinkButton>
                    </div>
                )}
            </div>

            {view === "spalten" && detail && (
                <div className={styles.frame}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th scope="col">Spalte</th>
                                <th scope="col">Typ</th>
                                <th scope="col">Null</th>
                                <th scope="col">Schlüssel</th>
                                <th scope="col">Standard</th>
                                <th scope="col">Extra</th>
                                <th scope="col">Kommentar</th>
                            </tr>
                        </thead>
                        <tbody>
                            {detail.columns.map((column) => (
                                <tr key={column.name}>
                                    <td>
                                        <code>{column.name}</code> {column.masked && <Badge tone="warn">verborgen</Badge>}
                                    </td>
                                    <td>
                                        <code>{column.type}</code>
                                    </td>
                                    <td>{column.nullable ? "ja" : "nein"}</td>
                                    <td>{column.key === "PRI" ? <Badge tone="warn">PRIMÄR</Badge> : column.key === "UNI" ? "EINDEUTIG" : column.key === "MUL" ? "INDEX" : "–"}</td>
                                    <td>{column.default === null ? <span className={styles.null}>–</span> : <code>{column.default}</code>}</td>
                                    <td>{column.extra || "–"}</td>
                                    <td className={styles.comment}>{column.comment || "–"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {view === "indizes" && detail && (
                <div className={styles.frame}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th scope="col">Index</th>
                                <th scope="col">Spalten</th>
                                <th scope="col">Eindeutig</th>
                                <th scope="col">Art</th>
                            </tr>
                        </thead>
                        <tbody>
                            {detail.indexes.map((index) => (
                                <tr key={index.name}>
                                    <td>
                                        <code>{index.name}</code>
                                    </td>
                                    <td>
                                        <code>{index.columns.join(", ")}</code>
                                    </td>
                                    <td>{index.unique ? "ja" : "nein"}</td>
                                    <td>{index.type}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {view === "sql" && detail && (
                <div className={styles.panel}>
                    <div className={styles.panelHead}>
                        <h2>SHOW CREATE TABLE</h2>
                        <Button size="sm" variant="ghost" icon="copy" onClick={() => copy(detail.createSql, "SQL kopiert.")}>
                            Kopieren
                        </Button>
                    </div>
                    <pre className={styles.fullText}>{detail.createSql}</pre>
                </div>
            )}

            {view !== "zeilen" && !detail && (info.error ? <Failure message={info.error.message} onRetry={info.reload} /> : <Loading label="Tabelle wird gelesen" />)}

            {view === "zeilen" &&
                (error && !data ? (
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
                            <div className={row ? styles.split : undefined}>
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
                                            {data.rows.map((entry, index) => (
                                                // Eine Zeile hat nicht zwingend einen Schlüssel, den wir kennen:
                                                // die Stelle auf der Seite ist hier der einzige verlässliche.
                                                <tr
                                                    key={index}
                                                    className={picked === index ? styles.picked : styles.pickable}
                                                    tabIndex={0}
                                                    aria-selected={picked === index}
                                                    onClick={() => setPicked(picked === index ? null : index)}
                                                    onKeyDown={(event) => {
                                                        // Enter auf dem Knopf einer langen Zelle öffnet die Zelle, nicht die Zeile.
                                                        if (event.target !== event.currentTarget) return;
                                                        if (event.key === "Enter" || event.key === " ") {
                                                            event.preventDefault();
                                                            setPicked(picked === index ? null : index);
                                                        }
                                                    }}
                                                >
                                                    {shown.map((column) => {
                                                        const value = entry[column.name] ?? null;
                                                        const long = value !== null && value.length > CELL_MAX;

                                                        return (
                                                            <td key={column.name}>
                                                                {value === null ? (
                                                                    <span className={styles.null}>NULL</span>
                                                                ) : long ? (
                                                                    <button
                                                                        type="button"
                                                                        className={styles.more}
                                                                        onClick={(event) => {
                                                                            event.stopPropagation();
                                                                            setOpen({ column: column.name, value });
                                                                        }}
                                                                    >
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

                                {row && (
                                    <div className={styles.panel}>
                                        <div className={styles.panelHead}>
                                            <h2>Zeile {((data.page - 1) * data.pageSize + (picked ?? 0) + 1).toLocaleString("de-DE")}</h2>
                                            <Button size="sm" variant="ghost" icon="copy" onClick={() => copy(JSON.stringify(row, null, 2), "Zeile als JSON kopiert.")}>
                                                Kopieren
                                            </Button>
                                        </div>
                                        <JsonView value={row} />
                                    </div>
                                )}
                            </div>
                        )}

                        <Pager page={data.page} pages={data.pages} onPage={(next) => go({ seite: next })} />
                    </>
                ))}

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
