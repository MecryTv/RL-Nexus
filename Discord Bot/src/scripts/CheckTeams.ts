/**
 * Prüft die RL Team-Übersicht ohne Discord und ohne Prime: den Formel-Rechner,
 * die Team-MMR nach WTSI und nach eigener Rechnung, das Säubern der Kader, die
 * Karten, die in den Kanal gehen, und wer welche Rollen bekommt. Mit Datenbank
 * zusätzlich, ob gespeichert bleibt, was der Bot angelegt hat.
 *
 *   npm run check:teams
 *
 * Ob Prime antwortet, sieht nur ein echter Server - hier stehen erfundene Stände.
 */
process.env.CLIENT_SECRET ||= "check-secret";
process.env.DEV_CLIENT_SECRET ||= "check-secret";

import path from "path";
import { existsSync } from "fs";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { ChannelType, ComponentType, Guild, GuildBasedChannel, PermissionFlagsBits, Role } from "discord.js";
import { ICustomView } from "../builder/CustomView";
import BotClient from "../client/BotClient";
import { BoardText, BoardView, BoardViews, ChannelsText, PackParts, LeaguesText, LineupText, PLAYER_FIELDS, PlayerKey, PlayerList, PlayerValues, RoleValues, RosterText, StaffText, TeamMenuRow, TeamValues, ListTeams, Formats } from "../builder/TeamView";
import { DefaultTeamList, MEMBER_FIELDS, PublishText, TEAM_LIST_PRESETS, TeamListText } from "../constants/TeamList";
import { CardsInOrder, DefaultTeamOrder, ITeamOrder, OrderTeams } from "../constants/TeamOrder";
import { Fill } from "../constants/Placeholders";
import { DIVISIONS, RankFromMMR, RankShort, RankText, TIERS } from "../constants/Prime";
import {
    COUNTING_ROLES,
    DefaultRoles,
    DefaultTeamSettings,
    FORMULA_KEYS,
    ITeamFormats,
    MAX_LINKS,
    MAX_MENU_TEAMS,
    MAX_PLAYERS,
    NextPlayerId,
    BadgeOf,
    PLAIN_FORMATS,
    PLAYING_ROLES,
    RankFormatter,
    RoleFormatter,
    ROLE_LABELS,
    ROLE_ORDER,
    UsedSlots,
} from "../constants/Teams";
import { IconImage, RANK_ICON_FILES, RANK_ICON_ROOT, RankIconImage, RankIconName, ROLE_ICON_COLORS, ROLE_ICON_FILES, ROLE_ICON_ROOT, RoleBadge, RoleIconImage, RoleIconName } from "../services/RankIconService";
import { IsImageFile } from "../constants/Gallery";
import { ITeam, ITeamGroup, ITeamPlayer, ITeamSettings, TeamRole } from "../interfaces/services/teams/ITeams";
import { RolePlan, RoleTargets, TeamError, TeamOverwrites, TextName, ViewFacts } from "../services/TeamService";
import { Evaluate, FormulaError } from "../utils/formula";

const GUILD = "90071992547409951";
const TEXT = "90071992547409952";
const VOICE = "90071992547409953";
const CATEGORY = "90071992547409955";
const ROLE = "90071992547409954";
// Ein Emoji, das es auf dem Server gibt - für die eigenen Abzeichen.
const SERVER_EMOJI = "90071992547409956";

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
        check(name, error instanceof FormulaError || error instanceof TeamError, String(error));
    }
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
        emojis: { cache: new Map([[SERVER_EMOJI, { id: SERVER_EMOJI, name: "vyx" }]]) },
        iconURL: () => null,
    } as unknown as Guild;
}

/** Ein Spieler mit Peak und Prime-Stand. */
function Player(id: string, role: ITeamPlayer["role"], peak3s: number | null, current3s: number | null, peak2s: number | null = null, current2s: number | null = null): ITeamPlayer {
    return {
        id,
        discordId: null,
        name: `Spieler ${id}`,
        epicName: `epic-${id}`,
        role,
        peaks: { "1v1": null, "2v2": peak2s, "3v3": peak3s },
        snapshot: {
            name: `epic-${id}`,
            platform: "Epic Games",
            mmr: { "1v1": null, "2v2": current2s, "3v3": current3s },
            tier: current3s ? 18 : null,
            tierName: current3s ? "Champion III" : null,
            // So liefert Prime die Division: nur die römische Zahl.
            divisionName: current3s ? "II" : null,
            at: Date.now() - 60_000,
            error: null,
        },
    };
}

function FakeTeam(players: ITeamPlayer[], over: Partial<ITeam> = {}): ITeam {
    return {
        id: 1,
        guildId: GUILD,
        groupId: 1,
        name: "Vyrox Main",
        tag: "VYX",
        description: "Der Hauptkader.",
        color: null,
        logo: null,
        roleId: ROLE,
        channels: { kind: "channels", categoryId: null, textIds: [TEXT], voiceIds: [VOICE] },
        created: { roleId: null, categoryId: null, textIds: [], voiceIds: [] },
        links: [],
        players,
        position: 0,
        messageId: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...over,
    };
}

/* ----------------------------------------------------------
   Der Formel-Rechner
   ---------------------------------------------------------- */
function checkFormula(): void {
    console.log("\n  — Der Rechner —");

    const values = { peak3s: 1500, current3s: 1200, peak2s: 1400, current2s: 1000, peak1s: 0, current1s: 0, matches3s: 120, tier: 16 };

    check("Punkt vor Strich", Evaluate("2 + 3 * 4", values) === 14, String(Evaluate("2 + 3 * 4", values)));
    check("Klammern gehen vor", Evaluate("(2 + 3) * 4", values) === 20);
    check("Minus vorweg", Evaluate("-5 + 8", values) === 3);
    check("Kommazahlen", Evaluate("0.5 * 1000", values) === 500);
    check("Hoch ist rechts-assoziativ", Evaluate("2 ^ 3 ^ 2", values) === 512, String(Evaluate("2 ^ 3 ^ 2", values)));
    check("Platzhalter werden eingesetzt", Evaluate("{peak3s}", values) === 1500);
    check("Die Rechnung aus der Vorgabe", Math.round(Evaluate("{peak3s} * 0.7 + {current3s} * 0.3", values)) === 1410, String(Evaluate("{peak3s} * 0.7 + {current3s} * 0.3", values)));
    check("sqrt, min und max", Evaluate("sqrt(max(min({current3s} / {peak3s}, 1), 0)) * {peak3s}", values) > 1300);
    check("Leerzeichen sind egal", Evaluate("  {peak3s}   *   2  ", values) === 3000);
    check("Jeder angebotene Platzhalter rechnet", FORMULA_KEYS.every((key) => Number.isFinite(Evaluate(`{${key}}`, values))));

    refuses("Unbekannter Platzhalter fliegt raus", () => Evaluate("{gibtsnicht}", values));
    refuses("Unbekannte Funktion auch", () => Evaluate("wurzel(4)", values));
    refuses("Durch null teilen geht nicht", () => Evaluate("{peak3s} / 0", values));
    refuses("Offene Klammer wird gemeldet", () => Evaluate("(2 + 3", values));
    refuses("Text hinter der Formel auch", () => Evaluate("2 + 3 4", values));
    refuses("Nichts ist keine Formel", () => Evaluate("", values));

    // Der wichtigste Punkt: hier wird nichts ausgefuehrt, was nicht Rechnen ist.
    refuses("Kein Code, nur Rechnen", () => Evaluate("process.exit(1)", values));
    refuses("Auch nicht als Zeichenkette", () => Evaluate('"1"', values));
}

/* ----------------------------------------------------------
   Werte je Spieler und je Team
   ---------------------------------------------------------- */
function checkValues(client: BotClient): void {
    console.log("\n  — Was ein Spieler wert ist —");

    const service = client.teamService;
    const wtsi: ITeamSettings["mmr"] = { mode: "wtsi", formula: "" };
    const strong = Player("p1", "captain", 1500, 1450, 1400, 1380);
    const shaky = Player("p2", "player", 1500, 900, 1400, 900);
    const fresh = Player("p3", "player", null, 1300, null, 1200);
    const empty = Player("p4", "coach", null, null);

    const a = service.Value(strong, wtsi);
    const b = service.Value(shaky, wtsi);

    check("Wer in Form ist, steht höher", (a ?? 0) > (b ?? 0), `${a} vs ${b}`);
    check("Eine Pechsträhne kostet nicht alles", (b ?? 0) > 1000, String(b));
    check("Ohne Peak zählt der aktuelle Wert", service.Value(fresh, wtsi) !== null, String(service.Value(fresh, wtsi)));
    check("Ohne jede Zahl gibt es keinen Wert", service.Value(empty, wtsi) === null);

    const own: ITeamSettings["mmr"] = { mode: "formula", formula: "{peak3s}" };

    check("Die eigene Rechnung wird benutzt", service.Value(strong, own) === 1500, String(service.Value(strong, own)));
    check("Eine kaputte Formel gibt keinen Wert", service.Value(strong, { ...own, formula: "{quatsch}" }) === null);

    console.log("\n  — Was ein Team wert ist —");

    check("Der Durchschnitt zählt", service.TeamValue([1000, 2000]) === 1500);
    check("Leere Werte fallen weg", service.TeamValue([1000, null, 2000]) === 1500);
    check("Ohne Werte gibt es keine MMR", service.TeamValue([null, null]) === null);
    check("Auch ein einzelner Spieler ergibt einen Wert", service.TeamValue([1234]) === 1234);
}

/* ----------------------------------------------------------
   Einstellungen
   ---------------------------------------------------------- */
function checkSettings(client: BotClient): void {
    console.log("\n  — Einstellungen —");

    const guild = FakeGuild();
    const service = client.teamService;
    const clean = service.CleanSettings(guild, { channelId: TEXT, layout: "menu", mmr: { mode: "formula", formula: "{peak3s} * 2" } }, DefaultTeamSettings());

    check("Der Kanal kommt an", clean.channelId === TEXT);
    check("Das Layout auch", clean.layout === "menu");
    check("Die eigene Rechnung wird übernommen", clean.mmr.formula === "{peak3s} * 2");
    check("Ein Sprachkanal fällt weg", service.CleanSettings(guild, { channelId: VOICE }, DefaultTeamSettings()).channelId === null);
    check("Ein erfundenes Layout bleibt beim alten", service.CleanSettings(guild, { layout: "quatsch" }, DefaultTeamSettings()).layout === "cards");

    // Eine kaputte Formel wird beim Speichern abgewiesen und nicht erst, wenn
    // die Uebersicht rausgeht.
    refuses("Eine kaputte Rechnung wird abgewiesen", () =>
        service.CleanSettings(guild, { mmr: { mode: "formula", formula: "{peak3s} * " } }, DefaultTeamSettings())
    );
    refuses("Unbekannte Platzhalter ebenso", () => service.CleanSettings(guild, { mmr: { mode: "formula", formula: "{tore} + 1" } }, DefaultTeamSettings()));

    const keepsBad = service.CleanSettings(guild, { mmr: { mode: "wtsi", formula: "{kaputt}" } }, DefaultTeamSettings());

    check("Bei WTSI stört eine unbenutzte Formel nicht", keepsBad.mmr.mode === "wtsi" && keepsBad.mmr.formula === "{kaputt}");
}

/* ----------------------------------------------------------
   Die Karten
   ---------------------------------------------------------- */
