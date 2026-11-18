/**
 * Prüft 2, 4 & 6 Mans ohne Discord und ohne Datenbank: das Säubern der
 * Einstellungen, die Aufteilung in zwei Teams, die Rechnung hinter der MMR,
 * die Stufen und die Platzhalter der vier Nachrichten.
 *
 *   npm run check:sixmans
 *
 * Ob Discord die Sprachkanäle wirklich anlegt, sieht nur ein echter Server.
 */
process.env.CLIENT_SECRET ||= "check-secret";
process.env.DEV_CLIENT_SECRET ||= "check-secret";

import path from "path";
import { existsSync } from "fs";
import { ChannelType, Guild, GuildBasedChannel, GuildMember, Role } from "discord.js";
import BotClient from "../client/BotClient";
import { PanelRow, PanelValues, RoundRow, RoundValues, SixRender } from "../builder/SixMansView";
import { Fill } from "../constants/Placeholders";
import {
    BoardLink,
    DefaultSixSettings,
    LobbyName,
    LobbyPass,
    MAX_IDLE,
    MAX_K,
    MAX_START,
    MODES,
    MODE_LABELS,
    PANEL_KEYS,
    DEFAULT_RANKS,
    RESULT_KEYS,
    ROUND_KEYS,
    RankName,
    RankOf,
    SIXMANS_PREFIX,
    TeamSize,
} from "../constants/SixMans";
import { IManRank, ISixRound, ISixWaiting, ManMode } from "../interfaces/services/sixmans/ISixMans";
import DashboardApiSixMans from "../routes/DashboardApiSixMans";
import { SixMansError, SixMansLimits } from "../services/SixMansService";
import { SetFlags } from "../utils/moduleFlags";

const GUILD = "90071992547409961";
const TEXT = "90071992547409962";
const VOICE = "90071992547409963";
const CATEGORY = "90071992547409964";

let failures = 0;

function check(name: string, passed: boolean, detail = ""): void {
    if (!passed) failures++;

    console.log(`  ${passed ? "ok  " : "FAIL"} ${name}${passed || !detail ? "" : `  → ${detail}`}`);
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
                [CATEGORY, channel(CATEGORY, ChannelType.GuildCategory)],
            ]),
        },
        roles: { cache: new Map([[GUILD, { id: GUILD, name: "@everyone" } as Role]]) },
        iconURL: () => null,
    } as unknown as Guild;
}

function Waiting(mmr: number[]): ISixWaiting[] {
    return mmr.map((value, index) => ({ userId: `9007199254740${1000 + index}`, name: `Spieler ${index + 1}`, mmr: value, since: Date.now() - index * 60_000 }));
}

/** Der kleinste Abstand zweier Hälften - stur über alle Kombinationen. */
function Smallest(values: number[]): number {
    const total = values.reduce((sum, one) => sum + one, 0);
    const size = values.length / 2;
    let best = Infinity;

    for (let mask = 0; mask < 1 << values.length; mask++) {
        let side = 0;
        let count = 0;

        for (let index = 0; index < values.length; index++) {
            if (!(mask & (1 << index))) continue;

            side += values[index];
            count++;
        }

        if (count === size) best = Math.min(best, Math.abs(total - 2 * side));
    }

    return best;
}

function FakeRound(over: Partial<ISixRound> = {}): ISixRound {
    const players = Waiting([700, 650, 600, 590, 560, 500]);
    const blue = players.slice(0, 3);
    const orange = players.slice(3);

    return {
        id: 129,
        guildId: GUILD,
        mode: 6,
        blue: blue.map((one) => one.userId),
        orange: orange.map((one) => one.userId),
        names: Object.fromEntries(players.map((one) => [one.userId, one.name])),
        before: Object.fromEntries(players.map((one) => [one.userId, one.mmr])),
        status: "running",
        winner: 0,
        lobbyName: "m482kqx",
        lobbyPass: "hn4bx",
        channels: { blue: null, orange: null },
        channelId: TEXT,
        messageId: null,
        reports: { blue: 0, orange: 0 },
        change: 0,
        createdAt: Date.now(),
        endedAt: null,
        ...over,
    };
}

