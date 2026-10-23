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
    createdAt: number;
}

/** Was im Modul gilt - eine Zeile je Server in module_settings. */
export interface IApplySettings {
    /** Wer Bewerbungen sehen und entscheiden darf. */
    reviewRoles: string[];
    reviewUsers: string[];
    /** Der Kanal für die Karten, wenn ein Formular keinen eigenen hat. */
    channelId: string | null;
    /** Der öffentliche Link steht offen. */
    open: boolean;
}
