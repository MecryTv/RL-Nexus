import { ILftBody, ILftDm, ILftNotice, ILftPanel, ILftQuestion, ILftSettings, ILftSide, LftAsk, LftKind, LftQuestionKind } from "../interfaces/services/lft/ILft";

/**
 * Looking for: Grenzen, Vorgaben und Beschriftungen. Siehe docs/LookingFor.md.
 */
export const LFT_MODULE = "lft";

/**
 * Der Anfang der Custom-IDs. Die Knöpfe am Beitrag und an der Meldung müssen
 * einen Neustart überleben - deshalb tragen sie die ID der Anfrage:
 *   lf:close:<anfrage>   Suche beenden
 *   lf:kill:<anfrage>    Beitrag löschen
 * Die Knöpfe und Menüs im Gespräch laufen ohne Prefix: sie warten am offenen
 * Gespräch und sind mit ihm zu Ende.
 */
export const LFT_PREFIX = "lf";

/**
 * Plan 30: die Knöpfe und Fenster beim Fragen im Fenster. Sie tragen die ID
 * des Entwurfs - nach einem Neustart sind sie abgelaufen:
 *   lfflow:modal:<entwurf>:<teil>   ein Teil der Fragen
 *   lfflow:next:<entwurf>           weiter zum nächsten Teil
 *   lfflow:retry:<entwurf>          denselben Teil noch einmal
 *   lfflow:cancel:<entwurf>         abbrechen
 */
export const LFT_FLOW_PREFIX = "lfflow";

/** So lange bleiben halbe Antworten im Fenster liegen, ab der letzten Aktivität. */
export const LFT_DRAFT_TTL = 30 * 60_000;

export const LFT_ACCENT = "#00afff";

export const MAX_QUESTIONS = 15;
export const MAX_CHOICES = 10;
export const MAX_LABEL = 200;
export const MAX_HINT = 200;
export const MAX_ANSWER = 1024;
export const MAX_TITLE = 100;
export const MAX_TAG_NAME = 20;
export const MAX_MANAGERS = 5;
export const MAX_PINGS = 5;
/** Höchste Laufzeit einer Suche in Tagen. */
export const MAX_EXPIRE = 180;

/** Wie viele Anfragen eine Liste im Dashboard auf einmal zeigt. */
export const PAGE_SIZE = 20;

/** So lange wartet der Bot auf eine Antwort in der DM. */
export const ANSWER_TIMEOUT = 10 * 60 * 1000;

/** So lange steht die Vorschau, bevor das Gespräch verfällt. */
export const CONFIRM_TIMEOUT = 15 * 60 * 1000;

/** So oft darf eine zu lange Antwort noch einmal kommen. */
export const MAX_RETRIES = 3;

/** Wer eine freiwillige Frage überspringen will, schreibt das. */
export const SKIP_WORDS = ["-", "skip", "überspringen", "weiter", "keine angabe"];

export const CANCEL_WORDS = ["abbrechen", "cancel", "stop", "abbruch"];

export const KINDS: LftKind[] = ["player", "team"];

/** Wie die beiden Seiten heißen - in Discord und im Dashboard dasselbe Wort. */
export const KIND_LABELS: Record<LftKind, string> = {
    player: "Spieler-Suche",
    team: "Team-Suche",
};

/** Ein Satz dazu, wer hier sucht. */
export const KIND_LEADS: Record<LftKind, string> = {
    player: "Ein Spieler sucht ein Team",
    team: "Ein Team sucht Spieler",
};

export const QUESTION_LABELS: Record<LftQuestionKind, string> = {
    short: "Kurze Antwort",
    long: "Langer Text",
    choice: "Auswahl",
};

export const STATUS_LABELS = { open: "Läuft", closed: "Beendet" } as const;

/* ----------------------------------------------------------
   Platzhalter
   ---------------------------------------------------------- */
/**
 * Die festen Platzhalter je Nachricht. Dazu kommen die beweglichen: je Frage
 * ein {frageN} und ein {antwortN}, die aus den Fragen selbst entstehen -
 * deshalb steht die Liste im Dashboard nicht fest (siehe GuildLft.ts).
 *
 * Das Dashboard führt dieselben Schlüssel mit Beschriftung und Beispielwert
 * (src/dashboard/client/constants/Placeholders.ts); npm run check:lft
 * vergleicht beide Listen.
 */
export const LFT_POST_KEYS = [
    "user",
    "user.name",
    "user.id",
    "user.avatar",
    "guild",
    "guild.id",
    "guild.icon",
    "art",
    "antworten",
    "antworten.kurz",
    "erstellt",
] as const;

