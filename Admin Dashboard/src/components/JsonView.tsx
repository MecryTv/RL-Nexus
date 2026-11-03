import { useMemo, useState, type JSX } from "react";
import styles from "./JsonView.module.scss";

/**
 * Ein Wert als JSON mit Zeilennummern (W-0066, Dev → Datenbank). Objekte und
 * Listen lassen sich an ihrer ersten Zeile zuklappen; die Nummern bleiben die
 * des ganzen Texts, damit man sich auf eine Zeile beziehen kann.
 */

interface ILine {
    readonly text: string;
    /** Bei einer öffnenden Zeile: die Zeile mit der schließenden Klammer. */
    readonly end: number | null;
}

function linesOf(value: unknown): ILine[] {
    const text = JSON.stringify(value, null, 2) ?? "undefined";
    const raw = text.split("\n");
    const open: number[] = [];
    const ends = new Map<number, number>();

    raw.forEach((line, index) => {
        const trimmed = line.trimEnd();

        if (/^\s*[}\]],?$/.test(trimmed)) {
            const start = open.pop();
            if (start !== undefined) ends.set(start, index);
        }
        if (/[{[]$/.test(trimmed)) open.push(index);
    });

    return raw.map((line, index) => ({ text: line, end: ends.get(index) ?? null }));
}

function Token({ text }: { readonly text: string }): JSX.Element {
    // Schlüssel, Texte, Zahlen und null/true/false einfärben, alles andere bleibt wie es ist.
    const parts = text.split(/("(?:[^"\\]|\\.)*"(?=\s*:)|"(?:[^"\\]|\\.)*"|\b-?\d+(?:\.\d+)?(?:e[+-]?\d+)?\b|\btrue\b|\bfalse\b|\bnull\b)/);

    return (
        <>
            {parts.map((part, index) => {
                if (index % 2 === 0) return part;

                const key = part.startsWith('"') && parts[index + 1]?.trimStart().startsWith(":");
                const kind = key ? styles.key : part.startsWith('"') ? styles.string : /^(true|false|null)$/.test(part) ? styles.word : styles.num;

                return (
                    <span key={index} className={kind}>
                        {part}
                    </span>
                );
            })}
        </>
    );
}

export function JsonView({ value }: { readonly value: unknown }): JSX.Element {
    const lines = useMemo(() => linesOf(value), [value]);
    const [folded, setFolded] = useState<ReadonlySet<number>>(new Set());
    const shown: number[] = [];

    for (let index = 0; index < lines.length; index++) {
        shown.push(index);

        const end = lines[index]!.end;
        if (end !== null && folded.has(index)) index = end;
    }

    const toggle = (index: number): void => {
        const next = new Set(folded);

        if (next.has(index)) next.delete(index);
        else next.add(index);
        setFolded(next);
    };

    return (
        <div className={styles.json}>
            {shown.map((index) => {
                const line = lines[index]!;
                const closed = line.end !== null && folded.has(index);

                return (
                    <div key={index} className={styles.line}>
                        <span className={styles.number} aria-hidden="true">
                            {index + 1}
                        </span>
                        <span className={styles.fold}>
                            {line.end !== null && (
                                <button type="button" aria-expanded={!closed} aria-label={closed ? `Zeile ${index + 1} aufklappen` : `Zeile ${index + 1} zuklappen`} onClick={() => toggle(index)}>
                                    {closed ? "▸" : "▾"}
                                </button>
                            )}
                        </span>
                        <code className={styles.text}>
                            <Token text={line.text} />
                            {closed && <span className={styles.more}> … {lines[line.end!]!.text.trim()}</span>}
                        </code>
                    </div>
                );
            })}
        </div>
    );
}
