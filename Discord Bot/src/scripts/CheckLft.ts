/**
 * Prüft Looking for ohne Discord und ohne Datenbank: das Säubern der
 * Einstellungen, die Platzhalter je Nachricht und die Knöpfe, die der Bot an
 * seine Nachrichten hängt.
 *
 *   npm run check:lft
 *
 * Ob Discord den Beitrag wirklich anlegt, sieht nur ein echter Server - die
 * Tags im Forum gehören dazu.
 */
process.env.CLIENT_SECRET ||= "check-secret";
process.env.DEV_CLIENT_SECRET ||= "check-secret";

import path from "path";
import { existsSync } from "fs";
import { ChannelType, Guild, GuildBasedChannel, Role } from "discord.js";
import BotClient from "../client/BotClient";
import { AnswersText, ChoiceRow, CloseRow, ConfirmRow, LftRender, LftValues, STEP_CANCEL, STEP_PICK, STEP_SEND } from "../builder/LftView";
import { Fill } from "../constants/Placeholders";
import {
    CLOSED_TAG,
    DefaultLftSettings,
    DefaultPlayerQuestions,
    LFT_DONE_KEYS,
    LFT_INTRO_KEYS,
    LFT_NOTICE_KEYS,
    LFT_POST_KEYS,
    LFT_PREVIEW_KEYS,
    LFT_QUESTION_KEYS,
    MAX_EXPIRE,
    MAX_QUESTIONS,
    MAX_TAG_NAME,
} from "../constants/Lft";
import { ILftAnswer, ILftQuestion, ILftSettings } from "../interfaces/services/lft/ILft";
import { LftError } from "../services/LookingForService";

const GUILD = "90071992547409961";
const FORUM = "90071992547409962";
const TEXT = "90071992547409963";
const VOICE = "90071992547409964";
const ROLE = "90071992547409965";
const USER = "90071992547409966";

let failures = 0;

function check(name: string, passed: boolean, detail = ""): void {
    if (!passed) failures++;

    console.log(`  ${passed ? "ok  " : "FAIL"} ${name}${passed || !detail ? "" : `  → ${detail}`}`);
}

function refuses(name: string, action: () => unknown): void {
    try {
        action();
        check(name, false, "ging durch");
    } catch (error) {
        check(name, error instanceof LftError, String(error));
    }
}

function FakeGuild(): Guild {
    const channel = (id: string, type: ChannelType) =>
        ({
            id,
            type,
            name: `kanal-${id.slice(-2)}`,
            isTextBased: () => type === ChannelType.GuildText || type === ChannelType.GuildForum,
            isThread: () => false,
        }) as unknown as GuildBasedChannel;

    return {
        id: GUILD,
        name: "Dev Server",
        channels: {
            cache: new Map([
                [FORUM, channel(FORUM, ChannelType.GuildForum)],
                [TEXT, channel(TEXT, ChannelType.GuildText)],
                [VOICE, channel(VOICE, ChannelType.GuildVoice)],
            ]),
        },
        roles: {
            cache: new Map([
                [ROLE, { id: ROLE, name: "Team" } as Role],
                [GUILD, { id: GUILD, name: "@everyone" } as Role],
            ]),
        },
        iconURL: () => null,
    } as unknown as Guild;
}

function Answers(): ILftAnswer[] {
    return [
        { id: "q1", label: "Welchen Rang hast du?", value: "Champ 1 Div 2" },
        { id: "q2", label: "Plattform", value: "PC" },
        { id: "q4", label: "Position", value: "Striker\nund Midfield" },
    ];
}

/* ----------------------------------------------------------
   Einstellungen
   ---------------------------------------------------------- */
