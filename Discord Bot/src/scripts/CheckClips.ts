/**
 * Prüft Clips der Woche ohne Discord: was als Clip zählt, die Termine, die
 * Einstellungen, den Ausschluss nach Strafen, wer gewinnt und die Ansagen -
 * und, sofern eine Datenbank da ist, Runden, Clips, Stimmen und Archiv.
 *
 *   npm run check:clips
 *
 * Ob Discord den Kanal wirklich sperrt, Reaktionen zählt und leert, zeigt erst
 * ein echter Server.
 */
process.env.CLIENT_SECRET ||= "check-secret";
process.env.DEV_CLIENT_SECRET ||= "check-secret";

import path from "path";
import { existsSync } from "node:fs";
import { ChannelType, Guild, GuildBasedChannel } from "discord.js";
import BotClient from "../client/BotClient";
import { ClipNoticeView, ClipValues, PrizeText, WinnerText } from "../builder/ClipView";
import {
    ArchiveFolder,
    CLIP_FILE,
    CLIP_KEYS,
    DefaultClipSettings,
    DefaultMessages,
    LegacySchedule,
    MAX_PENALTY_COUNT,
    MAX_PER_USER,
    NextSchedule,
    PenaltyText,
    PLACES,
    ShiftDate,
    VideoExtension,
    WINNER_KEYS,
} from "../constants/Clips";
import { IClipEntry, IClipRound } from "../interfaces/services/clips/IClips";
import { ClipError, EmojiKey } from "../services/ClipService";

const GUILD = "90071992547409991";
const TEXT = "90071992547409992";
const VOICE = "90071992547409993";
const USER_A = "90071992547409994";
const USER_B = "90071992547409995";
const USER_C = "90071992547409996";
const EMOJI = "90071992547409997";
const DAY = 86_400_000;

let failures = 0;

function check(name: string, passed: boolean, detail = ""): void {
    if (!passed) failures++;

    console.log(`  ${passed ? "ok  " : "FAIL"} ${name}${passed || !detail ? "" : `  → ${detail}`}`);
}

function refused(run: () => unknown): boolean {
    try {
        run();

        return false;
    } catch (error) {
        return error instanceof ClipError;
    }
}

function FakeGuild(): Guild {
    const channel = (id: string, type: ChannelType) => ({ id, type }) as unknown as GuildBasedChannel;

    return {
        id: GUILD,
        name: "Testserver",
        iconURL: () => null,
        channels: { cache: new Map([[TEXT, channel(TEXT, ChannelType.GuildText)], [VOICE, channel(VOICE, ChannelType.GuildVoice)]]) },
        emojis: { cache: new Map([[EMOJI, { id: EMOJI }]]) },
    } as unknown as Guild;
}

function Entry(id: number, userId: string, createdAt: number): IClipEntry {
    return {
        id,
        roundId: 1,
        guildId: GUILD,
        userId,
        userName: `Spieler ${id}`,
        channelId: TEXT,
        messageId: String(1000 + id),
        url: `https://cdn.discordapp.com/attachments/1/2/${id}.mp4`,
        kind: "video",
        createdAt,
        votes: null,
        rank: null,
        file: null,
        size: null,
    };
}

function Round(status: IClipRound["status"]): IClipRound {
    return { id: 7, guildId: GUILD, status, openedAt: Date.now(), closesAt: Date.now() + DAY, endsAt: Date.now() + 2 * DAY, closedAt: null, endedAt: null, prizes: ["Nitro", "", ""], winners: [] };
}

function checkVideos(): void {
    console.log("\n  — Was als Clip zählt —");

    check("MP4 über den Dateinamen", VideoExtension("clip.MP4", null) === "mp4");
    check("WebM über den Typ, auch ohne Endung", VideoExtension("clip", "video/webm") === "webm");
    check("MOV aus dem iPhone", VideoExtension("IMG_0001.mov", "video/quicktime") === "mov");
    check("AVI spielt kein Browser - abgelehnt", VideoExtension("alt.avi", "video/x-msvideo") === null);
    check("MKV ebenso", VideoExtension("aufnahme.mkv", "video/x-matroska") === null);
    check("Gesicherte Dateien heißen nur nach Clip-ID", CLIP_FILE.test("41.mp4") && !CLIP_FILE.test("../41.mp4") && !CLIP_FILE.test("clip.mp4"));

    const folder = ArchiveFolder(new Date(2026, 9, 5, 12, 0).getTime(), 7);

    check("Der Ordner trägt das Datum und die Runde", folder === "2026-10-05_runde-7", folder);
}

