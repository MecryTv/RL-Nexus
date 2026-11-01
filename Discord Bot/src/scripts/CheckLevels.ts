/**
 * Prüft das Level System ohne Discord: die Rechnung hinter den Punkten, die
 * Einstellungen, die Karte als PNG - und, sofern eine Datenbank da ist, die
 * Rangliste samt Belohnungsrollen.
 *
 *   npm run check:levels
 *
 * Punkte fürs Schreiben und fürs Sitzen im Sprachkanal fallen erst auf einem
 * echten Server an; hier wird gerechnet, geprüft und gezeichnet.
 */
process.env.CLIENT_SECRET ||= "check-secret";
process.env.DEV_CLIENT_SECRET ||= "check-secret";

import path from "node:path";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { ButtonInteraction, ChatInputCommandInteraction, ChannelType, Collection, Guild, GuildBasedChannel, GuildMember, Message, Role } from "discord.js";
import { GALLERY_ROOT } from "../constants/Gallery";
import BotClient from "../client/BotClient";
import { CardLine, RenderLevelCard } from "../builder/LevelCard";
import { RenderLeaderboard } from "../builder/LeaderboardImage";
import { BoardChannelPayload, BoardMessage, HandleBoardButton, RankPayload } from "../services/levels/BoardMessage";
import { BoardFingerprint, PostBoard } from "../services/levels/BoardPost";
import { BOOST_PLACEHOLDER_KEYS, CountsForPoints, VoiceHours, VoiceText, DefaultLevelMessage, DefaultLevelSettings, LEVEL_LOG_KEEP_DAYS, LEVEL_PULSE_MS, LevelFromXp, LevelProgress, MAX_FACTOR, MAX_XP_MANUAL, Today, XpForLevel } from "../constants/Levels";
import LevelService, { LevelError } from "../services/LevelService";
import { IBoardPage, ILevelBoardPost, ILevelEntry, ILevelSettings, LevelBackfillMode } from "../interfaces/services/levels/ILevels";
import { PERMANENT_MODULES } from "../constants/Modules";
import { SESSION_COOKIE } from "../constants/Dashboard";
import { RunBackfill, StartBackfill } from "../services/levels/Backfill";
import LevelBackfillRunnable from "../runnables/LevelBackfill";
import { NextModules } from "../models/GuildSettings";
import DashboardApiLevels from "../routes/DashboardApiLevels";
import DashboardApiLeaderboard from "../routes/DashboardApiLeaderboard";
import DashboardLeaderboard from "../routes/DashboardLeaderboard";
import DashboardLeaderboardImage from "../routes/DashboardLeaderboardImage";
import { RankOrder, Trend } from "../services/levels/Board";
import { MODULES as CLIENT_MODULES } from "../dashboard/client/constants/Modules";
import { BOOST_PLACEHOLDERS as CLIENT_BOOST_PLACEHOLDERS } from "../dashboard/client/constants/Placeholders";
import { LEVEL_FIELDS } from "../dashboard/client/constants/LevelFields";
import { BOARD_TEMPLATES, CARD_TEMPLATES, DefaultBoardStyle, UP_TEMPLATES } from "../constants/LevelDesign";
import { RenderDesign } from "../builder/DesignRenderer";
import { IBoardDesign } from "../interfaces/services/levels/ILevelDesign";
import { CleanBoardStyle } from "../services/levels/Design";
import { ActiveBoost, BoostText, CleanBoosts } from "../services/levels/Boost";
import { FromZone } from "../constants/Matchups";
import { ILevelBoost, ILevelLogEntry } from "../interfaces/services/levels/ILevels";
import LevelCommand from "../commands/user/Level";
import { PostTop, TopDue } from "../services/levels/Top";
import LevelSchedule from "../runnables/LevelSchedule";
import LevelBoards from "../runnables/LevelBoards";

const GUILD = "90071992547409951";
const USER = "90071992547409952";
const OTHER = "90071992547409953";
const TEXT = "90071992547409954";
const SPAM = "90071992547409955";
const ROLE = "90071992547409956";
const REWARD = "90071992547409957";

let failures = 0;

function check(name: string, passed: boolean, detail = ""): void {
    if (!passed) failures++;

    console.log(`  ${passed ? "ok  " : "FAIL"} ${name}${passed || !detail ? "" : `  → ${detail}`}`);
}

function FakeGuild(): Guild {
    const channel = (id: string) => ({ id, type: ChannelType.GuildText, name: `kanal-${id.slice(-2)}`, isTextBased: () => true }) as unknown as GuildBasedChannel;
    const role = (id: string, name: string) => ({ id, name }) as unknown as Role;

    return {
        id: GUILD,
        name: "Dev Server",
        channels: { cache: new Map([[TEXT, channel(TEXT)], [SPAM, channel(SPAM)]]) },
        roles: { cache: new Map([[ROLE, role(ROLE, "Stammgast")], [REWARD, role(REWARD, "Level 5")], [GUILD, role(GUILD, "@everyone")]]) },
        members: { cache: new Map() },
    } as unknown as Guild;
}

/** Ein Mitglied, das sich merkt, welche Rollen es bekommen und verloren hat. */
function FakeMember(guild: Guild, id: string, roles: string[] = []): GuildMember & { added: string[]; removed: string[] } {
    const cache = new Map(roles.map((roleId) => [roleId, guild.roles.cache.get(roleId)!]));
    const member = {
        id,
        displayName: id === USER ? "Lara" : "Mo",
        guild,
        user: { id, bot: false, username: "lara" },
        added: [] as string[],
        removed: [] as string[],
        roles: {
            cache,
            add: async (ids: string[] | string) => {
                for (const roleId of Array.isArray(ids) ? ids : [ids]) {
                    member.added.push(roleId);
                    cache.set(roleId, guild.roles.cache.get(roleId)!);
                }
            },
            remove: async (ids: string[] | string) => {
                for (const roleId of Array.isArray(ids) ? ids : [ids]) {
                    member.removed.push(roleId);
                    cache.delete(roleId);
                }
            },
        },
    };

    return member as unknown as GuildMember & { added: string[]; removed: string[] };
}

/* ----------------------------------------------------------
   Die Rechnung
   ---------------------------------------------------------- */
function checkMath(): void {
    console.log("\n  — Punkte und Level —");

    check("Level 0 braucht nichts", XpForLevel(0, 100) === 0);
    check("Level 1 braucht 100", XpForLevel(1, 100) === 100);
    check("Level 5 braucht 1500", XpForLevel(5, 100) === 1500, String(XpForLevel(5, 100)));
    check("Level 10 braucht 5500", XpForLevel(10, 100) === 5500, String(XpForLevel(10, 100)));

    check("Ohne Punkte Level 0", LevelFromXp(0, 100) === 0);
    check("99 Punkte reichen nicht", LevelFromXp(99, 100) === 0);
    check("100 Punkte sind Level 1", LevelFromXp(100, 100) === 1);
    check("5499 Punkte sind Level 9", LevelFromXp(5_499, 100) === 9, String(LevelFromXp(5_499, 100)));

    let consistent = true;

    for (let level = 0; level <= 60; level++) {
        const xp = XpForLevel(level, 100);

        if (LevelFromXp(xp, 100) !== level || LevelFromXp(xp - 1, 100) !== Math.max(0, level - 1)) consistent = false;
    }

    check("Hin und zurück stimmt für 60 Level", consistent);

    const progress = LevelProgress(1_800, 100);

    check("Der Fortschritt kennt das Level", progress.level === 5, String(progress.level));
    check("Und wie weit es ist", progress.into === 300 && progress.need === 600, `${progress.into}/${progress.need}`);
    check("Der Anteil passt", Math.abs(progress.share - 0.5) < 0.001, String(progress.share));

    const steep = LevelProgress(1_800, 250);

    check("Eine steilere Kurve heißt weniger Level", steep.level < progress.level, `${steep.level} statt ${progress.level}`);
}

/* ----------------------------------------------------------
   Einstellungen
   ---------------------------------------------------------- */
function checkSettings(client: BotClient): void {
    console.log("\n  — Einstellungen —");

    const guild = FakeGuild();
    const service = client.levelService;
    const base = DefaultLevelSettings();

    const clean = service.Clean(
        guild,
        {
            chat: { min: 40, max: 10, cooldown: 99_999 },
            voice: { xp: 900 },
            base: 5,
            roleBonus: [{ id: ROLE, factor: 99 }, { id: "123", factor: 2 }, { id: ROLE, factor: 3 }],
            channelBonus: [{ id: TEXT, factor: 0.5 }],
            noChannels: [SPAM, "999"],
            noRoles: [GUILD, ROLE],
            rewards: [{ level: 20, roleId: REWARD }, { level: 5, roleId: ROLE }, { level: 7, roleId: REWARD }],
            announce: "quatsch",
        },
        base
    );

    check("Vertauschte Werte werden getauscht", clean.chat.min === 10 && clean.chat.max === 40, `${clean.chat.min}-${clean.chat.max}`);
    check("Die Sperre wird gedeckelt", clean.chat.cooldown === 3600, String(clean.chat.cooldown));
    check("Voice-Punkte werden gedeckelt", clean.voice.xp === 500, String(clean.voice.xp));
    check("Die Kurve hat eine Untergrenze", clean.base === 10, String(clean.base));
    check("Unbekannte Rollen fallen weg, doppelte auch", clean.roleBonus.length === 1);
    check("Der Faktor wird gedeckelt", clean.roleBonus[0].factor === MAX_FACTOR, String(clean.roleBonus[0].factor));
    check("Ein Faktor unter 1 geht auch", clean.channelBonus[0].factor === 0.5);
    check("Unbekannte Kanäle fallen weg", clean.noChannels.join(",") === SPAM);
    check("@everyone ist keine Ausnahme-Rolle", clean.noRoles.join(",") === ROLE);
    check("Belohnungen stehen der Reihe nach", clean.rewards.map((reward) => reward.level).join(",") === "5,20", clean.rewards.map((r) => r.level).join(","));
    check("Eine Rolle nur einmal", clean.rewards.filter((reward) => reward.roleId === REWARD).length === 1);
    check("Unsinn beim Ziel fällt zurück", clean.announce === base.announce);
    check("Ohne Angabe bleibt alles, wie es war", service.Clean(guild, {}, clean).rewards.length === 2);

    const targeted = service.Clean(guild, { announce: "channel", announceChannelId: TEXT }, base);

    check("Ein echter Kanal wird übernommen", targeted.announceChannelId === TEXT);
    check("Ein erfundener nicht", service.Clean(guild, { announceChannelId: "999" }, base).announceChannelId === null);
    check("Die Vorlage hat Platzhalter", JSON.stringify(DefaultLevelMessage()).includes("{level}"));
    check("Die Rangliste ist erst einmal nicht öffentlich", base.public === false);
    check("Öffentlich lässt sich einschalten", service.Clean(guild, { public: true }, base).public === true);
    check("Unsinn schaltet nichts ein", service.Clean(guild, { public: "ja" }, base).public === false);
}

/* ----------------------------------------------------------
   Die Karte
   ---------------------------------------------------------- */
async function checkCard(): Promise<void> {
    console.log("\n  — Karte —");

    const png = await RenderLevelCard({
        name: "Lara",
        avatarURL: null,
        level: 12,
        xp: 7_800,
        into: 300,
        need: 1_300,
        rank: 1,
        total: 148,
        messages: 1_240,
        voiceMinutes: 860,
    });

    check("Die Karte entsteht", png.length > 5_000, `${png.length} Bytes`);
    check("Es ist wirklich ein PNG", png.subarray(1, 4).toString() === "PNG");

    const empty = await RenderLevelCard({ name: "Neu", avatarURL: null, level: 0, xp: 0, into: 0, need: 100, rank: 0, total: 0, messages: 0, voiceMinutes: 0 });

    check("Auch ohne Punkte", empty.length > 5_000);

    const long = await RenderLevelCard({
        name: "Ein wirklich sehr langer Anzeigename",
        avatarURL: null,
        level: 999,
        xp: 99_999_999,
        into: 1,
        need: 1,
        rank: 148,
        total: 148,
        messages: 999_999,
        voiceMinutes: 100_000,
    });

    check("Auch mit langen Namen und großen Zahlen", long.length > 5_000);
}

/* ----------------------------------------------------------
   Datenbank
   ---------------------------------------------------------- */
async function checkDatabase(client: BotClient): Promise<void> {
    console.log("\n  — Datenbank —");

    const guild = FakeGuild();

    await client.levels.Add(GUILD, USER, 120, { messages: 1, stamp: Date.now() });
    await client.levels.Add(GUILD, USER, 80, { messages: 1 });
    await client.levels.Add(GUILD, OTHER, 50, { voiceMinutes: 3 });

    const entry = await client.levels.Of(GUILD, USER);

    check("Punkte werden addiert", entry?.xp === 200, String(entry?.xp));
    check("Nachrichten werden gezählt", entry?.messages === 2);
    check("Voice-Minuten auch", (await client.levels.Of(GUILD, OTHER))?.voiceMinutes === 3);
    check("Die Sperre merkt sich den Zeitpunkt", (entry?.lastMessage ?? 0) > 0);

    await client.levels.SetLevel(GUILD, USER, 2);

    check("Das Level lässt sich setzen", (await client.levels.Of(GUILD, USER))?.level === 2);

    const top = await client.levels.Top(GUILD, 10);

    check("Die Rangliste sortiert nach Punkten", top[0]?.userId === USER && top[1]?.userId === OTHER);
    check("Die Plätze zählen mit", top[0]?.rank === 1 && top[1]?.rank === 2);
    check("Der Platz einzeln stimmt", (await client.levels.Rank(GUILD, OTHER)) === 2);
    check("Gezählt wird richtig", (await client.levels.Total(GUILD)) === 2);
    check("Wer ein Level hat, wird gefunden", (await client.levels.AtLeast(GUILD, 2)).length === 1);

    console.log("\n  — Punkte von Hand —");

    const service = client.levelService;

    await client.moduleSettings.Save(GUILD, "levels", { ...DefaultLevelSettings(), rewards: [{ level: 1, roleId: REWARD }, { level: 3, roleId: ROLE }], stack: false });

    const member = FakeMember(guild, USER);

    guild.members.cache.set(USER, member);

    const set = await service.Adjust(guild, USER, "set", 1_000, OTHER);

    check("Setzen rechnet das Level neu", set?.xp === 1_000 && set.level === 4, `${set?.xp}/${set?.level}`);
    check("Dabei kommt die Belohnungsrolle", member.added.includes(ROLE), member.added.join(","));
    check("Ohne Sammeln fliegt die alte weg", member.removed.includes(REWARD) || !member.added.includes(REWARD));

    const added = await service.Adjust(guild, USER, "add", -900, OTHER);

    check("Abziehen geht auch", added?.xp === 100 && added.level === 1, String(added?.xp));

    await service.Adjust(guild, USER, "reset", 0, OTHER);

    check("Zurücksetzen löscht den Eintrag", (await client.levels.Of(GUILD, USER)) === null);

    let refused = false;

    try {
        await service.Save(guild, { announce: "channel", announceChannelId: null });
    } catch (error) {
        refused = error instanceof LevelError;
    }

    check("Ohne Kanal kein fester Kanal", refused);

    await service.Reset(guild);

    check("Die ganze Rangliste lässt sich löschen", (await client.levels.Total(GUILD)) === 0);
}

/** Plan 37, Task 1: Protokoll und Stand der Wochen- und Monatsposts. */
async function checkExtrasDatabase(client: BotClient): Promise<void> {
    console.log("\n  — Plan 37: Protokoll und Aktivste (Datenbank) —");

    const now = Date.now();
    const earlier = await client.levelLog.Recent(GUILD);

    check("Punkte von Hand (oben) stehen im Protokoll", earlier.map((entry) => entry.mode).join(",") === "reset,add,set" && earlier[1].before === 1_000 && earlier[1].after === 100, JSON.stringify(earlier.map((entry) => [entry.mode, entry.before, entry.after])));
    await client.databaseService.Write("DELETE FROM level_log WHERE guild_id = ?", [GUILD]);
    client.databaseService.Bump("level_log");

    check("Ein Zeitraum wird nur einmal beansprucht", (await client.levelTop.Claim(GUILD, "week", "2026-10-19", now)) && !(await client.levelTop.Claim(GUILD, "week", "2026-10-19", now)));
    check("Der nächste Zeitraum wieder", await client.levelTop.Claim(GUILD, "week", "2026-10-26", now));
    check("Woche und Monat getrennt", await client.levelTop.Claim(GUILD, "month", "2026-10", now));

    await client.levelTop.Finish(GUILD, "week", [USER, OTHER], "Die Rolle steht über meiner.");

    const week = await client.levelTop.Of(GUILD, "week");

    check("Inhaber und Fehler bleiben stehen", week?.holders.join(",") === `${USER},${OTHER}` && week.error === "Die Rolle steht über meiner." && week.periodKey === "2026-10-26", JSON.stringify(week));

    await client.levelTop.Claim(GUILD, "week", "2026-11-02", now);

    const next = await client.levelTop.Of(GUILD, "week");

    check("Neuer Zeitraum: Inhaber bleiben bis zum Post, der alte Fehler geht", next?.holders.length === 2 && next.error === null && next.periodKey === "2026-11-02", JSON.stringify(next));

    await client.levelLog.Add({ guildId: GUILD, userId: USER, actorId: OTHER, mode: "add", amount: -50, before: 120, after: 70, reason: "Spam im Chat", createdAt: now });
    await client.levelLog.Add({ guildId: GUILD, userId: OTHER, actorId: USER, mode: "set", amount: 500, before: 0, after: 500, reason: "", createdAt: now - 200 * 86_400_000 });

    const log = await client.levelLog.Recent(GUILD);

    check("Protokoll: neuester Eintrag zuerst, mit allem", log.length === 2 && log[0].userId === USER && log[0].amount === -50 && log[0].before === 120 && log[0].after === 70 && log[0].reason === "Spam im Chat" && log[0].actorId === OTHER, JSON.stringify(log[0]));
    check("Protokoll: nach 180 Tagen weg", (await client.levelLog.Prune(now - LEVEL_LOG_KEEP_DAYS * 86_400_000)) === 1 && (await client.levelLog.Recent(GUILD)).length === 1);

    // Plan 43: die Rangliste im Kanal - ein Eintrag je Server, Fehler gekürzt.
    await client.levelBoardPosts.Set({ guildId: GUILD, channelId: TEXT, messageId: "123", fingerprint: "a".repeat(40), error: null, updatedAt: now });
    await client.levelBoardPosts.Set({ guildId: GUILD, channelId: SPAM, messageId: null, fingerprint: "b".repeat(40), error: "x".repeat(300), updatedAt: now + 1 });

    const boardPost = await client.levelBoardPosts.Of(GUILD);

    check("Rangliste im Kanal (Datenbank): überschrieben statt doppelt, Fehler gekürzt", boardPost?.channelId === SPAM && boardPost.messageId === null && boardPost.fingerprint === "b".repeat(40) && boardPost.error?.length === 200 && boardPost.updatedAt === now + 1, JSON.stringify(boardPost));
    await client.levelBoardPosts.Remove(GUILD);
    check("Rangliste im Kanal (Datenbank): entfernt", (await client.levelBoardPosts.Of(GUILD)) === null);
}

