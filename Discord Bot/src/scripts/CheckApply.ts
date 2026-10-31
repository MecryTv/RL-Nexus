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

import { ButtonInteraction, ChannelType, Guild, GuildBasedChannel, GuildMember, InteractionContextType, Message, PermissionFlagsBits, Role } from "discord.js";
import ApplyCommand from "../commands/user/Apply";
import ComponentV2Builder from "../builder/ComponentV2Builder";
import { ApplyCard, ApplyPanelView, DmQuestionView, DmSummaryView, IsApplyPanel } from "../builder/ApplyView";
import BotClient from "../client/BotClient";
import { APPLY_FLOW_PREFIX, ApplyLink, ChannelName, CooldownText, DEFAULT_CHANNEL_NAME, DefaultApplySettings, DefaultForm, DRAFT_TTL, MAX_CHOICES, MAX_QUESTIONS, MAX_REVIEWERS, NextQuestionId, RECEIVED, STAFF_ONLY } from "../constants/Apply";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import { IApplyForm, IApplyQuestion, IApplySettings, IApplySubmission } from "../interfaces/services/apply/IApply";
import { CheckDmText, DmRealign, DmStep, EntryOf, FieldText, ModalParts, ModalTitle, RestartHint, SUMMARY } from "../services/ApplyFlow";
import { AfterRestore } from "../utils/guildpanels";
import ModuleSettings from "../models/ModuleSettings";
import { ApplyChannelOverwrites, ApplyError } from "../services/ApplyService";

const GUILD = "90071992547409941";
const TEXT = "90071992547409942";
const VOICE = "90071992547409943";
const ROLE = "90071992547409944";
const CATEGORY = "90071992547409945";
const USER = "123456789012345678";
const DAY = 86_400_000;

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

/** Wie refuses, nur für async - und mit einem Blick auf den Fehler. */
async function rejects(name: string, action: () => Promise<unknown>, expect: (error: ApplyError) => boolean = () => true): Promise<void> {
    try {
        await action();
        check(name, false, "ging durch");
    } catch (error) {
        check(name, error instanceof ApplyError && expect(error), error instanceof ApplyError ? `${error.title} · ${error.status} · ${error.message}` : String(error));
    }
}

function FakeMember(options: { accountDays?: number; roles?: string[] } = {}): GuildMember {
    return {
        id: USER,
        displayName: "Kandidat",
        user: { createdTimestamp: Date.now() - (options.accountDays ?? 400) * DAY },
        roles: { cache: new Map((options.roles ?? []).map((id) => [id, { id }])) },
    } as unknown as GuildMember;
}

interface IStub {
    forms: IApplyForm[];
    settings?: Partial<IApplySettings>;
    last?: Partial<IApplySubmission> | null;
    member?: GuildMember | null;
    modules?: string[];
}

/**
 * Ersetzt auf dem echten Client, was Public, Eligible und Submit lesen: keine
 * Datenbank, kein Discord. Gibt zurück, was angelegt wurde.
 */
function Stub(client: BotClient, stub: IStub): { created: unknown[] } {
    const created: unknown[] = [];
    const guild = FakeGuild() as unknown as Record<string, unknown>;
    const member = stub.member === undefined ? FakeMember() : stub.member;
    const loose = client as unknown as Record<string, Record<string, unknown>>;

    guild.members = { cache: new Map(), fetch: async () => { if (!member) throw new Error("Unknown Member"); return member; } };
    Object.defineProperty(client.databaseService, "Ready", { configurable: true, get: () => true });
    client.guilds.cache.set(GUILD, guild as unknown as Guild);
    loose.settings.Of = async () => ({ modules: stub.modules ?? ["apply"] });
    loose.moduleSettings.Of = async (_guild: string, _module: string, fallback: object) => ({ ...fallback, ...stub.settings });
    loose.applyForms.OfGuild = async (guildId: string) => stub.forms.filter((form) => form.guildId === guildId);
    loose.applySubmissions.Last = async () => (stub.last ? { status: "open", decidedAt: null, ...stub.last } : null);
    loose.applySubmissions.Create = async (input: Record<string, unknown>) => {
        created.push(input);

        return { ...input, id: created.length, status: "open", note: null, decidedBy: null, decidedName: null, decidedAt: null, messageId: null, createdAt: Date.now() };
    };
    (client.applyService as unknown as Record<string, unknown>).Post = async () => undefined;

    return { created };
}