function checkSchedule(): void {
    console.log("\n  — Termine —");

    // Samstag 24. Oktober 2026, 20:00 - in der Nacht danach endet die Sommerzeit.
    const saturday = new Date(2026, 9, 24, 20, 0).getTime();
    const week = new Date(ShiftDate(saturday, "weekly"));

    check("Eine Woche später, wieder 20:00 - auch über die Zeitumstellung", week.getDate() === 31 && week.getHours() === 20, week.toString());

    const january = new Date(2027, 0, 31, 18, 30).getTime();
    const february = new Date(ShiftDate(january, "monthly"));

    check("Monatlich: der 31. wird im Februar zum 28.", february.getMonth() === 1 && february.getDate() === 28 && february.getHours() === 18, february.toString());
    check("Einmalig verschiebt nichts", ShiftDate(january, "none") === january);

    const now = new Date(2026, 9, 1, 12, 0).getTime();
    const past = { openAt: now - 10 * DAY, closeAt: now - 8 * DAY, endAt: now - 6 * DAY, repeat: "weekly" as const };
    const next = NextSchedule(past, now);

    check("Ein wöchentlicher Plan rückt in die Zukunft", next.endAt! > now && next.endAt! - now <= 7 * DAY, new Date(next.endAt!).toString());
    check("Und behält die Abstände", next.closeAt! - next.openAt! === past.closeAt - past.openAt);
    const once = { ...past, repeat: "none" as const };

    check("Einmalig bleibt in der Vergangenheit stehen", NextSchedule(once, now) === once);

    const future = { ...past, endAt: now + DAY };

    check("Ein Plan, der noch läuft, bleibt derselbe", NextSchedule(future, now) === future);

    // Die erste Fassung: Montag 12 Uhr öffnen, Freitag 20 Uhr zu, Sonntag 20 Uhr Ende.
    const legacy = LegacySchedule({ open: { day: 1, hour: 12, minute: 0 }, close: { day: 5, hour: 20, minute: 0 }, end: { day: 0, hour: 20, minute: 0 } }, now);

    check(
        "Alter Wochenplan wird zu Terminen",
        legacy !== null && legacy.repeat === "weekly" && new Date(legacy.openAt!).getDay() === 1 && new Date(legacy.closeAt!).getDay() === 5 && new Date(legacy.endAt!).getDay() === 0,
        JSON.stringify(legacy)
    );
    check("Und zwar die Woche, die gerade läuft", legacy !== null && legacy.openAt! <= now && legacy.endAt! > now);
}

