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

import { ButtonInteraction, ChannelType, Guild, GuildBasedChannel, GuildMember, Role } from "discord.js";
import BotClient from "../client/BotClient";
import { DefaultRouletteSettings, LobbyCode, LobbyLabel, StartTime } from "../constants/RocketRoulette";
import { ZonedDate } from "../services/RunnableService";
import RouletteService, { IRouletteActor, RouletteError } from "../services/RouletteService";
import { Draw, IDrawInput, IDrawResult, PairKey, WithFiller } from "../services/roulette/Draw";
import { loadImage } from "@napi-rs/canvas";
import { IRouletteEvening, IRouletteLobby, IRouletteRound, IRouletteSettings } from "../interfaces/services/roulette/IRoulette";
import {
    AnnouncementAlt,
    ControlAlt,
    IAnnounceView,
    IControlView,
    LobbyCardAlt,
    OpenBannerAlt,
    RenderAnnouncement,
    RenderControl,
    RenderLobbyCard,
    RenderOpenBanner,
    RenderRound,
    RenderSummary,
    RoundAlt,
    RoundPages,
    SummaryAlt,
    SummaryPages,
} from "../builder/RouletteImages";
import { AnnouncementMessage, ControlMessage, FillRequestMessage, HowToMessage, LobbyMessage, OpenPingMessage, ReadRouletteId, RoundMessages, RouletteId, SummaryMessages, WishView } from "../builder/RouletteView";

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