async function cleanup(client: BotClient): Promise<void> {
    await client.databaseService.Write("DELETE FROM levels WHERE guild_id = ?", [GUILD]);
    await client.databaseService.Write("DELETE FROM module_settings WHERE guild_id = ?", [GUILD]);
    await client.databaseService.Write("DELETE FROM level_log WHERE guild_id = ?", [GUILD]);
    await client.databaseService.Write("DELETE FROM level_top WHERE guild_id = ?", [GUILD]);

    client.levels.Forget();
    client.moduleSettings.Forget();

    check("Aufgeräumt", (await client.levels.Total(GUILD)) === 0);
}

/* ----------------------------------------------------------
   Plan 34: eine Welt ohne Datenbank und Discord
   ---------------------------------------------------------- */
const QUARANTINE = "90071992547409958";
const VOICE = "90071992547409959";

interface ISent {
    to: string;
    channelId: string | null;
    text: string;
    payload: { content?: string; files?: unknown[]; flags?: unknown; components?: unknown[]; allowedMentions?: { users?: string[] } };
}

interface IWorld {
    client: BotClient;
    service: LevelService;
    guild: Guild;
    settings: ILevelSettings;
    levels: Map<string, ILevelEntry>;
    days: Map<string, { xp: number; messages: number; voiceMinutes: number }>;
    sent: ISent[];
    member: (id: string, options?: { roles?: string[]; timeout?: boolean; closed?: boolean }) => GuildMember;
    message: (member: GuildMember, content: string, id: string, channelId?: string) => Message;
    entry: (userId: string) => ILevelEntry;
    day: (userId: string, day?: number) => { xp: number; messages: number; voiceMinutes: number } | undefined;
    /** Plan 35: was an offene Dashboards ging. */
    pulses: { guildId: string; kind: string }[];
    /** Plan 37: das Protokoll der Punkte von Hand. */
    logs: ILevelLogEntry[];
    /** Plan 37: level_top, Server:Art → Stand. */
    tops: Map<string, { periodKey: string; holders: string[]; error: string | null; postedAt: number }>;
}

interface IWorldEnv {
    /** Die rohe Modul-Spalte des Servers (vor „immer an“). */
    modules?: string[];
    /** member_activity: je Person und Tag. */
    activity?: { userId: string; day: number; messages: number; voice: number }[];
    /** level_backfill: Server → claimed_at. */
    claims?: Map<string, number>;
    /** Plan 35: Kanäle nehmen keine Anhänge an. */
    noFiles?: boolean;
}

function World(extra: Partial<ILevelSettings> = {}, env: IWorldEnv = {}): IWorld {
    const guild = FakeGuild();
    const backfills = new Map<string, { claimedAt: number; cutoff: number; mode: string; cursor: string | null; members: number; xp: number; doneAt: number | null }>();

    for (const [guildId, at] of env.claims ?? []) backfills.set(guildId, { claimedAt: at, cutoff: Today(at), mode: "none", cursor: null, members: 0, xp: 0, doneAt: at });
    const settings: ILevelSettings = { ...DefaultLevelSettings(), ...extra, chat: { ...DefaultLevelSettings().chat, min: 20, max: 20, ...extra.chat } };
    const levels = new Map<string, ILevelEntry>();
    const days = new Map<string, { xp: number; messages: number; voiceMinutes: number }>();
    const sent: ISent[] = [];
    const pulses: { guildId: string; kind: string }[] = [];
    const logs: ILevelLogEntry[] = [];
    const tops = new Map<string, { periodKey: string; holders: string[]; error: string | null; postedAt: number }>();
    const boardPosts = new Map<string, ILevelBoardPost>();
    const key = (guildId: string, userId: string) => `${guildId}:${userId}`;
    const empty = (guildId: string, userId: string): ILevelEntry => ({ guildId, userId, xp: 0, level: 0, messages: 0, voiceMinutes: 0, lastMessage: 0 });
    const text = (payload: unknown) => JSON.stringify(payload);

    (guild as unknown as { voiceStates: { cache: Map<string, unknown> }; afkChannelId: string | null }).voiceStates = { cache: new Map() };
    (guild as unknown as { afkChannelId: string | null }).afkChannelId = null;
    (guild.members as unknown as { fetch: (id: unknown) => Promise<GuildMember> }).fetch = async () => {
        throw new Error("Unbekanntes Mitglied");
    };
    (guild.channels as unknown as { fetch: (id: unknown) => Promise<GuildBasedChannel> }).fetch = async () => {
        throw new Error("Unbekannter Kanal");
    };
    (guild.channels.cache as Map<string, GuildBasedChannel>).forEach((channel) =>
        Object.assign(channel, {
            send: async (payload: ISent["payload"]) => {
                if (payload.files && env.noFiles) throw new Error("Keine Rechte für Anhänge");

                sent.push({ to: "channel", channelId: channel.id, text: text(payload), payload });

                return { delete: async () => undefined };
            },
        })
    );

    const client = {
        databaseService: { Ready: true },
        settings: { Of: async () => ({ modules: ["levels"] }), RawModules: async () => env.modules ?? [] },
        activity: { MemberDays: async (_guildId: string, beforeDay: number) => (env.activity ?? []).filter((row) => row.day < beforeDay) },
        levelBackfill: {
            Of: async (guildId: string) => (backfills.has(guildId) ? { guildId, ...backfills.get(guildId)! } : null),
            Claim: async (guildId: string, now: number, cutoff: number, mode: string) => {
                await Promise.resolve();

                if (backfills.has(guildId)) return false;

                backfills.set(guildId, { claimedAt: now, cutoff, mode, cursor: null, members: 0, xp: 0, doneAt: null });

                return true;
            },
            Resume: async (guildId: string, now: number, since: number) => {
                const row = backfills.get(guildId);

                if (!row || row.doneAt !== null || row.claimedAt >= since) return false;

                row.claimedAt = now;

                return true;
            },
            Progress: async (guildId: string, cursor: string, members: number, xp: number) => void Object.assign(backfills.get(guildId)!, { cursor, members, xp }),
            Finish: async (guildId: string, result: { mode: string; cutoff: number; members: number; xp: number }, now: number) => void Object.assign(backfills.get(guildId)!, result, { doneAt: now }),
            FirstCutoff: async () => (backfills.size ? Math.min(...[...backfills.values()].map((row) => row.cutoff)) : null),
        },
        moduleSettings: { Of: async () => settings, Save: async (_guildId: string, _module: string, next: ILevelSettings) => void Object.assign(settings, next) },
        antiVillainService: { Settings: async () => ({ quarantine: { roleId: QUARANTINE } }) },
        pulseService: { Emit: (guildId: string, kind: string) => void pulses.push({ guildId, kind }) },
        levelTop: {
            Of: async (guildId: string, kind: string) => (tops.has(`${guildId}:${kind}`) ? { guildId, kind, ...tops.get(`${guildId}:${kind}`)!, holders: [...tops.get(`${guildId}:${kind}`)!.holders] } : null),
            Claim: async (guildId: string, kind: string, periodKey: string, now: number) => {
                const row = tops.get(`${guildId}:${kind}`);

                if (row?.periodKey === periodKey) return false;

                tops.set(`${guildId}:${kind}`, { periodKey, holders: row?.holders ?? [], error: null, postedAt: now });

                return true;
            },
            Finish: async (guildId: string, kind: string, holders: string[], error: string | null) => void Object.assign(tops.get(`${guildId}:${kind}`)!, { holders, error }),
        },
        levelBoardPosts: {
            Of: async (guildId: string) => (boardPosts.has(guildId) ? { ...boardPosts.get(guildId)! } : null),
            Set: async (post: ILevelBoardPost) => void boardPosts.set(post.guildId, { ...post }),
            Remove: async (guildId: string) => void boardPosts.delete(guildId),
        },
        levelLog: { Add: async (entry: Omit<ILevelLogEntry, "id">) => void logs.push({ id: logs.length + 1, ...entry }), Recent: async (_guildId: string, limit = 50) => [...logs].reverse().slice(0, limit) },
        galleryService: { GetImage: async () => null, Attach: () => ({ media: new Map(), files: [] }) },
        guilds: { cache: new Map([[GUILD, guild]]) },
        levels: {
            Of: async (guildId: string, userId: string) => (levels.has(key(guildId, userId)) ? { ...levels.get(key(guildId, userId))! } : null),
            Add: async (guildId: string, userId: string, xp: number, more: { messages?: number; voiceMinutes?: number; stamp?: number }) => {
                const entry = levels.get(key(guildId, userId)) ?? empty(guildId, userId);

                entry.xp += Math.max(0, Math.round(xp));
                entry.messages += more.messages ?? 0;
                entry.voiceMinutes += more.voiceMinutes ?? 0;
                entry.lastMessage = Math.max(entry.lastMessage, more.stamp ?? 0);
                levels.set(key(guildId, userId), entry);
            },
            Take: async (guildId: string, userId: string, xp: number) => {
                const entry = levels.get(key(guildId, userId));

                if (entry) entry.xp = Math.max(0, entry.xp - Math.round(xp));
            },
            SetLevel: async (guildId: string, userId: string, level: number) => void (levels.get(key(guildId, userId))!.level = level),
            Set: async (guildId: string, userId: string, xp: number, level: number) => void levels.set(key(guildId, userId), { ...(levels.get(key(guildId, userId)) ?? empty(guildId, userId)), xp, level }),
            All: async (guildId: string) => [...levels.values()].filter((entry) => entry.guildId === guildId && entry.xp > 0).map((entry) => ({ ...entry })),
            Rank: async () => 1,
            Total: async () => levels.size,
            Remove: async (guildId: string, userId: string) => void levels.delete(key(guildId, userId)),
            Clear: async (guildId: string) => {
                for (const id of [...levels.keys()]) if (id.startsWith(`${guildId}:`)) levels.delete(id);
            },
        },
        levelDays: {
            Clear: async (guildId: string, userId?: string) => {
                for (const id of [...days.keys()]) if (id.startsWith(userId ? `${guildId}:${userId}:` : `${guildId}:`)) days.delete(id);
            },
            Sums: async (guildId: string, fromDay: number, toDay: number) => {
                const sums = new Map<string, { userId: string; xp: number; messages: number; voiceMinutes: number }>();

                for (const [id, row] of days) {
                    const [rowGuild, userId, dayText] = id.split(":");
                    const dayNumber = Number(dayText);

                    if (rowGuild !== guildId || dayNumber < fromDay || dayNumber > toDay) continue;

                    const sum = sums.get(userId) ?? { userId, xp: 0, messages: 0, voiceMinutes: 0 };

                    sum.xp += row.xp;
                    sum.messages += row.messages;
                    sum.voiceMinutes += row.voiceMinutes;
                    sums.set(userId, sum);
                }

                return [...sums.values()];
            },
            AddMany: async (rows: { guildId: string; userId: string; day: number; xp: number; messages: number; voiceMinutes: number }[]) => {
                for (const row of rows) {
                    const id = `${key(row.guildId, row.userId)}:${row.day}`;
                    const current = days.get(id) ?? { xp: 0, messages: 0, voiceMinutes: 0 };

                    days.set(id, { xp: current.xp + row.xp, messages: current.messages + row.messages, voiceMinutes: current.voiceMinutes + row.voiceMinutes });
                }
            },
            Add: async (guildId: string, userId: string, dayNumber: number, delta: { xp?: number; messages?: number; voiceMinutes?: number }) => {
                const id = `${key(guildId, userId)}:${dayNumber}`;
                const row = days.get(id) ?? { xp: 0, messages: 0, voiceMinutes: 0 };

                row.xp = Math.max(0, row.xp + Math.round(delta.xp ?? 0));
                row.messages += delta.messages ?? 0;
                row.voiceMinutes += delta.voiceMinutes ?? 0;
                days.set(id, row);
            },
        },
    } as unknown as BotClient;
    const service = new LevelService(client);

    (client as unknown as { levelService: LevelService }).levelService = service;

    return {
        client,
        service,
        guild,
        settings,
        levels,
        days,
        sent,
        pulses,
        logs,
        tops,
        member: (id, options = {}) => {
            const member = FakeMember(guild, id, options.roles ?? []);

            Object.assign(member, {
                displayAvatarURL: () => null,
                isCommunicationDisabled: () => options.timeout === true,
                send: async (payload: unknown) => {
                    if (options.closed) throw new Error("DMs zu");

                    sent.push({ to: id, channelId: null, text: text(payload), payload: payload as ISent["payload"] });

                    return { delete: async () => undefined };
                },
            });
            (guild.members.cache as Map<string, GuildMember>).set(id, member);

            return member;
        },
        message: (member, content, id, channelId = TEXT) =>
            ({ id, content, inGuild: () => true, guildId: GUILD, guild, member, author: member.user, channelId, channel: { id: channelId, parentId: null } }) as unknown as Message,
        entry: (userId) => levels.get(key(GUILD, userId)) ?? empty(GUILD, userId),
        day: (userId, dayNumber = Today()) => days.get(`${key(GUILD, userId)}:${dayNumber}`),
    };
}

/* ----------------------------------------------------------
   Plan 34, Task 2: zählen, Farm-Schutz, AutoMod
   ---------------------------------------------------------- */
async function checkCounting(): Promise<void> {
    console.log("\n  — Zählen und Farm-Schutz —");

    check("Unter 5 Zeichen: keine Punkte", !CountsForPoints("hey") && !CountsForPoints("😀😀😀😀😀") && !CountsForPoints("https://x.y/abc") && !CountsForPoints("<:gg:123456789012345678> ok") && CountsForPoints("gg wp alle"));

    const world = World();
    const lara = world.member(USER);

    await world.service.Message(world.message(lara, "gg wp alle", "m1"));
    const firstXp = world.entry(USER).xp;
    await world.service.Message(world.message(lara, "noch eine nachricht", "m2"));
    check("Nachricht in der Sperre: gezählt, keine Punkte", firstXp === 20 && world.entry(USER).messages === 2 && world.entry(USER).xp === firstXp, JSON.stringify(world.entry(USER)));
    check("Tageswert mitgeschrieben", world.day(USER)?.messages === 2 && world.day(USER)?.xp === firstXp, JSON.stringify(world.day(USER)));

    const free = World({ chat: { on: true, min: 20, max: 20, cooldown: 0 } });
    const mo = free.member(OTHER);

    await free.service.Message(free.message(mo, "Gleiche Nachricht", "r1"));
    await free.service.Message(free.message(mo, "gleiche nachricht ", "r2"));
    await free.service.Message(free.message(mo, "andere Nachricht", "r3"));
    check("Dieselbe Nachricht zweimal: einmal Punkte", free.entry(OTHER).xp === 40 && free.entry(OTHER).messages === 3, JSON.stringify(free.entry(OTHER)));

    const muted = free.member("90071992547409960", { timeout: true });

    await free.service.Message(free.message(muted, "ich darf nichts", "t1"));
    check("Timeout: gezählt, keine Punkte", free.entry(muted.id).messages === 1 && free.entry(muted.id).xp === 0, JSON.stringify(free.entry(muted.id)));

    const held = free.member("90071992547409961", { roles: [QUARANTINE] });

    await free.service.Message(free.message(held, "ich sitze fest", "q1"));
    check("Quarantäne-Rolle: keine Punkte", free.entry(held.id).messages === 1 && free.entry(held.id).xp === 0, JSON.stringify(free.entry(held.id)));

    const alone = free.member("90071992547409962");
    const voiceChannel = { id: VOICE, parentId: null, members: new Map([[alone.id, alone]]) };

    (free.guild as unknown as { voiceStates: { cache: Map<string, unknown> } }).voiceStates.cache.set(alone.id, { member: alone, channel: voiceChannel, channelId: VOICE, selfMute: true, selfDeaf: false, mute: false, deaf: false });
    await free.service.Voice();
    check("Voice allein und stumm: Minute gezählt, keine Punkte", free.entry(alone.id).voiceMinutes === 1 && free.entry(alone.id).xp === 0, JSON.stringify(free.entry(alone.id)));

    const spam = free.member("90071992547409963");
    const after = free.message(spam, "das wird geloescht", "a1");

    await free.service.Message(after);
    await free.service.Revoke(after);
    check("AutoMod nach der Gutschrift: Punkte zurück, nie negativ", free.entry(spam.id).xp === 0 && free.entry(spam.id).messages === 1 && free.day(spam.id)?.xp === 0, JSON.stringify(free.entry(spam.id)));

    const early = free.member("90071992547409964");
    const before = free.message(early, "auch das wird geloescht", "b1");

    await free.service.Revoke(before);
    await free.service.Message(before);
    check("AutoMod vor der Gutschrift: keine Punkte", free.entry(early.id).xp === 0 && free.entry(early.id).messages === 1, JSON.stringify(free.entry(early.id)));
}

