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
import { ChannelType, Guild, GuildBasedChannel, MessageFlags, PermissionFlagsBits, Role } from "discord.js";
import BotClient from "../client/BotClient";
import { HubDoc, ChannelsText, LeaguesText, LineupText, PLAYER_FIELDS, PlayerKey, PlayerValues, RoleValues, RosterText, StaffText, HubMessages, IHubMessage, TeamCardView, TeamOwnValues, TeamValues, Formats } from "../builder/TeamView";
import { BestPeak, CardRank, ITeamCardData, ITeamCardImages, Lines, RenderTeamCard, TeamCardWidth, TeamPlaces } from "../builder/TeamCard";
import { RegisterFonts } from "../builder/RankCard";
import { CardsInOrder, DefaultTeamOrder, ITeamOrder, OrderTeams } from "../constants/TeamOrder";
import { Fill } from "../constants/Placeholders";
import { DIVISIONS, RankFromMMR, RankShort, RankText, TIERS } from "../constants/Prime";
import {
    COUNTING_ROLES,
    DEFAULT_HUB_LINE,
    DefaultBoardBody,
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
import { ITeam, ITeamGroup, ITeamPlayer, ITeamSettings, ITeamView, TeamRole } from "../interfaces/services/teams/ITeams";
import { HubParts } from "../routes/DashboardApiTeams";
import { ApplyCategoryDraft, ParseCategoryDraft, EmojiId, NeedsResend, NormalizeTeamSettings, RolePlan, RoleTargets, SameMessage, TeamError, TeamOverwrites, TextName, ViewFacts } from "../services/TeamService";
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
        region: "",
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
    const clean = service.CleanSettings(guild, { channelId: TEXT, layout: "cards", mmr: { mode: "formula", formula: "{peak3s} * 2" } }, DefaultTeamSettings());

    check("Der Kanal kommt an", clean.channelId === TEXT);
    check("Das Layout auch", clean.layout === "cards");
    check("„Hauptnachricht mit Menü“ gibt es nicht mehr", service.CleanSettings(guild, { layout: "menu" }, { ...DefaultTeamSettings(), layout: "cards" }).layout === "cards");
    check("Die eigene Rechnung wird übernommen", clean.mmr.formula === "{peak3s} * 2");
    check("Ein Sprachkanal fällt weg", service.CleanSettings(guild, { channelId: VOICE }, DefaultTeamSettings()).channelId === null);
    check("Ein erfundenes Layout bleibt beim alten", service.CleanSettings(guild, { layout: "quatsch" }, { ...DefaultTeamSettings(), layout: "cards" }).layout === "cards");

    // Eine kaputte Formel wird beim Speichern abgewiesen und nicht erst, wenn
    // die Uebersicht rausgeht.
    refuses("Eine kaputte Rechnung wird abgewiesen", () =>
        service.CleanSettings(guild, { mmr: { mode: "formula", formula: "{peak3s} * " } }, DefaultTeamSettings())
    );
    refuses("Unbekannte Platzhalter ebenso", () => service.CleanSettings(guild, { mmr: { mode: "formula", formula: "{tore} + 1" } }, DefaultTeamSettings()));

    const keepsBad = service.CleanSettings(guild, { mmr: { mode: "wtsi", formula: "{kaputt}" } }, DefaultTeamSettings());

    check("Bei WTSI stört eine unbenutzte Formel nicht", keepsBad.mmr.mode === "wtsi" && keepsBad.mmr.formula === "{kaputt}");
}

/** Plan 26: die gezeichnete Karte. */
async function checkDrawnCard(client: BotClient): Promise<void> {
    console.log("\n  — Gezeichnete Karte —");

    const service = client.teamService;
    const base = DefaultTeamSettings();
    const groups: ITeamGroup[] = [{ id: 1, guildId: GUILD, name: "Main", position: 0 }];
    const roster = (count: number): ITeamPlayer[] => [
        ...Array.from({ length: count }, (_, index) => Player(`s${index}`, index === 0 ? "captain" : index === count - 1 ? "trial" : "player", 1500 + index * 10, 1450 + index * 10, 1400, 1380)),
        { ...Player("c1", "coach", null, null), snapshot: undefined },
        { ...Player("m1", "manager", null, null), snapshot: undefined },
    ];
    const images: ITeamCardImages = { logo: null, background: null, badges: { captain: null, cocaptain: null, player: null, sub: null, trial: null, coach: null, manager: null } };
    const card = (players: ITeamPlayer[], over: Partial<ITeamCardData> = {}, settings = base): ITeamCardData => ({
        view: service.Look(FakeTeam(players, { region: "EU", links: [{ label: "RLCS Quali", url: "https://example.com" }] }), groups, settings),
        columns: settings.cardColumns,
        place: { place: 1, of: 3 },
        guildName: "RL Nexus",
        roleName: "Vyrox Main",
        accent: "#00afff",
        images,
        design: settings.card,
        lines: { title: "Vyrox Main", subtitle: "Der Hauptkader.", footer: "RL Nexus · @Vyrox Main" },
        ...over,
    });
    const size = async (buffer: Buffer): Promise<{ width: number; height: number }> => {
        const picture = await loadImage(buffer);

        return { width: picture.width, height: picture.height };
    };

    const five = await RenderTeamCard(card(roster(5)));

    check("Ein Team mit fünf Spielern und Staff wird ein WebP", five.subarray(0, 4).toString() === "RIFF" && five.subarray(8, 12).toString() === "WEBP");

    const four = await size(await RenderTeamCard(card(roster(4))));
    const twelve = await size(await RenderTeamCard(card(roster(MAX_PLAYERS - 2))));

    check("Mehr Spieler, höhere Karte", twelve.height > four.height, `${four.height} / ${twelve.height}`);

    const narrow = await size(await RenderTeamCard(card(roster(4), { columns: { "2v2": false, "1v1": false, peak: true } })));

    check("Ohne 2v2 und 1v1 wird die Karte schmaler", narrow.width < four.width, `${four.width} / ${narrow.width}`);
    check("Nie schmaler als 760", TeamCardWidth({ "2v2": false, "1v1": false, peak: false }) >= 760);

    const bare = roster(3).map((player) => ({ ...player, snapshot: undefined }));
    const blank = await RenderTeamCard(card(bare, { place: null }));

    check("Spieler ohne Stand von Prime brechen nichts ab", blank.length > 0);

    const facts = (mmr: number | null, id: number): ITeamView => ({ ...card(roster(2)).view, team: FakeTeam([], { id }), mmr });
    const places = TeamPlaces([facts(1700, 1), facts(1700, 2), facts(1600, 3), facts(null, 4)]);

    check("Gleiche MMR teilt sich den Platz", places.get(1)?.place === 1 && places.get(2)?.place === 1 && places.get(3)?.place === 3, JSON.stringify([...places]));
    check("Ohne MMR kein Platz, „von“ zählt nur Teams mit MMR", !places.has(4) && places.get(1)?.of === 3);

    // Der Schnitt ist der Wert nach der eingestellten Rechnung - gezeichnet wird, was Look() rechnet.
    const formula: ITeamSettings = { ...base, mmr: { mode: "formula", formula: "{peak3s}" } };
    const wtsi = card(roster(4));
    const own = card(roster(4), {}, formula);

    check("Schnitt folgt der Rechnung", wtsi.view.players[0]!.value !== own.view.players[0]!.value && own.view.players[0]!.value === 1500, `${wtsi.view.players[0]!.value} / ${own.view.players[0]!.value}`);
    check("Andere Rechnung, anderes Bild", !(await RenderTeamCard(wtsi)).equals(await RenderTeamCard(own)));

    // Plan 27: Ränge mit Zahlen, Rang zum Schnitt, Aussehen aus den Einstellungen.
    check("Rang aus 1.748: GC 3 · Div 1", JSON.stringify(CardRank(1748)) === JSON.stringify({ tier: 21, name: "GC 3", division: "Div 1" }), JSON.stringify(CardRank(1748)));
    check("Rang aus 1.705: GC 2 · Div 4", CardRank(1705)?.name === "GC 2" && CardRank(1705)?.division === "Div 4");
    check("SSL hat keine Division", CardRank(1900)?.name === "SSL" && CardRank(1900)?.division === null);
    check("Ohne Wert kein Rang", CardRank(null) === null);

    // Der Peak ist der höchste Wert über 1v1, 2v2 und 3v3 - eingetragen oder, wenn die aktuelle MMR schon höher steht, die.
    check("Peak: 2v2 aktuell über dem eingetragenen 3v3-Peak", BestPeak(Player("b1", "captain", 1199, 1109, null, 1307)) === 1307, String(BestPeak(Player("b1", "captain", 1199, 1109, null, 1307))));
    check("Peak: ein eingetragener 2v2-Peak gewinnt, wenn er am höchsten ist", BestPeak(Player("b2", "captain", 1199, 1109, 1400, 1307)) === 1400);
    check("Peak: 3v3 bleibt, wenn er am höchsten ist", BestPeak(Player("b3", "captain", 1600, 1500, 1400, 1300)) === 1600);
    check("Peak: ohne Werte keiner", BestPeak({ ...Player("b4", "coach", null, null), snapshot: undefined }) === null);

    const off = { ...base.card, parts: { logo: false, leagues: false, mmr: false, peak: false, staff: false }, chips: { tag: false, group: false, place: false, region: false } };
    const naked = await RenderTeamCard({ ...card(roster(3)), design: off, lines: { title: "", subtitle: "", footer: "" } });

    check("Ohne alle Bausteine zeichnet sie trotzdem", naked.subarray(0, 4).toString() === "RIFF" && naked.subarray(8, 12).toString() === "WEBP");

    // Einmal gebaut: neue Spieler hätten einen neuen Zeitstempel, und springt die Minute, wäre das Bild ein anderes.
    const sample = card(roster(3));
    const lost = await RenderTeamCard({ ...sample, design: { ...base.card, background: { mode: "own", image: "123456789012345678/weg/fehlt.png" } } });
    const none = await RenderTeamCard({ ...sample, design: { ...base.card, background: { mode: "none", image: null } } });
    const standard = await RenderTeamCard(sample);

    check("Eigener Hintergrund fehlt: zeichnet mit Standard", lost.equals(standard));
    check("Ohne Hintergrund ist ein anderes Bild als der Standard", !none.equals(standard));
    check("Bausteine aus ändern das Bild", !naked.equals(standard));

    const guild = FakeGuild();
    const settings: ITeamSettings = { ...base, card: { ...base.card, title: "{team.name} · {team.tag}", accent: "#ff0000" } };
    const view = service.Look(FakeTeam([Player("p1", "captain", 1500, 1450)], { description: "", color: "#00ff00" }), groups, settings);
    const data = await service.CardData(guild, view, [view], settings);

    check("Große Zeile mit Platzhaltern", data.lines.title === "Vyrox Main · VYX", data.lines.title);
    check("Ohne Beschreibung bleibt die Unterzeile leer", data.lines.subtitle === "", data.lines.subtitle);
    check("Fußzeile mit Rollennamen statt Erwähnung", data.lines.footer === "Dev Server · @Team", data.lines.footer);
    check("Eigene Farbe der Karte schlägt die Teamfarbe", data.accent === "#ff0000");
    check("Ohne eigene Farbe gilt die Teamfarbe", (await service.CardData(guild, view, [view], base)).accent === "#00ff00");

    const noRole = await service.CardData(guild, service.Look(FakeTeam([], { roleId: null }), groups, base), [], base);

    check("Ohne Rolle kein „@—“ im Fuß", noRole.lines.footer === "Dev Server", noRole.lines.footer);

    // Review: Was das Platzhalter-Menü anbietet, steht im Bild ohne Discord-Schreibweise.
    const linked = service.Look(
        FakeTeam([{ ...Player("p1", "captain", 1500, 1450), name: "Nico", discordId: "100000000000000001" }], {
            links: [{ label: "RLCS Quali", url: "https://rlcs.gg/" }, { label: "Nexus Liga", url: "https://start.gg/nexus" }],
        }),
        groups,
        base
    );
    const plain = await service.CardData(guild, linked, [linked], { ...base, card: { ...base.card, title: "Stand {updated}", subtitle: "{team.leagues}", footer: "Captain {team.captain}" } });

    check("{updated} als Datum, nicht als <t:…>", !plain.lines.title.includes("<t:") && /\d{2}\.\d{2}\./.test(plain.lines.title), plain.lines.title);
    check("{team.leagues} nur mit Namen", plain.lines.subtitle === "RLCS Quali · Nexus Liga", plain.lines.subtitle);
    check("{team.captain} mit Namen statt Erwähnung", plain.lines.footer === "Captain @Nico", plain.lines.footer);
}