/* ----------------------------------------------------------
   Einstellungen
   ---------------------------------------------------------- */
function checkClean(client: BotClient): void {
    console.log("\n  — Einstellungen —");

    const guild = FakeGuild();
    const service = client.sixMansService;
    const base = DefaultSixSettings();

    check("Ab Werk fängt jeder bei 600 an", base.start === 600);
    check("Und das Ergebnis wird bestätigt", base.confirm);
    check("Alle drei Modi sind an", MODES.every((mode) => base.modes[mode]));
    check("Die Rangliste ist erst einmal zu", !base.board.open);

    const clean = service.CleanSettings(guild, { channelId: TEXT, categoryId: CATEGORY, start: 9999, k: 999, idleMinutes: 9999, voice: false }, base);

    check("Der Kanal kommt an", clean.channelId === TEXT);
    check("Die Kategorie auch", clean.categoryId === CATEGORY);
    check("Der Startwert wird gedeckelt", clean.start === MAX_START, String(clean.start));
    check("Der Ausschlag ebenfalls", clean.k === MAX_K, String(clean.k));
    check("Die Wartezeit ebenfalls", clean.idleMinutes === MAX_IDLE, String(clean.idleMinutes));
    check("Sprachkanäle lassen sich abstellen", clean.voice === false);

    const modes = service.CleanSettings(guild, { modes: { 2: false, 6: true } }, base);

    check("Ein Modus lässt sich abschalten", modes.modes[2] === false && modes.modes[6] === true);
    check("Und der ungenannte bleibt, wie er war", modes.modes[4] === base.modes[4]);

    const open = service.CleanSettings(guild, { board: { open: true } }, base);

    check("Die Rangliste lässt sich öffnen", open.board.open);

    const wrong = service.CleanSettings(guild, { channelId: VOICE, categoryId: TEXT }, base);

    check("Ein Sprachkanal taugt nicht als Kanal", wrong.channelId === null);
    check("Und ein Textkanal nicht als Kategorie", wrong.categoryId === null);

    const kept = service.CleanSettings(guild, { dm: false }, base);

    check("Was nicht mitkommt, bleibt stehen", kept.panel.doc.blocks.length === base.panel.doc.blocks.length && kept.start === base.start);
    check("Die ID des Panels gehört dem Bot", service.CleanSettings(guild, { panelMessageId: "123" }, { ...base, panelMessageId: "alt" }).panelMessageId === "alt");
    check("Die Adresse der Rangliste steht fest", BoardLink("https://dash.example", GUILD).endsWith(`/mans/${GUILD}`), BoardLink("https://dash.example", GUILD));
}

/* ----------------------------------------------------------
   Die Stufen
   ---------------------------------------------------------- */
