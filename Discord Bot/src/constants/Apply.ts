import { DASHBOARD_PATH } from "./Dashboard";
import { AfterDecision, ApplyMode, ApplyStatus, ApplyTarget, IApplyForm, IApplyQuestion, IApplySettings, IFormSettings, QuestionKind } from "../interfaces/services/apply/IApply";

/**
 * Apply System: Grenzen, Vorgaben und die Beschriftungen. Siehe docs/Apply.md.
 */
export const APPLY_MODULE = "apply";

/** Der Anfang der Custom-IDs: apply:ja:<bewerbung> und apply:nein:<bewerbung>. */
export const APPLY_PREFIX = "apply";

/**
 * Der Anfang der IDs für alles, was zum Bewerben in Discord gehört (Panel,
 * Fenster, DM). Ein eigener Anfang, damit nichts davon als Entscheidung gilt.
 */
export const APPLY_FLOW_PREFIX = "applyflow";

export const APPLY_MODES: readonly ApplyMode[] = ["web", "modal", "dm"];

/** Grenzen von Discord für ein Fenster (Modal). */
export const MODAL_FIELDS = 5;
export const MODAL_TITLE = 45;
export const MODAL_LABEL = 45;
export const MODAL_TEXT = 100;

/** Bis zu so vielen Formularen hat das Panel je einen Knopf, darüber ein Menü. */
export const PANEL_SECTIONS = 5;

/** So lange bleibt eine halbe Bewerbung liegen, gerechnet ab der letzten Aktivität. */
export const DRAFT_TTL = 30 * 60_000;

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

/** Wer ohne Prüferrecht an eine Bewerbung will - an der Karte und im Dashboard (Plan 30). */
export const STAFF_ONLY = "Bewerbungen werden nur vom Staff Team gesehen und bearbeitet.";

/** Die Bestätigung nach dem Abschicken, auf jedem Weg gleich (Plan 30). */
export const RECEIVED = "Deine Bewerbung ist bei uns eingegangen. Das Staff Team wird sich bei dir melden.";

/** Die Pause nach einer Absage. free: ab wann es wieder geht, in Millisekunden. */
export function CooldownText(days: number, free: number): string {
    return `Nach einer Absage kannst du es in ${days} Tagen neu versuchen – du kannst es ab <t:${Math.floor(free / 1000)}:D> wieder versuchen.`;
}

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

export const APPLY_TARGETS: readonly ApplyTarget[] = ["shared", "channel"];
export const AFTER_DECISIONS: readonly AfterDecision[] = ["delete", "close", "keep"];

/** So heißt ein eigener Kanal, wenn der Server nichts anderes einstellt. */
export const DEFAULT_CHANNEL_NAME = "bewerbung-{user}";
export const MAX_CHANNEL_NAME = 100;

export function DefaultApplySettings(): IApplySettings {
    return {
        mode: "web",
        panel: { channelId: null, messageId: null },
        reviewRoles: [],
        reviewUsers: [],
        channelId: null,
        open: true,
        // Plan 30: ab Werk wie bisher - die Karte geht in den Sammelkanal.
        target: "shared",
        categoryId: null,
        channelName: DEFAULT_CHANNEL_NAME,
        afterDecision: "close",
    };
}

/**
 * Der Name eines eigenen Kanals: Platzhalter einsetzen, dann so, wie Discord
 * Textkanäle schreibt - klein, ohne Leer- und Sonderzeichen. Bleibt nichts
 * übrig, heißt er nach der Nummer.
 */
export function ChannelName(pattern: string, input: { user: string; id: number; form: string }): string {
    const name = pattern
        .replace(/\{user\}/g, input.user)
        .replace(/\{nummer\}/g, String(input.id))
        .replace(/\{formular\}/g, input.form)
        .toLowerCase()
        .replace(/[^\p{L}\p{N}_-]+/gu, "-")
        .replace(/-+/g, "-")
        .slice(0, MAX_CHANNEL_NAME)
        // Erst nach dem Kürzen: fällt der Schnitt auf einen Bindestrich, soll er nicht am Ende stehen.
        .replace(/^-+|-+$/g, "");

    return name || `bewerbung-${input.id}`;
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