function checkView(client: BotClient): void {
    console.log("\n  — Kader und Karten —");

    const guild = FakeGuild();
    const service = client.teamService;
    const settings = DefaultTeamSettings();
    const groups: ITeamGroup[] = [{ id: 1, guildId: GUILD, name: "Main", position: 0 }];
    const team = FakeTeam([
        Player("p1", "coach", 1200, 1100),
        Player("p2", "captain", 1500, 1450),
        Player("p3", "sub", 1300, 1250),
        Player("p4", "player", 1400, 1350),
    ]);

    const view = service.Look(team, groups, settings);

    check("Der Captain steht oben", view.players[0].player.role === "captain", view.players[0].player.role);
    check("Der Coach steht hinter den Spielern", view.players.at(-1)?.player.role === "coach", String(view.players.at(-1)?.player.role));
    check("Die Reihenfolge folgt ROLE_ORDER", view.players.every((entry, index, all) => index === 0 || ROLE_ORDER.indexOf(all[index - 1].player.role) <= ROLE_ORDER.indexOf(entry.player.role)));
    check("Die Team-MMR steht", typeof view.mmr === "number", String(view.mmr));
    check("Der Coach zählt nicht mit", PLAYING_ROLES.includes("captain") && !PLAYING_ROLES.includes("coach"));

    check("Co-Captain zählt mit, Trial nicht", COUNTING_ROLES.includes("cocaptain") && !COUNTING_ROLES.includes("trial"));
    check("Trial spielt trotzdem mit", PLAYING_ROLES.includes("trial"));

    // Ein Captain mit 1500 und ein Trial mit 2000: die Team-MMR bleibt beim Captain.
    const withTrial = service.Look(FakeTeam([Player("p1", "captain", 1500, 1500), Player("p2", "trial", 2000, 2000)]), groups, settings);
    const captainOnly = service.Look(FakeTeam([Player("p1", "captain", 1500, 1500)]), groups, settings);

    check("Ein Trial ändert die Team-MMR nicht", withTrial.mmr === captainOnly.mmr, `${withTrial.mmr} / ${captainOnly.mmr}`);
    check("Er steht aber in der Aufstellung", LineupText(withTrial).includes("Trial"));

    const withCo = service.Look(FakeTeam([Player("p1", "captain", 1500, 1500), Player("p2", "cocaptain", 1300, 1300)]), groups, settings);

    check("Ein Co-Captain zieht den Schnitt mit", withCo.mmr !== null && captainOnly.mmr !== null && withCo.mmr < captainOnly.mmr, `${withCo.mmr}`);
    check("Und steht direkt hinter dem Captain", withCo.players[1]?.player.role === "cocaptain");

    const coachOnly = service.Look(FakeTeam([Player("p1", "coach", 1500, 1500)]), groups, settings);

    check("Ein Team nur aus Coaches hat keine MMR", coachOnly.mmr === null, String(coachOnly.mmr));

    const roster = RosterText(view);

    check("Der Kader nennt jede Aufgabe", roster.includes("Captain") && roster.includes("Stamm") && roster.includes("Ersatz") && roster.includes("Coach"));
    check("Und jeden Spieler", view.players.every((entry) => roster.includes(entry.label)));
    check("Ein leerer Kader sagt das", RosterText(service.Look(FakeTeam([]), groups, settings)) === "Noch niemand im Kader.");

    const lineup = LineupText(view);
    const staff = StaffText(view);

    check("Die Aufstellung nennt nur, wer spielt", lineup.includes("Captain") && lineup.includes("Ersatz") && !lineup.includes("Coach"));
    check("Und der Staff nur, wer nicht spielt", staff.includes("Coach") && !staff.includes("Captain"));
    check("Mit Epic-Namen steht ein Tracker-Link dabei", lineup.includes("[Tracker](https://"), lineup.split("\n")[0]);
    check("Ohne Epic-Namen fehlt er", !LineupText(service.Look(FakeTeam([{ ...Player("p1", "captain", 1500, 1450), epicName: "" }]), groups, settings)).includes("Tracker"));
    check("Ein leerer Kader sagt auch hier Bescheid", LineupText(service.Look(FakeTeam([]), groups, settings)) === "Noch niemand im Kader.");
    check("Ohne Staff steht das da", StaffText(service.Look(FakeTeam([Player("p1", "captain", 1500, 1450)]), groups, settings)) === "Niemand eingetragen.");

    const values = TeamValues(view, guild, settings);

    check("{team.name} steht bereit", values["team.name"] === "Vyrox Main");
    check("{team.mmr} ist eine Zahl", /^\d+$/.test(values["team.mmr"] ?? ""), values["team.mmr"]);
    check("{team.group} nennt die Gruppe", values["team.group"] === "Main");
    check("{team.lineup} und {team.staff} stehen bereit", Boolean(values["team.lineup"]) && Boolean(values["team.staff"]));
    check("{team.role} ist eine Erwähnung", values["team.role"] === `<@&${ROLE}>`);

    console.log("\n  — Die Kanäle eines Teams —");

    check("{team.channels} nennt die Textkanäle", values["team.channels"] === `<#${TEXT}>`, values["team.channels"]);
    check("{team.voice} die Sprachkanäle", values["team.voice"] === `<#${VOICE}>`, values["team.voice"]);
    check("{team.channel} den ersten Textkanal", values["team.channel"] === `<#${TEXT}>`);

    const onCategory = service.Look(FakeTeam([], { channels: { kind: "category", categoryId: CATEGORY, textIds: [TEXT], voiceIds: [] } }), groups, settings);

    check("Eine Kategorie steht als Kategorie da", ChannelsText(onCategory, "text") === `<#${CATEGORY}>`, ChannelsText(onCategory, "text"));
    check("Und {team.category} zeigt sie auch dann", ChannelsText(onCategory, "category") === `<#${CATEGORY}>`);
    check("Ohne Kanäle steht ein Strich", ChannelsText(service.Look(FakeTeam([], { channels: { kind: "channels", categoryId: null, textIds: [], voiceIds: [] } }), groups, settings), "text") === "—");
    check("Ohne Gruppe steht das da", TeamValues(service.Look(FakeTeam([], { groupId: null }), groups, settings), guild, settings)["team.group"] === "ohne Gruppe");

    console.log("\n  — Liga-Links —");

    const linked = service.Look(
        FakeTeam([Player("p1", "captain", 1500, 1450)], { links: [{ label: "RLCS Quali", url: "https://rlcs.gg/" }, { label: "Nexus Liga", url: "https://start.gg/nexus" }] }),
        groups,
        settings
    );

    check("{team.leagues} setzt die Links hintereinander", LeaguesText(linked) === "[RLCS Quali](https://rlcs.gg/) · [Nexus Liga](https://start.gg/nexus)", LeaguesText(linked));
    check("Ohne Links bleibt es leer", LeaguesText(view) === "");
    check("{team.leagues} steht in den Werten", TeamValues(linked, guild, settings)["team.leagues"]?.includes("[RLCS Quali]") === true);
    check("Die Übersicht nennt die Ligen", BoardText([linked], groups).includes("Ligen: [RLCS Quali]"));

    const board = BoardText([view], groups);

    check("Die Übersicht führt die Gruppe auf", board.includes("### Main"));
    check("Und das Team darin", board.includes("Vyrox Main"));
    check("Der Staff steht auch in der Übersicht", board.split("\n").some((line) => line.startsWith("-# ") && line.includes("Spieler p1")), board);
    check("Ohne Teams sagt sie das", BoardText([], groups) === "Noch keine Teams.");

    const loose = service.Look(FakeTeam([], { id: 2, name: "Ohne", groupId: null }), groups, settings);

    check("Teams ohne Gruppe stehen unten", BoardText([view, loose], groups).includes("### Ohne Gruppe"));

    const many = Array.from({ length: MAX_MENU_TEAMS + 5 }, (_, index) => service.Look(FakeTeam([], { id: index + 1, name: `Team ${index + 1}` }), groups, settings));
    const row = TeamMenuRow(many);
    const json = JSON.stringify(row.toJSON());

    check("Das Menü nimmt nur, was Discord erlaubt", (JSON.parse(json) as { components: { options: unknown[] }[] }).components[0].options.length === MAX_MENU_TEAMS);
    check("Die Custom-ID trägt den Anfang", json.includes("teams:menu"));
}

/* ----------------------------------------------------------
   Kader säubern
   ---------------------------------------------------------- */
function checkClean(client: BotClient): void {
    console.log("\n  — Kader säubern —");

    const service = client.teamService;
    const before = [Player("p1", "captain", 1500, 1450)];
    // CleanPlayers ist privat: was von der Seite kommt, geht durch CleanTeam.
    const clean = (service as unknown as { CleanPlayers: (input: unknown, previous: ITeamPlayer[]) => ITeamPlayer[] }).CleanPlayers.call(service, [
        { id: "p1", name: "Nico", epicName: "epic-p1", role: "captain", peaks: { "3v3": "1500", "2v2": -5, "1v1": 99999 } },
        { id: "p1", name: "Doppelt", epicName: "x", role: "player", peaks: {} },
        { id: "p2", name: "", epicName: "", role: "player", peaks: {} },
        { id: "p3", name: "Neu", epicName: "epic-p3", role: "erfunden", peaks: { "3v3": 1200 } },
        { id: "p4", name: "Gefälscht", epicName: "epic-p4", role: "player", peaks: {}, snapshot: { mmr: { "3v3": 9999 }, at: Date.now(), error: null } },
    ], before);

    check("Doppelte IDs fallen weg", clean.filter((player) => player.id === "p1").length === 1);
    check("Wer keinen Namen hat, fällt weg", !clean.some((player) => player.id === "p2"));
    check("Eine erfundene Aufgabe wird zu Stamm", clean.find((player) => player.id === "p3")?.role === "player");
    check("Text-Peaks werden Zahlen", clean.find((player) => player.id === "p1")?.peaks["3v3"] === 1500);
    check("Negative Peaks fallen weg", clean.find((player) => player.id === "p1")?.peaks["2v2"] === null);
    check("Zu große Peaks werden gedeckelt", clean.find((player) => player.id === "p1")?.peaks["1v1"] === 3000, String(clean.find((player) => player.id === "p1")?.peaks["1v1"]));
    check("Der alte Prime-Stand bleibt erhalten", clean.find((player) => player.id === "p1")?.snapshot?.mmr["3v3"] === 1450);
    check("Ein mitgeschickter Stand wird verworfen", clean.find((player) => player.id === "p4")?.snapshot === undefined);

    const renamed = (service as unknown as { CleanPlayers: (input: unknown, previous: ITeamPlayer[]) => ITeamPlayer[] }).CleanPlayers.call(
        service,
        [{ id: "p1", name: "Nico", epicName: "jemand-anders", role: "captain", peaks: {} }],
        before
    );

    check("Ein neuer Epic-Name wirft den alten Stand weg", renamed[0].snapshot === undefined);

    const legacy = (service as unknown as { CleanPlayers: (input: unknown, previous: ITeamPlayer[]) => ITeamPlayer[] }).CleanPlayers.call(
        service,
        [{ id: "p9", name: "Alter Analyst", epicName: "", role: "analyst", peaks: {} }],
        []
    );

    check("Ein alter Analyst wird Coach, nicht Stamm", legacy[0]?.role === "coach", String(legacy[0]?.role));

    console.log("\n  — Liga-Links säubern —");

    const links = service.CleanLinks([
        { label: "RLCS [Quali]", url: "https://rlcs.gg" },
        { label: "", url: "https://www.start.gg/tournament/nexus" },
    ]);

    check("Eckige Klammern fallen aus dem Namen", links[0]?.label === "RLCS Quali", links[0]?.label);
    check("Ohne Namen steht die Seite da", links[1]?.label === "start.gg", links[1]?.label);
    check("Höchstens fünf Links", service.CleanLinks(Array.from({ length: MAX_LINKS + 3 }, () => ({ label: "x", url: "https://x.gg" }))).length === MAX_LINKS);

    let refused = false;

    try {
        service.CleanLinks([{ label: "Unsicher", url: "http://liga.de" }]);
    } catch (error) {
        refused = error instanceof TeamError;
    }

    check("http wird abgewiesen", refused);

    refused = false;

    try {
        service.CleanLinks([{ label: "Kaputt", url: "keine adresse" }]);
    } catch (error) {
        refused = error instanceof TeamError;
    }

    check("Eine kaputte Adresse auch", refused);

    const many = Array.from({ length: MAX_PLAYERS + 5 }, (_, index) => ({ id: `n${index}`, name: `Spieler ${index}`, epicName: "", role: "player", peaks: {} }));
    const capped = (service as unknown as { CleanPlayers: (input: unknown, previous: ITeamPlayer[]) => ITeamPlayer[] }).CleanPlayers.call(service, many, []);

    check("Der Kader ist gedeckelt", capped.length === MAX_PLAYERS, String(capped.length));
    check("Die nächste Spieler-ID ist frei", !capped.some((player) => player.id === NextPlayerId(capped)));
}

/* ----------------------------------------------------------
   Die Uebersicht mit Auswahlmenue
   ---------------------------------------------------------- */
async function checkMenu(client: BotClient): Promise<void> {
    console.log("\n  — Auswahlmenü bei jeder Art von Nachricht —");

    const guild = FakeGuild();
    const service = client.teamService;
    const groups: ITeamGroup[] = [{ id: 1, guildId: GUILD, name: "Main", position: 0 }];
    const base = DefaultTeamSettings();
    const views = [service.Look(FakeTeam([Player("p1", "captain", 1500, 1450)]), groups, base)];

    for (const kind of ["v2", "embed", "text"] as const) {
        const settings: ITeamSettings = {
            ...base,
            layout: "menu",
            board: { ...base.board, kind, content: "Unsere Teams", embed: kind === "embed" ? ({ title: "Teams", description: "{teams}" } as never) : null },
        };

        const view = await BoardView(client, settings, views, groups, guild);
        const json = JSON.stringify(view.components.map((entry) => entry.toJSON()));

        check(`Das Menü hängt an der Art "${kind}"`, json.includes("teams:menu"), json.slice(0, 120));
    }

    const without = await BoardView(client, { ...base, layout: "single" }, views, groups, guild);

    check("Ohne Menü-Layout hängt keins daran", !JSON.stringify(without.components.map((entry) => entry.toJSON())).includes("teams:menu"));
}

