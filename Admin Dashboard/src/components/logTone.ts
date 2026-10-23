/** Die Kategorien, die der Bot heute schreibt, mit eigener Farbe. Alles andere bleibt grau. */
const TONES: Readonly<Record<string, string>> = {
    HTTP: "var(--c-blue)",
    TASKS: "var(--c-mod-content)",
    USER: "var(--c-mod-community)",
    SERVER: "var(--c-mod-utility)",
    INFO: "var(--c-text-dim)",
};

/** Die Farbe einer Kategorie. Fehler und Warnungen gewinnen, auch bei GUARDIAN ERROR. */
export function toneOf(category: string): string {
    if (category.includes("ERROR")) return "var(--c-loss)";
    if (category.includes("WARN")) return "var(--c-mod-engagement)";
    if (category.startsWith("GUARDIAN")) return "var(--c-mod-moderation)";

    return TONES[category] ?? "var(--c-text-faint)";
}
