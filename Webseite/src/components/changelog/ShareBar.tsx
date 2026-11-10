import type { CSSProperties, JSX } from "react";
import type { ISiteVersion } from "../../domain/interfaces/ISiteContent";
import { KIND, KINDS, countsOf } from "./meta";
import styles from "./changelog.module.scss";

/** W-0062: Der Anteilsbalken einer Version: neu, verbessert, behoben nebeneinander. Die Zahlen stehen daneben als Text. */
export function ShareBar({ version, className }: { readonly version: ISiteVersion; readonly className?: string }): JSX.Element {
    const counts = countsOf(version);

    return (
        <span className={[styles.share, className].filter(Boolean).join(" ")} aria-hidden="true">
            {KINDS.filter((kind) => counts[kind] > 0).map((kind) => (
                <i key={kind} style={{ "--c": KIND[kind].color, flexGrow: counts[kind] } as CSSProperties} />
            ))}
        </span>
    );
}

/** „4 neu · 3 verbessert · 2 behoben“ */
export function Counts({ version }: { readonly version: ISiteVersion }): JSX.Element {
    const counts = countsOf(version);
    const parts = KINDS.filter((kind) => counts[kind] > 0);

    return (
        <span className={styles.counts}>
            {parts.map((kind, index) => (
                <span key={kind}>
                    {index > 0 && " · "}
                    <b style={{ color: KIND[kind].color }}>
                        {counts[kind]} {KIND[kind].label.toLowerCase()}
                    </b>
                </span>
            ))}
        </span>
    );
}
