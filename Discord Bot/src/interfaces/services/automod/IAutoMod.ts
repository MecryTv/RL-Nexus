/**
 * Auto Mod: was der Bot von selbst aus dem Chat nimmt, bevor ein Moderator
 * online ist. Eine Zeile je Server in module_settings unter "automod" -
 * keine eigene Tabelle. Siehe docs/AutoMod.md.
 */

export type FilterId = "words" | "invites" | "links" | "spam" | "repeat" | "mentions" | "caps" | "emojis";

/** Was nach dem Löschen noch passiert. */
export type AutoAction = "none" | "warn" | "timeout" | "kick" | "ban";

export interface IFilterSettings {
    on: boolean;
    /** Die Nachricht verschwindet. */
    delete: boolean;
    action: AutoAction;
    /** Sekunden - nur bei action "timeout". */
    duration: number;
    /** Kurzer Hinweis im Kanal, der sich selbst wieder löscht. Leer: nichts sagen. */
    notice: string;
    /** Die Zahl, die dieser Filter braucht - was sie bedeutet, steht im Katalog. */
    limit: number;
    /** Sekunden - nur beim Spam-Filter. */
    window: number;
    /** words: die Liste. links: die erlaubten Domains. */
    words: string[];
    /** words: nur ganze Wörter treffen. */
    whole: boolean;
    /** invites: Einladungen zum eigenen Server durchlassen. */
    allowOwn: boolean;
}

export interface IAutoModSettings {
    filters: Record<FilterId, IFilterSettings>;
    /** Hier greift der Bot nicht ein. */
    ignoreChannels: string[];
    ignoreRoles: string[];
    /** Wer Nachrichten verwalten darf, bleibt außen vor. */
    ignoreMods: boolean;
    /** Wohin die Meldung geht - Textkanal oder Beitrag in einem Forum. */
    logChannelId: string | null;
}

/** Welche Felder ein Filter im Dashboard zeigt. */
export type FilterField = "limit" | "window" | "words" | "whole" | "allowOwn";

export interface IFilterInfo {
    id: FilterId;
    name: string;
    hint: string;
    icon: string;
    fields: FilterField[];
    /** Beschriftung und Grenzen für "limit". */
    limitLabel: string;
    limitHint: string;
    limitMin: number;
    limitMax: number;
    /** Was in der Wortliste steht - words und links benutzen dasselbe Feld. */
    wordsLabel?: string;
    wordsHint?: string;
}

/** Was ein Treffer war - für die Karte im Log. */
export interface IAutoHit {
    filter: FilterId;
    /** Was genau aufgefallen ist: das Wort, der Link, die Zahl. */
    match: string;
}
