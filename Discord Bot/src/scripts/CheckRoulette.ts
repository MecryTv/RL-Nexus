/**
 * Prüft Rocket Roulette ohne Discord: Einstellungen, Auslosung, Tabellen,
 * Bilder, Nachrichten und den Ablauf eines Abends (W-0087).
 *
 *   npm run check:roulette
 *
 * Wie check:sixmans ohne Test-Framework. Was in die Datenbank geht, hängt an
 * einer erfundenen Guild-ID und wird am Ende wieder entfernt.
 */
process.env.CLIENT_SECRET ||= "check-secret";
process.env.DEV_CLIENT_SECRET ||= "check-secret";

import { ChannelType, Guild, GuildBasedChannel, Role } from "discord.js";
import BotClient from "../client/BotClient";
import { DefaultRouletteSettings, LobbyCode, LobbyLabel } from "../constants/RocketRoulette";
import { RouletteError } from "../services/RouletteService";
import { Draw, IDrawInput, IDrawResult, PairKey, WithFiller } from "../services/roulette/Draw";

const GUILD = "90071992547409971";
const TEXT = "90071992547409972";
const TEXT2 = "90071992547409973";
const NEWS = "90071992547409974";
const VOICE1 = "90071992547409975";
const VOICE2 = "90071992547409976";
const VOICE3 = "90071992547409977";
const CATEGORY = "90071992547409978";

let failures = 0;

function check(name: string, passed: boolean, detail = ""): void {
    if (!passed) failures++;

    console.log(`  ${passed ? "ok  " : "FAIL"} ${name}${passed || !detail ? "" : `  → ${detail}`}`);
}

function Throws(run: () => unknown, type: new (...args: never[]) => Error): string | null {
    try {
        run();
    } catch (error) {
        return error instanceof type ? error.message : null;
    }

    return null;
}

function FakeGuild(): Guild {
    const channel = (id: string, type: ChannelType) =>
        ({ id, type, name: `kanal-${id.slice(-2)}`, isTextBased: () => type === ChannelType.GuildText || type === ChannelType.GuildAnnouncement || type === ChannelType.GuildVoice, isThread: () => false }) as unknown as GuildBasedChannel;

    return {
        id: GUILD,
        name: "Dev Server",
        channels: {
            cache: new Map([
                [TEXT, channel(TEXT, ChannelType.GuildText)],
                [TEXT2, channel(TEXT2, ChannelType.GuildText)],
                [NEWS, channel(NEWS, ChannelType.GuildAnnouncement)],
                [VOICE1, channel(VOICE1, ChannelType.GuildVoice)],
                [VOICE2, channel(VOICE2, ChannelType.GuildVoice)],
                [VOICE3, channel(VOICE3, ChannelType.GuildVoice)],
                [CATEGORY, channel(CATEGORY, ChannelType.GuildCategory)],
            ]),
        },
        roles: { cache: new Map([[GUILD, { id: GUILD, name: "@everyone" } as Role]]) },
        iconURL: () => null,
    } as unknown as Guild;
}