function FakeGuild(): Guild {
    const channel = (id: string, type: ChannelType) =>
        ({ id, type, name: `kanal-${id.slice(-2)}`, isTextBased: () => type === ChannelType.GuildText }) as unknown as GuildBasedChannel;

    return {
        id: GUILD,
        name: "Dev Server",
        channels: {
            cache: new Map([
                [TEXT, channel(TEXT, ChannelType.GuildText)],
                [VOICE, channel(VOICE, ChannelType.GuildVoice)],
                [CATEGORY, channel(CATEGORY, ChannelType.GuildCategory)],
            ]),
        },
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
   Texte (Plan 30)
   ---------------------------------------------------------- */
function checkTexts(): void {
    console.log("\n  — Texte —");

    check("Ohne Prüferrecht", STAFF_ONLY === "Bewerbungen werden nur vom Staff Team gesehen und bearbeitet.");
    check("Nach dem Abschicken", RECEIVED === "Deine Bewerbung ist bei uns eingegangen. Das Staff Team wird sich bei dir melden.");
    check(
        "Pause nach Absage",
        CooldownText(14, 1_700_000_000_000) === "Nach einer Absage kannst du es in 14 Tagen neu versuchen – du kannst es ab <t:1700000000:D> wieder versuchen.",
        CooldownText(14, 1_700_000_000_000)
    );

    // W-0020: Nach einem Fehler beim Abschicken sagt die Meldung, wie es weitergeht - aber nur einmal.
    check("Fehler am Ende: Hinweis zum Neuanfang", RestartHint("Das Formular gibt es nicht mehr.") === "Das Formular gibt es nicht mehr. Im Kanal kannst du neu anfangen.", RestartHint("Das Formular gibt es nicht mehr."));
    check(
        "Fehler am Ende mit eigenem Hinweis: nicht doppelt",
        RestartHint("Auf diesem Server bewirbt man sich gerade anders. Klick im Kanal noch einmal auf „Bewerben“.") === "Auf diesem Server bewirbt man sich gerade anders. Klick im Kanal noch einmal auf „Bewerben“."
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
/** W-0032: „Für die Person schließen“ braucht „Rollen verwalten“ - sonst sieht die Person den Kanal weiter. */
async function checkCloseWarning(): Promise<void> {
    console.log("\n  — Eigener Kanal: Warnung beim Speichern —");

    const client = new BotClient();
    const loose = client as unknown as Record<string, Record<string, unknown>>;
    const service = client.applyService;
    const guild = (missing: bigint | null) =>
        ({ ...(FakeGuild() as unknown as Record<string, unknown>), members: { me: { permissions: { has: (flag: bigint) => flag !== missing } } } }) as unknown as Guild;

    loose.moduleSettings.Of = async (_guild: string, _module: string, fallback: object) => fallback;
    loose.moduleSettings.Save = async () => undefined;

    const close = { target: "channel", afterDecision: "close" };
    const noRoles = await service.SaveSettings(guild(PermissionFlagsBits.ManageRoles), close);

    check("Schließen ohne „Rollen verwalten“: Warnung", noRoles.warning?.includes("Rollen verwalten") === true, String(noRoles.warning));
    check("Mit allen Rechten: keine Warnung", (await service.SaveSettings(guild(null), close)).warning === null);
    check("Löschen braucht „Rollen verwalten“ nicht", (await service.SaveSettings(guild(PermissionFlagsBits.ManageRoles), { target: "channel", afterDecision: "delete" })).warning === null);
}

/** Plan 30: Wo die Karte landet - Sammelkanal oder eigener Kanal je Bewerbung. */
function checkChannelSettings(client: BotClient): void {
    console.log("\n  — Eigener Kanal: Einstellungen —");

    const guild = FakeGuild();
    const service = client.applyService;
    const defaults = DefaultApplySettings();

    check("Ab Werk Sammelkanal wie bisher", defaults.target === "shared" && defaults.afterDecision === "close");

    const clean = service.CleanSettings(guild, { target: "channel", categoryId: VOICE, channelName: "  ", afterDecision: "boom" }, defaults);

    check("Kanal-Modus wird übernommen", clean.target === "channel");
    check("Ein Sprachkanal ist keine Kategorie", clean.categoryId === null);
    check("Leerer Name: Vorgabe", clean.channelName === DEFAULT_CHANNEL_NAME);
    check("Unbekannte Wahl: bleibt wie vorher", clean.afterDecision === "close");
    check("Kategorie wird übernommen", service.CleanSettings(guild, { categoryId: CATEGORY }, defaults).categoryId === CATEGORY);
    check("Ohne Angabe bleibt die Kategorie", service.CleanSettings(guild, {}, { ...defaults, categoryId: CATEGORY }).categoryId === CATEGORY);

    const name = (pattern: string, user: string, id: number, form: string) => ChannelName(pattern, { user, id, form });

    check("Name mit Platzhaltern", name("bewerbung-{user}", "Alex Müller!", 7, "Spieler") === "bewerbung-alex-müller", name("bewerbung-{user}", "Alex Müller!", 7, "Spieler"));
    check("Nummer und Formular", name("{formular}-{nummer}", "x", 7, "Spieler 3v3") === "spieler-3v3-7", name("{formular}-{nummer}", "x", 7, "Spieler 3v3"));
    check("Nur Sonderzeichen: Ersatzname", name("{user}", "★★★", 9, "x") === "bewerbung-9", name("{user}", "★★★", 9, "x"));
    check("Höchstens 100 Zeichen", name("x".repeat(300), "", 1, "").length === 100);
    // W-0032: Fällt der Schnitt auf einen Bindestrich, darf er nicht am Ende stehen bleiben.
    check("Kein „-“ am Ende nach dem Kürzen", !name(`${"a".repeat(99)} b`, "", 1, "").endsWith("-"), name(`${"a".repeat(99)} b`, "", 1, ""));

    const rules = ApplyChannelOverwrites({
        everyoneId: GUILD,
        botId: "1",
        applicantId: USER,
        reviewRoles: [],
        reviewUsers: [],
        allow: ["ViewChannel"],
        botAllow: ["ViewChannel", "ManageChannels"],
    });

    check("@everyone ist ausgesperrt", rules.some((rule) => rule.id === GUILD && JSON.stringify(rule.deny).includes("ViewChannel")));
    check("Ohne Prüfer: nur Bewerber und Bot", rules.length === 3, String(rules.length));

    const withReviewers = ApplyChannelOverwrites({
        everyoneId: GUILD,
        botId: "1",
        applicantId: USER,
        reviewRoles: [ROLE],
        reviewUsers: ["222", USER],
        allow: ["ViewChannel"],
        botAllow: ["ViewChannel"],
    });

    check("Prüfer-Rolle und -Mitglied stehen drin", withReviewers.some((rule) => rule.id === ROLE) && withReviewers.some((rule) => rule.id === "222"));
    check("Bewerber, der selbst Prüfer ist, nur einmal", withReviewers.filter((rule) => rule.id === USER).length === 1);
}

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

    // Plan 24: wo man sich bewirbt.
    const defaults = DefaultApplySettings();
    const previous = { ...defaults, mode: "modal" as const, panel: { channelId: TEXT, messageId: "1" } };

    check("Ab Werk bewirbt man sich auf der Webseite", defaults.mode === "web", String(defaults.mode));
    check("Ab Werk liegt kein Panel", defaults.panel?.channelId === null && defaults.panel?.messageId === null);
    check("Die Art kommt an", service.CleanSettings(guild, { mode: "dm" }, previous).mode === "dm");
    check("Eine unbekannte Art behält die alte", service.CleanSettings(guild, { mode: "irgendwas" }, previous).mode === "modal");
    check(
        "Das Panel setzt der Client nicht",
        service.CleanSettings(guild, { panel: { channelId: VOICE, messageId: "2" } }, previous).panel.messageId === "1"
    );
}

/* ----------------------------------------------------------
   Das Panel in Discord (Plan 24)
   ---------------------------------------------------------- */
const BOT = "90071992547409950";

function PanelForms(form: IApplyForm, count: number): IApplyForm[] {
    return Array.from({ length: count }, (_, index) => ({ ...form, id: index + 1, guildId: GUILD, name: `Stelle ${index + 1}`, emoji: "🛡️", open: true }));
}

/** Die Optionen des ersten Auswahlmenüs im JSON einer Nachricht. */
function MenuOptions(value: unknown): Record<string, unknown>[] {
    if (Array.isArray(value)) return value.flatMap(MenuOptions);
    if (!value || typeof value !== "object") return [];

    const entry = value as Record<string, unknown>;

    return Array.isArray(entry.options) && typeof entry.custom_id === "string" ? (entry.options as Record<string, unknown>[]) : Object.values(entry).flatMap(MenuOptions);
}

function checkPanel(form: IApplyForm): void {
    console.log("\n  — Das Panel —");

    const guild = FakeGuild();
    const link = ApplyLink("https://dash.example", GUILD);
    const settings = (mode: IApplySettings["mode"], open = true): IApplySettings => ({ ...DefaultApplySettings(), mode, open });
    const three = [...PanelForms(form, 3), { ...PanelForms(form, 4)[3], open: false }];
    const view = ApplyPanelView(guild, settings("modal"), three, link);
    const json = JSON.stringify(view.components);

    check("Je offenem Formular ein Knopf", [1, 2, 3].every((id) => json.includes(`applyflow:start:${id}`)), json.slice(0, 200));
    check("Ein geschlossenes Formular fehlt", !json.includes("applyflow:start:4"));
    check("Titel und Hinweis auf /bewerben", json.includes("📋 | Bewerbungen bei Dev Server") && json.includes("Geht auch mit"));
    check("Components V2", ((view.flags as number) & 32_768) !== 0);
    check("Das Panel pingt niemanden", JSON.stringify(view.allowedMentions) === JSON.stringify({ parse: [] }), JSON.stringify(view.allowedMentions));

    const six = PanelForms(form, 6);
    six[5] = { ...six[5], emoji: "kein emoji" };
    six[4] = { ...six[4], emoji: "🎮🎯" };

    const many = JSON.stringify(ApplyPanelView(guild, settings("dm"), six, link).components);
    const options = MenuOptions(JSON.parse(many));
    const broken = options.find((option) => option.value === "6");

    check("Ab 6 Formularen ein Menü statt Knöpfen", many.includes("applyflow:pick") && !many.includes("applyflow:start:"));
    check("Ein kaputtes Emoji kommt nicht ins Menü", broken !== undefined && !("emoji" in broken) && String(broken.label).includes("Stelle 6"), JSON.stringify(broken));
    check("Ein echtes Emoji schon", options.find((option) => option.value === "1")?.emoji !== undefined);
    check("Zwei Emojis sind keins fürs Menü", !("emoji" in (options.find((option) => option.value === "5") ?? { emoji: 1 })), JSON.stringify(options.find((option) => option.value === "5")));

    const web = JSON.stringify(ApplyPanelView(guild, settings("web"), three, link).components);

    check("Webseite: nur Links, keine IDs", !web.includes("custom_id") && [1, 2, 3].every((id) => web.includes(`?formular=${id}`)), web.slice(0, 200));

    const webMany = JSON.stringify(ApplyPanelView(guild, settings("web"), six, link).components);

    check("Webseite ab 6: ein Knopf „Zur Bewerbung“", webMany.includes("Zur Bewerbung") && !webMany.includes("custom_id"));

    const closed = JSON.stringify(ApplyPanelView(guild, settings("modal", false), three, link).components);
    const empty = JSON.stringify(ApplyPanelView(guild, settings("modal"), [], link).components);
    const nobody = "Gerade suchen wir niemanden. Schau später wieder rein.";

    check("Bewerbungen aus: kein Knopf, ein Satz", closed.includes(nobody) && !closed.includes("custom_id") && !closed.includes('"url"'));
    check("Kein Formular offen: genauso", empty.includes(nobody) && !empty.includes("custom_id"));
}

function checkPanelDetect(form: IApplyForm): void {
    console.log("\n  — Ein Panel wiedererkennen —");

    const guild = FakeGuild();
    const link = ApplyLink("https://dash.example", GUILD);
    const other = ApplyLink("https://dash.example", "90071992547409949");
    const message = (author: string, components: unknown) => ({ author: { id: author }, components }) as never;
    const forms = PanelForms(form, 2);
    const modal = ApplyPanelView(guild, { ...DefaultApplySettings(), mode: "modal" }, forms, link).components;
    const web = ApplyPanelView(guild, DefaultApplySettings(), forms, link).components;
    const foreign = ApplyPanelView(guild, DefaultApplySettings(), forms, other).components;

    check("Eigenes Panel mit Knöpfen", IsApplyPanel(message(BOT, modal), BOT, GUILD));
    check("Eigenes Panel mit Links", IsApplyPanel(message(BOT, web), BOT, GUILD));
    check("Links auf einen anderen Server zählen nicht", !IsApplyPanel(message(BOT, foreign), BOT, GUILD));
    check("Fremder Absender zählt nicht", !IsApplyPanel(message("1", modal), BOT, GUILD));

    // Review Plan 24: eine Custom Message des Bots mit Bewerbungslink ist kein Panel - sonst überschreibt „Panel senden“ sie.
    const custom = new ComponentV2Builder().title("Wir suchen Verstärkung!").buttons({ url: `${link}?formular=1`, label: "Jetzt bewerben" }).toMessage().components;
    const closed = ApplyPanelView(guild, { ...DefaultApplySettings(), open: false }, forms, link).components;

    check("Custom Message mit Bewerbungslink ist kein Panel", !IsApplyPanel(message(BOT, custom), BOT, GUILD));
    check("Ein geschlossenes Panel ohne Knöpfe erkennt er trotzdem", IsApplyPanel(message(BOT, closed), BOT, GUILD));
}

/* ----------------------------------------------------------
   Fenster und Entwürfe (Plan 24)
   ---------------------------------------------------------- */
function Question(id: string, label: string, kind: IApplyQuestion["kind"] = "short", hint = "", required = true): IApplyQuestion {
    return { id, label, hint, kind, choices: kind === "choice" ? ["Viel", "Wenig"] : [], required, max: kind === "long" ? 1024 : 200 };
}

function checkModal(form: IApplyForm): void {
    console.log("\n  — Fenster in Discord —");

    const many = (count: number) => Array.from({ length: count }, (_, index) => Question(`q${index + 1}`, `Frage ${index + 1}`));
    const sizes = [1, 5, 6, 20].map((count) => ModalParts(many(count)).length);

    check("1, 5, 6, 20 Fragen ergeben 1, 1, 2, 4 Fenster", sizes.join() === "1,1,2,4", sizes.join());
    check("Die Reihenfolge bleibt", ModalParts(many(12)).flat().map((question) => question.id).join() === many(12).map((question) => question.id).join());
    check("Höchstens 5 Fragen je Fenster", ModalParts(many(20)).every((part) => part.length <= 5));

    const long = ModalTitle("x".repeat(80), 2, 4);

    check("Der Titel passt in 45 Zeichen und behält den Teil", long.length <= 45 && long.endsWith(" · Teil 2 von 4"), long);
    check("Ein Teil: nur der Name", ModalTitle("Moderator", 1, 1) === "Moderator");

    const short = FieldText(Question("a", "Wie heißt du und wie alt bist du?", "short", "Vorname reicht"));

    check(
        "Kurze Frage: Beschriftung und Hinweis darunter",
        short.label === "Wie heißt du und wie alt bist du?" && short.description === "Vorname reicht" && short.placeholder === null,
        JSON.stringify(short)
    );

    const sixty = "Hast du schon moderiert? Wo und wie lange ungefähr? Erzähl!!";
    const cut = FieldText(Question("b", sixty, "long", "Ein paar Sätze"));

    check(
        "Lange Frage: gekürzt, ganz darunter, Hinweis als Platzhalter",
        cut.label.length === 45 && cut.label.endsWith("…") && cut.description === sixty && cut.placeholder === "Ein paar Sätze",
        JSON.stringify(cut)
    );
    check("Lange Auswahl: kein Platzhalter", FieldText(Question("c", sixty, "choice", "Such aus")).placeholder === null);
    check("Die Beschreibung hat höchstens 100 Zeichen", FieldText(Question("d", "y".repeat(150))).description?.length === 100);

    const settings = (mode: IApplySettings["mode"], open = true): IApplySettings => ({ ...DefaultApplySettings(), mode, open });
    const one = [{ ...form, open: true }];
    const two = [{ ...form, id: 1, open: true }, { ...form, id: 2, open: true }];

    check("Modul aus: zu", EntryOf(null, one) === "closed");
    check("Bewerbungen aus: zu", EntryOf(settings("modal", false), one) === "closed");
    check("Kein Formular offen: zu", EntryOf(settings("modal"), [{ ...form, open: false }]) === "closed");
    check("Webseite: Link", EntryOf(settings("web"), one) === "web");
    check("Ein Formular: gleich los", EntryOf(settings("modal"), one) === "start");
    check("Mehrere: erst wählen", EntryOf(settings("dm"), two) === "pick");
}

function checkDrafts(client: BotClient): void {
    console.log("\n  — Halbe Bewerbungen —");

    const flow = client.applyService.flow;
    const now = 1_800_000_000_000;
    const base = { guildId: GUILD, formId: 7, channelId: null, messageId: null };
    const first = flow.Open({ ...base, userId: "A", via: "modal" }, now);
    const second = flow.Open({ ...base, userId: "A", via: "modal" }, now);

    check("Ein neuer Start ersetzt den alten Entwurf", flow.Draft("A", now)?.id === second.id && first.id !== second.id);
    check("Die alte ID läuft ins Leere", flow.Lookup("A", first.id, now) === null);
    check("Die neue ID findet den Entwurf", flow.Lookup("A", second.id, now)?.id === second.id);
    check("Fremde Entwürfe findet niemand", flow.Lookup("C", second.id, now) === null);

    const touched = flow.Open({ ...base, userId: "B", via: "modal" }, now);

    flow.Touch(touched, now + 20 * 60_000);
    check("Aktivität verlängert die 30 Minuten", flow.Draft("B", now + 40 * 60_000) !== null);
    check("Danach ist er weg", flow.Draft("B", now + 20 * 60_000 + DRAFT_TTL + 1) === null);
    check("Nach 30 Minuten ohne Aktivität auch", flow.Draft("A", now + DRAFT_TTL + 1) === null);

    flow.Open({ ...base, userId: "D", via: "dm" }, now);
    flow.Open({ ...base, userId: "M", via: "modal" }, now);

    check("Eine laufende DM-Bewerbung gehört der Bewerbung", flow.Owns("D", now));
    check("Ein Fenster-Entwurf nicht", !flow.Owns("M", now));
    check("Abgelaufen nicht mehr", !flow.Owns("D", now + DRAFT_TTL + 1));

    flow.Open({ ...base, userId: "E", via: "dm" }, now);
    flow.End("E");
    check("Beendet nicht mehr", !flow.Owns("E", now));

    const draft = flow.Open({ ...base, userId: "F", via: "modal" }, now);

    check("Ein schon abgeschickter Teil zählt nicht noch einmal", !flow.AcceptPart({ ...draft, step: 1 }, 0) && flow.AcceptPart({ ...draft, step: 1 }, 1));

    for (const user of ["D", "F", "M"]) flow.End(user);
}

/* ----------------------------------------------------------
   Per DM (Plan 24)
   ---------------------------------------------------------- */
function checkDm(): void {
    console.log("\n  — Per DM —");

    const name = Question("q1", "Wie heißt du?", "short", "Vorname reicht");
    const why = { ...Question("q2", "Warum willst du das machen?", "long"), max: 1024 };
    const time = Question("q3", "Wie viel Zeit hast du?", "choice");
    const extra = Question("q4", "Sonst noch was?", "short", "", false);
    const form = { ...DefaultForm(), id: 7, guildId: GUILD, questions: [name, why, time, extra], settings: DefaultForm().settings } as IApplyForm;
    const draft = { id: "abc", userId: USER, guildId: GUILD, formId: 7, via: "dm" as const, answers: {}, step: 0, touched: 0, channelId: null, messageId: null, shown: null };

    check("Leer: Text fehlt", CheckDmText(name, "  ") === "Hier brauche ich Text.");
    check("Auswahl als Text: bitte oben wählen", CheckDmText(time, "Viel") === "Wähl oben eine Möglichkeit aus.");
    check(
        "Zu lang: mit Zahlen wie im Deutschen",
        CheckDmText(why, "x".repeat(1300)) === "Das sind 1.300 Zeichen, hier gehen höchstens 1.024. Schick sie bitte kürzer.",
        String(CheckDmText(why, "x".repeat(1300)))
    );
    check("Passt", CheckDmText(name, "Jonas") === null);

    const first = DmStep(draft, form, { kind: "text", text: "Jonas" });

    check("Antwort auf Frage 1: weiter zu Frage 2", first.error === null && first.draft.step === 1 && first.draft.answers.q1 === "Jonas");
    check("Der alte Entwurf bleibt, wie er war", draft.step === 0 && !("q1" in draft.answers));
    check("Pflichtfrage überspringen geht nicht", DmStep({ ...draft, step: 0 }, form, { kind: "skip" }).error !== null);

    const skipped = DmStep({ ...draft, step: 3, answers: { q4: "alt" } }, form, { kind: "skip" });

    check("Freiwillige überspringen: weiter, ohne Antwort", skipped.error === null && skipped.draft.step === 4 && !("q4" in skipped.draft.answers));
    check("Zurück von Frage 3 auf 2", DmStep({ ...draft, step: 2 }, form, { kind: "back" }).draft.step === 1);
    check("Zurück auf Frage 1 bleibt dort", DmStep(draft, form, { kind: "back" }).draft.step === 0);
    check("Erfundene Auswahl: Fehler", DmStep({ ...draft, step: 2 }, form, { kind: "choice", value: "Gar nicht" }).error !== null);
    check("Echte Auswahl: weiter", DmStep({ ...draft, step: 2 }, form, { kind: "choice", value: "Viel" }).draft.answers.q3 === "Viel");

    const again = DmStep({ ...draft, step: 4, answers: { q1: "Jonas" } }, form, { kind: "restart" }).draft;

    check("Neu anfangen: Frage 1, nichts beantwortet", again.step === 0 && Object.keys(again.answers).length === 0);

    const shrunk = { ...form, questions: form.questions.slice(0, 3) };
    let late: ReturnType<typeof DmStep> | null = null;

    try {
        late = DmStep({ ...draft, step: 5 }, shrunk, { kind: "text", text: "Noch was" });
    } catch (error) {
        check("Formular gekürzt: kein Absturz", false, String(error));
    }

    check("Formular gekürzt: bleibt bei der Zusammenfassung", late !== null && late.draft.step >= 3, JSON.stringify(late?.draft.step));

    const one = JSON.stringify(DmQuestionView("Dev Server", form, 0, "abc").components);
    const two = JSON.stringify(DmQuestionView("Dev Server", form, 1, "abc").components);

    check("Frage 1 von 4, ohne Zurück", one.includes("Frage 1 von 4") && !one.includes("applyflow:back:abc"), one.slice(0, 200));
    check("Ab Frage 2 mit Zurück", two.includes("applyflow:back:abc"));
    check("Freiwillige Frage: Überspringen", JSON.stringify(DmQuestionView("Dev Server", form, 3, "abc").components).includes("applyflow:skip:abc"));

    const choice = JSON.stringify(DmQuestionView("Dev Server", form, 2, "abc").components);

    check("Auswahl: Menü mit allen Möglichkeiten", choice.includes("applyflow:choice:abc") && choice.includes("Viel") && choice.includes("Wenig"));
    check("Abbrechen gibt es immer", one.includes("applyflow:cancel:abc"));

    const summary = DmSummaryView(form, [{ id: "q1", value: "@everyone hallo" }], "abc");
    const summaryJson = JSON.stringify(summary.components);

    check(
        "Zusammenfassung mit Abschicken, Neu anfangen, Abbrechen",
        summaryJson.includes("Fertig. Das geht ans Team:") && ["send", "restart", "cancel"].every((action) => summaryJson.includes(`applyflow:${action}:abc`))
    );
    check("@everyone steht drin, pingt aber nicht", summaryJson.includes("@everyone") && JSON.stringify(summary.allowedMentions) === JSON.stringify({ parse: [] }));
}

function checkCommand(client: BotClient): void {
    console.log("\n  — /bewerben —");

    const command = new ApplyCommand(client);
    const json = command.data.toJSON() as { name: string; contexts?: number[] };

    check("Heißt /bewerben", json.name === "bewerben", json.name);
    check("Nur auf Servern", JSON.stringify(json.contexts) === JSON.stringify([InteractionContextType.Guild]), JSON.stringify(json.contexts));
    check("10 Sekunden Pause und Modul apply", command.cooldown === 10 && command.module === "apply");
}

function checkPublic(client: BotClient, form: IApplyForm): void {
    console.log("\n  — Die öffentliche Seite —");

    const service = client.applyService;
    const guild = FakeGuild();
    const forms = [{ ...form, id: 7, guildId: GUILD, open: true }];
    const panel = { channelId: TEXT, messageId: "1" };
    const dm = service.PublicPayload(guild, forms, { ...DefaultApplySettings(), mode: "dm", panel }, { id: USER, member: true }) as Record<string, unknown>;
    const dmPanel = dm.panel as { url?: string; name?: string } | null;
    const dmForms = dm.forms as { questions: unknown }[];

    check("DM: Link in den Kanal", dmPanel?.url === `https://discord.com/channels/${GUILD}/${TEXT}`, JSON.stringify(dmPanel));
    check("DM: der Kanalname", dmPanel?.name === "kanal-42", String(dmPanel?.name));
    check("DM: nur die Zahl der Fragen", typeof dmForms[0].questions === "number" && dmForms[0].questions === form.questions.length);
    check("DM: kein me", !("me" in dm));
    check("Die Art steht drin", dm.mode === "dm");

    const gone = service.PublicPayload(guild, forms, { ...DefaultApplySettings(), mode: "modal", panel: { channelId: "90071992547409948", messageId: "1" } }, null) as Record<string, unknown>;

    check("Kanal gelöscht: kein Panel", gone.panel === null);

    const web = service.PublicPayload(guild, forms, DefaultApplySettings(), { id: USER, member: true }) as Record<string, unknown>;

    check("Webseite: Fragen wie bisher", Array.isArray((web.forms as { questions: unknown }[])[0].questions) && "me" in web);
}

/** Eine Zeile von vor Plan 24: ohne mode und panel. */
async function checkOldRow(): Promise<void> {
    console.log("\n  — Alte Einstellungen —");

    const old = { reviewRoles: [], reviewUsers: [], channelId: null, open: true };
    const read = (await ModuleSettings.prototype.Of.call({ Find: async () => ({ config: JSON.stringify(old) }) }, GUILD, "apply", DefaultApplySettings())) as IApplySettings;

    check("Eine alte Zeile liest sich als Webseite", read.mode === "web", String(read.mode));
    check("Und ohne Panel", read.panel?.messageId === null);
}

/* ----------------------------------------------------------
   Wer darf sich bewerben (Plan 24)
   ---------------------------------------------------------- */
async function checkEligible(client: BotClient, form: IApplyForm): Promise<void> {
    console.log("\n  — Wer darf sich bewerben —");

    const service = client.applyService;
    const mine = { ...form, id: 7, guildId: GUILD, open: true, settings: { ...form.settings, requireRole: null, minAccountDays: 0, cooldownDays: 30 } };
    const foreign = { ...mine, id: 99, guildId: "90071992547409949" };
    const notYet = (error: ApplyError): boolean => error.title === "Das geht noch nicht";
    const notNow = (error: ApplyError): boolean => error.title === "Gerade nicht";

    Stub(client, { forms: [{ ...mine, settings: { ...mine.settings, requireRole: ROLE } }] });
    await rejects("Ohne die Rolle: noch nicht", () => service.Eligible(GUILD, USER, 7), notYet);

    Stub(client, { forms: [{ ...mine, settings: { ...mine.settings, minAccountDays: 30 } }], member: FakeMember({ accountDays: 3 }) });
    await rejects("Konto 3 Tage alt bei 30: noch nicht", () => service.Eligible(GUILD, USER, 7), notYet);

    Stub(client, { forms: [mine], last: { status: "open" } });
    await rejects("Eine Bewerbung läuft noch: gerade nicht", () => service.Eligible(GUILD, USER, 7), notNow);

    Stub(client, { forms: [mine], last: { status: "accepted" } });
    await rejects("Schon angenommen: gerade nicht", () => service.Eligible(GUILD, USER, 7), notNow);

    Stub(client, { forms: [mine], last: { status: "declined", decidedAt: Date.now() - DAY } });
    await rejects("Abgelehnt, Pause läuft: gerade nicht", () => service.Eligible(GUILD, USER, 7), notNow);

    Stub(client, { forms: [mine, foreign] });
    await rejects("Das Formular eines anderen Servers", () => service.Eligible(GUILD, USER, 99));

    Stub(client, { forms: [mine], settings: { open: false } });
    await rejects("Bewerbungen aus", () => service.Eligible(GUILD, USER, 7));

    Stub(client, { forms: [mine], member: null });
    await rejects("Nicht auf dem Server", () => service.Eligible(GUILD, USER, 7));

    Stub(client, { forms: [mine], settings: { mode: "dm" }, member: FakeMember({ roles: [ROLE] }) });

    try {
        const ok = await service.Eligible(GUILD, USER, 7);

        check("Alles erfüllt: Formular, Mitglied und Art kommen zurück", ok.form.id === 7 && ok.member.id === USER && ok.settings.mode === "dm");
    } catch (error) {
        check("Alles erfüllt: Formular, Mitglied und Art kommen zurück", false, String(error));
    }
}

async function checkVia(client: BotClient, form: IApplyForm): Promise<void> {
    console.log("\n  — Abschicken nur auf dem eingestellten Weg —");

    const service = client.applyService;
    const mine = { ...form, id: 7, guildId: GUILD, open: true, settings: { ...form.settings, requireRole: null, minAccountDays: 0 } };
    const answers: Record<string, string> = {};

    for (const question of mine.questions) answers[question.id] = question.kind === "choice" ? question.choices[0] : "Eine Antwort";

    Stub(client, { forms: [mine], settings: { mode: "modal" } });
    await rejects(
        "Webseite bei Fenster: 409 mit dem Satz",
        () => service.Submit(GUILD, USER, 7, answers, "web"),
        (error) => error.status === 409 && error.message === "Auf diesem Server bewirbt man sich in Discord."
    );

    Stub(client, { forms: [mine], settings: { mode: "web" } });
    await rejects("Fenster bei Webseite: abgelehnt", () => service.Submit(GUILD, USER, 7, answers, "modal"), (error) => error.status === 409);

    const { created } = Stub(client, { forms: [mine], settings: { mode: "dm" } });

    try {
        await service.Submit(GUILD, USER, 7, answers, "dm");
        check("DM bei DM: wird angelegt", created.length === 1, String(created.length));
    } catch (error) {
        check("DM bei DM: wird angelegt", false, String(error));
    }
}

/** Review Plan 24: Das Formular ändert sich, während jemand per DM antwortet. */
function checkRealign(): void {
    console.log("\n  — DM: Formular geändert —");

    const q = (id: string) => Question(id, `Frage ${id}`);
    const form = (...ids: string[]) => ({ ...DefaultForm(), id: 7, guildId: GUILD, questions: ids.map(q) }) as IApplyForm;
    const draft = (shown: string | null, step: number) => ({ id: "abc", userId: USER, guildId: GUILD, formId: 7, via: "dm" as const, answers: {}, step, touched: 0, channelId: null, messageId: null, shown });

    const same = DmRealign(draft("q2", 1), form("q1", "q2", "q3"));
    check("Nichts geändert: bleibt, wie es ist", !same.stale && same.draft.step === 1);

    const gone = DmRealign(draft("q5", 4), form("q1", "q2", "q3"));
    check("Hintere Fragen gelöscht: neu zeigen, jetzt die Zusammenfassung", gone.stale && gone.draft.step === 3, JSON.stringify(gone));

    const shifted = DmRealign(draft("q3", 2), form("q1", "q3", "q4"));
    check("Frage davor gelöscht: die Antwort gehört weiter zur angezeigten Frage", !shifted.stale && shifted.draft.step === 1, JSON.stringify(shifted));

    const grown = DmRealign(draft(SUMMARY, 4), form("q1", "q2", "q3", "q4", "q5"));
    check("Frage dazugekommen, Zusammenfassung angezeigt: neu zeigen", grown.stale && grown.draft.step === 4, JSON.stringify(grown));
}

/** Review Plan 24: Zwei schnelle Antworten per DM kommen beide an, nacheinander. */
async function checkDmQueue(client: BotClient, form: IApplyForm): Promise<void> {
    console.log("\n  — DM: schnelle Antworten —");

    const flow = client.applyService.flow;
    const two = { ...form, id: 7, guildId: GUILD, questions: [Question("q1", "Wie alt bist du?"), Question("q2", "Seit wann spielst du?", "long")] };
    let sent = 0;

    (client.applyService as unknown as Record<string, unknown>).Form = async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));

        return two;
    };
    // Wie bei Discord: Die alte Frage zu holen dauert einen Moment - in der Zeit kommt die zweite Nachricht.
    (client.channels as unknown as Record<string, unknown>).fetch = async () => {
        await new Promise((resolve) => setTimeout(resolve, 15));

        return null;
    };

    const draft = flow.Open({ userId: "Q", guildId: GUILD, formId: 7, via: "dm", channelId: "c1", messageId: "m0" });
    const message = (content: string) =>
        ({ author: { id: "Q", send: async () => ({ id: `m${++sent}` }) }, content, reply: async () => undefined }) as unknown as Message;

    const handled = await Promise.all([flow.OnDirectMessage(message("Ich bin 17")), flow.OnDirectMessage(message("Seit drei Jahren"))]);
    const now = flow.Draft("Q");

    check("Beide Nachrichten gehören zur Bewerbung", handled.every(Boolean));
    check("Beide Antworten sind da, jede bei ihrer Frage", now?.answers.q1 === "Ich bin 17" && now?.answers.q2 === "Seit drei Jahren" && now?.step === 2, JSON.stringify(now?.answers ?? draft.answers));

    flow.End("Q");
}