function checkSettings(client: BotClient): void {
    console.log("\n  — Einstellungen —");

    const guild = FakeGuild();
    const service = client.clipService;
    const previous = DefaultClipSettings();
    const clean = service.CleanSettings(
        guild,
        {
            channelId: TEXT,
            announceChannelId: VOICE,
            maxPerUser: 999,
            prizes: ["  Nitro  ", "Rolle", "x".repeat(500), "zu viel"],
            publicBoard: false,
            emoji: "👍",
            penalties: { warn: 99, timeout: 1, kick: -3, ban: "x", days: 0 },
        },
        previous
    );

    check("Der Clip-Kanal kommt an", clean.channelId === TEXT);
    check("Ein Sprachkanal taugt nicht für Ansagen", clean.announceChannelId === null);
    check("Clips je Person sind gedeckelt", clean.maxPerUser === MAX_PER_USER, String(clean.maxPerUser));
    check("Preise: drei Plätze, gekürzt", clean.prizes.length === PLACES && clean.prizes[0] === "Nitro" && clean.prizes[2]!.length <= 100);
    check("Die öffentliche Seite lässt sich abschalten", clean.publicBoard === false);
    check("Ein normales Emoji geht", clean.emoji === "👍");
    check("Strafen: Schwellen gedeckelt, Unsinn wird 0 oder bleibt", clean.penalties.warn === MAX_PENALTY_COUNT && clean.penalties.timeout === 1 && clean.penalties.kick === 0 && clean.penalties.ban === 0, JSON.stringify(clean.penalties));
    check("Strafen: mindestens ein Tag", clean.penalties.days === 1);
    check("Die Sperrliste ändert sich nicht über die Einstellungen", service.CleanSettings(guild, { blocked: [{ userId: USER_A, name: "A" }] }, previous).blocked.length === 0);

    check("Ein Server-Emoji von hier geht", service.CleanSettings(guild, { emoji: `<:gg:${EMOJI}>` }, previous).emoji === `<:gg:${EMOJI}>`);
    check("Ein fremdes Server-Emoji nicht", refused(() => service.CleanSettings(guild, { emoji: "<:gg:12345678901234567>" }, previous)));
    check("Text ist kein Emoji", refused(() => service.CleanSettings(guild, { emoji: "daumen" }, previous)));

    const now = Date.now();

    check("Nur ein Termin: abgewiesen", refused(() => service.CleanSettings(guild, { schedule: { openAt: now + DAY, closeAt: null, endAt: null } }, previous)));
    check("Falsche Reihenfolge: abgewiesen", refused(() => service.CleanSettings(guild, { schedule: { openAt: now + 2 * DAY, closeAt: now + DAY, endAt: now + 3 * DAY } }, previous)));
    check("Zu knapp hintereinander: abgewiesen", refused(() => service.CleanSettings(guild, { schedule: { openAt: now + DAY, closeAt: now + DAY + 60_000, endAt: now + 2 * DAY } }, previous)));
    check("Keine Termine: erlaubt", service.CleanSettings(guild, { schedule: { openAt: null, closeAt: null, endAt: null, repeat: "none" } }, previous).schedule.openAt === null);

    const planned = service.CleanSettings(guild, { schedule: { openAt: now + DAY, closeAt: now + 3 * DAY, endAt: now + 4 * DAY, repeat: "monthly" } }, previous).schedule;

    check("Drei Termine in Reihenfolge: kommen an", planned.openAt === now + DAY && planned.repeat === "monthly");
    check("Unbekannte Wiederholung wird wöchentlich", service.CleanSettings(guild, { schedule: { openAt: null, closeAt: null, endAt: null, repeat: "jährlich" } }, previous).schedule.repeat === "weekly");
}

function checkPenalties(): void {
    console.log("\n  — Ausschluss nach Strafen —");

    const rules = { warn: 3, timeout: 1, kick: 0, ban: 1, days: 30 };

    check("Unter der Schwelle: dabei", PenaltyText(rules, { warn: 2 }) === null);
    check("Drei Verwarnungen: raus", PenaltyText(rules, { warn: 3 }) === "3 Verwarnungen");
    check("Ein Timeout reicht, wenn die Schwelle 1 ist", PenaltyText(rules, { timeout: 1 }) === "1 Timeout");
    check("Kicks zählen nicht, wenn die Schwelle 0 ist", PenaltyText(rules, { kick: 5 }) === null);
    check("Alles aus: niemand fliegt", PenaltyText({ warn: 0, timeout: 0, kick: 0, ban: 0, days: 30 }, { warn: 9, ban: 2 }) === null);
}

function checkRank(client: BotClient): void {
    console.log("\n  — Wer gewinnt —");

    const service = client.clipService;
    const entries = [Entry(1, USER_A, 100), Entry(2, USER_B, 200), Entry(3, USER_A, 300), Entry(4, USER_C, 50)];
    const counts = new Map([
        [1, 5],
        [2, 5],
        [3, 9],
        [4, 0],
    ]);
    const winners = service.Rank(entries, counts, ["Nitro", "Rolle", "Ehre"], GUILD);

    check("Die meisten Stimmen gewinnen", winners[0]?.entryId === 3, JSON.stringify(winners.map((winner) => winner.entryId)));
    check("Niemand gewinnt zweimal - der zweite Clip von A zählt nicht", !winners.slice(1).some((winner) => winner.userId === USER_A));
    check("Gleichstand: wer früher eingereicht hat", winners[1]?.entryId === 2);
    check("Ohne Stimme gibt es keinen Platz", !winners.some((winner) => winner.entryId === 4));
    check("Die Preise hängen am Platz", winners[0]?.prize === "Nitro" && winners[1]?.prize === "Rolle");
    check("Keine Stimmen: keine Gewinner", service.Rank(entries, new Map(), [], GUILD).length === 0);

    check("Emoji-Schlüssel: Server-Emoji über die ID", EmojiKey(`<a:gg:${EMOJI}>`) === EMOJI);
    check("Emoji-Schlüssel: mit und ohne Variantenzeichen gleich", EmojiKey(`❤${String.fromCodePoint(0xfe0f)}`) === EmojiKey("❤"));
}