/* ----------------------------------------------------------
   Plan 34, Task 3: Aufstieg - Chat oder DM, Kanal, Löschen
   ---------------------------------------------------------- */
async function checkAnnounce(): Promise<void> {
    console.log("\n  — Aufstieg —");

    const message = { blocks: [{ type: "text" as const, body: "{level.old} → {level} für {user.name}" }] };
    const jump = World({ message });
    const lara = jump.member(USER);
    const scheduled: number[] = [];

    jump.service.Later = (ms) => void scheduled.push(ms);
    await jump.service.Credit(lara, XpForLevel(12, jump.settings.base), { messages: 1 }, jump.settings, TEXT);
    check("Sprung 0 → 12: genau eine Nachricht mit altem und neuem Level", jump.sent.length === 1 && jump.sent[0].text.includes("0 → 12"), JSON.stringify(jump.sent));
    check("Ohne Löschzeit: nichts geplant", scheduled.length === 0, JSON.stringify(scheduled));

    const voice = World();
    const mo = voice.member(OTHER);

    await voice.service.Credit(mo, XpForLevel(1, voice.settings.base), { voiceMinutes: 1 }, voice.settings, null);
    // W-0043: Aufstiege nie mehr per DM.
    check("Voice ohne festen Kanal: keine Nachricht, keine DM", voice.sent.length === 0, JSON.stringify(voice.sent));

    const gone = World({ announce: "channel", announceChannelId: "999" });

    await gone.service.Credit(gone.member(OTHER), XpForLevel(1, gone.settings.base), { messages: 1 }, gone.settings, TEXT);
    check("Fester Kanal gelöscht: keine DM", gone.sent.length === 0, JSON.stringify(gone.sent));

    const fixed = World({ announceChannelId: SPAM, announceDelete: 5 });
    const ben = fixed.member(OTHER);
    const later: number[] = [];

    fixed.service.Later = (ms) => void later.push(ms);
    await fixed.service.Credit(ben, XpForLevel(1, fixed.settings.base), { voiceMinutes: 1 }, fixed.settings, null);
    check("Voice mit festem Kanal: dort", fixed.sent.length === 1 && fixed.sent[0].channelId === SPAM, JSON.stringify(fixed.sent));
    check("Löschen nach 5 Min.: geplant", later[0] === 5 * 60_000, JSON.stringify(later));

    // Gespeichert vor W-0043: „Als Direktnachricht“ läuft im festen Kanal weiter.
    const dm = World({ announce: "dm" as unknown as ILevelSettings["announce"], announceChannelId: SPAM, announceDelete: 5 });
    const zoe = dm.member(OTHER);
    const planned: number[] = [];

    dm.service.Later = (ms) => void planned.push(ms);
    await dm.service.Credit(zoe, XpForLevel(1, dm.settings.base), { messages: 1 }, dm.settings, TEXT);
    check("Alte Wahl „DM“: Nachricht im festen Kanal, wird gelöscht", dm.sent.length === 1 && dm.sent[0].channelId === SPAM && planned[0] === 5 * 60_000, JSON.stringify({ sent: dm.sent.map((entry) => entry.channelId ?? entry.to), planned }));
    check("Alte Wahl „DM“ wird beim Lesen zum festen Kanal", (await dm.service.Settings(GUILD)).announce === "channel");
    check("Alte Wahl „DM“ wird beim Speichern zum festen Kanal", dm.service.Clean(dm.guild, { announce: "dm" }, dm.settings).announce === "channel");

    const noChannel = await World().service.Save(FakeGuild(), { announce: "current", announceChannelId: null }).catch((error: Error) => error);
    const quiet = await World().service.Save(FakeGuild(), { announce: "off", announceChannelId: null }).catch((error: Error) => error);

    check("Aufstieg an, aber kein Kanal: Speichern abgelehnt", noChannel instanceof LevelError, String(noChannel));
    check("Aufstieg aus: ohne Kanal gespeichert", !(quiet instanceof Error) && quiet.announce === "off", String(quiet));

    // Andere Seiten speichern nur ihren Teil (öffentlich, Rangliste im Kanal) - das scheitert nicht am fehlenden Aufstiegs-Kanal.
    const elsewhere = await World().service.Save(FakeGuild(), { public: true }).catch((error: Error) => error);

    check("Nur „öffentlich“ gespeichert: geht auch ohne Aufstiegs-Kanal", !(elsewhere instanceof Error) && elsewhere.public === true, String(elsewhere));

    const base = World().settings;
    const clean = (value: unknown) => new LevelService({} as BotClient).Clean(FakeGuild(), { ...base, announceDelete: value }, base).announceDelete;

    check("Ungültige Löschzeit wird 0", clean(7) === 0 && clean(15) === 15 && clean("60") === 0, `${clean(7)} ${clean(15)} ${clean("60")}`);
}

/* ----------------------------------------------------------
   Plan 34, Task 4: Nachtrag und Vorfüllen
   ---------------------------------------------------------- */
async function checkBackfill(): Promise<void> {
    console.log("\n  — Nachtrag und Vorfüllen —");

    const now = Date.now();
    const cutoff = Today(now);
    const ZEN2 = "90071992547409965";
    const activity = [
        { userId: USER, day: cutoff - 3, messages: 100, voice: 200 },
        { userId: USER, day: cutoff - 2, messages: 200, voice: 400 },
        { userId: USER, day: cutoff, messages: 50, voice: 0 },
        { userId: OTHER, day: cutoff - 2, messages: 10, voice: 0 },
        { userId: ZEN2, day: cutoff - 1, messages: 30, voice: 0 },
    ];
    // W-0043: Aufstiege aus dem Nachtrag landen im festen Kanal, per DM nicht mehr.
    const off = World({ noRoles: [ROLE], announceChannelId: TEXT }, { modules: [], activity });
    const waits: number[] = [];

    off.member(USER);
    off.member(OTHER, { roles: [ROLE] });
    off.member(ZEN2);

    const first = await RunBackfill(off.client, now, async (ms) => void waits.push(ms));
    const lifetime = (world: IWorld, userId: string) => world.entry(userId).xp;

    check("Modul aus: alles gutgeschrieben ohne Deckel", lifetime(off, USER) === 300 * 20 + 600 * 5 && off.entry(USER).messages === 300 && off.entry(USER).voiceMinutes === 600, JSON.stringify(off.entry(USER)));
    check("Modul aus: eine Aufstiegsnachricht je Person, verteilt", off.sent.length === 2 && waits.length === 1 && waits.every((ms) => ms === 3_000), JSON.stringify({ sent: off.sent.map((entry) => entry.channelId ?? entry.to), waits }));
    check("Rolle ohne Punkte: nichts", lifetime(off, OTHER) === 0);
    check("Tag D0 selbst zählt nicht", off.day(USER, cutoff) === undefined && off.day(USER, cutoff - 2)?.xp === 200 * 20 + 400 * 5, JSON.stringify([...off.days.keys()]));
    check("Nachtrag gemerkt", first.length === 1 && first[0].mode === "backfill" && first[0].members === 2, JSON.stringify(first));

    const second = await RunBackfill(off.client, now + 60_000, async (ms) => void waits.push(ms));
    check("Zweiter Lauf: nichts doppelt", second.length === 0 && lifetime(off, USER) === 300 * 20 + 600 * 5, JSON.stringify(second));   // Review Focus 2

    const on = World({}, { modules: ["levels"], activity: [{ userId: OTHER, day: cutoff - 1, messages: 50, voice: 0 }] });

    on.member(OTHER);
    await on.client.levels.Add(GUILD, OTHER, 777, {});
    await RunBackfill(on.client, now, async () => undefined);
    check("Modul an: nur Tageswerte, Lifetime unberührt", lifetime(on, OTHER) === 777 && on.day(OTHER, cutoff - 1)?.xp === 50 * 20 && on.sent.length === 0, JSON.stringify(on.entry(OTHER)));

    const race = World({}, { modules: [], activity });
    const original = race.client.levelBackfill.Claim.bind(race.client.levelBackfill);
    const claims: boolean[] = [];

    race.member(USER);
    race.client.levelBackfill.Claim = async (guildId: string, at: number, cutoffDay: number, mode: LevelBackfillMode) => {
        const won = await original(guildId, at, cutoffDay, mode);

        claims.push(won);

        return won;
    };
    await Promise.all([RunBackfill(race.client, now, async () => undefined), RunBackfill(race.client, now, async () => undefined)]);
    check("Zwei Läufe gleichzeitig: einer schreibt", claims.filter(Boolean).length === 1 && lifetime(race, USER) === 300 * 20 + 600 * 5, JSON.stringify({ claims, xp: lifetime(race, USER) }));   // Review Focus 2

    const earlier = new Map([["90071992547409999", now - 5 * 86_400_000]]);
    const late = World({}, { modules: [], activity: [{ userId: USER, day: cutoff - 2, messages: 40, voice: 0 }], claims: earlier });

    late.member(USER);

    const lateRun = await RunBackfill(late.client, now, async () => undefined);
    check("Server nach dem Ausrollen beigetreten: nichts", lateRun[0]?.mode === "none" && lifetime(late, USER) === 0, JSON.stringify(lateRun));   // Review Focus 3
}

/* ----------------------------------------------------------
   Plan 34, Task 5: Zeiträume, Trend, Board
   ---------------------------------------------------------- */
async function checkBoard(): Promise<void> {
    console.log("\n  — Zeiträume und Trend —");

    check("Voice-Text", VoiceText(2310) === "2.310 Min. (38,5 Std.)" && VoiceText(420) === "420 Min. (7 Std.)" && VoiceHours(270) === "4,5 Std.", `${VoiceText(2310)} | ${VoiceText(420)} | ${VoiceHours(270)}`);
    check("Reihenfolge bei Gleichstand nach ID, ohne Nullen", [...RankOrder([{ userId: "b", xp: 5 }, { userId: "a", xp: 5 }, { userId: "c", xp: 0 }]).keys()].join() === "a,b");
    check("Trend", Trend(new Map([["x", 2]]), new Map([["x", 5]]), "x") === 3 && Trend(new Map([["x", 2]]), new Map(), "x") === "new");

    const today = Today();
    const world = World();
    const A = "90071992547410001";
    const KYRO = "90071992547410002";
    const NEWBIE = "90071992547410003";
    const OLD = "90071992547410004";
    const prev = ["90071992547410011", "90071992547410012", "90071992547410013"];
    const put = async (userId: string, day: number, xp: number) => world.client.levelDays.Add(GUILD, userId, day, { xp, messages: 1, voiceMinutes: 2 });

    for (const userId of [A, KYRO, NEWBIE, OLD, ...prev]) world.member(userId);
    await world.client.levels.Add(GUILD, A, 5500, {});
    await world.client.levels.Add(GUILD, KYRO, 900, {});
    await world.client.levels.Add(GUILD, NEWBIE, 10, {});
    await world.client.levels.Add(GUILD, OLD, 570, {});
    await put(A, today, 100);
    await put(A, today - 6, 50);
    await put(A, today - 7, 999);
    await put(KYRO, today, 120);
    await put(KYRO, today - 8, 5);
    await put(NEWBIE, today - 1, 10);
    await put(OLD, today - 29, 70);
    await put(OLD, today - 30, 500);
    for (const [index, userId] of prev.entries()) {
        await world.client.levels.Add(GUILD, userId, 100, {});
        await put(userId, today - 10, 40 - index * 10);
    }

    const page7 = await world.service.Board(world.guild, "7d", 1, null);
    const page30 = await world.service.Board(world.guild, "30d", 1, null);

    check("7 Tage zählt nur die letzten 7 Tage", page7.entries[0]?.userId === A && page7.entries[0].xp === 150, JSON.stringify(page7.entries.map((entry) => [entry.userId.slice(-2), entry.xp])));
    check("30 Tage gleitend", page30.entries.find((entry) => entry.userId === OLD)?.xp === 70, JSON.stringify(page30.entries.map((entry) => [entry.userId.slice(-2), entry.xp])));
    check("Level bleibt Lifetime", page7.entries[0]?.level === 10, String(page7.entries[0]?.level));
    check("Trend: 3 Plätze gestiegen", page7.entries.find((entry) => entry.userId === KYRO)?.trend === 3, JSON.stringify(page7.entries.map((entry) => [entry.userId.slice(-2), entry.trend])));
    check("Trend: neu", page7.entries.find((entry) => entry.userId === NEWBIE)?.trend === "new");
    check("Zeitraum-Daten", page7.range?.from === today - 6 && page7.range?.to === today && (await world.service.Board(world.guild, "all", 1, null)).range === null);

    const many = World();

    for (let index = 1; index <= 30; index++) {
        const userId = `9007199254741${String(index).padStart(4, "0")}`;

        many.member(userId);
        await many.client.levels.Add(GUILD, userId, 3000 - index * 10, {});
    }

    const last = await many.service.Board(many.guild, "all", 99, null);
    check("Seite außerhalb wird geklemmt", last.page === 3 && last.pages === 3 && last.entries.length === 10, `${last.page}/${last.pages}`);   // Review Focus 4
    check("Eigener Platz auf Seite 3", (await many.service.PageOf(many.guild, "all", "90071992547410025")) === 3);
    check("Betrachter wird mitgeliefert", (await many.service.Board(many.guild, "all", 1, "90071992547410025")).viewer?.rank === 25);
}

/* ----------------------------------------------------------
   Plan 34, Task 6: Bilder, Befehle, Knöpfe
   ---------------------------------------------------------- */
const isPng = (buffer: unknown) => Buffer.isBuffer(buffer) && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

function Buttons(payload: unknown): { custom_id?: string; label?: string; style?: number; disabled?: boolean }[] {
    const rows = (payload as { components?: { toJSON: () => { components: unknown[] } }[] }).components ?? [];

    return rows.flatMap((row) => row.toJSON().components as { custom_id?: string; label?: string; style?: number; disabled?: boolean }[]);
}

async function checkImages(): Promise<void> {
    console.log("\n  — Bilder, Befehle, Knöpfe —");

    const card = await RenderLevelCard({ name: "MecryTv | Joe", avatarURL: null, level: 12, xp: 8606, into: 806, need: 1300, rank: 3, total: 214, messages: 1248, voiceMinutes: 2310 });
    const rank = RankPayload(card) as { files?: unknown[]; components?: unknown[]; flags?: unknown; content?: unknown };

    check("Rang: nur Anhang", rank.files?.length === 1 && !rank.components?.length && !rank.flags && !rank.content, JSON.stringify(Object.keys(rank)));
    check("Rang-Karte: Voice mit Stunden", CardLine(1248, 2310) === "1.248 Nachrichten · 2.310 Min. im Voice (38,5 Std.)", CardLine(1248, 2310));

    const world = World();
    const OWNER = USER;

    for (let index = 1; index <= 25; index++) {
        const userId = `9007199254742${String(index).padStart(4, "0")}`;

        world.member(userId);
        await world.client.levels.Add(GUILD, userId, 3000 - index * 10, { messages: 10, voiceMinutes: 90 });
        await world.client.levelDays.Add(GUILD, userId, Today(), { xp: 300 - index, messages: 3, voiceMinutes: 20 });
    }

    world.member(OWNER);

    const drawn: { podium: number; rows: number }[] = [];
    const first = await world.service.Board(world.guild, "all", 1, OWNER);
    const second = await world.service.Board(world.guild, "all", 2, OWNER);
    const page1 = await RenderLeaderboard({ guildName: "Dev Server", page: first, viewerId: OWNER }, { onDraw: (count) => void drawn.push(count) });
    const page2 = await RenderLeaderboard({ guildName: "Dev Server", page: second, viewerId: OWNER }, { onDraw: (count) => void drawn.push(count) });

    check("Rangliste: PNG, Seite 1 mit Podium", isPng(page1) && drawn[0]?.podium === 3 && drawn[0]?.rows === 7, JSON.stringify(drawn[0]));
    check("Rangliste Seite 2: zehn Zeilen", isPng(page2) && drawn[1]?.podium === 0 && drawn[1]?.rows === 10, JSON.stringify(drawn[1]));

    const message = await BoardMessage(world.client, world.guild, "7d", 1, OWNER, OWNER);
    const buttons = Buttons(message);

    check("Knöpfe: aktiver Zeitraum hervorgehoben, Seite aus", buttons.find((button) => button.custom_id === `lv:p:7d:1:${OWNER}`)?.style === 1 && buttons.find((button) => button.custom_id === "lv:x")?.disabled === true && buttons.find((button) => button.custom_id === `lv:p:all:1:${OWNER}`)?.style === 2, JSON.stringify(buttons));
    check("Zurück auf Seite 1 aus, Meine Seite da", buttons.find((button) => button.label === "◀ Zurück")?.disabled === true && buttons.some((button) => button.custom_id === `lv:me:7d:${OWNER}`));

    let updates = 0;
    let ephemeral = 0;
    const shown: unknown[] = [];
    const click = (customId: string, userId: string) =>
        HandleBoardButton(world.client, {
            customId,
            user: { id: userId },
            guild: world.guild,
            deferUpdate: async () => void updates++,
            deferReply: async () => void ephemeral++,
            editReply: async (payload: unknown) => void shown.push(payload),
        } as unknown as ButtonInteraction);

    await click(`lv:p:all:2:${OWNER}`, "90071992547420001");
    check("Fremder Klick: eigene Antwort, Nachricht bleibt", updates === 0 && ephemeral === 1, `${updates}/${ephemeral}`);   // Review Focus 4

    await click(`lv:p:all:2:${OWNER}`, OWNER);
    check("Owner-Klick: Nachricht ändert sich", updates === 1 && ephemeral === 1);

    await click(`lv:p:all:99:${OWNER}`, OWNER);
    const label = Buttons(shown.at(-1)).find((button) => button.custom_id === "lv:x")?.label;
    check("Alter Knopf auf Seite 99: letzte Seite", label === "Seite 3 von 3", label);   // Review Focus 4

    await click(`lv:me:all:${OWNER}`, "90071992547420015");
    const mine = Buttons(shown.at(-1)).find((button) => button.custom_id === "lv:x")?.label;
    check("Meine Seite: Seite des Drückers", mine === "Seite 2 von 3" && ephemeral === 2, mine);

    const empty = World();
    const none = (await BoardMessage(empty.client, empty.guild, "30d", 1, OWNER, OWNER)) as { content?: string };
    check("Niemand im Zeitraum: kurzer Text", none.content === "Im Zeitraum hat noch niemand Punkte.", JSON.stringify(none));
}