/** Plan 30: ein Zeilenumbruch in der Beschreibung ist auf der Karte einer. */
async function checkDescriptionLines(client: BotClient): Promise<void> {
    console.log("\n  — Beschreibung mit Zeilenumbruch —");

    // Der Weg vom Team bis zur Unterzeile darf den Umbruch nicht verschlucken.
    const base = DefaultTeamSettings();
    const settings: ITeamSettings = { ...base, card: { ...base.card, subtitle: "{team.description}" } };
    const view = client.teamService.Look(FakeTeam([], { description: "Main Team von Noir-Esport.\nRepräsentiert" }), [], settings);
    const data = await client.teamService.CardData(FakeGuild(), view, [view], settings);

    check("Unterzeile behält den Umbruch", data.lines.subtitle === "Main Team von Noir-Esport.\nRepräsentiert", JSON.stringify(data.lines.subtitle));

    // W-0032: Groß- und Fußzeile sind je eine Zeile - dort wird ein Umbruch zum Leerzeichen.
    const oneLine: ITeamSettings = { ...settings, card: { ...settings.card, title: "{team.description}", footer: "{team.description}" } };
    const single = await client.teamService.CardData(FakeGuild(), view, [view], oneLine);

    check("Großzeile ohne Umbruch", single.lines.title === "Main Team von Noir-Esport. Repräsentiert", JSON.stringify(single.lines.title));
    check("Fußzeile ohne Umbruch", single.lines.footer === "Main Team von Noir-Esport. Repräsentiert", JSON.stringify(single.lines.footer));

    await RegisterFonts();

    const ctx = createCanvas(10, 10).getContext("2d");

    ctx.font = "600 19px Rajdhani";

    const two = Lines(ctx, "Main Team von Noir-Esport.\nRepräsentiert", 600);
    const four = Lines(ctx, "A\nB\nC\nD", 600);

    check("Zeilenumbruch bleibt", JSON.stringify(two) === JSON.stringify(["Main Team von Noir-Esport.", "Repräsentiert"]), JSON.stringify(two));
    check("Leere Zeilen fallen weg", Lines(ctx, "A\n\n\nB", 600).length === 2);
    check("Windows-Umbruch auch", Lines(ctx, "A\r\nB", 600).length === 2);
    check("Höchstens drei Zeilen", four.length === 3, JSON.stringify(four));
    check("Ohne Umbruch wie bisher", Lines(ctx, "Ein Satz", 600).join("|") === "Ein Satz");
}

