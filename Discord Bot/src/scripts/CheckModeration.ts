/**
 * Prüft das Moderations-Modul ohne Discord: Dauer-Angaben, Stufen, die Prüfung
 * der Einstellungen, Log-Ziele (Textkanal oder Forum-Beitrag), die Karten in
 * Discord - und, sofern eine Datenbank da ist, die Tabellen dahinter.
 *
 *   npm run check:moderation
 *
 * Wie check:tickets ohne Test-Framework. Alles Geschriebene hängt an einer
 * erfundenen Guild-ID und wird am Ende wieder entfernt. Bannen, Kicken und
 * Timeouts selbst brauchen einen echten Server - die fängt erst ein Lauf dort.
 */
process.env.CLIENT_SECRET ||= "check-secret";
process.env.DEV_CLIENT_SECRET ||= "check-secret";

import { ChannelType, Guild, GuildBasedChannel, GuildMember, Message, Role } from "discord.js";
import { SetEmojiLoader } from "../builder/HelpImage";
import { CaseBlocks, CaseCard, EvidenceView, ReadCaseId } from "../builder/ModerationCard";
import BotClient from "../client/BotClient";
import { CaseView, DirectView, DoneView, EvidenceId, HistoryView, ReadEvidenceId, SaveEvidenceView, StatusText, SupportCard } from "../builder/ModerationView";
import { DefaultModConfig, FormatDuration, MAX_EVIDENCE, MAX_REASON, MAX_SUPPORT_REMIND, MAX_SUPPORT_ROLES, ParseDuration, ParseMessageLink, ProofNeeded, StageFor } from "../constants/Moderation";
import { IModCase, IModEvidence } from "../interfaces/services/moderation/IModeration";
import { ModerationError } from "../services/ModerationService";
import { ActInput } from "../routes/DashboardApiModeration";
import { IsLogTarget } from "../utils/logtarget";
import { ReadDuration } from "../utils/modcommand";

// Erfundene Snowflakes - 17-stellig wie echte, aber es gibt sie bei Discord nicht.
const GUILD = "90071992547409981";
const USER = "90071992547409982";
const MOD = "90071992547409983";
const TEXT = "90071992547409984";
const THREAD = "90071992547409985";
const VOICE = "90071992547409986";
const FORUM = "90071992547409987";
const ROLE = "90071992547409988";

let failures = 0;

function check(name: string, passed: boolean, detail = ""): void {
    if (!passed) failures++;

    console.log(`  ${passed ? "ok  " : "FAIL"} ${name}${passed || !detail ? "" : `  → ${detail}`}`);
}

function FakeGuild(): Guild {
    const channel = (id: string, type: ChannelType) => ({ id, type }) as unknown as GuildBasedChannel;

    return {
        id: GUILD,
        channels: {
            cache: new Map([
                [TEXT, channel(TEXT, ChannelType.GuildText)],
                [THREAD, channel(THREAD, ChannelType.PublicThread)],
                [VOICE, channel(VOICE, ChannelType.GuildVoice)],
                [FORUM, channel(FORUM, ChannelType.GuildForum)],
            ]),
        },
        roles: { cache: new Map([[ROLE, { id: ROLE } as unknown as Role], [GUILD, { id: GUILD } as unknown as Role]]) },
    } as unknown as Guild;
}

function SampleCase(patch: Partial<IModCase> = {}): IModCase {
    return {
        id: 1,
        guildId: GUILD,
        number: 12,
        action: "warn",
        targetId: USER,
        targetName: "xX_Dribbler_Xx",
        moderatorId: MOD,
        moderatorName: "Helfer Hanna",
        reason: "Spam in #allgemein",
        duration: null,
        expiresAt: null,
        active: true,
        source: "dashboard",
        related: null,
        details: { warns: 3, dm: true, stage: { warns: 3, action: "timeout", duration: 3_600, case: 13 } },
        evidence: [],
        notes: [],
        logChannel: null,
        logMessage: null,
        createdAt: Date.now(),
        ...patch,
    };
}

