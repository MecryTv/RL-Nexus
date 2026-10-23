/**
 * Logging System: was protokolliert wird und wohin.
 *
 * Gespeichert wird eine Zeile je Server in module_settings unter "logging" -
 * keine eigene Tabelle. Siehe docs/Logging.md.
 */

export type LogCategoryId = "messages" | "members" | "server" | "voice" | "moderation";

/** Der Ton einer Meldung - er entscheidet über die Farbe der Karte. */
export type LogTone = "add" | "remove" | "change";

export interface ILogEventSetting {
    on: boolean;
    /** Ein eigenes Ziel. null heißt: das der Kategorie. */
    channelId: string | null;
}

export interface ILogSettings {
    /** Das Ziel je Kategorie - ein Textkanal oder ein Beitrag in einem Forum. */
    categories: Record<LogCategoryId, string | null>;
    /** Je Ereignis: an oder aus, und auf Wunsch ein eigenes Ziel. */
    events: Record<string, ILogEventSetting>;
    /** Was der Bot übergeht: diese Kanäle (samt ihrer Kategorie), diese Rollen, Bots. */
    ignoreChannels: string[];
    ignoreRoles: string[];
    ignoreBots: boolean;
}

export interface ILogCategory {
    id: LogCategoryId;
    name: string;
    hint: string;
    icon: string;
}

export interface ILogEventInfo {
    key: string;
    category: LogCategoryId;
    name: string;
    hint: string;
    /** Was dem Bot dafür fehlen könnte - das Dashboard schreibt es dazu. */
    needs?: "members" | "audit";
}
