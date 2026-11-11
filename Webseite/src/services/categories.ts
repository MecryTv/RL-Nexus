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
    // W-0085: dieselben Bereiche und dieselbe Reihenfolge wie die Leiste im Bot-Dashboard.
    {
        id: "always",
        label: "Immer dabei",
        description: "Läuft auf jedem Server ohne Schalter: Level, Galerie, Backups, Ränge und das Dashboard.",
        accent: "var(--c-mod-engagement)",
    },
    {
        id: "rocket-league",
        label: "Rocket League",
        description: "Ränge, Teams, Partien und Warteschlangen: der sportliche Teil deiner Organisation.",
        accent: "var(--c-mod-competition)",
    },
    {
        id: "community",
        label: "Community",
        description: "Alles, was neue Mitglieder ankommen lässt und den Server zusammenhält.",
        accent: "var(--c-mod-community)",
    },
    {
        id: "support",
        label: "Support",
        description: "Hilfe für deine Mitglieder, ohne dass sie in Direktnachrichten landet.",
        accent: "var(--c-mod-utility)",
    },
    {
        id: "moderation",
        label: "Moderation",
        description: "Nachvollziehen, was passiert ist, und darauf reagieren können.",
        accent: "var(--c-mod-moderation)",
    },
    {
        id: "content",
        label: "Inhalte & Meldungen",
        description: "Streams, Videos und eigene Nachrichten dorthin bringen, wo deine Leute sind.",
        accent: "var(--c-mod-content)",
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