/** W-0020: Räumt ein anderer Aufruf einen abgelaufenen DM-Entwurf weg, kommt die Ablaufnachricht trotzdem. */
async function checkSweepDm(client: BotClient): Promise<void> {
    console.log("\n  — DM: Ablauf beim Aufräumen —");

    const flow = client.applyService.flow;
    const notices: string[] = [];
    const now = Date.now();

    (client.applyService as unknown as Record<string, unknown>).Form = async () => null;
    (client.channels as unknown as Record<string, unknown>).fetch = async () => ({ isSendable: () => true, send: async (options: unknown) => void notices.push(JSON.stringify(options)) });

    flow.Open({ userId: "S", guildId: GUILD, formId: 7, via: "dm", channelId: "c2", messageId: "m0" }, now);
    // Jemand anderes fängt an, kurz nachdem die 30 Minuten um sind - noch bevor der Zeitgeber von S feuert.
    flow.Draft("X", now + DRAFT_TTL + 1);
    await new Promise((resolve) => setTimeout(resolve, 10));

    check("Abgelaufener DM-Entwurf beim Aufräumen: Ablaufnachricht kommt", notices.some((entry) => entry.includes("abgelaufen")), notices.join(" | "));
    check("Der Entwurf ist trotzdem weg", flow.Draft("S", now + DRAFT_TTL + 1) === null);
}