/* ----------------------------------------------------------
   Plan 43, Task 3: Rangliste als feste Nachricht im Kanal
   ---------------------------------------------------------- */

/** Kanäle mit echten Nachrichten: senden, holen, bearbeiten, löschen. deny: Senden verboten, flaky: Holen scheitert vorübergehend. */
function BoardChannels(world: IWorld) {
    const messages = new Map<string, { channelId: string; payload: unknown }>();
    const log: string[] = [];
    const state = { deny: false, flaky: false };
    let next = 1;

    for (const channel of world.guild.channels.cache.values()) {
        Object.assign(channel, {
            send: async (payload: unknown) => {
                if (state.deny) throw Object.assign(new Error("Missing Permissions"), { code: 50013 });

                const id = `m${next++}`;

                messages.set(id, { channelId: channel.id, payload });
                log.push(`send ${channel.id} ${id}`);

                return { id, channelId: channel.id };
            },
            messages: {
                fetch: async (id: string) => {
                    if (state.flaky) throw Object.assign(new Error("Service Unavailable"), { status: 503 });

                    const found = messages.get(id);

                    if (!found || found.channelId !== channel.id) throw Object.assign(new Error("Unknown Message"), { code: 10008 });

                    return {
                        id,
                        edit: async (payload: unknown) => {
                            found.payload = payload;
                            log.push(`edit ${id}`);

                            return { id };
                        },
                        delete: async () => {
                            messages.delete(id);
                            log.push(`delete ${id}`);
                        },
                    };
                },
            },
        });
    }

    return { messages, log, state };
}

async function checkBoardPost(): Promise<void> {
    console.log("\n  — Plan 43: Rangliste im Kanal —");

    // Fingerabdruck
    const page = (xp: number, name = "Lara", period: IBoardPage["period"] = "all"): IBoardPage => ({
        period,
        page: 1,
        pages: 1,
        total: 1,
        entries: [{ rank: 1, userId: USER, name, avatar: null, level: 3, xp, messages: 1, voiceMinutes: 0, trend: 0, into: 1, need: 2 }],
        range: null,
        viewer: null,
        sum: { xp, voiceMinutes: 0 },
    });

    check("Fingerabdruck: gleiche Seite, gleicher Abdruck", BoardFingerprint(page(100), "d") === BoardFingerprint(page(100), "d"));
    check(
        "Fingerabdruck: anders bei Punkten, Namen, Zeitraum, Design",
        new Set([BoardFingerprint(page(100), "d"), BoardFingerprint(page(101), "d"), BoardFingerprint(page(100, "Mo"), "d"), BoardFingerprint(page(100, "Lara", "7d"), "d"), BoardFingerprint(page(100), "e")]).size === 5
    );

    // Einstellungen
    const base = DefaultLevelSettings();
    const service = new LevelService({} as BotClient);

    check("Vorgabe: Rangliste im Kanal aus", JSON.stringify(base.boardPost) === JSON.stringify({ on: false, channelId: null, period: "all" }), JSON.stringify(base.boardPost));

    const wrong = service.Clean(FakeGuild(), { boardPost: { on: true, channelId: "999", period: "quatsch" } }, base).boardPost;
    const right = service.Clean(FakeGuild(), { boardPost: { on: true, channelId: TEXT, period: "7d" } }, base).boardPost;

    check("Bereinigung: fremder Kanal → null, unbekannter Zeitraum → Lifetime", wrong.on && wrong.channelId === null && wrong.period === "all", JSON.stringify(wrong));
    check("Bereinigung: echter Kanal und Zeitraum bleiben", right.channelId === TEXT && right.period === "7d", JSON.stringify(right));
    check("Ohne Angabe bleibt die Rangliste im Kanal, wie sie war", service.Clean(FakeGuild(), {}, { ...base, boardPost: right }).boardPost.channelId === TEXT);

    const noChannel = await World().service.Save(FakeGuild(), { announceChannelId: TEXT, boardPost: { on: true, channelId: null } }).catch((error: Error) => error);

    check("An ohne Kanal: Speichern abgelehnt", noChannel instanceof LevelError && noChannel.message.includes("Rangliste"), String(noChannel));

    // Die Nachricht
    const world = World({ boardPost: { on: true, channelId: TEXT, period: "all" } });
    const discord = BoardChannels(world);
    const state = () => world.client.levelBoardPosts.Of(GUILD);

    world.member(USER);
    await world.client.levels.Add(GUILD, USER, 500, { messages: 3 });

    const payload = await BoardChannelPayload(world.client, world.guild, await world.service.Board(world.guild, "all", 1, null));
    const buttons = Buttons(payload);

    check("Knöpfe im Kanal: alle acht in Reihenfolge", buttons.map((button) => button.label).join("|") === "Lifetime|7 Tage|30 Tage|◀ Zurück|Seite 1 von 1|Weiter ▶|Meine Seite|Meine Karte", buttons.map((button) => button.label).join("|"));
    check("Knöpfe im Kanal gehören niemandem", buttons.every((button) => button.custom_id === "lv:x" || button.custom_id === "lv:card" || button.custom_id?.endsWith(":kanal")), JSON.stringify(buttons.map((button) => button.custom_id)));

    check("Erster Blick: Nachricht geschickt", (await PostBoard(world.client, world.guild, world.settings, false)) === "sent" && discord.log.join() === `send ${TEXT} m1`, discord.log.join());

    const first = await state();

    check("Zustand: Kanal, Nachricht, Fingerabdruck, kein Fehler", first?.channelId === TEXT && first.messageId === "m1" && first.fingerprint.length > 0 && first.error === null, JSON.stringify(first));
    check("Nichts geändert: nichts bearbeitet", (await PostBoard(world.client, world.guild, world.settings, false)) === "unchanged" && discord.log.length === 1, discord.log.join());

    await world.client.levels.Add(GUILD, USER, 50, { messages: 1 });
    check("Punkte geändert: Nachricht bearbeitet", (await PostBoard(world.client, world.guild, world.settings, false)) === "edited" && discord.log.at(-1) === "edit m1", discord.log.join());
    check("Jetzt neu zeichnen: bearbeitet auch ohne Änderung", (await PostBoard(world.client, world.guild, world.settings, true)) === "edited" && discord.log.at(-1) === "edit m1", discord.log.join());

    discord.messages.delete("m1");
    check("Nachricht gelöscht: neu geschickt", (await PostBoard(world.client, world.guild, world.settings, false)) === "sent" && discord.log.at(-1) === `send ${TEXT} m2` && (await state())?.messageId === "m2", discord.log.join());

    discord.state.flaky = true;
    check("Aussetzer bei Discord: nicht doppelt geschickt", (await PostBoard(world.client, world.guild, world.settings, true)) === "failed" && discord.log.at(-1) === `send ${TEXT} m2` && (await state())?.messageId === "m2", discord.log.join());
    discord.state.flaky = false;

    world.settings.boardPost = { on: true, channelId: SPAM, period: "all" };
    check("Kanal gewechselt: alte weg, neue im neuen Kanal", (await PostBoard(world.client, world.guild, world.settings, false)) === "sent" && discord.log.slice(-2).join() === `delete m2,send ${SPAM} m3` && (await state())?.channelId === SPAM, discord.log.join());

    world.settings.boardPost = { on: false, channelId: SPAM, period: "all" };
    check("Ausgeschaltet: Nachricht weg, Zustand weg", (await PostBoard(world.client, world.guild, world.settings, false)) === "off" && discord.log.at(-1) === "delete m3" && (await state()) === null, discord.log.join());

    world.settings.boardPost = { on: true, channelId: TEXT, period: "all" };
    discord.state.deny = true;
    check("Keine Rechte: Fehler im Zustand statt Abbruch", (await PostBoard(world.client, world.guild, world.settings, false)) === "failed" && Boolean((await state())?.error?.includes("posten")), JSON.stringify(await state()));
    discord.state.deny = false;
    check("Rechte wieder da: beim nächsten Blick geschickt, Fehler weg", (await PostBoard(world.client, world.guild, world.settings, false)) === "sent" && (await state())?.error === null, JSON.stringify(await state()));

    // Knöpfe der Nachricht: immer eine eigene Ansicht
    const deferred: unknown[] = [];
    let updates = 0;
    const replies: unknown[] = [];
    const click = (customId: string) =>
        HandleBoardButton(world.client, {
            customId,
            user: { id: USER },
            guild: world.guild,
            deferUpdate: async () => void updates++,
            deferReply: async (options: unknown) => void deferred.push(options),
            editReply: async (reply: unknown) => void replies.push(reply),
            followUp: async (reply: unknown) => void replies.push(reply),
        } as unknown as ButtonInteraction);

    await click("lv:p:all:1:kanal");

    const own = Buttons(replies.at(-1));

    check("Klick im Kanal: eigene Ansicht, Nachricht bleibt", updates === 0 && deferred.length === 1 && own.some((button) => button.custom_id === `lv:p:all:1:${USER}`) && !own.some((button) => button.custom_id === "lv:card"), JSON.stringify(own.map((button) => button.custom_id)));

    await click("lv:card");

    const card = replies.at(-1) as { files?: { name?: string }[] };

    check("Meine Karte: die eigene Karte nur für den Drücker", updates === 0 && deferred.length === 2 && (deferred[1] as { flags?: number }).flags === 64 && card.files?.[0]?.name === "level.png", JSON.stringify({ deferred, card: card.files?.map((file) => file.name) }));

    // Der Lauf alle 10 Minuten: Server nacheinander, Modul aus heißt Nachricht weg.
    const looked = World({ boardPost: { on: true, channelId: TEXT, period: "all" } });
    const seen = BoardChannels(looked);
    const pauses: number[] = [];

    looked.member(USER);
    await looked.client.levels.Add(GUILD, USER, 100, { messages: 1 });
    await new LevelBoards(looked.client).Execute(async (ms) => void pauses.push(ms));
    check("Lauf: Nachricht geschickt, danach kurze Pause", seen.log.join() === `send ${TEXT} m1` && pauses.length === 1 && pauses[0] > 0, JSON.stringify({ log: seen.log, pauses }));

    (looked.client.settings as unknown as { Of: () => Promise<unknown> }).Of = async () => ({ modules: [] });
    await new LevelBoards(looked.client).Execute(async (ms) => void pauses.push(ms));
    check("Lauf: Modul aus, Nachricht weg", seen.log.at(-1) === "delete m1" && (await looked.client.levelBoardPosts.Of(GUILD)) === null, seen.log.join());

    // Dashboard: Speichern schickt oder löscht sofort, Stand und „Jetzt neu zeichnen“
    const desk = World();
    const deskDiscord = BoardChannels(desk);
    const route = new DashboardApiLevels(desk.client) as unknown as { Read: (access: unknown, query: unknown) => Promise<Record<string, unknown>>; Write: (access: unknown, body: unknown) => Promise<Record<string, unknown>> };
    const access = { guild: desk.guild, member: { id: USER } };
    const status = (value: unknown) => value as { channelId?: string; messageId?: string | null; error?: string | null } | null;

    desk.member(USER);
    (desk.guild as unknown as { emojis: { cache: Map<string, unknown> } }).emojis = { cache: new Map() };
    (desk.client.levels as unknown as { Top: () => Promise<unknown[]> }).Top = async () => [];
    await desk.client.levels.Add(GUILD, USER, 100, { messages: 1 });

    const turnedOn = await route.Write(access, { action: "save", settings: { ...desk.settings, announceChannelId: TEXT, boardPost: { on: true, channelId: TEXT, period: "all" } } });

    check("Speichern mit Rangliste im Kanal: Nachricht gleich da", deskDiscord.log.join() === `send ${TEXT} m1` && status(turnedOn.boardPostStatus)?.messageId === "m1", JSON.stringify({ log: deskDiscord.log, status: turnedOn.boardPostStatus }));

    const redrawn = await route.Write(access, { action: "boardpost.draw" });

    check("Jetzt neu zeichnen: bearbeitet, Stand dabei", redrawn.result === "edited" && deskDiscord.log.at(-1) === "edit m1" && status(redrawn.boardPostStatus)?.messageId === "m1", JSON.stringify(redrawn));
    check("Stand beim Laden der Seite", status((await route.Read(access, {})).boardPostStatus)?.channelId === TEXT);

    await route.Write(access, { action: "save", settings: { ...desk.settings, fair: { ...desk.settings.fair, repeat: false } } });
    check("Speichern ohne Änderung an der Rangliste: Nachricht bleibt, wie sie ist", deskDiscord.log.length === 2, deskDiscord.log.join());

    const turnedOff = await route.Write(access, { action: "save", settings: { ...desk.settings, boardPost: { on: false, channelId: TEXT, period: "all" } } });

    check("Ausschalten im Dashboard: Nachricht gleich weg", deskDiscord.log.at(-1) === "delete m1" && turnedOff.boardPostStatus === null, JSON.stringify({ log: deskDiscord.log, status: turnedOff.boardPostStatus }));
}


/* ----------------------------------------------------------
   Plan 34, Task 7: Dashboard Menü A
   ---------------------------------------------------------- */
async function checkDashboard(): Promise<void> {
    console.log("\n  — Dashboard —");

    const world = World({}, { modules: [], activity: [{ userId: USER, day: Today() - 1, messages: 10, voice: 0 }] });

    world.member(USER);
    (world.guild as unknown as { emojis: { cache: Map<string, unknown> } }).emojis = { cache: new Map() };
    (world.client.levels as unknown as { Top: () => Promise<unknown[]> }).Top = async () => [];
    await RunBackfill(world.client, Date.now(), async () => undefined);
    await world.client.levelDays.Add(GUILD, USER, Today(), { xp: 30, messages: 1, voiceMinutes: 0 });

    const route = new DashboardApiLevels(world.client) as unknown as { Read: (access: unknown, query: unknown) => Promise<Record<string, unknown>>; Write: (access: unknown, body: unknown) => Promise<Record<string, unknown>> };
    const access = { guild: world.guild, member: { id: USER } };
    const payload = await route.Read(access, {});
    const board = (await route.Write(access, { action: "board", period: "7d", page: 1 })) as unknown as { period: string; entries: { trend: unknown }[] };
    const saved = (await route.Write(access, { action: "save", settings: { ...world.settings, announceChannelId: TEXT, fair: { ...world.settings.fair, repeat: false }, announceDelete: 15 } })) as { settings?: ILevelSettings };

    check("GET liefert den Nachtrag", (payload.backfill as { mode?: string } | null)?.mode === "backfill", JSON.stringify(payload.backfill));
    check("board: Zeitraum und Trend", board.period === "7d" && board.entries[0]?.trend !== undefined, JSON.stringify(board));
    check("save übernimmt Farm-Schutz und Löschzeit", saved.settings?.fair.repeat === false && saved.settings?.announceDelete === 15, JSON.stringify(saved.settings?.fair));
}

/* ----------------------------------------------------------
   Plan 34, Task 8: Web-Rangliste
   ---------------------------------------------------------- */
interface IFakeReply {
    status: number;
    headers: Record<string, string>;
    body: unknown;
}

function FakeReply(): IFakeReply & { code: (n: number) => unknown; header: (k: string, v: string) => unknown; send: (b: unknown) => unknown; type: (t: string) => unknown } {
    const reply = {
        status: 200,
        headers: {} as Record<string, string>,
        body: undefined as unknown,
        request: { headers: {} },
        code(n: number) {
            reply.status = n;

            return reply;
        },
        header(key: string, value: string) {
            reply.headers[key.toLowerCase()] = value;

            return reply;
        },
        type(value: string) {
            reply.headers["content-type"] = value;

            return reply;
        },
        send(body: unknown) {
            reply.body = body;

            return reply;
        },
    };

    return reply;
}