function checkSettings(client: BotClient): void {
    console.log("  — Einstellungen —");

    const defaults = DefaultRouletteSettings();
    const service = client.rouletteService;
    const guild = FakeGuild();

    check("Vorgaben", defaults.lobbyName === "Lobby{teams}" && defaults.password.mode === "fixed" && defaults.password.value === "testo" && defaults.teamSize === 3 && defaults.teamChannels === "auto");
    check("Lobby-Name aus Teamnummern", LobbyLabel("Lobby{teams}", [1, 2]) === "Lobby12" && LobbyLabel("Lobby{teams}", [11, 12]) === "Lobby1112" && LobbyLabel("Roulette", [3, 4]) === "Roulette34");
    check("Code ohne verwechselbare Zeichen", /^[abcdefghjkmnpqrstuvwxyz23456789]{200}$/.test(LobbyCode(200)));

    const full = service.Clean(guild, { infoChannelId: TEXT, controlChannelId: TEXT2, waitingRoomId: VOICE1, mainVoiceId: VOICE2, categoryId: CATEGORY }, defaults);

    check("Clean: Kanäle der richtigen Art bleiben", full.infoChannelId === TEXT && full.controlChannelId === TEXT2 && full.waitingRoomId === VOICE1 && full.mainVoiceId === VOICE2 && full.categoryId === CATEGORY);
    check("Clean: Textkanal als Warteraum fällt weg", service.Clean(guild, { waitingRoomId: TEXT }, defaults).waitingRoomId === null);
    check("Clean: Ankündigungskanal als Info-Kanal geht nicht", service.Clean(guild, { infoChannelId: NEWS }, defaults).infoChannelId === null);
    check("Clean: Sprachkanal als Info-Kanal geht nicht", service.Clean(guild, { infoChannelId: VOICE1 }, defaults).infoChannelId === null);
    check("Clean: Teamgröße 4 wird 3", service.Clean(guild, { teamSize: 4 }, defaults).teamSize === 3);
    check("Clean: Teamgröße 2 bleibt", service.Clean(guild, { teamSize: 2 }, defaults).teamSize === 2);
    check("Clean: nichts angegeben, alles wie vorher", JSON.stringify(service.Clean(guild, {}, full)) === JSON.stringify(full));

    const badPassword = Throws(() => service.Clean(guild, { password: { mode: "fixed", value: "te st!" } }, defaults), RouletteError);

    check("Clean: festes Passwort mit Leer- oder Sonderzeichen wird abgelehnt", badPassword !== null && badPassword.includes("Buchstaben und Ziffern"), String(badPassword));
    check("Clean: festes Passwort bleibt wie getippt (außen ohne Leerzeichen)", service.Clean(guild, { password: { mode: "fixed", value: " TeStO1 " } }, defaults).password.value === "TeStO1");
    check("Clean: leeres festes Passwort wird abgelehnt", Throws(() => service.Clean(guild, { password: { mode: "fixed", value: "  " } }, defaults), RouletteError) !== null);
    check("Clean: zufälliges Passwort behält den festen Wert", service.Clean(guild, { password: { mode: "random" } }, defaults).password.mode === "random");

    const fixed = service.Clean(guild, { teamChannels: "fixed", fixedChannelIds: [VOICE1, VOICE3, TEXT, VOICE1] }, defaults);

    check("Clean: feste Kanäle nur Sprachkanäle, ohne Doppelte", fixed.teamChannels === "fixed" && fixed.fixedChannelIds.join() === `${VOICE1},${VOICE3}`, fixed.fixedChannelIds.join());
    check("Clean: höchstens 40 feste Kanäle", service.Clean(guild, { fixedChannelIds: Array.from({ length: 50 }, () => VOICE1) }, defaults).fixedChannelIds.length <= 40);
    check("Clean: Lobby-Name höchstens 20 Zeichen", service.Clean(guild, { lobbyName: "x".repeat(40) }, defaults).lobbyName.length <= 20);
    check("Clean: leerer Lobby-Name wird die Vorgabe", service.Clean(guild, { lobbyName: "  " }, defaults).lobbyName === "Lobby{teams}");
}

