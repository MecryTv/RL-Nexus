/**
 * Prüft das Apply System ohne Discord: Formulare säubern, Antworten prüfen und
 * die Karte bauen, die im Team-Kanal landet.
 *
 *   npm run check:apply
 *
 * Ob die DM ankommt und ob jemand wirklich klickt, sieht nur ein echter Server.
 */
process.env.CLIENT_SECRET ||= "check-secret";
process.env.DEV_CLIENT_SECRET ||= "check-secret";

import { ChannelType, Guild, GuildBasedChannel, Role } from "discord.js";
import { ApplyCard } from "../builder/ApplyView";
import BotClient from "../client/BotClient";
import { ApplyLink, DefaultApplySettings, DefaultForm, MAX_CHOICES, MAX_QUESTIONS, MAX_REVIEWERS, NextQuestionId } from "../constants/Apply";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import { IApplyForm, IApplySubmission } from "../interfaces/services/apply/IApply";
import { ApplyError } from "../services/ApplyService";

const GUILD = "90071992547409941";
const TEXT = "90071992547409942";
const VOICE = "90071992547409943";
const ROLE = "90071992547409944";

let failures = 0;

function check(name: string, passed: boolean, detail = ""): void {
    if (!passed) failures++;

    console.log(`  ${passed ? "ok  " : "FAIL"} ${name}${passed || !detail ? "" : `  → ${detail}`}`);
}

/** Muss die Aktion abbrechen? Ein anderer Fehler wäre auch einer. */
function refuses(name: string, action: () => unknown): void {
    try {
        action();
        check(name, false, "ging durch");
    } catch (error) {
        check(name, error instanceof ApplyError, String(error));
    }
}

function FakeGuild(): Guild {
    const channel = (id: string, type: ChannelType) =>
        ({ id, type, name: `kanal-${id.slice(-2)}`, isTextBased: () => type === ChannelType.GuildText }) as unknown as GuildBasedChannel;

    return {
        id: GUILD,
        name: "Dev Server",
        channels: { cache: new Map([[TEXT, channel(TEXT, ChannelType.GuildText)], [VOICE, channel(VOICE, ChannelType.GuildVoice)]]) },
        roles: { cache: new Map([[ROLE, { id: ROLE, name: "Team" } as Role], [GUILD, { id: GUILD, name: "@everyone" } as Role]]) },
    } as unknown as Guild;
}

/* ----------------------------------------------------------
   Vorgaben
   ---------------------------------------------------------- */
function checkDefaults(): void {
    console.log("\n  — Vorgaben —");

    const fresh = DefaultForm();
    const settings = DefaultApplySettings();

    check("Ein frisches Formular hat Fragen", fresh.questions.length > 0);
    check("Und keine zwei mit derselben ID", new Set(fresh.questions.map((one) => one.id)).size === fresh.questions.length);
    check("Eine Auswahl hat auch Möglichkeiten", fresh.questions.filter((one) => one.kind === "choice").every((one) => one.choices.length > 0));
    check("Ab Werk nimmt der Server Bewerbungen an", settings.open);
    check("Aber niemand steht als Prüfer drin", settings.reviewRoles.length === 0 && settings.reviewUsers.length === 0);
    check("Die nächste Frage-ID ist frei", !fresh.questions.some((one) => one.id === NextQuestionId(fresh.questions)), NextQuestionId(fresh.questions));
    check(
        "Der Link zeigt auf den Server",
        ApplyLink("https://dash.example", GUILD) === `https://dash.example${DASHBOARD_PATH}/bewerben/${GUILD}`,
        ApplyLink("https://dash.example", GUILD)
    );
}

/* ----------------------------------------------------------
   Formulare
   ---------------------------------------------------------- */
