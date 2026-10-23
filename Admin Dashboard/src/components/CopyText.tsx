import { useEffect, useId, useState, type JSX } from "react";
import { Icon } from "./Icon";
import styles from "./CopyText.module.scss";

/**
 * Eine ID samt Knopf zum Kopieren. Ohne Zwischenablage (etwa http ohne
 * localhost) markiert der Knopf den Text, dann geht Strg+C.
 */
export function CopyText({ value }: { readonly value: string }): JSX.Element {
    const id = useId();
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!copied) return;

        const timer = window.setTimeout(() => setCopied(false), 1800);

        return () => window.clearTimeout(timer);
    }, [copied]);

    async function copy(): Promise<void> {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
        } catch {
            const node = document.getElementById(id);
            if (node) window.getSelection()?.selectAllChildren(node);
        }
    }

    return (
        <span className={styles.wrap}>
            <code id={id} className={styles.code}>
                {value}
            </code>
            <button type="button" className={styles.button} onClick={() => void copy()}>
                <Icon name={copied ? "check" : "copy"} size={16} />
                <span className="u-sr">{copied ? "Kopiert" : `${value} kopieren`}</span>
            </button>
            <span className="u-sr" aria-live="polite">
                {copied ? "Kopiert" : ""}
            </span>
        </span>
    );
}