/** Plan 26: woher die Bilder der Karte kommen - nie von einer Adresse aus dem Dashboard. */
async function checkCardImages(client: BotClient): Promise<void> {
    console.log("\n  — Bilder der Karte —");

    const guild = FakeGuild();
    const service = client.teamService;
    const asked: string[] = [];
    const png = await RoleIconImage("captain");
    const download = async (url: string): Promise<Buffer | null> => {
        asked.push(url);

        return url.includes("111111111111111111") ? png : null;
    };
    const settings: ITeamSettings = {
        ...DefaultTeamSettings(),
        badges: {
            captain: { kind: "image", value: "default/rocketleague/teamicons/Coach.png", emoji: "<:x:222222222222222222>" },
            cocaptain: { kind: "emoji", value: "<:fire:111111111111111111>" },
            player: { kind: "emoji", value: "🔥" },
            sub: { kind: "emoji", value: "<:gone:333333333333333333>" },
        },
    };
    const images = await service.CardImages(guild, FakeTeam([], { logo: "https://evil.example/x.png" }), settings, download);

    check("Ein Logo als Link wird nie geladen", images.logo === null && asked.every((url) => url.startsWith("https://cdn.discordapp.com/emojis/")), asked.join(", "));
    check("Bild aus der Galerie geht vor dem Emoji", images.badges.captain !== null && !asked.some((url) => url.includes("222222222222222222")));
    check("Ein Emoji kommt von Discords CDN", images.badges.cocaptain !== null && asked.includes("https://cdn.discordapp.com/emojis/111111111111111111.png"));
    check("Unicode-Emoji: Standard-Abzeichen", images.badges.player === null);
    check("Emoji nicht ladbar: Standard-Abzeichen", images.badges.sub === null);
    check("Ohne eigenes Abzeichen: Standard", images.badges.trial === null);
    check("Emoji-ID nur aus der Zahl", EmojiId("<:xx:123456789012345678>") === "123456789012345678" && EmojiId("<:xx:12/../a>") === null && EmojiId("🔥") === null);

    const gallery = await service.CardImages(guild, FakeTeam([], { logo: "default/rocketleague/teamicons/Coach.png" }), DefaultTeamSettings(), download);

    check("Ein Logo aus den Vorlagen wird geladen", gallery.logo !== null);

    const ownBackground = { ...DefaultTeamSettings(), card: { ...DefaultTeamSettings().card, background: { mode: "own" as const, image: "default/rocketleague/teamicons/Coach.png" } } };

    check("Eigener Hintergrund kommt aus der Galerie", (await service.CardImages(guild, FakeTeam([]), ownBackground, download)).background !== null);
    check("Standard-Hintergrund braucht kein Bild", (await service.CardImages(guild, FakeTeam([]), DefaultTeamSettings(), download)).background === null);

    // Plan 30: ein Team kann seinen eigenen Hintergrund haben.
    const teamBg = "default/rocketleague/teamicons/Coach.png";
    const noBackground = { ...DefaultTeamSettings(), card: { ...DefaultTeamSettings().card, background: { mode: "none" as const, image: null } } };

    check("Hintergrund des Teams geht vor", (await service.CardImages(guild, FakeTeam([], { background: teamBg }), DefaultTeamSettings(), download)).background !== null);
    check("Auch wenn allgemein keiner gewählt ist", (await service.CardImages(guild, FakeTeam([], { background: teamBg }), noBackground, download)).background !== null);
    check("Fehlt sein Bild: der allgemeine", (await service.CardImages(guild, FakeTeam([], { background: "fehlt/gibts-nicht.png" }), ownBackground, download)).background !== null);
    check("Ein Link als Hintergrund wird nie geladen", (await service.CardImages(guild, FakeTeam([], { background: "https://evil.example/x.png" }), DefaultTeamSettings(), download)).background === null);

    // Die Nachricht: gezeichnet ist sie eine V2-Karte mit genau einem Bild, sonst die aus dem Editor wie bisher.
    const groups: ITeamGroup[] = [{ id: 1, guildId: GUILD, name: "Main", position: 0 }];
    const view = service.Look(FakeTeam([Player("p1", "captain", 1500, 1450)], { id: 7 }), groups, DefaultTeamSettings());
    const drawn = await TeamCardView(client, { ...DefaultTeamSettings(), layout: "hub" }, view, guild, [view]);
    const json = JSON.stringify(drawn.components.map((entry) => entry.toJSON()));

    check("Im Hub gezeichnet: eine V2-Karte", drawn.flags === MessageFlags.IsComponentsV2);
    check("… mit genau dem Bild team-7.webp", drawn.files?.length === 1 && json.includes("attachment://team-7.webp"), json.slice(0, 160));

    // Plan 30: die Liga des Teams als Link-Knopf unter der Karte, für das Standing.
    const league = service.Look(FakeTeam([Player("p1", "captain", 1500, 1450)], { id: 8, links: [{ label: "Rival Rush Div 4.4", url: "https://example.com/liga" }] }), groups, DefaultTeamSettings());
    const withLeague = JSON.stringify((await TeamCardView(client, { ...DefaultTeamSettings(), layout: "hub" }, league, guild, [league])).components.map((entry) => entry.toJSON()));

    check("Liga als Link-Knopf", withLeague.includes('"url":"https://example.com/liga"') && withLeague.includes("Rival Rush Div 4.4"), withLeague.slice(-300));
    check("Ohne Liga kein Link-Knopf", !json.includes('"style":5'));

    const editor = await TeamCardView(client, { ...DefaultTeamSettings(), layout: "cards" }, view, guild, [view]);

    check("Alle Teams einzeln: Karte aus dem Editor, kein Bild", !editor.files?.length && !JSON.stringify(editor.components.map((entry) => entry.toJSON())).includes("team-7.webp"));
}

