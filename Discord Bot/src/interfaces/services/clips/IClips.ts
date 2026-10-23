import { IMessageDoc } from "../../builder/IMessageDoc";
import { ICustomEmbed, MessageKind } from "../messages/IMessages";

/**
 * Clips der Woche: Mitglieder laden ihre Clips als Video in einen Kanal, nach
 * dem Schließen wird per Reaktion abgestimmt, am Ende stehen die Gewinner
 * fest, der Bot sichert alle Clips und leert den Kanal. Siehe docs/Clips.md.
 */

/** Wie oft sich die Termine wiederholen. */
export type ClipRepeat = "none" | "weekly" | "monthly";

/** Die Termine der nächsten Runde als Zeitpunkte (ms). null: noch kein Termin. */
export interface IClipSchedule {
    openAt: number | null;
    closeAt: number | null;
    endAt: number | null;
    repeat: ClipRepeat;
}

/** Eine Nachricht im Ankündigungskanal, wie sie der Editor im Dashboard baut. */
export interface IClipBody {
    kind: MessageKind;
    content: string;
    embed: ICustomEmbed | null;
    doc: IMessageDoc;
}

/** Die Ansagen: Kanal offen, Abstimmung läuft, Gewinner stehen fest. */
export type ClipNotice = "open" | "voting" | "winners";

/**
 * Automatisch ausgeschlossen, solange die Strafen zählen: ab so vielen Fällen
 * je Art. 0 heißt: diese Art zählt nicht. Verwarnungen zählen, solange die
 * Moderation sie zählt; Timeouts, Kicks und Banns days Tage lang.
 */
export interface IClipPenalties {
    warn: number;
    timeout: number;
    kick: number;
    ban: number;
    days: number;
}

/** Wer bei Clips der Woche nicht mitmachen darf - weder einreichen noch abstimmen. */
export interface IClipBlock {
    userId: string;
    name: string;
    reason: string;
    by: string;
    at: number;
}

export interface IClipSettings {
    /** Wo die Clips gepostet werden. Ohne Kanal läuft nichts. */
    channelId: string | null;
    /** Wohin die Ansagen gehen. null: in den Clip-Kanal. */
    announceChannelId: string | null;
    /** So viele Clips darf eine Person je Runde einreichen. */
    maxPerUser: number;
    /** Die Reaktion, mit der abgestimmt wird: ein Emoji oder <:name:id>. */
    emoji: string;
    /** An: der Bot folgt den Terminen. Aus: Runden nur über das Dashboard. */
    auto: boolean;
    schedule: IClipSchedule;
    /** Preise für Platz 1 bis 3. Leer: kein Preis für diesen Platz. */
    prizes: string[];
    /** Die öffentliche Clip-Seite ohne Anmeldung. */
    publicBoard: boolean;
    /** Welche Ansagen der Bot schickt. */
    notify: Record<ClipNotice, boolean>;
    messages: Record<ClipNotice, IClipBody>;
    penalties: IClipPenalties;
    /** Von Hand gesperrt - bleibt, bis jemand die Sperre aufhebt. */
    blocked: IClipBlock[];
}

export type ClipRoundStatus = "open" | "voting" | "done";

/** Ein hochgeladenes Video. "link" gab es früher; alte Einträge bleiben lesbar. */
export type ClipKind = "video" | "link";

export interface IClipWinner {
    place: number;
    entryId: number;
    userId: string;
    name: string;
    votes: number;
    prize: string;
    url: string;
    kind: ClipKind;
    /** Sprung zur Nachricht in Discord - nach dem Leeren des Kanals ins Leere. */
    messageUrl: string;
}

export interface IClipRound {
    id: number;
    guildId: string;
    status: ClipRoundStatus;
    openedAt: number;
    /** Geplant: wann das Einreichen endet und wann die Abstimmung. */
    closesAt: number;
    endsAt: number;
    /** Tatsächlich: wann geschlossen und wann beendet wurde. */
    closedAt: number | null;
    endedAt: number | null;
    /** Die Preise, wie sie beim Öffnen galten. */
    prizes: string[];
    winners: IClipWinner[];
}

export interface IClipEntry {
    id: number;
    roundId: number;
    guildId: string;
    userId: string;
    /** Der Anzeigename beim Einreichen. */
    userName: string;
    channelId: string;
    messageId: string;
    url: string;
    kind: ClipKind;
    createdAt: number;
    /** Stimmen am Ende - null, solange die Runde läuft. */
    votes: number | null;
    /** Platz in der Wertung aller Clips der Runde - null, solange sie läuft. */
    rank: number | null;
    /** Die Kopie im Archiv-Ordner der Runde. null: (noch) keine. */
    file: string | null;
    size: number | null;
}