function checkDurations(): void {
    console.log("\n  — Dauer-Angaben —");

    const cases: [string, number | null][] = [
        ["10m", 600],
        ["1h30m", 5_400],
        ["1h 30m", 5_400],
        ["2 Tage", 172_800],
        ["90", 5_400],
        ["1w", 604_800],
        ["3 foo", null],
        ["abc", null],
        ["", null],
    ];

    for (const [text, expected] of cases) check(`"${text}" → ${expected}`, ParseDuration(text) === expected, String(ParseDuration(text)));

    check("5400 s heißen 1 Std. 30 Min.", FormatDuration(5_400) === "1 Std. 30 Min.", FormatDuration(5_400));
    check("Eine Woche heißt 7 Tage", FormatDuration(604_800) === "7 Tage", FormatDuration(604_800));
    check("Unter einer Minute in Sekunden", FormatDuration(45) === "45 Sek.", FormatDuration(45));
    check("\"dauerhaft\" beim Bann: keine Dauer", ReadDuration("dauerhaft", true) === null);

    let threw = false;

    try {
        ReadDuration("3 foo", true);
    } catch (error) {
        threw = error instanceof ModerationError;
    }

    check("Ein Tippfehler wird kein dauerhafter Bann", threw);
}

function checkStages(client: BotClient): void {
    console.log("\n  — Stufen —");

    const stages = DefaultModConfig().stages;

    check("Standard: 3 Verwarnungen → Timeout", StageFor(stages, 3)?.action === "timeout");
    check("Standard: bei der vierten passiert nichts", StageFor(stages, 4) === null);
    check("Standard: 5 Verwarnungen → Kick", StageFor(stages, 5)?.action === "kick");

    const cleaned = client.moderationService.CleanStages([
        { warns: 5, action: "kick", duration: 999 },
        { warns: 2, action: "timeout", duration: 600 },
        { warns: 2, action: "ban", duration: null },
        { warns: 7, action: "timeout" },
        { warns: 8, action: "ban", duration: null },
        { warns: 0, action: "kick" },
        { warns: 9, action: "explode" },
        "quatsch",
    ]);

    check("Ungültige Stufen fallen raus, doppelte Zahlen auch", cleaned.length === 3, JSON.stringify(cleaned));
    check("Aufsteigend sortiert", cleaned.map((stage) => stage.warns).join(",") === "2,5,8", JSON.stringify(cleaned));
    check("Ein Kick hat keine Dauer", cleaned.find((stage) => stage.action === "kick")?.duration === null);
    check("Ein Bann ohne Dauer bleibt dauerhaft", cleaned.find((stage) => stage.action === "ban")?.duration === null);
}