async function checkMessages(client: BotClient): Promise<void> {
    console.log("\n  — Die Ansagen —");

    const guild = FakeGuild();
    const settings = { ...DefaultClipSettings(), channelId: TEXT, maxPerUser: 2, prizes: ["Nitro", "", ""] };
    const round = Round("open");
    const values = ClipValues(guild, settings, round, 3, "https://dashboard.example/clips/1");

    check("Alle Platzhalter haben einen Wert", WINNER_KEYS.every((key) => key in values), WINNER_KEYS.filter((key) => !(key in values)).join(", "));
    check("{max} nennt das Limit", values.max === "bis zu 2 Clips");
    check("{preise} bringt die Überschrift mit", String(values.preise).startsWith("**Zu gewinnen**") && String(values.preise).includes("Nitro"));
    check("Ohne Preise bleibt {preise} leer", ClipValues(guild, { ...settings, prizes: ["", "", ""] }, { ...round, prizes: ["", "", ""] }, 0, null).preise === "");
    check("{link} ist leer, wenn die Seite nicht freigegeben ist", ClipValues(guild, settings, round, 0, null).link === "");
    check("{anzahl}: Einzahl und Mehrzahl", values.anzahl === "3 Clips" && ClipValues(guild, settings, round, 1, null).anzahl === "ein Clip");
    check("Preise ohne Text fallen weg", PrizeText(["Nitro", "", "Rolle"]) === "🥇 Nitro\n🥉 Rolle", PrizeText(["Nitro", "", "Rolle"]));

    const done: IClipRound = {
        ...round,
        status: "done",
        winners: [{ place: 1, entryId: 7, userId: USER_B, name: "B", votes: 4, prize: "Nitro", url: "", kind: "video", messageUrl: "https://discord.com/channels/1/2/3" }],
    };

    check("Gewinner mit Erwähnung, Stimmen und Preis", WinnerText(done) === `🥇 <@${USER_B}> – 4 Stimmen · Nitro`, WinnerText(done));
    check("Ohne Gewinner sagt die Ansage das", WinnerText({ ...done, winners: [] }).includes("keine Gewinner"));

    const view = await ClipNoticeView(client, DefaultMessages().open, values);
    const json = JSON.stringify(view.components.map((component) => component.toJSON()));

    check("Die Standard-Ansage zum Öffnen wird gebaut", json.includes("Clips der Woche") && json.includes("bis zu 2 Clips") && json.includes("Nitro"));
    check("Platzhalter sind ersetzt", !/\{[a-z0-9.]+\}/.test(json), json.match(/\{[a-z0-9.]+\}/)?.[0] ?? "");

    const { pathToFileURL } = await import("node:url");
    const file = path.join(process.cwd(), "src", "dashboard", "client", "constants", "Placeholders.ts");

    if (!existsSync(file)) return check("Die Liste des Dashboards ist da", false, file);

    const loaded = (await import(pathToFileURL(file).href)) as Record<string, { key: string }[] | undefined>;
    const pairs: [string, readonly string[], string][] = [
        ["Öffnen und Abstimmung", CLIP_KEYS, "CLIP_PLACEHOLDERS"],
        ["Gewinner", WINNER_KEYS, "CLIP_WINNER_PLACEHOLDERS"],
    ];

    for (const [label, keys, name] of pairs) {
        const dashboard = (loaded[name] ?? []).map((entry) => entry.key);
        const missing = keys.filter((key) => !dashboard.includes(key));
        const extra = dashboard.filter((key) => !keys.includes(key));

        check(`${label}: ${keys.length} Platzhalter, im Dashboard dieselben`, missing.length === 0 && extra.length === 0, `fehlt: ${missing.join(", ")} | zu viel: ${extra.join(", ")}`);
    }
}

