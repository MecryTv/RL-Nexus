/**
 * Prüft Matchups ohne Discord und ohne Datenbank: das Säubern der
 * Einstellungen, die Regeln beim Eintragen, wer eintragen darf und die
 * Platzhalter der drei Nachrichten.
 *
 *   npm run check:matchups
 *
 * Ob Discord die Nachricht wirklich schickt, sieht nur ein echter Server.
 */
process.env.CLIENT_SECRET ||= "check-secret";
process.env.DEV_CLIENT_SECRET ||= "check-secret";

import path from "path";
import { existsSync, readFileSync } from "fs";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, Guild, GuildBasedChannel, GuildMember, MessageFlags, PermissionFlagsBits, Role } from "discord.js";
import BotClient from "../client/BotClient";
import { MatchupAccent, MatchupHead, MatchupRows, MatchupValues, MatchupView, ResultAsk } from "../builder/MatchupView";
import { Fill } from "../constants/Placeholders";
import {
    DefaultAnnounce,
    DefaultMatchupSettings,
    DefaultResult,
    ENTRY_ROLES,
    FormText,
    KickoffSuggestions,
    KICKOFF_HELP,
    LIVE_HOURS,
    LegacyAnnounce,
    LegacyRemind,
    LegacyResult,
    MATCHUP_KEYS,
    MATCHUP_IMAGES,
    MAX_AHEAD,
    MAX_REMIND,
    MODE_LABELS,
    MatchupLink,
    MatchupRecord,
    ParseKickoff,
    RecordText,
    RESULT_KEYS,
    StreakText,
} from "../constants/Matchups";
import { IMatchup, IMatchupSettings } from "../interfaces/services/matchups/IMatchups";
import { ITeam, ITeamPlayer, TeamRole } from "../interfaces/services/teams/ITeams";
import { MatchupError, NormalizeMatchupSettings } from "../services/MatchupService";
import MatchupButtons from "../events/matchups/MatchupButtons";
import MatchupCommand from "../commands/user/Matchup";
import DashboardApiMatchupsPublic from "../routes/DashboardApiMatchupsPublic";
import { SESSION_COOKIE } from "../constants/Dashboard";
import MatchupsModel from "../models/Matchups";

const GUILD = "90071992547409961";
const TEXT = "90071992547409962";
const VOICE = "90071992547409963";
const ROLE = "90071992547409964";
const CAPTAIN = "90071992547409965";
const PLAYER = "90071992547409966";

const HOUR = 3_600_000;
const DAY = 86_400_000;

let failures = 0;

function check(name: string, passed: boolean, detail = ""): void {
    if (!passed) failures++;

    console.log(`  ${passed ? "ok  " : "FAIL"} ${name}${passed || !detail ? "" : `  → ${detail}`}`);
}

async function refuses(name: string, action: () => Promise<unknown>): Promise<void> {
    try {
        await action();
        check(name, false, "ging durch");
    } catch (error) {
        check(name, error instanceof MatchupError, String(error));
    }
}