function checkConfig(client: BotClient): void {
    console.log("\n  — Einstellungen und Log-Ziele —");

    const guild = FakeGuild();
    const previous = DefaultModConfig();
    const service = client.moderationService;

    check("Ein Textkanal ist ein Log-Ziel", IsLogTarget(guild.channels.cache.get(TEXT)));
    check("Ein Forum-Beitrag (Thread) auch", IsLogTarget(guild.channels.cache.get(THREAD)));
    check("Ein Sprachkanal nicht", !IsLogTarget(guild.channels.cache.get(VOICE)));
    check("Das Forum selbst nicht - nur seine Beiträge", !IsLogTarget(guild.channels.cache.get(FORUM)));

    check("Log in einen Forum-Beitrag wird gespeichert", service.Clean(guild, { logChannelId: THREAD }, previous).logChannelId === THREAD);
    check("Ein fremder Kanal wird zu keinem", service.Clean(guild, { logChannelId: "12345678901234567" }, previous).logChannelId === null);
    check("Ohne Angabe bleibt der Log-Kanal", service.Clean(guild, {}, { ...previous, logChannelId: TEXT }).logChannelId === TEXT);
    check("Verwarnungen zählen höchstens ein Jahr", service.Clean(guild, { warnDays: 9999 }, previous).warnDays === previous.warnDays);
    check("30 Tage gehen", service.Clean(guild, { warnDays: 30 }, previous).warnDays === 30);

    let threw = false;

    try {
        service.Clean(guild, "kaputt", previous);
    } catch (error) {
        threw = error instanceof ModerationError;
    }

    check("Keine Einstellungen - ein klarer Fehler", threw);

    console.log("\n  — Support-Warteraum —");

    const support = service.CleanSupport(guild, { channelId: VOICE, notifyChannelId: TEXT, roles: [ROLE, GUILD, ROLE, "999"], remindAfter: 15 }, previous.support);

    check("Ab Werk ist der Warteraum aus", previous.support.channelId === null && previous.support.remindAfter === 10);
    check("Ein Sprachkanal wird Warteraum", support.channelId === VOICE);
    check("Die Meldung geht in einen Textkanal", support.notifyChannelId === TEXT);
    check("Doppelte und erfundene Rollen fallen weg, @everyone auch", support.roles.join(",") === ROLE, support.roles.join(","));
    check("Die Wartezeit kommt an", support.remindAfter === 15);
    check("Ein Textkanal taugt nicht als Warteraum", service.CleanSupport(guild, { channelId: TEXT }, previous.support).channelId === null);
    check("Ein Sprachkanal nicht als Meldekanal", service.CleanSupport(guild, { notifyChannelId: VOICE }, previous.support).notifyChannelId === null);
    check("Zu lange Wartezeit wird gedeckelt", service.CleanSupport(guild, { remindAfter: 9999 }, previous.support).remindAfter === MAX_SUPPORT_REMIND);
    check("Rollen sind gedeckelt", service.CleanSupport(guild, { roles: Array.from({ length: MAX_SUPPORT_ROLES + 3 }, () => ROLE) }, previous.support).roles.length <= MAX_SUPPORT_ROLES);
    check("Clean nimmt den Warteraum mit", service.Clean(guild, { support: { channelId: VOICE, notifyChannelId: TEXT } }, previous).support.channelId === VOICE);

    threw = false;

    try {
        service.CleanSupport(guild, { channelId: VOICE, notifyChannelId: null }, previous.support);
    } catch (error) {
        threw = error instanceof ModerationError;
    }

    check("Ein Warteraum ohne Meldekanal wird abgewiesen", threw);

    console.log("\n  — Die Meldung im Team-Kanal —");

    const base = { userId: USER, name: "Lara", channelId: VOICE, since: Date.now(), claimedBy: null };
    const waiting = JSON.stringify(SupportCard({ ...base, state: "waiting", ping: `<@&${ROLE}>` }).components[0].toJSON());

    check("Sie nennt, wer wartet und wo", waiting.includes(`<@${USER}>`) && waiting.includes(`<#${VOICE}>`));
    check("Der Ping steht im Text - V2 kennt kein content", waiting.includes(`<@&${ROLE}>`));
    check("Mit Knopf zum Übernehmen", waiting.includes(`voicesupport:take:${USER}`));

    const claimed = JSON.stringify(SupportCard({ ...base, claimedBy: MOD, state: "claimed" }).components[0].toJSON());

    check("Übernommen nennt den Teamler", claimed.includes(`<@${MOD}>`));
    check("Und holt per Knopf zu ihm", claimed.includes("Zu mir holen") && claimed.includes(`voicesupport:take:${USER}`));
    check("Ohne den Ping von vorhin", !claimed.includes(`<@&${ROLE}>`));

    const moved = JSON.stringify(SupportCard({ ...base, claimedBy: MOD, state: "moved", target: TEXT }).components[0].toJSON());

    check("Im Gespräch steht, wo es weitergeht", moved.includes(`<#${TEXT}>`) && !moved.includes("voicesupport:take"));

    const left = JSON.stringify(SupportCard({ ...base, state: "left" }).components[0].toJSON());

    check("Wer geht, schließt die Meldung ohne Knopf", left.includes("verlassen") && !left.includes("voicesupport:take"));
}

function checkViews(): void {
    console.log("\n  — Karten in Discord —");

    const warn = SampleCase();
    const ban = SampleCase({ number: 9, action: "ban", duration: 604_800, expiresAt: Date.now() + 604_800_000, details: { deleteSeconds: 86_400, dm: false } });
    const ended = SampleCase({ active: false, details: { ended: { how: "lifted", at: Date.now(), by: MOD, byName: "Helfer Hanna", reason: null, case: 14 } } });
    const long = SampleCase({ reason: "x".repeat(MAX_REASON), notes: Array.from({ length: 50 }, (_, index) => ({ id: index, by: MOD, byName: "Hanna", at: 0, text: "y".repeat(1000) })) });

    for (const [name, entry] of [["Verwarnung", warn], ["Bann", ban], ["aufgehoben", ended], ["sehr lang", long]] as const) {
        let fine = true;

        try {
            CaseView(entry, "https://example.com/fall");
            DirectView(entry, "Dev Server");
            DoneView(entry, true);
        } catch (error) {
            fine = false;
            check(`Karten für "${name}"`, false, String(error));
        }

        if (fine) check(`Karten für "${name}" bauen sich`, true);
    }

    check("Status: gilt bis …", StatusText(ban).startsWith("gilt bis"));
    check("Status: aufgehoben durch Fall #14", StatusText(ended).includes("#14"), StatusText(ended));
    check("Verlauf mit zehn Fällen", HistoryView("Kevin", Array.from({ length: 10 }, () => warn), { warn: 10 }, null).components.length === 1);

    const dm = JSON.stringify(DirectView(warn, "Dev Server").components[0].toJSON());

    check("Die DM nennt den Moderator nicht", !dm.includes("Helfer Hanna"));
    check("Die DM nennt die Zahl der Verwarnungen", dm.includes("3."));

    const missing = JSON.stringify(DoneView(warn, true, ["Bild: Das Bild ist größer als 8 MB."]).components.map((part) => part.toJSON()));

    check("Die Antwort nennt, welcher Beweis fehlt", missing.includes("Nicht gesichert") && missing.includes("Bild: Das Bild ist größer als 8 MB."), missing.slice(0, 300));
    check("Ohne Problem kein Hinweis", !JSON.stringify(DoneView(warn, true).components.map((part) => part.toJSON())).includes("Nicht gesichert"));
}