function checkClean(client: BotClient): void {
    console.log("\n  — Foren und Tags —");

    const guild = FakeGuild();
    const service = client.lookingForService;
    const base = DefaultLftSettings();
    const clean = service.CleanSettings(guild, { player: { forumId: FORUM, tag: { name: "Sucht ein Team ganz dringend", emoji: "🔎", id: "999", closedId: "999" } } }, base);

    check("Ein Forum kommt an", clean.player.forumId === FORUM);
    check("Der Tag-Name wird gekappt", clean.player.tag.name.length === MAX_TAG_NAME, clean.player.tag.name);
    check("Die Tag-IDs kommen nicht vom Dashboard", clean.player.tag.id === null && clean.player.tag.closedId === null);
    check("Die andere Seite bleibt unberührt", clean.team.forumId === base.team.forumId && clean.team.questions.length === base.team.questions.length);

    const wrong = service.CleanSettings(guild, { player: { forumId: TEXT }, team: { forumId: VOICE } }, base);

    check("Ein Textkanal taugt nicht als Forum", wrong.player.forumId === null);
    check("Ein Sprachkanal auch nicht", wrong.team.forumId === null);

    console.log("\n  — Nur der eigene Teil wird gespeichert —");

    // Die Seiten im Dashboard schicken nur, was sie zeigen. Alles andere muss
    // stehen bleiben - sonst löscht die eine Seite die Arbeit der anderen.
    const partial = service.CleanSettings(guild, { player: { questions: [{ id: "q1", label: "Nur eine Frage", kind: "short" }] } }, base);

    check("Die Fragen kommen an", partial.player.questions.length === 1);
    check("Titel, Beitrag und Vorschau bleiben", partial.player.title === base.player.title && partial.player.post.doc.blocks.length === base.player.post.doc.blocks.length);
    check("Die Meldung und die DM bleiben", partial.notice.channelId === base.notice.channelId && partial.dm.intro.doc.blocks.length === base.dm.intro.doc.blocks.length);
    check("Ablauf und Rechte bleiben", partial.expireDays === base.expireDays);

    console.log("\n  — Fragen —");

    const questions = service.CleanSettings(
        guild,
        {
            player: {
                questions: [
                    { id: "q1", label: "  Mit Leerzeichen  ", kind: "long", max: 99_999 },
                    { id: "q1", label: "Dieselbe ID", kind: "short" },
                    { id: "q2", label: "", kind: "short" },
                    { id: "q3", label: "Auswahl ohne Auswahl", kind: "choice", choices: [] },
                    { id: "q4", label: "Auswahl", kind: "choice", choices: ["Eins", "Eins", "Zwei"] },
                    { id: "q5", label: "Freiwillig", kind: "short", required: false },
                ],
            },
        },
        base
    ).player.questions;

    check("Leerzeichen fallen weg", questions[0]?.label === "Mit Leerzeichen");
    check("Eine zu hohe Länge wird geklemmt", questions[0]?.max === 1024, String(questions[0]?.max));
    check("Eine doppelte ID fällt weg", questions.filter((entry) => entry.id === "q1").length === 1);
    check("Eine Frage ohne Text fällt weg", !questions.some((entry) => entry.id === "q2"));
    check("Eine Auswahl ohne Möglichkeiten fällt weg", !questions.some((entry) => entry.id === "q3"));
    check("Doppelte Möglichkeiten fallen weg", questions.find((entry) => entry.id === "q4")?.choices.join(",") === "Eins,Zwei");
    check("Freiwillig bleibt freiwillig", questions.find((entry) => entry.id === "q5")?.required === false);

    const many = service.CleanSettings(
        guild,
        { player: { questions: Array.from({ length: MAX_QUESTIONS + 5 }, (_, index) => ({ id: `q${index + 1}`, label: `Frage ${index + 1}`, kind: "short" })) } },
        base
    ).player.questions;

    check(`Mehr als ${MAX_QUESTIONS} Fragen gehen nicht`, many.length === MAX_QUESTIONS, String(many.length));

    refuses("Ohne Fragen geht es nicht", () => service.CleanSettings(guild, { player: { questions: [] } }, base));
    refuses("Ohne Titel auch nicht", () =>
        service.CleanSettings(guild, { player: { title: "   " } }, { ...base, player: { ...base.player, title: "" } } as ILftSettings)
    );
    refuses("Eine leere Nachricht weist er ab", () => service.CleanSettings(guild, { player: { post: { kind: "text", content: "" } } }, base));

    console.log("\n  — Meldung, Ablauf, Rechte —");

    const rest = service.CleanSettings(
        guild,
        { notice: { channelId: VOICE, roles: [ROLE, GUILD, ROLE, "123"] }, expireDays: 9999, manageRoles: [ROLE, ROLE, GUILD] },
        base
    );

    check("Die Meldung braucht einen Textkanal", rest.notice.channelId === null);
    check("@everyone wird nicht gepingt", !rest.notice.roles.includes(GUILD) && rest.notice.roles.join(",") === ROLE);
    check("Die Laufzeit wird geklemmt", rest.expireDays === MAX_EXPIRE, String(rest.expireDays));
    check("Doppelte Rollen fallen weg", rest.manageRoles.join(",") === ROLE);

    const text = service.CleanSettings(guild, { notice: { channelId: TEXT } }, base);

    check("Ein Textkanal geht", text.notice.channelId === TEXT);
}

