import type { JSX, ReactNode } from "react";
import { PageTabs } from "../components/PageTabs";
import { useNow } from "../useNow";
import { LIVE_EVERY } from "./dbUtil.ts";
import styles from "./DatabasePage.module.scss";

/** Bausteine für Dev → Datenbank, Reiter MariaDB und Redis (W-0066, Entwurf D-A++). */

export function DbTabs({ tables, keys, redisOnline, updatedAt }: { readonly tables?: number; readonly keys?: number; readonly redisOnline?: boolean; readonly updatedAt: number | null }): JSX.Element {
    const now = useNow(1_000);
    const ago = updatedAt === null ? null : Math.max(0, Math.round((now - updatedAt) / 1000));

    return (
        <div className={styles.tabsRow}>
            <PageTabs
                label="Datenbanken"
                tabs={[
                    { to: "/dev/datenbank", label: "MariaDB", icon: "database", ...(tables === undefined ? {} : { count: tables }) },
                    { to: "/dev/redis", label: "Redis", icon: "pulse", ...(keys === undefined ? {} : { count: keys }), ...(redisOnline === undefined ? {} : { dot: redisOnline ? "var(--c-win)" : "var(--c-loss)" }) },
                ]}
            />
            <span className={styles.live} aria-live="off">
                <span className={styles.readonly}>nur lesen</span>
                <i aria-hidden="true" />
                {ago === null ? "lädt …" : `aktualisiert vor ${ago} s · alle ${LIVE_EVERY / 1000} s`}
            </span>
        </div>
    );
}

export function Kpis({ items }: { readonly items: readonly { readonly label: string; readonly value: ReactNode; readonly sub?: ReactNode; readonly tone?: "ok" | "warn" | "bad" }[] }): JSX.Element {
    return (
        <dl className={styles.kpis}>
            {items.map((item) => (
                <div key={item.label}>
                    <dt>{item.label}</dt>
                    <dd className={item.tone ? styles[item.tone] : undefined}>{item.value}</dd>
                    {item.sub !== undefined && <small>{item.sub}</small>}
                </div>
            ))}
        </dl>
    );
}

/** Ein schmaler Balken neben einer Größe, relativ zur größten der Liste. */
export function SizeBar({ share }: { readonly share: number }): JSX.Element {
    return (
        <span className={styles.sizeBar} aria-hidden="true">
            <b style={{ width: `${Math.max(2, Math.min(100, share * 100))}%` }} />
        </span>
    );
}