function checkProof(client: BotClient): void {
    console.log("\n  — Beweis-Pflicht und Nachrichtenlinks —");

    const off = DefaultModConfig();
    const strict = { ...off, proof: { ban: true, kick: true, timeoutFrom: 86_400, warn: true } };
    const tail = "einen Beweis. Häng ein Bild an, gib einen Link an oder sichere die Nachricht per Rechtsklick › Apps › „Als Beweis sichern“.";

    check("Ab Werk braucht nichts einen Beweis", (["ban", "kick", "timeout", "warn"] as const).every((action) => ProofNeeded(off, { action, duration: 999_999 }) === null));
    check("Bann mit Pflicht: der ganze Satz", ProofNeeded(strict, { action: "ban" }) === `Auf diesem Server braucht ein Bann ${tail}`, String(ProofNeeded(strict, { action: "ban" })));
    check("Kick", ProofNeeded(strict, { action: "kick" })?.includes("braucht ein Kick einen Beweis") === true);
    check("Verwarnung", ProofNeeded(strict, { action: "warn" })?.includes("braucht eine Verwarnung einen Beweis") === true);
    check("Timeout unter der Grenze braucht keinen", ProofNeeded(strict, { action: "timeout", duration: 3_600 }) === null);
    check("Timeout ab der Grenze schon", ProofNeeded(strict, { action: "timeout", duration: 86_400 })?.includes("braucht ein Timeout ab 1 Tag einen Beweis") === true);
    check("Timeout ohne Grenze nie", ProofNeeded({ ...strict, proof: { ...strict.proof, timeoutFrom: null } }, { action: "timeout", duration: 604_800 }) === null);
    check("Entbannen braucht nie einen", ProofNeeded(strict, { action: "unban" }) === null);

    const parsed = ParseMessageLink(`https://discord.com/channels/${GUILD}/${TEXT}/${THREAD}`, GUILD);

    check("Ein Nachrichtenlink dieses Servers wird gelesen", parsed?.channelId === TEXT && parsed.messageId === THREAD, JSON.stringify(parsed));
    check("Auch von canary", ParseMessageLink(`https://canary.discord.com/channels/${GUILD}/${TEXT}/${THREAD}`, GUILD)?.messageId === THREAD);
    check("Ein fremder Server nicht", ParseMessageLink(`https://discord.com/channels/12345678901234567/${TEXT}/${THREAD}`, GUILD) === null);
    check("Eine DM nicht", ParseMessageLink(`https://discord.com/channels/@me/${TEXT}/${THREAD}`, GUILD) === null);
    check("Unsinn nicht", ParseMessageLink("schau mal hier", GUILD) === null);

    const guild = FakeGuild();
    const service = client.moderationService;
    const cleaned = service.Clean(guild, { proof: { ban: true, kick: "ja", timeoutFrom: 604_800, warn: false } }, off);

    check("Clean übernimmt die Pflicht", cleaned.proof.ban && !cleaned.proof.kick && cleaned.proof.timeoutFrom === 604_800 && !cleaned.proof.warn, JSON.stringify(cleaned.proof));
    check("Eine erfundene Dauer wird zu keiner", service.Clean(guild, { proof: { timeoutFrom: 1_234 } }, strict).proof.timeoutFrom === null);
    check("Ohne Angabe bleibt die Pflicht", service.Clean(guild, {}, strict).proof.warn === true);

    const input = ActInput({ action: "warn", targetId: USER, reason: "Spam", proofLink: "  https://clips.example.com/1  " });

    check("Dashboard: der Beweis-Link wird gelesen", input.proof.link === "https://clips.example.com/1" && input.request.action === "warn" && input.request.reason === "Spam");
    check("Dashboard: ohne Link kein Beweis", ActInput({ action: "warn", proofLink: 5 }).proof.link === null && ActInput({ action: "warn", proofLink: "  " }).proof.link === null);

    console.log("\n  — Rechtsklick „Als Beweis sichern“ —");

    const id = EvidenceId("fall", TEXT, THREAD);

    check("Die ID trägt Kanal und Nachricht", id === `mbw:fall:${TEXT}:${THREAD}` && id.length <= 100, id);
    check("Und wird wieder gelesen", JSON.stringify(ReadEvidenceId(id)) === JSON.stringify({ kind: "fall", channelId: TEXT, messageId: THREAD }));
    check("Fenster-ID auch", ReadEvidenceId(EvidenceId("grund", TEXT, THREAD))?.kind === "grund");
    check("Fremde IDs nicht", ReadEvidenceId("mf:ev:12:1") === null && ReadEvidenceId(`mbw:boom:${TEXT}:${THREAD}`) === null && ReadEvidenceId("mbw:fall:abc:def") === null);

    const preview = { channelId: TEXT, messageId: THREAD, authorName: "Kevin", channelName: "allgemein", content: "Du bist so schlecht", sentAt: 1_700_000_000_000 };
    const many = Array.from({ length: 30 }, (_, index) => SampleCase({ number: ((index * 7) % 30) + 1 }));
    const menu = SaveEvidenceView(preview, many).components[0].toJSON() as unknown as { components: { type: number; components?: { type: number; custom_id?: string; options?: { value: string }[] }[] }[] };
    const select = menu.components.flatMap((row) => row.components ?? []).find((part) => part.type === 3);
    const json = JSON.stringify(menu);

    check("Menü: höchstens 25 Fälle", select?.options?.length === 25, String(select?.options?.length));
    check("Menü: neueste zuerst", select?.options?.[0].value === "30" && select.options[24].value === "6", select?.options?.map((option) => option.value).join(","));
    check("Menü: mit Knopf für eine neue Verwarnung", json.includes(`mbw:warn:${TEXT}:${THREAD}`) && json.includes("Neue Verwarnung damit"));
    check("Menü: zeigt die Nachricht", json.includes("Du bist so schlecht") && json.includes("Kevin") && json.includes("allgemein"));

    const none = JSON.stringify(SaveEvidenceView(preview, []).components[0].toJSON());

    check("Ohne Fälle: kein Menü, nur der Knopf", !none.includes(`mbw:fall:`) && none.includes(`mbw:warn:${TEXT}:${THREAD}`));
}

