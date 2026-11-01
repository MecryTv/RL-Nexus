import { IMessageDoc } from "../../builder/IMessageDoc";
import { IBoardDesign, IBoardStyle, ICardDesign } from "./ILevelDesign";

/* ----------------------------------------------------------
   Level System - siehe docs/Levels.md
   ---------------------------------------------------------- */

/** Der Stand eines Mitglieds. */
export interface ILevelEntry {
    guildId: string;
    userId: string;
    xp: number;
    level: number;
    messages: number;
    voiceMinutes: number;
    lastMessage: number;
}

/** Ab diesem Level gibt es diese Rolle. */
export interface ILevelReward {
    level: number;
    roleId: string;
}

/** Mehr oder weniger Punkte in bestimmten Kanälen oder für bestimmte Rollen. */
export interface ILevelBonus {
    id: string;
    factor: number;
}

/**
 * Plan 37: ein Zeitfenster mit mehr Punkten. Einmalig: start bis end
 * (Zeitpunkte). Wöchentlich: weekday (0 Sonntag bis 6 Samstag) von from bis to
 * (HH:MM, Berliner Zeit); ist to nicht nach from, geht es über Mitternacht.
 */
export interface ILevelBoost {
    id: string;
    kind: "once" | "weekly";
    factor: number;
    start: number | null;
    end: number | null;
    weekday: number | null;
    from: string | null;
    to: string | null;
    /** Beginn und Ende im Kanal boostChannelId ankündigen. */
    announce: boolean;
}

/** Plan 37: „Aktivste der Woche“ bzw. „des Monats“ - an, wohin, welche Rolle für Platz 1 bis 3. */
export interface ITopPost {
    on: boolean;
    channelId: string | null;
    roleId: string | null;
}

/** Plan 43: die Rangliste als feste Nachricht im Kanal - Seite 1 des Zeitraums. */
export interface IBoardPostSettings {
    on: boolean;
    channelId: string | null;
    period: LevelPeriod;
}

export interface ILevelSettings {
    /** Punkte je Nachricht - zufällig zwischen min und max. */
    chat: { on: boolean; min: number; max: number; cooldown: number };
    /** Punkte je Minute im Sprachkanal. */
    voice: { on: boolean; xp: number; alone: boolean; muted: boolean };
    /** Wie steil es nach oben geht: Level n braucht base * n Punkte. */
    base: number;
    /** Mehr oder weniger Punkte - je Rolle und je Kanal. */
    roleBonus: ILevelBonus[];
    channelBonus: ILevelBonus[];
    /** Hier gibt es gar keine Punkte. */
    noChannels: string[];
    noRoles: string[];
    /** Wo die Aufstiegs-Nachricht landet. Per DM nicht mehr (W-0043): Gespeichertes „dm“ gilt als „channel“. */
    announce: "current" | "channel" | "off";
    /** Pflicht, solange die Nachricht an ist - bei „current“ für Voice und Nachtrag. */
    announceChannelId: string | null;
    /** Die Nachricht selbst - ohne eigene gilt die Vorlage. */
    message: IMessageDoc | null;
    /** Rollen ab Level X. */
    rewards: ILevelReward[];
    /** Alte Belohnungsrollen behalten oder durch die neue ersetzen. */
    stack: boolean;
    /** Die Rangliste ist ohne Anmeldung zu sehen. Standard: aus. */
    public: boolean;
    /**
     * Plan 34, Schutz gegen Punkte-Farmen, jeweils abschaltbar: ab 5 Zeichen,
     * dieselbe Nachricht hintereinander nur einmal, keine Punkte bei Mod-Strafe
     * (Timeout, Quarantäne), keine Punkte für Nachrichten, die AutoMod löscht.
     */
    fair: { length: boolean; repeat: boolean; punished: boolean; automod: boolean };
    /** Plan 34: Aufstiegs-Nachricht im Chat nach so vielen Minuten wieder löschen (ANNOUNCE_DELETE). 0: nie. */
    announceDelete: number;
    /** Plan 35: eigene Level-Karte. null: die Karte wie bisher (builder/LevelCard.ts). */
    cardDesign: ICardDesign | null;
    /** Plan 35: eigenes Aufstiegs-Bild. null: die Vorlage „Banner“. */
    upDesign: ICardDesign | null;
    /** Plan 35: Aufstieg als Bild oder als Text-Nachricht. Nicht gespeichert: UpMode() entscheidet. */
    upMode?: "image" | "text";
    /** Plan 35: die Zeile über dem Aufstiegs-Bild, mit den Platzhaltern der Nachricht. */
    upLine: string;
    /** Plan 35: Stil des Ranglisten-Bilds und des Kopfs der Web-Rangliste. */
    boardStyle: IBoardStyle;
    /** Plan 37: doppelte Punkte zu festen Zeiten. */
    boosts: ILevelBoost[];
    /** Plan 37: hier kündigt der Bot Beginn und Ende der Fenster an. */
    boostChannelId: string | null;
    /** Plan 37: Aktivste der Woche und des Monats. */
    top: { week: ITopPost; month: ITopPost };
    /** Plan 43: die Rangliste fest in einem Kanal. */
    boardPost: IBoardPostSettings;
    /** Plan 38: das Ranglisten-Bild im Baukasten. null: die Vorlage Podium aus boardStyle. */
    boardDesign: IBoardDesign | null;
}

