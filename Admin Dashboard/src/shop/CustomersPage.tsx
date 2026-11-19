import { useEffect, useState, type JSX } from "react";
import { useQueryParam } from "../nav/useQueryParam.ts";
import { SEARCH_DEBOUNCE_MS } from "../../shared/search";
import { CUSTOMER_FILTERS, CUSTOMER_SEARCH_MAX, formatPrice, type CustomerFilter, type ICustomerList, type IShopProductList } from "../../shared/shop";
import { useLive } from "../api/live";
import { useApi } from "../api/useApi";
import { Badge } from "../components/Badge";
import { Field } from "../components/Field";
import { Metric } from "../components/Metric";
import { PageHeader } from "../components/PageHeader";
import { SidePanel } from "../components/SidePanel";
import { Failure, Loading } from "../components/Status";
import { Pager } from "../components/Pager";
import { useTitle } from "../useTitle";
import { STATUS, shortId, untilText } from "./customer";
import { CustomerPanel } from "./CustomerPanel";
import styles from "./shop.module.scss";

const FILTER_LABELS: Readonly<Record<CustomerFilter, string>> = {
    all: "Alle",
    trial: "Test",
    subscription: "Abo",
    one_time: "Einmal",
    gift: "Geschenkt",
    expired: "Abgelaufen",
    banned: "Gesperrt",
};

const MONTH = new Intl.DateTimeFormat("de-DE", { month: "long" });

/**
 * Shop → Kunden (Entwurf A): oben vier Zahlen, darunter Filter und Suche, dann
 * die Tabelle in Seiten zu 50. Ein Klick auf eine Zeile öffnet rechts alles zu
 * der Person, mit den Aktionen.
 */
export function CustomersPage(): JSX.Element {
    useTitle("Kunden");

    const [filter, setFilter] = useState<CustomerFilter>("all");
    const [search, setSearch] = useQueryParam();
    const [page, setPage] = useState(1);
    const [wanted, setWanted] = useState(() => search.trim());
    // Nachreview W-0141: Name beim Öffnen gemerkt. Fällt die Person danach aus Filter oder Seite, bleibt der Titel.
    const [opened, setOpened] = useState<{ readonly id: string; readonly name: string | null } | null>(null);
    // Für Resttage und Monatsnamen reicht der Stand beim Öffnen der Seite.
    const [now] = useState(() => Date.now());

    // W-0141: Seite, Filter und Suche rechnet der Server. Gefragt wird erst, wenn das Tippen kurz ruht.
    // Nachreview: Erst dann zurück auf Seite 1, in einem Schritt mit der Suche, auch bei einer Suche aus der Adresse (?q=).
    useEffect(() => {
        const timer = setTimeout(() => {
            const next = search.trim();

            if (next === wanted) return;
            setWanted(next);
            setPage(1);
        }, SEARCH_DEBOUNCE_MS);

        return () => clearTimeout(timer);
    }, [search, wanted]);

    const list = useApi<ICustomerList>(`/api/shop/customers?${new URLSearchParams({ page: String(page), filter, ...(wanted ? { q: wanted } : {}) }).toString()}`);
    const products = useApi<IShopProductList>("/api/shop/products");
    useLive("shop", list.reload);

    const customers = list.data?.customers ?? [];
    const everyone = list.data?.counts.all ?? 0;
    const total = list.data?.total ?? 0;
    const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;
    const stats = list.data?.stats;

    return (
        <>
            <PageHeader title="Kunden" />

            {list.error && !list.data && <Failure message={list.error.message} onRetry={list.reload} />}
            {list.loading && <Loading label="Kunden werden geladen" />}

            {stats && (
                <>
                    <div className={styles.metrics}>
                        <Metric
                            label="Aktiv bezahlt"
                            value={
                                <>
                                    {stats.paid}
                                    <span className={styles.metricNote}>
                                        {stats.paidSubscription} Abo · {stats.paidOneTime} Einmal
                                    </span>
                                </>
                            }
                        />
                        <Metric
                            label="Im Test"
                            value={
                                <>
                                    {stats.trial}
                                    <span className={styles.metricNote}>{stats.trialEndingSoon} enden in 2 Tagen</span>
                                </>
                            }
                        />
                        <Metric
                            label={`Umsatz ${MONTH.format(now)}`}
                            value={
                                <>
                                    {formatPrice(stats.revenueCents)}
                                    <span className={styles.metricNote}>Käufe in diesem Monat</span>
                                </>
                            }
                        />
                        <Metric label="Gesperrt" value={stats.banned} />
                    </div>

                    <div className={styles.toolbar}>
                        <div className={styles.chips} role="group" aria-label="Nach Status filtern">
                            {CUSTOMER_FILTERS.map((entry) => (
                                <button
                                    key={entry}
                                    type="button"
                                    className={styles.chip}
                                    aria-pressed={filter === entry}
                                    onClick={() => {
                                        setFilter(entry);
                                        setPage(1);
                                    }}
                                >
                                    {FILTER_LABELS[entry]}
                                    <span className={styles.chipCount}>{list.data?.counts[entry] ?? 0}</span>
                                </button>
                            ))}
                        </div>
                        <div className={styles.search} role="search">
                            <Field id="kunden-suche" label="Suchen">
                                <input
                                    id="kunden-suche"
                                    type="search"
                                    value={search}
                                    onChange={(event) => setSearch(event.target.value)}
                                    maxLength={CUSTOMER_SEARCH_MAX}
                                    placeholder="Name, ID oder Mail …"
                                    autoComplete="off"
                                />
                            </Field>
                        </div>
                    </div>

                    <p className={styles.count} aria-live="polite">
                        {total === everyone ? `${everyone} Personen` : `${total} von ${everyone} Personen`}
                    </p>

                    {customers.length === 0 ? (
                        <p className={styles.empty}>{everyone === 0 ? "Noch hat sich niemand auf der Preisseite angemeldet." : "Niemand passt zu Filter und Suche."}</p>
                    ) : (
                        <div className={styles.frame}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th scope="col">Person</th>
                                        <th scope="col">Status</th>
                                        <th scope="col">Produkt</th>
                                        <th scope="col">Bis</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {customers.map((row) => {
                                        const until = untilText(row, now);

                                        return (
                                            <tr key={row.id} className={row.id === opened?.id ? styles.selected : undefined} onClick={() => setOpened({ id: row.id, name: row.name })}>
                                                <td>
                                                    <span className={styles.person}>
                                                        <span className={styles.initial} aria-hidden="true">
                                                            {(row.name ?? "?").slice(0, 1).toUpperCase()}
                                                        </span>
                                                        <span>
                                                            <button type="button" className={styles.personName} onClick={() => setOpened({ id: row.id, name: row.name })}>
                                                                {row.name ?? "Unbekannt"}
                                                            </button>
                                                            <small>{shortId(row.id)}</small>
                                                        </span>
                                                    </span>
                                                </td>
                                                <td>
                                                    <Badge tone={STATUS[row.status].tone}>{STATUS[row.status].label}</Badge>
                                                </td>
                                                <td>{row.productTitle ?? "–"}</td>
                                                <td>
                                                    {until.day} {until.note && <span className={styles.dim}>{until.note}</span>}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <Pager page={list.data?.page ?? 1} pages={pages} onPage={setPage} />
                </>
            )}

            <SidePanel open={opened !== null} title={opened?.name ?? "Person"} onClose={() => setOpened(null)}>
                {opened !== null && <CustomerPanel key={opened.id} id={opened.id} products={products.data?.products ?? []} onChanged={list.reload} />}
            </SidePanel>
        </>
    );
}