async function checkPublic(): Promise<void> {
    console.log("\n  — Web-Rangliste —");

    const world = World({ public: true });
    const closed = World({ public: false });
    const SESSION = "level-check-session";

    (world.guild as unknown as { name: string }).name = 'Dev "Server" <b>';
    for (const target of [world, closed]) Object.assign(target.guild, { iconURL: () => null });
    for (const target of [world, closed]) {
        Object.assign(target.client, {
            dashboardService: { Session: (cookie: string | undefined) => (cookie === SESSION ? { userId: "90071992547430037" } : null) },
            server: { BaseURL: "https://bot.example" },
            config: { SITE_PUBLIC_URL: "https://site.example" },
        });
        (target.client.levels as unknown as { Total: () => Promise<number> }).Total = async () => 0;
    }

    for (let index = 1; index <= 120; index++) {
        const userId = `9007199254743${String(index).padStart(4, "0")}`;

        world.member(userId);
        (world.guild.members.cache.get(userId) as unknown as { displayName: string }).displayName = `Spieler ${index}`;
        await world.client.levels.Add(GUILD, userId, 5000 - index * 10, { messages: 2, voiceMinutes: 30 });
    }

    const api = (target: IWorld) => new DashboardApiLeaderboard(target.client);
    const ask = async (target: IWorld, query: Record<string, string> = {}, cookie?: string) => {
        const reply = FakeReply();

        await api(target).Handle({ params: { id: GUILD }, query, headers: cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {} } as never, reply as never);

        return reply as IFakeReply & { body: { viewer: { me?: boolean; rank: number } | null; signedIn: boolean; entries: { rank: number; me?: boolean }[]; matches?: { rank: number; offset: number }[]; kpi: { members: number } } };
    };

    const privateReply = await ask(closed);
    const anon = await ask(world);
    const signed = await ask(world, {}, SESSION);
    const search = await ask(world, { q: "spieler 37" });
    const page3 = await ask(world, { offset: "100" });

    check("Nicht öffentlich: 404", privateReply.status === 404);
    check("Ohne Anmeldung: öffentlich gecacht, kein viewer", anon.headers["cache-control"] === "public, max-age=60" && anon.body.viewer === null && anon.body.signedIn === false, JSON.stringify(anon.headers));
    check("Mit Anmeldung: privat, eigener Platz", signed.headers["cache-control"] === "private, no-store" && signed.body.viewer?.me === true && signed.body.viewer?.rank === 37, JSON.stringify({ headers: signed.headers, viewer: signed.body.viewer }));   // Review Focus 1
    check("Öffentlich ohne Discord-IDs, eigene Zeile markiert", [...anon.body.entries, ...signed.body.entries, signed.body.viewer].every((entry) => entry !== null && !("userId" in entry)) && signed.body.entries.find((entry) => entry.me)?.rank === 37 && !anon.body.entries.some((entry) => entry.me), JSON.stringify(signed.body.entries[0]));
    check("Antwort hängt am Cookie (Vary)", anon.headers["vary"] === "Cookie" && signed.headers["vary"] === "Cookie", JSON.stringify([anon.headers["vary"], signed.headers["vary"]]));
    check("Suche findet den Platz", search.body.matches?.[0]?.rank === 37 && search.body.matches?.[0]?.offset === 0, JSON.stringify(search.body.matches));
    check("Alle Plätze: offset 100 liefert Platz 101", page3.body.entries[0]?.rank === 101 && anon.body.kpi.members === 120, JSON.stringify(page3.body.entries[0]));

    const page = async (target: IWorld) => {
        const reply = FakeReply();

        await new DashboardLeaderboard(target.client).Handle({ params: { id: GUILD } } as never, reply as never);

        return String(reply.body ?? "");
    };
    const ogPublic = await page(world);
    const ogPrivate = await page(closed);

    check("OG-Tags nur bei öffentlicher Rangliste", ogPublic.includes('property="og:image"') && ogPublic.includes("/rangliste/") && !ogPrivate.includes("og:image") && !ogPublic.includes("__OG__"), ogPublic.slice(0, 200));
    check("Servername in OG-Tags entschärft", ogPublic.includes("Dev &quot;Server&quot; &lt;b&gt;") && !ogPublic.includes('Dev "Server" <b>'));

    const image = FakeReply();
    const imagePrivate = FakeReply();

    await new DashboardLeaderboardImage(world.client).Handle({ params: { id: GUILD } } as never, image as never);
    await new DashboardLeaderboardImage(closed.client).Handle({ params: { id: GUILD } } as never, imagePrivate as never);
    check("Vorschaubild: PNG, nicht öffentlich 404", isPng(image.body) && image.headers["content-type"] === "image/png" && imagePrivate.status === 404, `${image.status} ${image.headers["content-type"]}`);
}

/* ----------------------------------------------------------
   Plan 34, Task 1: immer an
   ---------------------------------------------------------- */
function checkAlwaysOn(): void {
    console.log("\n  — Immer an —");

    const levels = CLIENT_MODULES.find((entry) => entry.id === "levels");

    check("Level System ist fest an", PERMANENT_MODULES.has("levels"));
    check("Client sperrt den Schalter", levels?.always === true);
    check("Steht unter „Immer dabei“ wie Galerie und Backups", levels?.category === "always", levels?.category);
    // Plan 36: die Zeile über dem Aufstiegs-Bild steht nur noch im Aufstiegs-Studio.
    // Plan 37: doppelte Punkte unter Level System, Aktivste unter Belohnungen.
    check(
        "Plan 37: Felder der Seiten",
        (LEVEL_FIELDS.levels as readonly string[]).includes("boosts") && (LEVEL_FIELDS.levels as readonly string[]).includes("boostChannelId") && (LEVEL_FIELDS["level-rewards"] as readonly string[]).includes("top"),
        JSON.stringify(LEVEL_FIELDS)
    );
    // Plan 43: die Boost-Nachrichten speichert die Seite Level System mit den Fenstern.
    check("Level System speichert die Boost-Nachrichten mit", (LEVEL_FIELDS.levels as readonly string[]).includes("boostMessages"), JSON.stringify(LEVEL_FIELDS.levels));
    check("Belohnungen speichern die Zeile nicht mehr", !(LEVEL_FIELDS["level-rewards"] as readonly string[]).includes("upLine") && (LEVEL_FIELDS["level-rewards"] as readonly string[]).includes("upMode"), JSON.stringify(LEVEL_FIELDS["level-rewards"]));
    check("Belohnungen ist ein Teil des Level Systems", levels?.parts?.some((part) => part.id === "level-rewards") === true, JSON.stringify(levels?.parts?.map((part) => part.id)));
    // Plan 35: Menü A - Belohnungen, Level-Karte, Rangliste.
    check("Level-Karte ist ein Teil des Level Systems, zwischen Belohnungen und Rangliste", levels?.parts?.map((part) => part.id).join(",") === "level-rewards,level-card,leaderboard", JSON.stringify(levels?.parts?.map((part) => part.id)));
}

/* ----------------------------------------------------------
   Plan 34, Abschluss-Review: Fix-Durchgang
   ---------------------------------------------------------- */
async function checkReviewFixes(): Promise<void> {
    console.log("\n  — Abschluss-Review —");

    // C1: Der Nachtrag läuft im Hintergrund, die Zeitaufgaben warten nicht auf ihn.
    const slow = World({}, { modules: [], activity: [{ userId: USER, day: Today() - 2, messages: 100, voice: 0 }, { userId: OTHER, day: Today() - 2, messages: 100, voice: 0 }] });

    slow.member(USER);
    slow.member(OTHER);

    const started = Date.now();

    await new LevelBackfillRunnable(slow.client).Execute();

    const took = Date.now() - started;
    check("Nachtrag blockiert die Zeitaufgaben nicht", took < 1_000 && StartBackfill(slow.client) === false, `${took} ms`);

    // I1: Umschalten schreibt feste Module nicht in die Spalte.
    check("Umschalten schreibt feste Module nicht in die Spalte", NextModules([], "automod", true).join() === "automod" && NextModules(["levels", "x"], "x", false).join() === "levels" && NextModules([], "levels", true).join() === "", `${NextModules([], "automod", true).join()} | ${NextModules([], "levels", true).join()}`);

    // I2: Absturz mitten im Nachtrag - fortsetzen, niemand doppelt.
    const ZEN2 = "90071992547409965";
    const crash = World({}, { modules: [], activity: [{ userId: USER, day: Today() - 2, messages: 100, voice: 0 }, { userId: OTHER, day: Today() - 2, messages: 50, voice: 0 }, { userId: ZEN2, day: Today() - 2, messages: 30, voice: 0 }] });
    const addMany = crash.client.levelDays.AddMany.bind(crash.client.levelDays);
    let fail = true;

    crash.member(USER);
    crash.member(OTHER);
    crash.member(ZEN2);
    crash.client.levelDays.AddMany = async (rows) => {
        if (fail && rows[0]?.userId === OTHER) throw new Error("Absturz");

        return addMany(rows);
    };

    const t0 = Date.now();

    await RunBackfill(crash.client, t0, async () => undefined, t0 - 1_000).catch(() => undefined);
    fail = false;
    await RunBackfill(crash.client, t0 + 60_000, async () => undefined, t0 + 30_000);

    const after = await crash.client.levelBackfill.Of(GUILD);
    check("Nach einem Absturz: fortgesetzt, niemand doppelt", crash.entry(USER).xp === 100 * 20 && crash.entry(ZEN2).xp === 30 * 20 && crash.entry(OTHER).xp <= 50 * 20 && after?.doneAt !== null && after?.mode === "backfill", JSON.stringify({ a: crash.entry(USER).xp, b: crash.entry(OTHER).xp, c: crash.entry(ZEN2).xp, after }));

    const busy = World({}, { modules: [], activity: [{ userId: USER, day: Today() - 2, messages: 10, voice: 0 }] });

    busy.member(USER);
    await busy.client.levelBackfill.Claim(GUILD, t0, Today(t0), "backfill");
    await RunBackfill(busy.client, t0 + 1_000, async () => undefined, t0 - 5_000);
    check("Läuft der Nachtrag in diesem Prozess noch, nimmt ihn kein zweiter Lauf", busy.entry(USER).xp === 0);

    // I5: Zurücksetzen leert auch die Tageswerte.
    const wipe = World();

    wipe.member(USER);
    await wipe.client.levels.Add(GUILD, USER, 500, {});
    await wipe.client.levelDays.Add(GUILD, USER, Today(), { xp: 500 });
    await wipe.client.levelDays.Add(GUILD, OTHER, Today(), { xp: 300 });
    await wipe.service.Adjust(wipe.guild, USER, "reset", 0, OTHER);
    check("Zurücksetzen leert auch die Tageswerte", wipe.day(USER) === undefined && wipe.day(OTHER)?.xp === 300, JSON.stringify([...wipe.days.keys()]));
    await wipe.service.Reset(wipe.guild);
    check("Ganze Rangliste löschen leert alle Tageswerte", wipe.days.size === 0, JSON.stringify([...wipe.days.keys()]));

    // I7: Voice zählt die vergangene Zeit, nicht die Takte.
    const tick = World();
    const sitter = tick.member("90071992547409970");
    const channel = { id: VOICE, parentId: null, members: new Map([[sitter.id, sitter]]) };
    const base = Date.now();

    (tick.guild as unknown as { voiceStates: { cache: Map<string, unknown> } }).voiceStates.cache.set(sitter.id, { member: sitter, channel, channelId: VOICE, selfMute: true, selfDeaf: false, mute: false, deaf: false });
    for (const seconds of [0, 75, 150, 225, 300]) await tick.service.Voice(base + seconds * 1_000);
    check("Voice zählt die vergangene Zeit, nicht die Takte", tick.entry(sitter.id).voiceMinutes === 6, String(tick.entry(sitter.id).voiceMinutes));
    await tick.service.Voice(base + 300_000 + 30 * 60_000);
    check("Nach einer langen Pause höchstens 5 Minuten auf einmal", tick.entry(sitter.id).voiceMinutes === 11, String(tick.entry(sitter.id).voiceMinutes));
}

/* ----------------------------------------------------------
   Plan 35, Task 3: Karte und Aufstieg mit Design
   ---------------------------------------------------------- */
async function checkDesignBot(): Promise<void> {
    console.log("\n  — Plan 35: Karte und Aufstieg mit Design —");

    const plain = World();
    const lara = plain.member(USER);

    await plain.service.Credit(lara, 450, { messages: 3, voiceMinutes: 90 }, plain.settings, TEXT);

    const { entry, rank, total, settings } = await plain.service.Card(lara);
    const klassisch = await RenderDesign(CARD_TEMPLATES.klassisch(), { values: plain.service.DesignValues(lara, entry, rank, total, settings.base), avatarUrl: null, iconUrl: null, share: LevelProgress(entry.xp, settings.base).share });

    // Plan 36: ohne eigenes Design kommt die Vorlage Klassisch - so wie der Builder sie zeigt.
    check("Ohne Design: Vorlage Klassisch", (await plain.service.CardImage(lara)).equals(klassisch.png));

    const designed = World({ cardDesign: CARD_TEMPLATES.mittig() });
    const mia = designed.member(USER);

    await designed.service.Credit(mia, 450, { messages: 3 }, designed.settings, TEXT);

    const card = await designed.service.CardImage(mia);

    check("Mit Design: gezeichnetes Design in doppelter Größe", isPng(card) && card.readUInt32BE(16) === 1800 && card.readUInt32BE(20) === 600, `${card.readUInt32BE(16)}x${card.readUInt32BE(20)}`);

    const values = designed.service.DesignValues(mia, { ...designed.entry(USER), xp: 8606, messages: 1248, voiceMinutes: 2310 }, 3, 214, 100, { levelOld: 11 });

    check(
        "Platzhalter der Karte",
        values["user.name"] === "Lara" && values.xp === "8.606" && values.messages === "1.248" && values.voice === "2.310" && values["voice.hours"] === "38,5 Std." && values["level.old"] === "11" && values.rank === "3" && values["rank.total"] === "214" && values.boost === "",
        JSON.stringify(values)
    );

    const image = World();
    const mo = image.member(OTHER);

    await image.service.Credit(mo, XpForLevel(2, image.settings.base), { messages: 1 }, image.settings, TEXT);

    const up = image.sent[0]?.payload;

    check(
        "Aufstieg als Bild: Textzeile mit Erwähnung und Anhang, ohne Components V2",
        image.sent.length === 1 && up?.content === `<@${OTHER}>` && up.files?.length === 1 && !up.flags && !up.components && up.allowedMentions?.users?.[0] === OTHER,
        JSON.stringify({ ...up, files: up?.files?.length })
    );

    const line = World({ upLine: "GG {user.name}, Level {level}!" });
    const ben = line.member(OTHER);

    await line.service.Credit(ben, XpForLevel(2, line.settings.base), { messages: 1 }, line.settings, TEXT);
    check("Eigene Textzeile über dem Bild", line.sent[0]?.payload.content === "GG Mo, Level 2!", line.sent[0]?.payload.content);

    const textMode = World({ upMode: "text" });
    const zoe = textMode.member(OTHER);

    await textMode.service.Credit(zoe, XpForLevel(2, textMode.settings.base), { messages: 1 }, textMode.settings, TEXT);
    check("Aufstieg als Text: wie Etappe 1", textMode.sent.length === 1 && textMode.sent[0].payload.components?.length === 1 && !textMode.sent[0].payload.files);

    // Review Focus 3: Zeichnen wirft - oder der Kanal nimmt keine Anhänge.
    const broken = World();
    const kai = broken.member(OTHER);

    broken.service.UpImage = async () => {
        throw new Error("kaputt");
    };
    await broken.service.Credit(kai, XpForLevel(2, broken.settings.base), { messages: 1 }, broken.settings, TEXT);
    check("Bild scheitert beim Zeichnen: Text kommt trotzdem", broken.sent.length === 1 && broken.sent[0].payload.components?.length === 1, JSON.stringify(broken.sent.map((entry) => entry.to)));

    const noFiles = World({}, { noFiles: true });
    const ida = noFiles.member(OTHER);

    await noFiles.service.Credit(ida, XpForLevel(2, noFiles.settings.base), { messages: 1 }, noFiles.settings, TEXT);
    check("Kanal ohne Anhänge: Text kommt trotzdem", noFiles.sent.length === 1 && noFiles.sent[0].channelId === TEXT && noFiles.sent[0].payload.components?.length === 1);

    const clean = (input: Record<string, unknown>) => new LevelService({} as BotClient).Clean(FakeGuild(), input, plain.settings);

    check("Textzeile: eine Zeile, höchstens 200 Zeichen", clean({ upLine: `a\nb${"x".repeat(300)}` }).upLine.length === 200 && !clean({ upLine: "a\nb" }).upLine.includes("\n"));
    check("Bild oder Text wird gespeichert, Unsinn nicht", clean({ upMode: "text" }).upMode === "text" && clean({ upMode: "gif" }).upMode === undefined);
    check("Speichern lässt Designs stehen", clean({ cardDesign: null, boardStyle: null }).boardStyle.podium === true && World({ cardDesign: CARD_TEMPLATES.hud() }).service.Clean(FakeGuild(), {}, { ...plain.settings, cardDesign: CARD_TEMPLATES.hud() }).cardDesign?.template === "hud");
}

/* ----------------------------------------------------------
   Plan 35, Task 4: Stil des Ranglisten-Bilds, Kopf der Web-Rangliste
   ---------------------------------------------------------- */