/** Plan 34: der einmalige Nachtrag je Server. backfill: Modul war aus, alles gutgeschrieben; prefill: Modul war an, nur Tageswerte; none: nichts vor D0. */
export type LevelBackfillMode = "backfill" | "prefill" | "none";

export interface ILevelBackfill {
    guildId: string;
    mode: LevelBackfillMode;
    /** D0: nur Tage davor wurden nachgetragen. */
    cutoff: number;
    members: number;
    xp: number;
    /** Bis zu dieser Person ist gutgeschrieben - dahinter setzt ein abgebrochener Nachtrag fort. */
    cursor: string | null;
    claimedAt: number;
    /** null: läuft gerade oder brach ab. */
    doneAt: number | null;
}

/** Plan 34: Lifetime, die letzten 7 oder 30 Tage (gleitend). */
export type LevelPeriod = "all" | "7d" | "30d";

/** Plan 34: ein Platz in der Rangliste eines Zeitraums. Level, into und need sind immer Lifetime. */
export interface IBoardEntry {
    rank: number;
    userId: string;
    name: string;
    avatar: string | null;
    level: number;
    /** Punkte, Nachrichten und Voice-Minuten im Zeitraum. */
    xp: number;
    messages: number;
    voiceMinutes: number;
    /** Plätze gestiegen (positiv) oder gefallen gegenüber sieben Tagen davor; "new": vorher nicht dabei. */
    trend: number | "new";
    into: number;
    need: number;
}

export interface IBoardPage {
    period: LevelPeriod;
    page: number;
    pages: number;
    /** Mitglieder mit Punkten im Zeitraum. */
    total: number;
    entries: IBoardEntry[];
    /** Die Tage des Zeitraums; null bei Lifetime. */
    range: { from: number; to: number } | null;
    /** Wer fragt, sofern er im Zeitraum Punkte hat. */
    viewer: IBoardEntry | null;
    /** Summe aller im Zeitraum - für die Zahlen im Kopf der Web-Rangliste. */
    sum: { xp: number; voiceMinutes: number };
}

/** Plan 37: Punkte von Hand - add ist geben und abziehen (amount mit Vorzeichen). */
export type LevelAdjustMode = "add" | "set" | "reset";

/** Plan 37: ein Eintrag im Protokoll der Punkte von Hand. */
export interface ILevelLogEntry {
    id: number;
    guildId: string;
    userId: string;
    /** Wer geändert hat. */
    actorId: string;
    mode: LevelAdjustMode;
    amount: number;
    before: number;
    after: number;
    reason: string;
    createdAt: number;
}

/** Plan 37: Aktivste der Woche oder des Monats. */
export type LevelTopKind = "week" | "month";

/** Plan 37: der letzte Post je Server und Art. */
export interface ILevelTop {
    guildId: string;
    kind: LevelTopKind;
    /** Beginn des geposteten Zeitraums: „2026-10-19“ (Woche) oder „2026-09“ (Monat). */
    periodKey: string;
    /** Wer die Rolle bekommen hat. */
    holders: string[];
    /** Was beim letzten Post schiefging. null: nichts. */
    error: string | null;
    postedAt: number;
}

/** Plan 43: was im Kanal steht. Getrennt von den Einstellungen, damit Speichern die Nachricht nicht vergisst. */
export interface ILevelBoardPost {
    guildId: string;
    channelId: string;
    /** null: noch keine oder nicht geschickt (error sagt warum). */
    messageId: string | null;
    /** Was zuletzt gezeichnet wurde - gleich, dann bleibt die Nachricht stehen. */
    fingerprint: string;
    error: string | null;
    updatedAt: number;
}

/** Ein Platz in der Rangliste. */
export interface ILevelRank extends ILevelEntry {
    rank: number;
}