function checkStartTime(): void {
    console.log("\n  — Startzeit —");

    const at = (year: number, month: number, day: number, hours: number) => ZonedDate(year, month, day, hours, 0).getTime();

    check("Ohne Datum, Zeit kommt noch: heute", StartTime("20:00", null, at(2026, 11, 12, 18)) === at(2026, 11, 12, 20));
    check("Ohne Datum, Zeit ist vorbei: morgen", StartTime("20:00", null, at(2026, 11, 12, 21)) === at(2026, 11, 13, 20));
    check("Mit Datum: 14.11. 20:00 deutscher Zeit", StartTime("20:00", "14.11.2026", at(2026, 11, 12, 18)) === Date.UTC(2026, 10, 14, 19, 0));
    check("Über die Zeitumstellung: 28.03.2027 20:00 ist Sommerzeit", StartTime("20:00", "28.03.2027", at(2027, 3, 27, 12)) === Date.UTC(2027, 2, 28, 18, 0));
    check("Unsinnige Zeit: null", StartTime("25:00", null, at(2026, 11, 12, 18)) === null && StartTime("abends", null, at(2026, 11, 12, 18)) === null);
    check("Datum in der Vergangenheit: null", StartTime("20:00", "01.11.2026", at(2026, 11, 12, 18)) === null);
    check("Einstellige Stunde geht auch", StartTime("9:30", "14.11.2026", at(2026, 11, 12, 18)) === ZonedDate(2026, 11, 14, 9, 30).getTime());
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

function SampleLobby(index: number, size: 1 | 2 | 3 = 3): IRouletteLobby {
    const a = Players(size, `a${index}-`);
    const b = Players(size, `b${index}-`);
    const names = Object.fromEntries([...a, ...b].map((id) => [id, `Spieler ${id}`]));

    return { teams: [a, b], teamNumbers: [index * 2 + 1, index * 2 + 2], size, host: index === 0 ? "m1" : a[0], hostIsModerator: index === 0, filler: null, name: `Lobby${index * 2 + 1}${index * 2 + 2}`, password: "testo", channels: null, cards: null, openedAt: index === 0 ? Date.now() : null, names: { ...names, m1: "Kim" } };
}

function SampleRound(lobbies: number): IRouletteRound {
    return { id: 1, eveningId: 1, guildId: GUILD, number: 2, status: "running", createdAt: Date.now(), endedAt: null, lobbies: Array.from({ length: lobbies }, (_, index) => SampleLobby(index)) };
}

async function Width(buffer: Buffer): Promise<number> {
    return buffer.subarray(0, 8).toString("hex") === "89504e470d0a1a0a" ? (await loadImage(buffer)).width : -1;
}

async function checkImages(): Promise<void> {
    console.log("\n  — Bilder —");

    const avatars = [{ id: "a1", name: "Nova", url: "http://127.0.0.1:9/kaputt.png" }, { id: "a2", name: "Lukas", url: null }];
    const announce: IAnnounceView = { status: "planned", startsAt: Date.now() + 3_600_000, waiting: { count: 17, avatars }, moderators: avatars, waitingRoom: "Warteraum", mainVoice: "Roulette-Lounge", teamSize: 3, lobbiesAbout: 3, round: 0 };
    const round = SampleRound(3);
    const lobby = round.lobbies[0];
    const control: IControlView = {
        status: "running",
        startsAt: Date.now(),
        round: 1,
        inLobbies: 18,
        waiting: 2,
        sitOut: 0,
        lobbies: round.lobbies.map((entry) => ({ name: entry.name, host: { id: entry.host, name: entry.names[entry.host] ?? entry.host, url: null }, hostIsModerator: entry.hostIsModerator, filler: false, openedAt: entry.openedAt })),
        wishes: [{ a: avatars[0], b: avatars[1], once: false }],
        warnings: ["Lobby34 wartet seit 4 Minuten auf Lukas."],
    };
    const evening: IRouletteEvening = { id: 1, guildId: GUILD, status: "ended", startsAt: Date.now() - 9_000_000, createdBy: "m1", createdAt: Date.now() - 9_000_000, endedAt: Date.now(), announce: null, control: null, round: 7, sitOut: [], wishes: [], history: {}, participants: { "a0-1": { name: "Nova", rounds: 7 }, "a0-2": { name: "Lukas", rounds: 5 } } };
    const rounds = Array.from({ length: 7 }, (_, index) => ({ ...SampleRound(2), id: index + 1, number: index + 1 }));

    const widths = [
        await Width(await RenderAnnouncement(announce)),
        await Width(await RenderRound(round, 0)),
        await Width(await RenderLobbyCard(lobby, 0, false)),
        await Width(await RenderLobbyCard(lobby, 1, true)),
        await Width(await RenderOpenBanner(lobby)),
        await Width(await RenderControl(control)),
        await Width(await RenderSummary(evening, rounds, 0)),
    ];

    check("Jedes Bild ist ein PNG mit 1000 px Breite (auch mit kaputtem Profilbild)", widths.every((width) => width === 1000), widths.join(","));
    check("Rundenkarte: ab sieben Lobbys ein zweites Bild", RoundPages(SampleRound(6)) === 1 && RoundPages(SampleRound(7)) === 2);
    check("Übersicht: höchstens drei Runden je Bild", SummaryPages(rounds) === 3 && SummaryPages(rounds.slice(0, 3)) === 1);

    const cardAlt = LobbyCardAlt(lobby, 0, false);
    const roundAlt = RoundAlt(round, 0);

    check("Alt-Text Lobby-Karte: Name, Passwort, Host, Teams", cardAlt.includes("Lobby12") && cardAlt.includes("testo") && cardAlt.includes("Kim") && cardAlt.includes("Spieler b0-1"), cardAlt);
    check("Alt-Text Lobby-Karte offen sagt offen", LobbyCardAlt(lobby, 0, true).toLowerCase().includes("offen"));
    check("Alt-Text Banner: Name und Passwort", OpenBannerAlt(lobby).includes("Lobby12") && OpenBannerAlt(lobby).includes("testo"));
    check("Alt-Text Rundenkarte: alle Spieler", round.lobbies.every((entry) => [...entry.teams[0], ...entry.teams[1]].every((id) => roundAlt.includes(entry.names[id]))), roundAlt.slice(0, 200));
    check("Keine Arena in den Alt-Texten", ![cardAlt, roundAlt, AnnouncementAlt(announce), ControlAlt(control), SummaryAlt(evening, rounds, 0)].some((text) => /arena/i.test(text)));
    check("Alt-Texte höchstens 1024 Zeichen", [cardAlt, RoundAlt(SampleRound(6), 0), AnnouncementAlt(announce), ControlAlt(control), SummaryAlt(evening, rounds, 0)].every((text) => text.length <= 1024));
    check("Alt-Text Übersicht: Teilnahme ohne Ergebnisse", SummaryAlt(evening, rounds, 0).includes("Nova") && !/sieg|gewonnen/i.test(SummaryAlt(evening, rounds, 0)));
}

/** Alle Knöpfe und Auswahlen einer Nachricht, flach. */
function Controls(message: { components?: readonly unknown[] }): { custom_id: string; disabled?: boolean; label?: string; type: number; min_values?: number; max_values?: number }[] {
    const found: { custom_id: string; disabled?: boolean; label?: string; type: number; min_values?: number; max_values?: number }[] = [];
    const walk = (node: unknown): void => {
        if (Array.isArray(node)) return node.forEach(walk);
        if (!node || typeof node !== "object") return;

        const record = node as Record<string, unknown>;

        if (typeof record.custom_id === "string") found.push(record as never);
        Object.values(record).forEach(walk);
    };

    walk(JSON.parse(JSON.stringify(message.components ?? [])));

    return found;
}

async function checkMessages(): Promise<void> {
    console.log("\n  — Nachrichten —");

    const id = RouletteId("open", 7, 2, 1);
    const read = ReadRouletteId(id);

    check("Custom-ID: hin und zurück", id.startsWith("rr:") && read?.action === "open" && read.eveningId === 7 && read.round === 2 && read.lobby === 1, id);
    check("Custom-ID: ohne Runde und Lobby", ReadRouletteId(RouletteId("end", 3))?.round === null && ReadRouletteId(RouletteId("end", 3))?.lobby === null);
    check("Custom-ID: fremde IDs sind null", ReadRouletteId("av:raid:1") === null && ReadRouletteId("rr:quatsch:1") === null && ReadRouletteId("rr:open:x") === null);

    const round = SampleRound(3);
    const lobby = round.lobbies[0];
    const ref = { eveningId: 7, round: 2, lobby: 0 };
    const waiting = Controls(await LobbyMessage(ref, lobby, 0, false));
    const opened = Controls(await LobbyMessage(ref, lobby, 0, true));

    check("Lobby-Karte: Knopf „Lobby ist offen“ und Kopieren", waiting.some((entry) => entry.custom_id === RouletteId("open", 7, 2, 0) && !entry.disabled) && waiting.some((entry) => entry.custom_id === RouletteId("copy", 7, 2, 0)));
    check("Lobby-Karte offen: Knopf ist grau", opened.some((entry) => entry.custom_id === RouletteId("open", 7, 2, 0) && entry.disabled === true));

    const ping = await OpenPingMessage(lobby, 0);

    check("Offen-Ping: erwähnt und erlaubt nur das Team", JSON.stringify(ping.allowedMentions) === JSON.stringify({ parse: [], users: lobby.teams[0] }) && lobby.teams[0].every((member) => JSON.stringify(ping.components).includes(`<@${member}>`)));
    check("Offen-Ping: mit Banner-Bild", (ping.files?.length ?? 0) === 1);

    const view: IControlView = { status: "running", startsAt: Date.now(), round: 2, inLobbies: 18, waiting: 0, sitOut: 0, lobbies: [], wishes: [], warnings: [] };
    const control = Controls(await ControlMessage(7, view));
    const planned = Controls(await ControlMessage(7, { ...view, status: "planned", round: 0 }));

    check("Steuerkarte: Runde auslosen, Wünsche, Tauschen, Abbrechen, Beenden", ["next", "wish", "swap", "abort", "end"].every((action) => control.some((entry) => ReadRouletteId(entry.custom_id)?.action === action)), control.map((entry) => entry.custom_id).join(" "));
    check("Steuerkarte: Beenden fragt erst nach (kein endok)", !control.some((entry) => ReadRouletteId(entry.custom_id)?.action === "endok"));
    check("Steuerkarte vor dem Start: start statt next", planned.some((entry) => ReadRouletteId(entry.custom_id)?.action === "start") && !planned.some((entry) => ReadRouletteId(entry.custom_id)?.action === "next"));

    const announce = Controls(await AnnouncementMessage({ status: "planned", startsAt: Date.now() + 60_000, waiting: { count: 0, avatars: [] }, moderators: [], waitingRoom: "W", mainVoice: "T", teamSize: 3, lobbiesAbout: 0, round: 0 }, 7));

    check("Ankündigung: Knopf „Wie läuft der Abend ab?“", announce.some((entry) => ReadRouletteId(entry.custom_id)?.action === "howto"));
    check("Anleitung: nur für den Fragenden", (Number(HowToMessage().flags) & 64) === 64);

    const evening: IRouletteEvening = { id: 7, guildId: GUILD, status: "running", startsAt: Date.now(), createdBy: "m1", createdAt: Date.now(), endedAt: null, announce: null, control: null, round: 2, sitOut: [], wishes: [{ a: "a0-1", b: "b0-1", once: false }], history: {}, participants: {} };
    const wish = WishView(evening, { "a0-1": "Nova", "b0-1": "Lukas" });
    const wishControls = Controls(wish);
    const select = wishControls.find((entry) => ReadRouletteId(entry.custom_id)?.action === "wishadd" && entry.type === 5);

    check("Wünsche: nur für den Moderator", (Number(wish.flags) & 64) === 64);
    check("Wünsche: genau zwei Mitglieder wählen", select?.min_values === 2 && select?.max_values === 2, JSON.stringify(select));
    check("Wünsche: Paar mit „entfernen“", wishControls.some((entry) => ReadRouletteId(entry.custom_id)?.action === "wishdel") && JSON.stringify(wish.components).includes("Nova"));

    const fill = Controls(FillRequestMessage(7, 2, "Lobby45", 2, "Nova", "123"));

    check("Einspring-Anfrage: Ich spiele mit, Ohne Einspringer", ["fill", "nofill"].every((action) => fill.some((entry) => ReadRouletteId(entry.custom_id)?.action === action)));
    check("Rundenkarte: ab sieben Lobbys zwei Nachrichten", (await RoundMessages(SampleRound(7))).length === 2 && (await RoundMessages(SampleRound(3))).length === 1);

    const summary = await SummaryMessages({ ...evening, status: "ended", endedAt: Date.now() }, Array.from({ length: 4 }, (_, index) => ({ ...SampleRound(2), number: index + 1 })));

    check("Übersicht: ein Bild je drei Runden, dazu eine .txt", summary.length === 2 && summary.some((message) => (message.files ?? []).some((file) => JSON.stringify((file as { name?: string }).name ?? "").includes(".txt"))));
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

/* ----------------------------------------------------------
   Ablauf: Discord im Speicher, echte Datenbank
   ---------------------------------------------------------- */
const INFO = "90071992547409981";
const CONTROL = "90071992547409982";
const WAIT = "90071992547409983";
const MAIN = "90071992547409984";
const OTHER = "90071992547409985";
const FIX1 = "90071992547409986";
const FIX2 = "90071992547409987";
const MODROLE = "90071992547409988";
const OWNER = "90071992547409989";

interface IFlowWorld {
    guild: Guild;
    settings: IRouletteSettings;
    member: (id: string, voice: string | null, moderator?: boolean) => GuildMember;
    members: Map<string, GuildMember>;
    sent: { channelId: string; id: string; payload: string }[];
    edits: { channelId: string; messageId: string; payload: string }[];
    created: string[];
    deleted: string[];
    log: string[];
    failMove: Set<string>;
    service: RouletteService;
}

/** Ein Server mit Warteraum, Treffpunkt, Info- und Moderator-Kanal. Wer verschoben wird, sitzt danach im Ziel. */
function FlowWorld(client: BotClient): IFlowWorld {
    const world = {
        settings: { ...DefaultRouletteSettings(), categoryId: CATEGORY, infoChannelId: INFO, controlChannelId: CONTROL, waitingRoomId: WAIT, mainVoiceId: MAIN, moderatorRoleId: MODROLE },
        members: new Map<string, GuildMember>(),
        sent: [],
        edits: [],
        created: [],
        deleted: [],
        log: [],
        failMove: new Set<string>(),
        service: client.rouletteService,
    } as unknown as IFlowWorld;
    const channels = new Map<string, GuildBasedChannel>();
    const channel = (id: string, type: ChannelType, name: string, parentId: string | null = null) => {
        const made = {
            id,
            type,
            name,
            parentId,
            isTextBased: () => true,
            isSendable: () => true,
            isVoiceBased: () => type === ChannelType.GuildVoice,
            get members() {
                return new Map([...world.members].filter(([, member]) => member.voice.channelId === id));
            },
            send: async (payload: unknown) => {
                const sent = { channelId: id, id: `m${world.sent.length + 1}`, payload: JSON.stringify(payload) };

                world.sent.push(sent);

                return { id: sent.id, channelId: id };
            },
            messages: {
                edit: async (messageId: string, payload: unknown) => void world.edits.push({ channelId: id, messageId, payload: JSON.stringify(payload) }),
                delete: async () => undefined,
            },
            delete: async () => {
                world.deleted.push(id);
                channels.delete(id);
            },
        };

        channels.set(id, made as unknown as GuildBasedChannel);

        return made;
    };

    channel(CATEGORY, ChannelType.GuildCategory, "Roulette");
    channel(INFO, ChannelType.GuildText, "roulette-info");
    channel(CONTROL, ChannelType.GuildText, "roulette-mod");

    for (const [id, name] of [
        [WAIT, "Warteraum"],
        [MAIN, "Treffpunkt"],
        [OTHER, "Anderes"],
        [FIX1, "Fest 1"],
        [FIX2, "Fest 2"],
    ]) {
        channel(id, ChannelType.GuildVoice, name);
    }

    let made = 0;

    world.guild = {
        id: GUILD,
        name: "Dev",
        ownerId: OWNER,
        roles: { cache: new Map([[MODROLE, { id: MODROLE, name: "Roulette-Mod" }]]) },
        channels: {
            cache: channels,
            fetch: async (id: string) => channels.get(id) ?? null,
            create: async (options: { name: string; parent?: string }) => {
                const id = `auto${++made}`;

                world.created.push(id);

                return channel(id, ChannelType.GuildVoice, options.name, options.parent ?? null);
            },
        },
        members: { cache: world.members, fetch: async (id: string) => world.members.get(id) ?? Promise.reject(new Error("Unknown Member")) },
    } as unknown as Guild;

    world.member = (id: string, voice: string | null, moderator = false) => {
        const member = {
            id,
            guild: world.guild,
            displayName: `Spieler ${id}`,
            user: { id, bot: false, username: id },
            roles: { cache: new Map(moderator ? [[MODROLE, { id: MODROLE }]] : []) },
            permissions: { has: () => false },
            displayAvatarURL: () => "",
            voice: {
                channelId: voice,
                setChannel: async (target: string | { id: string }) => {
                    world.log.push("move");
                    if (world.failMove.has(id)) throw new Error("Target user is not connected to voice.");
                    member.voice.channelId = typeof target === "string" ? target : target.id;
                },
            },
        };

        world.members.set(id, member as unknown as GuildMember);

        return member as unknown as GuildMember;
    };

    Patch(world, client.rouletteService);
    client.guilds.cache.set(GUILD, world.guild);

    return world;
}

/** Ein Service sieht die Einstellungen der Welt und zeichnet ohne Drossel. */
function Patch(world: IFlowWorld, service: RouletteService): void {
    (service as unknown as Record<string, unknown>).Settings = async () => world.settings;
    service.throttleMs = 0;
}

function Actor(member: GuildMember): IRouletteActor {
    return { id: member.id, name: member.displayName, member };
}

/** Ein Knopfdruck oder eine Auswahl; deferReply/deferUpdate landen im Log der Welt. */
function Press(world: IFlowWorld, member: GuildMember, customId: string, kind: "button" | "user" | "string" = "button", values: string[] = []) {
    const replies: string[] = [];
    const interaction = {
        customId,
        guild: world.guild,
        guildId: GUILD,
        member,
        user: member.user,
        values,
        deferred: false,
        replied: false,
        message: { flags: { has: () => false } },
        inCachedGuild: () => true,
        isButton: () => kind === "button",
        isUserSelectMenu: () => kind === "user",
        isStringSelectMenu: () => kind === "string",
        deferReply: async () => {
            world.log.push("defer");
            interaction.deferred = true;
        },
        deferUpdate: async () => {
            world.log.push("defer");
            interaction.deferred = true;
        },
        editReply: async (payload: unknown) => void replies.push(JSON.stringify(payload)),
        reply: async (payload: unknown) => {
            interaction.replied = true;
            replies.push(JSON.stringify(payload));
        },
        followUp: async (payload: unknown) => void replies.push(JSON.stringify(payload)),
    };

    return { interaction: interaction as unknown as ButtonInteraction, replies };
}

async function Rejects(promise: Promise<unknown>): Promise<unknown> {
    try {
        await promise;

        return null;
    } catch (error) {
        return error;
    }
}

function LobbyOf(round: IRouletteRound, id: string): IRouletteLobby | undefined {
    return round.lobbies.find((lobby) => lobby.teams.some((team) => team.includes(id)));
}

function SameTeam(round: IRouletteRound, a: string, b: string): boolean {
    return round.lobbies.some((lobby) => lobby.teams.some((team) => team.includes(a) && team.includes(b)));
}

async function checkFlow(client: BotClient): Promise<void> {
    console.log("\n  — Ablauf —");

    // Planen und Start
    let world = FlowWorld(client);
    const mod = world.member("mod1", MAIN, true);
    const waiting = Players(3, "w").map((id) => world.member(id, WAIT));
    const elsewhere = world.member("x1", OTHER);
    const planned = await world.service.Plan(world.guild, Actor(mod), Date.now() + 60_000);

    check("Planen: Ankündigung im Info-Kanal, Steuerkarte im Moderator-Kanal", planned.status === "planned" && world.sent.some((entry) => entry.channelId === INFO) && world.sent.some((entry) => entry.channelId === CONTROL));
    await world.service.Start(world.guild, planned.id);
    check("startMovesOnlyWaiting: Warteraum in den Treffpunkt, andere bleiben", waiting.every((member) => member.voice.channelId === MAIN) && elsewhere.voice.channelId === OTHER);

    const nobody = world.member("n1", MAIN);

    check("permissions: ohne Rolle kein Steuern, mit Rolle schon", !(await world.service.CanControl(nobody)) && (await world.service.CanControl(mod)));
    check("permissions: NextRound ohne Rolle wirft", (await Rejects(world.service.NextRound(world.guild, Actor(nobody)))) instanceof RouletteError);
    await cleanup(client);

    // Eine Runde
    world = FlowWorld(client);

    const m1 = world.member("mod1", MAIN, true);
    const m2 = world.member("mod2", MAIN, true);
    const players = Players(12, "p").map((id) => world.member(id, MAIN));
    const evening = await world.service.Plan(world.guild, Actor(m1), Date.now());

    await world.service.AddWish(world.guild, Actor(m1), "p1", "p2", true);
    await world.service.AddWish(world.guild, Actor(m1), "p3", "p4", false);

    const round = await world.service.NextRound(world.guild, Actor(m1));
    const cards = world.sent.filter((entry) => world.created.includes(entry.channelId));

    check("nextRoundFlow: 2 Lobbys, 4 Kanäle in der Kategorie", round.lobbies.length === 2 && world.created.length === 4 && world.created.every((id) => (world.guild.channels.cache.get(id) as unknown as { parentId: string }).parentId === CATEGORY), `${round.lobbies.length} · ${world.created.length}`);
    check("nextRoundFlow: je Team-Chat eine Lobby-Karte", world.created.every((id) => cards.filter((entry) => entry.channelId === id).length === 1));
    check("nextRoundFlow: Moderatoren bleiben im Treffpunkt", m1.voice.channelId === MAIN && m2.voice.channelId === MAIN);
    check(
        "nextRoundFlow: jeder Spieler im Kanal seines Teams",
        players.every((player) => {
            const lobby = LobbyOf(round, player.id);

            return !!lobby?.channels && player.voice.channelId === lobby.channels[lobby.teams[0].includes(player.id) ? 0 : 1];
        })
    );
    check("nextRoundFlow: Rundenkarte im Info-Kanal", world.sent.some((entry) => entry.channelId === INFO && entry.payload.includes("runde-1")));
    check("wishOnce: Wunsch-Paare im selben Team", SameTeam(round, "p1", "p2") && SameTeam(round, "p3", "p4"));
    check("wishOnce: einmaliger Wunsch weg, dauerhafter bleibt", JSON.stringify((await client.rouletteEvenings.Get(evening.id))?.wishes) === JSON.stringify([{ a: "p3", b: "p4", once: false }]));

    const first = round.lobbies[0];
    const notHost = [...first.teams[0], ...first.teams[1]].find((id) => id !== first.host)!;

    check("markOpenRules: Spieler, der nicht Host ist → Fehler", (await Rejects(world.service.MarkOpen(world.guild, world.members.get(notHost)!, evening.id, round.number, 0))) instanceof RouletteError);

    let edits = world.edits.length;
    let sent = world.sent.length;

    await world.service.MarkOpen(world.guild, world.members.get(first.host)!, evening.id, round.number, 0);

    const cardEdits = world.edits.slice(edits).filter((entry) => first.cards!.includes(entry.messageId) && first.channels!.includes(entry.channelId));
    const pings = world.sent.slice(sent).filter((entry) => first.channels!.includes(entry.channelId));

    check("markOpenRules: Host → beide Karten bearbeitet", cardEdits.length === 2, String(cardEdits.length));
    check("markOpenRules: Ping in beiden Team-Chats mit genau den Team-IDs", pings.length === 2 && ([0, 1] as const).every((team) => pings.some((entry) => entry.channelId === first.channels![team] && entry.payload.includes(JSON.stringify({ parse: [], users: first.teams[team] })))));

    const late = Players(2, "late").map((id) => world.member(id, WAIT));
    const second = await world.service.NextRound(world.guild, Actor(m1));

    check("lateJoiner: Nachzügler sind in Runde 2 dabei", late.every((member) => !!LobbyOf(second, member.id)) && second.number === 2);
    check("Nächste Runde: Kanäle der alten Runde weg", round.lobbies.every((lobby) => lobby.channels!.every((id) => world.deleted.includes(id))));

    const before = (await client.rouletteRounds.List(evening.id)).length;
    const both = await Promise.allSettled([world.service.NextRound(world.guild, Actor(m1)), world.service.NextRound(world.guild, Actor(m2))]);
    const rejected = both.filter((entry): entry is PromiseRejectedResult => entry.status === "rejected");

    check("doubleNext: eine Runde, der zweite bekommt „läuft schon“", rejected.length === 1 && rejected[0].reason instanceof RouletteError && String(rejected[0].reason.message).includes("läuft schon") && (await client.rouletteRounds.List(evening.id)).length === before + 1, rejected.map((entry) => String(entry.reason)).join());

    const current = (await client.rouletteRounds.Current(evening.id))!;
    const fresh = new RouletteService(client);

    Patch(world, fresh);
    await fresh.Resume();
    edits = world.edits.length;
    await fresh.Handle(Press(world, world.members.get(current.lobbies[0].host)!, `rr:open:${evening.id}:${current.number}:0`).interaction);
    check("resumeAfterRestart: Knopf „Lobby ist offen“ wirkt mit neuer Service-Instanz", world.edits.slice(edits).some((entry) => current.lobbies[0].cards!.includes(entry.messageId)) && (await client.rouletteRounds.Current(evening.id))!.lobbies[0].openedAt !== null);

    world.log.length = 0;
    await world.service.Handle(Press(world, m1, `rr:next:${evening.id}`).interaction);
    check("deferredBeforeMoving: erst bestätigt, dann verschoben", world.log[0] === "defer" && world.log.includes("move"), world.log.slice(0, 3).join());

    world.failMove.add("p5");
    sent = world.sent.length;

    const failed = await world.service.NextRound(world.guild, Actor(m1));
    const control = [...world.edits.filter((entry) => entry.channelId === CONTROL), ...world.sent.slice(sent).filter((entry) => entry.channelId === CONTROL)].at(-1);

    check("moveFails: Lobby bleibt, Runde läuft", !!LobbyOf(failed, "p5") && (await client.rouletteRounds.Current(evening.id))?.status === "running");
    check("moveFails: Steuerkarte nennt ihn", !!control?.payload.includes("Spieler p5"), control?.payload.slice(0, 160));
    world.failMove.clear();
    await cleanup(client);

    // Einspringen
    for (const take of [true, false]) {
        world = FlowWorld(client);

        const f1 = world.member("mod1", MAIN, true);
        const f2 = world.member("mod2", MAIN, true);

        Players(13, "p").forEach((id) => world.member(id, MAIN));

        const night = await world.service.Plan(world.guild, Actor(f1), Date.now());
        const drawn = await world.service.NextRound(world.guild, Actor(f1));

        if (take) {
            check("fillerFlow: 13 Spieler → Anfrage im Moderator-Kanal, Runde wartet", drawn.status === "drawing" && world.sent.some((entry) => entry.channelId === CONTROL && entry.payload.includes("Ein Platz frei")));

            const filled = await world.service.Fill(world.guild, Actor(f2), night.id, true);
            const lobby = filled.lobbies.find((entry) => entry.filler === "mod2");

            check("fillerFlow: Moderator springt ein und sitzt in seinem Team-Kanal", !!lobby?.channels && f2.voice.channelId === lobby.channels[1] && filled.status === "running", `${lobby?.channels} · ${f2.voice.channelId}`);
            await cleanup(client);
            continue;
        }

        const skipped = await world.service.Fill(world.guild, Actor(f2), night.id, false);
        const after = (await client.rouletteEvenings.Get(night.id))!;

        check("fillerFlow: ohne Einspringer setzt einer aus und steht in sitOut", after.sitOut.length === 1 && !LobbyOf(skipped, after.sitOut[0]) && skipped.status === "running", JSON.stringify(after.sitOut));

        await world.service.End(world.guild, Actor(f1));

        const ended = await client.rouletteEvenings.Get(night.id);

        check("endFlow: alle zurück im Treffpunkt", [...world.members.values()].every((member) => member.voice.channelId === MAIN));
        check("endFlow: Auto-Kanäle gelöscht", world.created.length > 0 && world.created.every((id) => world.deleted.includes(id)));
        check("endFlow: Übersicht im Moderator-Kanal, Abend beendet", world.sent.some((entry) => entry.channelId === CONTROL && entry.payload.includes("uebersicht")) && ended?.status === "ended");
        await cleanup(client);
    }

    // Feste Kanäle
    world = FlowWorld(client);
    world.settings = { ...world.settings, teamChannels: "fixed", fixedChannelIds: [FIX1, FIX2] };

    const host = world.member("mod1", MAIN, true);

    Players(12, "p").forEach((id) => world.member(id, MAIN));

    const fixed = await world.service.Plan(world.guild, Actor(host), Date.now());
    const fixedRound = await world.service.NextRound(world.guild, Actor(host));
    const fixedEvening = (await client.rouletteEvenings.Get(fixed.id))!;

    check("fixedChannels: 1 Lobby in den festen Kanälen, 6 setzen aus, nichts angelegt", fixedRound.lobbies.length === 1 && fixedEvening.sitOut.length === 6 && world.created.length === 0 && fixedRound.lobbies[0].channels?.join() === [FIX1, FIX2].join());
    await world.service.End(world.guild, Actor(host));
    check("fixedChannels: nach dem Ende nichts gelöscht", world.deleted.length === 0);
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
    checkStartTime();
    await checkImages();
    await checkMessages();

    await client.configService.Initialize();

    if (await client.databaseService.Connect()) {
        try {
            await checkDatabase(client);
            await cleanup(client);
            await checkFlow(client);
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