/** Wiederholbarer Zufall (mulberry32), damit die Auslosung prüfbar bleibt. */
function Seeded(seed: number): () => number {
    let state = seed >>> 0;

    return () => {
        state = (state + 0x6d2b79f5) >>> 0;

        let t = state;

        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function Players(count: number, prefix = "p"): string[] {
    return Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`);
}

function Input(players: string[], patch: Partial<IDrawInput> = {}): IDrawInput {
    return { players, moderators: ["m1", "m2", "m3"], sitOutLast: [], wishes: [], history: {}, teamSize: 3, maxLobbies: null, random: Seeded(7), ...patch };
}

function Everyone(result: IDrawResult): string[] {
    return [...result.lobbies.flatMap((lobby) => [...lobby.teams[0], ...lobby.teams[1]]), ...result.sitOut];
}

function TeamOf(result: IDrawResult, id: string): string[] | undefined {
    return result.lobbies.flatMap((lobby) => lobby.teams).find((team) => team.includes(id));
}

function checkDraw(): void {
    console.log("\n  — Auslosung —");

    // restTable: Rest nach Teamgröße 3 laut Spec.
    const expected: Record<number, [number, number | null]> = { 18: [3, null], 19: [4, 1], 20: [4, null], 21: [4, 2], 22: [4, null], 23: [4, 3] };
    const table: string[] = [];

    for (const [count, [lobbies, filler]] of Object.entries(expected)) {
        const result = Draw(Input(Players(Number(count))));
        const sizes = result.lobbies.map((lobby) => `${lobby.teams[0].length}v${lobby.teams[1].length}`).join(",");

        if (result.lobbies.length !== lobbies || (result.needsFiller?.size ?? null) !== filler || Everyone(result).length !== Number(count)) table.push(`${count}: ${sizes} filler=${result.needsFiller?.size}`);
    }

    check("Rest-Tabelle für 18 bis 23 Spieler", table.length === 0, table.join(" | "));

    const last22 = Draw(Input(Players(22))).lobbies[3];

    check("  22 Spieler: die vierte Lobby ist ein 2v2", last22.size === 2 && last22.teams[0].length === 2 && last22.teams[1].length === 2);

    const priority = ["p1", "p2", "p3"];
    let satOut = 0;

    for (let seed = 1; seed <= 40; seed++) {
        const result = WithFiller(Draw(Input(Players(19), { sitOutLast: priority, random: Seeded(seed) })), null);

        satOut += result.sitOut.filter((id) => priority.includes(id)).length;
    }

    check("Aussetzer zuerst: wer zuletzt aussetzte, setzt nicht wieder aus", satOut === 0, `${satOut} Mal`);

    let apart = 0;

    for (let seed = 1; seed <= 100; seed++) {
        const result = Draw(Input(Players(18), { wishes: [{ a: "p4", b: "p9", once: false }], random: Seeded(seed) }));

        if (!TeamOf(result, "p4")?.includes("p9")) apart++;
    }

    check("Wunsch: beide immer im selben Team", apart === 0, `${apart} von 100 getrennt`);

    const oneVsOne = Draw(Input(Players(4), { teamSize: 1, wishes: [{ a: "p1", b: "p2", once: false }] }));

    check("Wunsch in 1v1 geht nicht: steht in unmetWishes, Teams vollständig", oneVsOne.unmetWishes.length === 1 && oneVsOne.lobbies.every((lobby) => lobby.teams[0].length === 1 && lobby.teams[1].length === 1));

    const repeats = (trials: number) => {
        const history: Record<string, number> = {};
        const random = Seeded(99);
        let total = 0;

        for (let round = 0; round < 50; round++) {
            const result = Draw(Input(Players(18), { history, random, trials }));

            for (const team of result.lobbies.flatMap((lobby) => lobby.teams)) {
                for (let i = 0; i < team.length; i++) {
                    for (let j = i + 1; j < team.length; j++) {
                        const key = PairKey(team[i], team[j]);

                        total += history[key] ?? 0;
                        history[key] = (history[key] ?? 0) + 1;
                    }
                }
            }
        }

        return total;
    };
    const scored = repeats(64);
    const plain = repeats(1);

    check("Seltener dieselben Mitspieler als reiner Zufall", scored < plain, `${scored} gegen ${plain}`);
    check("  PairKey ist sortiert", PairKey("b", "a") === PairKey("a", "b"));

    const hosts = Draw(Input(Players(18), { moderators: ["m1", "m2"] }));

    check(
        "Hosts: erst die Moderatoren, je einer eine Lobby, dann ein Spieler der Lobby",
        hosts.lobbies[0].host === "m1" && hosts.lobbies[1].host === "m2" && hosts.lobbies[0].hostIsModerator && !hosts.lobbies[2].hostIsModerator && [...hosts.lobbies[2].teams[0], ...hosts.lobbies[2].teams[1]].includes(hosts.lobbies[2].host),
        hosts.lobbies.map((lobby) => lobby.host).join(",")
    );

    const open = Draw(Input(Players(21), { moderators: ["m1", "m2", "m3", "m4"] }));
    const filled = WithFiller(open, "m1");
    const fillerLobby = filled.lobbies[open.needsFiller!.lobbyIndex];

    check(
        "Einspringer: spielt und hostet seine Lobby, seine alte Lobby bekommt einen Spieler als Host",
        filled.needsFiller === null && fillerLobby.filler === "m1" && fillerLobby.host === "m1" && fillerLobby.teams[1].includes("m1") && fillerLobby.teams[0].length === fillerLobby.teams[1].length && filled.lobbies[0].host !== "m1" && !filled.lobbies[0].hostIsModerator
    );

    const without = WithFiller(Draw(Input(Players(21))), null);
    const smaller = without.lobbies[3];

    check("Ohne Einspringer: einer setzt aus, die Lobby wird kleiner", without.needsFiller === null && without.sitOut.length === 1 && smaller.teams[0].length === 1 && smaller.teams[1].length === 1);
    check("  ohne Einspringer bei 19: die 1v1-Lobby fällt weg", WithFiller(Draw(Input(Players(19))), null).lobbies.length === 3);

    const capped = Draw(Input(Players(18), { maxLobbies: 2 }));

    check("Feste Kanäle: höchstens so viele Lobbys, der Rest setzt aus", capped.lobbies.length === 2 && capped.sitOut.length === 6 && Everyone(capped).length === 18);
    check("Teamnummern laufen je Runde ab 1", Draw(Input(Players(18))).lobbies.every((lobby, index) => lobby.teamNumbers[0] === index * 2 + 1 && lobby.teamNumbers[1] === index * 2 + 2));
    check("Niemand doppelt", new Set(Everyone(Draw(Input(Players(23))))).size === 23);
}

async function checkDatabase(client: BotClient): Promise<void> {
    console.log("\n  — Datenbank —");

    const evenings = client.rouletteEvenings;
    const rounds = client.rouletteRounds;
    const now = Date.now();
    const day = 24 * 3_600_000;

    const evening = await evenings.Create({ guildId: GUILD, startsAt: now + 60_000, createdBy: "m1" });

    check("Abend anlegen, als aktiv wiederfinden", (await evenings.ActiveOf(GUILD))?.id === evening.id && evening.status === "planned" && evening.round === 0);

    let second: string | null = null;

    try {
        await evenings.Create({ guildId: GUILD, startsAt: now, createdBy: "m1" });
    } catch (error) {
        second = error instanceof RouletteError ? error.message : String(error);
    }

    check("Nur ein aktiver Abend je Server", second !== null && second.includes("schon"), String(second));
    check("Fällig: noch nicht vor der Startzeit", !(await evenings.Due(now)).some((entry) => entry.id === evening.id));
    check("Fällig: ab der Startzeit", (await evenings.Due(now + 120_000)).some((entry) => entry.id === evening.id));

    const running = await evenings.Mutate(evening.id, () => ({ status: "running", round: 1, sitOut: ["p9"], wishes: [{ a: "p1", b: "p2", once: true }], history: { "p1|p2": 2 }, participants: { p1: { name: "Nova", rounds: 1 } } }));

    check("Mutate schreibt Zustand und JSON", running?.status === "running" && running.sitOut.join() === "p9" && running.wishes[0].once && running.history["p1|p2"] === 2 && running.participants.p1.name === "Nova");
    check("  laufende Abende sind nicht fällig", !(await evenings.Due(now + 120_000)).some((entry) => entry.id === evening.id));

    let rolledBack = false;

    try {
        await evenings.Mutate(evening.id, () => {
            throw new RouletteError("abgelehnt");
        });
    } catch (error) {
        rolledBack = error instanceof RouletteError;
    }

    check("Mutate: ein Fehler lässt den Abend, wie er war", rolledBack && (await evenings.Get(evening.id))?.round === 1);

    const lobbies = [
        { teams: [["p1", "p2", "p3"], ["p4", "p5", "p6"]] as [string[], string[]], teamNumbers: [1, 2] as [number, number], size: 3 as const, host: "m1", hostIsModerator: true, filler: null, name: "Lobby12", password: "testo", channels: ["11", "12"] as [string, string], cards: null, openedAt: null, names: { p1: "Nova" } },
    ];
    const round = await rounds.Create({ eveningId: evening.id, guildId: GUILD, number: 1, lobbies });

    check("Runde mit Lobbys kommt unverändert zurück", JSON.stringify((await rounds.Current(evening.id))?.lobbies) === JSON.stringify(lobbies) && round.status === "drawing");

    const done = await rounds.Mutate(round.id, () => ({ status: "ended", endedAt: now }));

    check("Runde beenden", done?.status === "ended" && (await rounds.List(evening.id)).length === 1);

    await evenings.Mutate(evening.id, () => ({ status: "ended", endedAt: now - 31 * day }));

    const recent = await evenings.Create({ guildId: GUILD, startsAt: now, createdBy: "m1" });

    await evenings.Mutate(recent.id, () => ({ status: "ended", endedAt: now - 29 * day }));

    const pruned = await evenings.Prune(now - 30 * day);

    check("Aufräumen: älter als 30 Tage weg, jünger bleibt", pruned >= 1 && (await evenings.Get(evening.id)) === null && (await evenings.Get(recent.id)) !== null && (await rounds.List(evening.id)).length === 0);
}

async function cleanup(client: BotClient): Promise<void> {
    await client.databaseService.Write("DELETE FROM roulette_rounds WHERE guild_id = ?", [GUILD]);
    await client.databaseService.Write("DELETE FROM roulette_evenings WHERE guild_id = ?", [GUILD]);
    await client.databaseService.Write("DELETE FROM module_settings WHERE guild_id = ?", [GUILD]);
    client.rouletteEvenings.Forget();
    client.rouletteRounds.Forget();
}

async function main(): Promise<void> {
    console.log("\n🎰 Rocket Roulette\n");

    const client = new BotClient();

    checkSettings(client);
    checkDraw();

    await client.configService.Initialize();

    if (await client.databaseService.Connect()) {
        try {
            await checkDatabase(client);
        } finally {
            await cleanup(client).catch((error) => check("Aufräumen lief durch", false, String(error)));
            await client.databaseService.Close();
        }
    } else {
        console.log("\n  — Datenbank —\n  übersprungen: keine Verbindung");
    }

    console.log(failures === 0 ? "\n✅ Alle Prüfungen bestanden.\n" : `\n❌ ${failures} Prüfung(en) fehlgeschlagen.\n`);

    process.exit(failures > 0 ? 1 : 0);
}

void main();