function checkForm(client: BotClient): IApplyForm {
    console.log("\n  — Ein Formular säubern —");

    const guild = FakeGuild();
    const service = client.applyService;
    const clean = service.CleanForm(guild, {
        name: `  Moderator  ${"x".repeat(200)}`,
        description: "Wir suchen Verstärkung.",
        emoji: " 🛡️ ",
        questions: [
            { id: "q1", label: "  Wie heißt du?  ", hint: "Vorname reicht", kind: "short", required: true },
            { id: "q1", label: "Doppelte ID", kind: "short" },
            { id: "q2", label: "", kind: "long" },
            { id: "q3", label: "Wie viel Zeit hast du?", kind: "choice", choices: ["Viel", "Viel", " ", "Wenig"] },
            { id: "q4", label: "Auswahl ohne Möglichkeiten", kind: "choice", choices: [] },
            { id: "q5", label: "Erzähl mal", kind: "long", required: false, max: 99_999 },
        ],
        settings: { channelId: VOICE, acceptRole: ROLE, pingRoles: [ROLE, GUILD, ROLE], dm: false, cooldownDays: 999, minAccountDays: -5, requireRole: "999" },
    });

    check("Der Name wird gekürzt", clean.name.length === 80, String(clean.name.length));
    check("Das Emoji bleibt ohne Leerzeichen", clean.emoji === "🛡️", String(clean.emoji));
    check("Doppelte Frage-IDs fallen weg", clean.questions.filter((one) => one.id === "q1").length === 1);
    check("Fragen ohne Beschriftung auch", !clean.questions.some((one) => one.label === ""));
    check("Eine Auswahl ohne Möglichkeiten auch", !clean.questions.some((one) => one.id === "q4"));
    check("Doppelte Möglichkeiten fallen weg", clean.questions.find((one) => one.id === "q3")?.choices.join(",") === "Viel,Wenig");
    check("Die Höchstlänge ist gedeckelt", clean.questions.find((one) => one.id === "q5")?.max === 1024);
    check("Freiwillig bleibt freiwillig", clean.questions.find((one) => one.id === "q5")?.required === false);
    check("Ein Sprachkanal ist kein Ziel", clean.settings.channelId === null);
    check("Zu viele Tage werden gedeckelt", clean.settings.cooldownDays === 365, String(clean.settings.cooldownDays));
    check("Negative Tage werden angehoben", clean.settings.minAccountDays === 0);
    check("Doppelte Ping-Rollen fallen weg", clean.settings.pingRoles.length === 1, clean.settings.pingRoles.join(","));
    check("Eine unbekannte Rolle fällt weg", clean.settings.requireRole === null);

    refuses("Ohne Namen geht es nicht", () => service.CleanForm(guild, { name: "   ", questions: clean.questions }));
    refuses("Ohne Fragen auch nicht", () => service.CleanForm(guild, { name: "Cutter", questions: [] }));

    const many = service.CleanForm(guild, {
        name: "Viele",
        questions: Array.from({ length: MAX_QUESTIONS + 10 }, (_, index) => ({ id: `f${index}`, label: `Frage ${index}`, kind: "short" })),
    });

    check("Die Zahl der Fragen ist gedeckelt", many.questions.length === MAX_QUESTIONS, String(many.questions.length));

    const choices = service.CleanForm(guild, {
        name: "Auswahl",
        questions: [{ id: "q1", label: "Was denn?", kind: "choice", choices: Array.from({ length: MAX_CHOICES + 5 }, (_, index) => `Punkt ${index}`) }],
    });

    check("Die Zahl der Möglichkeiten auch", choices.questions[0].choices.length === MAX_CHOICES, String(choices.questions[0].choices.length));

    return { id: 7, guildId: GUILD, createdBy: "1", createdAt: Date.now(), updatedAt: Date.now(), ...clean };
}

/* ----------------------------------------------------------
   Einstellungen des Moduls
   ---------------------------------------------------------- */
function checkSettings(client: BotClient): void {
    console.log("\n  — Prüfer und Kanal —");

    const guild = FakeGuild();
    const service = client.applyService;
    const clean = service.CleanSettings(
        guild,
        { reviewRoles: [ROLE, GUILD, ROLE, "999"], reviewUsers: ["123456789012345678", "keine-id", "123456789012345678"], channelId: TEXT, open: false },
        DefaultApplySettings()
    );

    check("@everyone ist keine Prüfer-Rolle", !clean.reviewRoles.includes(GUILD));
    check("Doppelte und unbekannte Rollen fallen weg", clean.reviewRoles.join(",") === ROLE, clean.reviewRoles.join(","));
    check("Nur echte IDs bleiben Prüfer", clean.reviewUsers.join(",") === "123456789012345678", clean.reviewUsers.join(","));
    check("Der Textkanal kommt an", clean.channelId === TEXT);
    check("Zu ist zu", clean.open === false);
    check("Ein Sprachkanal fällt weg", service.CleanSettings(guild, { channelId: VOICE }, DefaultApplySettings()).channelId === null);

    const many = service.CleanSettings(
        guild,
        { reviewUsers: Array.from({ length: MAX_REVIEWERS + 10 }, (_, index) => (100000000000000000n + BigInt(index)).toString()) },
        DefaultApplySettings()
    );

    check("Die Prüfer-Liste ist gedeckelt", many.reviewUsers.length === MAX_REVIEWERS, String(many.reviewUsers.length));
}

