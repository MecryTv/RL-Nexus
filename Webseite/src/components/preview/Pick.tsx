import { type JSX, type MouseEvent, type ReactNode, useContext, useEffect, useRef } from "react";
import { type PickAction, PickContext } from "./pickContext";
import styles from "./Pick.module.scss";

const TOOLS: Readonly<Record<"block" | "abschnitt", readonly { readonly action: PickAction; readonly label: string; readonly sign: string }[]>> = {
    block: [
        { action: "hoch", label: "Nach oben", sign: "↑" },
        { action: "runter", label: "Nach unten", sign: "↓" },
        { action: "kopie", label: "Kopieren", sign: "⧉" },
        { action: "weg", label: "Löschen", sign: "×" },
    ],
    abschnitt: [
        { action: "hoch", label: "Nach oben", sign: "↑" },
        { action: "runter", label: "Nach unten", sign: "↓" },
        { action: "aus", label: "Ausblenden", sign: "◌" },
    ],
};

/**
 * Ein wählbarer Teil der Vorschau: Klick wählt ihn, der gewählte bekommt einen
 * Rahmen und bei Bausteinen und Abschnitten eine kleine Leiste. Links darin
 * führen in der Vorschau nirgendwohin.
 */
export function Pick({ part, children }: { readonly part: string; readonly children: ReactNode }): JSX.Element {
    const pick = useContext(PickContext);
    const box = useRef<HTMLDivElement>(null);
    const selected = pick?.selected === part;

    useEffect(() => {
        if (selected) box.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, [selected]);

    if (!pick) return <>{children}</>;

    const kind = part.startsWith("block:") ? "block" : part.startsWith("abschnitt:") ? "abschnitt" : null;
    const choose = (event: MouseEvent): void => {
        const target = event.target instanceof Element ? event.target : null;

        // Die eigene Leiste und innere Teile regeln ihre Klicks selbst. Die Erfassung läuft von außen nach innen.
        if (target?.closest("[role=toolbar]") || target?.closest("[data-part]") !== box.current) return;

        event.preventDefault();
        event.stopPropagation();
        pick.onPick(part);
    };

    return (
        <div ref={box} className={[styles.pick, selected && styles.selected].filter(Boolean).join(" ")} data-part={part} onClickCapture={choose}>
            {children}
            {selected && kind && (
                <div className={styles.tools} role="toolbar" aria-label="Teil bearbeiten">
                    {TOOLS[kind].map((tool) => (
                        <button
                            key={tool.action}
                            type="button"
                            title={tool.label}
                            aria-label={tool.label}
                            onClickCapture={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                pick.onAction(part, tool.action);
                            }}
                        >
                            {tool.sign}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
