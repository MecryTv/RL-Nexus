import type { CSSProperties, JSX } from "react";
import { Link, useLocation } from "react-router-dom";
import { Icon } from "./Icon";
import styles from "./PageTabs.module.scss";

export interface IPageTab {
    readonly to: string;
    readonly label: string;
    readonly icon?: string;
    /** Nur genau diese Adresse, nicht die darunter. */
    readonly end?: boolean;
    /** Überstimmt den Abgleich mit der Adresse, etwa wenn mehrere Adressen zu einem Reiter gehören. */
    readonly active?: boolean;
    readonly count?: number;
    /** Farbe des Punkts vor dem Namen. */
    readonly dot?: string;
    /** Statt der Zahl ein gelbes Warnzeichen, der Grund steht in `title`. */
    readonly warn?: boolean;
    readonly title?: string;
}

/** Reiter oben auf einer Seite mit Unterseiten (W-0053). Unter zwei Reitern gibt es keine Zeile. */
export function PageTabs({ label, tabs }: { readonly label: string; readonly tabs: readonly IPageTab[] }): JSX.Element | null {
    const { pathname } = useLocation();

    if (tabs.length < 2) return null;

    return (
        <nav className={styles.tabs} aria-label={label}>
            {tabs.map((tab) => {
                const on = tab.active ?? (pathname === tab.to || (!tab.end && pathname.startsWith(`${tab.to}/`)));

                return (
                    <Link key={tab.to} to={tab.to} title={tab.title} className={[styles.tab, on && styles.on].filter(Boolean).join(" ")} aria-current={on ? "page" : undefined}>
                        {tab.dot && <span className={styles.dot} style={{ "--dot": tab.dot } as CSSProperties} aria-hidden="true" />}
                        {tab.icon && <Icon name={tab.icon} size={16} />}
                        {tab.label}
                        {tab.warn ? (
                            <span className={styles.warn}>
                                <Icon name="alert" size={15} />
                                <span className="u-sr">nicht erreichbar</span>
                            </span>
                        ) : (
                            tab.count !== undefined &&
                            tab.count > 0 && (
                                <span className={styles.count}>
                                    {tab.count}
                                    <span className="u-sr"> ungelesen</span>
                                </span>
                            )
                        )}
                    </Link>
                );
            })}
        </nav>
    );
}