async function checkCard(): Promise<void> {
    console.log("\n  — Log-Karte und Beweis-Ansicht —");

    SetEmojiLoader(async () => null);

    const at = Date.now();
    const by = { by: MOD, byName: "Joe", at };
    const evidence: IModEvidence[] = [
        { id: 1, kind: "image", value: "1.png", name: "chat.png", ...by },
        {
            id: 2,
            kind: "message",
            value: `https://discord.com/channels/${GUILD}/${TEXT}/${THREAD}`,
            name: "kauft alle",
            message: { authorId: USER, authorName: "Lena", channelId: TEXT, channelName: "allgemein", content: "kauft alle meinen discord nitro", sentAt: at },
            ...by,
        },
        { id: 3, kind: "link", value: "https://clips.example.com/1", name: null, ...by },
        { id: 4, kind: "link", value: "https://clips.example.com/2", name: null, ...by },
    ];
    const withProof = SampleCase({ number: 128, evidence });
    const toJson = (parts: { toJSON(): unknown }[]) => JSON.stringify(parts.map((part) => part.toJSON()));
    const card = await CaseCard(withProof, { link: "https://example.com/fall", recent: 3 });
    const json = toJson(card.components);

    check("Karte: ein Bild als Anhang", card.files.length >= 1 && json.includes("attachment://fall-128"), json.slice(0, 200));
    check("Karte: Knöpfe „Alle 4 ansehen“, „Fall“, „Notiz“", json.includes("Alle 4 ansehen") && json.includes("mf:ev:128:0") && json.includes("mf:fall:128") && json.includes("mf:notiz:128"));
    check("Karte: Link ins Dashboard", json.includes("https://example.com/fall"));
    check("Karte: der User bleibt per Erwähnung auffindbar", json.includes(`<@${USER}>`));

    const blocks = CaseBlocks(withProof, { link: null, recent: 3 });
    const text = JSON.stringify(blocks);
    const rows = blocks.find((block) => block.kind === "evidence");

    check("Kopf: Fall, Aktion und Zählung", text.includes("Fall #128 · Verwarnung") && text.includes("3. Fall in 30 Tagen"), text.slice(0, 300));
    check("Kopf: von wem und warum", text.includes("Helfer Hanna") && text.includes("Spam in #allgemein"));
    check("Höchstens drei Beweise in der Karte", rows?.kind === "evidence" && rows.items.length === 3);
    check("Die Nachricht als Zitat mit Kanal", text.includes("„kauft alle meinen discord nitro“") && text.includes("#allgemein"));

    const bare = toJson((await CaseCard(SampleCase({ number: 129 }), { link: null, recent: 1 })).components);

    check("Ohne Beweise kein Knopf „Alle ansehen“", !bare.includes("mf:ev:") && bare.includes("mf:fall:129"));

    const view = await EvidenceView(withProof, 1, { link: "https://example.com/fall" });
    const viewJson = toJson(view.components);
    const options = (viewJson.match(/"value":"\d+"/g) ?? []).length;

    check("Ansicht: Kopf als Bild", view.files.length >= 1 && viewJson.includes("attachment://") && viewJson.includes("Beweis 2 von 4"));
    check("Ansicht: blättert vor und zurück", viewJson.includes("mf:ev:128:0") && viewJson.includes("mf:ev:128:2"));
    check("Ansicht: Menü mit allen Beweisen", options === 4 && viewJson.includes(`"custom_id":"mf:ev:128"`), String(options));
    check("Ansicht: „Original öffnen“ führt zur Nachricht", viewJson.includes(evidence[1].value) && viewJson.includes("Original öffnen"));
    check("Ansicht: zu weit blättern bleibt beim letzten", toJson((await EvidenceView(withProof, 99, { link: null })).components).includes("Beweis 4 von 4"));

    check("IDs der Karte werden gelesen", JSON.stringify(ReadCaseId("mf:ev:128:2")) === JSON.stringify({ kind: "ev", number: 128, index: 2 }));
    check("Auch ohne Index und für Fall und Notiz", ReadCaseId("mf:ev:128")?.index === null && ReadCaseId("mf:fall:128")?.kind === "fall" && ReadCaseId("mf:notiz:128")?.kind === "notiz");
    check("Fremde IDs nicht", ReadCaseId(`mbw:fall:${TEXT}:${THREAD}`) === null && ReadCaseId("mf:boom:1") === null);
}