/** Plan 26/27: Hub-Einstellungen, Umstellung alter Darstellungen und Region. */
async function checkHubSettings(client: BotClient): Promise<void> {
    console.log("\n  — Einstellungen des Hubs —");

    const guild = FakeGuild();
    const service = client.teamService;
    const base = DefaultTeamSettings();

    // Plan 27: nur noch Hub und „Alle Teams einzeln“, alte Darstellungen werden umgestellt.
    const head = (doc: unknown): string => JSON.stringify(doc);
    const own = { accent: "#123456", blocks: [{ type: "text", body: "# Unser eigener Kopf" }] };
    const withTeams = { accent: "#00afff", blocks: [{ type: "text", body: "{teams}" }] };
    const body = (kind: string, doc: unknown) => ({ kind, content: "", embed: null, doc });

    check("Neuer Server startet mit dem Hub", NormalizeTeamSettings(null).layout === "hub");

    const menuEmbed = NormalizeTeamSettings({ layout: "menu", board: body("embed", own) });

    check("Menü mit Embed-Kopf wird Hub mit Vorlage", menuEmbed.layout === "hub" && head(menuEmbed.board.doc) === head(DefaultBoardBody().doc) && menuEmbed.board.kind === "v2");
    check("Alles in einer Nachricht mit {teams} bekommt die Vorlage", head(NormalizeTeamSettings({ layout: "single", board: body("v2", withTeams) }).board.doc) === head(DefaultBoardBody().doc));
    check("Menü mit tauglichem V2-Kopf behält ihn", head(NormalizeTeamSettings({ layout: "menu", board: body("v2", own) }).board.doc) === head(own));

    // Review: {teams.count} geht im Hub - ein Kopf damit taugt und bleibt.
    const counted = { accent: "#00afff", blocks: [{ type: "text", body: "# Unsere {teams.count} Teams" }] };

    check("Menü mit {teams.count} im Kopf behält ihn", head(NormalizeTeamSettings({ layout: "menu", board: body("v2", counted) }).board.doc) === head(counted));

    const hubEmbed = NormalizeTeamSettings({ layout: "hub", board: body("embed", own) });

    check("Hub mit Embed-Art behält seinen Kopf", hubEmbed.layout === "hub" && hubEmbed.board.kind === "v2" && head(hubEmbed.board.doc) === head(own));

    const cards = NormalizeTeamSettings({ layout: "cards", teamStyle: "drawn" });

    check("Karten bleiben Karten, ohne Stil", cards.layout === "cards" && !("teamStyle" in cards));
    check(
        "hubApply wird zum Knopf",
        JSON.stringify(NormalizeTeamSettings({ hubApply: false }).hubButton) === JSON.stringify({ on: false, to: "apply", url: null, channelId: null, label: "Bei uns bewerben" })
    );
    check(
        "Ab Werk: Thumbnail Server-Icon, kein großes Bild, Karte mit Vorgaben",
        NormalizeTeamSettings(null).hubThumbnail === "{guild.icon}" &&
            NormalizeTeamSettings(null).hubImage === null &&
            NormalizeTeamSettings(null).card.dim === 45 &&
            NormalizeTeamSettings(null).card.title === "{team.name}" &&
            NormalizeTeamSettings(null).card.footer === "{guild} · @{team.role}"
    );

    const button = (value: Record<string, unknown>) => service.CleanSettings(guild, { hubButton: { on: true, to: "web", ...value } }, base).hubButton;

    check("Knopf: http:// gilt nicht", button({ url: "http://x.de" }).url === null);
    check("Knopf: https:// bleibt", button({ url: "https://nexus-emb.de/bewerben" }).url === "https://nexus-emb.de/bewerben");
    check("Knopf: über 512 Zeichen gilt nicht", button({ url: `https://nexus-emb.de/${"a".repeat(493)}` }).url === null);
    check("Knopf: keine Kategorie als Kanal", button({ to: "channel", channelId: CATEGORY }).channelId === null);
    check("Knopf: Textkanal bleibt", button({ to: "channel", channelId: TEXT }).channelId === TEXT);
    check("Knopf: leerer Text wird „Bei uns bewerben“", button({ label: "" }).label === "Bei uns bewerben");
    check("Knopf: Text höchstens 80 Zeichen", button({ label: "x".repeat(81) }).label.length === 80);
    check("Knopf: unbekanntes Ziel bleibt beim alten", button({ to: "mond" }).to === base.hubButton.to);

    const card = (value: Record<string, unknown>) => service.CleanSettings(guild, { card: value }, base).card;

    check("Karte: Abdunkeln höchstens 90", card({ dim: 120 }).dim === 90);
    check("Karte: Farbe nur als #rrggbb", card({ accent: "red" }).accent === null && card({ accent: "#FF0000" }).accent === "#ff0000");
    check("Karte: Zeile höchstens 200 Zeichen", card({ title: "t".repeat(250) }).title.length === 200);
    check("Karte: unbekannter Hintergrund bleibt beim alten", card({ background: { mode: "foo", image: null } }).background.mode === base.card.background.mode);
    check("Karte: Bausteine nur als Schalter", card({ parts: { logo: "nein", staff: false } }).parts.logo === true && card({ parts: { staff: false } }).parts.staff === false);
    check("Thumbnail: Platzhalter-Bild bleibt", service.CleanSettings(guild, { hubThumbnail: "{guild.icon}" }, { ...base, hubThumbnail: null }).hubThumbnail === "{guild.icon}");
    check("Thumbnail: kein Bild, alter Wert bleibt", service.CleanSettings(guild, { hubThumbnail: "javascript:alert(1)" }, base).hubThumbnail === base.hubThumbnail);
    check("Großes Bild: null leert", service.CleanSettings(guild, { hubImage: null }, { ...base, hubImage: "{guild.icon}" }).hubImage === null);
    check(
        "Spalten werden ergänzt",
        JSON.stringify(NormalizeTeamSettings({ cardColumns: { "1v1": false } }).cardColumns) === JSON.stringify({ "2v2": true, "1v1": false, peak: true })
    );

    const rows = (value: unknown): number => service.CleanSettings(guild, { hubRows: value }, base).hubRows;

    check("Zeilen je Kategorie: 0 wird 1", rows(0) === 1);
    check("Zeilen je Kategorie: 99 wird 10", rows(99) === 10);
    check("Zeilen je Gruppe: 2,6 wird 3", rows(2.6) === 3);
    check("Weitere Nachrichten kommen nie aus dem Browser", JSON.stringify(service.CleanSettings(guild, { moreIds: ["1"] }, { ...base, moreIds: ["9"] }).moreIds) === '["9"]');
    check("Hub ist ein Layout", service.CleanSettings(guild, { layout: "hub" }, base).layout === "hub");
    check("Zeile je Team: ab Werk die Vorgabe", NormalizeTeamSettings(null).hubLine === DEFAULT_HUB_LINE && NormalizeTeamSettings({ hubLine: "" }).hubLine === DEFAULT_HUB_LINE);
    check("Zeile je Team: eine Zeile, leer heißt Vorgabe", service.CleanSettings(guild, { hubLine: "A\nB" }, base).hubLine === "A B" && service.CleanSettings(guild, { hubLine: "  " }, base).hubLine === DEFAULT_HUB_LINE);
    check("Spalten nur als Schalter", service.CleanSettings(guild, { cardColumns: { "2v2": "ja", peak: false } }, base).cardColumns["2v2"] === true);

    // CleanTeam ist privat: was von der Seite kommt, geht durch sie.
    const cleanTeam = (service as unknown as { CleanTeam: (guild: Guild, input: unknown) => Promise<Partial<ITeam>> }).CleanTeam.bind(service);
    const region = (await cleanTeam(guild, { name: "Vyrox", groupId: null, region: "EU\nWest aber viel zu lang" })).region;

    check("Region: ohne Umbruch, höchstens 16 Zeichen", region === "EU West aber vie", String(region));

    const view = service.Look(FakeTeam([Player("p1", "captain", 1500, 1450)], { region: "EU" }), [], base);

    check("{team.region} steht in der Karte", TeamOwnValues(view, base)["team.region"] === "EU");
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
    check("Ohne Kategorie steht das da", TeamValues(service.Look(FakeTeam([], { groupId: null }), groups, settings), guild, settings)["team.group"] === "ohne Kategorie");

    console.log("\n  — Liga-Links —");

    const linked = service.Look(
        FakeTeam([Player("p1", "captain", 1500, 1450)], { links: [{ label: "RLCS Quali", url: "https://rlcs.gg/" }, { label: "Nexus Liga", url: "https://start.gg/nexus" }] }),
        groups,
        settings
    );

    check("{team.leagues} setzt die Links hintereinander", LeaguesText(linked) === "[RLCS Quali](https://rlcs.gg/) · [Nexus Liga](https://start.gg/nexus)", LeaguesText(linked));
    check("Ohne Links bleibt es leer", LeaguesText(view) === "");
    check("{team.leagues} steht in den Werten", TeamValues(linked, guild, settings)["team.leagues"]?.includes("[RLCS Quali]") === true);
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
   Der Team-Rang
   ---------------------------------------------------------- */
async function checkTeamRank(client: BotClient): Promise<void> {
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
async function checkOrder(client: BotClient): Promise<void> {
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

    // W-0025: Zahlen im Namen zählen als Zahl - „Team 9“ steht vor „Team 10“, auch in Liga-Namen.
    const numbered = [team(1, "Team 10", 0, 1, null, 3, "Div 10", 1), team(2, "Team 9", 1, 2, null, 3, "Div 9", 1), team(3, "Team 2", 2, 3, null, 3, "Div 2", 1)];

    check("Alphabetisch mit Zahlen: 2, 9, 10", ids({ by: "name", direction: "asc" }, numbered) === "3,2,1", ids({ by: "name", direction: "asc" }, numbered));
    check("Liga mit Zahlen: Div 2, Div 9, Div 10", ids({ by: "league", direction: "asc" }, numbered) === "3,2,1", ids({ by: "league", direction: "asc" }, numbered));
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
    const ordered = await HubMessages(client, { ...base, layout: "hub" }, OrderTeams(many, ViewFacts, { ...DefaultTeamOrder(), pinned: [30] }), groups, FakeGuild(), false);
    const first = /"custom_id":"teams:menu:1"[^]*?"value":"(\d+)"/.exec(JSON.stringify(ordered.map((message) => message.view.components.map((entry) => entry.toJSON()))))?.[1];

    check("Menü: ein angeheftetes Team steht ganz oben, auch als 30. Team", first === "30", first);
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
            // Die Karten aus dem Editor sind V2 (Vorgabe) - die Nachrichten im Kanal auch.
            fetch: async (id: string) => (alive.has(id) ? { id, flags: { has: () => true }, edit: async () => void edited.push(id) } : Promise.reject(new Error("Unknown Message"))),
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

/** Zählt Bausteine wie Discord: jede Komponente, auch die verschachtelten. */
function Components(node: unknown): number {
    if (Array.isArray(node)) return node.reduce((sum: number, entry) => sum + Components(entry), 0);
    if (typeof node !== "object" || node === null) return 0;

    const record = node as Record<string, unknown>;
    const own = typeof record.type === "number" && record.type !== 0 ? 1 : 0;

    return own + Components(record.components) + (record.accessory ? Components(record.accessory) : 0);
}

/** Plan 26: Menüs ab 26 Teams, Wechsel über die V2-Grenze, Antwort mit Aufschub. */
async function checkSending(client: BotClient): Promise<void> {
    console.log("\n  — Senden (Plan 26) —");

    const service = client.teamService;
    const groups: ITeamGroup[] = [{ id: 1, guildId: GUILD, name: "Main", position: 0 }];
    const base: ITeamSettings = DefaultTeamSettings();
    const many = (count: number): ITeamView[] =>
        Array.from({ length: count }, (_, index) => service.Look(FakeTeam([Player(`p${index}`, "captain", 1500, 1450)], { id: index + 1, name: `Team ${index + 1}` }), groups, base));
    const v2 = { components: [], flags: MessageFlags.IsComponentsV2, allowedMentions: {} } as never;
    const text = { content: "Hallo", components: [], allowedMentions: {} } as never;

    check("V2-Fassung auf Text-Nachricht: neu senden", NeedsResend({ flags: { has: () => false } }, v2));
    check("V2 auf V2: bearbeiten", !NeedsResend({ flags: { has: () => true } }, v2));
    check("Text auf V2-Nachricht: neu senden", NeedsResend({ flags: { has: () => true } }, text));

    // Der Kopf steht als Text im Kanal, die neue Fassung ist V2: löschen und neu senden, nicht bearbeiten.
    const settings: ITeamSettings = { ...base, channelId: TEXT, layout: "hub", messageId: "500" };
    const log: string[] = [];
    const channel = {
        id: TEXT,
        type: ChannelType.GuildText,
        isTextBased: () => true,
        messages: {
            fetch: async (id: string) => ({ id, flags: { has: () => false }, edit: async () => void log.push(`edit ${id}`) }),
            delete: async (id: string) => void log.push(`delete ${id}`),
        },
        send: async (): Promise<{ id: string }> => {
            log.push("send");

            return { id: "600" };
        },
    };
    const guild = { ...FakeGuild(), channels: { cache: new Map([[TEXT, channel]]) } } as unknown as Guild;
    const original = {
        settings: service.Settings,
        views: service.Views,
        save: client.moduleSettings.Save,
        full: client.teams.Full,
        sync: service.Sync,
        groups: service.Groups,
        setMessage: client.teams.SetMessage,
    };
    const saved: unknown[] = [];

    service.Settings = async () => settings;
    service.Views = async () => ({ views: many(3), groups, settings });
    client.moduleSettings.Save = async (_guild: string, _module: string, config: object) => void saved.push(config);

    try {
        await service.Publish(guild);

        check("Über die V2-Grenze: löschen und neu senden", log.join(",") === "delete 500,send" && (saved.at(-1) as ITeamSettings | undefined)?.messageId === "600", log.join(","));

        // Eine Karte, die nicht rausgeht, hält die anderen nicht auf.
        let calls = 0;
        const cards: ITeamSettings = { ...base, channelId: TEXT, layout: "cards" };
        const teams = many(3).map((view) => view.team);

        service.Settings = async () => cards;
        service.Views = async () => ({ views: teams.map((team) => service.Look(team, groups, cards)), groups, settings: cards });
        channel.send = async () => {
            calls++;

            if (calls === 2) throw new Error("Discord sagt nein");

            return { id: String(700 + calls) };
        };
        client.teams.SetMessage = async () => undefined;

        const result = await service.Publish(guild);

        check("Eine Karte scheitert, die anderen gehen raus", result.sent === 2 && result.failed === 1, JSON.stringify(result));

        // Menüauswahl: erst aufschieben, dann Prime fragen, dann antworten.
        const steps: string[] = [];
        const team = FakeTeam([Player("p1", "captain", 1500, 1450)], { id: 9 });

        service.Settings = async () => ({ ...base, layout: "hub" });
        service.Groups = async () => groups;
        service.Sync = async () => void steps.push("sync");
        service.Views = async () => ({ views: [service.Look(team, groups, base)], groups, settings: base });
        client.teams.Full = async () => team;

        let followed: { flags?: number } | null = null;
        let reset: { components?: unknown[] } | null = null;
        // Die Hub-Nachricht, wie Discord sie zurückgibt: Bild im Kopf als Anhang mit ablaufendem Link, darunter das Menü.
        const cdn = "https://cdn.discordapp.com/attachments/1/2/kopf.png?ex=aa&is=bb&hm=cc";
        const hub = {
            components: [
                {
                    toJSON: () => ({
                        type: 17,
                        components: [
                            { type: 12, items: [{ media: { url: cdn, proxy_url: "https://media.discordapp.net/x", attachment_id: "555" } }] },
                            { type: 9, components: [{ type: 10, content: "Team" }], accessory: { type: 11, media: { url: cdn } } },
                            { type: 1, components: [{ type: 3, custom_id: "teams:menu:1", options: [] }] },
                        ],
                    }),
                },
            ],
            attachments: new Map([["555", { id: "555", name: "kopf.png", url: cdn }]]),
        };
        const same = SameMessage(hub);
        const sameJson = JSON.stringify(same.components);

        check("Menü zurücksetzen: dieselben Teile, Menü dabei", sameJson.includes("teams:menu:1") && same.components.length === 1, sameJson.slice(0, 200));
        check("Menü zurücksetzen: Bilder zeigen auf den Anhang, nicht auf den ablaufenden Link", !sameJson.includes("cdn.discordapp.com") && (sameJson.match(/attachment:\/\/kopf\.png/g) ?? []).length === 2 && same.attachments.length === 1, sameJson.slice(0, 300));

        await service.Handle({
            inCachedGuild: () => true,
            guildId: GUILD,
            guild: FakeGuild(),
            message: hub,
            values: ["9"],
            deferUpdate: async () => void steps.push("update"),
            deferReply: async () => void steps.push("defer"),
            editReply: async (payload: { components?: unknown[] }) => {
                reset = payload;
                steps.push("edit");
            },
            followUp: async (payload: { flags?: number }) => {
                followed = payload;
                steps.push("follow");
            },
            reply: async () => void steps.push("reply"),
        } as never);

        // Ein Update setzt das Menü in Discord zurück - so lässt sich dasselbe Team gleich noch einmal wählen.
        check("Menüauswahl: erst Update (Menü zurück), dann Prime, dann die Karte nach", steps[0] === "update" && steps.includes("sync") && steps.at(-1) === "follow" && !steps.includes("defer") && !steps.includes("reply"), steps.join(","));
        check("Menüauswahl: die Karte sieht nur, wer gewählt hat", Boolean(((followed as { flags?: number } | null)?.flags ?? 0) & MessageFlags.Ephemeral));
        // W-0035: Erst ein neues Setzen der Nachricht setzt das Menü in Discord zurück - gleich nach dem Bestätigen.
        check("Menüauswahl: Hub-Nachricht gleich neu gesetzt, Menü wieder leer", steps[1] === "edit" && JSON.stringify((reset as { components?: unknown[] } | null)?.components ?? []).includes("teams:menu:1"), steps.join(","));
    } finally {
        service.Settings = original.settings;
        service.Views = original.views;
        service.Sync = original.sync;
        service.Groups = original.groups;
        client.moduleSettings.Save = original.save;
        client.teams.Full = original.full;
        client.teams.SetMessage = original.setMessage;
    }
}

/** Die Texte einer Nachricht zusammen, wie Discord sie gegen die 4.000 zählt. */
function TextOf(node: unknown): string {
    if (Array.isArray(node)) return node.map(TextOf).join("\n");
    if (typeof node !== "object" || node === null) return "";

    const record = node as Record<string, unknown>;

    return [record.type === 10 && typeof record.content === "string" ? record.content : "", TextOf(record.components)].filter(Boolean).join("\n");
}

/** Plan 26: der Team-Hub, gepackt von HubMessages(). */
async function checkHub(client: BotClient): Promise<void> {
    console.log("\n  — Team-Hub —");

    const service = client.teamService;
    const base: ITeamSettings = { ...DefaultTeamSettings(), layout: "hub" };
    const named = ["Main", "Academy", "Div 2", "Div 3", "Female", "U18", "Content", "Pro", "Semi", "Trial", "Legacy", "Backup"];
    const make = (groupCount: number, teamCount: number, longNames = false): { views: ITeamView[]; groups: ITeamGroup[] } => {
        const groups: ITeamGroup[] = Array.from({ length: groupCount }, (_, index) => ({ id: index + 1, guildId: GUILD, name: named[index]!, position: index }));
        const views = Array.from({ length: teamCount }, (_, index) =>
            service.Look(
                FakeTeam([Player(`p${index}`, "captain", 1500 + index, 1450), Player(`q${index}`, "player", 1400, 1380)], {
                    id: index + 1,
                    groupId: groupCount ? (index % groupCount) + 1 : null,
                    name: longNames ? `Ein sehr langer Teamname Nummer ${index + 1} mit noch mehr Text dran`.slice(0, 60) : `Team ${index + 1}`,
                    tag: `T${index + 1}`,
                }),
                groups,
                base
            )
        );

        return { views, groups };
    };
    const json = (messages: IHubMessage[]): unknown[] => messages.map((message) => message.view.components.map((entry) => entry.toJSON()));
    const menus = (messages: IHubMessage[]): { id: string; placeholder: string; values: string[] }[] =>
        JSON.stringify(json(messages))
            .match(/\{"type":3[^]*?"custom_id":"teams:menu:\d+"[^]*?\}\]\}/g)
            ?.map((raw) => {
                const id = /"custom_id":"(teams:menu:\d+)"/.exec(raw)![1]!;
                const placeholder = /"placeholder":"([^"]*)"/.exec(raw)?.[1] ?? "";
                const values = [...raw.matchAll(/"value":"(\d+)"/g)].map((match) => match[1]!);

                return { id, placeholder, values };
            }) ?? [];

    const three = make(3, 6);
    const small = await HubMessages(client, base, three.views, three.groups, FakeGuild(), true);
    const smallMenus = menus(small);

    // Plan 27: ein Menü für alle Teams, die Kategorie steht in der Beschreibung.
    check(
        "Drei Kategorien: eine Nachricht, ein Menü mit allen sechs",
        small.length === 1 && smallMenus.length === 1 && smallMenus[0]!.placeholder === "Team ansehen" && smallMenus[0]!.values.length === 6,
        JSON.stringify(smallMenus.map((menu) => menu.placeholder))
    );
    check("Die Kategorie steht beim Team im Menü", JSON.stringify(json(small)).includes('"description":"T1 · Main · MMR') && JSON.stringify(json(small)).includes('"description":"T2 · Academy · MMR'));
    check("Mit Apply System: der Knopf", JSON.stringify(json(small)).includes("applyflow:entry"));

    // Review: Die Vorschau im Dashboard klappt das Menü auf - dafür liefert die Route die Einträge mit.
    const parts = HubParts(json(small)).filter((part) => part.type === "menu");
    const entries = parts[0]?.type === "menu" ? parts[0].options : [];

    check("Vorschau: das Menü bringt seine Einträge mit", entries.length === 6 && entries[0]?.label === "Team 1" && entries[0]?.description?.includes("Main") === true, JSON.stringify(entries.slice(0, 2)));
    check("Kennzahlen stehen drin", TextOf(json(small)).includes("**6** Teams") && TextOf(json(small)).includes("**3** Kategorien"), TextOf(json(small)).slice(0, 200));

    const seven = make(7, 14);
    const sevenMenus = menus(await HubMessages(client, base, seven.views, seven.groups, FakeGuild(), true));

    check("Sieben Kategorien, 14 Teams: ein Menü", sevenMenus.length === 1 && sevenMenus[0]!.placeholder === "Team ansehen", JSON.stringify(sevenMenus.map((menu) => menu.placeholder)));

    const thirty = make(3, 30);
    const thirtyMenus = menus(await HubMessages(client, base, thirty.views, thirty.groups, FakeGuild(), true));
    const thirtyValues = thirtyMenus.flatMap((menu) => menu.values);

    check(
        "30 Teams: zwei Menüs zu 25 und 5",
        thirtyMenus.length === 2 && thirtyMenus[0]!.values.length === 25 && thirtyMenus[1]!.values.length === 5 && thirtyMenus[0]!.placeholder === "Teams 1–25" && thirtyMenus[1]!.placeholder === "Teams 26–30",
        JSON.stringify(thirtyMenus.map((menu) => [menu.placeholder, menu.values.length]))
    );
    check("… jedes Team genau einmal", thirtyValues.length === 30 && new Set(thirtyValues).size === 30);

    // Der Knopf: Bewerbung, Webseite oder Kanal - fehlt das Ziel, steht keiner da.
    const knob = async (button: Partial<ITeamSettings["hubButton"]>, apply = true): Promise<Record<string, unknown> | null> => {
        const raw = JSON.stringify(json(await HubMessages(client, { ...base, hubButton: { ...base.hubButton, ...button } }, three.views, three.groups, FakeGuild(), apply)));
        const found = /\{"type":2,[^}]*\}/.exec(raw);

        return found ? (JSON.parse(found[0]) as Record<string, unknown>) : null;
    };

    check("Bewerbung ohne Apply System: kein Knopf", (await knob({ to: "apply" }, false)) === null);
    check("Webseite: Link-Knopf", (await knob({ to: "web", url: "https://nexus-emb.de/bewerben" }))?.url === "https://nexus-emb.de/bewerben" && (await knob({ to: "web", url: "https://nexus-emb.de/bewerben" }))?.style === 5);
    check("Webseite ohne Adresse: kein Knopf", (await knob({ to: "web", url: null })) === null);
    check("Kanal: Link in den Kanal", (await knob({ to: "channel", channelId: TEXT }))?.url === `https://discord.com/channels/${GUILD}/${TEXT}`);
    check("Kanal gelöscht: kein Knopf", (await knob({ to: "channel", channelId: "90071992547409999" })) === null);
    check("Knopf aus: kein Knopf", (await knob({ on: false })) === null);
    check("Eigener Text auf dem Knopf", (await knob({ to: "web", url: "https://nexus-emb.de/regeln", label: "Unsere Regeln" }))?.label === "Unsere Regeln");

    // Thumbnail und großes Bild im Kopf.
    const doc = { accent: "#00afff", blocks: [{ type: "text" as const, body: "# A" }, { type: "text" as const, body: "B" }] };
    const withThumb = HubDoc(doc, "{guild.icon}", null);

    check("Thumbnail: die erste Textzeile wird Abschnitt mit Bild", JSON.stringify(withThumb.blocks[0]) === JSON.stringify({ type: "section", body: "# A", thumbnail: "{guild.icon}" }) && withThumb.blocks[1]?.type === "text");
    check("Großes Bild kommt ans Ende", JSON.stringify(HubDoc(doc, null, "https://x.de/b.png").blocks.at(-1)) === JSON.stringify({ type: "image", images: ["https://x.de/b.png"] }));

    const sectioned = { accent: "#00afff", blocks: [{ type: "section" as const, body: "S", thumbnail: "https://x.de/s.png" }] };
    const separated = { accent: "#00afff", blocks: [{ type: "separator" as const, line: true }, { type: "text" as const, body: "T" }] };

    check("Schon ein Abschnitt: bleibt", JSON.stringify(HubDoc(sectioned, "{guild.icon}", null).blocks[0]) === JSON.stringify(sectioned.blocks[0]));
    // W-0026: Trenner und Banner davor werden übersprungen - das Thumbnail kommt an die erste Textzeile.
    const bannered = { accent: "#00afff", blocks: [{ type: "image" as const, images: ["https://x.de/banner.png"] }, { type: "text" as const, body: "# Teams" }] };
    const sectionFirst = { accent: "#00afff", blocks: [{ type: "section" as const, body: "S", thumbnail: "https://x.de/s.png" }, { type: "text" as const, body: "T" }] };

    check("Oben ein Trenner: Thumbnail an der Textzeile darunter", JSON.stringify(HubDoc(separated, "{guild.icon}", null).blocks[1]) === JSON.stringify({ type: "section", body: "T", thumbnail: "{guild.icon}" }));
    check("Oben ein Banner: Thumbnail an der ersten Textzeile", JSON.stringify(HubDoc(bannered, "{guild.icon}", null).blocks[1]) === JSON.stringify({ type: "section", body: "# Teams", thumbnail: "{guild.icon}" }));
    check("Erst ein Abschnitt mit Bild: nichts dazu", JSON.stringify(HubDoc(sectionFirst, "{guild.icon}", null).blocks) === JSON.stringify(sectionFirst.blocks));

    let noIcon = "";

    try {
        noIcon = JSON.stringify(json(await HubMessages(client, { ...base, hubThumbnail: "{guild.icon}" }, three.views, three.groups, FakeGuild(), false)));
    } catch (error) {
        noIcon = `Fehler: ${String(error)}`;
    }

    check("Server ohne Icon: Hub ohne Thumbnail, ohne Fehler", !noIcon.startsWith("Fehler") && !noIcon.includes('"type":11'), noIcon.slice(0, 120));

    let missing = "";

    try {
        missing = TextOf(json(await HubMessages(client, { ...base, hubImage: `${GUILD}/album/weg.png` }, three.views, three.groups, FakeGuild(), false)));
    } catch (error) {
        missing = `Fehler: ${String(error)}`;
    }

    check("Galerie-Bild fehlt: Hub steht trotzdem", !missing.startsWith("Fehler") && missing.includes("**6** Teams"), missing.slice(0, 120));

    // Viele Teams, lange Namen, großer Kopf: keine Nachricht über Discords Grenzen.
    const blocks = Array.from({ length: 12 }, (_, index) => ({ type: "text" as const, body: `Absatz ${index}: ${"Viel Text über unsere Teams und wie man mitmacht. ".repeat(5)}` }));
    const heavy = { ...base, hubRows: 10, board: { ...base.board, kind: "v2" as const, doc: { accent: "#00afff", blocks } } };
    const forty = make(12, 40, true);
    const hub = await HubMessages(client, { ...heavy, hubThumbnail: "https://x.de/t.png", hubImage: "https://x.de/b.png" }, forty.views, forty.groups, FakeGuild(), true);
    const all = menus(hub);
    const values = all.flatMap((menu) => menu.values);
    const sizes = hub.map((message, index) => ({ components: Components(json([message])), chars: TextOf(json([message])).length, index }));

    check("40 Teams in 12 Kategorien, mit Thumbnail und Bild: mehrere Nachrichten, jede in Discords Grenzen", hub.length > 1 && sizes.every((size) => size.components <= 40 && size.chars <= 4000), JSON.stringify(sizes));
    check("Jedes Team genau einmal in einem Menü", values.length === 40 && new Set(values).size === 40, `${values.length}`);
    check(
        "Menüs, Knopf und Fuß nur in der letzten Nachricht",
        hub.slice(0, -1).every((message) => !JSON.stringify(json([message])).includes("teams:menu") && !JSON.stringify(json([message])).includes("applyflow:entry")) &&
            TextOf(json(hub.slice(-1))).includes("Ränge und MMR vom") && !TextOf(json(hub)).includes("-# -#"),
        `${hub.length} Nachrichten`
    );

    const headings = TextOf(json(hub)).match(/^### .+$/gm) ?? [];

    check("Geschnitten wird zwischen Kategorien: jede genau einmal", headings.length === 12 && new Set(headings).size === 12, headings.join(" | "));

    const onlyTeams = { ...base, board: { ...base.board, kind: "v2" as const, doc: { accent: "#00afff", blocks: [{ type: "text" as const, body: "{teams}" }] } } };
    const bare = TextOf(json(await HubMessages(client, onlyTeams, three.views, three.groups, FakeGuild(), false)));

    check("{teams} im Kopf bleibt leer, kein „Leere Nachricht“", !bare.includes("Leere Nachricht") && !bare.includes("MMR 1"), bare.slice(0, 120));
    check("Ohne Apply System kein Knopf", !JSON.stringify(json(await HubMessages(client, base, three.views, three.groups, FakeGuild(), false))).includes("applyflow:entry"));

    const crowded = make(1, 6);
    const rows = TextOf(json(await HubMessages(client, { ...base, hubRows: 3 }, crowded.views, crowded.groups, FakeGuild(), false)));

    check("Mehr Teams als Zeilen: „… und 3 weitere“", rows.includes("… und 3 weitere"), rows.slice(0, 300));

    const loose = make(0, 3);
    const flat = TextOf(json(await HubMessages(client, base, loose.views, [], FakeGuild(), false)));

    check("Ohne Kategorien keine Überschrift „Ohne Kategorie“", !flat.includes("Ohne Kategorie") && flat.includes("Team 1"), flat.slice(0, 200));

    const mixed = make(2, 4);

    mixed.views[3]!.team.groupId = null;

    check("Teams ohne Kategorie stehen unter „Ohne Kategorie“", TextOf(json(await HubMessages(client, base, mixed.views, mixed.groups, FakeGuild(), false))).includes("### Ohne Kategorie · 1 Team"));

    // Die Zeile je Team stellt der Server ein (Reiter Teams-Liste beim Hub).
    const standard = TextOf(json(await HubMessages(client, base, three.views, three.groups, FakeGuild(), false)));
    const own = TextOf(json(await HubMessages(client, { ...base, hubLine: "{team.name} | {team.tag}" }, three.views, three.groups, FakeGuild(), false)));
    const untagged = make(1, 1);

    untagged.views[0]!.team.tag = "";

    const noTag = TextOf(json(await HubMessages(client, base, untagged.views, untagged.groups, FakeGuild(), false)));

    check("Vorgabe-Zeile: Name fett, Kürzel, Spieler, MMR", standard.includes("**Team 1** `T1` · 2 Spieler ·") && standard.includes("MMR"), standard.slice(0, 300));
    check("Eigene Zeile je Team", own.includes("Team 1 | T1") && !own.includes("2 Spieler"), own.slice(0, 300));
    check("Ohne Kürzel keine leeren Backticks", !noTag.includes("``") && noTag.includes("**Team 1** · 2 Spieler"), noTag.slice(0, 200));

    // Review: eine eigene Zeile mit langer Beschreibung macht eine Gruppe länger als eine Nachricht.
    const wide = make(1, 10);

    for (const view of wide.views) view.team.description = "Sehr lange Beschreibung des Teams. ".repeat(15).slice(0, 500);

    const long = await HubMessages(client, { ...base, hubRows: 10, hubLine: "{team.rank.icon} **{team.name}** `{team.tag}` · {team.description}" }, wide.views, wide.groups, FakeGuild(), true);
    const longSizes = long.map((message) => ({ components: Components(json([message])), chars: TextOf(json([message])).length }));

    check(
        "Lange Zeilen: keine leere Nachricht, keine über 4.000 Zeichen",
        longSizes.every((size) => size.chars > 0 && size.chars <= 4000 && size.components > 1) && menus(long).flatMap((menu) => menu.values).length === 10,
        JSON.stringify(longSizes)
    );
}

