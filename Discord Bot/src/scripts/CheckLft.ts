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
import { ChannelType, Guild, GuildBasedChannel, GuildMember, Role } from "discord.js";
import BotClient from "../client/BotClient";
import { AnswersText, ChoiceRow, CloseRow, ConfirmRow, LftRender, LftValues, PanelRow, STEP_CANCEL, STEP_PICK, STEP_SEND } from "../builder/LftView";
import { Fill } from "../constants/Placeholders";
import {
    CLOSED_TAG,
    DefaultLftSettings,
    DefaultPlayerQuestions,
    KIND_LABELS,
    LFT_DONE_KEYS,
    LFT_INTRO_KEYS,
    LFT_NOTICE_KEYS,
    LFT_PANEL_KEYS,
    LFT_POST_KEYS,
    LFT_PREVIEW_KEYS,
    LFT_QUESTION_KEYS,
    MAX_EXPIRE,
    MAX_QUESTIONS,
    MAX_TAG_NAME,
} from "../constants/Lft";
import { ILftAnswer, ILftQuestion, ILftSettings } from "../interfaces/services/lft/ILft";
import { LftError } from "../services/LookingForService";
import { CleanLftAnswers } from "../services/LftModal";
import { ModalParts, ModalTitle } from "../services/ApplyFlow";

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

