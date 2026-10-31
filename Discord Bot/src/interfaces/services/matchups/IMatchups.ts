import { IMessageDoc } from "../../builder/IMessageDoc";
import { ICustomEmbed, MessageKind } from "../messages/IMessages";

/**
 * Matchups: anstehende Partien eines Teams. Eingetragen wird über einen
 * öffentlichen Link von denen, die im Kader als Captain, Co-Captain, Manager oder Coach
 * stehen - der Bot meldet die Partie im Kanal und erinnert vor Anpfiff.
 * Siehe docs/Matchups.md.
 */

/** Die Spielart. Dieselben Playlists wie in der Team-Übersicht, dazu 4v4. */
export type MatchupMode = "1v1" | "2v2" | "3v3" | "4v4";

export type MatchupStatus = "planned" | "played" | "cancelled";

/** Eine Nachricht, wie sie der Editor im Dashboard baut. */
export interface IMatchupBody {
    kind: MessageKind;
    content: string;
    embed: ICustomEmbed | null;
    doc: IMessageDoc;
}

export interface IMatchup {
    id: number;
    guildId: string;
    /** Das Team aus der Übersicht. null: das Team gibt es dort nicht mehr. */
    teamId: number | null;
    /** Der Name zum Zeitpunkt des Eintrags - bleibt lesbar, wenn das Team weg ist. */
    teamName: string;
    opponent: string;
    league: string;
    mode: MatchupMode;
    /** Best-of: 3, 5, 7 … 0 heißt: nicht festgelegt. */
    bestOf: number;
    /** Wann angepfiffen wird. */
    at: number;
    /** Wo übertragen wird. null: kein Stream. */
    stream: string | null;
    note: string;
    status: MatchupStatus;
    /** Das Ergebnis aus Sicht des eigenen Teams. null: noch nicht gemeldet. */
    score: { us: number; them: number } | null;
    /** Die Nachricht im Kanal. */
    messageId: string | null;
    /** Wann erinnert wurde - damit es genau einmal passiert. */
    remindedAt: number | null;
    /** Wann die Ankündigung auf „läuft“ umgestellt wurde - genau einmal (Plan 28). */
    liveAt: number | null;
    /** Wann ans fehlende Ergebnis erinnert wurde - genau einmal. */
    resultRemindedAt: number | null;
    /** Die Ergebnis-Nachricht - „Ergebnis ändern“ bearbeitet sie. */
    resultMessageId: string | null;
    createdBy: string;
    createdName: string;
    createdAt: number;
    updatedAt: number;
}

export interface IMatchupSettings {
    /** Wohin die Meldungen gehen. */
    channelId: string | null;
    /** Diese Rollen werden erwähnt. */
    pingRoles: string[];
    /** So viele Minuten vor Anpfiff wird erinnert. 0: keine Erinnerung. */
    remindMinutes: number;
    /** Der öffentliche Link steht offen. */
    open: boolean;
    /** Ergebnisse dürfen eingetragen werden. */
    results: boolean;
    /** Unter der Ankündigung steht „Ergebnis eintragen“ (Plan 28). */
    discordResults: boolean;
    /** So viele Stunden nach Anpfiff wird einmal ans fehlende Ergebnis erinnert. 0: nie. */
    resultRemindHours: number;
    /** Der Rand folgt dem Stand: rot vor und während des Spiels, grün bei Sieg, rot bei Niederlage, grau bei Unentschieden und Absage. */
    colorByStatus: boolean;
    /** So viele Tage im Voraus darf eingetragen werden. */
    maxAhead: number;
    /** Vorschläge für das Feld „Liga" - frei tippen geht trotzdem. */
    leagues: string[];
    /** Beim Eintragen. */
    announce: IMatchupBody;
    /** Kurz vor Anpfiff. */
    remind: IMatchupBody;
    /** Wenn das Ergebnis steht. */
    result: IMatchupBody;
}

/** Wie ein Spiel ausging - aus Sicht des eigenen Teams. */
export type Outcome = "w" | "l" | "d";

/** Die Bilanz eines Teams aus seinen gespielten Partien (Plan 28). */
export interface IMatchupRecord {
    wins: number;
    losses: number;
    draws: number;
    /** Die letzten Spiele, das neueste zuerst. */
    form: Outcome[];
    /** Gleicher Ausgang in Folge, vom neuesten Spiel an. */
    streak: { outcome: Outcome; count: number } | null;
}

/** Ein Team, für das jemand eintragen darf. */
export interface IMatchupTeam {
    id: number;
    name: string;
    tag: string;
    /** Was die Person in diesem Team macht - oder "manage" für Server-Verwalter. */
    role: string;
}