/* ----------------------------------------------------------
   Platzhalter
   ---------------------------------------------------------- */
function checkValues(): void {
    console.log("\n  — Platzhalter —");

    const guild = FakeGuild();
    const questions = DefaultPlayerQuestions();
    const answers = Answers();
    const values = LftValues({
        guild,
        kind: "player",
        user: { id: USER, name: "Lara", avatar: "https://cdn.example/avatar.png" },
        questions,
        answers,
        forumId: FORUM,
        title: "🔎 Lara sucht ein Team",
        createdAt: 1_700_000_000_000,
    });

    check("Der Name steht drin", Fill("{user.name}", values) === "Lara");
    check("Die Erwähnung steht drin", Fill("{user}", values) === `<@${USER}>`);
    check("Die Art der Suche steht drin", Fill("{art}", values) === "Spieler-Suche");
    check("Das Forum wird erwähnt", Fill("{forum}", values) === `<#${FORUM}>`);

    // Der Grund für das erweiterte Muster in Fill(): eine Ziffer gehört zum
    // Namen des Platzhalters. Ohne sie bliebe {antwort1} stehen.
    check("Eine Antwort mit Nummer wird eingesetzt", Fill("{antwort1}", values) === "Champ 1 Div 2", Fill("{antwort1}", values));
    check("Die Frage mit Nummer auch", Fill("{frage2}", values) === questions[1].label, Fill("{frage2}", values));

    // q3 wurde übersprungen: die Nummer richtet sich nach den Fragen, nicht
    // nach den Antworten - sonst rutschte im Beitrag alles eine Zeile hoch.
    check("Eine übersprungene Frage lässt die Nummern stehen", Fill("{antwort3}", values) === "" && Fill("{antwort4}", values).startsWith("Striker"));
    check("Ein unbekannter Platzhalter bleibt stehen", Fill("{gibtesnicht}", values) === "{gibtesnicht}");
    check("Der Zeitpunkt läuft von allein weiter", Fill("{erstellt}", values) === "<t:1700000000:R>");

    const long = Fill("{antworten}", values);
    const short = Fill("{antworten.kurz}", values);

    check("Alle Antworten stehen mit ihrer Frage da", long.includes("**Plattform**") && long.includes("> PC"));
    check("Ein mehrzeiliger Text bleibt ein Zitat", long.includes("> Striker\n> und Midfield"));
    check("Die Kurzfassung ist eine Zeile je Frage", short.split("\n").length === answers.length && short.includes("Striker und Midfield"));
    check("Ohne Antworten bleibt die Liste nicht leer", AnswersText([]).includes("Keine"));

    const title = Fill("📣 {antwort1} sucht Spieler", LftValues({ guild, kind: "team", user: { id: USER, name: "Lara", avatar: "" }, answers: [{ id: "q1", label: "Team", value: "Vyrox" }] }));

    check("Die Titel-Vorlage nimmt die erste Antwort", title === "📣 Vyrox sucht Spieler", title);

    const step = LftValues({
        guild,
        kind: "player",
        user: { id: USER, name: "Lara", avatar: "" },
        questions,
        step: { question: questions[0], index: 0, total: questions.length },
    });

    check("Die Frage-Nachricht kennt ihre Nummer", Fill("{frage.nummer}/{fragen.anzahl}", step) === `1/${questions.length}`);
    check("Der Hinweis kommt fertig formatiert", Fill("{frage.hinweis}", step).startsWith("\n-# "));
    check("Pflicht steht als Wort da", Fill("{frage.pflicht}", step) === "Pflichtfrage");

    const plain: ILftQuestion = { id: "q9", label: "Ohne Hinweis", hint: "", kind: "short", choices: [], required: false, max: 200 };
    const bare = LftValues({ guild, kind: "player", user: { id: USER, name: "Lara", avatar: "" }, questions: [plain], step: { question: plain, index: 0, total: 1 } });

    check("Ohne Hinweis bleibt die Zeile leer", Fill("{frage.hinweis}", bare) === "");
    check("Freiwillig steht auch da", Fill("{frage.pflicht}", bare) === "freiwillig");
}