/** W-0020: Discord merkt sich die Wahl im Menü - das Panel wird danach neu gezeichnet. */
async function checkResetPanel(client: BotClient, form: IApplyForm): Promise<void> {
    console.log("\n  — Panel-Menü zurücksetzen —");

    const service = client.applyService as unknown as Record<string, unknown>;
    const guild = FakeGuild();
    const forms = PanelForms(form, 6);
    const settings = { ...DefaultApplySettings(), mode: "modal" as const };
    const edits: string[] = [];
    const message = (author: string, components: unknown) =>
        ({ author: { id: author }, guild, components, edit: async (options: unknown) => void edits.push(JSON.stringify(options)) }) as unknown as Message;

    Object.defineProperty(client, "user", { configurable: true, value: { id: BOT } });
    service.Settings = async () => settings;
    service.Forms = async () => forms;

    await client.applyService.ResetPanel(message(BOT, ApplyPanelView(guild, settings, forms, ApplyLink("https://dash.example", GUILD)).components));
    check("Nach der Wahl im Panel-Menü: Panel neu gezeichnet", edits.length === 1 && edits[0].includes(`${APPLY_FLOW_PREFIX}:pick`), String(edits.length));

    edits.length = 0;
    await client.applyService.ResetPanel(message(BOT, new ComponentV2Builder().title("Wähl ein Formular").toMessage().components));
    check("Ein Menü außerhalb des Panels bleibt, wie es ist", edits.length === 0, String(edits.length));
}