async function checkBoardStyle(): Promise<void> {
    console.log("\n  — Plan 35: Ranglisten-Stil —");

    const world = World({ public: true });

    for (let index = 1; index <= 25; index++) {
        const userId = `9007199254744${String(index).padStart(4, "0")}`;

        world.member(userId);
        await world.client.levels.Add(GUILD, userId, 3000 - index * 10, { messages: 10, voiceMinutes: 90 });
        await world.client.levelDays.Add(GUILD, userId, Today(), { xp: 300 - index, messages: 3, voiceMinutes: 20 });
    }

    const page = await world.service.Board(world.guild, "7d", 1, null);
    const drawn: { podium: number; rows: number }[] = [];
    const titles: { title: string; subtitle: string }[] = [];
    const style = { ...DefaultBoardStyle(), podium: false, title: "Rangliste von {guild}", subtitle: "{period} · {range}" };

    await RenderLeaderboard({ guildName: "Dev Server", page, viewerId: null, style }, { onDraw: (count) => void drawn.push(count), onTitle: (title, subtitle) => void titles.push({ title, subtitle }) });
    check("Podium aus: Seite 1 zehn Zeilen", drawn[0]?.podium === 0 && drawn[0]?.rows === 10, JSON.stringify(drawn[0]));

    const day = (value: number) => {
        const date = new Date(value * 86_400_000);

        return `${String(date.getUTCDate()).padStart(2, "0")}.${String(date.getUTCMonth() + 1).padStart(2, "0")}.`;
    };

    check("Titel mit Platzhaltern", titles[0]?.title === "Rangliste von Dev Server" && titles[0]?.subtitle === `7 Tage · ${day(page.range!.from)}–${day(page.range!.to)}`, JSON.stringify(titles[0]));

    const lifetime = await world.service.Board(world.guild, "all", 1, null);

    await RenderLeaderboard({ guildName: "Dev Server", page: lifetime, viewerId: null, style }, { onTitle: (title, subtitle) => void titles.push({ title, subtitle }) });
    check("Lifetime: kein Datum, kein hängender Punkt", titles[1]?.subtitle === "Lifetime", JSON.stringify(titles[1]));

    const plain = await RenderLeaderboard({ guildName: "Dev Server", page, viewerId: null });
    const standard = await RenderLeaderboard({ guildName: "Dev Server", page, viewerId: null, style: DefaultBoardStyle() });

    check("Standardstil zeichnet wie ohne Stil", plain.equals(standard));

    const gone = await RenderLeaderboard({ guildName: "Dev Server", page, viewerId: null, style: { ...DefaultBoardStyle(), image: "default/rocketleague/rlranks/Gibt es nicht.png" } }).catch(() => null);
    const pictured = await RenderLeaderboard({ guildName: "Dev Server", page, viewerId: null, style: { ...DefaultBoardStyle(), image: "default/rocketleague/rlranks/Champion 1.png", dim: 60 } });

    check("Hintergrund aus der Galerie, gelöschtes Bild bricht nichts", gone !== null && isPng(gone) && isPng(pictured) && !pictured.equals(plain));

    // Abschluss-Review: ein gelöschtes Galeriebild darf nicht aus dem Speicher weiter auftauchen.
    const folder = path.join(GALLERY_ROOT, "default", "_check35b");

    mkdirSync(folder, { recursive: true });
    copyFileSync(path.join(GALLERY_ROOT, "default/rocketleague/rlranks/Champion 1.png"), path.join(folder, "weg.png"));

    try {
        const temp = { ...DefaultBoardStyle(), image: "default/_check35b/weg.png", dim: 20 };
        const shown = await RenderLeaderboard({ guildName: "Dev Server", page, viewerId: null, style: temp });

        rmSync(path.join(folder, "weg.png"));
        check("Ranglisten-Bild: gelöschter Hintergrund verschwindet auch", !shown.equals(await RenderLeaderboard({ guildName: "Dev Server", page, viewerId: null, style: temp })));
    } finally {
        rmSync(folder, { recursive: true, force: true });
    }

    world.settings.boardStyle = { ...DefaultBoardStyle(), podium: false };

    const message = (await BoardMessage(world.client, world.guild, "7d", 1, null, USER)) as { files?: { attachment: Buffer }[] };
    const sent = message.files?.[0]?.attachment;

    check("Discord nimmt den Stil des Servers", Buffer.isBuffer(sent) && sent.readUInt32BE(20) !== plain.readUInt32BE(20), `${sent?.readUInt32BE(20)} vs ${plain.readUInt32BE(20)}`);
    check(
        "Stil speichern: Unsinn bleibt beim Alten, fremde Adresse wird null",
        CleanBoardStyle({ accent: "rot", dim: 500, medals: ["#fff"], font: "Comic Sans", podium: "ja" }, DefaultBoardStyle()).accent === DefaultBoardStyle().accent &&
            CleanBoardStyle({ dim: 500 }, DefaultBoardStyle()).dim === 90 &&
            CleanBoardStyle({ image: "https://evil.example/a.png" }, { ...DefaultBoardStyle(), image: "default/rocketleague/rlranks/Champion 1.png" }).image === null &&
            CleanBoardStyle({ title: "x".repeat(300) }, DefaultBoardStyle()).title.length === 80
    );

    // Review Focus 4: der Kopf der Web-Rangliste.
    Object.assign(world.guild, { iconURL: () => null });
    Object.assign(world.client, { server: { BaseURL: "https://bot.example" }, dashboardService: { Session: () => null } });
    world.settings.boardStyle = { ...DefaultBoardStyle(), image: "default/rocketleague/rlranks/Champion 1.png", dim: 55, accent: "#22c55e" };

    const ask = async () => {
        const reply = FakeReply();

        await new DashboardApiLeaderboard(world.client).Handle({ params: { id: GUILD }, query: {}, headers: {} } as never, reply as never);

        return (reply as unknown as { body: { style?: { background: string | null; dim: number; accent: string } } }).body.style;
    };
    const shown = await ask();

    check("Web: Hintergrund als öffentliche /images-Adresse", shown?.background === "https://bot.example/images/default/rocketleague/rlranks/Champion%201.png" && shown.dim === 55 && shown.accent === "#22c55e", JSON.stringify(shown));

    world.settings.boardStyle = { ...DefaultBoardStyle(), image: "https://evil.example/a.png" };
    check("Web: fremde Adresse im Stil wird nie herausgegeben", (await ask())?.background === null);
}

/* ----------------------------------------------------------
   Plan 35, Task 5: Dashboard-API des Designers
   ---------------------------------------------------------- */
async function checkDesignApi(): Promise<void> {
    console.log("\n  — Plan 35: Designer im Dashboard (API) —");

    const world = World();
    const lara = world.member(USER);

    (world.guild as unknown as { emojis: { cache: Map<string, unknown> } }).emojis = { cache: new Map() };
    (world.client.levels as unknown as { Top: () => Promise<unknown[]> }).Top = async () => [];
    Object.assign(world.client, { levelBackfill: { ...world.client.levelBackfill, Of: async () => null } });
    await world.service.Credit(lara, 450, { messages: 3, voiceMinutes: 90 }, world.settings, TEXT);
    world.sent.length = 0;

    type Api = { Read: (access: unknown, query: unknown) => Promise<Record<string, unknown>>; Write: (access: unknown, body: unknown) => Promise<Record<string, unknown>> };
    const route = new DashboardApiLevels(world.client) as unknown as Api;
    const access = { guild: world.guild, member: lara };
    const payload = (await route.Read(access, {})) as { templates?: { card?: Record<string, unknown>; up?: Record<string, unknown> }; designs?: { card: unknown; up: unknown; board: { podium: boolean } }; upMode?: string; limits?: { elements?: number } };

    check(
        "GET liefert Designs, Vorlagen und Grenzen",
        Boolean(payload.templates?.card?.klassisch && payload.templates.up?.banner) && payload.designs?.card === null && payload.designs.board.podium === true && payload.upMode === "image" && payload.limits?.elements === 30,
        JSON.stringify({ designs: payload.designs, upMode: payload.upMode, limits: payload.limits })
    );

    const preview = (await route.Write(access, { action: "design.preview", kind: "card", design: CARD_TEMPLATES.panel() })) as { image?: string; boxes?: unknown[]; width?: number; height?: number };

    check("Vorschau liefert Bild und Rahmen", Boolean(preview.image?.startsWith("data:image/png;base64,")) && preview.boxes?.length === CARD_TEMPLATES.panel().elements.length && preview.width === 900 && preview.height === 300, JSON.stringify({ ...preview, image: preview.image?.slice(0, 30) }));

    const up = (await route.Write(access, { action: "design.preview", kind: "up", design: UP_TEMPLATES.banner() })) as { height?: number };

    // Plan 36: was das Studio vom Bot bekommt.
    const big = { ...UP_TEMPLATES.leer(), elements: [{ type: "avatar", id: "a", name: "Avatar", hidden: false, x: 0, y: 40, opacity: 1, size: 300, shape: "circle", ring: 4, ringColor: "#a78bfa" }] };
    const cleaned = (await route.Write(access, { action: "design.preview", kind: "up", design: big })) as { design?: { elements: { size?: number; y: number }[] }; values?: Record<string, string> };

    check("Vorschau gibt das bereinigte Design zurück", cleaned.design?.elements[0]?.size === 260 && cleaned.design.elements[0].y === 0, JSON.stringify(cleaned.design?.elements[0]));
    check("Vorschau gibt die Werte zurück", cleaned.values?.["user.name"] === "Lara", JSON.stringify(cleaned.values));

    const thumbs = (await route.Write(access, { action: "design.thumbs", kind: "up" })) as { thumbs?: Record<string, string> };

    check("Vorschaubilder je Vorlage", Object.keys(thumbs.thumbs ?? {}).length === 6 && Object.values(thumbs.thumbs ?? {}).every((url) => url.startsWith("data:image/png")), Object.keys(thumbs.thumbs ?? {}).join(","));

    const withLine = (await route.Write(access, { action: "design.save", kind: "up", design: UP_TEMPLATES.banner(), upLine: "GG {user}" })) as { upLine?: string };

    check("Aufstieg speichert die Zeile mit", withLine.upLine === "GG {user}" && world.settings.upLine === "GG {user}", JSON.stringify(withLine.upLine));
    await route.Write(access, { action: "design.save", kind: "up", design: UP_TEMPLATES.banner(), upLine: `a\nb${"x".repeat(400)}` });
    check("Zeile wird eine Zeile und gekürzt", world.settings.upLine.length <= 200 && !world.settings.upLine.includes("\n"));
    await route.Write(access, { action: "design.save", kind: "up", design: UP_TEMPLATES.banner(), upLine: "GG {user}" });
    await route.Write(access, { action: "design.save", kind: "card", design: CARD_TEMPLATES.leer(), upLine: "x" });
    check("Level-Karte ignoriert die Zeile", world.settings.upLine === "GG {user}");
    await route.Write(access, { action: "design.save", kind: "card", design: null });

    check("Vorschau des Aufstiegs in seiner Größe", up.height === 260);

    const fresh = World();
    const neu = fresh.member(OTHER);
    const jump = (await fresh.service.DesignData(neu, "up")).values;

    check("Vorschau auf Level 0 zeigt den Sprung auf 1", jump["level.old"] === "0" && jump.level === "1", JSON.stringify({ old: jump["level.old"], level: jump.level }));

    const many = { ...CARD_TEMPLATES.leer(), elements: Array.from({ length: 40 }, (_, index) => ({ type: "text", id: `t${index}`, text: "x".repeat(500), x: 5000, y: -20 })) };
    const saved = (await route.Write(access, { action: "design.save", kind: "card", design: many })) as { design?: { elements: { x: number; text: string }[] } };

    check("Speichern prüft und speichert", saved.design?.elements.length === 30 && world.settings.cardDesign?.elements.length === 30 && saved.design.elements.every((element) => element.x <= 900 && element.text.length === 200));

    const forgot = await route.Write(access, { action: "design.save", kind: "card" }).catch((error: Error) => error);

    check("Speichern ohne Design setzt nicht still zurück", forgot instanceof LevelError && world.settings.cardDesign?.elements.length === 30, String(forgot));

    const reset = (await route.Write(access, { action: "design.save", kind: "card", design: null })) as { design?: unknown };

    check("null setzt auf die Vorgabe zurück", reset.design === null && world.settings.cardDesign === null);

    await route.Write(access, { action: "design.save", kind: "up", design: UP_TEMPLATES.hud() });
    await route.Write(access, { action: "design.test", kind: "up" });
    check("Test schickt eine DM mit Bild", world.sent.length === 1 && world.sent[0].to === USER && world.sent[0].payload.files?.length === 1, JSON.stringify(world.sent.map((entry) => entry.to)));

    const closed = World();
    const mo = closed.member(OTHER, { closed: true });

    (closed.client.levels as unknown as { Top: () => Promise<unknown[]> }).Top = async () => [];

    const shut = await (new DashboardApiLevels(closed.client) as unknown as Api).Write({ guild: closed.guild, member: mo }, { action: "design.test", kind: "card" }).catch((error: Error) => error);

    check("DMs zu: klare Meldung", shut instanceof LevelError && shut.message.includes("DM"), String(shut));

    const broken = await route.Write(access, { action: "design.save", kind: "poster", design: CARD_TEMPLATES.leer() }).catch((error: Error) => error);

    check("Unbekannte Art: Fehler statt Speichern", broken instanceof LevelError);

    const board = (await route.Write(access, { action: "board.preview", style: { ...DefaultBoardStyle(), podium: false } })) as { image?: string };
    const style = (await route.Write(access, { action: "board.save", style: { podium: false, accent: "#22c55e", image: "https://evil.example/a.png" } })) as { style?: { podium: boolean; accent: string; image: string | null } };

    check("Ranglisten-Stil: Vorschau und Speichern", Boolean(board.image?.startsWith("data:image/png;base64,")) && style.style?.podium === false && style.style.accent === "#22c55e" && style.style.image === null && world.settings.boardStyle.podium === false);

    const kept = (await route.Write(access, { action: "save", settings: { ...world.settings, announceChannelId: TEXT, upMode: "text", upLine: "GG {user}" } })) as { settings?: ILevelSettings };

    check("Einstellungen speichern lässt Designs und Stil stehen", kept.settings?.upDesign?.template === "hud" && kept.settings.boardStyle.podium === false && kept.settings.upMode === "text" && kept.settings.upLine === "GG {user}");
}

/* ----------------------------------------------------------
   Plan 35, Task 7: Live-Rangliste im Dashboard
   ---------------------------------------------------------- */
async function checkLivePulse(): Promise<void> {
    console.log("\n  — Plan 35: Live-Rangliste —");

    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    // Die Prüfung rechnet mit 100 ms statt 2 s - dieselbe Rechnung, nur schneller.
    const DELAY = 100;

    check("Im Bot: höchstens eine Meldung alle 2 s", LEVEL_PULSE_MS === 2000 && new LevelService({} as BotClient).PulseDelay === LEVEL_PULSE_MS);

    const burst = World();
    const lara = burst.member(USER);

    burst.service.PulseDelay = DELAY;
    for (let index = 0; index < 5; index++) await burst.service.Credit(lara, 20, { messages: 1 }, burst.settings, TEXT);
    await wait(DELAY * 2);
    check("Punkte melden dem Dashboard einmal, nicht je Nachricht", burst.pulses.length === 1 && burst.pulses[0].kind === "levels" && burst.pulses[0].guildId === GUILD, JSON.stringify(burst.pulses));

    const steady = World();
    const mo = steady.member(OTHER);
    const until = Date.now() + DELAY * 4.5;

    steady.service.PulseDelay = DELAY;
    while (Date.now() < until) {
        await steady.service.Credit(mo, 20, { messages: 1 }, steady.settings, TEXT);
        await wait(DELAY / 4);
    }
    await wait(DELAY * 2);
    check("Bei Dauer-Chat kommt trotzdem regelmäßig eine Meldung", steady.pulses.length >= 3 && steady.pulses.length <= 6, String(steady.pulses.length));

    const reset = World();

    reset.service.PulseDelay = DELAY;
    await reset.service.Reset(reset.guild);
    await wait(DELAY * 2);
    check("Zurücksetzen meldet auch", reset.pulses.length === 1, JSON.stringify(reset.pulses));

    const adjust = World();

    adjust.member(USER);
    adjust.service.PulseDelay = DELAY;
    await adjust.service.Adjust(adjust.guild, USER, "add", 50, OTHER);
    await wait(DELAY * 2);
    check("Punkte von Hand melden auch", adjust.pulses.length === 1, JSON.stringify(adjust.pulses));

    const quiet = World();
    const ben = quiet.member(OTHER);

    quiet.service.PulseDelay = DELAY;
    await quiet.service.Credit(ben, 0, { messages: 1 }, quiet.settings, TEXT);
    await wait(DELAY * 2);
    check("Auch eine Nachricht ohne Punkte zählt für die Rangliste (Nachrichten-Zahl)", quiet.pulses.length === 1);

    const automod = World();
    const ida = automod.member(OTHER);
    const spam = automod.message(ida, "Das ist eine ganz normale Nachricht", "90071992547499001");

    automod.service.PulseDelay = DELAY;
    await automod.service.Message(spam);
    await wait(DELAY * 2);
    await automod.service.Revoke(spam);
    await wait(DELAY * 2);
    check("AutoMod nimmt Punkte zurück: meldet auch", automod.pulses.length === 2, JSON.stringify(automod.pulses));
}

/* ----------------------------------------------------------
   Plan 37, Task 2: doppelte Punkte zu festen Zeiten
   ---------------------------------------------------------- */
