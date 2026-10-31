/**
 * Apply System: Bewerbungen. Ein Formular je Aufgabe, eine Zeile je
 * abgeschickter Bewerbung. Siehe docs/Apply.md.
 */

export type QuestionKind = "short" | "long" | "choice";

export type ApplyStatus = "open" | "accepted" | "declined";

export interface IApplyQuestion {
    /** Eindeutig je Formular - die Antwort zeigt darauf. */
    id: string;
    label: string;
    hint: string;
    kind: QuestionKind;
    /** Nur bei "choice". */
    choices: string[];
    required: boolean;
    /** Höchstlänge der Antwort. */
    max: number;
}

export interface IFormSettings {
    /** Wohin die Karte geht. Leer: der Kanal des Moduls. */
    channelId: string | null;
    /** Diese Rolle bekommt, wer angenommen wird. */
    acceptRole: string | null;
    /** Diese Rollen werden bei einer neuen Bewerbung erwähnt. */
    pingRoles: string[];
    /** Der Bewerber bekommt die Entscheidung als DM. */
    dm: boolean;
    /** So viele Tage Pause nach einer Absage. 0: keine Pause. */
    cooldownDays: number;
    /** So alt muss das Discord-Konto sein. 0: egal. */
    minAccountDays: number;
    /** Ohne diese Rolle geht das Formular nicht. */
    requireRole: string | null;
}

export interface IApplyForm {
    id: number;
    guildId: string;
    name: string;
    description: string;
    emoji: string | null;
    /** Nimmt gerade Bewerbungen an. */
    open: boolean;
    questions: IApplyQuestion[];
    settings: IFormSettings;
    createdBy: string;
    createdAt: number;
    updatedAt: number;
}

export interface IApplyAnswer {
    id: string;
    value: string;
}

export interface IApplySubmission {
    id: number;
    formId: number;
    guildId: string;
    userId: string;
    userName: string;
    answers: IApplyAnswer[];
    status: ApplyStatus;
    note: string | null;
    decidedBy: string | null;
    decidedName: string | null;
    decidedAt: number | null;
    messageId: string | null;
    /** Der eigene Kanal dieser Bewerbung (Plan 30). null: die Karte liegt im Sammelkanal. */
    channelId: string | null;
    createdAt: number;
}

/** Wo man sich bewirbt: auf der Webseite, in einem Fenster in Discord oder per DM. */
export type ApplyMode = "web" | "modal" | "dm";

/** Das Panel in Discord, falls gesendet. Schreibt nur der Bot. */
export interface IApplyPanel {
    channelId: string | null;
    messageId: string | null;
}

/** Wo die Karte landet (Plan 30): im Sammelkanal wie bisher oder in einem eigenen Kanal je Bewerbung. */
export type ApplyTarget = "shared" | "channel";

/** Was nach der Entscheidung mit dem eigenen Kanal passiert. */
export type AfterDecision = "delete" | "close" | "keep";

/** Was im Modul gilt - eine Zeile je Server in module_settings. */
export interface IApplySettings {
    /** Wo man sich bewirbt. Gilt für alle Formulare. */
    mode: ApplyMode;
    panel: IApplyPanel;
    /** Wer Bewerbungen sehen und entscheiden darf. */
    reviewRoles: string[];
    reviewUsers: string[];
    /** Der Kanal für die Karten, wenn ein Formular keinen eigenen hat. */
    channelId: string | null;
    /** Bewerbungen werden angenommen, auf jedem Weg. */
    open: boolean;
    target: ApplyTarget;
    /** Kategorie für die eigenen Kanäle. null: ganz oben. */
    categoryId: string | null;
    /** Name des eigenen Kanals mit {user}, {nummer} und {formular}. */
    channelName: string;
    afterDecision: AfterDecision;
}