async function checkDatabase(client: BotClient): Promise<void> {
    console.log("\n  — Datenbank —");

    const cases = client.modCases;
    const base = {
        guildId: GUILD,
        targetId: USER,
        targetName: "Kevin",
        moderatorId: MOD,
        moderatorName: "Hanna",
        reason: "Test",
        duration: null,
        expiresAt: null,
        source: "dashboard" as const,
        related: null,
        details: {},
    };

    const first = await cases.Create({ ...base, action: "warn", active: true });
    const second = await cases.Create({ ...base, action: "timeout", active: true, duration: 60, expiresAt: Date.now() - 1_000, related: first.number });

    check("Fälle werden je Server fortlaufend nummeriert", second.number === first.number + 1, `${first.number}, ${second.number}`);
    check("Fall #1 steht wieder so da", (await cases.Get(GUILD, first.number))?.reason === "Test");
    check("Suche nach Nummer", (await cases.List(GUILD, { query: `#${second.number}` }, null, 10)).length === 1);
    check("Suche nach User-ID", (await cases.List(GUILD, { query: USER }, null, 10)).length === 2);
    check("Filter: nur Verwarnungen", (await cases.List(GUILD, { action: "warn" }, null, 10)).every((entry) => entry.action === "warn"));
    check("Aktive Verwarnungen des Users", (await cases.ActiveOf(GUILD, USER, "warn")).length === 1);
    check("Zählen je Aktion", (await cases.CountsOf(GUILD, USER)).timeout === 1);
    check("Der abgelaufene Timeout ist fällig", (await cases.Due(Date.now())).some((entry) => entry.id === second.id));
    check("Zusammenhang: der Timeout bezieht sich auf den Warn", (await cases.RelatedTo(GUILD, first.number)).some((entry) => entry.id === second.id));

    const noted = await cases.Mutate(first.id, (current) => ({ notes: [...current.notes, { id: 1, by: MOD, byName: "Hanna", at: Date.now(), text: "Notiz" }] }));

    check("Eine Notiz wird angehängt", noted?.notes.length === 1);

    const ended = await cases.Mutate(first.id, (current) => ({ active: false, details: { ...current.details, ended: { how: "lifted", at: Date.now(), by: MOD, byName: "Hanna", reason: null, case: second.number } } }));

    check("Beenden setzt den Status", ended?.active === false && ended.details.ended?.case === second.number);
    check("Die Zahlen oben", (await cases.Stats(GUILD)).total === 2);

    let rolled = false;

    try {
        await cases.Mutate(first.id, () => {
            throw new ModerationError("abgelehnt");
        });
    } catch (error) {
        rolled = error instanceof ModerationError;
    }

    check("Ein Fehler beim Ändern lässt den Fall, wie er war", rolled && (await cases.ById(first.id))?.notes.length === 1);

    const config = { ...DefaultModConfig(), logChannelId: THREAD, warnDays: 30 };

    await client.modSettings.Save(GUILD, config);

    const stored = await client.modSettings.Of(GUILD);

    check("Einstellungen kommen so zurück", stored.logChannelId === THREAD && stored.warnDays === 30 && stored.stages.length === 2);
}