async function checkBoosts(): Promise<void> {
    console.log("\n  — Plan 37: Doppelte Punkte —");

    const at = (month: number, day: number, hour: number, minute = 0) => FromZone(2026, month, day, hour, minute)!;
    const weekly = (factor: number, weekday: number, from: string, to: string, id = `w${weekday}`): ILevelBoost => ({ id, kind: "weekly", factor, start: null, end: null, weekday, from, to, announce: false });
    const once = (factor: number, start: number, end: number, id = "o1"): ILevelBoost => ({ id, kind: "once", factor, start, end, weekday: null, from: null, to: null, announce: false });
    // Samstag 22:00 bis Sonntag 02:00 (31.10.2026 ist ein Samstag).
    const night = weekly(2, 6, "22:00", "02:00");

    check("Über Mitternacht: wirkt Sonntag 01:00", ActiveBoost([night], at(11, 1, 1))?.factor === 2 && ActiveBoost([night], at(11, 1, 1))?.until === at(11, 1, 2), JSON.stringify(ActiveBoost([night], at(11, 1, 1))));
    check("Davor und danach nicht", ActiveBoost([night], at(10, 31, 21, 59)) === null && ActiveBoost([night], at(11, 1, 2)) === null);
    check("Eine Woche später wieder", ActiveBoost([night], at(11, 7, 23))?.factor === 2);

    const friday = weekly(3, 5, "18:00", "23:00");
    const party = once(2, at(11, 6, 20), at(11, 6, 21));

    check("Überschneidung 3× und 2×: genau 3×", ActiveBoost([party, friday], at(11, 6, 20, 30))?.factor === 3, JSON.stringify(ActiveBoost([party, friday], at(11, 6, 20, 30))));
    check("Einmalig: nur in seinem Fenster", ActiveBoost([party], at(11, 6, 20, 59))?.factor === 2 && ActiveBoost([party], at(11, 6, 21)) === null);
    check("{boost} am selben Tag", BoostText(ActiveBoost([friday], at(11, 6, 20)), at(11, 6, 20)) === "3× XP bis 23:00", BoostText(ActiveBoost([friday], at(11, 6, 20)), at(11, 6, 20)));

    const long = once(1.5, at(11, 5, 12), at(11, 6, 23));

    check("{boost} mit Wochentag", BoostText(ActiveBoost([long], at(11, 5, 13)), at(11, 5, 13)) === "1,5× XP bis Freitag 23:00", BoostText(ActiveBoost([long], at(11, 5, 13)), at(11, 5, 13)));
    check("{boost} ohne Fenster leer", BoostText(null, at(11, 5, 13)) === "");

    const now = Date.now();
    const live = once(2, now - 60_000, now + 3_600_000);
    const chat = World({ boosts: [live] });
    const lara = chat.member(USER);

    await chat.service.Message(chat.message(lara, "gg wp alle", "x1"));
    check("2× auf eine Nachricht: 20 → 40", chat.entry(USER).xp === 40, String(chat.entry(USER).xp));

    const bonus = World({ boosts: [live], channelBonus: [{ id: TEXT, factor: 1.5 }] });
    const ida = bonus.member(USER);

    await bonus.service.Message(bonus.message(ida, "gg wp alle", "x2"));
    check("Zusätzlich zum Bonus: 20 × 1,5 × 2 = 60", bonus.entry(USER).xp === 60, String(bonus.entry(USER).xp));

    const voice = World({ boosts: [live], voice: { on: true, xp: 5, alone: true, muted: true } });
    const mo = voice.member(OTHER);

    (voice.guild as unknown as { voiceStates: { cache: Map<string, unknown> } }).voiceStates.cache.set(mo.id, { member: mo, channel: { id: VOICE, parentId: null, members: new Collection([[mo.id, mo]]) }, channelId: VOICE, selfMute: false, selfDeaf: false, mute: false, deaf: false });
    await voice.service.Voice();
    check("2× auf eine Voice-Minute: 5 → 10", voice.entry(OTHER).xp === 10, String(voice.entry(OTHER).xp));

    const card = (await chat.service.DesignData(lara, "card")).values.boost;

    check("{boost} auf der Karte gefüllt", card.startsWith("2× XP bis "), card);
    const plain = World();

    check("{boost} ohne Fenster leer auf der Karte", (await plain.service.DesignData(plain.member(USER), "card")).values.boost === "");

    const guild = FakeGuild();
    const clean = new LevelService({} as BotClient).Clean(
        guild,
        {
            boosts: [
                { kind: "weekly", factor: 7, weekday: 5, from: "18:00", to: "23:00" },
                { kind: "weekly", factor: 0.5, weekday: 6, from: "22:00", to: "02:00" },
                { kind: "weekly", factor: 1.26, weekday: 9, from: "18:00", to: "23:00" },
                { kind: "weekly", factor: 2, weekday: 1, from: "25:00", to: "23:00" },
                { kind: "weekly", factor: 2, weekday: 1, from: "18:00", to: "18:00" },
                { kind: "once", factor: 2, start: now + 7_200_000, end: now + 3_600_000 },
                { kind: "once", factor: 2, start: now - 7_200_000, end: now - 3_600_000 },
                { kind: "once", factor: 1.26, start: now, end: now + 3_600_000, announce: true },
                "quatsch",
            ],
            boostChannelId: "999",
        },
        DefaultLevelSettings()
    );

    check("Faktor geklemmt auf 1,1 bis 3", clean.boosts.map((boost) => boost.factor).join(",") === "3,1.1,1.3", clean.boosts.map((boost) => boost.factor).join(","));
    check("Unsinn fällt weg: Wochentag, Uhrzeit, gleich lang, Ende vor Beginn, schon vorbei", clean.boosts.length === 3 && clean.boosts[2].kind === "once" && clean.boosts[2].announce, JSON.stringify(clean.boosts));
    check("Jedes Fenster hat eine Kennung", clean.boosts.every((boost) => /^[\w-]{1,24}$/.test(boost.id)) && new Set(clean.boosts.map((boost) => boost.id)).size === 3);
    check("Erfundener Kanal wird null", clean.boostChannelId === null);

    const many = new LevelService({} as BotClient).Clean(guild, { boosts: Array.from({ length: 14 }, (_, index) => ({ kind: "weekly", factor: 2, weekday: index % 7, from: "18:00", to: "19:00" })) }, DefaultLevelSettings());

    check("Höchstens 10 Fenster", many.boosts.length === 10, String(many.boosts.length));

    // Review Plan 37: ein geleertes Feld ist kein 1.1.1970, ein Ende in ferner Zukunft wird gekappt.
    const empty = CleanBoosts(
        [
            { kind: "once", factor: 2, start: null, end: now + 3_600_000 },
            { kind: "once", factor: 2, start: "", end: now + 3_600_000 },
            { kind: "weekly", factor: 2, weekday: null, from: "18:00", to: "19:00" },
            { kind: "once", factor: 2, start: now, end: 1e20 },
        ],
        now
    );

    check("Leerer Beginn oder Wochentag: Fenster fällt weg", empty.length === 1, JSON.stringify(empty));
    check("Ende in ferner Zukunft: höchstens ein Jahr", (empty[0]?.end ?? Infinity) <= now + 366 * 86_400_000 && BoostText(ActiveBoost(empty, now + 1_000), now + 1_000).startsWith("2× XP bis "), JSON.stringify(empty[0]));

    const tiny = World({ boosts: [once(3, now - 60_000, now + 3_600_000)], roleBonus: [{ id: ROLE, factor: 1.2 }], voice: { on: true, xp: 1, alone: true, muted: true } });
    const ben = tiny.member(USER, { roles: [ROLE] });

    (tiny.guild as unknown as { voiceStates: { cache: Map<string, unknown> } }).voiceStates.cache.set(ben.id, { member: ben, channel: { id: VOICE, parentId: null, members: new Collection([[ben.id, ben]]) }, channelId: VOICE, selfMute: false, selfDeaf: false, mute: false, deaf: false });
    await tiny.service.Voice();
    check("Rundung: ein 3×-Fenster bringt nie mehr als das Dreifache", tiny.entry(USER).xp === 3, String(tiny.entry(USER).xp));
    check("Ohne Angabe bleiben die Fenster", new LevelService({} as BotClient).Clean(guild, {}, clean).boosts.length === 3);
}

/* ----------------------------------------------------------
   Plan 37, Task 3: Punkte von Hand mit Protokoll, /level punkte
   ---------------------------------------------------------- */
async function checkManual(): Promise<void> {
    console.log("\n  — Plan 37: Punkte von Hand —");

    const world = World({ rewards: [{ level: 1, roleId: REWARD }, { level: 3, roleId: ROLE }], stack: true });
    const lara = world.member(USER) as GuildMember & { added: string[]; removed: string[] };
    const mo = world.member(OTHER);
    const service = world.service;

    await service.Credit(lara, 50, { messages: 1 }, world.settings, TEXT);
    await service.Adjust(world.guild, USER, "add", 300, OTHER, "Turniersieg");

    const given = world.logs[0];

    check("Geben: Punkte, Level und Rolle", world.entry(USER).xp === 350 && world.entry(USER).level === 2 && lara.roles.cache.has(REWARD), JSON.stringify(world.entry(USER)));
    check("Geben: zählt in den heutigen Tag", world.day(USER)?.xp === 350, JSON.stringify(world.day(USER)));
    check("Geben: steht im Protokoll", given?.mode === "add" && given.amount === 300 && given.before === 50 && given.after === 350 && given.reason === "Turniersieg" && given.actorId === OTHER && given.userId === USER, JSON.stringify(given));

    await service.Adjust(world.guild, USER, "set", 700, OTHER, "");
    check("Setzen nach oben: beide Rollen", world.entry(USER).level === 3 && lara.roles.cache.has(ROLE) && lara.roles.cache.has(REWARD) && world.day(USER)?.xp === 700);

    await service.Adjust(world.guild, USER, "set", 150, OTHER, "");
    check("Setzen nach unten: Level und Rolle ziehen nach, Tag auch", world.entry(USER).level === 1 && !lara.roles.cache.has(ROLE) && lara.roles.cache.has(REWARD) && world.day(USER)?.xp === 150, JSON.stringify({ entry: world.entry(USER), day: world.day(USER), roles: [...lara.roles.cache.keys()] }));

    await service.Adjust(world.guild, USER, "add", -1000, OTHER, "Spam");

    const taken = world.logs[world.logs.length - 1];

    check("Abziehen unter 0: 0 Punkte, Level 0, keine Rolle", world.entry(USER).xp === 0 && world.entry(USER).level === 0 && !lara.roles.cache.has(REWARD), JSON.stringify(world.entry(USER)));
    check("Abziehen unter 0: Tag nie negativ", world.day(USER)?.xp === 0, JSON.stringify(world.day(USER)));
    check("Abziehen: Protokoll mit vorher und nachher", taken.amount === -1000 && taken.before === 150 && taken.after === 0 && taken.reason === "Spam", JSON.stringify(taken));

    await service.Adjust(world.guild, USER, "add", 200, OTHER, "");
    await service.Adjust(world.guild, USER, "reset", 0, OTHER, `Neu anfangen\n${"x".repeat(300)}`);

    const reset = world.logs[world.logs.length - 1];

    check("Zurücksetzen: protokolliert vorher und nachher", reset.mode === "reset" && reset.before === 200 && reset.after === 0 && world.day(USER) === undefined, JSON.stringify({ ...reset, reason: reset.reason.length }));
    check("Grund: eine Zeile, höchstens 200 Zeichen", reset.reason.length === 200 && !reset.reason.includes("\n"));

    type Api = { Write: (access: unknown, body: unknown) => Promise<Record<string, unknown>> };
    const route = new DashboardApiLevels(world.client) as unknown as Api;

    await route.Write({ guild: world.guild, member: mo }, { action: "adjust", userId: USER, mode: "add", amount: 5, reason: "Dashboard" });
    check("Dashboard: wer geändert hat, steht drin", world.logs[world.logs.length - 1].actorId === OTHER && world.logs[world.logs.length - 1].reason === "Dashboard");

    const log = (await route.Write({ guild: world.guild, member: mo }, { action: "log" })) as { entries?: { name: string; actorName: string; reason: string }[] };

    check("Dashboard: Protokoll mit Namen, neuester zuerst", log.entries?.[0]?.name === "Lara" && log.entries[0].actorName === "Mo" && log.entries[0].reason === "Dashboard" && log.entries.length === world.logs.length, JSON.stringify(log.entries?.[0]));

    // /level punkte
    const replies: { flags?: unknown; text: string }[] = [];
    const deferred: number[] = [];
    const ask = (allowed: boolean, action: string, points: number | null, reason: string | null) =>
        ({
            inCachedGuild: () => true,
            guildId: GUILD,
            guild: world.guild,
            user: mo.user,
            member: mo,
            memberPermissions: { has: () => allowed },
            options: {
                getSubcommand: () => "punkte",
                getString: (name: string) => (name === "aktion" ? action : name === "grund" ? reason : null),
                getUser: () => lara.user,
                getInteger: (name: string) => (name === "punkte" ? points : null),
            },
            reply: async (payload: { flags?: unknown }) => void replies.push({ flags: payload.flags, text: JSON.stringify(payload) }),
            deferReply: async (payload: { flags?: unknown }) => void deferred.push(Number(payload?.flags)),
            editReply: async (payload: unknown) => void replies.push({ flags: "edit", text: JSON.stringify(payload) }),
        }) as unknown as ChatInputCommandInteraction;
    const command = new LevelCommand(world.client);
    const count = world.logs.length;
    const xp = world.entry(USER).xp;

    await command.Execute(ask(false, "geben", 100, "Event"));
    check("/level punkte ohne „Server verwalten“: nichts geändert, Antwort nur für ihn", world.entry(USER).xp === xp && world.logs.length === count && replies.length === 1 && (Number(replies[0].flags) & 64) === 64 && replies[0].text.includes("Server verwalten"), replies[0]?.text);

    await command.Execute(ask(true, "geben", 100, "Event"));
    // Review Plan 37: erst bestätigen, dann schreiben - sonst zeigt Discord nach 3 s „reagiert nicht“, und wer es nochmal schickt, gibt doppelt.
    check("/level punkte: wird gleich bestätigt (nur für den Fragenden), Antwort danach", deferred.length === 1 && (deferred[0] & 64) === 64 && replies[replies.length - 1].flags === "edit" && replies[replies.length - 1].text.includes("Protokoll"), JSON.stringify({ deferred, last: replies[replies.length - 1] }));
    check("/level punkte geben: Punkte und Protokoll", world.entry(USER).xp === xp + 100 && world.logs[world.logs.length - 1].reason === "Event" && world.logs[world.logs.length - 1].actorId === OTHER, JSON.stringify(world.logs[world.logs.length - 1]));

    await command.Execute(ask(true, "abziehen", 40, null));
    check("/level punkte abziehen", world.entry(USER).xp === xp + 60 && world.logs[world.logs.length - 1].amount === -40);

    const before = world.logs.length;

    await command.Execute(ask(true, "setzen", null, null));
    check("/level punkte setzen ohne Zahl: Hinweis, nichts geändert", world.logs.length === before && replies[replies.length - 1].text.includes("Punkte"), replies[replies.length - 1].text);

    await command.Execute(ask(true, "zuruecksetzen", null, "Neustart"));
    check("/level punkte zurücksetzen", world.entry(USER).xp === 0 && world.logs[world.logs.length - 1].mode === "reset");

    // Review Plan 37, I1: eine eingefügte ID im Punktefeld - gedeckelt, und das Protokoll stimmt.
    await service.Adjust(world.guild, USER, "add", 1e17, OTHER, "Tippfehler");
    check("Riesige Zahl beim Geben: gedeckelt und protokolliert", world.entry(USER).xp === MAX_XP_MANUAL && world.logs[world.logs.length - 1].amount === MAX_XP_MANUAL && world.logs[world.logs.length - 1].reason === "Tippfehler", JSON.stringify({ xp: world.entry(USER).xp, log: world.logs[world.logs.length - 1] }));
    await service.Adjust(world.guild, USER, "set", 1e17, OTHER, "");
    check("Riesige Zahl beim Setzen: gedeckelt", world.entry(USER).xp === MAX_XP_MANUAL, String(world.entry(USER).xp));

    // Review Plan 37: Belohnungsrollen fallen nur bei Punkten von Hand unter die erste Stufe weg, nicht bei einem Aufstieg.
    const gift = World({ rewards: [{ level: 5, roleId: REWARD }] });
    const ida = gift.member(OTHER, { roles: [REWARD] });

    await gift.service.Credit(ida, 100, { messages: 1 }, gift.settings, TEXT);
    check("Aufstieg unter der ersten Belohnungsstufe: von Hand vergebene Rolle bleibt", gift.entry(OTHER).level === 1 && ida.roles.cache.has(REWARD), JSON.stringify([...ida.roles.cache.keys()]));
}

/* ----------------------------------------------------------
   Plan 37, Task 4: Aktivste der Woche und des Monats, Ankündigungen
   ---------------------------------------------------------- */
