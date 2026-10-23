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
import { existsSync } from "fs";
import { ChannelType, Guild, GuildBasedChannel, GuildMember, PermissionFlagsBits, Role } from "discord.js";
import BotClient from "../client/BotClient";
import { MatchupValues, MatchupView } from "../builder/MatchupView";
import { Fill } from "../constants/Placeholders";
import { DefaultMatchupSettings, ENTRY_ROLES, MATCHUP_KEYS, MAX_AHEAD, MAX_REMIND, MODE_LABELS, MatchupLink, RESULT_KEYS } from "../constants/Matchups";
import { IMatchup, IMatchupSettings } from "../interfaces/services/matchups/IMatchups";
import { ITeam, ITeamPlayer, TeamRole } from "../interfaces/services/teams/ITeams";
import { MatchupError } from "../services/MatchupService";

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
}

async function main(): Promise<void> {
    console.log("\n⚔️  Matchups\n");

    const client = new BotClient();

    checkClean(client);
    await checkAccess(client);
    await checkCreate(client);
    await checkViews(client);
    await checkLists();

    console.log(failures === 0 ? "\n✅ Alle Prüfungen bestanden.\n" : `\n❌ ${failures} Prüfung(en) fehlgeschlagen.\n`);

    process.exit(failures > 0 ? 1 : 0);
}

void main();
