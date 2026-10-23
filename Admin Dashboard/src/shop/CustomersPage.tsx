import { useState, type JSX } from "react";
import { CUSTOMER_FILTERS, customerMatches, formatPrice, type CustomerFilter, type ICustomerList, type IShopProductList } from "../../shared/shop";
import { useLive } from "../api/live";
import { useApi } from "../api/useApi";
import { Badge } from "../components/Badge";
import { Field } from "../components/Field";
import { Metric } from "../components/Metric";
import { PageHeader } from "../components/PageHeader";
import { SidePanel } from "../components/SidePanel";
import { Failure, Loading } from "../components/Status";
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
 * Shop → Kunden (Entwurf A): oben vier Zahlen, darunter Filter und Suche, die
 * ohne neues Laden filtern, dann die Tabelle. Ein Klick auf eine Zeile öffnet
 * rechts alles zu der Person, mit den Aktionen.
 */
export function CustomersPage(): JSX.Element {
    useTitle("Kunden");
    const list = useApi<ICustomerList>("/api/shop/customers");
    const products = useApi<IShopProductList>("/api/shop/products");
    useLive("shop", list.reload);

    const [filter, setFilter] = useState<CustomerFilter>("all");
    const [search, setSearch] = useState("");
    const [openId, setOpenId] = useState<string | null>(null);
    // Für Resttage und Monatsnamen reicht der Stand beim Öffnen der Seite.
    const [now] = useState(() => Date.now());

    const customers = list.data?.customers ?? [];
    const rows = customers.filter((row) => customerMatches(row, filter, search));
    const opened = customers.find((row) => row.id === openId) ?? null;
    const stats = list.data?.stats;

    return (
        <>
            <PageHeader title="Kunden" meta="Wer kauft, testet oder gesperrt ist." />

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
                                <button key={entry} type="button" className={styles.chip} aria-pressed={filter === entry} onClick={() => setFilter(entry)}>
                                    {FILTER_LABELS[entry]}
                                    <span className={styles.chipCount}>{customers.filter((row) => customerMatches(row, entry, "")).length}</span>
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
                                    placeholder="Name, ID oder Mail …"
                                    autoComplete="off"
                                />
                            </Field>
                        </div>
                    </div>

                    <p className={styles.count} aria-live="polite">
                        {rows.length === customers.length ? `${customers.length} Personen` : `${rows.length} von ${customers.length} Personen`}
                    </p>

                    {rows.length === 0 ? (
                        <p className={styles.empty}>{customers.length === 0 ? "Noch hat sich niemand auf der Preisseite angemeldet." : "Niemand passt zu Filter und Suche."}</p>
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
                                    {rows.map((row) => {
                                        const until = untilText(row, now);

                                        return (
                                            <tr key={row.id} className={row.id === openId ? styles.selected : undefined} onClick={() => setOpenId(row.id)}>
                                                <td>
                                                    <span className={styles.person}>
                                                        <span className={styles.initial} aria-hidden="true">
                                                            {(row.name ?? "?").slice(0, 1).toUpperCase()}
                                                        </span>
                                                        <span>
                                                            <button type="button" className={styles.personName} onClick={() => setOpenId(row.id)}>
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
                </>
            )}

            <SidePanel open={openId !== null} title={opened?.name ?? "Person"} onClose={() => setOpenId(null)}>
                {openId !== null && <CustomerPanel key={openId} id={openId} products={products.data?.products ?? []} onChanged={list.reload} />}
            </SidePanel>
        </>
    );
}