/** Die Vorschau kennt zusätzlich den Titel, den der Beitrag bekommen wird. */
export const LFT_PREVIEW_KEYS = [...LFT_POST_KEYS, "post.titel", "forum"] as const;

/** Die Begrüßung in der DM - Antworten gibt es dort noch nicht. */
export const LFT_INTRO_KEYS = ["user", "user.name", "user.avatar", "guild", "guild.icon", "art", "fragen.anzahl", "forum"] as const;

/** Eine einzelne Frage. */
export const LFT_QUESTION_KEYS = [
    "user.name",
    "guild",
    "art",
    "frage",
    "frage.hinweis",
    "frage.nummer",
    "frage.pflicht",
    "fragen.anzahl",
] as const;

/** Die letzte Nachricht in der DM, wenn der Beitrag steht. */
export const LFT_DONE_KEYS = ["user", "user.name", "guild", "art", "antworten", "post.titel", "post.url", "forum"] as const;

/** Die Meldung ans Team. */
export const LFT_NOTICE_KEYS = [
    "user",
    "user.name",
    "user.id",
    "user.avatar",
    "guild",
    "guild.id",
    "guild.icon",
    "art",
    "antworten",
    "antworten.kurz",
    "post.titel",
    "post.url",
    "forum",
    "erstellt",
] as const;

/** Das Panel im Forum (Plan 30) - es gehört niemandem, deshalb nur der Server. */
export const LFT_PANEL_KEYS = ["guild", "guild.id", "guild.icon"] as const;

export const LFT_ASKS: readonly LftAsk[] = ["dm", "modal"];

/** Die Knöpfe unter dem Panel, je Seite einer. Fest, damit jeder sofort weiß, welcher seiner ist. */
export const PANEL_BUTTONS: Record<LftKind, { label: string; emoji: string }> = {
    player: { label: "Ich suche ein Team", emoji: "🔎" },
    team: { label: "Wir suchen Spieler", emoji: "📣" },
};

/** Was als Bildquelle taugt - beide ergeben eine Adresse. */
export const LFT_IMAGES = ["{user.avatar}", "{guild.icon}"] as const;

/* ----------------------------------------------------------
   Vorgaben
   ---------------------------------------------------------- */
function card(accent: string, ...blocks: string[]): ILftBody {
    return {
        kind: "v2",
        content: "",
        embed: null,
        doc: {
            accent,
            blocks: blocks.map((body) => (body === "---" ? { type: "separator" as const, line: true } : { type: "text" as const, body })),
        },
    };
}

/** Die Fragen, mit denen eine Spieler-Suche anfängt. */
export function DefaultPlayerQuestions(): ILftQuestion[] {
    return [
        { id: "q1", label: "Welchen Rang hast du – aktuell und als Peak?", hint: "Zum Beispiel: Champ 1 Div 2, Peak Champ 2", kind: "short", choices: [], required: true, max: 200 },
        { id: "q2", label: "Auf welcher Plattform spielst du?", hint: "", kind: "choice", choices: ["PC", "PlayStation", "Xbox", "Nintendo Switch"], required: true, max: 100 },
        { id: "q3", label: "Wann kannst du meistens spielen?", hint: "Tage und Uhrzeiten reichen", kind: "short", choices: [], required: true, max: 200 },
        { id: "q4", label: "Welche Position liegt dir am besten?", hint: "", kind: "choice", choices: ["Ist mir gleich", "Striker", "Midfield", "Defender"], required: true, max: 100 },
        { id: "q5", label: "Was suchst du in einem Team?", hint: "Ziele, Turniere, wie viel Training – ein paar Sätze", kind: "long", choices: [], required: true, max: 1024 },
        { id: "q6", label: "Wie heißt du bei Epic?", hint: "Für den Tracker – freiwillig", kind: "short", choices: [], required: false, max: 100 },
    ];
}

/** Die Fragen, mit denen eine Team-Suche anfängt. */
export function DefaultTeamQuestions(): ILftQuestion[] {
    return [
        { id: "q1", label: "Wie heißt euer Team?", hint: "Name und Kürzel", kind: "short", choices: [], required: true, max: 100 },
        { id: "q2", label: "Wen sucht ihr?", hint: "", kind: "choice", choices: ["Stammspieler", "Ersatzspieler", "Coach", "Manager"], required: true, max: 100 },
        { id: "q3", label: "Welchen Rang sollte er mitbringen?", hint: "Von – bis", kind: "short", choices: [], required: true, max: 200 },
        { id: "q4", label: "Wann und wie oft trainiert ihr?", hint: "", kind: "short", choices: [], required: true, max: 200 },
        { id: "q5", label: "Was bietet ihr – und was habt ihr vor?", hint: "Turniere, Coach, Ziele für die Season", kind: "long", choices: [], required: true, max: 1024 },
    ];
}