function FakeGuild(): Guild {
    const channel = (id: string, type: ChannelType) =>
        ({ id, type, name: `kanal-${id.slice(-2)}`, isTextBased: () => type === ChannelType.GuildText, isThread: () => false }) as unknown as GuildBasedChannel;

    return {
        id: GUILD,
        name: "Dev Server",
        channels: {
            cache: new Map([
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

function FakeMember(guild: Guild, id: string, manage = false): GuildMember {
    return {
        id,
        guild,
        displayName: id === CAPTAIN ? "Nico" : "Timo",
        permissions: { has: (flag: bigint) => manage && flag === PermissionFlagsBits.ManageGuild },
    } as unknown as GuildMember;
}

function Player(discordId: string | null, role: TeamRole): ITeamPlayer {
    return { id: `p-${role}`, discordId, name: role, epicName: "", role, peaks: { "1v1": null, "2v2": null, "3v3": null } };
}

function FakeTeam(): ITeam {
    return {
        id: 7,
        guildId: GUILD,
        groupId: null,
        name: "Vyrox Main",
        tag: "VYX",
        description: "",
        color: null,
        logo: null,
        roleId: ROLE,
        channels: { kind: "channels", categoryId: null, textIds: [], voiceIds: [] },
        created: { roleId: null, categoryId: null, textIds: [], voiceIds: [] },
        links: [],
        players: [Player(CAPTAIN, "captain"), Player(PLAYER, "player"), Player(null, "coach")],
        position: 0,
        messageId: null,
        createdAt: 0,
        updatedAt: 0,
    };
}

function FakeMatchup(over: Partial<IMatchup> = {}): IMatchup {
    return {
        id: 3,
        guildId: GUILD,
        teamId: 7,
        teamName: "Vyrox Main",
        opponent: "Ascension",
        league: "RLCS Quali",
        mode: "3v3",
        bestOf: 5,
        at: 1_800_000_000_000,
        stream: "https://twitch.tv/mecrytv",
        note: "Server EU",
        status: "planned",
        score: null,
        messageId: null,
        remindedAt: null,
        liveAt: null,
        resultRemindedAt: null,
        resultMessageId: null,
        createdBy: CAPTAIN,
        createdName: "Nico",
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
        ...over,
    };
}

/* ----------------------------------------------------------
   Einstellungen
   ---------------------------------------------------------- */
function checkClean(client: BotClient): void {
    console.log("\n  — Einstellungen —");

    const guild = FakeGuild();
    const service = client.matchupService;
    const base = DefaultMatchupSettings();
    const clean = service.CleanSettings(guild, { channelId: TEXT, pingRoles: [ROLE, GUILD, ROLE], remindMinutes: 45, maxAhead: 9999, leagues: ["Liga", "Liga", " "] }, base);

    check("Der Kanal kommt an", clean.channelId === TEXT);
    check("@everyone wird nicht gepingt", clean.pingRoles.join(",") === ROLE);
    check("Die Erinnerung kommt an", clean.remindMinutes === 45);
    check("Die Vorausschau wird gedeckelt", clean.maxAhead === MAX_AHEAD, String(clean.maxAhead));
    check("Doppelte und leere Ligen fallen weg", clean.leagues.join(",") === "Liga");

    const wrong = service.CleanSettings(guild, { channelId: VOICE, remindMinutes: 99_999 }, base);

    check("Ein Sprachkanal taugt nicht", wrong.channelId === null);
    check("Die Erinnerung wird gedeckelt", wrong.remindMinutes === MAX_REMIND, String(wrong.remindMinutes));

    const kept = service.CleanSettings(guild, { open: false }, base);

    check("Was nicht mitkommt, bleibt stehen", kept.announce.doc.blocks.length === base.announce.doc.blocks.length && kept.remindMinutes === base.remindMinutes);
    check("Der Link lässt sich schließen", kept.open === false);
    check("Die Adresse steht fest", MatchupLink("https://dash.example", GUILD).endsWith(`/matchups/${GUILD}`), MatchupLink("https://dash.example", GUILD));
}

/* ----------------------------------------------------------
   Wer darf eintragen
   ---------------------------------------------------------- */
async function checkAccess(client: BotClient): Promise<void> {
    console.log("\n  — Wer eintragen darf —");

    const guild = FakeGuild();
    const service = client.matchupService;

    client.teams.AllOfGuild = (async () => [FakeTeam()]) as typeof client.teams.AllOfGuild;

    const captain = await service.Access(guild, FakeMember(guild, CAPTAIN));
    const player = await service.Access(guild, FakeMember(guild, PLAYER));
    const admin = await service.Access(guild, FakeMember(guild, "90071992547409967", true));

    check("Der Captain darf für sein Team", captain.teams.length === 1 && captain.teams[0].id === 7);
    check("Und ist kein Verwalter", !captain.manage);
    check("Ein Spieler darf nicht", player.teams.length === 0, JSON.stringify(player.teams));
    check("Wer den Server verwaltet, darf für jedes Team", admin.manage && admin.teams.length === 1 && admin.teams[0].role === "manage");
    check(`Eintragen dürfen ${ENTRY_ROLES.join(", ")}`, ENTRY_ROLES.includes("captain") && ENTRY_ROLES.includes("manager") && !ENTRY_ROLES.includes("player"));
}

/* ----------------------------------------------------------
   Eintragen
   ---------------------------------------------------------- */
async function checkCreate(client: BotClient): Promise<void> {
    console.log("\n  — Was beim Eintragen geprüft wird —");

    const guild = FakeGuild();
    const service = client.matchupService;
    const settings: IMatchupSettings = { ...DefaultMatchupSettings(), channelId: null, maxAhead: 30 };

    client.teams.AllOfGuild = (async () => [FakeTeam()]) as typeof client.teams.AllOfGuild;
    service.Settings = async () => settings;

    const made: Partial<IMatchup>[] = [];

    client.matchups.Create = (async (input: Partial<IMatchup>) => {
        made.push(input);

        return FakeMatchup(input);
    }) as typeof client.matchups.Create;

    const member = FakeMember(guild, CAPTAIN);
    const good = { teamId: 7, opponent: "Ascension", league: "Liga", mode: "2v2", bestOf: 5, at: Date.now() + DAY, stream: "https://twitch.tv/x", note: "kurz" };

    await service.Create(guild, member, good);

    check("Die Partie kommt an", made[0]?.opponent === "Ascension" && made[0]?.mode === "2v2");
    check("Der Teamname wird mitgeschrieben", made[0]?.teamName === "Vyrox Main");

    await refuses("Ohne Gegner geht es nicht", () => service.Create(guild, member, { ...good, opponent: "  " }));
    await refuses("Ohne Zeit auch nicht", () => service.Create(guild, member, { ...good, at: 0 }));
    await refuses("Ein Termin in der Vergangenheit wird abgewiesen", () => service.Create(guild, member, { ...good, at: Date.now() - HOUR }));
    await refuses("Zu weit im Voraus ebenfalls", () => service.Create(guild, member, { ...good, at: Date.now() + 90 * DAY }));
    await refuses("Ein Stream ohne https wird abgewiesen", () => service.Create(guild, member, { ...good, stream: "twitch.tv/x" }));
    await refuses("Für ein fremdes Team geht nichts", () => service.Create(guild, member, { ...good, teamId: 99 }));
    await refuses("Wer in keinem Kader steht, darf nicht", () => service.Create(guild, FakeMember(guild, PLAYER), good));
}

/* ----------------------------------------------------------
   Die Nachrichten
   ---------------------------------------------------------- */
async function checkViews(client: BotClient): Promise<void> {
    console.log("\n  — Platzhalter und Nachrichten —");

    const guild = FakeGuild();
    const team = FakeTeam();
    const values = MatchupValues(guild, FakeMatchup(), team);

    check("Die Teams stehen drin", Fill("{team} vs. {gegner}", values) === "Vyrox Main vs. Ascension");
    check("Das Kürzel auch", Fill("{team.tag}", values) === "VYX");
    check("Die Rolle wird erwähnt", Fill("{team.role}", values) === `<@&${ROLE}>`);
    check("Der Modus steht ausgeschrieben da", Fill("{modus}", values) === MODE_LABELS["3v3"]);
    check("Best-of bringt seinen Trenner mit", Fill("{bestof}", values) === " · Bo5");
    check("Die Zeit läuft in der Zeitzone des Lesers", Fill("{zeit}", values).startsWith("<t:") && Fill("{countdown}", values).endsWith(":R>"));
    check("Der Stream wird zum Link", Fill("{stream}", values).includes("[Stream ansehen](https://twitch.tv/mecrytv)"));

    const bare = MatchupValues(guild, FakeMatchup({ bestOf: 0, stream: null, league: "" }), team);

    check("Ohne Best-of bleibt die Stelle leer", Fill("{bestof}", bare) === "");
    check("Ohne Stream ebenfalls", Fill("{stream}", bare) === "");
    check("Ohne Liga steht „Freundschaftsspiel“", Fill("{liga}", bare) === "Freundschaftsspiel");

    const won = MatchupValues(guild, FakeMatchup({ status: "played", score: { us: 3, them: 1 } }), team);
    const lost = MatchupValues(guild, FakeMatchup({ status: "played", score: { us: 1, them: 3 } }), team);
    const draw = MatchupValues(guild, FakeMatchup({ status: "played", score: { us: 2, them: 2 } }), team);

    check("Das Ergebnis steht als 3:1 da", Fill("{ergebnis}", won) === "3:1");
    check("Ein Sieg heißt Sieg", Fill("{ausgang}", won).includes("Sieg") && !Fill("{ausgang}", won).includes("Niederlage"));
    check("Eine Niederlage heißt Niederlage", Fill("{ausgang}", lost).includes("Niederlage"));
    check("Gleichstand ist unentschieden", Fill("{ausgang}", draw).includes("Unentschieden"));

    const settings = DefaultMatchupSettings();
    const announce = JSON.stringify((await MatchupView(client, settings.announce, values)).components[0].toJSON());

    check("Die Ankündigung nennt beide Teams", announce.includes("Vyrox Main") && announce.includes("Ascension"));
    check("Und den Stream", announce.includes("twitch.tv/mecrytv"));

    const remind = JSON.stringify((await MatchupView(client, settings.remind, values)).components[0].toJSON());

    check("Die Erinnerung hat den Countdown", remind.includes(":R>"));

    const result = JSON.stringify((await MatchupView(client, settings.result, won)).components[0].toJSON());

    check("Das Ergebnis steht in der Ergebnis-Nachricht", result.includes("3:1"));

    // Ein Embed und ein reiner Text muessen genauso durchgehen.
    const text = await MatchupView(client, { kind: "text", content: "{team} vs. {gegner} – {zeit.kurz}", embed: null, doc: { blocks: [] } }, values);

    check("Als reiner Text kommt es auch an", text.content?.includes("Vyrox Main vs. Ascension") === true, text.content);

    // Plan 28: Ping in der Karte, Kopfzeile nach Stand, Knöpfe, Farbe, neue Platzhalter.
    const pinged = await MatchupView(client, settings.announce, values, { ping: [ROLE] });
    const pingedJson = JSON.stringify(pinged.components.map((entry) => entry.toJSON()));

    check("Karte mit Ping: kein Text über der Karte", !pinged.content, String(pinged.content));
    check("Karte mit Ping: die Rolle steht in der Karte", pingedJson.includes(`<@&${ROLE}>`));
    check("Karte mit Ping: genau diese Rolle darf pingen", JSON.stringify(pinged.allowedMentions.roles) === JSON.stringify([ROLE]));

    const quiet = await MatchupView(client, settings.announce, values, { head: "🔴 Läuft gerade" });

    check("Ohne Ping pingt niemand", !quiet.allowedMentions.roles?.length && JSON.stringify(quiet.allowedMentions.parse) === "[]");
    check("Die Kopfzeile steht oben in der Karte", JSON.stringify(quiet.components[0]!.toJSON()).includes("Läuft gerade"));

    const base = DefaultMatchupSettings();
    const now = 1_800_000_000_000;

    check("Kopf: Sieg", MatchupHead(FakeMatchup({ status: "played", score: { us: 3, them: 1 } }), base, now) === "✅ Sieg 3 : 1");
    check("Kopf: Unentschieden", MatchupHead(FakeMatchup({ status: "played", score: { us: 2, them: 2 } }), base, now) === "🤝 Unentschieden 2 : 2");
    check("Kopf: abgesagt", MatchupHead(FakeMatchup({ status: "cancelled" }), base, now) === "❌ Abgesagt");
    check("Kopf: läuft seit einer Stunde", MatchupHead(FakeMatchup({ at: now - HOUR }), base, now) === "🔴 Läuft gerade");
    check("Kopf: nach vier Stunden keine Zeile mehr", MatchupHead(FakeMatchup({ at: now - 4 * HOUR }), base, now) === null);
    check("Kopf: ohne Ergebnisse kein „läuft“", MatchupHead(FakeMatchup({ at: now - HOUR }), { ...base, results: false }, now) === null);
    check("Kopf: vor dem Anpfiff keine", MatchupHead(FakeMatchup({ at: now + HOUR }), base, now) === null);

    const ids = (rows: ReturnType<typeof MatchupRows>): string[] => rows.flatMap((row) => (row.toJSON().components as { custom_id?: string; url?: string; label?: string }[]).map((entry) => entry.custom_id ?? `${entry.label}|${entry.url}`));
    const page = { page: "https://dash.example/matchups/1" };

    check("Knöpfe vor Anpfiff: kein Ergebnis", !ids(MatchupRows(FakeMatchup(), base, "soon", page)).some((id) => id.startsWith("matchups:report:")));
    check("Knöpfe, wenn es läuft: Ergebnis eintragen", ids(MatchupRows(FakeMatchup(), base, "live", page)).includes("matchups:report:3"));
    check("Mit Ergebnis heißt es „Ergebnis ändern“", JSON.stringify(MatchupRows(FakeMatchup({ status: "played", score: { us: 1, them: 0 } }), base, "done", page)[0]!.toJSON()).includes("Ergebnis ändern"));
    check("Ergebnis in Discord aus: kein Knopf", !ids(MatchupRows(FakeMatchup(), { ...base, discordResults: false }, "live", page)).some((id) => id.startsWith("matchups:report:")));
    check("Ohne Stream kein Stream-Knopf", !ids(MatchupRows(FakeMatchup({ stream: null }), base, "soon", page)).some((id) => id.includes("Stream")));
    check("Link zu: kein „Alle Matchups“", !ids(MatchupRows(FakeMatchup(), base, "soon", { page: null })).some((id) => id.includes("Alle Matchups")));
    check("Abgesagt: keine Knöpfe", MatchupRows(FakeMatchup({ status: "cancelled" }), base, "cancel", page).length === 0);
    check("Verwalten gibt es vor dem Spiel", ids(MatchupRows(FakeMatchup(), base, "soon", page)).includes("matchups:manage:3"));

    check("Farbe nach Stand: Sieg grün", MatchupAccent(FakeMatchup({ status: "played", score: { us: 2, them: 0 } }), base) === "#3ba55c");
    check("Farbe nach Stand: Niederlage rot", MatchupAccent(FakeMatchup({ status: "played", score: { us: 0, them: 2 } }), base) === "#f23f43");
    check("Farbe nach Stand aus: die der Vorlage", MatchupAccent(FakeMatchup({ status: "played", score: { us: 2, them: 0 } }), { ...base, colorByStatus: false }) === null);

    const green = await MatchupView(client, settings.result, won, { accent: "#3ba55c" });

    check("Die Farbe landet in der Karte", (green.components[0]!.toJSON() as { accent_color?: number }).accent_color === 0x3ba55c);

    const record = MatchupRecord([FakeMatchup({ status: "played", score: { us: 3, them: 1 } }), FakeMatchup({ status: "played", score: { us: 3, them: 2 } }), FakeMatchup({ status: "played", score: { us: 0, them: 1 } })]);
    const rich = MatchupValues(guild, FakeMatchup(), team, { record, logoUrl: "https://dash.example/images/x.png" });

    check("{bilanz}", Fill("{bilanz}", rich) === "2 Siege · 1 Niederlage", Fill("{bilanz}", rich));
    check("{serie} und {form}", Fill("{serie}", rich) === "2 Siege in Folge" && Fill("{form}", rich) === "🟩🟩🟥");
    check("{team.logo} mit Logo", Fill("{team.logo}", rich) === "https://dash.example/images/x.png");
    check("{team.logo} ohne Logo: Server-Icon (hier keins)", Fill("{team.logo}", values) === "");
}

/* ----------------------------------------------------------
   Plan 28: Zeit lesen, Bilanz, neue Einstellungen
   ---------------------------------------------------------- */
function checkKickoff(): void {
    console.log("\n  — Anpfiff aus Discord (deutsche Zeit) —");

    // Do, 29.10.2026, 16:00 in Berlin (Winterzeit, UTC+1).
    const now = Date.UTC(2026, 9, 29, 15, 0);
    const at = (text: string): number | null => ParseKickoff(text, now);

    check("„heute 20:00“", at("heute 20:00") === Date.UTC(2026, 9, 29, 19, 0), String(at("heute 20:00")));
    check("„morgen 19:30“", at("morgen 19:30") === Date.UTC(2026, 9, 30, 18, 30), String(at("morgen 19:30")));
    check("„Sa 18:00“ ist der nächste Samstag", at("Sa 18:00") === Date.UTC(2026, 9, 31, 17, 0), String(at("Sa 18:00")));
    check("„Samstag 18:00“ ebenso", at("Samstag 18:00") === Date.UTC(2026, 9, 31, 17, 0), String(at("Samstag 18:00")));
    check("„31.10. 20:00“ ohne Jahr", at("31.10. 20:00") === Date.UTC(2026, 9, 31, 19, 0), String(at("31.10. 20:00")));
    check("Sommerzeit: „28.03.2027 20:00“ am Tag der Umstellung", at("28.03.2027 20:00") === Date.UTC(2027, 2, 28, 18, 0), String(at("28.03.2027 20:00")));
    check("Nur „20:00“ heißt heute", at("20:00") === Date.UTC(2026, 9, 29, 19, 0), String(at("20:00")));
    check("Unlesbares gibt nichts", at("Quatsch") === null);
    check("Den 31. Februar gibt es nicht", at("31.02. 20:00") === null);
    // W-0027: weitere Schreibweisen, und kein Wochentag aus dem Prototyp.
    check("„20.00“ mit Punkt", at("20.00") === Date.UTC(2026, 9, 29, 19, 0), String(at("20.00")));
    check("„Sa, 18:00“ mit Komma", at("Sa, 18:00") === Date.UTC(2026, 9, 31, 17, 0), String(at("Sa, 18:00")));
    check("„31.10.26 20:00“ mit kurzem Jahr", at("31.10.26 20:00") === Date.UTC(2026, 9, 31, 19, 0), String(at("31.10.26 20:00")));
    check("„constructor 20:00“ ist kein Wochentag", at("constructor 20:00") === null, String(at("constructor 20:00")));
    check("Vorschläge ab „mor“: morgen", (KickoffSuggestions("mor", now)[0]?.name ?? "").startsWith("morgen"), JSON.stringify(KickoffSuggestions("mor", now).slice(0, 1)));

    const suggestions = KickoffSuggestions("heute 20", now);

    check("Vorschläge: der erste ist heute 20:00", suggestions[0]?.value === `t:${Date.UTC(2026, 9, 29, 19, 0)}`, JSON.stringify(suggestions.slice(0, 2)));
    check("Vorschläge: höchstens 25", suggestions.length <= 25 && KickoffSuggestions("", now).length <= 25);
}

function checkRecord(): void {
    console.log("\n  — Bilanz und Form —");

    const played = (us: number, them: number): IMatchup => FakeMatchup({ status: "played", score: { us, them } });
    // Neueste zuerst: Sieg, Sieg, Niederlage, Sieg, Unentschieden, Sieg.
    const record = MatchupRecord([played(3, 1), played(3, 2), played(1, 3), played(4, 0), played(2, 2), played(3, 0)]);

    check("Bilanz", RecordText(record) === "4 Siege · 1 Niederlage · 1 Unentschieden", RecordText(record));
    check("Serie", StreakText(record) === "2 Siege in Folge", StreakText(record));
    check("Form: die letzten fünf", FormText(record) === "🟩🟩🟥🟩⬜", FormText(record));

    const empty = MatchupRecord([]);

    check("Ohne Spiele alles null", empty.wins === 0 && empty.losses === 0 && empty.draws === 0 && empty.streak === null && FormText(empty) === "");
    check("Abgesagte zählen nicht", MatchupRecord([FakeMatchup({ status: "cancelled", score: null }), played(1, 0)]).wins === 1);
}

function checkSettings28(client: BotClient): void {
    console.log("\n  — Neue Einstellungen (Plan 28) —");

    const { discordResults: _a, resultRemindHours: _b, colorByStatus: _c, ...old } = DefaultMatchupSettings();
    const upgraded = NormalizeMatchupSettings({ ...old, announce: LegacyAnnounce(), remind: LegacyRemind(), result: LegacyResult() });

    check("Alte Zeile: Ergebnis per Discord an, 2 Stunden, Farbe nach Stand", upgraded.discordResults === true && upgraded.resultRemindHours === 2 && upgraded.colorByStatus === true);
    check("Unveränderte alte Vorlagen werden die neuen", JSON.stringify(upgraded.announce) === JSON.stringify(DefaultAnnounce()) && JSON.stringify(upgraded.result) === JSON.stringify(DefaultResult()));

    const own = { ...LegacyAnnounce(), doc: { ...LegacyAnnounce().doc, blocks: [{ type: "text" as const, body: "Unser eigener Text" }] } };

    check("Eine eigene Nachricht bleibt", JSON.stringify(NormalizeMatchupSettings({ ...old, announce: own }).announce) === JSON.stringify(own));
    check("Ergebnis-Erinnerung höchstens 48 Stunden", client.matchupService.CleanSettings(FakeGuild(), { resultRemindHours: 99 }, DefaultMatchupSettings()).resultRemindHours === 48);

    const sql = path.join(process.cwd(), "src", "database", "migrations", "036_matchups_results.sql");
    const text = existsSync(sql) ? readFileSync(sql, "utf8") : "";

    check("Migration 036: neue Spalten", text.includes("result_message_id") && text.includes("live_at") && text.includes("result_reminded_at"));
    check("Migration 036: vergangene Partien gelten als erledigt", /UPDATE[\s\S]*WHERE\s+at\s*</i.test(text));
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
        ["Ankündigung und Erinnerung", MATCHUP_KEYS, "MATCHUP_PLACEHOLDERS"],
        ["Ergebnis", RESULT_KEYS, "MATCHUP_RESULT_PLACEHOLDERS"],
    ];

    for (const [label, keys, name] of pairs) {
        const list = (loaded[name] ?? []) as { key: string }[];
        const client = list.map((entry) => entry.key);
        const missing = keys.filter((key) => !client.includes(key));
        const extra = client.filter((key) => !keys.includes(key));

        check(`${label}: ${keys.length} Platzhalter, im Dashboard dieselben`, missing.length === 0 && extra.length === 0, `fehlt: ${missing.join(", ")} | zu viel: ${extra.join(", ")}`);
    }

    const images = (loaded.MATCHUP_IMAGES ?? []) as string[];

    check("Bild-Platzhalter im Dashboard dieselben", JSON.stringify([...images].sort()) === JSON.stringify([...MATCHUP_IMAGES].sort()), images.join(", "));
}

/* ----------------------------------------------------------
   Der Minutenlauf und das Nachziehen (Plan 28)
   ---------------------------------------------------------- */
async function checkTick(client: BotClient): Promise<Map<number, IMatchup>> {
    console.log("\n  — Der Minutenlauf —");

    const now = Date.now();
    const guild = FakeGuild();
    const service = client.matchupService;
    let settings: IMatchupSettings = { ...DefaultMatchupSettings(), channelId: TEXT, open: false, remindMinutes: 0 };
    const rows = new Map<number, IMatchup>();
    const edits: { id: string; body: string }[] = [];
    const replies: { to: string; content: string; roles: string[] }[] = [];
    const sent: string[] = [];
    let next = 900;
    // Wie bei echten Nachrichten: flags sagt, ob es eine Karte ist. Ohne eigenen Versand ist es die Standard-Karte.
    const kinds = new Map<string, boolean>();
    const isCard = (options: unknown): boolean => (options as { flags?: number }).flags === MessageFlags.IsComponentsV2;

    const message = (id: string) => ({
        id,
        flags: { has: () => kinds.get(id) ?? true },
        edit: async (options: unknown) => {
            edits.push({ id, body: JSON.stringify(options) });

            return message(id);
        },
        reply: async (options: { content: string; allowedMentions?: { roles?: string[] } }) => {
            replies.push({ to: id, content: options.content, roles: options.allowedMentions?.roles ?? [] });

            return message(String(next++));
        },
    });
    const channel = {
        id: TEXT,
        isTextBased: () => true,
        isThread: () => false,
        send: async (options: unknown) => {
            const id = String(next++);

            sent.push(JSON.stringify(options));
            kinds.set(id, isCard(options));

            return message(id);
        },
        messages: { fetch: async (id: string) => message(id) },
    };

    (guild.channels.cache as unknown as Map<string, unknown>).set(TEXT, channel);
    client.guilds.cache.set(GUILD, guild);
    Object.defineProperty(client.databaseService, "Ready", { get: () => true, configurable: true });
    client.settings.Of = (async () => ({ modules: ["matchups"] })) as unknown as typeof client.settings.Of;
    client.teams.Full = (async () => FakeTeam()) as unknown as typeof client.teams.Full;
    service.Settings = async () => settings;

    const model = client.matchups as unknown as Record<string, unknown>;
    const list = () => [...rows.values()];

    model.Due = async () => [];
    model.Live = async (_guild: string, at: number) => list().filter((row) => row.status === "planned" && row.liveAt === null && row.at <= at && row.at > at - LIVE_HOURS * HOUR);
    model.MissingResults = async (_guild: string, at: number, hours: number) => list().filter((row) => row.status === "planned" && row.resultRemindedAt === null && row.at <= at - hours * HOUR);
    model.Ended = async (_guild: string, at: number) =>
        list().filter((row) => row.status === "planned" && row.liveAt !== null && row.liveAt < row.at + LIVE_HOURS * HOUR && row.at <= at - LIVE_HOURS * HOUR && row.at > at - (LIVE_HOURS + 6) * HOUR);
    model.SetLive = async (id: number) => void (rows.get(id)!.liveAt = now);
    model.SetResultReminded = async (id: number) => void (rows.get(id)!.resultRemindedAt = now);
    model.SetResultMessage = async (id: number, messageId: string | null) => void (rows.get(id)!.resultMessageId = messageId);
    model.Get = async (id: number) => rows.get(id) ?? null;
    model.Save = async (id: number, patch: Partial<IMatchup>) => void Object.assign(rows.get(id)!, patch);
    model.Played = async () => ({ rows: list().filter((row) => row.status === "played"), total: 0 });

    rows.set(1, FakeMatchup({ id: 1, at: now - 10 * 60_000, messageId: "501" }));
    rows.set(2, FakeMatchup({ id: 2, at: now - 5 * HOUR, messageId: "502", liveAt: now - HOUR, resultRemindedAt: now - HOUR }));
    rows.set(3, FakeMatchup({ id: 3, at: now - 2 * HOUR - 5 * 60_000, messageId: "503", liveAt: now - HOUR }));

    const first = await service.Tick(now);

    check("Angepfiffen: die Ankündigung zeigt „läuft“", edits.some((entry) => entry.id === "501" && entry.body.includes("Läuft gerade")), JSON.stringify(first));
    check("…und das genau einmal vermerkt", rows.get(1)!.liveAt === now && first.live === 1);
    check("Wie nach der Migration: weder bearbeitet noch erinnert", !edits.some((entry) => entry.id === "502") && !replies.some((entry) => entry.to === "502"));
    check("Ergebnis fehlt: Antwort unter der Ankündigung", replies.some((entry) => entry.to === "503" && entry.content.includes("Wie ist es ausgegangen? Tragt das Ergebnis über den Knopf oben ein.")));
    check("…mit der Team-Rolle, sonst niemand", JSON.stringify(replies.find((entry) => entry.to === "503")?.roles) === JSON.stringify([ROLE]));
    check("…und vermerkt", rows.get(3)!.resultRemindedAt === now && first.missing === 1);

    const before = { edits: edits.length, replies: replies.length };
    const second = await service.Tick(now);

    check("Zweiter Lauf: nichts mehr", edits.length === before.edits && replies.length === before.replies && second.live === 0 && second.missing === 0, JSON.stringify(second));

    settings = { ...settings, resultRemindHours: 0 };
    rows.set(4, FakeMatchup({ id: 4, at: now - 5 * HOUR, messageId: "504", liveAt: now }));
    await service.Tick(now);
    check("Erinnern ans Ergebnis aus (0): keine Antwort", !replies.some((entry) => entry.to === "504"));

    settings = { ...settings, resultRemindHours: 2 };
    rows.set(5, FakeMatchup({ id: 5, at: now - HOUR, messageId: "505", liveAt: now, resultRemindedAt: now }));

    const captain = FakeMember(guild, CAPTAIN);

    await service.Report(guild, captain, 5, 3, 1);

    const results = sent.length;

    check("Nach dem Ergebnis: die Ankündigung zeigt den Sieg", edits.some((entry) => entry.id === "505" && entry.body.includes("Sieg 3 : 1")));
    check("…und eine Ergebnis-Nachricht kommt", results === 1 && rows.get(5)!.resultMessageId !== null, String(results));

    await service.Report(guild, captain, 5, 2, 1);

    check("Ein geändertes Ergebnis bearbeitet die Nachricht, statt neu zu senden", sent.length === results && edits.some((entry) => entry.id === rows.get(5)!.resultMessageId && entry.body.includes("2:1")));

    // Review: Nach LIVE_HOURS ohne Ergebnis verschwindet „Läuft gerade“ wieder - einmal nachziehen.
    rows.set(6, FakeMatchup({ id: 6, at: now - LIVE_HOURS * HOUR - 2 * 60_000, messageId: "506", liveAt: now - LIVE_HOURS * HOUR + 60_000, resultRemindedAt: now }));

    await service.Tick(now);

    const ended = edits.filter((entry) => entry.id === "506");

    check("Nach 3 Stunden: die Ankündigung einmal ohne „Läuft gerade“ nachgezogen", ended.length === 1 && !ended[0]!.body.includes("Läuft gerade"), String(ended.length));

    await service.Tick(now);
    check("…und danach nicht wieder", edits.filter((entry) => entry.id === "506").length === 1);

    return rows;
}

/* ----------------------------------------------------------
   Knöpfe, Menü und Fenster in Discord (Plan 28)
   ---------------------------------------------------------- */
async function checkButtons(client: BotClient, rows: Map<number, IMatchup>): Promise<void> {
    console.log("\n  — Knöpfe und Fenster in Discord —");

    const event = new MatchupButtons(client);
    const guild = client.guilds.cache.get(GUILD)!;
    const service = client.matchupService;
    const now = Date.now();
    const calls = { report: [] as unknown[][], cancel: 0, save: [] as unknown[] };
    const order: string[] = [];
    const report = service.Report.bind(service);
    const cancel = service.Cancel.bind(service);
    const save = service.Save.bind(service);

    service.Report = async (...args: Parameters<typeof service.Report>) => {
        calls.report.push([args[3], args[4]]);
        order.push("report");

        return report(...args);
    };
    service.Cancel = async (...args: Parameters<typeof service.Cancel>) => {
        calls.cancel++;
        order.push("cancel");

        return cancel(...args);
    };
    service.Save = async (...args: Parameters<typeof service.Save>) => {
        calls.save.push(args[3]);
        order.push("save");

        return save(...args);
    };

    type Answer = { content?: string; flags?: number; components?: { toJSON(): unknown }[] };

    const modals: string[] = [];
    const answers: Answer[] = [];
    const deferred: Answer[] = [];
    const click = async (kind: "button" | "select" | "modal", customId: string, who: string, extra: { fields?: Record<string, string>; values?: string[] } = {}) => {
        const state = { replied: false, deferred: false };
        const interaction = {
            customId,
            guild,
            guildId: guild.id,
            member: FakeMember(guild, who),
            user: { id: who },
            inCachedGuild: () => true,
            isButton: () => kind === "button",
            isStringSelectMenu: () => kind === "select",
            isModalSubmit: () => kind === "modal",
            values: extra.values ?? [],
            fields: { getTextInputValue: (id: string) => extra.fields?.[id] ?? "" },
            get replied() {
                return state.replied;
            },
            get deferred() {
                return state.deferred;
            },
            showModal: async (modal: { toJSON(): unknown }) => void modals.push(JSON.stringify(modal.toJSON())),
            reply: async (options: Answer) => {
                state.replied = true;
                answers.push(options);
            },
            followUp: async (options: Answer) => void answers.push(options),
            update: async (options: Answer) => void answers.push(options),
            deferUpdate: async () => {
                state.deferred = true;
                order.push("defer");
            },
            deferReply: async (options: Answer) => {
                state.deferred = true;
                order.push("defer");
                deferred.push(options);
            },
            // Die Antwort ersetzt das „denkt nach …“ - nur sichtbar für den, für den aufgeschoben wurde.
            editReply: async (options: Answer) => {
                state.replied = true;
                answers.push({ ...options, flags: deferred[deferred.length - 1]?.flags ?? 0 });
            },
        };

        await event.Execute(interaction as unknown as Parameters<typeof event.Execute>[0]);
    };
    const last = () => answers[answers.length - 1];
    const ephemeral = (answer: Answer | undefined) => ((answer?.flags ?? 0) & 64) === 64;
    const text = (answer: Answer | undefined) => `${answer?.content ?? ""} ${JSON.stringify((answer?.components ?? []).map((entry) => entry.toJSON()))}`;
    const hint = "Das dürfen Captain, Co-Captain, Manager und Coach des Teams – und wer den Server verwaltet.";

    rows.set(20, FakeMatchup({ id: 20, at: now - HOUR, messageId: "520", liveAt: now, resultRemindedAt: now }));
    rows.set(21, FakeMatchup({ id: 21, at: now + DAY, messageId: "521" }));
    rows.set(22, FakeMatchup({ id: 22, at: now - 2 * HOUR, status: "played", score: { us: 3, them: 1 }, messageId: "522", liveAt: now, resultRemindedAt: now }));
    rows.set(23, FakeMatchup({ id: 23, at: now + DAY, messageId: "523" }));

    for (const id of ["matchups:report:20", "matchups:manage:20", "matchups:cancel:21", "matchups:cancelyes:21", "matchups:time:21"]) {
        await click("button", id, PLAYER);
        check(`Ohne Recht: ${id.split(":")[1]} zeigt nur den Hinweis`, last()?.content === hint && ephemeral(last()), JSON.stringify(last()));
    }

    check("Ohne Recht: kein Fenster, nichts geändert", modals.length === 0 && calls.report.length === 0 && calls.cancel === 0 && rows.get(21)!.status === "planned");

    await click("button", "matchups:report:20", CAPTAIN);

    const form = modals[0] ?? "";

    check("Captain nach Anpfiff: Fenster mit zwei Feldern", form.includes("matchups:reportform:20") && (form.match(/"type":4/g) ?? []).length === 2, form);
    check("…beschriftet mit Team und Gegner", form.includes("Vyrox Main") && form.includes("Ascension"));

    await click("button", "matchups:report:22", CAPTAIN);
    check("„Ergebnis ändern“: Felder vorausgefüllt", (modals[1] ?? "").includes('"value":"3"') && (modals[1] ?? "").includes('"value":"1"'), modals[1]);

    await click("button", "matchups:report:21", CAPTAIN);
    check("Vor dem Anpfiff: kein Fenster, ein Hinweis", modals.length === 2 && last()?.content === "Ergebnisse gibt es nach dem Anpfiff." && ephemeral(last()), JSON.stringify(last()));

    await click("modal", "matchups:reportform:20", CAPTAIN, { fields: { us: "x", them: "1" } });
    check("Fenster mit „x“: die Meldung aus Report, nichts gespeichert", rows.get(20)!.score === null && ephemeral(last()) && (last()?.content ?? "").includes("Zahlen"), JSON.stringify(last()));

    order.length = 0;
    await click("modal", "matchups:reportform:20", CAPTAIN, { fields: { us: "3", them: "1" } });
    check("Ergebnis-Fenster: erst bestätigen, dann eintragen (3-Sekunden-Grenze)", JSON.stringify(order) === '["defer","report"]', JSON.stringify(order));
    check("Fenster mit 3 und 1: eingetragen", JSON.stringify(calls.report[calls.report.length - 1]) === JSON.stringify(["3", "1"]) && rows.get(20)!.score?.us === 3);
    check("…und bestätigt", last()?.content === `✅ Eingetragen. Die Ankündigung steht in <#${TEXT}>.` && ephemeral(last()), JSON.stringify(last()));

    await click("button", "matchups:manage:21", CAPTAIN);
    check("Verwalten mit Recht: Zeit ändern und Absagen", text(last()).includes("matchups:time:21") && text(last()).includes("matchups:cancel:21") && ephemeral(last()), text(last()));

    await click("select", "matchups:pick", CAPTAIN, { values: ["21"] });
    check("Das Menü öffnet dasselbe wie „Verwalten“", text(last()).includes("matchups:time:21"));

    await click("button", "matchups:cancel:21", CAPTAIN);
    check("Absagen fragt zurück", text(last()).includes("matchups:cancelyes:21") && text(last()).includes("Wirklich absagen?") && calls.cancel === 0, text(last()));

    order.length = 0;
    await click("button", "matchups:cancelyes:21", CAPTAIN);
    check("Absagen: erst bestätigen, dann absagen", JSON.stringify(order) === '["defer","cancel"]', JSON.stringify(order));
    check("„Wirklich absagen?“ sagt ab, genau einmal", calls.cancel === 1 && rows.get(21)!.status === "cancelled");

    await click("button", "matchups:time:23", CAPTAIN);
    check("Zeit ändern öffnet ein Fenster", (modals[modals.length - 1] ?? "").includes("matchups:timeform:23"));

    await click("modal", "matchups:timeform:23", CAPTAIN, { fields: { wann: "Quatsch" } });
    check("Unverständliche Zeit: Hinweis mit den Schreibweisen, nichts gespeichert", calls.save.length === 0 && (last()?.content ?? "").includes("morgen 19:30") && ephemeral(last()), JSON.stringify(last()));

    order.length = 0;
    await click("modal", "matchups:timeform:23", CAPTAIN, { fields: { wann: "morgen 19:30" } });
    check("Zeit-Fenster: erst bestätigen, dann speichern", JSON.stringify(order) === '["defer","save"]', JSON.stringify(order));

    const at = ParseKickoff("morgen 19:30", Date.now());

    check("„morgen 19:30“ wird gespeichert", (calls.save[0] as { at?: number } | undefined)?.at === at && rows.get(23)!.at === at, JSON.stringify(calls.save));
}

/* ----------------------------------------------------------
   Der Befehl /matchup (Plan 28)
   ---------------------------------------------------------- */
async function checkCommand(client: BotClient): Promise<void> {
    console.log("\n  — /matchup —");

    const command = new MatchupCommand(client);
    const guild = client.guilds.cache.get(GUILD)!;
    const service = client.matchupService;
    const now = Date.now();
    const academy: ITeam = { ...FakeTeam(), id: 8, name: "Vyrox Academy", tag: "VYA", roleId: null, players: [] };
    let settings: IMatchupSettings = { ...DefaultMatchupSettings(), channelId: TEXT, open: false, leagues: ["RLCS Quali", "Liga Nord"] };
    const made: Record<string, unknown>[] = [];
    const create = service.Create.bind(service);

    client.teams.AllOfGuild = (async () => [FakeTeam(), academy]) as typeof client.teams.AllOfGuild;
    service.Settings = async () => settings;
    service.PageUrl = (_id: string, config: IMatchupSettings) => (config.open ? "https://dash.example/matchups/1" : null);
    service.Create = async (...args: Parameters<typeof service.Create>) => {
        made.push(args[2] as Record<string, unknown>);

        return create(...args);
    };

    type Answer = { content?: string; flags?: number; components?: { toJSON(): unknown }[] };

    const answers: Answer[] = [];
    let choices: { name: string; value: string }[] = [];
    const run = async (sub: string, who: string, options: Record<string, string | number> = {}, focused?: string, manage = false) => {
        const state = { replied: false, deferred: false };
        const interaction = {
            guild,
            guildId: guild.id,
            member: FakeMember(guild, who, manage),
            user: { id: who },
            inCachedGuild: () => true,
            options: {
                getSubcommand: () => sub,
                getString: (name: string) => (typeof options[name] === "string" ? (options[name] as string) : null),
                getInteger: (name: string) => (typeof options[name] === "number" ? (options[name] as number) : null),
                getFocused: () => ({ name: focused, value: String(options[focused ?? ""] ?? "") }),
            },
            get replied() {
                return state.replied;
            },
            get deferred() {
                return state.deferred;
            },
            reply: async (answer: Answer) => {
                state.replied = true;
                answers.push(answer);
            },
            deferReply: async () => void (state.deferred = true),
            editReply: async (answer: Answer) => void answers.push(answer),
            followUp: async (answer: Answer) => void answers.push(answer),
            respond: async (list: { name: string; value: string }[]) => void (choices = list),
        };

        if (focused) await command.AutoComplete(interaction as unknown as Parameters<typeof command.AutoComplete>[0]);
        else await command.Execute(interaction as unknown as Parameters<typeof command.Execute>[0]);
    };
    const last = () => answers[answers.length - 1];
    const text = (answer: Answer | undefined) => `${answer?.content ?? ""} ${JSON.stringify((answer?.components ?? []).map((entry) => entry.toJSON()))}`;

    await run("neu", CAPTAIN, { team: "" }, "team");
    check("Vorschläge „team“ für den Captain: nur sein Team", JSON.stringify(choices) === JSON.stringify([{ name: "Vyrox Main", value: "7" }]), JSON.stringify(choices));

    await run("neu", PLAYER, { team: "" }, "team", true);
    check("…für wer den Server verwaltet: alle", choices.length === 2, JSON.stringify(choices));

    await run("neu", CAPTAIN, { anpfiff: "morgen 19" }, "anpfiff");
    check("Vorschläge „anpfiff“: morgen 19:00 zuerst", choices[0]?.value === `t:${ParseKickoff("morgen 19:00", Date.now())}`, JSON.stringify(choices[0]));

    await run("neu", CAPTAIN, { liga: "nord" }, "liga");
    check("Vorschläge „liga“ aus dem Dashboard", JSON.stringify(choices) === JSON.stringify([{ name: "Liga Nord", value: "Liga Nord" }]), JSON.stringify(choices));

    const exact = now + DAY + 37 * 60_000;

    await run("neu", CAPTAIN, { team: "7", gegner: "Ascension", anpfiff: `t:${exact}`, modus: "2v2", bestof: 5 });
    check("neu mit gewähltem Vorschlag: genau dieser Zeitpunkt", made[made.length - 1]?.at === exact && made[made.length - 1]?.mode === "2v2" && made[made.length - 1]?.bestOf === 5, JSON.stringify(made[made.length - 1]));
    check("…Antwort mit Kanal und „Absagen“", (last()?.content ?? "").startsWith(`✅ Eingetragen. Die Ankündigung steht in <#${TEXT}>.`) && text(last()).includes("matchups:cancel:"), text(last()));
    check("…ohne offenen Link kein „Ändern“", !text(last()).includes("Ändern"));

    settings = { ...settings, open: true };
    await run("neu", CAPTAIN, { team: "7", gegner: "Ascension", anpfiff: "übermorgen 20:00" });
    check("neu mit getipptem Text: ParseKickoff", made[made.length - 1]?.at === ParseKickoff("übermorgen 20:00", Date.now()));
    check("…mit offenem Link „Ändern“ aufs Formular", text(last()).includes("?partie="), text(last()));

    const before = made.length;

    await run("neu", CAPTAIN, { team: "7", gegner: "Ascension", anpfiff: "Quatsch" });
    check("neu mit „Quatsch“: die Schreibweisen, nichts eingetragen", made.length === before && last()?.content === KICKOFF_HELP, JSON.stringify(last()));

    await run("neu", PLAYER, { team: "7", gegner: "Ascension", anpfiff: "morgen 20:00" });
    check("neu ohne Recht: die Meldung aus Create", (last()?.content ?? "").includes("Du stehst in keinem Kader"), JSON.stringify(last()));

    // W-0027: Wer den Namen tippt, statt den Vorschlag zu wählen, meint trotzdem das Team.
    await run("neu", CAPTAIN, { team: "vyrox main", gegner: "Ascension", anpfiff: "morgen 21:00" });
    check("neu mit getipptem Teamnamen: das Team", made[made.length - 1]?.teamId === 7, JSON.stringify(made[made.length - 1]));

    const askedFor: (number | undefined)[] = [];
    const realListView = service.ListView.bind(service);

    service.ListView = async (...args: Parameters<typeof service.ListView>) => {
        askedFor.push(args[3]);

        return { content: "Liste" };
    };
    await run("liste", PLAYER, { team: "Vyrox Academy" });
    check("liste mit getipptem Teamnamen: nur dieses Team", askedFor[askedFor.length - 1] === 8, JSON.stringify(askedFor));
    service.ListView = realListView;

    // Die Liste: 13 anstehende (zwei Teams), eine vor 7 h, eine vor 5 h.
    const upcoming: IMatchup[] = [
        ...Array.from({ length: 6 }, (_, index) => FakeMatchup({ id: 100 + index, teamId: 8, teamName: "Vyrox Academy", at: now + (index + 1) * HOUR })),
        ...Array.from({ length: 6 }, (_, index) => FakeMatchup({ id: 200 + index, at: now + (index + 10) * HOUR })),
        FakeMatchup({ id: 300, teamId: 8, teamName: "Vyrox Academy", at: now - 7 * HOUR }),
        FakeMatchup({ id: 301, teamId: 8, teamName: "Vyrox Academy", at: now - 5 * HOUR }),
    ];
    const model = client.matchups as unknown as Record<string, unknown>;

    model.Upcoming = async (_guild: string, at: number, filter: { teamId?: number; limit: number }) =>
        upcoming
            .filter((row) => row.status === "planned" && row.at > at - 6 * HOUR && (!filter.teamId || row.teamId === filter.teamId))
            .sort((a, b) => a.at - b.at)
            .slice(0, filter.limit);

    const list = await service.ListView(guild, FakeMember(guild, CAPTAIN), now);
    const listed = (list.content ?? "").match(/\*\* vs\. /g)?.length ?? 0;
    const menu = text(list as Answer);

    check("Liste: höchstens 10", listed === 10, String(listed));
    check("…eigene Teams zuerst", (list.content ?? "").split("\n").find((line) => line.includes(" vs. "))?.includes("Vyrox Main") === true, list.content);
    check("…mit Menü nur für die eigenen Partien", menu.includes("matchups:pick") && menu.includes('"value":"200"') && !menu.includes('"value":"100"'), menu);

    const stranger = await service.ListView(guild, FakeMember(guild, PLAYER), now);

    check("…ohne Recht kein Menü", !text(stranger as Answer).includes("matchups:pick"));

    const academyList = await service.ListView(guild, FakeMember(guild, PLAYER, true), now, 8);

    check("Liste je Team: vor 5 h drin, vor 7 h nicht", (academyList.content ?? "").includes(`<t:${Math.floor((now - 5 * HOUR) / 1000)}:f>`) && !(academyList.content ?? "").includes(`<t:${Math.floor((now - 7 * HOUR) / 1000)}:f>`), academyList.content);

    // Ergebnisse
    const played = [
        FakeMatchup({ id: 400, status: "played", score: { us: 3, them: 1 }, at: now - 1 * DAY }),
        FakeMatchup({ id: 401, status: "played", score: { us: 3, them: 2 }, at: now - 2 * DAY }),
        FakeMatchup({ id: 402, status: "played", score: { us: 0, them: 3 }, at: now - 3 * DAY }),
        FakeMatchup({ id: 403, status: "played", score: { us: 2, them: 2 }, at: now - 4 * DAY }),
        FakeMatchup({ id: 404, status: "played", score: { us: 3, them: 0 }, at: now - 5 * DAY }),
        FakeMatchup({ id: 405, status: "played", score: { us: 4, them: 1 }, at: now - 6 * DAY }),
    ];

    model.Played = async () => ({ rows: played, total: played.length });

    const results = await service.ResultsView(guild);
    const shown = (results.content ?? "").match(/\*\* vs\. /g)?.length ?? 0;

    check("Ergebnisse: Bilanz des Teams", (results.content ?? "").includes(RecordText(MatchupRecord(played))), results.content);
    check("…Form und Serie", (results.content ?? "").includes(FormText(MatchupRecord(played))) && (results.content ?? "").includes(StreakText(MatchupRecord(played))));
    check("…die letzten 5", shown === 5, String(shown));
    check("…„Alle Ergebnisse“ auf den Reiter", text(results as Answer).includes("?reiter=ergebnisse"));

    settings = { ...settings, open: false };

    check("Link zu: kein „Alle Ergebnisse“", !text((await service.ResultsView(guild)) as Answer).includes("Alle Ergebnisse"));
}

/* ----------------------------------------------------------
   Die öffentliche Seite (Plan 28)
   ---------------------------------------------------------- */
async function checkPublic(client: BotClient): Promise<void> {
    console.log("\n  — Die öffentliche Seite —");

    const route = new DashboardApiMatchupsPublic(client);
    const guild = client.guilds.cache.get(GUILD)!;
    const service = client.matchupService;
    const now = Date.now();
    const settings: IMatchupSettings = { ...DefaultMatchupSettings(), channelId: TEXT, open: true };
    const academy = { teamId: 8, teamName: "Vyrox Academy" };
    const upcoming = [
        FakeMatchup({ id: 600, at: now + HOUR, note: "Nur fürs Team" }),
        FakeMatchup({ id: 601, ...academy, at: now + 2 * HOUR, note: "Geheim" }),
    ];
    const played = [
        FakeMatchup({ id: 610, status: "played", score: { us: 3, them: 1 }, at: now - DAY, note: "Gut gespielt" }),
        FakeMatchup({ id: 611, ...academy, status: "played", score: { us: 0, them: 2 }, at: now - 2 * DAY, note: "Intern" }),
        FakeMatchup({ id: 612, status: "played", score: { us: 2, them: 2 }, at: now - 3 * DAY }),
    ];
    const model = client.matchups as unknown as Record<string, unknown>;

    (guild as unknown as { members: unknown }).members = { fetch: async (id: string) => FakeMember(guild, id) };
    service.Public = async () => ({ guild, settings });
    client.dashboardService.Session = ((token: string | undefined) => (token === "cap" ? { id: "s", userId: CAPTAIN, username: "Nico" } : null)) as typeof client.dashboardService.Session;
    model.Upcoming = async () => upcoming;
    model.Played = async (_guild: string, filter: { page?: number; limit?: number }) => ({ rows: played.slice(0, filter.limit ?? 20), total: played.length });
    model.OfTeams = async () => [upcoming[0]];

    const call = async (method: "GET" | "POST", cookie = "", body: unknown = undefined) => {
        const sent = { status: 200, body: undefined as unknown };
        const reply = {
            code(status: number) {
                sent.status = status;

                return reply;
            },
            header: () => reply,
            send(payload: unknown) {
                sent.body = payload;

                return reply;
            },
        };

        await route.Handle(
            { params: { id: GUILD }, method, query: {}, body, headers: { cookie: cookie ? `${SESSION_COOKIE}=${cookie}` : undefined, "content-type": "application/json" } } as never,
            reply as never
        );

        return sent;
    };

    type Page = { upcoming?: IMatchup[]; results?: { rows: IMatchup[]; total: number; page: number }; records?: { teamId: number | null; name: string; record: { wins: number } }[] };

    const anonymous = (await call("GET")).body as Page;

    check("Ohne Anmeldung: alle anstehenden Partien", anonymous.upcoming?.length === 2, JSON.stringify(anonymous.upcoming?.map((row) => row.id)));
    check("…ohne Notiz und ohne die ID dessen, der eingetragen hat", anonymous.upcoming?.every((row) => row.note === "" && row.createdBy === "") === true);
    check("Ergebnisse: die neuesten zuerst, ohne Notiz", anonymous.results?.rows[0]?.id === 610 && anonymous.results?.rows.every((row) => row.note === "") === true && anonymous.results?.total === 3);
    check("Bilanz je Team mit Ergebnissen", anonymous.records?.length === 2 && anonymous.records.find((entry) => entry.teamId === 7)?.record.wins === 1, JSON.stringify(anonymous.records));

    const captain = (await call("GET", "cap")).body as Page;

    check("Captain: eigene Partien mit Notiz", captain.upcoming?.find((row) => row.id === 600)?.note === "Nur fürs Team" && captain.results?.rows.find((row) => row.id === 610)?.note === "Gut gespielt");
    check("…fremde ohne", captain.upcoming?.find((row) => row.id === 601)?.note === "" && captain.results?.rows.find((row) => row.id === 611)?.note === "");

    const post = await call("POST", "", { action: "cancel", id: 600 });

    check("POST ohne Anmeldung: 401", post.status === 401, String(post.status));
}

/* ----------------------------------------------------------
   Befunde aus dem Abschluss-Review (Plan 28)
   ---------------------------------------------------------- */
async function checkReview(client: BotClient, rows: Map<number, IMatchup>): Promise<void> {
    console.log("\n  — Befunde aus dem Review —");

    const guild = client.guilds.cache.get(GUILD)!;
    const service = client.matchupService;
    const model = client.matchups as unknown as Record<string, unknown>;
    const patches: Partial<IMatchup>[] = [];
    const save = model.Save as (id: number, patch: Partial<IMatchup>) => Promise<void>;
    const captain = FakeMember(guild, CAPTAIN);

    model.Save = async (id: number, patch: Partial<IMatchup>) => {
        patches.push(patch);

        return save(id, patch);
    };

    // #2: Nur ein neuer Anpfiff setzt die Erinnerungen zurück.
    await service.Save(guild, captain, 23, { stream: "https://twitch.tv/neu" });
    check("Ändern ohne neuen Anpfiff: at geht nicht mit (keine zweite Erinnerung)", patches.length === 1 && !("at" in patches[0]!), JSON.stringify(patches[0]));

    await service.Save(guild, captain, 23, { at: rows.get(23)!.at + HOUR });
    check("Neuer Anpfiff: at geht mit", "at" in (patches[1] ?? {}));

    // #4: Keine leere Knopfreihe - Discord lehnte die ganze Bearbeitung ab.
    const quiet = { ...DefaultMatchupSettings(), discordResults: false };

    check("Mit Ergebnis, ohne Discord-Knopf, Stream und Link: keine Knopfreihe", MatchupRows(FakeMatchup({ status: "played", score: { us: 1, them: 0 }, stream: null }), quiet, "done", { page: null }).length === 0);

    // #6 und #3: Die Abfragen haben eine untere Grenze - kein Sturm an Nachfragen zu alten Spielen.
    const queries: { sql: string; params: unknown[] }[] = [];
    const sqlModel = new MatchupsModel({ databaseService: { Query: async (sql: string, params: unknown[]) => (queries.push({ sql, params }), []) } } as unknown as BotClient);
    const now = 1_800_000_000_000;

    await sqlModel.MissingResults(GUILD, now, 2);
    check("Nachfrage zum Ergebnis: nur für die letzten Stunden", /\bat > \?/.test(queries[0]!.sql) && queries[0]!.params.includes(now - 8 * HOUR), JSON.stringify(queries[0]));

    await sqlModel.Ended(GUILD, now);
    check("Ende von „läuft“: einmal je Partie, nur kürzlich", /live_at < at \+ \?/.test(queries[1]!.sql) && queries[1]!.params.includes(now - LIVE_HOURS * HOUR), JSON.stringify(queries[1]));

    // Alte Vorlagen, die schon einmal durchs Dashboard gespeichert wurden, bekommen die neuen.
    const saved = (body: ReturnType<typeof LegacyAnnounce>) => client.messageService.CleanBody(FakeGuild(), JSON.parse(JSON.stringify(body)), body, body.doc);
    const upgraded = NormalizeMatchupSettings({ ...DefaultMatchupSettings(), announce: saved(LegacyAnnounce()), remind: saved(LegacyRemind()), result: saved(LegacyResult()) });

    check("Gespeicherte alte Vorlagen werden die neuen", JSON.stringify(upgraded.announce) === JSON.stringify(DefaultAnnounce()) && JSON.stringify(upgraded.result) === JSON.stringify(DefaultResult()));

    // #1: Speichern im Dashboard behält den Abschnitt mit dem Team-Logo.
    const kept = service.CleanSettings(FakeGuild(), JSON.parse(JSON.stringify({ announce: DefaultAnnounce(), result: DefaultResult() })), DefaultMatchupSettings());

    check("Speichern behält den Abschnitt mit {team.logo}", kept.announce.doc.blocks[0]?.type === "section" && kept.result.doc.blocks[0]?.type === "section", JSON.stringify(kept.announce.doc.blocks[0]));
}

/** W-0027: Fußzeile, Farbe beim Embed, Platz für Knöpfe, Nachfrage-Text. */
async function checkSmallViews(client: BotClient): Promise<void> {
    console.log("\n  — Kleinigkeiten an den Nachrichten (W-0027) —");

    const footer = { kind: "v2", content: "", embed: null, doc: { accent: "#00afff", blocks: [{ type: "text", body: "-# {team.role} · Eingetragen von {eingetragen}" }] } } as unknown as IMatchupSettings["announce"];
    const noRole = JSON.stringify((await MatchupView(client, footer, { "team.role": "", eingetragen: "Nico" })).components.map((part) => part.toJSON()));

    check("Ohne Team-Rolle: Fußzeile ohne „ · “ am Anfang", noRole.includes("-# Eingetragen von Nico") && !noRole.includes("-#  ·"), noRole.slice(0, 200));

    const embedBody = {
        kind: "embed",
        content: "",
        embed: { title: "T", description: "D", color: "#00afff", url: null, image: null, thumbnail: null, author: null, footer: null, timestamp: false, fields: [] },
        doc: { accent: "#00afff", blocks: [] },
    } as unknown as IMatchupSettings["announce"];
    const embedView = await MatchupView(client, embedBody, {}, { accent: "#3ba55c" });

    check("Farbe nach Stand auch beim Embed", (embedView.embeds?.[0]?.toJSON().color ?? 0) === 0x3ba55c, String(embedView.embeds?.[0]?.toJSON().color));

    const many = { kind: "v2", content: "", embed: null, doc: { accent: "#00afff", blocks: Array.from({ length: 39 }, (_, index) => ({ type: "text", body: `Zeile ${index}` })) } } as unknown as IMatchupSettings["announce"];
    const rows = [new ActionRowBuilder<ButtonBuilder>().addComponents(Array.from({ length: 5 }, (_, index) => new ButtonBuilder().setCustomId(`x:${index}`).setLabel(`K${index}`).setStyle(ButtonStyle.Secondary)))];
    const big = await MatchupView(client, many, {}, { rows });
    const count = (node: unknown): number => {
        if (Array.isArray(node)) return node.reduce((sum: number, entry) => sum + count(entry), 0);
        if (!node || typeof node !== "object") return 0;

        const entry = node as { type?: unknown; components?: unknown; accessory?: unknown; items?: unknown };

        return (typeof entry.type === "number" ? 1 : 0) + count(entry.components) + count(entry.accessory);
    };
    const total = count(big.components.map((part) => part.toJSON()));

    check("Große Karte mit fünf Knöpfen: höchstens 40 Bausteine", total <= 40, String(total));

    check("Nachfrage mit Knopf: über den Knopf oben", ResultAsk(true, null).includes("über den Knopf oben"));
    check("Nachfrage ohne Knopf, mit Seite: der Link", ResultAsk(false, "https://dash.example/matchups/1").includes("https://dash.example/matchups/1") && !ResultAsk(false, "https://dash.example/matchups/1").includes("Knopf"));
    check("Nachfrage ohne Knopf und Seite: kein „Knopf oben“", !ResultAsk(false, null).includes("Knopf"));

    // Die öffentliche Seite führt LIVE_HOURS selbst (Browser) - der Wert muss zu dem im Bot passen.
    const page = readFileSync(path.join(process.cwd(), "src", "dashboard", "client", "pages", "Matchups.ts"), "utf8");

    check("Öffentliche Seite: dieselben Stunden für „Läuft“ wie der Bot", page.match(/const LIVE_HOURS = (\d+);/)?.[1] === String(LIVE_HOURS), page.match(/const LIVE_HOURS = (\d+);/)?.[1]);
}

/** W-0027: Löschen, Ergebnis und Ankündigung im Dienst. */
async function checkSmallService(): Promise<void> {
    console.log("\n  — Kleinigkeiten im Dienst (W-0027) —");

    const client = new BotClient();
    const service = client.matchupService;
    const loose = client.matchupService as unknown as Record<string, unknown>;
    const model = client.matchups as unknown as Record<string, unknown>;
    const settings: IMatchupSettings = { ...DefaultMatchupSettings(), channelId: TEXT, results: true };
    const deleted: string[] = [];
    const sent: string[] = [];
    const message = (id: string, v2 = true) => ({
        id,
        flags: { has: () => v2 },
        delete: async () => void deleted.push(id),
        edit: async () => message(id, v2),
    });
    let stored: IMatchup = FakeMatchup({ id: 5, messageId: "m1", resultMessageId: "r1", at: Date.now() - DAY });
    const channel = {
        id: TEXT,
        isTextBased: () => true,
        messages: { fetch: async (id: string) => message(id, id !== "old") },
        send: async () => {
            sent.push("send");

            return message("neu");
        },
    };
    const guild = { id: GUILD, channels: { cache: new Map([[TEXT, channel]]) } } as unknown as Guild;
    let saves = 0;

    loose.Settings = async () => settings;
    loose.Get = async () => stored;
    loose.Access = async () => ({ manage: true, teams: [] });
    loose.Allowed = () => undefined;
    loose.Values = async () => ({});
    loose.Result = async () => undefined;
    model.Remove = async () => undefined;
    model.SetMessage = async (_id: number, messageId: string) => void (stored = { ...stored, messageId });
    model.Save = async () => {
        saves++;
        await new Promise((resolve) => setTimeout(resolve, 20));
    };

    await service.Remove(guild, 5);
    check("Löschen nimmt auch die Ergebnis-Nachricht mit", deleted.includes("m1") && deleted.includes("r1"), deleted.join(", "));

    const member = { id: CAPTAIN } as unknown as GuildMember;

    await refuses("„-1“ im Ergebnis wird abgelehnt", () => service.Report(guild, member, 5, "-1", 2));
    await refuses("„2,5“ im Ergebnis wird abgelehnt", () => service.Report(guild, member, 5, "2,5", 2));

    saves = 0;

    const both = await Promise.allSettled([service.Report(guild, member, 5, 3, 1), service.Report(guild, member, 5, 3, 2)]);

    check("Zwei Ergebnisse zugleich: nur eins wird gespeichert", saves === 1 && both.filter((entry) => entry.status === "rejected").length === 1, `${saves} · ${both.map((entry) => entry.status).join(",")}`);

    // Die Ankündigung ist noch Text, die Vorlage inzwischen eine Karte: Discord bearbeitet das nicht - neu senden.
    stored = { ...stored, messageId: "old", status: "planned" };
    deleted.length = 0;
    sent.length = 0;
    await (loose as unknown as { Refresh: (guild: Guild, matchup: IMatchup, settings: IMatchupSettings) => Promise<void> }).Refresh(guild, stored, settings);
    check("Art gewechselt: alte Ankündigung weg, neue gesendet", deleted.includes("old") && sent.length === 1 && stored.messageId === "neu", `${deleted.join(",")} · ${sent.length} · ${stored.messageId}`);
}

async function main(): Promise<void> {
    console.log("\n⚔️  Matchups\n");

    const client = new BotClient();

    checkClean(client);
    await checkAccess(client);
    await checkCreate(client);
    await checkViews(client);
    await checkLists();
    checkKickoff();
    checkRecord();
    checkSettings28(client);
    const rows = await checkTick(client);

    await checkButtons(client, rows);
    await checkCommand(client);
    await checkPublic(client);
    await checkReview(client, rows);
    await checkSmallViews(client);
    await checkSmallService();

    console.log(failures === 0 ? "\n✅ Alle Prüfungen bestanden.\n" : `\n❌ ${failures} Prüfung(en) fehlgeschlagen.\n`);

    process.exit(failures > 0 ? 1 : 0);
}

void main();