/* ----------------------------------------------------------
   Antworten
   ---------------------------------------------------------- */
function checkAnswers(client: BotClient, form: IApplyForm): void {
    console.log("\n  — Was abgeschickt wird —");

    const service = client.applyService;
    const full: Record<string, string> = {};

    for (const question of form.questions) full[question.id] = question.kind === "choice" ? question.choices[0] : `Antwort auf ${question.label}`;

    const answers = service.CleanAnswers(form, full);

    check("Jede Frage bekommt ihre Antwort", answers.length === form.questions.length, `${answers.length}/${form.questions.length}`);
    check("Die Antwort zeigt auf die Frage", answers.every((one) => form.questions.some((question) => question.id === one.id)));

    const required = form.questions.find((one) => one.required)!;
    const optional = form.questions.find((one) => !one.required)!;
    const choice = form.questions.find((one) => one.kind === "choice")!;

    refuses("Eine Pflichtfrage darf nicht leer sein", () => service.CleanAnswers(form, { ...full, [required.id]: "   " }));
    check("Eine freiwillige schon", service.CleanAnswers(form, { ...full, [optional.id]: "" }).length === form.questions.length - 1);
    refuses("Erfundene Auswahl fliegt raus", () => service.CleanAnswers(form, { ...full, [choice.id]: "Irgendwas" }));

    const long = service.CleanAnswers(form, { ...full, [required.id]: "a".repeat(5000) }).find((one) => one.id === required.id)!;

    check("Zu lange Antworten werden gekürzt", long.value.length === required.max, String(long.value.length));
    check("Unbekannte Felder kommen nicht mit", service.CleanAnswers(form, { ...full, geschmuggelt: "hallo" }).every((one) => one.id !== "geschmuggelt"));
}

/* ----------------------------------------------------------
   Die Karte in Discord
   ---------------------------------------------------------- */
function checkCard(client: BotClient, form: IApplyForm): void {
    console.log("\n  — Die Karte —");

    const submission: IApplySubmission = {
        id: 42,
        formId: form.id,
        guildId: GUILD,
        userId: "123456789012345678",
        userName: "Testkandidat",
        answers: form.questions.map((question) => ({ id: question.id, value: question.kind === "choice" ? question.choices[0] : "Eine Antwort" })),
        status: "open",
        note: null,
        decidedBy: null,
        decidedName: null,
        decidedAt: null,
        messageId: null,
        createdAt: Date.now(),
    };

    const open = ApplyCard(client, form, submission);
    const json = JSON.stringify(open.components);

    check("Die Karte ist Components V2", ((open.flags as number) & 32_768) !== 0, String(open.flags));
    check("Annehmen und Ablehnen liegen darin", json.includes("apply:ja:42") && json.includes("apply:nein:42"));
    check("Der Weg ins Dashboard auch", json.includes(`/guild/${GUILD}/apply`));
    check("Die Antworten stehen drin", json.includes("Eine Antwort"));

    const doneJson = JSON.stringify(ApplyCard(client, form, { ...submission, status: "accepted", decidedBy: "1", decidedName: "Chef", note: "Willkommen" }).components);

    check("Nach der Entscheidung sind die Knöpfe weg", !doneJson.includes("apply:ja:42"));
    check("Stattdessen steht dort das Ergebnis", doneJson.includes("Angenommen") && doneJson.includes("Willkommen"));

    const wordy = { ...submission, answers: form.questions.map((question) => ({ id: question.id, value: "z".repeat(1024) })) };
    const cut = JSON.stringify(ApplyCard(client, form, wordy).components);

    check("Lange Antworten sprengen die Karte nicht", cut.length < 6000, String(cut.length));
}

async function main(): Promise<void> {
    console.log("\n📋  Apply System\n");

    const client = new BotClient();

    checkDefaults();

    const form = checkForm(client);

    checkSettings(client);
    checkAnswers(client, form);
    checkCard(client, form);

    console.log(failures === 0 ? "\n✅ Alle Prüfungen bestanden.\n" : `\n❌ ${failures} Prüfung(en) fehlgeschlagen.\n`);

    process.exit(failures > 0 ? 1 : 0);
}

void main();