async function checkDatabase(client: BotClient): Promise<void> {
    console.log("\n  — Datenbank —");

    const round = await client.clipRounds.Open(GUILD, Date.now() + 1000, Date.now() + 2000, ["Nitro", "", ""]);

    try {
        check("Eine Runde geht auf", round.status === "open" && round.prizes[0] === "Nitro");
        check("Und ist die laufende", (await client.clipRounds.Active(GUILD))?.id === round.id);

        const video = (id: string, userId: string, name: string) =>
            client.clipEntries.Add({ roundId: round.id, guildId: GUILD, userId, userName: name, channelId: TEXT, messageId: id, url: `https://cdn.discordapp.com/attachments/1/2/${id}.mp4`, kind: "video" });
        const a = await video("8000000000000000001", USER_A, "A");
        const b = await video("8000000000000000002", USER_B, "B");

        check("Clips werden gezählt je Person", (await client.clipEntries.CountOf(round.id, USER_A)) === 1);
        check("Ein Clip findet sich über seine Nachricht", (await client.clipEntries.ByMessage("8000000000000000002"))?.id === b.id);
        check("Neu: noch ohne Kopie, Stimmen und Platz", a.file === null && a.votes === null && a.rank === null);

        await client.clipEntries.SetFile(a.id, `${a.id}.mp4`, 1234);

        const saved = await client.clipEntries.Get(a.id);

        check("Die Kopie steht am Clip", saved?.file === `${a.id}.mp4` && saved.size === 1234);

        await client.clipVotes.Set(round.id, USER_C, a.id);
        await client.clipVotes.Set(round.id, USER_B, a.id);
        await client.clipVotes.Set(round.id, USER_C, b.id);

        const counts = await client.clipVotes.Counts(round.id);

        check("Eine Stimme je Person - eine neue Reaktion überschreibt", counts.get(a.id) === 1 && counts.get(b.id) === 1, JSON.stringify([...counts]));
        check("Wofür jemand zuletzt gestimmt hat", (await client.clipVotes.OfRound(round.id)).get(USER_C) === b.id);

        await client.clipVotes.Remove(round.id, USER_C);

        check("Reaktion weg: Stimme weg", (await client.clipVotes.Of(round.id, USER_C)) === null);

        await client.clipEntries.SetResult(a.id, 1, 1);
        await client.clipEntries.SetResult(b.id, 0, 2);
        await client.clipRounds.Patch(round.id, { status: "done", endedAt: Date.now(), winners: [] });

        check("Eine fertige Runde läuft nicht mehr", (await client.clipRounds.Active(GUILD)) === null);
        check("Steht aber im Archiv", (await client.clipRounds.Done(GUILD)).some((entry) => entry.id === round.id));
        check("Mit der Zahl ihrer Clips", (await client.clipEntries.CountsByRound(GUILD)).get(round.id) === 2);
        check("Stimmen und Platz bleiben am Clip", (await client.clipEntries.Get(b.id))?.rank === 2);

        const found = await client.clipService.Round(GUILD, round.id);

        check("Die Runde im Archiv: Clips nach Platz", found?.entries[0]?.id === a.id && found.entries[1]?.id === b.id);
        check("Eine fremde Runde gibt es nicht", (await client.clipService.Round("90071992547409990", round.id)) === null);
        check("Die Strafen-Abfrage läuft", (await client.modCases.PenaltyCounts(GUILD, 0, 0)).size === 0);
    } finally {
        await client.clipRounds.Remove(round.id);
    }

    check("Aufgeräumt", (await client.clipRounds.Latest(GUILD)) === null);
}

async function main(): Promise<void> {
    console.log("\n🎬 Clips der Woche\n");

    const client = new BotClient();

    checkVideos();
    checkSchedule();
    checkSettings(client);
    checkPenalties();
    checkRank(client);
    await checkMessages(client);

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