/** Plan 26: der Hub im Kanal - Kette aus Kopf und Folgenachrichten, nur ein Senden je Server. */
async function checkHubChannel(client: BotClient): Promise<void> {
    console.log("\n  — Hub im Kanal —");

    const service = client.teamService;
    const named = ["Main", "Academy", "Div 2", "Div 3", "Female", "U18", "Content", "Pro", "Semi", "Trial", "Legacy", "Backup"];
    const groups: ITeamGroup[] = named.map((name, index) => ({ id: index + 1, guildId: GUILD, name, position: index }));
    const blocks = Array.from({ length: 12 }, (_, index) => ({ type: "text" as const, body: `Absatz ${index}: ${"Viel Text über unsere Teams und wie man mitmacht. ".repeat(5)}` }));
    const big: ITeamSettings = { ...DefaultTeamSettings(), channelId: TEXT, layout: "hub", hubRows: 10, board: { ...DefaultTeamSettings().board, kind: "v2", doc: { accent: "#00afff", blocks } } };
    const small: ITeamSettings = { ...big, hubRows: 3, board: DefaultTeamSettings().board };
    const teams = Array.from({ length: 40 }, (_, index) =>
        FakeTeam([Player(`p${index}`, "captain", 1500 + index, 1450)], { id: index + 1, groupId: (index % 12) + 1, name: `Ein sehr langer Teamname Nummer ${index + 1} mit noch mehr Text`, tag: `T${index + 1}` })
    );
    const alive = new Map<string, string>();
    const log: string[] = [];
    let next = 1000;
    let settings: ITeamSettings = big;
    const channel = {
        id: TEXT,
        type: ChannelType.GuildText,
        isTextBased: () => true,
        messages: {
            fetch: async (id: string) =>
                alive.has(id) ? { id, flags: { has: () => true }, edit: async () => void log.push(`edit ${id}`) } : Promise.reject(new Error("Unknown Message")),
            delete: async (id: string) => {
                log.push(`delete ${id}`);
                alive.delete(id);
            },
        },
        send: async () => {
            // Ein langsames Discord: so überholen sich zwei Sendungen, wenn nichts sie ordnet.
            await new Promise((resolve) => setTimeout(resolve, 5));

            const id = String(next++);

            log.push(`send ${id}`);
            alive.set(id, "hub");

            return { id };
        },
    };
    const guild = { ...FakeGuild(), channels: { cache: new Map([[TEXT, channel]]) } } as unknown as Guild;
    const original = { settings: service.Settings, views: service.Views, save: client.moduleSettings.Save, of: client.settings.Of };

    service.Settings = async () => settings;
    service.Views = async () => ({ views: teams.map((team) => service.Look(team, groups, settings)), groups, settings });
    client.moduleSettings.Save = async (_guild: string, _module: string, config: object) => void (settings = config as ITeamSettings);
    (client.settings as unknown as { Of: unknown }).Of = async () => ({ modules: ["teams", "apply"] });

    try {
        await service.Publish(guild);

        check("Großer Hub: Kopf und Folgenachrichten gemerkt", settings.messageId !== null && settings.moreIds.length >= 1 && alive.size === 1 + settings.moreIds.length, JSON.stringify({ head: settings.messageId, more: settings.moreIds }));

        const firstChain = [settings.messageId, ...settings.moreIds];

        settings = { ...small, messageId: settings.messageId, moreIds: settings.moreIds };
        log.length = 0;
        await service.Publish(guild);

        check(
            "Kleiner Hub: der Kopf wird bearbeitet, überzählige gelöscht",
            log.includes(`edit ${firstChain[0]}`) && firstChain.slice(1).every((id) => log.includes(`delete ${id}`)) && settings.moreIds.length === 0 && alive.size === 1,
            log.join(",")
        );

        // Fehlt eine Nachricht der Kette, geht die ganze Kette neu raus.
        settings = { ...big, messageId: settings.messageId, moreIds: [] };
        await service.Publish(guild);

        const chain = [settings.messageId!, ...settings.moreIds];

        alive.delete(chain[1]!);
        log.length = 0;
        await service.Publish(guild);

        check("Folgenachricht weg: die ganze Kette neu", chain.every((id) => !alive.has(id)) && log.filter((entry) => entry.startsWith("send")).length === 1 + settings.moreIds.length, log.join(","));

        // Zwei Speichern kurz hintereinander, noch ohne Nachricht im Kanal: ohne
        // Reihenfolge schickten beide eine eigene Kette. Am Ende genau eine.
        for (const id of [...alive.keys()]) alive.delete(id);
        settings = { ...settings, messageId: null, moreIds: [] };
        await Promise.all([service.Publish(guild), service.Publish(guild)]);

        check("Zweimal gleichzeitig senden: genau eine Kette im Kanal", alive.size === 1 + settings.moreIds.length, `${alive.size} Nachrichten, Kette ${1 + settings.moreIds.length}`);

        // Weg vom Hub: die Folgenachrichten verschwinden mit.
        settings = { ...settings, layout: "cards" };
        await service.Withdraw(guild, null, true);

        check("Einsammeln nimmt die Folgenachrichten mit", alive.size === 0 && settings.messageId === null && settings.moreIds.length === 0, `${alive.size}`);

        // Review: scheitert das Bearbeiten einer Nachricht der Kette, bleibt keine verwaiste stehen.
        settings = { ...big, messageId: null, moreIds: [] };
        await service.Publish(guild);

        const before = [settings.messageId!, ...settings.moreIds];
        const fetch = channel.messages.fetch;

        channel.messages.fetch = async (id: string) => {
            const message = await fetch(id);

            return id === before[1] ? { ...message, edit: async () => Promise.reject(new Error("Discord 500")) } : message;
        };

        try {
            await service.Publish(guild);
        } finally {
            channel.messages.fetch = fetch;
        }

        const chainNow = [settings.messageId!, ...settings.moreIds];

        check("Bearbeiten scheitert: keine verwaiste Nachricht im Kanal", alive.size === chainNow.length && chainNow.every((id) => alive.has(id)), `${alive.size} im Kanal, Kette ${chainNow.length}`);
    } finally {
        service.Settings = original.settings;
        service.Views = original.views;
        client.moduleSettings.Save = original.save;
        (client.settings as unknown as { Of: unknown }).Of = original.of;
    }
}

