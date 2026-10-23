import { DASHBOARD_PATH } from "./Dashboard";
import { ApplyStatus, IApplyForm, IApplyQuestion, IApplySettings, IFormSettings, QuestionKind } from "../interfaces/services/apply/IApply";

/**
 * Apply System: Grenzen, Vorgaben und die Beschriftungen. Siehe docs/Apply.md.
 */
export const APPLY_MODULE = "apply";

/** Der Anfang der Custom-IDs: apply:ja:<bewerbung> und apply:nein:<bewerbung>. */
export const APPLY_PREFIX = "apply";

export const MAX_FORMS = 15;
export const MAX_QUESTIONS = 20;
export const MAX_CHOICES = 10;
export const MAX_NAME = 80;
export const MAX_LABEL = 200;
export const MAX_HINT = 200;
export const MAX_DESCRIPTION = 1000;
export const MAX_ANSWER = 1024;
export const MAX_NOTE = 500;
export const MAX_REVIEWERS = 15;

/** Wie viele Bewerbungen eine Liste auf einmal zeigt. */
export const PAGE_SIZE = 25;

export const KIND_LABELS: Record<QuestionKind, string> = {
    short: "Kurze Antwort",
    long: "Langer Text",
    choice: "Auswahl",
};

export const STATUS_LABELS: Record<ApplyStatus, string> = {
    open: "Offen",
    accepted: "Angenommen",
    declined: "Abgelehnt",
};

export function DefaultFormSettings(): IFormSettings {
    return {
        channelId: null,
        acceptRole: null,
        pingRoles: [],
        dm: true,
        cooldownDays: 30,
        minAccountDays: 0,
        requireRole: null,
    };
}

export function DefaultApplySettings(): IApplySettings {
    return { reviewRoles: [], reviewUsers: [], channelId: null, open: true };
}

/** Die Fragen, mit denen ein frisches Formular anfängt. */
export function DefaultQuestions(): IApplyQuestion[] {
    return [
        { id: "q1", label: "Wie heißt du und wie alt bist du?", hint: "Vorname reicht", kind: "short", choices: [], required: true, max: 200 },
        { id: "q2", label: "Warum willst du das machen?", hint: "Ein paar Sätze genügen", kind: "long", choices: [], required: true, max: 1024 },
        { id: "q3", label: "Wie viel Zeit hast du in der Woche?", hint: "", kind: "choice", choices: ["Unter 5 Stunden", "5 bis 10 Stunden", "Mehr als 10 Stunden"], required: true, max: 200 },
    ];
}

export function DefaultForm(): Pick<IApplyForm, "name" | "description" | "emoji" | "open" | "questions" | "settings"> {
    return {
        name: "",
        description: "",
        emoji: null,
        open: true,
        questions: DefaultQuestions(),
        settings: DefaultFormSettings(),
    };
}

/** Eine neue Frage-ID, die es im Formular noch nicht gibt. */
export function NextQuestionId(questions: IApplyQuestion[]): string {
    const taken = new Set(questions.map((question) => question.id));

    for (let index = 1; index <= MAX_QUESTIONS + 1; index++) {
        if (!taken.has(`q${index}`)) return `q${index}`;
    }

    return `q${Date.now()}`;
}

/** Die Adresse, unter der sich jemand bewerben kann. Im Dev-Modus mit Praefix. */
export function ApplyLink(base: string, guildId: string): string {
    return `${base}${DASHBOARD_PATH}/bewerben/${guildId}`;
}