function checkRanks(client: BotClient): void {
    console.log("\n  — Die Stufen —");

    check("Es gibt acht Stufen ab Werk", DEFAULT_RANKS.length === 8, String(DEFAULT_RANKS.length));
    check("Die erste fängt bei null an", DEFAULT_RANKS[0].min === 0);
    check("Sie steigen an", DEFAULT_RANKS.every((rank, index) => index === 0 || rank.min > DEFAULT_RANKS[index - 1].min));
    check(
        "Jede hat Namen, Zeichen und Farbe",
        DEFAULT_RANKS.every((rank) => rank.name.length > 2 && rank.emoji.length > 0 && /^#[0-9a-f]{6}$/i.test(rank.color))
    );
    check("Die Namen sind eigene, keine aus dem Spiel", !DEFAULT_RANKS.some((rank) => /bronze|silber|silver|gold|platin|diamant|champion|grand/i.test(rank.name)));

    const start = DefaultSixSettings().start;

    check("Wer anfängt, steht in der Mitte", RankOf(start).name === "Boost-Jäger", RankOf(start).name);
    check("Ganz unten greift die erste Stufe", RankOf(0).name === DEFAULT_RANKS[0].name);
    check("Ganz oben die letzte", RankOf(99_999).name === DEFAULT_RANKS[DEFAULT_RANKS.length - 1].name);
    check("Genau an der Grenze gilt schon die neue", RankOf(DEFAULT_RANKS[3].min).name === DEFAULT_RANKS[3].name);
    check("Einen Punkt darunter noch die alte", RankOf(DEFAULT_RANKS[3].min - 1).name === DEFAULT_RANKS[2].name);
    check("Der Name kommt mit Zeichen", RankName(start).startsWith(RankOf(start).emoji));

    console.log("\n  — Eigene Stufen —");

    const service = client.sixMansService;
    const own: IManRank[] = service.CleanRanks([
        { min: 900, name: "  Legende  ", emoji: "👑", color: "#FF00AA" },
        { min: 300, name: "Frischling", emoji: "", color: "kaputt" },
        { min: 600, name: "Mittelfeld", emoji: "⚽", color: "#00afff" },
        { min: 600, name: "Noch eine bei 600", emoji: "", color: "#000000" },
        { min: 100, name: "", emoji: "🙈", color: "#123456" },
    ], GUILD);

    check("Sie kommen sortiert zurück", own.map((rank) => rank.min).join(",") === "0,600,900", own.map((rank) => rank.min).join(","));
    check("Die unterste steht immer bei 0", own[0].min === 0 && own[0].name === "Frischling");
    check("Leerzeichen fallen weg", own[2].name === "Legende");
    check("Eine zweite Stufe auf derselben Grenze fällt weg", own.length === 3);
    check("Eine Stufe ohne Namen fällt weg", !own.some((rank) => rank.name === ""));
    check("Eine kaputte Farbe wird ersetzt", /^#[0-9a-f]{6}$/.test(own[0].color), own[0].color);
    check("Eine echte Farbe bleibt", own[2].color === "#ff00aa", own[2].color);
    check("Ohne Zeichen geht es auch", own[0].emoji === "" && RankName(0, own) === "Frischling");

    check("Die eigene Leiter greift", RankOf(650, own).name === "Mittelfeld", RankOf(650, own).name);
    check("Und ganz oben auch", RankOf(5000, own).name === "Legende");
    check("Nichts Brauchbares heißt: Vorgabe", service.CleanRanks([{ name: "" }], GUILD).length === 0 && service.CleanRanks("nein", GUILD).length === 0);
    check("Leer heißt Vorgabe", RankOf(600, []).name === RankOf(600).name);

    const many = service.CleanRanks(Array.from({ length: 30 }, (_, index) => ({ min: index * 50, name: `Stufe ${index}`, color: "#00afff" })), GUILD);

    check("Mehr als zwölf Stufen gehen nicht", many.length <= 12, String(many.length));

    const settings = { ...DefaultSixSettings(), ranks: own };

    check("Der Dienst nimmt die eigene Leiter", service.Ranks(settings)[0].name === "Frischling");
    check("Und ohne eigene die Vorgabe", service.Ranks(DefaultSixSettings())[0].name === DEFAULT_RANKS[0].name);
}

/* ----------------------------------------------------------
   Die Aufteilung
   ---------------------------------------------------------- */
function checkSplit(client: BotClient): void {
    console.log("\n  — Zwei Teams —");

    const service = client.sixMansService;

    for (const mode of MODES) {
        const values = Array.from({ length: mode }, (_, index) => 600 + index * 17);
        const split = service.Split(Waiting(values));

        check(`${MODE_LABELS[mode]}: zweimal ${TeamSize(mode)}`, split.blue.length === TeamSize(mode) && split.orange.length === TeamSize(mode));
        check(`${MODE_LABELS[mode]}: der Abstand ist so klein wie möglich`, split.gap === Smallest(values), `${split.gap} statt ${Smallest(values)}`);
        check(`${MODE_LABELS[mode]}: niemand steht doppelt`, new Set([...split.blue, ...split.orange].map((one) => one.userId)).size === mode);
    }

    const even = service.Split(Waiting([600, 600, 600, 600, 600, 600]));

    check("Bei gleicher MMR ist der Abstand null", even.gap === 0, String(even.gap));

    const hard = service.Split(Waiting([1000, 620, 610, 600, 590, 580]));

    check("Auch mit einem Ausreißer wird das Beste gesucht", hard.gap === Smallest([1000, 620, 610, 600, 590, 580]), String(hard.gap));
}

/* ----------------------------------------------------------
   Die Wertung
   ---------------------------------------------------------- */
function checkChange(client: BotClient): void {
    console.log("\n  — Was eine Runde bewegt —");

    const service = client.sixMansService;
    const k = 25;
    const even = service.Change(600, 600, 1, k);

    check("Bei gleich starken Teams ist es die Hälfte", even === Math.round(k / 2), String(even));

    const upset = service.Change(500, 700, 1, k);
    const expected = service.Change(700, 500, 1, k);

    check("Wer den Favoriten schlägt, bekommt mehr", upset > even, `${upset} > ${even}`);
    check("Der Favorit bekommt weniger", expected < even, `${expected} < ${even}`);
    check("Beide Seiten ergeben zusammen K", Math.abs(upset + expected - k) <= 1, `${upset} + ${expected}`);
    check("Es ist nie null", service.Change(0, 3000, 2, k) >= 1);
    check("Und nie mehr als K", service.Change(3000, 0, 2, k) <= k, String(service.Change(3000, 0, 2, k)));

    const lobby = LobbyName(129);

    check("Der Lobby-Name ist kurz und tippbar", /^m\d+[a-z0-9]{3}$/.test(lobby), lobby);
    check("Das Passwort hat fünf Zeichen", LobbyPass().length === 5);
    check("Ohne Zeichen, die man verwechselt", !/[ilo01]/.test(LobbyPass() + lobby.slice(-3)));
}

/* ----------------------------------------------------------
   Die Nachrichten
   ---------------------------------------------------------- */
async function checkViews(client: BotClient): Promise<void> {
    console.log("\n  — Nachrichten und Knöpfe —");

    const guild = FakeGuild();
    const settings = DefaultSixSettings();
    const queues = { 2: Waiting([640]), 4: [], 6: Waiting([648, 588]) } as Record<ManMode, ISixWaiting[]>;
    const panel = PanelValues({ guild, queues, modes: MODES, rounds: 128, players: 24, best: { name: "Lara", mmr: 762, mode: 6 } });

    check("Das Panel zählt alle Warteschlangen", Fill("{anzahl}", panel) === "3", Fill("{anzahl}", panel));
    check("Und jede einzeln", Fill("{anzahl.2}/{anzahl.4}/{anzahl.6}", panel) === "1/0/2");
    check("Frei bleibt, was fehlt", Fill("{frei.6}", panel) === "4");
    check("Alle Modi stehen untereinander", Fill("{warteschlange}", panel).includes("**2 Mans**") && Fill("{warteschlange}", panel).includes("**6 Mans**"));
    check("Mit Stufe je Wartendem", Fill("{warteschlange.2}", panel).includes(RankOf(640).name));
    check("Ohne Warteschlange steht ein Satz da", Fill("{warteschlange.4}", panel).includes("Noch niemand"));
    check("Der Beste steht mit Modus da", Fill("{bester}", panel).includes("Lara") && Fill("{bester}", panel).includes("6 Mans"));
    check("Die laufenden Modi stehen drin", Fill("{modi}", panel) === "2 Mans, 4 Mans, 6 Mans");

    const single = PanelValues({ guild, queues, modes: [6], rounds: 0, players: 0, best: null });

    check("Nur ein Modus: nur dieser Block", !Fill("{warteschlange}", single).includes("**2 Mans**"));
    check("Ohne Bestenliste steht das auch da", Fill("{bester}", single) === "noch niemand");

    const round = FakeRound();
    const values = RoundValues(guild, round);

    check("Die Runde kennt ihren Modus", Fill("{modus} · {modus.spiel}", values) === "6 Mans · 3v3");
    check("Beide Teams stehen da", Fill("{blau}", values).includes(round.blue[0]) && Fill("{orange}", values).includes(round.orange[0]));
    check("Mit Schnitt je Team", Fill("{blau.mmr}", values) === "650" && Fill("{orange.mmr}", values) === "550");
    check("Und mit Stufe je Team", Fill("{blau.rang}", values) === RankName(650) && Fill("{orange.rang}", values) === RankName(550));
    check("Lobby und Passwort stehen drin", Fill("{lobby}/{passwort}", values) === "m482kqx/hn4bx");
    check("Ohne Sprachkanäle bleibt die Stelle leer", Fill("{kanal.blau}", values) === "");

    const small = RoundValues(guild, FakeRound({ mode: 2, blue: ["1"], orange: ["2"], names: { 1: "A", 2: "B" }, before: { 1: 610, 2: 590 } }));

    check("2 Mans heißt 1v1", Fill("{modus} · {modus.spiel}", small) === "2 Mans · 1v1");
    check("Und hat je einen Spieler", Fill("{spieler}", small) === "2");

    const done = RoundValues(guild, FakeRound({ status: "done", winner: 1, change: 24 }));

    check("Der Sieger steht fest", Fill("{sieger.team}", done).includes("Blau"));
    check("Und der Verlierer auch", Fill("{verlierer}", done).includes(FakeRound().orange[0]));
    check("Die Veränderung steht da", Fill("{veraenderung}", done) === "±24");

    const card = JSON.stringify((await SixRender(client, settings.panel, panel, PanelRow(MODES, () => false))).components[0].toJSON());

    check("Unter dem Panel steht je Modus ein Knopf", MODES.every((mode) => card.includes(`${SIXMANS_PREFIX}:join:${mode}`)));
    check("Dazu einer zum Verlassen", card.includes(`${SIXMANS_PREFIX}:leave`));

    const full = JSON.stringify((await SixRender(client, settings.panel, panel, PanelRow([6], (mode) => mode === 6))).components[0].toJSON());

    check("Ein voller Modus ist gesperrt", full.includes('"disabled":true'));
    check("Und ein abgeschalteter fehlt ganz", !full.includes(`${SIXMANS_PREFIX}:join:2`));

    const view = JSON.stringify((await SixRender(client, settings.round, values, [RoundRow(129)])).components[0].toJSON());

    check("Unter der Runde stehen drei Knöpfe", view.includes("6m:win:129:1") && view.includes("6m:win:129:2") && view.includes("6m:cancel:129"));

    const result = JSON.stringify((await SixRender(client, settings.result, done)).components[0].toJSON());

    check("Das Ergebnis nennt den Sieger", result.includes("Blau"));
    check("Und hat keine Knöpfe mehr", !result.includes("custom_id"));

    const dm = await SixRender(client, { kind: "text", content: "{modus} #{runde}: {lobby} / {passwort}", embed: null, doc: { blocks: [] } }, values);

    check("Als reiner Text kommt es auch an", dm.content === "6 Mans #129: m482kqx / hn4bx", dm.content);
}

/* ----------------------------------------------------------
   Bot und Dashboard
   ---------------------------------------------------------- */
async function checkLists(): Promise<void> {
    console.log("\n  — Dieselben Platzhalter im Dashboard —");

    const { pathToFileURL } = await import("node:url");
    const file = path.join(process.cwd(), "src", "dashboard", "client", "constants", "Placeholders.ts");

    if (!existsSync(file)) return check("Die Liste des Dashboards ist da", false, file);

    const loaded = (await import(pathToFileURL(file).href)) as Record<string, { key: string }[] | undefined>;
    const pairs: [string, readonly string[], string][] = [
        ["Panel", PANEL_KEYS, "SIX_PANEL_PLACEHOLDERS"],
        ["Runde", ROUND_KEYS, "SIX_ROUND_PLACEHOLDERS"],
        ["Ergebnis", RESULT_KEYS, "SIX_RESULT_PLACEHOLDERS"],
    ];

    for (const [label, keys, name] of pairs) {
        const list = loaded[name] ?? [];
        const client = list.map((entry) => entry.key);
        const missing = keys.filter((key) => !client.includes(key));
        const extra = client.filter((key) => !keys.includes(key));

        check(`${label}: ${keys.length} Platzhalter, im Dashboard dieselben`, missing.length === 0 && extra.length === 0, `fehlt: ${missing.join(", ")} | zu viel: ${extra.join(", ")}`);
    }
}

/** W-0137: ein Server-Wert für die Grenzen von rl-6mans. */
function Limits(values: Record<string, number>) {
    return { module: "rl-6mans", guildId: GUILD, status: null, notice: null, linkMode: null, values, updatedAt: null };
}

/** W-0137: Stufen und laufende Runden sind Grenzen von RL Nexus, je Server änderbar. Läuft zuletzt: ersetzt Dienst-Methoden. */
async function checkW137(client: BotClient): Promise<void> {
    console.log("\n  — W-0137: Grenzen —");

    const service = client.sixMansService;
    const guild = FakeGuild();
    const many = Array.from({ length: 30 }, (_, index) => ({ min: index * 50, name: `Stufe ${index}`, color: "#00afff" }));
    const settings = { ...DefaultSixSettings(), modes: Object.fromEntries(MODES.map((mode) => [mode, true])) as Record<ManMode, boolean> };
    const players = Waiting([600, 600, 600, 600, 600, 600]);
    const member = (index: number) => ({ id: players[index].userId, displayName: players[index].name, guild }) as unknown as GuildMember;
    const started: ManMode[] = [];
    let running = Array.from({ length: 10 }, (_, index) => FakeRound({ id: 200 + index, blue: [], orange: [] }));

    check("Standard: 12 Stufen, 10 laufende Runden", JSON.stringify(SixMansLimits(GUILD)) === JSON.stringify({ ranks: 12, running: 10 }), JSON.stringify(SixMansLimits(GUILD)));
    SetFlags([], [], [], [Limits({ maxRanks: 20 })]);
    check("Server-Wert 20 lässt 20 Stufen", service.CleanRanks(many, GUILD).length === 20, String(service.CleanRanks(many, GUILD).length));
    SetFlags([], [], []);

    Object.defineProperty(client.databaseService, "Ready", { get: () => true, configurable: true });
    client.sixRounds.Running = async () => running;
    client.sixPlayers.Ensure = (async () => ({ mmr: 600 })) as unknown as typeof client.sixPlayers.Ensure;
    service.Settings = async () => settings;
    service.Panel = async () => undefined;
    (service as unknown as { Start: (guild: Guild, settings: unknown, mode: ManMode) => Promise<ISixRound> }).Start = async (_guild, _settings, mode) => {
        started.push(mode);

        return FakeRound({ mode });
    };

    for (let index = 0; index < 5; index++) await service.Join(member(index), 6);

    let hit: unknown = null;

    try {
        await service.Join(member(5), 6);
    } catch (error) {
        hit = error;
    }

    const limit = hit instanceof SixMansError ? hit.limit : undefined;

    check("Bei 10 laufenden Runden scheitert der Start der 11. (maxRunning)", limit?.key === "maxRunning" && limit.asked === 11 && limit.allowed === 10, JSON.stringify(limit));
    check("Die Meldung sagt, dass sie warten", hit instanceof Error && hit.message.includes("Warteschlange"), hit instanceof Error ? hit.message : String(hit));
    check("Die sechs bleiben in der Warteschlange", service.Queue(GUILD, 6).length === 6 && started.length === 0, `${service.Queue(GUILD, 6).length}/${started.length}`);

    running = running.slice(1);

    const resumed = await service.Resume(guild);

    check("Ist eine Runde fertig, geht es von selbst los", resumed.length === 1 && started.join(",") === "6" && service.Queue(GUILD, 6).length === 0, `${resumed.length}/${started.join(",")}`);

    // W-0137 Review: Runden, die seit Stunden „laufen“, weil nie jemand gemeldet hat, sperren den Server nicht.
    running = Array.from({ length: 10 }, (_, index) => FakeRound({ id: 300 + index, blue: [], orange: [], createdAt: Date.now() - 7 * 3_600_000 }));

    for (let index = 0; index < 6; index++) await service.Join(member(index), 6);

    check("Zehn liegengebliebene Runden (7 h alt) zählen nicht: es geht los", started.join(",") === "6,6" && service.Queue(GUILD, 6).length === 0, started.join(","));

    // W-0137 Review: Endet während eines Beitritts eine Runde, startet Resume() die Wartenden - der Beitritt holt sie nicht zurück.
    running = Array.from({ length: 10 }, (_, index) => FakeRound({ id: 400 + index, blue: [], orange: [] }));
    await service.Join(member(0), 2);
    await service.Join(member(1), 2).catch(() => undefined);

    const ensure = client.sixPlayers.Ensure;
    let raced: unknown = null;

    client.sixPlayers.Ensure = (async (...args: Parameters<typeof ensure>) => {
        if (args[2] === players[2].userId) {
            running = running.slice(1);
            await service.Resume(guild);
        }

        return { mmr: 600 };
    }) as typeof ensure;

    try {
        await service.Join(member(2), 2);
    } catch (error) {
        raced = error;
    }

    client.sixPlayers.Ensure = ensure;
    check(
        "Beitritt während Resume: die Gestarteten stehen nicht wieder an, nur der Neue wartet",
        raced === null && started.join(",") === "6,6,2" && service.Queue(GUILD, 2).map((entry) => entry.userId).join() === players[2].userId,
        `${String(raced)} | ${started.join(",")} | ${service.Queue(GUILD, 2).map((entry) => entry.name).join()}`
    );

    const route = new DashboardApiSixMans(client) as unknown as { Read(access: unknown, query: unknown): Promise<Record<string, any>> };

    service.Rounds = (async () => ({ rows: [], total: 0 })) as unknown as typeof service.Rounds;
    service.Running = (async () => []) as unknown as typeof service.Running;
    service.Boards = (async () => ({})) as unknown as typeof service.Boards;
    SetFlags([], [], [], [Limits({ maxRanks: 20, maxRunning: 15 })]);

    const read = await route.Read({ guild: { id: GUILD, name: "Dev Server", channels: { cache: new Map() }, roles: { cache: new Map() }, emojis: { cache: new Map() }, members: { cache: new Map() } } }, {});

    check("Route gibt den Server-Wert an die Seite", read.limits?.ranks === 20 && read.limits?.running === 15, JSON.stringify(read.limits));
    SetFlags([], [], []);
}

async function main(): Promise<void> {
    console.log("\n🎮 2, 4 & 6 Mans\n");

    const client = new BotClient();

    checkClean(client);
    checkRanks(client);
    checkSplit(client);
    checkChange(client);
    await checkViews(client);
    await checkLists();
    await checkW137(client);

    console.log(failures === 0 ? "\n✅ Alle Prüfungen bestanden.\n" : `\n❌ ${failures} Prüfung(en) fehlgeschlagen.\n`);

    process.exit(failures > 0 ? 1 : 0);
}

void main();