/** W-0020: Nach dem Zurückladen zeigt ein noch liegendes Bewerbungs-Panel wieder den Stand aus dem Backup. */
async function checkRestorePanel(client: BotClient): Promise<void> {
    console.log("\n  — Panel nach dem Zurückladen —");

    const loose = client as unknown as Record<string, Record<string, unknown>>;
    const sent: string[] = [];
    const channel = { isTextBased: () => true, messages: { fetch: async () => ({ id: "p1" }) } };
    const guild = { id: GUILD, channels: { cache: new Map([[TEXT, channel]]) } } as unknown as Guild;

    loose.databaseService.Bump = () => undefined;
    loose.roleListService.Forget = () => undefined;
    loose.selfRolePanels.OfGuild = async () => [];
    loose.ticketSettings.Of = async () => ({ panel: { channelId: null, messageId: null } });
    loose.applyService.Settings = async () => ({ ...DefaultApplySettings(), panel: { channelId: TEXT, messageId: "p1" } });
    loose.voiceService.Settings = async () => ({ panel: "off" });
    loose.teamService.Settings = async () => ({ channelId: null });
    loose.customMessages.OfGuild = async () => [];
    loose.roleLists.OfGuild = async () => [];
    loose.applyService.SendPanel = async (_guild: unknown, channelId: string) => void sent.push(channelId);

    const report = await AfterRestore(client, guild, [], null);

    check("Liegendes Bewerbungs-Panel wird nach dem Zurückladen aktualisiert", sent.length === 1 && sent[0] === TEXT, `${sent.join(",")} · ${JSON.stringify(report)}`);
}

