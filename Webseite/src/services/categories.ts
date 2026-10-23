import type { ICategoryMeta } from "../domain/interfaces/IModule";

/** Eine Kategorie, wie sie in categories.json steht. `color`: Hex oder eine Farbe der Webseite. */
export interface ICategoryContent {
    readonly id: string;
    readonly label: string;
    readonly color: string;
    readonly description?: string;
}

/**
 * Die eingebauten Kategorien. Die Farben sind die der Karriere-Werte auf der
 * Rang-Karte. Im Betrieb kommen die Kategorien aus categories.json (Admin
 * Dashboard), diese Liste gilt, solange die fehlt, und ist ihr Startstand
 * (`npm run export`).
 */
export const DEFAULT_CATEGORIES: readonly ICategoryMeta[] = [
    {
        id: "community",
        label: "Community",
        description: "Alles, was neue Mitglieder ankommen lässt und den Server zusammenhält.",
        accent: "var(--c-mod-community)",
    },
    {
        id: "competition",
        label: "Wettbewerb",
        description: "Ränge, Teams, Partien und Warteschlangen: der sportliche Teil deiner Organisation.",
        accent: "var(--c-mod-competition)",
    },
    {
        id: "moderation",
        label: "Moderation",
        description: "Nachvollziehen, was passiert ist, und darauf reagieren können.",
        accent: "var(--c-mod-moderation)",
    },
    {
        id: "engagement",
        label: "Aktivität",
        description: "Gründe, wiederzukommen: Level, Verlosungen und Abstimmungen.",
        accent: "var(--c-mod-engagement)",
    },
    {
        id: "content",
        label: "Inhalte",
        description: "Streams, Videos, Clips und Bilder dorthin bringen, wo deine Leute sind.",
        accent: "var(--c-mod-content)",
    },
    {
        id: "utility",
        label: "Werkzeug",
        description: "Die unspektakulären Dinge, die einen Server jeden Tag am Laufen halten.",
        accent: "var(--c-mod-utility)",
    },
];

/** Für ein Modul, dessen Kategorie es nicht (mehr) gibt. */
const NEUTRAL = "var(--c-text-dim)";

let list: readonly ICategoryMeta[] = DEFAULT_CATEGORIES;

/**
 * Ersetzt die eingebauten Kategorien durch die aus categories.json. Wie
 * `setModules`: nur in `main.tsx` vor dem Import von `App` aufrufen.
 */
export function setCategories(next: readonly ICategoryContent[]): void {
    list = next.map((entry) => ({ id: entry.id, label: entry.label, description: entry.description ?? "", accent: entry.color }));
}

/** Alle Kategorien in ihrer Reihenfolge. */
export function allCategories(): readonly ICategoryMeta[] {
    return list;
}

/** Label und Farbe einer Kategorie. Unbekannt: die ID als Name und eine neutrale Farbe. */
export function categoryOf(id: string): ICategoryMeta {
    return list.find((entry) => entry.id === id) ?? { id, label: id, description: "", accent: NEUTRAL };
}