/** Eine Nachricht, wie sie der Rechtsklick liefert - nur was AddMessage liest. */
function FakeMessage(content: string): Message {
    return {
        id: THREAD,
        url: `https://discord.com/channels/${GUILD}/${TEXT}/${THREAD}`,
        content,
        createdTimestamp: 1_700_000_000_000,
        channelId: TEXT,
        channel: { id: TEXT, name: "allgemein" },
        author: { id: USER, username: "kevin" },
        member: { displayName: "Kevin" },
        attachments: new Map(),
    } as unknown as Message;
}

async function checkEvidence(client: BotClient): Promise<void> {
    console.log("\n  — Beweise —");

    const service = client.moderationService;
    const guild = FakeGuild();
    const author = { id: MOD, name: "Hanna", member: null };
    const entry = await client.modCases.Create({
        guildId: GUILD,
        action: "warn",
        targetId: USER,
        targetName: "Kevin",
        moderatorId: MOD,
        moderatorName: "Hanna",
        reason: "Beleidigung",
        duration: null,
        expiresAt: null,
        active: true,
        source: "discord",
        related: null,
        details: {},
    });

    const saved = await service.AddMessage(guild, author, entry.number, FakeMessage("Du bist so schlecht, deinstallier das Spiel"));
    const item = saved.entry.evidence.at(-1);

    check("Die Nachricht wird ein Beweis der Art Nachricht", item?.kind === "message" && saved.problems.length === 0, JSON.stringify(item));
    check("Mit Sprunglink", item?.value === `https://discord.com/channels/${GUILD}/${TEXT}/${THREAD}`);
    check(
        "Mit Verfasser, Kanal, Zeit und Text",
        item?.message?.authorId === USER &&
            item.message.authorName === "Kevin" &&
            item.message.channelName === "allgemein" &&
            item.message.sentAt === 1_700_000_000_000 &&
            item.message.content.startsWith("Du bist")
    );
    check("Der Text ist gedeckelt", (await service.AddMessage(guild, author, entry.number, FakeMessage("x".repeat(3_000)))).entry.evidence.at(-1)?.message?.content.length === 2_000);

    const linked = await service.AddProof(guild, author, entry.number, { link: "https://clips.example.com/42" });

    check("Ein https-Link bleibt ein Link", linked.entry.evidence.at(-1)?.kind === "link" && linked.problems.length === 0);

    const foreign = await service.AddProof(guild, author, entry.number, { link: `https://discord.com/channels/12345678901234567/${TEXT}/${THREAD}` });

    check("Ein Nachrichtenlink von woanders: ein Problem, kein Absturz", foreign.problems.length === 1 && foreign.problems[0].includes("anderen Server"), foreign.problems.join(" | "));
    check("Und kein Beweis dazu", foreign.entry.evidence.length === linked.entry.evidence.length);

    await client.modCases.Mutate(entry.id, (current) => ({
        evidence: Array.from({ length: MAX_EVIDENCE }, (_, index) => ({ ...current.evidence[0], id: index + 1 })),
    }));

    let full = "";

    try {
        await service.AddMessage(guild, author, entry.number, FakeMessage("noch eine"));
    } catch (error) {
        full = error instanceof ModerationError ? error.message : String(error);
    }

    check("Bei 20 Beweisen ist Schluss", full.startsWith(`Mehr als ${MAX_EVIDENCE}`), full);

    const fullProof = await service.AddProof(guild, author, entry.number, { link: "https://clips.example.com/43" });

    check("AddProof meldet das als Problem", fullProof.problems.some((problem) => problem.includes(`Mehr als ${MAX_EVIDENCE}`)), fullProof.problems.join(" | "));

    // Zwei Fälle aus checkDatabase und dieser: alle drei in 30 Tagen.
    check("„3. Fall in 30 Tagen“ zählt Verwarnungen und Timeouts", (await client.modCases.RecentPenalties(GUILD, USER, entry.createdAt)) === 3);

    await client.settings.Save({ ...(await client.settings.Of(GUILD)), modules: ["moderation"] });

    const stranger = { id: USER, guild: { id: GUILD, ownerId: MOD }, permissions: { has: () => false }, roles: { cache: new Map() } } as unknown as GuildMember;
    let gate = "";

    try {
        await service.TeamGate(stranger);
    } catch (error) {
        gate = error instanceof ModerationError ? error.message : String(error);
    }

    check("Knöpfe ohne Team-Recht: abgelehnt", gate === "Das sieht nur das Moderations-Team.", gate);

    await client.modSettings.Save(GUILD, { ...DefaultModConfig(), proof: { ban: false, kick: false, timeoutFrom: null, warn: true } });

    const owner = { id: MOD, displayName: "Hanna", guild: { id: GUILD, ownerId: MOD }, permissions: { has: () => true }, roles: { cache: new Map() } } as unknown as GuildMember;
    const before = (await client.modCases.List(GUILD, {}, null, 50)).length;
    let refused = "";

    try {
        await service.ActWithProof(guild, owner, { action: "warn", targetId: USER, reason: "Test" }, "dashboard");
    } catch (error) {
        refused = error instanceof ModerationError ? error.message : String(error);
    }

    check("Pflicht ohne Beweis: abgelehnt", refused.startsWith("Auf diesem Server braucht eine Verwarnung einen Beweis."), refused);
    check("Und es entsteht kein Fall", (await client.modCases.List(GUILD, {}, null, 50)).length === before);
}