/** Knöpfe mit apply:, die keine Entscheidung sind, entscheiden nichts. */
async function checkDecisionIds(client: BotClient): Promise<void> {
    console.log("\n  — Nur ja und nein entscheiden —");

    const service = client.applyService;
    let decided = 0;
    const order: string[] = [];
    const button = (customId: string) =>
        ({
            customId,
            inCachedGuild: () => true,
            guild: FakeGuild(),
            member: FakeMember(),
            reply: async () => void order.push("reply"),
            deferReply: async () => void order.push("defer"),
            editReply: async () => void order.push("edit"),
        }) as unknown as ButtonInteraction;

    (service as unknown as Record<string, unknown>).Decide = async () => {
        decided++;
        order.push("decide");

        return { id: 5, status: "accepted" };
    };

    await service.Handle(button("apply:start:5"));
    check("apply:start:5 lehnt nicht ab", decided === 0, String(decided));

    await service.Handle(button("apply:ja:5"));
    check("apply:ja:5 entscheidet weiter", decided === 1, String(decided));
    // Review Plan 30: Rolle, DM, Karte und Kanal brauchen Zeit - Discord wartet nur 3 Sekunden auf die erste Antwort.
    check("Erst aufschieben, dann entscheiden", order.join(",") === "defer,decide,edit", order.join(","));
}