/* ----------------------------------------------------------
   Rollen im Kader
   ---------------------------------------------------------- */
function checkRoles(client: BotClient): void {
    console.log("\n  — Rollen im Kader —");

    const CAPTAIN = "90071992547409960";
    const COACH = "90071992547409961";
    const ACADEMY = "90071992547409962";
    const NEW = "90071992547409963";
    const [A, B, C, D] = ["100000000000000001", "100000000000000002", "100000000000000003", "100000000000000004"];
    const roles = { ...DefaultRoles(), positions: { ...DefaultRoles().positions, captain: CAPTAIN, coach: COACH } };
    const member = (id: string, discordId: string | null, role: TeamRole): ITeamPlayer => ({ ...Player(id, role, null, null), discordId });

    const main = FakeTeam([member("p1", A, "captain"), member("p2", B, "player"), member("p3", null, "sub")]);
    const academy = FakeTeam([member("p1", A, "captain"), member("p2", C, "coach")], { id: 2, roleId: ACADEMY });
    const targets = RoleTargets([main, academy], roles);

    check("Wer im Kader steht, bekommt die Team-Rolle", targets.get(B)?.has(ROLE) === true);
    check("Und die Rolle seiner Aufgabe", targets.get(A)?.has(CAPTAIN) === true && targets.get(C)?.has(COACH) === true);
    check("Wer in zwei Teams steht, bekommt beide Team-Rollen", targets.get(A)?.has(ROLE) === true && targets.get(A)?.has(ACADEMY) === true);
    check("Ohne Discord-Konto gibt es nichts", targets.size === 3, String(targets.size));
    check("Eine Aufgabe ohne Rolle bringt keine", targets.get(B)?.size === 1);

    // A geht aus Main raus, bleibt aber Captain der Academy.
    const left = RolePlan(targets, RoleTargets([{ ...main, players: main.players.slice(1) }, academy], roles));
    const stepA = left.find((step) => step.userId === A);

    check("Wer rausgeht, verliert die Team-Rolle", stepA?.dropped.includes(ROLE) === true, JSON.stringify(stepA));
    check("Captain bleibt er, solange er es woanders ist", stepA?.dropped.includes(CAPTAIN) === false);
    check("Wen es nicht betrifft, der steht nicht im Plan", left.length === 1, left.map((step) => step.userId).join(", "));

    const gone = RolePlan(targets, RoleTargets([main], roles));
    const stepC = gone.find((step) => step.userId === C);

    check("Ein gelöschtes Team nimmt seine Rollen mit", stepC?.dropped.includes(ACADEMY) === true && stepC.dropped.includes(COACH));
    check("Die Rolle des anderen Teams bleibt", gone.find((step) => step.userId === A)?.dropped.includes(ROLE) === false);

    const swapped = RolePlan(targets, RoleTargets([{ ...main, roleId: NEW }, academy], roles)).find((step) => step.userId === B);

    check("Eine neue Team-Rolle ersetzt die alte", swapped?.dropped.includes(ROLE) === true && swapped.wanted.includes(NEW), JSON.stringify(swapped));
    check("Ohne Änderung gibt es nichts zu tun", RolePlan(targets, targets).length === 0);
    check("Beim Speichern kommt der Kader trotzdem dran", RolePlan(targets, targets, [B]).map((step) => step.userId).join() === B);
    check("Ohne Rollen bleibt der Kader in Ruhe", RoleTargets([{ ...main, roleId: null }], DefaultRoles()).size === 0);
    check("Auch beim Speichern", RolePlan(new Map(), new Map(), [A, B]).length === 0);

    // „Jetzt abgleichen“: vorher ist, wer die Rollen gerade hat.
    const sync = RolePlan(new Map([[D, new Set([ROLE])], [B, new Set([ROLE])]]), targets);

    check("Wer eine Team-Rolle ohne Kader hat, verliert sie", sync.find((step) => step.userId === D)?.dropped.includes(ROLE) === true);
    check("Wer sie hat und drinsteht, bleibt unberührt", !sync.some((step) => step.userId === B));
    check("Wem etwas fehlt, der bekommt es", sync.some((step) => step.userId === A && step.wanted.includes(CAPTAIN)));

    const guild = FakeGuild();
    const clean = client.teamService.CleanSettings(guild, { roles: { sync: false, positions: { captain: ROLE, coach: "123", manager: GUILD } } }, DefaultTeamSettings());

    check("Eine Rolle je Aufgabe kommt an", clean.roles.positions.captain === ROLE);
    check("Eine unbekannte Rolle fällt weg", clean.roles.positions.coach === null);
    check("@everyone ist keine Rolle für eine Aufgabe", clean.roles.positions.manager === null);
    check("Vergeben lässt sich ausschalten", !clean.roles.sync);
    check("Ohne Angabe bleibt alles, wie es war", client.teamService.CleanSettings(guild, { channelId: TEXT }, clean).roles.positions.captain === ROLE);
    check("Ab Werk vergibt der Bot die Rollen", DefaultTeamSettings().roles.sync);
    check("Jede Aufgabe hat ihren Platz", ROLE_ORDER.every((role) => DefaultRoles().positions[role] === null));
    check("Textkanäle heißen klein und mit Bindestrich", TextName("  Vyrox Main ") === "vyrox-main", TextName("  Vyrox Main "));
}

/* ----------------------------------------------------------
   Datenbank: was der Bot anlegt, bleibt gespeichert
   ---------------------------------------------------------- */
async function checkDatabase(client: BotClient): Promise<void> {
    console.log("\n  — Datenbank —");

    const team = await client.teams.CreateFull(GUILD, { name: "Prüf-Team" });

    try {
        check("Ein neues Team hat nichts angelegt", team.created.roleId === null && team.created.textIds.length === 0, JSON.stringify(team.created));

        await client.teams.Save(team.id, { created: { roleId: ROLE, categoryId: CATEGORY, textIds: [TEXT], voiceIds: [VOICE] } });

        const back = await client.teams.Full(team.id);

        check("Was der Bot anlegt, steht danach am Team", back?.created.roleId === ROLE && back.created.voiceIds[0] === VOICE, JSON.stringify(back?.created));
        check("Und der Rest bleibt unberührt", back?.name === "Prüf-Team" && back.channels.textIds.length === 0);
    } finally {
        await client.teams.Remove(team.id);
    }

    check("Aufgeräumt", (await client.teams.Full(team.id)) === null);
}

/* ----------------------------------------------------------
   Ränge und Platzhalter je Spieler
   ---------------------------------------------------------- */