async function cleanup(client: BotClient): Promise<void> {
    await client.databaseService.Write("DELETE FROM mod_cases WHERE guild_id = ?", [GUILD]);
    await client.databaseService.Write("DELETE FROM mod_settings WHERE guild_id = ?", [GUILD]);
    await client.databaseService.Write(`DELETE FROM \`${client.settings.Table}\` WHERE guild_id = ?`, [GUILD]);

    client.modCases.Forget();
    client.modSettings.Forget();
    client.settings.Forget();

    check("Aufgeräumt", (await client.modCases.List(GUILD, {}, null, 10)).length === 0);
}

async function main(): Promise<void> {
    console.log("\n🛡️ Moderation\n");

    const client = new BotClient();

    await client.configService.Initialize();

    checkDurations();
    checkStages(client);
    checkConfig(client);
    checkViews();
    checkProof(client);
    await checkCard();

    if (await client.databaseService.Connect()) {
        try {
            await checkDatabase(client);
            await checkEvidence(client);
        } finally {
            console.log("\n  — Aufräumen —");

            await cleanup(client).catch((error) => check("Aufräumen lief durch", false, String(error)));
            await client.databaseService.Close();
        }
    } else {
        console.log("\n  — Datenbank —\n  übersprungen: keine Verbindung (siehe Meldung oben)");
    }

    console.log(failures === 0 ? "\n✅ Alle Prüfungen bestanden.\n" : `\n❌ ${failures} Prüfung(en) fehlgeschlagen.\n`);

    process.exit(failures > 0 ? 1 : 0);
}

void main();
