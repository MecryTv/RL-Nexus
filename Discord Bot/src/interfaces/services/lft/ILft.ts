import { ICustomEmbed, MessageKind } from "../messages/IMessages";
import { IMessageDoc } from "../../builder/IMessageDoc";

/**
 * Looking for: Spieler suchen ein Team, Teams suchen Spieler. Gefragt wird in
 * der DM, fertig wird daraus ein Beitrag im Forum. Siehe docs/LookingFor.md.
 */

/** Wer sucht: ein einzelner Spieler oder ein Team. */
export type LftKind = "player" | "team";

export type LftStatus = "open" | "closed";

export type LftQuestionKind = "short" | "long" | "choice";

export interface ILftQuestion {
    /** Eindeutig je Seite - die Antwort und die Platzhalter zeigen darauf. */
    id: string;
    label: string;
    hint: string;
    kind: LftQuestionKind;
    /** Nur bei "choice" - in der DM wird daraus ein Auswahlmenü. */
    choices: string[];
    required: boolean;
    /** Höchstlänge der Antwort. */
    max: number;
}

/** Eine Nachricht, wie sie der Editor im Dashboard baut. */
export interface ILftBody {
    kind: MessageKind;
    content: string;
    embed: ICustomEmbed | null;
    doc: IMessageDoc;
}

/** Der Tag, den der Bot im Forum anlegt. */
export interface ILftTag {
    name: string;
    emoji: string | null;
    /** Vom Bot gefüllt, sobald der Tag im Forum steht. */
    id: string | null;
    /** Der Tag für beendete Suchen - im selben Forum. */
    closedId: string | null;
}

/** Eine der beiden Seiten: Spieler oder Team. Beide können dasselbe Forum nutzen. */
export interface ILftSide {
    /** Nimmt gerade Anfragen an. */
    on: boolean;
    forumId: string | null;
    tag: ILftTag;
    questions: ILftQuestion[];
    /** Der Titel des Beitrags - mit Platzhaltern. */
    title: string;
    /** Der Beitrag selbst. */
    post: ILftBody;
    /** Was in der DM steht, bevor abgeschickt wird. */
    preview: ILftBody;
}

/** Die Meldung ans Team, wenn eine Anfrage entsteht. Ohne Kanal aus. */
export interface ILftNotice {
    channelId: string | null;
    roles: string[];
    body: ILftBody;
}

/** Die drei Nachrichten in der DM - für beide Seiten dieselben. */
export interface ILftDm {
    intro: ILftBody;
    question: ILftBody;
    done: ILftBody;
}

/** Wie gefragt wird (Plan 30): per DM wie bisher oder im Fenster in Discord. */
export type LftAsk = "dm" | "modal";

/**
 * Das Panel im Forum (Plan 30): ein angepinnter Beitrag mit einer Karte, unter
 * die der Bot je Seite einen Knopf hängt.
 */
export interface ILftPanel {
    /** Leer: das Forum der Spieler-Suche, sonst das der Team-Suche. */
    forumId: string | null;
    /** Der Titel des Beitrags. */
    title: string;
    body: ILftBody;
    /** Schreibt nur der Bot beim Senden. */
    threadId: string | null;
    messageId: string | null;
}

export interface ILftSettings {
    player: ILftSide;
    team: ILftSide;
    notice: ILftNotice;
    dm: ILftDm;
    ask: LftAsk;
    panel: ILftPanel;
    /** Nach so vielen Tagen schließt der Bot eine Suche. 0: nie. */
    expireDays: number;
    /** Diese Rollen dürfen fremde Suchen beenden und Beiträge löschen. */
    manageRoles: string[];
}

/**
 * Eine Antwort. Die Frage steht mit dabei: ändert jemand später die Frage,
 * bleibt der Beitrag lesbar.
 */
export interface ILftAnswer {
    id: string;
    label: string;
    value: string;
}

export interface ILftRequest {
    id: number;
    guildId: string;
    kind: LftKind;
    userId: string;
    userName: string;
    title: string;
    answers: ILftAnswer[];
    /** Der Beitrag im Forum. */
    threadId: string | null;
    messageId: string | null;
    /** Die Meldung im Team-Kanal. */
    noticeId: string | null;
    status: LftStatus;
    createdAt: number;
    closedAt: number | null;
    closedBy: string | null;
}