async function checkPlayers(client: BotClient): Promise<void> {
    console.log("\n  — Ränge aus der MMR —");

    const at = (mmr: number): string => {
        const rank = RankFromMMR(mmr);

        return RankText(rank.tier, rank.division);
    };

    check("Knapp unter Champion I ist Diamant III Div IV", at(1074) === "Diamant III Div IV", at(1074));
    check("Ab 1075 Champion I Div I", at(1075) === "Champion I Div I", at(1075));
    check("Ab 1435 Grand Champion I", at(1435) === "Grand Champion I Div I", at(1435));
    check("Die Divisionen teilen die Stufe in vier", at(1504) === "Grand Champion I Div II", at(1504));
    check("Supersonic Legend hat keine Division", at(1875) === "Supersonic Legend" && at(2500) === "Supersonic Legend", at(1875));
    check("Unter null bleibt es Bronze I", at(-40) === "Bronze I Div I", at(-40));
    check("Prime-Divisionen lesen sich mit Div", RankText(18, "II") === "Champion III Div II", RankText(18, "II"));
    check("Unranked bleibt ohne Division", RankText(0, null) === "Unranked");
    check("Kurz: GC1 D2", RankShort(19, "II") === "GC1 D2", RankShort(19, "II"));
    check("Kurz: SSL ohne Division", RankShort(22, "I") === "SSL");

    console.log("\n  — Platzhalter je Spieler —");

    check("Der Schlüssel ist der Epic-Name, klein", PlayerKey("MecryTv") === "mecrytv");
    check("Ohne Sonderzeichen", PlayerKey("xX_Dribbler_Xx") === "xxdribblerxx" && PlayerKey("Ünal ß") === "unalss", PlayerKey("Ünal ß"));
    check("WTSI rechnet mit 2v2 und 3v3", UsedSlots({ mode: "wtsi", formula: "" }).join() === "2v2,3v3");
    check("Eine eigene Formel mit dem, was darin steht", UsedSlots({ mode: "formula", formula: "{peak2s} + {current1s}" }).join() === "1v1,2v2");
    check("Ohne Playlist in der Formel gilt 3v3", UsedSlots({ mode: "formula", formula: "{tier} * 70" }).join() === "3v3");

    const guild = FakeGuild();
    const service = client.teamService;
    const settings = DefaultTeamSettings();
    const groups: ITeamGroup[] = [{ id: 1, guildId: GUILD, name: "Main", position: 0 }];
    const nico = { ...Player("p1", "captain", 1500, 1450, 1400, 1380), epicName: "Nico_RL", discordId: "100000000000000001" };
    const mo = { ...Player("p2", "player", 1400, 1350), epicName: "MoKing" };
    const main = service.Look(FakeTeam([nico, mo]), groups, settings);
    const academy = service.Look(FakeTeam([{ ...Player("p1", "captain", 1200, 1150), epicName: "Timo" }], { id: 2, name: "Academy" }), groups, settings);
    const values = PlayerValues([main, academy], settings);
    const value = main.players.find((entry) => entry.player.id === "p1")?.value ?? 0;

    check("{nicorl} ist der Spieler", values.nicorl === "<@100000000000000001>", values.nicorl);
    check("Ohne Discord steht der Name", values.moking === "**Spieler p2**", values.moking);
    check("{nicorl.mmr} ist der Wert nach der Rechnung", values["nicorl.mmr"] === String(value), `${values["nicorl.mmr"]} / ${value}`);
    check("{nicorl.rank} ist der Rang zu diesem Wert", values["nicorl.rank"] === at(value), `${values["nicorl.rank"]} / ${value}`);
    check("{nicorl.rank.short} kurz", /^(GC|C)\d D\d$/.test(values["nicorl.rank.short"] ?? ""), values["nicorl.rank.short"]);
    check("{nicorl.current}: Schnitt aus 2v2 und 3v3", values["nicorl.current"] === String(Math.round((1380 + 1450) / 2)), values["nicorl.current"]);
    check("{nicorl.peak}: ebenso", values["nicorl.peak"] === String(Math.round((1400 + 1500) / 2)), values["nicorl.peak"]);
    check("Fehlt 2v2, zählt nur 3v3", values["moking.current"] === "1350", values["moking.current"]);
    check("{nicorl.tracker} ist ein Link", values["nicorl.tracker"]?.startsWith("[Tracker](https://") === true);
    check("Spieler anderer Teams sind dabei", values["timo.rank"] !== undefined);

    // Die Werte rechnet Look() mit der Rechnung des Servers - hier also mit der eigenen.
    const formula: ITeamSettings = { ...settings, mmr: { mode: "formula", formula: "{peak3s}" } };
    const own = PlayerValues([service.Look(FakeTeam([nico, mo]), groups, formula)], formula);

    check("Eine Formel nur mit 3v3 nimmt nur 3v3", own["nicorl.current"] === "1450" && own["nicorl.mmr"] === "1500", `${own["nicorl.current"]} / ${own["nicorl.mmr"]}`);

    const filled = TeamValues(main, guild, settings, [main, academy]);

    check("Die Karte kennt die Spieler aller Teams", filled["timo.mmr"] !== undefined);
    check("Ein Epic-Name verdrängt keinen festen Platzhalter", TeamValues(service.Look(FakeTeam([{ ...Player("p1", "captain", 1500, 1450), epicName: "Guild" }]), groups, settings), guild, settings).guild === "Dev Server");
    check("Groß und klein ist egal", Fill("{Nico_RL.rank}", filled) === filled["nicorl.rank"], Fill("{Nico_RL.rank}", filled));
    check("Unbekanntes bleibt stehen", Fill("{gibtsnicht.rank}", filled) === "{gibtsnicht.rank}");
    check("{constructor} ist kein Platzhalter", Fill("{constructor}", {}) === "{constructor}");
    check("Die Aufstellung schreibt die Division mit Div", LineupText(main).includes("Champion III Div II"), LineupText(main).split("\n")[0]);

    const list = PlayerList([main, academy], settings);

    check("Das Dashboard bekommt jeden Spieler einmal", list.length === 3 && list[0]?.key === "nicorl" && list[0].team === "Vyrox Main");
    check("In der Vorschau steht der Name statt der Erwähnung", list[0]?.values.nicorl === "@Spieler p1", list[0]?.values.nicorl);

    console.log("\n  — Ränge als Icon oder Text —");

    const icon = (tier: number): string | null => (tier === 19 ? "<:rl_gc1:1>" : null);

    check("Ausgeschrieben bleibt Text", RankFormatter("text", icon)(19, "II") === "Grand Champion I Div II");
    check("Als Icon nur das Icon", RankFormatter("icon", icon)(19, "II") === "<:rl_gc1:1>");
    check("Icon und Text", RankFormatter("both", icon)(19, "II") === "<:rl_gc1:1> Grand Champion I Div II");
    check("Fehlt das Icon, steht der Text da", RankFormatter("icon", icon)(18, "I") === "Champion III Div I");

    const iconMain = service.Look(FakeTeam([{ ...nico, snapshot: { ...nico.snapshot!, tier: 19, tierName: "Grand Champion I", divisionName: "I" } }]), groups, settings);

    const asIcon = { ...PLAIN_FORMATS, rank: RankFormatter("icon", icon) };

    check("Die Aufstellung nimmt die Einstellung", LineupText(iconMain, true, asIcon).includes("<:rl_gc1:1>"), LineupText(iconMain, true, asIcon));
    check("Der Kader auch", RosterText(iconMain, { ...PLAIN_FORMATS, rank: RankFormatter("both", icon) }).includes("<:rl_gc1:1> Grand Champion I Div I"));
    check("Ab Werk steht der Rang ausgeschrieben", DefaultTeamSettings().rankStyle === "text");
    check("Die Einstellung wird übernommen", service.CleanSettings(guild, { rankStyle: "both" }, DefaultTeamSettings()).rankStyle === "both");
    check("Eine erfundene bleibt beim alten", service.CleanSettings(guild, { rankStyle: "quatsch" }, DefaultTeamSettings()).rankStyle === "text");

    console.log("\n  — Platzhalter je Aufgabe —");

    const roles = RoleValues(main, settings);

    check("{team.captain.rank} ist der Rang des Captains", roles["team.captain.rank"] === values["nicorl.rank"], roles["team.captain.rank"]);
    check("{team.captain.mmr} sein Wert", roles["team.captain.mmr"] === values["nicorl.mmr"]);
    check("{team.player} nennt den Stamm", roles["team.player"] === "Spieler p2", roles["team.player"]);
    check("Eine leere Aufgabe sagt —", roles["team.coach"] === "—" && roles["team.coach.rank"] === "—");

    const pair = RoleValues(service.Look(FakeTeam([{ ...mo, id: "p1", name: "Mo" }, { ...Player("p2", "player", 1200, 1150), epicName: "Lena", name: "Lena" }]), groups, settings), settings);
    const pairMmr = pair["team.player.mmr"]?.split(", ") ?? [];

    check("Mehrere Spieler stehen hintereinander, in derselben Reihenfolge", pair["team.player"] === "Mo, Lena" && pairMmr.length === 2 && Number(pairMmr[0]) > Number(pairMmr[1]), `${pair["team.player"]} / ${pair["team.player.mmr"]}`);
    check("Die Rang-Anzeige gilt auch hier", RoleValues(main, settings, false, { ...PLAIN_FORMATS, rank: RankFormatter("icon", (tier) => `<:rl:${tier}>`) })["team.captain.rank"]?.startsWith("<:rl:") === true);
    check("In der Vorschau steht der Name statt der Erwähnung", RoleValues(main, settings, true)["team.captain"] === "@Spieler p1", RoleValues(main, settings, true)["team.captain"]);
    check("Die Karte kennt die Aufgaben", TeamValues(main, guild, settings)["team.player.rank"] !== undefined);

    console.log("\n  — Rang-Icons —");

    const missing = RANK_ICON_FILES.filter((name) => !existsSync(path.join(RANK_ICON_ROOT, `${name}.png`)));

    check(`Alle ${RANK_ICON_FILES.length} Abzeichen liegen bereit`, missing.length === 0, missing.join(", "));
    check("Die Emoji-Namen", RankIconName(0) === "rl_unranked" && RankIconName(19) === "rl_gc1" && RankIconName(22) === "rl_ssl" && RankIconName(14) === "rl_d2");
    check("Jeder Name ist einmalig und Discord-tauglich", new Set(RANK_ICON_FILES.map((_, tier) => RankIconName(tier))).size === RANK_ICON_FILES.length && RANK_ICON_FILES.every((_, tier) => /^\w{2,32}$/.test(RankIconName(tier))));

    if (!missing.length) {
        const image = await RankIconImage(19);

        check("Das Icon wird klein genug für Discord", image.length < 256 * 1024 && image.subarray(1, 4).toString() === "PNG", `${image.length} Bytes`);
    }

    const { pathToFileURL } = await import("node:url");
    const file = path.join(process.cwd(), "src", "dashboard", "client", "constants", "Placeholders.ts");

    if (!existsSync(file)) return check("Die Liste des Dashboards ist da", false, file);

    const loaded = (await import(pathToFileURL(file).href)) as {
        TEAM_PLAYER_FIELDS?: [string, string][];
        TEAM_CARD_PLACEHOLDERS?: { key: string }[];
        styleRanks?: (text: string, style: "text" | "icon" | "both", icons: Record<string, string>) => string;
    };

    // Die Vorschau setzt die Ränge selbst, nach der ungespeicherten Einstellung -
    // sie muss genau so schreiben wie der Bot beim Senden.
    if (loaded.styleRanks) {
        const style = loaded.styleRanks;
        const emoji = (tier: number): string | null => (tier === 18 ? null : `<:rl_${tier}:${tier}>`);
        const byName = Object.fromEntries(TIERS.flatMap((name, tier) => (emoji(tier) ? [[name, emoji(tier)!]] : [])));
        const mismatch: string[] = [];

        for (const mode of ["text", "icon", "both"] as const) {
            for (let tier = 0; tier < TIERS.length; tier++) {
                for (const division of [null, ...DIVISIONS]) {
                    const bot = RankFormatter(mode, emoji)(tier, division);
                    const page = style(RankText(tier, division), mode, byName);

                    if (bot !== page) mismatch.push(`${mode} ${tier} ${division}: ${bot} / ${page}`);
                }
            }
        }

        check("Die Vorschau schreibt Ränge wie der Bot - in allen drei Arten", mismatch.length === 0, mismatch.slice(0, 3).join(" | "));
        check("„Champion I“ in „Grand Champion I“ wird nicht doppelt ersetzt", style("@Nico · Grand Champion I Div II", "icon", { "Grand Champion I": "<:gc1:1>", "Champion I": "<:c1:2>" }) === "@Nico · <:gc1:1>");
    } else {
        check("Die Vorschau hat styleRanks", false);
    }
    const card = TeamValues(main, guild, settings);
    const unknown = (loaded.TEAM_CARD_PLACEHOLDERS ?? []).map((entry) => entry.key).filter((key) => card[key] === undefined);

    check("Jeder Platzhalter der Team-Karte im Dashboard hat einen Wert", (loaded.TEAM_CARD_PLACEHOLDERS ?? []).length > 0 && unknown.length === 0, unknown.join(", "));
    const fields = (loaded.TEAM_PLAYER_FIELDS ?? []).map(([field]) => field);

    check("Dashboard und Bot kennen dieselben Felder je Spieler", fields.join() === PLAYER_FIELDS.join(), `${fields.join()} / ${PLAYER_FIELDS.join()}`);
}

/* ----------------------------------------------------------
   Die Teams-Liste: {teams} nach Vorlage, dazu der Team-Rang
   ---------------------------------------------------------- */