async function checkTop(): Promise<void> {
    console.log("\n  — Plan 37: Aktivste der Woche und des Monats —");

    const at = (year: number, month: number, day: number, hour: number, minute = 0) => FromZone(year, month, day, hour, minute)!;
    const day = (month: number, date: number) => Date.UTC(2026, month - 1, date) / 86_400_000;
    const monday = at(2026, 11, 2, 18, 5);

    check("Montag 18:05: fällig, die Vorwoche", JSON.stringify(TopDue("week", monday)) === JSON.stringify({ key: "2026-10-26", from: day(10, 26), to: day(11, 1) }), JSON.stringify(TopDue("week", monday)));
    check("Montag 17:59 und Dienstag: nicht fällig", TopDue("week", at(2026, 11, 2, 17, 59)) === null && TopDue("week", at(2026, 11, 3, 18, 5)) === null);
    check("Am 1. um 18:00: der Vormonat", JSON.stringify(TopDue("month", at(2026, 11, 1, 18))) === JSON.stringify({ key: "2026-10", from: day(10, 1), to: day(10, 31) }), JSON.stringify(TopDue("month", at(2026, 11, 1, 18))));
    check("Im Januar: Dezember des Vorjahres", TopDue("month", at(2027, 1, 1, 19))?.key === "2026-12" && TopDue("month", at(2026, 11, 2, 18)) === null);

    const TOP = "90071992547409966";
    const LOCKED = "90071992547409967";
    const OLD = "90071992547409968";
    const off = { on: false, channelId: null, roleId: null };
    const setup = (week: { on: boolean; channelId: string | null; roleId: string | null }, activity = true) => {
        const world = World({ top: { week, month: off } });
        const roles = world.guild.roles.cache as Map<string, Role>;

        roles.set(TOP, { id: TOP, name: "Aktivste", editable: true } as unknown as Role);
        roles.set(LOCKED, { id: LOCKED, name: "Gesperrt", editable: false } as unknown as Role);

        const old = world.member(OLD, { roles: [TOP] }) as GuildMember & { added: string[]; removed: string[] };
        const lara = world.member(USER);
        const mo = world.member(OTHER);

        world.tops.set(`${GUILD}:week`, { periodKey: "2026-10-19", holders: [OLD], error: null, postedAt: 0 });

        if (activity)
            void world.client.levelDays.AddMany([
                { guildId: GUILD, userId: USER, day: day(10, 27), xp: 500, messages: 20, voiceMinutes: 0 },
                { guildId: GUILD, userId: OTHER, day: day(11, 1), xp: 300, messages: 5, voiceMinutes: 60 },
                { guildId: GUILD, userId: OTHER, day: day(11, 2), xp: 9_999, messages: 1, voiceMinutes: 0 },
                { guildId: GUILD, userId: OLD, day: day(10, 20), xp: 800, messages: 9, voiceMinutes: 0 },
            ]);

        return { world, old, lara, mo };
    };

    const { world, old, lara, mo } = setup({ on: true, channelId: SPAM, roleId: TOP });
    const drawn: string[] = [];

    await PostTop(world.client, world.guild, "week", monday, { onText: (text) => void drawn.push(text) });

    const status = world.tops.get(`${GUILD}:week`)!;

    check("Post mit Bild im Kanal", world.sent.length === 1 && world.sent[0].channelId === SPAM && world.sent[0].payload.files?.length === 1, JSON.stringify(world.sent.map((entry) => entry.channelId)));
    check("Titel „Aktivste der Woche“ und der Zeitraum", drawn.includes("Aktivste der Woche") && drawn.includes("26.10.–01.11."), JSON.stringify(drawn.slice(0, 6)));
    check("Gewertet wird die Vorwoche, nicht heute", status.holders.join(",") === `${USER},${OTHER}` && status.periodKey === "2026-10-26", JSON.stringify(status));
    check("Rolle wandert von alt zu neu", !old.roles.cache.has(TOP) && lara.roles.cache.has(TOP) && mo.roles.cache.has(TOP), JSON.stringify({ old: old.removed, lara: [...lara.roles.cache.keys()] }));
    check("Status ohne Fehler", status.error === null, String(status.error));

    await PostTop(world.client, world.guild, "week", monday + 60_000);
    check("Zweiter Lauf im selben Zeitraum: kein zweiter Post", world.sent.length === 1);

    await PostTop(world.client, world.guild, "month", at(2026, 11, 1, 18, 5));
    check("Monat aus: nichts", world.sent.length === 1);

    const locked = setup({ on: true, channelId: SPAM, roleId: LOCKED });

    await PostTop(locked.world.client, locked.world.guild, "week", monday);
    check("Rolle nicht vergebbar: Post kommt, Fehler im Status", locked.world.sent.length === 1 && /über/.test(locked.world.tops.get(`${GUILD}:week`)!.error ?? ""), String(locked.world.tops.get(`${GUILD}:week`)!.error));

    const gone = setup({ on: true, channelId: "999", roleId: TOP });

    await PostTop(gone.world.client, gone.world.guild, "week", monday);
    check("Kanal weg: Fehler im Status, die Rolle wandert trotzdem", gone.world.sent.length === 0 && /Kanal/.test(gone.world.tops.get(`${GUILD}:week`)!.error ?? "") && gone.lara.roles.cache.has(TOP), String(gone.world.tops.get(`${GUILD}:week`)!.error));

    const quiet = setup({ on: true, channelId: SPAM, roleId: TOP }, false);

    await PostTop(quiet.world.client, quiet.world.guild, "week", monday);
    check("Niemand aktiv: kein Post, Hinweis im Status, Rolle bleibt", quiet.world.sent.length === 0 && /Niemand/.test(quiet.world.tops.get(`${GUILD}:week`)!.error ?? "") && quiet.old.roles.cache.has(TOP));

    const broken = setup({ on: true, channelId: SPAM, roleId: TOP });

    (broken.world.client.levelDays as unknown as { Sums: () => Promise<never> }).Sums = async () => {
        throw new Error("Datenbank weg");
    };

    const threw = await PostTop(broken.world.client, broken.world.guild, "week", monday).then(() => false, () => true);

    check("Bricht der Post nach dem Beanspruchen ab: Fehler im Status, kein Absturz", !threw && /abgebrochen/.test(broken.world.tops.get(`${GUILD}:week`)!.error ?? ""), String(broken.world.tops.get(`${GUILD}:week`)!.error));

    const scheduled = setup({ on: true, channelId: SPAM, roleId: null });
    const schedule = new LevelSchedule(scheduled.world.client);

    await schedule.Execute(at(2026, 11, 2, 17, 59));
    await schedule.Execute(monday);
    await schedule.Execute(monday + 60_000);
    check("Minutenlauf: genau ein Post ab 18:00", scheduled.world.sent.length === 1);

    const guild = FakeGuild();
    const cleaned = new LevelService({} as BotClient).Clean(guild, { top: { week: { on: true, channelId: "999", roleId: GUILD }, month: { on: true, channelId: TEXT, roleId: ROLE } } }, DefaultLevelSettings());

    check("Einstellungen: erfundener Kanal und @everyone fallen weg", cleaned.top.week.channelId === null && cleaned.top.week.roleId === null && cleaned.top.month.channelId === TEXT && cleaned.top.month.roleId === ROLE, JSON.stringify(cleaned.top));

    const refused = await World().service.Save(FakeGuild(), { top: { week: { on: true, channelId: null, roleId: null } } }).catch((error: Error) => error);

    check("An ohne Kanal: wird nicht gespeichert", refused instanceof LevelError, String(refused));

    // Ankündigung der Zeitfenster
    const t0 = at(2026, 11, 6, 20);
    const announce = World({ boosts: [{ id: "party", kind: "once", factor: 2, start: t0, end: t0 + 3_600_000, weekday: null, from: null, to: null, announce: true }], boostChannelId: TEXT });
    const runner = new LevelSchedule(announce.client);

    await runner.Execute(t0 - 60_000);
    await runner.Execute(t0 + 30_000);
    await runner.Execute(t0 + 90_000);
    check("Beginn einmal angekündigt", announce.sent.length === 1 && announce.sent[0].channelId === TEXT && announce.sent[0].text.includes("2× XP bis 21:00"), JSON.stringify(announce.sent.map((entry) => entry.text)));

    await runner.Execute(t0 + 3_600_000 + 10_000);
    await runner.Execute(t0 + 3_600_000 + 70_000);
    check("Ende einmal angekündigt", announce.sent.length === 2 && announce.sent[1].text.includes("vorbei"), JSON.stringify(announce.sent.map((entry) => entry.text)));

    const slow = World({ boosts: [{ id: "slow", kind: "once", factor: 2, start: t0, end: t0 + 3_600_000, weekday: null, from: null, to: null, announce: true }], boostChannelId: TEXT });

    await new LevelSchedule(slow.client).Execute(t0 + 3 * 60_000);
    check("Lauf erst drei Minuten nach Beginn (viele Server): Beginn wird trotzdem angekündigt", slow.sent.length === 1, JSON.stringify(slow.sent.map((entry) => entry.text)));

    const restart = World({ boosts: [{ id: "party", kind: "once", factor: 2, start: t0, end: t0 + 3_600_000, weekday: null, from: null, to: null, announce: true }], boostChannelId: TEXT });

    await new LevelSchedule(restart.client).Execute(t0 + 10 * 60_000);
    check("Nach einem Neustart mitten im Fenster: keine späte Ankündigung", restart.sent.length === 0);

    const silent = World({ boosts: [{ id: "q", kind: "once", factor: 2, start: t0, end: t0 + 3_600_000, weekday: null, from: null, to: null, announce: false }], boostChannelId: TEXT });

    await new LevelSchedule(silent.client).Execute(t0 + 30_000);
    check("Ohne Ankündigen: still", silent.sent.length === 0);

    // Plan 43: ohne Gestaltung genau die bisherigen Sätze, ohne Pings.
    const plain = announce.sent.map((entry) => entry.payload as { content?: string; allowedMentions?: unknown });

    check("Ohne Gestaltung: die bisherigen Sätze", plain[0]?.content === "Ab jetzt: **2× XP bis 21:00**." && plain[1]?.content === "Die 2× XP sind vorbei.", JSON.stringify(plain.map((entry) => entry.content)));

    // Plan 43: Beginn gestaltet, Ende nicht - die Platzhalter gefüllt, Rollen pingen, @everyone nicht.
    const ROLE_PING = `<@&${ROLE}>`;
    const designed = World({
        boosts: [{ id: "party", kind: "once", factor: 2, start: t0, end: t0 + 3_600_000, weekday: null, from: null, to: null, announce: true }],
        boostChannelId: TEXT,
        boostMessages: { start: { accent: "#22c55e", blocks: [{ type: "text", body: `Los: {boost} | {boost.factor}× | {boost.start} bis {boost.end} ({boost.end.relative}) auf {guild} ${ROLE_PING} @everyone` }] }, end: null },
    });
    const designedRunner = new LevelSchedule(designed.client);

    await designedRunner.Execute(t0 + 30_000);
    await designedRunner.Execute(t0 + 3_600_000 + 10_000);

    const second = (ms: number) => Math.floor(ms / 1000);
    const card = designed.sent[0]?.payload as { components?: unknown[]; flags?: number; allowedMentions?: { parse?: string[] }; content?: string } | undefined;
    const cardText = JSON.stringify(card?.components ?? []);

    check(
        "Gestalteter Beginn: als Karte, Platzhalter gefüllt",
        Boolean(card?.components?.length) && cardText.includes(`Los: 2× XP bis 21:00 | 2× | <t:${second(t0)}:F> bis <t:${second(t0 + 3_600_000)}:F> (<t:${second(t0 + 3_600_000)}:R>) auf Dev Server`),
        cardText.slice(0, 400)
    );
    check("Gestalteter Beginn: Rollen pingen, @everyone nicht", JSON.stringify(card?.allowedMentions) === JSON.stringify({ parse: ["roles"] }), JSON.stringify(card?.allowedMentions));
    check("Ende ohne Gestaltung: der bisherige Satz", (designed.sent[1]?.payload as { content?: string } | undefined)?.content === "Die 2× XP sind vorbei.", JSON.stringify(designed.sent.map((entry) => entry.text.slice(0, 80))));

    // Bereinigung
    const cleaner = new LevelService({} as BotClient);
    const fresh = DefaultLevelSettings();
    const boostDocs = cleaner.Clean(FakeGuild(), { boostMessages: { start: { accent: null, blocks: [{ type: "text", body: "Ab jetzt {boost}" }] }, end: "quatsch" } }, fresh).boostMessages;

    check("Vorgabe: keine eigene Boost-Nachricht", JSON.stringify(fresh.boostMessages) === JSON.stringify({ start: null, end: null }), JSON.stringify(fresh.boostMessages));
    check("Bereinigung: Gestaltung bleibt, Unsinn wird null", boostDocs.start?.blocks.length === 1 && boostDocs.end === null, JSON.stringify(boostDocs));
    check("Ohne Angabe bleibt die Gestaltung", cleaner.Clean(FakeGuild(), {}, { ...fresh, boostMessages: boostDocs }).boostMessages.start?.blocks.length === 1);
    check("Platzhalter der Boost-Nachricht: Bot und Dashboard gleich", JSON.stringify([...BOOST_PLACEHOLDER_KEYS]) === JSON.stringify(CLIENT_BOOST_PLACEHOLDERS.map((entry) => entry.key)), JSON.stringify(CLIENT_BOOST_PLACEHOLDERS.map((entry) => entry.key)));
}

/* ----------------------------------------------------------
   Plan 38, Task 2: das Ranglisten-Bild aus dem Baukasten im Bot
   ---------------------------------------------------------- */
async function checkBoardBot(): Promise<void> {
    console.log("\n  — Plan 38: Ranglisten-Bild im Bot —");

    const fill = async (world: IWorld, count: number) => {
        for (let index = 1; index <= count; index++) {
            const userId = `9007199254743${String(index).padStart(4, "0")}`;

            world.member(userId);
            await world.client.levels.Add(GUILD, userId, 3000 - index * 10, { messages: 10, voiceMinutes: 90 });
        }
    };

    const broken = World({ boardDesign: { kind: "board", head: null } as unknown as IBoardDesign });

    await fill(broken, 3);

    const png = await broken.service.BoardImage(broken.guild, await broken.service.Board(broken.guild, "all", 1, null), null);

    check("Fehler im Design: das bisherige Bild kommt", isPng(png));

    const texts: string[] = [];
    const plain = World();

    await fill(plain, 3);
    await plain.service.BoardImage(plain.guild, await plain.service.Board(plain.guild, "all", 1, null), null, {}, { onText: (text) => void texts.push(text) });
    check("Ohne eigenes Design: Vorlage Podium mit dem bisherigen Titel", texts.includes("Rangliste") && texts.includes("Lifetime"), JSON.stringify(texts.slice(0, 4)));

    const many = World({ boardDesign: BOARD_TEMPLATES.kompakt() });
    const shown: unknown[] = [];

    await fill(many, 25);
    check("Kompakt: 20 Plätze je Seite", (await many.service.PerPage(GUILD)) === 20);

    const click = (customId: string, userId: string) =>
        HandleBoardButton(many.client, {
            customId,
            user: { id: userId },
            guild: many.guild,
            deferUpdate: async () => undefined,
            deferReply: async () => undefined,
            editReply: async (payload: unknown) => void shown.push(payload),
        } as unknown as ButtonInteraction);

    await click(`lv:p:all:2:${USER}`, USER);
    check("Kompakt mit 25 Mitgliedern: 2 Seiten", Buttons(shown.at(-1)).find((button) => button.custom_id === "lv:x")?.label === "Seite 2 von 2", JSON.stringify(Buttons(shown.at(-1)).find((button) => button.custom_id === "lv:x")));

    await click(`lv:me:all:${USER}`, "90071992547430023");
    check("Meine Seite für Platz 23: Seite 2", Buttons(shown.at(-1)).find((button) => button.custom_id === "lv:x")?.label === "Seite 2 von 2", JSON.stringify(Buttons(shown.at(-1)).find((button) => button.custom_id === "lv:x")));
}

/* ----------------------------------------------------------
   Plan 38, Task 3: API des Ranglisten-Baukastens
   ---------------------------------------------------------- */
async function checkBoardApi(): Promise<void> {
    console.log("\n  — Plan 38: Ranglisten-Baukasten (API) —");

    const world = World();
    const lara = world.member(USER);

    (world.guild as unknown as { emojis: { cache: Map<string, unknown> } }).emojis = { cache: new Map() };
    (world.client.levels as unknown as { Top: () => Promise<unknown[]> }).Top = async () => [];
    Object.assign(world.client, { levelBackfill: { ...world.client.levelBackfill, Of: async () => null } });
    await world.service.Credit(lara, 450, { messages: 3, voiceMinutes: 90 }, world.settings, TEXT);
    world.sent.length = 0;

    type Api = { Read: (access: unknown, query: unknown) => Promise<Record<string, unknown>>; Write: (access: unknown, body: unknown) => Promise<Record<string, unknown>> };
    const route = new DashboardApiLevels(world.client) as unknown as Api;
    const access = { guild: world.guild, member: lara };
    const payload = (await route.Read(access, {})) as { templates?: { board?: Record<string, { template: string }> }; designs?: { boardDesign?: unknown }; boardEntryPlaceholders?: string[]; boardFramePlaceholders?: string[] };

    check(
        "GET liefert die vier Vorlagen, kein eigenes Design und die Platzhalter",
        Object.keys(payload.templates?.board ?? {}).join() === "podium,liste,kompakt,arena" && payload.designs?.boardDesign === null && Boolean(payload.boardEntryPlaceholders?.includes("trend")) && Boolean(payload.boardFramePlaceholders?.includes("title")),
        JSON.stringify({ templates: Object.keys(payload.templates?.board ?? {}), designs: payload.designs })
    );

    const preview = (await route.Write(access, { action: "design.preview", kind: "board", design: BOARD_TEMPLATES.liste() })) as { image?: string; width?: number; height?: number; areas?: Record<string, { boxes: unknown[] } | null>; design?: { template: string } };

    check("Vorschau: Bild, Größe und alle vier Bereiche", Boolean(preview.image?.startsWith("data:image/png;base64,")) && preview.width === 1000 && (preview.height ?? 0) > 800 && ["head", "row", "foot"].every((area) => (preview.areas?.[area]?.boxes.length ?? 0) > 0), JSON.stringify({ width: preview.width, height: preview.height, areas: Object.keys(preview.areas ?? {}) }));
    check("Vorschau mit einem Mitglied: aufgefüllt bis zur vollen Seite", preview.height === 140 + 10 * 82 + 10 + 80, String(preview.height));
    check("Vorschau gibt das bereinigte Design zurück", preview.design?.template === "liste");

    const thumbs = (await route.Write(access, { action: "design.thumbs", kind: "board" })) as { thumbs?: Record<string, string> };

    check("Vorschaubilder je Vorlage", Object.keys(thumbs.thumbs ?? {}).length === 4 && Object.values(thumbs.thumbs ?? {}).every((url) => url.startsWith("data:image/png")));

    const own = { ...BOARD_TEMPLATES.kompakt(), accent: "#22c55e", medals: ["#111111", "#222222", "#333333"], title: "Unsere Besten" };
    const saved = (await route.Write(access, { action: "design.save", kind: "board", design: own })) as { design?: { template: string } };

    check("Speichern: Design steht in den Einstellungen", saved.design?.template === "kompakt" && world.settings.boardDesign?.perPage === 20);
    check("Nach Kompakt hat die Vorlage Podium weiter ein Podium", BOARD_TEMPLATES.podium(world.settings.boardStyle).podium.on, JSON.stringify(world.settings.boardStyle));
    check("Speichern übernimmt Akzent, Medaillen und Titel für die Web-Rangliste", world.settings.boardStyle.accent === "#22c55e" && world.settings.boardStyle.medals.join() === "#111111,#222222,#333333" && world.settings.boardStyle.title === "Unsere Besten", JSON.stringify(world.settings.boardStyle));

    await route.Write(access, { action: "design.test", kind: "board" });
    check("Test schickt das Ranglisten-Bild per DM", world.sent.length === 1 && world.sent[0].to === USER && world.sent[0].payload.files?.length === 1, JSON.stringify(world.sent.map((entry) => entry.to)));

    const reset = (await route.Write(access, { action: "design.save", kind: "board", design: null })) as { design?: unknown; effective?: { accent: string; podium: { on: boolean } }; templates?: Record<string, { accent: string }> };

    check("null setzt auf die Vorlage zurück", reset.design === null && world.settings.boardDesign === null);
    check("Zurücksetzen: das Studio bekommt das Design, das der Bot zeichnet, und die Vorlagen im neuen Stil", reset.effective?.accent === "#22c55e" && reset.effective.podium.on && reset.templates?.liste?.accent === "#22c55e", JSON.stringify({ effective: reset.effective?.accent, liste: reset.templates?.liste?.accent }));
}

async function main(): Promise<void> {
    console.log("\n📈 Level System\n");

    const client = new BotClient();

    await client.configService.Initialize();

    checkMath();
    checkAlwaysOn();
    await checkCounting();
    await checkAnnounce();
    await checkBackfill();
    await checkBoard();
    await checkImages();
    await checkDashboard();
    await checkPublic();
    await checkReviewFixes();
    await checkDesignBot();
    await checkBoardStyle();
    await checkDesignApi();
    await checkLivePulse();
    await checkBoosts();
    await checkManual();
    await checkTop();
    await checkBoardBot();
    await checkBoardPost();
    await checkBoardApi();
    checkSettings(client);
    await checkCard();

    if (await client.databaseService.Connect()) {
        try {
            await checkDatabase(client);
            await checkExtrasDatabase(client);
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
