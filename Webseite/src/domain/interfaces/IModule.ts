import type { ModuleStatus } from "../enums/ModuleCategory";

/**
 * Was ein Modul auf der Seite zeigt, bevor es ein Modell ist.
 *
 * Reine Daten - so steht ein Modul in `data/modules.data.ts`. Alles Abgeleitete
 * (Farbe, Suchtreffer, Sortierschlüssel) rechnet `BotModule` aus, damit es nicht
 * dreiundzwanzigmal von Hand gepflegt werden muss.
 */
export interface IModuleDefinition {
    /** Stabiler Schlüssel - steckt in der URL, ändert sich nie. */
    readonly id: string;
    readonly name: string;
    /** Ein Satz. Steht auf der Kachel. */
    readonly tagline: string;
    /** Zwei bis vier Sätze. Steht in der Detailansicht. */
    readonly description: string;
    /** Die ID einer Kategorie aus categories.json. */
    readonly category: string;
    readonly status: ModuleStatus;
    /** Name des Symbols aus der Icon-Sammlung. */
    readonly icon: string;
    /** Was das Modul konkret kann - drei bis sechs Punkte. */
    readonly highlights: readonly string[];
    /** Die Slash-Commands, die es mitbringt. Ohne führenden Schrägstrich. */
    readonly commands?: readonly string[];
    /** Auf der Startseite hervorgehoben. */
    readonly featured?: boolean;
    /** Gehört fest zum Bot und hat keinen Schalter, etwa die Galerie. */
    readonly builtIn?: boolean;
}

/**
 * Ein Modul, wie die Oberfläche es benutzt.
 *
 * Die Daten aus `IModuleDefinition` plus alles, was sich daraus ergibt.
 */
export interface IModule extends IModuleDefinition {

    /** Die Kategoriefarbe als CSS-Custom-Property-Verweis. */
    readonly accent: string;
    /** Deutsches Label des Status - "Verfügbar", "Beta", "Geplant". */
    readonly statusLabel: string;
    /** Ob das Modul heute schon benutzbar ist. */
    readonly isAvailable: boolean;
    /** Der Pfad zur Detailansicht. */
    readonly href: string;

    /** Ob ein Suchbegriff auf das Modul passt. Groß-/Kleinschreibung egal. */
    matches(query: string): boolean;
}

/** Das, was eine Kategorie über sich selbst weiß. */
export interface ICategoryMeta {
    readonly id: string;
    readonly label: string;
    readonly description: string;
    readonly accent: string;
}