/* ----------------------------------------------------------
   Die Nachrichten
   ---------------------------------------------------------- */
async function checkViews(client: BotClient): Promise<void> {
    console.log("\n  — Nachrichten und Knöpfe —");

    const guild = FakeGuild();
    const settings = DefaultLftSettings();
    const values = LftValues({
        guild,
        kind: "player",
        user: { id: USER, name: "Lara", avatar: "" },
        questions: DefaultPlayerQuestions(),
        answers: Answers(),
        forumId: FORUM,
        title: "🔎 Lara sucht ein Team",
        url: "https://discord.com/channels/1/2",
    });

    const post = JSON.stringify((await LftRender(client, settings.player.post, values, [CloseRow(42)])).components[0].toJSON());

    check("Im Beitrag stehen die Antworten", post.includes("Champ 1 Div 2"));
    check("Der Beitrag trägt den Knopf zum Beenden", post.includes("lf:close:42"), post.slice(0, 120));
    check("Und keinen zum Löschen", !post.includes("lf:kill"));

    const preview = JSON.stringify((await LftRender(client, settings.player.preview, values, [ConfirmRow()])).components[0].toJSON());

    check("Die Vorschau zeigt den Titel", preview.includes("Lara sucht ein Team"));
    check("Sie hat beide Knöpfe", preview.includes(STEP_SEND) && preview.includes(STEP_CANCEL));

    const notice = JSON.stringify((await LftRender(client, settings.notice.body, values, [CloseRow(42, true)])).components[0].toJSON());

    check("Die Meldung verlinkt den Beitrag", notice.includes("https://discord.com/channels/1/2"));
    check("Sie kann beenden und löschen", notice.includes("lf:close:42") && notice.includes("lf:kill:42"));

    const choice = DefaultPlayerQuestions().find((entry) => entry.kind === "choice")!;
    const question = JSON.stringify(
        (
            await LftRender(
                client,
                settings.dm.question,
                LftValues({ guild, kind: "player", user: { id: USER, name: "Lara", avatar: "" }, questions: [choice], step: { question: choice, index: 1, total: 6 } }),
                [ChoiceRow(choice)]
            )
        ).components[0].toJSON()
    );

    check("Eine Auswahl-Frage bringt ihr Menü mit", question.includes(`${STEP_PICK}:${choice.id}`));
    check("Alle Möglichkeiten stehen darin", choice.choices.every((one) => question.includes(one)));

    const done = JSON.stringify((await LftRender(client, settings.dm.done, values)).components[0].toJSON());

    check("Der Abschluss verlinkt den Beitrag", done.includes("https://discord.com/channels/1/2"));
    check("Und hat keine Knöpfe", !done.includes("custom_id"));

    // Ein Embed und ein reiner Text müssen genauso durchgehen: das Dashboard
    // bietet alle drei Arten an.
    const embed = await LftRender(client, { kind: "embed", content: "", embed: { title: "{art}", description: "{antworten}", color: "#00afff", url: null, image: null, thumbnail: null, author: null, footer: null, timestamp: false, fields: [] }, doc: { blocks: [] } }, values, [CloseRow(7)]);

    check("Als Embed steht der Knopf darunter", JSON.stringify(embed.components).includes("lf:close:7"));
    check("Und der Text ist eingesetzt", JSON.stringify(embed.embeds?.[0]?.toJSON()).includes("Spieler-Suche"));

    const text = await LftRender(client, { kind: "text", content: "🔎 {user.name}: {antworten.kurz}", embed: null, doc: { blocks: [] } }, values, [ConfirmRow()]);

    check("Als reiner Text kommt der Inhalt an", text.content?.includes("Lara") === true, text.content);
    check("Auch dort hängen die Knöpfe", JSON.stringify(text.components).includes(STEP_SEND));
}