async function checkList(client: BotClient): Promise<void> {
    console.log("\n  — Team-Rang —");

    const guild = FakeGuild();
    const service = client.teamService;
    const settings = DefaultTeamSettings();
    const groups: ITeamGroup[] = [{ id: 1, guildId: GUILD, name: "Main", position: 0 }];
    const coach = { ...Player("p3", "coach", null, null), name: "Lara", discordId: "100000000000000003" };
    const view = service.Look(
        FakeTeam([{ ...Player("p1", "captain", 1500, 1450, 1400, 1380), name: "Nico", discordId: "100000000000000001" }, { ...Player("p2", "player", 1400, 1350), name: "Mo" }, coach], {
            links: [{ label: "RLCS", url: "https://rlcs.gg/" }],
        }),
        groups,
        settings
    );
    const values = TeamValues(view, guild, settings);
    const rank = RankFromMMR(view.mmr ?? 0);

    check("{team.rank} ist der Rang zur Team-MMR", values["team.rank"] === RankText(rank.tier, rank.division), `${values["team.rank"]} / ${view.mmr}`);
    check("{team.rank.short} kurz", values["team.rank.short"] === RankShort(rank.tier, rank.division));
    check("Er folgt „Ränge zeigen als“", TeamValues(view, guild, settings, [view], { ...PLAIN_FORMATS, rank: RankFormatter("icon", (tier) => `<:rl:${tier}>`) })["team.rank"] === `<:rl:${rank.tier}>`);
    check("Ohne Team-MMR steht ein Strich", TeamValues(service.Look(FakeTeam([Player("p1", "coach", null, null)]), groups, settings), guild, settings)["team.rank"] === "—");

    console.log("\n  — Teams-Liste —");

    // Ab Werk je Spieler eine Zeile - ohne Icons (wie hier) steht statt Abzeichen und Rang-Icon der Text.
    const board = BoardText([view], groups, false, settings);
    const lines = board.split("\n");

    check("Die Liste ab Werk: Kopf mit Team-Rang und MMR", lines[1] === `**Vyrox Main** \`VYX\` · ${values["team.rank"]} ${values["team.rank.short"]} · ${view.mmr} MMR`, lines[1]);
    check("Darunter je Spieler eine Zeile", lines[2]?.startsWith("Captain ") === true && lines[2].includes("<@100000000000000001> · `") && lines[2].includes("[Tracker](") && lines[3]?.startsWith("Stamm ") === true, lines.slice(2, 4).join(" | "));
    check("Der Staff klein, nur mit Aufgabe und Name", lines[4] === "-# Coach <@100000000000000003>", lines[4]);
    check("Die Ligen auch", lines[5] === "-# Ligen: [RLCS](https://rlcs.gg/)" && lines.length === 6, lines.slice(5).join(" | "));

    const compact = TEAM_LIST_PRESETS.find((entry) => entry.id === "compact")?.list ?? DefaultTeamList();
    const classic = { ...settings, list: compact };
    const short = BoardText([view], groups, false, classic);

    check("Vorlage „Kompakt“: Kopf mit Team-Rang", short.split("\n")[1] === `**Vyrox Main** \`VYX\` · ${values["team.rank"]} · MMR ${view.mmr} · 2 Spieler`, short.split("\n")[1]);
    check("Darunter jeder Spieler klein in eigener Zeile", short.includes("\n-# <@100000000000000001>\n-# Mo\n"), short);
    check("Der Staff in eigener Zeile", short.includes("-# Staff: <@100000000000000003>"));

    const lone = service.Look(FakeTeam([Player("p1", "captain", 1500, 1450)], { tag: "" }), groups, settings);
    const bare = BoardText([lone], groups, false, classic);
    const plain = BoardText([lone], groups, false, settings);

    check("Ohne Staff und Ligen fallen die Zeilen weg", !bare.includes("Staff:") && !bare.includes("Ligen:") && !plain.includes("-#"), `${bare} | ${plain}`);
    check("Ohne Kürzel bleiben keine leeren Backticks", !bare.includes("``") && bare.includes("**Vyrox Main** ·") && plain.split("\n")[1]?.startsWith("**Vyrox Main** · ") === true, plain.split("\n")[1]);

    const own = { ...settings, list: { ...DefaultTeamList(), team: "{Team.Name}: {team.captain} ({team.captain.rank.short})\n-# {team.members}", member: "{spieler.name} {spieler.rank.short}", roles: ["player"] } };
    const custom = BoardText([view], groups, false, own).split("\n");

    check("Eigene Vorlage mit Aufgaben-Platzhaltern", custom[1]?.startsWith("Vyrox Main: <@100000000000000001> (") === true, custom[1]);
    check("Jeder Spieler eine eigene Zeile, der Rest der Zeile davor", custom[2]?.startsWith("-# Mo ") === true && custom.length === 3, custom.join(" | "));
    check("Nur die gewählten Aufgaben", !custom.join(" ").includes("Nico "), custom.join(" | "));
    check("Die Kurzfassung bleibt beim Kopf", BoardText([view], groups, true) === "### Main\n**Vyrox Main** `VYX` · MMR " + view.mmr);

    const preview = ListTeams([view], settings, PLAIN_FORMATS, true)[0];

    check("In der Vorschau stehen Namen statt Erwähnungen", preview?.values["team.lineup"]?.includes("@Nico") === true && !preview.values["team.lineup"].includes("<@"), preview?.values["team.lineup"]);
    check("Die Vorschau baut dieselbe Liste wie der Bot", TeamListText(ListTeams([view], settings), groups, settings.list) === board);

    const clean = service.CleanSettings(guild, { list: { team: "  ", member: "{spieler}", roles: ["captain", "erfunden"], separator: "comma" } }, settings);

    check("Eine leere Vorlage nimmt die von Werk", clean.list.team === DefaultTeamList().team);
    check("Ohne Staff-Vorlage gilt die von Werk", clean.list.staff === DefaultTeamList().staff);
    check("Unbekannte Aufgaben fallen weg", clean.list.roles.join() === "captain");
    check("Einen Trenner gibt es nicht mehr - ein alter fällt beim Speichern weg", !("separator" in clean.list));

    // Die Ebenen bauen aufeinander auf: ein Spieler über zwei Zeilen, und was in der Zeile je Team
    // um {team.members} steht, steht um jede seiner Zeilen - auch in anderer Schreibweise.
    const tall = { ...settings, list: { ...DefaultTeamList(), team: "**{team.name}**\n> {Team.Members}", member: "{spieler}\n-# {spieler.rank.short}", roles: ["captain", "player"] } };
    const stacked = BoardText([view], groups, false, tall).split("\n");

    check("Ein Spieler darf mehrere Zeilen haben", stacked[2] === "> <@100000000000000001>" && stacked[3]?.startsWith("> -# ") === true && stacked[4] === "> Mo" && stacked.length === 6, stacked.join(" | "));

    const blank = { ...settings, list: { ...DefaultTeamList(), member: "{spieler}\n   \n{spieler.name}" } };

    check("Leere Zeilen eines Spielers fallen weg", !BoardText([view], groups, false, blank).split("\n").some((line) => !line.trim()), BoardText([view], groups, false, blank));

    const { pathToFileURL } = await import("node:url");
    const file = path.join(process.cwd(), "src", "dashboard", "client", "constants", "Placeholders.ts");
    const loaded = (await import(pathToFileURL(file).href)) as { TEAM_MEMBER_PLACEHOLDERS?: { key: string }[]; TEAM_LIST_PLACEHOLDERS?: { key: string }[] };
    const fields = MEMBER_FIELDS.map((field) => (field ? `spieler.${field}` : "spieler"));
    const known = new Set([...Object.keys(preview?.values ?? {}), "team.members", "team.members.staff"]);
    const unknown = (loaded.TEAM_LIST_PLACEHOLDERS ?? []).map((entry) => entry.key).filter((key) => !known.has(key));

    check("Dashboard und Bot kennen dieselben Felder je Spieler in der Liste", (loaded.TEAM_MEMBER_PLACEHOLDERS ?? []).map((entry) => entry.key).join() === fields.join());
    check("Jeder Platzhalter der Teams-Liste hat einen Wert", (loaded.TEAM_LIST_PLACEHOLDERS ?? []).length > 0 && unknown.length === 0, unknown.join(", "));
    check("Jeder Spieler bringt alle Felder mit", preview?.members.every((member) => fields.every((field) => member.values[field] !== undefined)) === true);

    const ranked = { ...settings, list: { ...compact, member: "{spieler} {spieler.rank.short} {spieler.tracker}" } };

    check("Der Staff hat seine eigene Vorlage - ohne Rang und Tracker", BoardText([view], groups, false, ranked).includes("-# Staff: <@100000000000000003>\n"), BoardText([view], groups, false, ranked));

    const keysOf = (text: string): string[] => [...text.matchAll(/\{([A-Za-z0-9._-]+)\}/g)].map((match) => match[1]);
    const strange = TEAM_LIST_PRESETS.flatMap((entry) =>
        [...keysOf(entry.list.team).filter((key) => !known.has(key)), ...[entry.list.member, entry.list.staff].flatMap(keysOf).filter((key) => !fields.includes(key))].map((key) => `${entry.name}: {${key}}`)
    );

    check("Jede Vorlage der Teams-Liste nutzt nur Platzhalter, die es gibt", TEAM_LIST_PRESETS.length > 1 && strange.length === 0, strange.join(", "));
    check("„Spieler untereinander“ ist die Liste ab Werk", JSON.stringify(TEAM_LIST_PRESETS.find((entry) => entry.id === "rows")?.list) === JSON.stringify(DefaultTeamList()));
    check("Jede Vorlage hat eine eigene ID", new Set(TEAM_LIST_PRESETS.map((entry) => entry.id)).size === TEAM_LIST_PRESETS.length);
}

/* ----------------------------------------------------------
   Aufgaben als Icon: Abzeichen, „Aufgaben zeigen als“, .icon
   ---------------------------------------------------------- */