/** Plan 27: Kategorien als Entwurf - Vorschau ohne Datenbank, Speichern gebündelt mit einem Versand. */
async function checkCategories(client: BotClient): Promise<void> {
    console.log("\n  — Kategorien —");

    const guild = FakeGuild();
    const service = client.teamService;
    const groups: ITeamGroup[] = [
        { id: 1, guildId: GUILD, name: "Main", position: 0 },
        { id: 2, guildId: GUILD, name: "Academy", position: 1 },
    ];
    const teams = [1, 2, 3, 4].map((id) => FakeTeam([], { id, name: `Team ${id}`, groupId: id <= 2 ? 1 : 2 }));
    const draft = ParseCategoryDraft({ categories: [{ id: 2, name: "Academy" }, { id: 1, name: "Main" }, { id: -1, name: "Ladies" }], teams: { 1: -1, 3: 999 } })!;
    const applied = ApplyCategoryDraft(GUILD, groups, teams, draft);

    check("Entwurf: drei Kategorien in der Reihenfolge des Entwurfs", JSON.stringify(applied.groups.map((group) => [group.id, group.position])) === JSON.stringify([[2, 0], [1, 1], [-1, 2]]), JSON.stringify(applied.groups));
    check("Entwurf: ein Team in der neuen Kategorie", applied.teams.find((team) => team.id === 1)?.groupId === -1);
    check("Entwurf: unbekannte Kategorie wird „ohne“", applied.teams.find((team) => team.id === 3)?.groupId === null);
    check("Entwurf: ohne Angabe bleibt das Team, wo es war", applied.teams.find((team) => team.id === 2)?.groupId === 1);

    const dropped = ApplyCategoryDraft(GUILD, groups, teams, ParseCategoryDraft({ categories: [{ id: 1, name: "Main" }], removed: [2], teams: {} })!);

    check("Entwurf: gelöschte Kategorie fehlt, ihre Teams stehen ohne", dropped.groups.length === 1 && dropped.teams.filter((team) => team.groupId === null).length === 2);

    // Review: Eine Kategorie, die der Entwurf nicht kennt (inzwischen woanders angelegt), bleibt - gelöscht wird nur, was er entfernt hat.
    const unknown = ApplyCategoryDraft(GUILD, groups, teams, ParseCategoryDraft({ categories: [{ id: 1, name: "Main" }], teams: {} })!);

    check("Entwurf: eine Kategorie von woanders bleibt samt Teams", unknown.groups.some((group) => group.id === 2) && unknown.teams.filter((team) => team.groupId === 2).length === 2, JSON.stringify(unknown.groups));
    check("Ohne Entwurf: null", ParseCategoryDraft(undefined) === null);
    refuses("Mehr als 12 Kategorien gehen nicht", () => ParseCategoryDraft({ categories: Array.from({ length: 13 }, (_, index) => ({ id: -index - 1, name: `K${index}` })), teams: {} }));
    refuses("Eine Kategorie braucht einen Namen", () => ParseCategoryDraft({ categories: [{ id: -1, name: "  " }], teams: {} }));

    // Speichern: anlegen, umbenennen, löschen, umhängen - und genau ein Versand.
    const calls = { publish: 0, save: 0, create: 0, rename: 0, remove: 0 };
    const stored = groups.map((group) => ({ ...group }));
    const original = {
        groups: service.Groups,
        teams: service.Teams,
        settings: service.Settings,
        publish: service.Publish,
        create: client.teamGroups.Create,
        saveGroup: client.teamGroups.Save,
        remove: client.teamGroups.Remove,
        save: client.teams.Save,
        clear: client.teams.ClearGroup,
    };
    let layout: ITeamSettings["layout"] = "hub";

    service.Groups = async () => stored.map((group) => ({ ...group }));
    service.Teams = async () => teams.map((team) => ({ ...team }));
    service.Settings = async () => ({ ...DefaultTeamSettings(), layout, channelId: TEXT, messageId: "500" });
    service.Publish = async () => {
        calls.publish++;

        return { layout, sent: 1, failed: 0 };
    };
    client.teamGroups.Create = (async (_guild: string, name: string, position: number) => {
        calls.create++;

        return { id: 10 + calls.create, guildId: GUILD, name, position };
    }) as never;
    client.teamGroups.Save = (async () => void calls.rename++) as never;
    client.teamGroups.Remove = (async () => void calls.remove++) as never;
    client.teams.Save = (async () => void calls.save++) as never;
    client.teams.ClearGroup = (async () => undefined) as never;

    try {
        // Main umbenennen, Academy löschen, Ladies neu; Team 1 zu Ladies, Team 2 bleibt bei Main, Team 3 und 4 standen in Academy.
        await service.SaveCategories(guild, { categories: [{ id: 1, name: "Main Team" }, { id: -1, name: "Ladies" }], removed: [2], teams: { 1: -1, 3: -1 } });

        check("Speichern: eine neu, eine umbenannt, eine gelöscht", calls.create === 1 && calls.rename === 1 && calls.remove === 1, JSON.stringify(calls));
        check("Speichern: nur geänderte Teams werden geschrieben", calls.save === 2, JSON.stringify(calls));
        check("Speichern: der Hub geht genau einmal raus", calls.publish === 1, JSON.stringify(calls));

        // Review: Was die andere Seite inzwischen angelegt hat, kennt der Entwurf nicht - es bleibt.
        calls.remove = 0;
        await service.SaveCategories(guild, { categories: [{ id: 1, name: "Main" }], teams: {} });

        check("Speichern: eine Kategorie von woanders wird nicht gelöscht", calls.remove === 0, JSON.stringify(calls));

        layout = "cards";
        calls.publish = 0;
        await service.SaveCategories(guild, { categories: [{ id: 1, name: "Neu" }], teams: {} });

        check("Bei „Alle Teams einzeln“ kein Versand des Hubs", calls.publish === 0);

        // W-0026: Kommt im selben Speichern noch ein Team, schickt das den Hub - hier also keiner.
        layout = "hub";
        calls.publish = 0;
        await service.SaveCategories(guild, { categories: [{ id: 1, name: "Main" }], teams: { 2: -1 } }, false);

        check("Ohne Versand gespeichert: der Hub geht nicht raus", calls.publish === 0, JSON.stringify(calls));
    } finally {
        Object.assign(service, { Groups: original.groups, Teams: original.teams, Settings: original.settings, Publish: original.publish });
        Object.assign(client.teamGroups, { Create: original.create, Save: original.saveGroup, Remove: original.remove });
        Object.assign(client.teams, { Save: original.save, ClearGroup: original.clear });
    }

    // Team-Entwurf für die Vorschau der Karte: geprüft, nicht gespeichert.
    const team = FakeTeam([], { name: "Vyrox Main" });
    const drafted = await service.DraftTeam(guild, team, {
        name: "Anderer Name",
        region: "  EU   West ",
        links: [{ label: "Alt", url: "http://x.de" }, { label: "RLCS", url: "https://liquipedia.net/rl" }],
        description: "Neu",
    });

    check("Entwurf: Region ohne doppelte Leerzeichen", drafted.region === "EU West", drafted.region);
    check("Entwurf: nur https-Links, die anderen fallen still weg", drafted.links.length === 1 && drafted.links[0]!.label === "RLCS", JSON.stringify(drafted.links));
    check("Entwurf: der Name bleibt", drafted.name === "Vyrox Main" && drafted.description === "Neu");
}

async function main(): Promise<void> {
    console.log("\n🛡️  RL Team-Übersicht\n");

    const client = new BotClient();

    checkFormula();
    checkValues(client);
    checkSettings(client);
    await checkHubSettings(client);
    await checkDrawnCard(client);
    await checkDescriptionLines(client);
    await checkCardImages(client);
    await checkOrder(client);
    checkView(client);
    checkClean(client);
    checkRoles(client);
    await checkRights(client);
    await checkCardOrder(client);
    await checkSending(client);
    await checkHub(client);
    await checkHubChannel(client);
    await checkCategories(client);
    await checkPlayers(client);
    await checkTeamRank(client);
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