/* ----------------------------------------------------------
   Bot und Dashboard
   ---------------------------------------------------------- */
async function checkLists(): Promise<void> {
    console.log("\n  — Dieselben Platzhalter im Dashboard —");

    const { pathToFileURL } = await import("node:url");
    const file = path.join(process.cwd(), "src", "dashboard", "client", "constants", "Placeholders.ts");

    if (!existsSync(file)) return check("Die Liste des Dashboards ist da", false, file);

    const loaded = (await import(pathToFileURL(file).href)) as Record<string, { key: string }[] | string[] | undefined>;
    const pairs: [string, readonly string[], string][] = [
        ["Beitrag", LFT_POST_KEYS, "LFT_POST_PLACEHOLDERS"],
        ["Vorschau", LFT_PREVIEW_KEYS, "LFT_PREVIEW_PLACEHOLDERS"],
        ["Begrüßung", LFT_INTRO_KEYS, "LFT_INTRO_PLACEHOLDERS"],
        ["Frage", LFT_QUESTION_KEYS, "LFT_QUESTION_PLACEHOLDERS"],
        ["Abschluss", LFT_DONE_KEYS, "LFT_DONE_PLACEHOLDERS"],
        ["Meldung", LFT_NOTICE_KEYS, "LFT_NOTICE_PLACEHOLDERS"],
    ];

    for (const [label, keys, name] of pairs) {
        const list = (loaded[name] ?? []) as { key: string }[];
        const client = list.map((entry) => entry.key);
        const missing = keys.filter((key) => !client.includes(key));
        const extra = client.filter((key) => !keys.includes(key));

        check(`${label}: ${keys.length} Platzhalter, im Dashboard dieselben`, missing.length === 0 && extra.length === 0, `fehlt: ${missing.join(", ")} | zu viel: ${extra.join(", ")}`);
    }

    const images = (loaded.LFT_IMAGES ?? []) as string[];

    check("Die Bildquellen stimmen überein", images.length === 2 && images.includes("{user.avatar}"), images.join(", "));
}

async function main(): Promise<void> {
    console.log("\n🔎 Looking for\n");

    const client = new BotClient();

    check("Der Tag für beendete Suchen hat einen Namen", CLOSED_TAG.name.length > 0 && CLOSED_TAG.name.length <= MAX_TAG_NAME);

    checkClean(client);
    checkValues();
    await checkViews(client);
    await checkLists();

    console.log(failures === 0 ? "\n✅ Alle Prüfungen bestanden.\n" : `\n❌ ${failures} Prüfung(en) fehlgeschlagen.\n`);

    process.exit(failures > 0 ? 1 : 0);
}

void main();