/** Der Beitrag im Forum, wie er ab Werk aussieht. */
export function DefaultPost(kind: LftKind): ILftBody {
    return kind === "player"
        ? card(
              LFT_ACCENT,
              "## 🔎 {user.name} sucht ein Team",
              "-# {user} · {erstellt}",
              "---",
              "{antworten}",
              "---",
              "-# Interesse? Schreib direkt hier in den Beitrag oder {user} eine Nachricht."
          )
        : card(
              "#ff1e2d",
              "## 📣 {antwort1} sucht Spieler",
              "-# {user} · {erstellt}",
              "---",
              "{antworten}",
              "---",
              "-# Interesse? Schreib direkt hier in den Beitrag oder {user} eine Nachricht."
          );
}

/** Die Vorschau in der DM, bevor abgeschickt wird. */
export function DefaultPreview(): ILftBody {
    return card(
        LFT_ACCENT,
        "## 📋 Passt das so?",
        "So kommt dein Beitrag ins Forum – Titel: **{post.titel}**",
        "---",
        "{antworten}",
        "---",
        "-# „Abschicken“ stellt ihn in {forum}. „Abbrechen“ wirft alles weg – dann war es das, und du kannst neu anfangen."
    );
}

export function DefaultDm(): ILftDm {
    return {
        intro: card(
            LFT_ACCENT,
            "## 🔎 {art}",
            "Ich stelle dir jetzt **{fragen.anzahl} Fragen**. Antworte einfach hier im Chat – eine Nachricht je Frage.",
            "---",
            "-# Schreib **abbrechen**, wenn du aussteigen willst. Freiwillige Fragen überspringst du mit **-**."
        ),
        question: card(LFT_ACCENT, "### Frage {frage.nummer} von {fragen.anzahl}\n{frage}{frage.hinweis}"),
        done: card(
            "#3ba55c",
            "## ✅ Dein Beitrag steht",
            "[{post.titel}]({post.url}) – ab jetzt sichtbar in {forum}.",
            "---",
            "-# Fertig mit der Suche? Der Knopf unter deinem Beitrag beendet sie, oder du nimmst `/lookingfor beenden`."
        ),
    };
}

export function DefaultNotice(): ILftNotice {
    return {
        channelId: null,
        roles: [],
        body: card(
            LFT_ACCENT,
            "## 🔎 Neue {art}",
            "{user} hat gerade eine Anfrage erstellt: [{post.titel}]({post.url})",
            "---",
            "{antworten.kurz}"
        ),
    };
}

export function DefaultSide(kind: LftKind): ILftSide {
    return {
        on: true,
        forumId: null,
        tag: {
            name: kind === "player" ? "Sucht Team" : "Sucht Spieler",
            emoji: kind === "player" ? "🔎" : "📣",
            id: null,
            closedId: null,
        },
        questions: kind === "player" ? DefaultPlayerQuestions() : DefaultTeamQuestions(),
        title: kind === "player" ? "🔎 {user.name} sucht ein Team" : "📣 {antwort1} sucht Spieler",
        post: DefaultPost(kind),
        preview: DefaultPreview(),
    };
}

/** Das Panel im Forum, wie es ab Werk aussieht (Plan 30). Die Knöpfe hängt der Bot an. */
export function DefaultPanel(): ILftPanel {
    return {
        forumId: null,
        title: "📌 Hier geht's los",
        body: card(
            LFT_ACCENT,
            "## 🔎 Looking for",
            "Du suchst ein Team oder ihr sucht Spieler? Klick unten auf den passenden Knopf. Ich stelle dir ein paar Fragen, danach steht dein Beitrag hier im Forum.",
            "---",
            "-# Geht auch mit `/lookingfor`"
        ),
        threadId: null,
        messageId: null,
    };
}

export function DefaultLftSettings(): ILftSettings {
    return {
        player: DefaultSide("player"),
        team: DefaultSide("team"),
        notice: DefaultNotice(),
        dm: DefaultDm(),
        // Plan 30: ab Werk wie bisher per DM.
        ask: "dm",
        panel: DefaultPanel(),
        expireDays: 30,
        manageRoles: [],
    };
}

/** Der Name des Tags für beendete Suchen - einer je Forum, für beide Seiten. */
export const CLOSED_TAG = { name: "Beendet", emoji: "🔒" } as const;

/** Eine Frage-ID, die es auf dieser Seite noch nicht gibt. */
export function NextQuestionId(questions: ILftQuestion[]): string {
    const taken = new Set(questions.map((question) => question.id));

    for (let index = 1; index <= MAX_QUESTIONS + 1; index++) {
        if (!taken.has(`q${index}`)) return `q${index}`;
    }

    return `q${Date.now()}`;
}