/* ----------------------------------------------------------
   Entfernen (Plan 30)
   ---------------------------------------------------------- */
async function checkRemove(form: IApplyForm): Promise<void> {
    console.log("\n  — Entfernen —");

    // Ein eigener Client: die anderen Prüfungen haben Methoden des Service ersetzt.
    const client = new BotClient();
    const service = client.applyService;
    const loose = client as unknown as Record<string, Record<string, unknown>>;
    const guild = FakeGuild() as unknown as Record<string, unknown>;
    const removedIds: number[] = [];
    const removedRoles: string[] = [];
    const member = (id: string) => ({ id, displayName: id, roles: { remove: async (role: string) => void removedRoles.push(`${id}:${role}`) } });
    const members: Record<string, unknown> = { alex: member("alex"), sam: member("sam") };
    const entry = (id: number, userId: string, status: IApplySubmission["status"]): IApplySubmission =>
        ({
            id,
            formId: form.id,
            guildId: GUILD,
            userId,
            userName: userId,
            answers: [],
            status,
            note: null,
            decidedBy: status === "open" ? null : "reviewer",
            decidedName: null,
            decidedAt: status === "open" ? null : Date.now(),
            messageId: null,
            channelId: null,
            createdAt: Date.now(),
        }) as IApplySubmission;
    const entries: Record<number, IApplySubmission> = { 1: entry(1, "alex", "accepted"), 2: entry(2, "sam", "declined"), 3: entry(3, "gone", "accepted"), 4: entry(4, "alex", "open") };

    guild.members = {
        cache: new Map(),
        fetch: async (id: string) => {
            if (!members[id]) throw new Error("Unknown Member");

            return members[id];
        },
    };
    loose.moduleSettings.Of = async (_guild: string, _module: string, fallback: object) => fallback;
    loose.applyForms.Get = async () => ({ ...form, guildId: GUILD, settings: { ...form.settings, acceptRole: ROLE } });
    loose.applySubmissions.Get = async (id: number) => entries[id] ?? null;
    loose.applySubmissions.Remove = async (id: number) => void removedIds.push(id);
    (service as unknown as Record<string, unknown>).CanReview = async (who: GuildMember) => who.id === "reviewer";

    const reviewer = { id: "reviewer" } as GuildMember;
    const stranger = { id: "stranger" } as GuildMember;
    const target = guild as unknown as Guild;

    await service.Remove(target, reviewer, 1);
    check("Angenommen: Rolle wird abgezogen", removedRoles.includes(`alex:${ROLE}`), removedRoles.join(", "));
    check("Angenommen: Eintrag ist weg", removedIds.includes(1));

    await service.Remove(target, reviewer, 2);
    check("Abgelehnt: keine Rolle angefasst", !removedRoles.some((one) => one.startsWith("sam:")) && removedIds.includes(2));

    await service.Remove(target, reviewer, 3);
    check("Bewerber ist weg: Eintrag trotzdem weg", removedIds.includes(3));

    await rejects("Offen: erst entscheiden", () => service.Remove(target, reviewer, 4));
    check("Offen: bleibt stehen", !removedIds.includes(4));
    await rejects("Ohne Prüferrecht", () => service.Remove(target, stranger, 1), (error) => error.message === STAFF_ONLY);
    await rejects("Gibt es nicht", () => service.Remove(target, reviewer, 99));

    // Review Plan 30: Der eigene Kanal ist schon gelöscht - im Sammelkanal liegt dann keine Karte, also nichts zu melden.
    let sharedTried = false;

    entries[5] = { ...entry(5, "sam", "declined"), channelId: "gone", messageId: "m5" };
    loose.moduleSettings.Of = async (_guild: string, _module: string, fallback: object) => ({ ...fallback, channelId: TEXT });
    guild.channels = {
        cache: new Map([
            [
                TEXT,
                {
                    id: TEXT,
                    isTextBased: () => true,
                    messages: {
                        delete: async () => {
                            sharedTried = true;

                            throw Object.assign(new Error("Unknown Message"), { code: 10008 });
                        },
                    },
                },
            ],
        ]),
    };

    const gone = await service.Remove(target, reviewer, 5);

    check("Kanal schon weg: keine falsche Meldung", gone.left.length === 0, gone.left.join(" "));
    check("Kanal schon weg: keine Suche im Sammelkanal", !sharedTried);
}

/* ----------------------------------------------------------
   Eigener Kanal im Betrieb (Plan 30)
   ---------------------------------------------------------- */
