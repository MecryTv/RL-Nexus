/**
 * W-0062 Teil 2: Tastenkürzel der Studios. Ohne DOM-Typen, damit ein Check sie
 * prüft. Wo man tippt, gelten die Tasten des Browsers.
 */
export interface IKeyLike {
    readonly key: string;
    readonly ctrlKey: boolean;
    readonly metaKey: boolean;
    readonly shiftKey: boolean;
    readonly altKey: boolean;
    readonly target: unknown;
}

const TYPED = new Set(["text", "number", "search", "email", "url", "tel", "password", "date", "datetime-local", "time", ""]);

/** Steht der Fokus in einem Feld, in dem man schreibt? Regler, Schalter und Farben zählen nicht. */
function typing(target: unknown): boolean {
    if (typeof target !== "object" || target === null) return false;

    const element = target as { tagName?: unknown; type?: unknown; isContentEditable?: unknown };
    const tag = typeof element.tagName === "string" ? element.tagName.toUpperCase() : "";
    const type = typeof element.type === "string" ? element.type.toLowerCase() : "";

    return (tag === "INPUT" && TYPED.has(type)) || tag === "TEXTAREA" || tag === "SELECT" || element.isContentEditable === true;
}

/** Strg+Z, Strg+Y und Strg+Umschalt+Z für das ganze Studio. */
export function studioShortcut(event: IKeyLike): "undo" | "redo" | null {
    if ((!event.ctrlKey && !event.metaKey) || typing(event.target)) return null;

    const key = event.key.toLowerCase();

    if (key === "y" || (key === "z" && event.shiftKey)) return "redo";

    return key === "z" ? "undo" : null;
}

/** Tasten für den gewählten Teil: Entf löscht, Strg+D dupliziert, Alt+↑/↓ verschiebt. */
export function partShortcut(event: IKeyLike): "weg" | "kopie" | "hoch" | "runter" | null {
    if (typing(event.target)) return null;

    if (event.key === "Delete" || event.key === "Backspace") return "weg";
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") return "kopie";
    if (event.altKey && event.key === "ArrowUp") return "hoch";
    if (event.altKey && event.key === "ArrowDown") return "runter";

    return null;
}