async function checkRoleIcons(client: BotClient): Promise<void> {
    console.log("\n  — Aufgaben als Icon oder Text —");

    const guild = FakeGuild();
    const service = client.teamService;
    const settings = DefaultTeamSettings();
    const groups: ITeamGroup[] = [{ id: 1, guildId: GUILD, name: "Main", position: 0 }];
    // Trial hat hier kein Abzeichen - so zeigt sich, was ohne passiert.
    const badge = (role: TeamRole): string | null => (role === "trial" ? null : `<:rl_role_${role}:1>`);
    const tierIcon = (tier: number): string | null => `<:rl_${tier}:2>`;
    const formats: ITeamFormats = { rank: RankText, rankIcon: RankFormatter("icon", tierIcon), role: RoleFormatter("icon", badge), roleIcon: RoleFormatter("icon", badge) };

    check("Ausgeschrieben bleibt Text", RoleFormatter("text", badge)("captain") === "Captain");
    check("Als Icon nur das Abzeichen", RoleFormatter("icon", badge)("captain") === "<:rl_role_captain:1>");
    check("Icon und Text", RoleFormatter("both", badge)("sub") === "<:rl_role_sub:1> Ersatz");
    check("Fehlt das Abzeichen, steht der Text da", RoleFormatter("icon", badge)("trial") === "Trial");

    const view = service.Look(
        FakeTeam([
            { ...Player("p1", "captain", 1500, 1450), name: "Nico", discordId: "100000000000000001" },
            { ...Player("p2", "player", 1400, 1350), name: "Mo" },
            { ...Player("p3", "coach", null, null), name: "Lara", discordId: "100000000000000003" },
        ]),
        groups,
        settings
    );

    check("Die Aufstellung nimmt die Einstellung", LineupText(view, true, formats).startsWith("**<:rl_role_captain:1>** » <@"), LineupText(view, true, formats).split("\n")[0]);
    check("Der Kader auch", RosterText(view, formats).split("\n")[0] === "**<:rl_role_captain:1>**");
    check("Der Staff auch", StaffText(view, formats) === "**<:rl_role_coach:1>** » <@100000000000000003>", StaffText(view, formats));

    const roles = RoleValues(view, settings, false, formats);

    check("{team.captain.icon} ist das Abzeichen", roles["team.captain.icon"] === "<:rl_role_captain:1>");
    check("Das gibt es auch, wenn niemand die Aufgabe hat", roles["team.manager.icon"] === "<:rl_role_manager:1>" && roles["team.manager"] === "—");
    check("{team.captain.rank.icon} ist immer das Rang-Icon", roles["team.captain.rank.icon"]?.startsWith("<:rl_") === true && roles["team.captain.rank"]?.startsWith("<:") === false, `${roles["team.captain.rank.icon"]} / ${roles["team.captain.rank"]}`);
    check("{team.rank.icon} auch fürs Team", TeamValues(view, guild, settings, [view], formats)["team.rank.icon"]?.startsWith("<:rl_") === true);

    const member = ListTeams([view], settings, formats)[0]?.members[0]?.values ?? {};

    check("{spieler.role} folgt „Aufgaben zeigen als“", member["spieler.role"] === "<:rl_role_captain:1>");
    check("{spieler.role.icon} ist das Abzeichen", member["spieler.role.icon"] === "<:rl_role_captain:1>");
    check("{spieler.rank.icon} immer das Rang-Icon, egal wie „Ränge zeigen als“ steht", member["spieler.rank.icon"]?.startsWith("<:rl_") === true && member["spieler.rank"]?.startsWith("<:") === false, `${member["spieler.rank.icon"]} / ${member["spieler.rank"]}`);
    check("Ohne Icons steht auch {spieler.role.icon} als Text da", ListTeams([view], settings)[0]?.members[0]?.values["spieler.role.icon"] === "Captain");

    // So wie gewünscht: {teamrang} {rankicon} {memberPing} {trackerlink}
    const wish = { ...settings, list: { ...DefaultTeamList(), member: "{spieler.role.icon} {spieler.rank.icon} {spieler} {spieler.tracker}" } };
    const line = BoardText([view], groups, false, wish, formats).split("\n")[2] ?? "";

    check("Ein Spieler mit Abzeichen, Rang-Icon, Erwähnung und Tracker", /^<:rl_role_captain:1> <:rl_\d+:2> <@100000000000000001> \[Tracker\]\(/.test(line), line);

    const rows = TEAM_LIST_PRESETS.find((entry) => entry.id === "rows");
    const board = rows ? BoardText([view], groups, false, { ...settings, list: rows.list }, formats).split("\n") : [];

    check("Vorlage „Spieler untereinander“: Kopf mit Rang-Icon und MMR", /^\*\*Vyrox Main\*\* `VYX` · <:rl_\d+:2> \S+ D\d · \d+ MMR$/.test(board[1] ?? ""), board[1]);
    check("Je Spieler eine Zeile", /^<:rl_role_captain:1> <:rl_\d+:2> <@100000000000000001> · `\d+` · \[Tracker\]\(/.test(board[2] ?? "") && board[3]?.startsWith("<:rl_role_player:1> ") === true, board.slice(2, 4).join(" | "));
    check("Der Staff klein, ohne Striche", board[4] === "-# <:rl_role_coach:1> <@100000000000000003>" && board.length === 5, board.slice(4).join(" | "));

    check("Ab Werk stehen Aufgaben ausgeschrieben", DefaultTeamSettings().roleStyle === "text");
    check("Die Einstellung wird übernommen", service.CleanSettings(guild, { roleStyle: "both" }, DefaultTeamSettings()).roleStyle === "both");
    check("Eine erfundene bleibt beim alten", service.CleanSettings(guild, { roleStyle: "quatsch" }, DefaultTeamSettings()).roleStyle === "text");

    console.log("\n  — Eigene Abzeichen —");

    const own = (badges: unknown) => service.CleanSettings(guild, { badges }, DefaultTeamSettings()).badges;

    check("Ab Werk gilt überall der Standard", Object.keys(DefaultTeamSettings().badges).length === 0);
    check("Ein Unicode-Emoji geht", own({ captain: { kind: "emoji", value: "⭐" } }).captain?.kind === "emoji");
    check("Ein Emoji vom Server auch", own({ sub: { kind: "emoji", value: `<:vyx:${SERVER_EMOJI}>` } }).sub !== undefined);
    check("Ein fremdes Server-Emoji nicht - der Bot könnte es hier nicht zeigen", own({ sub: { kind: "emoji", value: "<:fremd:123456789012345678>" } }).sub === undefined);
    check("Buchstaben sind kein Emoji", own({ captain: { kind: "emoji", value: "abc" } }).captain === undefined);
    check("Ein Bild aus den Vorlagen geht", own({ coach: { kind: "image", value: "default/rocketleague/teamicons/Coach.png" } }).coach?.kind === "image");
    check("Eins aus der eigenen Galerie auch", own({ coach: { kind: "image", value: `${GUILD}/logos/vyx.png` } }).coach?.kind === "image");
    check("Eins aus der Galerie eines anderen Servers nicht", own({ coach: { kind: "image", value: "123456789012345678/logos/x.png" } }).coach === undefined);
    check("Eine Aufgabe, die es nicht gibt, fällt weg", !("erfunden" in own({ erfunden: { kind: "emoji", value: "⭐" } })));

    const kept = service.CleanSettings(
        guild,
        { badges: { coach: { kind: "image", value: "default/a.png" } } },
        { ...DefaultTeamSettings(), badges: { coach: { kind: "image", value: "default/a.png", emoji: "<:rlb_x:123456789012345678>" } } }
    ).badges.coach;

    check("Dasselbe Bild behält sein Emoji", kept?.kind === "image" && kept.emoji === "<:rlb_x:123456789012345678>");
    check("Was der Bot zeigt: das Emoji, beim Bild sein Emoji", BadgeOf({ kind: "emoji", value: "⭐" }) === "⭐" && BadgeOf({ kind: "image", value: "x", emoji: "<:rlb_x:1>" }) === "<:rlb_x:1>" && BadgeOf(undefined) === null);

    const mine = Formats(client, { rankStyle: "text", roleStyle: "both", badges: { captain: { kind: "emoji", value: "⭐" }, player: { kind: "image", value: "x", emoji: null } } });

    check("Ein eigenes Abzeichen geht dem Standard vor", mine.role("captain") === "⭐ Captain" && mine.roleIcon("captain") === "⭐");
    check("Ein Bild ohne Emoji fällt auf den Standard zurück", mine.roleIcon("player") === "Stamm");

    // Aus einem Bild ein Emoji: ohne angemeldeten Bot geht das nicht - dann bleibt alles beim alten.
    const sync = (service as unknown as { SyncBadges: (guild: Guild, previous: object, next: object) => Promise<object> }).SyncBadges.bind(service);
    const refused = async (next: object): Promise<string> =>
        sync(guild, {}, next).then(
            () => "",
            (error: unknown) => (error instanceof TeamError ? error.message : String(error))
        );

    check("Ein fehlendes Bild sagt das", (await refused({ coach: { kind: "image", value: "default/rocketleague/teamicons/Fehlt.png", emoji: null } })).includes("gibt es in der Galerie nicht"));
    check("Ohne Emoji daraus wird nicht gespeichert", (await refused({ coach: { kind: "image", value: "default/rocketleague/teamicons/Coach.png", emoji: null } })).includes("kein Emoji"));
    check("Emojis brauchen nichts hochzuladen", JSON.stringify(await sync(guild, {}, { captain: { kind: "emoji", value: "⭐" } })) === JSON.stringify({ captain: { kind: "emoji", value: "⭐" } }));

    const wide = createCanvas(200, 100);

    wide.getContext("2d").fillStyle = "#ff0000";
    wide.getContext("2d").fillRect(0, 0, 200, 100);

    const fitted = createCanvas(128, 128);
    const fit = fitted.getContext("2d");

    fit.drawImage(await loadImage(await IconImage(wide.toBuffer("image/png"))), 0, 0);

    check("Ein breites Bild wird nicht verzerrt: oben und unten bleibt Platz", fit.getImageData(64, 4, 1, 1).data[3] === 0 && fit.getImageData(64, 64, 1, 1).data[0] === 255);

    console.log("\n  — Aufgaben-Abzeichen —");

    // Je Aufgabe die SVG als Quelle und das PNG daraus - das zeigt die Galerie, daraus macht der Bot sein Emoji.
    const absent = ROLE_ORDER.filter((role) => !existsSync(path.join(ROLE_ICON_ROOT, `${role}.svg`)) || !existsSync(path.join(ROLE_ICON_ROOT, `${ROLE_ICON_FILES[role]}.png`)));
    const names = ROLE_ORDER.map(RoleIconName);
    // Weiß auf der Farbe: der Kontrast nach WCAG, für Grafiken reichen 3:1.
    const contrast = (hex: string): number => {
        const [r, g, b] = [1, 3, 5].map((at) => {
            const channel = parseInt(hex.slice(at, at + 2), 16) / 255;

            return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        });

        return 1.05 / (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05);
    };
    const pale = ROLE_ORDER.filter((role) => contrast(ROLE_ICON_COLORS[role]) < 3);

    check(`Alle ${ROLE_ORDER.length} Abzeichen liegen bereit, als SVG und PNG, samt Lizenz`, absent.length === 0 && existsSync(path.join(ROLE_ICON_ROOT, "LICENSE.txt")), absent.join(", "));
    check("Die Galerie zeigt jedes Abzeichen", ROLE_ORDER.every((role) => IsImageFile(`${ROLE_ICON_FILES[role]}.png`)) && new Set(Object.values(ROLE_ICON_FILES)).size === ROLE_ORDER.length);
    check("Jeder Name ist einmalig und Discord-tauglich", new Set(names).size === names.length && names.every((name) => /^\w{2,32}$/.test(name)));
    check("Kein Name stößt mit einem Rang-Icon zusammen", names.every((name) => RANK_ICON_FILES.every((_, tier) => RankIconName(tier) !== name)));
    check("Jede Aufgabe hat ihre eigene Farbe", new Set(ROLE_ORDER.map((role) => ROLE_ICON_COLORS[role])).size === ROLE_ORDER.length);
    check("Weiß hat auf jeder Farbe mindestens 3:1", pale.length === 0, pale.map((role) => `${role} ${contrast(ROLE_ICON_COLORS[role]).toFixed(2)}`).join(", "));

    if (!absent.length) {
        const image = await RoleIconImage("captain");
        const canvas = createCanvas(128, 128);
        const context = canvas.getContext("2d");

        context.drawImage(await loadImage(image), 0, 0);

        const pixels = context.getImageData(0, 0, 128, 128).data;
        let white = 0;
        let black = 0;

        for (let index = 0; index < pixels.length; index += 4) {
            if (pixels[index + 3] < 200) continue;

            if (pixels[index] > 240 && pixels[index + 1] > 240 && pixels[index + 2] > 240) white++;
            if (pixels[index] < 40 && pixels[index + 1] < 40 && pixels[index + 2] < 40) black++;
        }

        check("Das Abzeichen wird ein PNG, klein genug für Discord", image.length < 256 * 1024 && image.subarray(1, 4).toString() === "PNG", `${image.length} Bytes`);

        // Das PNG in der Galerie ist aus der SVG gemalt - wer die SVG tauscht, malt neu (npm run icons:teams).
        const stale: string[] = [];

        for (const role of ROLE_ORDER) {
            const pixels = async (source: Buffer): Promise<Uint8ClampedArray> => {
                const canvas = createCanvas(128, 128);
                const context = canvas.getContext("2d");

                context.drawImage(await loadImage(source), 0, 0, 128, 128);

                return context.getImageData(0, 0, 128, 128).data;
            };
            const stored = await pixels(await RoleIconImage(role));
            const fresh = await pixels(await RoleBadge(role));
            let off = 0;

            for (let index = 0; index < stored.length; index++) if (Math.abs(stored[index] - fresh[index]) > 8) off++;

            if (off > stored.length / 100) stale.push(`${ROLE_ICON_FILES[role]}.png`);
        }

        check("Jedes PNG passt zu seiner SVG", stale.length === 0, `neu malen: npm run icons:teams (${stale.join(", ")})`);
        check("Rund: die Ecken bleiben durchsichtig", pixels[3] === 0);
        // Lucide malt in currentColor - ohne Ersatz käme das Icon schwarz heraus.
        check("Das Icon darauf ist weiß, nicht schwarz", white > 300 && black === 0, `${white} weiß, ${black} schwarz`);
    }

    // Die Vorschau setzt die Aufgaben selbst, nach der ungespeicherten Einstellung -
    // sie muss genau so schreiben wie der Bot beim Senden.
    const { pathToFileURL } = await import("node:url");
    const file = path.join(process.cwd(), "src", "dashboard", "client", "constants", "Placeholders.ts");
    const loaded = (await import(pathToFileURL(file).href)) as {
        styleRoles?: (text: string, style: "text" | "icon" | "both", icons: Record<string, string>) => string;
        styleRole?: (label: string, style: "text" | "icon" | "both", icons: Record<string, string>) => string;
    };

    if (!loaded.styleRoles || !loaded.styleRole) return check("Die Vorschau hat styleRoles und styleRole", false);

    const styleRoles = loaded.styleRoles;
    const styleRole = loaded.styleRole;
    const everyone = service.Look(FakeTeam(ROLE_ORDER.map((role, index) => ({ ...Player(`p${index + 1}`, role, 1300, 1250), discordId: `10000000000000000${index}` }))), groups, settings);
    const byLabel = Object.fromEntries(ROLE_ORDER.flatMap((role) => (badge(role) ? [[ROLE_LABELS[role], badge(role)!]] : [])));
    const mismatch: string[] = [];

    for (const mode of ["text", "icon", "both"] as const) {
        const bot = { ...PLAIN_FORMATS, role: RoleFormatter(mode, badge) };
        const pairs: [string, string, string][] = [
            ["Aufstellung", LineupText(everyone, true, bot), styleRoles(LineupText(everyone), mode, byLabel)],
            ["Kader", RosterText(everyone, bot), styleRoles(RosterText(everyone), mode, byLabel)],
            ["Staff", StaffText(everyone, bot), styleRoles(StaffText(everyone), mode, byLabel)],
            ...ROLE_ORDER.map((role): [string, string, string] => [role, bot.role(role), styleRole(ROLE_LABELS[role], mode, byLabel)]),
        ];

        for (const [what, sent, shown] of pairs) {
            if (sent !== shown) mismatch.push(`${mode} ${what}: ${sent} / ${shown}`);
        }
    }

    check("Die Vorschau schreibt Aufgaben wie der Bot - in allen drei Arten", mismatch.length === 0, mismatch.slice(0, 2).join(" | "));
    check("Ein fetter Name, der keine Aufgabe ist, bleibt", styleRoles("**Vyrox** · **constructor**", "icon", byLabel) === "**Vyrox** · **constructor**");
}

/* ----------------------------------------------------------
   Die Reihenfolge der Übersicht (Plan 21)
   ---------------------------------------------------------- */
function checkOrder(client: BotClient): void {
    console.log("\n  — Reihenfolge —");

    const team = (id: number, name: string, position: number, createdAt: number, mmr: number | null, players: number, league: string | null, group: number) => ({
        id,
        name,
        position,
        createdAt,
        mmr,
        players,
        league,
        group,
    });
    // Comet und Blitz haben dieselbe position: dann zählt die id.
    const teams = [
        team(1, "Nexus Main", 0, 100, 1612, 5, "RLCS", 1),
        team(2, "Atlas", 1, 600, 1544, 4, "RLCS", 1),
        team(3, "Comet", 2, 700, null, 3, null, 2),
        team(4, "Blitz", 2, 400, 1129, 4, "Uniliga", 2),
        team(5, "Nexus Academy", 4, 200, 1203, 6, "ESL", 2),
    ];
    const ids = (order: Partial<ITeamOrder>, list = teams): string =>
        OrderTeams(list, (entry) => entry, { ...DefaultTeamOrder(), ...order })
            .map((entry) => entry.id)
            .join(",");

    check("Ab Werk: die heutige Reihenfolge nach position, dann id", ids({}) === "1,2,3,4,5", ids({}));
    check("Team-MMR: höchste zuerst, ohne MMR am Ende", ids({ by: "mmr", direction: "desc" }) === "1,2,5,4,3", ids({ by: "mmr", direction: "desc" }));
    check("Team-MMR: niedrigste zuerst, ohne MMR trotzdem am Ende", ids({ by: "mmr", direction: "asc" }) === "4,5,2,1,3", ids({ by: "mmr", direction: "asc" }));
    check("Alphabetisch A bis Z und Z bis A", ids({ by: "name", direction: "asc" }) === "2,4,3,5,1" && ids({ by: "name", direction: "desc" }) === "1,5,3,4,2");
    check("Neueste zuerst und älteste zuerst", ids({ by: "created", direction: "desc" }) === "3,2,4,5,1" && ids({ by: "created", direction: "asc" }) === "1,5,4,2,3");
    check(
        "Anzahl Spieler: bei Gleichstand die heutige Reihenfolge",
        ids({ by: "players", direction: "desc" }) === "5,1,2,4,3" && ids({ by: "players", direction: "asc" }) === "3,2,4,1,5",
        `${ids({ by: "players", direction: "desc" })} / ${ids({ by: "players", direction: "asc" })}`
    );
    check(
        "Liga: erste Liga, ohne Liga am Ende",
        ids({ by: "league", direction: "asc" }) === "5,1,2,4,3" && ids({ by: "league", direction: "desc" }) === "4,1,2,5,3",
        `${ids({ by: "league", direction: "asc" })} / ${ids({ by: "league", direction: "desc" })}`
    );
    check("Immer oben: Plätze in der eingestellten Folge, auch gegen die Sortierung", ids({ by: "mmr", direction: "desc", pinned: [3, 1] }) === "3,1,2,5,4");
    check("Eigene Reihenfolge: Neue Teams ans Ende in heutiger Reihenfolge", ids({ by: "custom", custom: [5, 2] }) === "5,2,1,3,4");
    check("Gelöschte IDs in pinned und custom fallen weg", ids({ by: "custom", pinned: [99], custom: [98, 2] }) === "2,1,3,4,5");

    // Die Liste mit Gruppen filtert nur: angeheftet steht dann oben in der eigenen Gruppe.
    const list = OrderTeams(teams, (entry) => entry, { ...DefaultTeamOrder(), pinned: [5] }).map((entry) => ({
        group: entry.group,
        values: { "team.name": entry.name },
        members: [],
    }));
    const text = TeamListText(list, [{ id: 1, name: "Main" }, { id: 2, name: "Academy" }], { ...DefaultTeamList(), team: "{team.name}" });

    check("Gruppen in der Liste: angeheftet steht oben in der eigenen Gruppe", text === "### Main\nNexus Main\nAtlas\n### Academy\nNexus Academy\nComet\nBlitz", text);

    const guild = FakeGuild();
    const service = client.teamService;
    const before = { ...DefaultTeamSettings(), order: undefined } as unknown as ITeamSettings;

    check(
        "Einstellungen ohne order (vor dem Update) bekommen den Standard",
        JSON.stringify(service.CleanSettings(guild, {}, before).order) === JSON.stringify(DefaultTeamOrder())
    );

    const previous: ITeamSettings = { ...DefaultTeamSettings(), order: { by: "mmr", direction: "desc", pinned: [], custom: [] } };
    const cleaned = service.CleanSettings(guild, { order: { by: "quatsch", direction: "seitwärts", pinned: [1, 1, -2, "x", 2.5, 4], custom: [4, 6] } }, previous).order;

    check("order wird geprüft: Unbekanntes behält den vorigen Wert", cleaned.by === "mmr" && cleaned.direction === "desc");
    check(
        "order wird geprüft: nur ganze positive IDs, keine Doppelten, pinned gewinnt",
        JSON.stringify(cleaned.pinned) === "[1,4]" && JSON.stringify(cleaned.custom) === "[6]",
        JSON.stringify(cleaned)
    );

    // --- Was in Discord ankommt (Task 2) ---
    check(
        "CardsInOrder: aufsteigend ja, vertauscht nein, Lücke in der Mitte nein, neue am Ende ja",
        CardsInOrder(["10", "20", null]) && !CardsInOrder(["20", "10"]) && !CardsInOrder(["10", null, "20"]) && CardsInOrder(["9", "10"]) && CardsInOrder([])
    );

    const groups: ITeamGroup[] = [{ id: 1, guildId: GUILD, name: "Main", position: 0 }];
    const base = DefaultTeamSettings();
    const facts = ViewFacts(
        service.Look(FakeTeam([Player("a", "captain", 1500, 1450), Player("b", "coach", null, null)], { links: [{ label: "RLCS", url: "https://example.test" }] }), groups, base)
    );

    check("ViewFacts: Spieler ohne Coach, Liga aus dem ersten Link", facts.players === 1 && facts.league === "RLCS", JSON.stringify(facts));

    const many = Array.from({ length: 30 }, (_, index) =>
        service.Look(FakeTeam([Player(`m${index}`, "captain", 1500, 1400)], { id: index + 1, name: `Team ${String(index + 1).padStart(2, "0")}`, position: index }), groups, base)
    );
    const options = (TeamMenuRow(OrderTeams(many, ViewFacts, { ...DefaultTeamOrder(), pinned: [30] })).toJSON().components[0] as { options: { value: string }[] }).options;

    check("Menü: ein angeheftetes Team steht ganz oben, auch als 30. Team", options[0]?.value === "30" && options.length <= MAX_MENU_TEAMS, options[0]?.value);

    const named = ListTeams(OrderTeams(many.slice(0, 3), ViewFacts, { ...DefaultTeamOrder(), by: "name", direction: "desc" }), base).map((entry) => entry.values["team.name"]);

    check("Liste: {teams} in der eingestellten Folge", JSON.stringify(named) === JSON.stringify(["Team 03", "Team 02", "Team 01"]), JSON.stringify(named));
}

/* ----------------------------------------------------------
   Rechte der Team-Kanäle (Plan 21)
   ---------------------------------------------------------- */
async function checkRights(client: BotClient): Promise<void> {
    console.log("\n  — Rechte der Team-Kanäle —");

    const BOT = "90071992547409957";
    const has = (list: unknown, flag: bigint): boolean => Array.isArray(list) && list.includes(flag);
    const entry = (entries: ReturnType<typeof TeamOverwrites>, id: string) => entries.find((item) => item.id === id);

    const text = TeamOverwrites("text", GUILD, ROLE, BOT);

    check(
        "Text: nur Team und Bot sehen ihn",
        has(entry(text, GUILD)?.deny, PermissionFlagsBits.ViewChannel) && has(entry(text, ROLE)?.allow, PermissionFlagsBits.ViewChannel) && has(entry(text, BOT)?.allow, PermissionFlagsBits.ViewChannel)
    );

    const voice = TeamOverwrites("voice", GUILD, ROLE, BOT);
    const everyone = entry(voice, GUILD);

    check(
        "Voice: alle sehen ihn, rein nur Team und Bot",
        has(everyone?.allow, PermissionFlagsBits.ViewChannel) &&
            has(everyone?.deny, PermissionFlagsBits.Connect) &&
            [ROLE, BOT].every((id) => has(entry(voice, id)?.allow, PermissionFlagsBits.ViewChannel) && has(entry(voice, id)?.allow, PermissionFlagsBits.Connect))
    );

    // Drei Kanäle, die mitschreiben, wer bearbeitet wird. T2 ist nur von Hand verknüpft.
    const T1 = "90071992547409961";
    const T2 = "90071992547409962";
    const V1 = "90071992547409963";
    const GONE = "90071992547409964";
    const BROKEN = "90071992547409965";
    const edits: [string, string, Record<string, boolean>, { type?: number } | undefined][] = [];
    const channel = (id: string, type: ChannelType, name: string) =>
        ({
            id,
            type,
            name,
            permissionOverwrites: {
                edit: async (target: string, options: Record<string, boolean>, extra?: { type?: number }) => {
                    // Ein Kanal, in dem Discord ablehnt (etwa 50013 Missing Permissions).
                    if (id === BROKEN) throw Object.assign(new Error("Missing Permissions"), { code: 50013 });

                    edits.push([id, target, options, extra]);
                },
            },
        }) as unknown as GuildBasedChannel;
    let allowed = true;
    const guild = {
        ...FakeGuild(),
        channels: {
            cache: new Map([
                [T1, channel(T1, ChannelType.GuildText, "vyrox-main")],
                [T2, channel(T2, ChannelType.GuildText, "allgemein")],
                [V1, channel(V1, ChannelType.GuildVoice, "Vyrox Main")],
                [BROKEN, channel(BROKEN, ChannelType.GuildText, "gesperrt")],
            ]),
        },
        members: { me: { id: BOT, permissions: { has: () => allowed } } },
    } as unknown as Guild;
    const service = client.teamService;
    const original = service.Team.bind(service);
    let team = FakeTeam([], { channels: { kind: "channels", categoryId: null, textIds: [T1, T2], voiceIds: [V1] }, created: { roleId: ROLE, categoryId: null, textIds: [T1], voiceIds: [V1, GONE] } });

    service.Team = async () => team;

    try {
        const result = await service.AlignRights(guild, team.id);
        const touched = [...new Set(edits.map(([id]) => id))].sort();

        check(
            "Rechte angleichen fasst nur selbst angelegte Kanäle an",
            JSON.stringify(touched) === JSON.stringify([T1, V1].sort()) && [T1, V1].every((id) => edits.filter(([channelId]) => channelId === id).length === 3),
            JSON.stringify(edits)
        );
        check("Rechte angleichen nennt die Kanäle", JSON.stringify(result.aligned) === JSON.stringify(["#vyrox-main", "🔊 Vyrox Main"]), JSON.stringify(result.aligned));
        check("Rechte angleichen überspringt gelöschte Kanäle", result.skipped === 1);
        check(
            "Rechte angleichen: erst Bot, dann Rolle, @everyone zuletzt - der Bot sperrt sich nie selbst aus",
            [T1, V1].every((id) => {
                const mine = edits.filter(([channelId]) => channelId === id).map(([, target]) => target);

                return mine[0] === BOT && mine[1] === ROLE && mine[2] === GUILD;
            }),
            JSON.stringify(edits.map(([id, target]) => [id, target]))
        );
        check("Rechte angleichen sagt Discord, ob Rolle oder Mitglied gemeint ist", edits.every(([, , , extra]) => typeof extra?.type === "number"));
        check(
            "Voice angeglichen: @everyone sieht, darf aber nicht rein",
            JSON.stringify(edits.find(([id, target]) => id === V1 && target === GUILD)?.[2]) === JSON.stringify({ ViewChannel: true, Connect: false }),
            JSON.stringify(edits.find(([id, target]) => id === V1 && target === GUILD))
        );

        const said = async (): Promise<string> => {
            try {
                await service.AlignRights(guild, team.id);
                return "";
            } catch (error) {
                return error instanceof TeamError ? error.message : String(error);
            }
        };

        // Ein Kanal, in dem Discord ablehnt: der Rest wird angeglichen, der eine steht als gescheitert da.
        team = { ...team, created: { ...team.created, textIds: [T1, BROKEN], voiceIds: [V1] } };
        edits.length = 0;
        const partial = await service.AlignRights(guild, team.id);

        check(
            "Rechte angleichen: Lehnt Discord einen Kanal ab, laufen die anderen weiter",
            JSON.stringify(partial.aligned) === JSON.stringify(["#vyrox-main", "🔊 Vyrox Main"]) && JSON.stringify(partial.failed) === JSON.stringify(["#gesperrt"]),
            JSON.stringify(partial)
        );

        allowed = false;
        edits.length = 0;
        const without = await said();
        allowed = true;

        check("Ohne „Rollen verwalten“ ein Satz und nichts angefasst", without === "Dem Bot fehlt „Rollen verwalten“." && edits.length === 0, without);

        // Die Rolle gibt es in Discord nicht mehr: nichts anfassen, sonst stünde @everyone schon gesperrt da.
        team = { ...team, roleId: "90071992547409999" };
        edits.length = 0;
        const gone = await said();

        check("Gelöschte Team-Rolle: ein Satz und kein Kanal angefasst", gone === "Das Team braucht zuerst eine Rolle." && edits.length === 0, gone);

        team = { ...team, roleId: null };
        const none = await said();

        check("Ohne Rolle ein Satz", none === "Das Team braucht zuerst eine Rolle.", none);
    } finally {
        service.Team = original;
    }
}

/* ----------------------------------------------------------
   Karten in der Reihenfolge (Plan 21, Abschluss-Review)
   ---------------------------------------------------------- */
async function checkCardOrder(client: BotClient): Promise<void> {
    console.log("\n  — Karten in der Reihenfolge —");

    const service = client.teamService;
    const groups: ITeamGroup[] = [{ id: 1, guildId: GUILD, name: "Main", position: 0 }];
    const settings: ITeamSettings = { ...DefaultTeamSettings(), channelId: TEXT, layout: "cards" };
    // Drei Karten im Kanal, die mittlere hat jemand in Discord von Hand gelöscht.
    const teams = [
        FakeTeam([Player("a1", "captain", 1500, 1450)], { id: 1, name: "Alpha", position: 0, messageId: "100" }),
        FakeTeam([Player("b1", "captain", 1500, 1450)], { id: 2, name: "Bravo", position: 1, messageId: "200" }),
        FakeTeam([Player("c1", "captain", 1500, 1450)], { id: 3, name: "Charlie", position: 2, messageId: "300" }),
    ];
    const alive = new Set(["100", "300"]);
    const deleted: string[] = [];
    const edited: string[] = [];
    const sent: string[] = [];
    let next = 400;
    const channel = {
        id: TEXT,
        type: ChannelType.GuildText,
        isTextBased: () => true,
        messages: {
            fetch: async (id: string) => (alive.has(id) ? { id, edit: async () => void edited.push(id) } : Promise.reject(new Error("Unknown Message"))),
            delete: async (id: string) => {
                deleted.push(id);
                alive.delete(id);
            },
        },
        send: async () => {
            const id = String(next++);

            sent.push(id);
            alive.add(id);

            return { id };
        },
    };
    const guild = { ...FakeGuild(), channels: { cache: new Map([[TEXT, channel]]) } } as unknown as Guild;
    const original = { settings: service.Settings, views: service.Views, setMessage: client.teams.SetMessage };

    service.Settings = async () => settings;
    service.Views = async () => ({ views: teams.map((team) => service.Look(team, groups, settings)), groups, settings });
    client.teams.SetMessage = async (id: number, messageId: string | null) => {
        const team = teams.find((entry) => entry.id === id);

        if (team) team.messageId = messageId;
    };

    try {
        await service.Publish(guild);

        check(
            "Karte von Hand gelöscht: alle gehen neu raus, in der richtigen Folge",
            edited.length === 0 && sent.length === 3 && JSON.stringify(deleted.sort()) === JSON.stringify(["100", "300"]) && teams.map((team) => team.messageId).join(",") === "400,401,402",
            `edited ${edited} · sent ${sent} · deleted ${deleted} · ids ${teams.map((team) => team.messageId)}`
        );

        edited.length = 0;
        sent.length = 0;
        deleted.length = 0;
        await service.Publish(guild);

        check("Stimmt die Folge, werden die Karten nur bearbeitet", edited.length === 3 && sent.length === 0 && deleted.length === 0, `edited ${edited} · sent ${sent}`);
    } finally {
        service.Settings = original.settings;
        service.Views = original.views;
        client.teams.SetMessage = original.setMessage;
    }
}

/* ----------------------------------------------------------
   Viele Teams: die Übersicht geht in weiteren Nachrichten weiter
   ---------------------------------------------------------- */

/** Aller Text einer Nachricht, wie Discord ihn zählt: Textbausteine bei V2, die Beschreibung beim Embed, sonst der Inhalt. */
function TextOf(view: ICustomView): string {
    const texts: string[] = [];
    const walk = (node: unknown): void => {
        if (Array.isArray(node)) return node.forEach(walk);
        if (!node || typeof node !== "object") return;

        const record = node as Record<string, unknown>;

        if (record.type === ComponentType.TextDisplay && typeof record.content === "string") texts.push(record.content);

        Object.values(record).forEach(walk);
    };

    walk(view.components.map((entry) => entry.toJSON()));

    for (const embed of view.embeds ?? []) texts.push((embed as { data?: { description?: string } }).data?.description ?? "");
    if (typeof view.content === "string") texts.push(view.content);

    return texts.join("\n");
}

/** 16 Teams mit je vier Spielern, alle mit Erwähnung und Tracker: zu viel für eine Nachricht. */
function ManyTeams(count = 16): ITeam[] {
    return Array.from({ length: count }, (_, index) =>
        FakeTeam(
            Array.from({ length: 4 }, (_, slot) => ({
                ...Player(`t${index}s${slot}`, slot === 0 ? "captain" : "player", 1500, 1450),
                discordId: `1000000000000${String(index * 10 + slot).padStart(5, "0")}`,
            })),
            { id: index + 1, name: `Team ${index + 1}`, groupId: index < 8 ? 1 : 2, position: index }
        )
    );
}

async function checkLongBoard(client: BotClient): Promise<void> {
    console.log("\n  — Viele Teams: Fortsetzung in weiteren Nachrichten —");

    check("Stücke: passt alles, bleibt es eine Nachricht", JSON.stringify(PackParts(["a", "b"], 10, 10)) === JSON.stringify(["a\nb"]));
    check("Stücke: getrennt wird nur zwischen Teams", JSON.stringify(PackParts(["aaaa", "bbbb", "cccc", "dddd"], 9, 9)) === JSON.stringify(["aaaa\nbbbb", "cccc\ndddd"]));
    check("Stücke: in der letzten Nachricht bleibt Platz für das, was nach {teams} kommt", JSON.stringify(PackParts(["aaaa", "bbbb"], 9, 9, 3)) === JSON.stringify(["aaaa", "bbbb"]));
    check("Stücke: ein Team länger als eine Nachricht geht an Zeilen auseinander", JSON.stringify(PackParts(["l1\nl2\nl3"], 5, 5)) === JSON.stringify(["l1\nl2", "l3"]));
    check("Stücke: füllt der Kopf die erste Nachricht, beginnt die Liste in der zweiten", JSON.stringify(PackParts(["aaaa"], 2, 9)) === JSON.stringify(["", "aaaa"]));

    let huge: string[] | string;

    try {
        huge = PackParts(["aaaa", "bbbb"], 9, 9, 20);
    } catch (error) {
        huge = String(error);
    }

    // Steht unter {teams} mehr, als in eine Nachricht passt, kürzt Discord das Ende wie bisher - die Liste bleibt ganz.
    check("Stücke: riesiges Ende unter der Liste wirft nicht und verliert kein Team", Array.isArray(huge) && huge.join("\n").includes("aaaa") && huge.join("\n").includes("bbbb"), JSON.stringify(huge));

    const guild = FakeGuild();
    const service = client.teamService;
    const groups: ITeamGroup[] = [
        { id: 1, guildId: GUILD, name: "Main", position: 0 },
        { id: 2, guildId: GUILD, name: "Academy", position: 1 },
    ];
    const base = DefaultTeamSettings();
    // Wie bei Bild 3 vom 24.10.: Kopf, Liste, darunter klein der Stand.
    const doc = {
        accent: "#00afff",
        blocks: [
            { type: "text" as const, body: "# Unsere Teams\nSo sind wir aufgestellt." },
            { type: "separator" as const, line: true },
            { type: "text" as const, body: "{teams}" },
            { type: "separator" as const, line: true },
            { type: "text" as const, body: "-# Stand {updated}" },
        ],
    };
    const settings: ITeamSettings = { ...base, layout: "single", board: { ...base.board, kind: "v2", doc } };
    const views = ManyTeams().map((team) => service.Look(team, groups, settings));
    const mentions = views.flatMap((view) => view.players.map((entry) => `<@${entry.player.discordId}>`));

    check("Testdaten: die Liste ist länger als eine Nachricht", BoardText(views, groups, false, settings).length > 4000);

    const payloads = await BoardViews(client, settings, views, groups, guild);
    const texts = payloads.map(TextOf);

    check(
        "Zu viele Teams: mehrere Nachrichten, jede höchstens 4000 Zeichen, nichts abgeschnitten",
        payloads.length > 1 && texts.every((text) => text.length <= 4000 && !text.includes("…")),
        texts.map((text) => text.length).join(", ")
    );
    check(
        "Jeder Spieler steht genau einmal da",
        mentions.every((mention) => texts.join("\n").split(mention).length === 2),
        mentions.filter((mention) => texts.join("\n").split(mention).length !== 2).join(", ")
    );
    check(
        "Kopf nur in der ersten Nachricht, der Stand nur in der letzten",
        texts[0].includes("# Unsere Teams") && !texts.slice(1).some((text) => text.includes("Unsere Teams")) && texts[texts.length - 1].includes("-# Stand") && !texts.slice(0, -1).some((text) => text.includes("-# Stand")),
        texts.map((text) => text.slice(0, 40)).join(" | ")
    );
    check("Weitere Nachrichten beginnen mit einem Team oder einer Gruppe, nie mitten im Kader", texts.slice(1).every((text) => /^(### |\*\*Team )/.test(text)), texts.slice(1).map((text) => text.slice(0, 30)).join(" | "));
    check("Weitere Nachrichten haben dieselbe Farbe", payloads.every((payload) => JSON.stringify(payload.components.map((entry) => entry.toJSON())).includes(`"accent_color":${0x00afff}`)));
    check("Wenige Teams: eine Nachricht wie bisher", (await BoardViews(client, settings, views.slice(0, 2), groups, guild)).length === 1);

    const embedded: ITeamSettings = { ...settings, board: { ...settings.board, kind: "embed", embed: { title: "Teams", description: "So sind wir aufgestellt.\n\n{teams}", color: "#00afff" } as never } };
    const embeds = (await BoardViews(client, embedded, views, groups, guild)).map(TextOf);

    check(
        "Auch als Embed: mehrere Nachrichten, jede Beschreibung höchstens 4000 Zeichen, alle Spieler da",
        embeds.length > 1 && embeds.every((text) => text.length <= 4000) && mentions.every((mention) => embeds.join("\n").includes(mention)),
        embeds.map((text) => text.length).join(", ")
    );

    // Nach dem Senden sagt das Dashboard, wenn die Liste mehrere Nachrichten braucht, und was aufgeräumter wirkt.
    check(
        "Nach dem Senden: bei mehreren Nachrichten ein Tipp zu Karten oder Auswahlmenü",
        PublishText("single", 3).includes("3 Nachrichten") && PublishText("single", 3).includes("„Je Team eine eigene Nachricht“") && PublishText("single", 3).includes("Auswahlmenü"),
        PublishText("single", 3)
    );
    check("Nach dem Senden: eine Nachricht oder Karten ohne Tipp", PublishText("single", 1) === "1 Nachricht geschrieben." && PublishText("cards", 5) === "5 Nachrichten geschrieben.", `${PublishText("single", 1)} | ${PublishText("cards", 5)}`);

    // Im Kanal: aus einer Nachricht werden mehrere, dann gleich viele, dann weniger.
    const stored: ITeamSettings = { ...settings, channelId: TEXT, messageId: "100" };
    const alive = new Set(["100"]);
    const deleted: string[] = [];
    const edited: string[] = [];
    const sent: string[] = [];
    let next = 400;
    let shown = views;
    const channel = {
        id: TEXT,
        type: ChannelType.GuildText,
        isTextBased: () => true,
        messages: {
            fetch: async (id: string) => (alive.has(id) ? { id, edit: async () => void edited.push(id) } : Promise.reject(new Error("Unknown Message"))),
            delete: async (id: string) => {
                deleted.push(id);
                alive.delete(id);
            },
        },
        send: async () => {
            const id = String(next++);

            sent.push(id);
            alive.add(id);

            return { id };
        },
    };
    const inChannel = { ...FakeGuild(), channels: { cache: new Map([[TEXT, channel]]) } } as unknown as Guild;
    const original = { settings: service.Settings, views: service.Views, save: client.moduleSettings.Save };
    const reset = (): void => {
        edited.length = 0;
        sent.length = 0;
        deleted.length = 0;
    };

    service.Settings = async () => ({ ...stored });
    service.Views = async () => ({ views: shown, groups, settings: stored });
    client.moduleSettings.Save = (async (_guildId: string, _module: string, value: ITeamSettings) => void Object.assign(stored, value)) as never;

    try {
        await service.Publish(inChannel);

        const ids = [stored.messageId, ...(stored.moreIds ?? [])];

        check(
            "Im Kanal: werden es mehr Nachrichten, gehen alle neu raus, in der richtigen Folge",
            deleted.join() === "100" && edited.length === 0 && sent.length === payloads.length && ids.join() === sent.join(),
            `deleted ${deleted} · edited ${edited} · sent ${sent} · ids ${ids}`
        );

        reset();
        await service.Publish(inChannel);
        check("Im Kanal: gleich viele Nachrichten werden nur bearbeitet", sent.length === 0 && deleted.length === 0 && edited.join() === ids.join(), `edited ${edited} · sent ${sent}`);

        reset();
        shown = views.slice(0, 2);
        await service.Publish(inChannel);
        check(
            "Im Kanal: wird die Liste kürzer, verschwinden die überzähligen Nachrichten",
            edited.join() === ids[0] && deleted.join() === ids.slice(1).join() && sent.length === 0 && stored.messageId === ids[0] && (stored.moreIds ?? []).length === 0,
            `edited ${edited} · deleted ${deleted} · more ${stored.moreIds}`
        );

        shown = views;
        await service.Publish(inChannel);
        reset();

        const all = [stored.messageId, ...(stored.moreIds ?? [])];

        await service.Withdraw(inChannel, null, true);
        check("Einsammeln nimmt auch die weiteren Nachrichten mit", all.length > 1 && deleted.join() === all.join() && stored.messageId === null && (stored.moreIds ?? []).length === 0, `deleted ${deleted} · all ${all}`);
    } finally {
        service.Settings = original.settings;
        service.Views = original.views;
        client.moduleSettings.Save = original.save;
    }
}

async function main(): Promise<void> {
    console.log("\n🛡️  RL Team-Übersicht\n");

    const client = new BotClient();

    checkFormula();
    checkValues(client);
    checkSettings(client);
    checkOrder(client);
    checkView(client);
    await checkMenu(client);
    await checkLongBoard(client);
    checkClean(client);
    checkRoles(client);
    await checkRights(client);
    await checkCardOrder(client);
    await checkPlayers(client);
    await checkList(client);
    await checkRoleIcons(client);

    if (await client.databaseService.Connect()) {
        try {
            await checkDatabase(client);
        } finally {
            await client.databaseService.Close();
        }
    } else {
        console.log("\n  — Datenbank —\n  übersprungen: keine Verbindung (siehe Meldung oben)");
    }

    console.log(failures === 0 ? "\n✅ Alle Prüfungen bestanden.\n" : `\n❌ ${failures} Prüfung(en) fehlgeschlagen.\n`);

    process.exit(failures > 0 ? 1 : 0);
}

void main();