async function checkChannelFlow(form: IApplyForm): Promise<void> {
    console.log("\n  — Eigener Kanal: anlegen und aufräumen —");

    const client = new BotClient();
    const service = client.applyService as unknown as Record<string, (...args: unknown[]) => Promise<unknown>> & typeof client.applyService;
    const loose = client as unknown as Record<string, Record<string, unknown>>;
    const submission = {
        id: 8,
        formId: form.id,
        guildId: GUILD,
        userId: USER,
        userName: "Kandidat",
        answers: [],
        status: "open",
        note: null,
        decidedBy: null,
        decidedName: null,
        decidedAt: null,
        messageId: null,
        channelId: null,
        createdAt: Date.now(),
    } as IApplySubmission;
    const decided: IApplySubmission = { ...submission, status: "accepted", decidedBy: USER, decidedAt: Date.now(), channelId: "555" };
    const json = (view: { components?: readonly unknown[] }) => JSON.stringify(view.components);

    check("Entschieden mit Kanal: Knopf zum Löschen", json(ApplyCard(client, form, decided)).includes(`"custom_id":"apply:kanal:${decided.id}"`));
    check("Entschieden ohne Kanal: kein Knopf", !json(ApplyCard(client, form, { ...decided, channelId: null })).includes("apply:kanal"));
    check("Offen: kein Knopf zum Löschen", !json(ApplyCard(client, form, { ...submission, channelId: "555" })).includes("apply:kanal"));

    const sent: string[] = [];
    const stored: Record<string, unknown> = {};
    const shared = { id: TEXT, type: ChannelType.GuildText, isTextBased: () => true, send: async () => (sent.push("shared"), { id: "m1" }) };
    const own = { id: "555", type: ChannelType.GuildText, isTextBased: () => true, send: async () => (sent.push("own"), { id: "m2" }), delete: async () => undefined };
    let createdWith: { permissionOverwrites?: { id: string }[] } = {};
    const guild = {
        id: GUILD,
        name: "Dev Server",
        roles: { everyone: { id: GUILD }, cache: new Map([[ROLE, { id: ROLE }]]) },
        members: {
            me: { permissions: { has: () => true } },
            fetch: async (id: string) => {
                if (id === "222222222222222222") throw Object.assign(new Error("Unknown Member"), { code: 10007 });

                return { id };
            },
        },
        channels: {
            cache: new Map<string, unknown>([[TEXT, shared]]),
            create: async (options: typeof createdWith) => {
                createdWith = options;

                return own;
            },
        },
    };

    loose.moduleSettings.Of = async (_guild: string, _module: string, fallback: object) => ({
        ...fallback,
        channelId: TEXT,
        target: "channel",
        reviewRoles: [ROLE, "999999999999999999"],
        reviewUsers: ["111111111111111111", "222222222222222222"],
    });
    loose.applySubmissions.SetMessage = async (id: number, message: string) => void (stored[`message:${id}`] = message);
    loose.applySubmissions.SetChannel = async (id: number, channel: string | null) => void (stored[`channel:${id}`] = channel);
    Object.defineProperty(client, "user", { configurable: true, value: { id: "1" } });

    const place = (target: unknown) => (service as unknown as { Post: (...args: unknown[]) => Promise<string | null> }).Post(target, form, submission);

    check("Eigener Kanal: seine ID kommt zurück", (await place(guild)) === "555");
    check("Eigener Kanal: Karte liegt drin", sent.includes("own") && !sent.includes("shared"));
    check("Eigener Kanal: gemerkt", stored["channel:8"] === "555" && stored["message:8"] === "m2");

    // Review Plan 30: Eine gelöschte Rolle oder ein Prüfer, der weg ist, ließe Discord den ganzen Kanal ablehnen.
    const ids = (createdWith.permissionOverwrites ?? []).map((rule) => rule.id);

    check("Prüfer-Rolle und -Mitglied stehen drin", ids.includes(ROLE) && ids.includes("111111111111111111"), ids.join(", "));
    check("Gelöschte Rolle und verschwundenes Mitglied nicht", !ids.includes("999999999999999999") && !ids.includes("222222222222222222"), ids.join(", "));

    sent.length = 0;
    guild.channels.create = async () => {
        throw Object.assign(new Error("Missing Permissions"), { code: 50013 });
    };

    check("Ohne Rechte: kein eigener Kanal", (await place(guild)) === null);
    check("Ohne Rechte: Karte im Sammelkanal", sent.includes("shared"));

    const calls: string[] = [];
    const room = {
        id: "555",
        isTextBased: () => true,
        delete: async () => void calls.push("delete"),
        permissionOverwrites: { delete: async (id: string) => void calls.push(`close:${id}`) },
    };
    const withRoom = { ...guild, channels: { cache: new Map<string, unknown>([["555", room]]) } } as unknown as Guild;

    await service.AfterDecision(withRoom, decided, { ...DefaultApplySettings(), target: "channel", afterDecision: "keep" });
    check("Offen lassen: nichts passiert", calls.length === 0);
    await service.AfterDecision(withRoom, decided, { ...DefaultApplySettings(), target: "channel", afterDecision: "close" });
    check("Schließen nimmt den Bewerber raus", calls.includes(`close:${USER}`) && !calls.includes("delete"));
    await service.AfterDecision(withRoom, decided, { ...DefaultApplySettings(), target: "channel", afterDecision: "delete" });
    check("Löschen löscht den Kanal", calls.includes("delete") && stored["channel:8"] === null);
    check("Löschen vergisst auch die Karte darin", stored["message:8"] === null);
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
        channelId: null,
        createdAt: Date.now(),
    };

    const open = ApplyCard(client, form, submission);
    const json = JSON.stringify(open.components);

    // Review Plan 24: Antworten pingen nie, Ping-Rollen stehen in der Karte (content geht mit Components V2 nicht).
    const quietForm = { ...form, settings: { ...form.settings, pingRoles: [] } };
    const loudForm = { ...form, settings: { ...form.settings, pingRoles: [ROLE] } };
    const shouting = { ...submission, answers: [{ id: form.questions[0].id, value: "@everyone hallo" }] };
    const quiet = ApplyCard(client, quietForm, shouting, true);
    const loud = ApplyCard(client, loudForm, submission, true);
    const edited = ApplyCard(client, loudForm, submission);

    check("Ohne Ping-Rollen pingt die Karte niemanden", JSON.stringify(quiet.allowedMentions) === JSON.stringify({ parse: [], roles: [] }) && !("content" in quiet), JSON.stringify(quiet.allowedMentions));
    check(
        "Ping-Rollen stehen in der Karte, nicht als content",
        !("content" in loud) && JSON.stringify(loud.components).includes(`<@&${ROLE}>`) && JSON.stringify(loud.allowedMentions) === JSON.stringify({ parse: [], roles: [ROLE] }),
        JSON.stringify(loud.allowedMentions)
    );
    check("Beim Nachziehen kein Ping", !JSON.stringify(edited.components).includes(`<@&${ROLE}>`) && JSON.stringify(edited.allowedMentions) === JSON.stringify({ parse: [], roles: [] }));

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

/** Plan 26: der Knopf „Bei uns bewerben“ im Team-Hub nimmt denselben Weg wie /bewerben. */
async function checkEntryButton(client: BotClient, form: IApplyForm): Promise<void> {
    console.log("\n  — „Bei uns bewerben“ im Team-Hub —");

    const flow = client.applyService.flow;
    const original = flow.Start;
    const started: number[] = [];
    const mine = { ...form, id: 7, guildId: GUILD, open: true };
    const press = async (): Promise<string> => {
        const replies: string[] = [];

        await flow.Handle({
            customId: `${APPLY_FLOW_PREFIX}:entry`,
            isButton: () => true,
            isStringSelectMenu: () => false,
            isModalSubmit: () => false,
            inCachedGuild: () => true,
            guildId: GUILD,
            user: { id: USER },
            reply: async (payload: unknown) => void replies.push(JSON.stringify(payload)),
        } as never);

        return replies.join("\n");
    };

    flow.Start = async (_interaction: unknown, formId: number) => void started.push(formId);

    try {
        Stub(client, { forms: [mine], settings: { mode: "modal" }, modules: [] });
        check("Apply System aus: niemand gesucht", (await press()).includes("Gerade suchen wir niemanden"));

        Stub(client, { forms: [mine], settings: { mode: "web" } });
        check("Webseite: der Link", (await press()).includes(`/bewerben/${GUILD}`));

        Stub(client, { forms: [mine], settings: { mode: "modal" } });
        started.length = 0;
        await press();
        check("Ein Formular: gleich los", started.join(",") === "7", started.join(","));

        Stub(client, { forms: [mine, { ...mine, id: 8, name: "Cutter" }], settings: { mode: "dm" } });
        check("Mehrere: erst wählen", (await press()).includes(`${APPLY_FLOW_PREFIX}:pick`));
    } finally {
        flow.Start = original;
    }
}

async function main(): Promise<void> {
    console.log("\n📋  Apply System\n");

    const client = new BotClient();

    checkDefaults();
    checkTexts();

    const form = checkForm(client);

    checkSettings(client);
    checkChannelSettings(client);
    await checkCloseWarning();
    checkAnswers(client, form);
    checkCard(client, form);
    checkPanel(form);
    checkPanelDetect(form);
    checkModal(form);
    checkDrafts(client);
    checkDm();
    checkCommand(client);
    await checkEntryButton(client, form);
    checkPublic(client, form);
    await checkOldRow();

    // Ab hier ist der Client gestubbt.
    await checkEligible(client, form);
    await checkVia(client, form);
    await checkDecisionIds(client);
    await checkRemove(form);
    await checkChannelFlow(form);
    checkRealign();
    await checkDmQueue(client, form);
    await checkSweepDm(client);
    await checkResetPanel(client, form);
    await checkRestorePanel(client);

    console.log(failures === 0 ? "\n✅ Alle Prüfungen bestanden.\n" : `\n❌ ${failures} Prüfung(en) fehlgeschlagen.\n`);

    process.exit(failures > 0 ? 1 : 0);
}

void main();