/** Wie refuses, nur für async. */
async function rejects(name: string, action: () => Promise<unknown>): Promise<void> {
    try {
        await action();
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
    check("Wie gefragt wird und das Panel bleiben", partial.ask === base.ask && partial.panel.title === base.panel.title);

    console.log("\n  — Panel und wie gefragt wird (Plan 30) —");

    check("Ab Werk per DM", base.ask === "dm");
    check("Ab Werk kein Panel im Forum", base.panel.threadId === null && base.panel.forumId === null);

    const stored = { ...base, panel: { ...base.panel, threadId: "111", messageId: "111" } };
    const panel = service.CleanSettings(guild, { ask: "modal", panel: { forumId: TEXT, title: "  ", threadId: "999", messageId: "999" } }, stored);

    check("Fenster wird übernommen", panel.ask === "modal");
    check("Ein Textkanal ist kein Forum fürs Panel", panel.panel.forumId === null);
    check("Leerer Titel: bleibt wie vorher", panel.panel.title === base.panel.title, panel.panel.title);
    check("Beitrag und Nachricht schreibt nur der Bot", panel.panel.threadId === "111" && panel.panel.messageId === "111");
    check("Ein Forum fürs Panel kommt an", service.CleanSettings(guild, { panel: { forumId: FORUM } }, base).panel.forumId === FORUM);
    check("Unbekannte Art: bleibt", service.CleanSettings(guild, { ask: "fax" }, base).ask === "dm");

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

    // Ping-Rollen: Text über einer Karte lehnt Discord ab - die Rolle gehört oben in die Karte.
    const pinged = await LftRender(client, settings.notice.body, values, [CloseRow(42, true)], [ROLE]);

    check(
        "Meldung mit Ping als Karte: kein Text darüber, die Rolle steht oben in der Karte",
        !pinged.content && JSON.stringify(pinged.components[0].toJSON()).includes(`<@&${ROLE}>`),
        String(pinged.content)
    );
    check("…gepingt wird genau diese Rolle", JSON.stringify(pinged.allowedMentions) === JSON.stringify({ parse: [], roles: [ROLE] }), JSON.stringify(pinged.allowedMentions));

    const pingText = await LftRender(client, { kind: "text", content: "Neu: {user.name}", embed: null, doc: { blocks: [] } }, values, [], [ROLE]);

    check("Meldung mit Ping als Text: der Ping steht vor dem Text", (pingText.content ?? "").startsWith(`<@&${ROLE}>\n`), String(pingText.content));

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
/** Plan 30: das Panel im Forum - Knöpfe je Seite, nie zwei Beiträge. */
async function checkPanel(): Promise<void> {
    console.log("\n  — Panel im Forum (Plan 30) —");

    const both = JSON.stringify(PanelRow(["player", "team"]).toJSON());

    check("Je Seite ein Knopf", both.includes('"custom_id":"lf:start:player"') && both.includes('"custom_id":"lf:start:team"'), both);
    check("Keine Seite an: ein abgeschalteter Knopf", JSON.stringify(PanelRow([]).toJSON()).includes('"disabled":true'));

    const client = new BotClient();
    const service = client.lookingForService;
    const base = DefaultLftSettings();

    check("Panel-Forum fällt auf das der Spieler-Suche zurück", service.PanelForum({ ...base, player: { ...base.player, forumId: "F1" } }) === "F1");
    check("Eigenes Panel-Forum geht vor", service.PanelForum({ ...base, player: { ...base.player, forumId: "F1" }, panel: { ...base.panel, forumId: "F2" } }) === "F2");

    // Der gemerkte Beitrag ist von Hand gelöscht worden: genau ein neuer, beim zweiten Senden keiner mehr.
    let saved: ILftSettings = { ...base, player: { ...base.player, forumId: FORUM }, panel: { ...base.panel, threadId: "OLD", messageId: "OLD" } };
    // Liegt im Forum noch ein Panel als normaler Text, die Karte ist aber eine V2-Karte (oder umgekehrt)?
    let textPanel = false;
    const loose = client as unknown as Record<string, Record<string, unknown>>;
    const calls: string[] = [];
    let created = 0;
    let known: unknown = null;
    const thread = {
        id: "NEW",
        url: "https://discord.com/channels/1/NEW",
        name: base.panel.title,
        parentId: FORUM,
        archived: false,
        locked: false,
        isThread: () => true,
        messages: { fetch: async () => ({ flags: { has: () => !textPanel }, edit: async () => void calls.push("edit") }) },
        setName: async () => undefined,
        setArchived: async () => undefined,
        pin: async () => void calls.push("pin"),
        setLocked: async () => void calls.push("lock"),
        delete: async () => void calls.push("delete"),
    };
    const forum = {
        id: FORUM,
        type: ChannelType.GuildForum,
        flags: { has: () => false },
        threads: {
            create: async () => {
                created++;

                return thread;
            },
        },
    };
    const guild = { id: GUILD, name: "Dev Server", iconURL: () => null, channels: { cache: new Map([[FORUM, forum]]) } } as unknown as Guild;

    loose.moduleSettings.Of = async (_guild: string, _module: string, fallback: object) => ({ ...fallback, ...structuredClone(saved) });
    loose.moduleSettings.Save = async (_guild: string, _module: string, config: ILftSettings) => void (saved = config);
    (client.channels as unknown as Record<string, unknown>).fetch = async (id: string) => {
        if (known && id === "NEW") return known;

        throw Object.assign(new Error("Unknown Channel"), { code: 10003 });
    };

    const first = await service.SendPanel(guild);

    check("Gelöschter Beitrag: genau ein neuer", created === 1 && saved.panel.threadId === "NEW", `${created} · ${saved.panel.threadId}`);
    check("Neuer Beitrag: angepinnt und gesperrt", calls.includes("pin") && calls.includes("lock"), calls.join(", "));
    check("Mit Rechten keine Warnung", first.warning === null, String(first.warning));

    known = thread;
    await service.SendPanel(guild);
    check("Liegt einer: wird bearbeitet, kein zweiter", created === 1 && calls.includes("edit"), `${created} · ${calls.join(", ")}`);

    // Review Plan 30: Discord bearbeitet keine Nachricht zwischen Karte und Text - dann neu statt hängen.
    textPanel = true;
    calls.length = 0;
    await service.SendPanel(guild);
    check("Art gewechselt: alter Beitrag weg, genau ein neuer", calls.includes("delete") && !calls.includes("edit") && created === 2, `${created} · ${calls.join(", ")}`);
    textPanel = false;

    // Review Plan 30: Ein Aussetzer bei Discord ist kein gelöschter Beitrag - sonst stünden zwei Panels im Forum.
    (client.channels as unknown as Record<string, unknown>).fetch = async () => {
        throw Object.assign(new Error("Service Unavailable"), { code: 503, status: 503 });
    };
    await rejects("Discord antwortet nicht: Fehler statt zweitem Panel", () => service.SendPanel(guild));
    check("Discord antwortet nicht: kein neuer Beitrag", created === 2, String(created));

    // W-0032: Anpinnen scheitert. Mit „Beiträge verwalten“ liegt es daran, dass schon ein anderer Beitrag oben ist.
    const failingPin = { ...thread, flags: undefined, pin: async () => Promise.reject(Object.assign(new Error("Maximum number of pinned threads"), { code: 30047 })) };
    const pinGuild = (rights: boolean) =>
        ({ ...(guild as unknown as Record<string, unknown>), members: { me: { permissionsIn: () => ({ has: () => rights }) } } }) as unknown as Guild;

    (client.channels as unknown as Record<string, unknown>).fetch = async (id: string) => {
        if (known && id === "NEW") return known;

        throw Object.assign(new Error("Unknown Channel"), { code: 10003 });
    };
    known = failingPin;
    check("Pin scheitert mit Rechten: anderer Beitrag angepinnt", (await service.SendPanel(pinGuild(true))).warning?.includes("schon ein anderer Beitrag") === true);
    check("Pin scheitert ohne Rechte: „Beiträge verwalten“ fehlt", (await service.SendPanel(pinGuild(false))).warning?.includes("Beiträge verwalten") === true);
    known = thread;

    saved = { ...saved, player: { ...saved.player, forumId: null }, panel: { ...saved.panel, forumId: null } };
    await rejects("Ohne Forum geht kein Panel", () => service.SendPanel(guild));

    // Review Plan 30: Verlangt das Forum einen Tag, muss es einer aus diesem Forum sein.
    const tagged = (id: string, tags: { id: string; moderated: boolean }[]) => {
        const seen: { appliedTags?: string[] } = {};

        return {
            seen,
            forum: {
                id,
                type: ChannelType.GuildForum,
                flags: { has: () => true },
                availableTags: tags,
                threads: {
                    create: async (options: { appliedTags?: string[] }) => {
                        seen.appliedTags = options.appliedTags;

                        return thread;
                    },
                },
            },
        };
    };
    const teamForum = tagged("TEAMFORUM", [{ id: "T", moderated: false }]);
    const otherForum = tagged("OTHERFORUM", [{ id: "MOD", moderated: true }, { id: "FREE", moderated: false }]);
    const tagGuild = {
        id: GUILD,
        name: "Dev Server",
        iconURL: () => null,
        channels: { cache: new Map<string, unknown>([["TEAMFORUM", teamForum.forum], ["OTHERFORUM", otherForum.forum]]) },
    } as unknown as Guild;

    (client.channels as unknown as Record<string, unknown>).fetch = async () => {
        throw Object.assign(new Error("Unknown Channel"), { code: 10003 });
    };
    saved = {
        ...base,
        player: { ...base.player, forumId: FORUM, tag: { ...base.player.tag, id: "P" } },
        team: { ...base.team, forumId: "TEAMFORUM", tag: { ...base.team.tag, id: "T" } },
        panel: { ...base.panel, forumId: "TEAMFORUM" },
    };
    await service.SendPanel(tagGuild);
    check("Panel im Team-Forum: Tag der Team-Suche", JSON.stringify(teamForum.seen.appliedTags) === '["T"]', JSON.stringify(teamForum.seen.appliedTags));

    saved = { ...saved, panel: { ...saved.panel, forumId: "OTHERFORUM", threadId: null, messageId: null } };
    await service.SendPanel(tagGuild);
    check("Fremdes Forum: ein freier Tag von dort", JSON.stringify(otherForum.seen.appliedTags) === '["FREE"]', JSON.stringify(otherForum.seen.appliedTags));
}

/**
 * W-0032: Legt Publish die Tags nach, speichert es nur die Tags - nicht den
 * ganzen Stand vom Start des Gesprächs. Sonst ginge etwa ein inzwischen
 * gesendetes Panel verloren, und das nächste „Panel senden“ legte ein zweites an.
 */
async function checkPublishSave(): Promise<void> {
    console.log("\n  — Beitrag: nur die Tags zurückschreiben —");

    const client = new BotClient();
    const service = client.lookingForService;
    const loose = client as unknown as Record<string, Record<string, unknown>>;
    const base = DefaultLftSettings();
    const stored: ILftSettings = { ...base, player: { ...base.player, forumId: FORUM }, panel: { ...base.panel, threadId: "NEW", messageId: "NEW" } };
    const stale: ILftSettings = structuredClone({ ...stored, panel: { ...stored.panel, threadId: "OLD", messageId: "OLD" } });
    let saved: ILftSettings | null = null;

    loose.moduleSettings.Of = async (_guild: string, _module: string, fallback: object) => ({ ...fallback, ...structuredClone(stored) });
    loose.moduleSettings.Save = async (_guild: string, _module: string, config: ILftSettings) => void (saved = config);
    loose.lftRequests.Open = async () => null;
    loose.lftRequests.Create = async (input: Record<string, unknown>) => ({ ...input, id: 1, createdAt: Date.now(), status: "open" });
    loose.lftRequests.SetPost = async () => undefined;
    (service as unknown as Record<string, unknown>).SyncTags = async (_guild: Guild, settings: ILftSettings) => {
        settings.player.tag.id = "P";
    };

    const forum = { id: FORUM, type: ChannelType.GuildForum, threads: { create: async () => ({ id: "T1" }) } };
    const guild = { id: GUILD, name: "Dev Server", iconURL: () => null, channels: { cache: new Map([[FORUM, forum]]) } } as unknown as Guild;
    const member = { id: USER, displayName: "Kandidat", guild, user: { tag: "kandidat", displayAvatarURL: () => "" } } as unknown as GuildMember;
    const result = await service.Publish(member, "player", stale, [{ id: "q1", label: "Rang", value: "GC" }], "Titel", service.BaseOf(member, "player", stale.player));
    const after = saved as ILftSettings | null;

    check("Beitrag steht", result.ok, JSON.stringify(result).slice(0, 120));
    check("Neuer Tag ist gespeichert", after?.player.tag.id === "P", String(after?.player.tag.id));
    check("Das Panel von inzwischen bleibt", after?.panel.threadId === "NEW", String(after?.panel.threadId));
}

/** Review Plan 30: Vor dem Veröffentlichen werden alle Antworten noch einmal geprüft. */
async function checkModalFinish(): Promise<void> {
    console.log("\n  — Fenster: letzte Prüfung vor dem Beitrag —");

    const client = new BotClient();
    const service = client.lookingForService as unknown as Record<string, unknown>;
    const base = DefaultLftSettings();
    const questions: ILftQuestion[] = [
        { id: "q1", label: "Rang", hint: "", kind: "short", choices: [], required: true, max: 20 },
        { id: "q2", label: "Neu dazugekommen", hint: "", kind: "short", choices: [], required: true, max: 20 },
    ];
    let published = false;
    let shown = "";

    service.Check = async () => ({ settings: base, side: { ...base.player, questions } });
    service.Publish = async () => {
        published = true;

        return { ok: false, message: "nicht erreicht" };
    };

    const interaction = {
        member: { id: USER, displayName: "Kandidat", guild: { id: GUILD, name: "Dev Server", iconURL: () => null }, user: { displayAvatarURL: () => "" } },
        deferReply: async () => undefined,
        editReply: async (payload: { components?: unknown[] }) => void (shown = JSON.stringify(payload.components)),
    };
    const draft = { id: "d1", userId: USER, guildId: GUILD, kind: "player", answers: { q1: "GC 2" }, step: 1, touched: Date.now() };

    await (client.lookingForService.modal as unknown as { Finish: (...args: unknown[]) => Promise<void> }).Finish(interaction, draft);
    check("Pflichtfrage kam nach dem Ausfüllen dazu: nicht veröffentlicht", !published);
    check("… und die Person erfährt, was fehlt", shown.includes("fehlt noch"), shown.slice(0, 200));
}

/** Plan 30: die Fragen im Fenster - dieselben Regeln wie in der DM. */
function checkModal(): void {
    console.log("\n  — Fragen im Fenster (Plan 30) —");

    const questions: ILftQuestion[] = [
        { id: "q1", label: "Rang", hint: "", kind: "short", choices: [], required: true, max: 20 },
        { id: "q2", label: "Plattform", hint: "", kind: "choice", choices: ["PC", "PS"], required: true, max: 100 },
        { id: "q3", label: "Sonst noch was", hint: "", kind: "long", choices: [], required: false, max: 200 },
    ];
    const ok = CleanLftAnswers(questions, { q1: " GC 2 ", q2: "PC", q3: "" });

    check("Antworten mit Frage", ok.length === 2 && ok[0].label === "Rang" && ok[0].value === "GC 2", JSON.stringify(ok));
    refuses("Pflicht fehlt (auch wenn das Feld im Fenster fehlte)", () => CleanLftAnswers(questions, { q2: "PC" }));
    refuses("Zu lang", () => CleanLftAnswers(questions, { q1: "x".repeat(21), q2: "PC" }));
    refuses("Erfundene Auswahl", () => CleanLftAnswers(questions, { q1: "GC", q2: "Xbox" }));
    check("Fenstertitel", ModalTitle(KIND_LABELS.player, 1, 3) === "Spieler-Suche · Teil 1 von 3", ModalTitle(KIND_LABELS.player, 1, 3));
    check("15 Fragen sind drei Fenster", ModalParts(Array.from({ length: 15 }, (_, index) => ({ ...questions[0], id: `q${index}` }))).length === 3);
}

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
        ["Panel", LFT_PANEL_KEYS, "LFT_PANEL_PLACEHOLDERS"],
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
    await checkPanel();
    checkModal();
    await checkPublishSave();
    await checkModalFinish();
    await checkLists();

    console.log(failures === 0 ? "\n✅ Alle Prüfungen bestanden.\n" : `\n❌ ${failures} Prüfung(en) fehlgeschlagen.\n`);

    process.exit(failures > 0 ? 1 : 0);
}

void main();
