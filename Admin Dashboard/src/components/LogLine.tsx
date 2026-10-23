import type { CSSProperties, JSX, ReactNode, Ref } from "react";
import { Link } from "react-router-dom";
import type { ILogEntry } from "../../shared/api";
import { Icon } from "./Icon";
import { toneOf } from "./logTone";
import styles from "./LogLine.module.scss";

function statusTone(status: number): string {
    if (status >= 500) return "var(--c-loss)";
    if (status >= 400) return "var(--c-mod-engagement)";
    if (status >= 300) return "var(--c-blue)";

    return "var(--c-win)";
}

/** Den Suchbegriff im Text markieren. `needle` ist kleingeschrieben. */
function highlight(text: string, needle: string): ReactNode {
    if (needle === "") return text;

    const lower = text.toLowerCase();
    const parts: ReactNode[] = [];
    let at = 0;

    for (let index = lower.indexOf(needle); index !== -1; index = lower.indexOf(needle, index + needle.length)) {
        parts.push(text.slice(at, index), <mark key={index}>{text.slice(index, index + needle.length)}</mark>);
        at = index + needle.length;
    }

    parts.push(text.slice(at));

    return parts;
}

/** Die Liste um die Einträge, in Monospace wie im Terminal. */
export function LogList({ label, children, ref }: { readonly label: string; readonly children: ReactNode; readonly ref?: Ref<HTMLOListElement> }): JSX.Element {
    return (
        <ol ref={ref} className={styles.list} aria-label={label}>
            {children}
        </ol>
    );
}

/** Bis zu so vielen Folgezeilen stehen offen da, mehr klappen zu. */
const OPEN_LINES = 3;

/**
 * Ein Eintrag im Log: Zeilennummer, Zeit, Kategorie, Text, darunter die
 * Folgezeilen. Die Nummer ist ein Link auf genau diese Stelle, zum Teilen
 * oder, in der Suche, zum Hinspringen.
 */
export function LogLine({
    entry,
    link,
    showDate = false,
    needle = "",
    marked = false,
    jump = false,
}: {
    readonly entry: ILogEntry;
    readonly link: string;
    /** Das Datum steht über dem Eintrag, wenn ein neuer Tag beginnt. */
    readonly showDate?: boolean;
    readonly needle?: string;
    /** Der Eintrag, zu dem gesprungen wurde. */
    readonly marked?: boolean;
    /** In der Suche: Die Nummer führt in die Session und sieht auch so aus. */
    readonly jump?: boolean;
}): JSX.Element {
    const level = entry.level === "error" || entry.level === "warn" ? styles[entry.level] : undefined;

    return (
        <li
            id={`z${entry.line}`}
            tabIndex={-1}
            className={[styles.row, level, marked && styles.marked].filter(Boolean).join(" ")}
            style={{ "--tone": toneOf(entry.category) } as CSSProperties}
        >
            {showDate && <span className={styles.date}>{entry.date}</span>}

            <Link to={link} className={[styles.number, jump && styles.jump].filter(Boolean).join(" ")} aria-label={`Zeile ${entry.line}${jump ? " öffnen" : ""}`}>
                {entry.line}
                {jump && <Icon name="arrow-right" size={12} />}
            </Link>
            <time className={styles.time} title={entry.date}>
                {entry.time}
            </time>
            <span className={styles.category}>{entry.category}</span>

            <span className={styles.text}>
                {entry.http ? (
                    <>
                        <span className={styles.method}>{entry.http.method}</span> {highlight(entry.http.path, needle)}{" "}
                        <span className={styles.status} style={{ color: statusTone(entry.http.status) }}>
                            {entry.http.status}
                        </span>
                    </>
                ) : (
                    highlight(entry.text, needle)
                )}
            </span>

            {entry.more.length > 0 &&
                (entry.more.length <= OPEN_LINES ? (
                    <pre className={styles.more}>{highlight(entry.more.join("\n"), needle)}</pre>
                ) : (
                    <details className={styles.fold}>
                        <summary>{entry.more.length} weitere Zeilen</summary>
                        <pre className={styles.more}>{highlight(entry.more.join("\n"), needle)}</pre>
                    </details>
                ))}
        </li>
    );
}
