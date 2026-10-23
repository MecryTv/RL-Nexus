import { IMessageDoc } from "../../builder/IMessageDoc";
import { ICustomEmbed, MessageKind } from "../messages/IMessages";

/**
 * 2, 4 & 6 Mans: Warteschlangen für 1v1, 2v2 und 3v3. Je Modus eine eigene
 * Warteschlange und eine eigene MMR - wer in 6 Mans oben steht, fängt in 2 Mans
 * trotzdem bei null an. Siehe docs/SixMans.md.
 */

/** Wie viele mitspielen. Die Zahl ist zugleich der Name des Modus. */
export type ManMode = 2 | 4 | 6;

/** Blau ist 1, Orange ist 2 - wie im Spiel. 0 heißt: steht noch nicht fest. */
export type SixTeam = 0 | 1 | 2;

export type RoundStatus = "running" | "done" | "cancelled";

/**
 * Eine Stufe der Server-MMR. Namen, Zeichen, Farbe und Grenze bestimmt jeder
 * Server selbst - die Vorgabe ist nur ein Vorschlag.
 */
export interface IManRank {
    /** Ab dieser MMR gilt die Stufe. Die unterste steht immer bei 0. */
    min: number;
    name: string;
    emoji: string;
    /** "#rrggbb" - fürs Dashboard und die öffentliche Rangliste. */
    color: string;
}

/** Eine Nachricht, wie sie der Editor im Dashboard baut. */
export interface ISixBody {
    kind: MessageKind;
    content: string;
    embed: ICustomEmbed | null;
    doc: IMessageDoc;
}

export interface IMansSettings {
    /** Wo das Panel und die Runden stehen. */
    channelId: string | null;
    /** Unter dieser Kategorie entstehen die Sprachkanäle. */
    categoryId: string | null;
    /** Welche Modi laufen. Ist keiner an, passiert nichts. */
    modes: Record<ManMode, boolean>;
    /** Zwei Sprachkanäle je Runde. */
    voice: boolean;
    /** Jeder Teilnehmer bekommt eine DM, wenn es losgeht. */
    dm: boolean;
    /**
     * Das Ergebnis braucht die Bestätigung des anderen Teams. Aus: ein Klick
     * genügt - schneller, aber jemand kann sich Siege gutschreiben.
     */
    confirm: boolean;
    /** Womit jeder in jedem Modus anfängt. */
    start: number;
    /** Wie viel eine Runde höchstens bewegt. */
    k: number;
    /** Nach so vielen Minuten ohne Runde fliegt man aus der Warteschlange. 0: nie. */
    idleMinutes: number;
    /** Die Rangliste ohne Anmeldung. */
    board: { open: boolean };
    /** Die Stufen dieses Servers. Leer: die Vorgabe. */
    ranks: IManRank[];
    /** Das Panel im Kanal - der Bot zieht es bei jeder Änderung nach. */
    panelMessageId: string | null;
    panel: ISixBody;
    round: ISixBody;
    result: ISixBody;
    dmBody: ISixBody;
}

/** Wer wartet - je Modus eine eigene Liste. */
export interface ISixWaiting {
    userId: string;
    name: string;
    mmr: number;
    since: number;
}

export interface ISixPlayer {
    guildId: string;
    mode: ManMode;
    userId: string;
    name: string;
    mmr: number;
    wins: number;
    losses: number;
    games: number;
    /** Serie: positiv sind Siege, negativ Niederlagen. */
    streak: number;
    updatedAt: number;
}

/** Was an Sprachkanälen zu einer Runde gehört. */
export interface IRoundChannels {
    blue: string | null;
    orange: string | null;
}

/** Wer was gemeldet hat: je Team der behauptete Sieger. */
export interface IRoundReports {
    blue: SixTeam;
    orange: SixTeam;
}

export interface ISixRound {
    id: number;
    guildId: string;
    mode: ManMode;
    /** Die Spieler je Team, in der Reihenfolge der Aufteilung. */
    blue: string[];
    orange: string[];
    /** Die Namen zum Zeitpunkt der Runde - sie bleiben lesbar. */
    names: Record<string, string>;
    /** Die MMR beim Start - daraus entsteht die Veränderung. */
    before: Record<string, number>;
    status: RoundStatus;
    winner: SixTeam;
    /** Was der Bot für die private Lobby vorschlägt. */
    lobbyName: string;
    lobbyPass: string;
    channels: IRoundChannels;
    channelId: string | null;
    messageId: string | null;
    reports: IRoundReports;
    /** Wie viel die Runde bewegt hat. */
    change: number;
    createdAt: number;
    endedAt: number | null;
}

/** Eine Zeile der Rangliste. */
export interface ISixRank extends ISixPlayer {
    position: number;
    /** Die Stufe zur MMR - der Bot rechnet sie aus, die Seite zeigt sie nur. */
    rank: IManRank;
}
