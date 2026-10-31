/**
 * Level System, Plan 34: der einmalige Nachtrag aus der Server-Übersicht.
 * Siehe docs/Levels.md.
 *
 * Je Server genau einmal: Wer die Zeile in level_backfill zuerst anlegt,
 * schreibt gut - zwei Läufe gleichzeitig bekommen nichts doppelt. D0 (cutoff)
 * ist der Stichtag des ersten Nachtrags überhaupt; nur Tage davor werden
 * nachgetragen, denn ab D0 zählt das Level System selbst.
 *
 * War das Level System auf dem Server aus, bekommt jeder alles, was die
 * Übersicht getrackt hat (ohne Deckel), samt einer Aufstiegs-Nachricht für den
 * ganzen Sprung. War es an, werden nur die Tageswerte für 7 und 30 Tage
 * vorgefüllt - Lifetime hat es selbst gezählt.
 *
 * Der Lauf geht im Hintergrund (StartBackfill), damit die anderen Zeitaufgaben
 * nicht warten. Er merkt sich je Person, wie weit er ist; bricht er ab, setzt
 * der nächste Prozess dahinter fort. Die Marke wird vor dem Gutschreiben
 * gesetzt: bei einem Absturz genau in diesem Moment bekommt eine Person nichts,
 * aber nie doppelt.
 */
import { Guild } from "discord.js";
import BotClient from "../../client/BotClient";
import { BACKFILL_PACE_MS, BackfillXp, LevelFromXp, Today } from "../../constants/Levels";
import { LevelBackfillMode } from "../../interfaces/services/levels/ILevels";
import { LEVELS_MODULE } from "../LevelService";
import logger from "../../utils/logger";

export interface IBackfillResult {
    guildId: string;
    mode: LevelBackfillMode;
    cutoff: number;
    members: number;
    xp: number;
}

interface IJob {
    mode: LevelBackfillMode;
    cutoff: number;
    cursor: string | null;
    members: number;
    xp: number;
}

/** Wann dieser Prozess startete: Ein unfertiger Nachtrag, der davor beansprucht wurde, lief in einem Prozess, den es nicht mehr gibt. */
const PROCESS_START = Date.now();

let running = false;

function Sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Snowflakes als Zahl vergleichen - als Text wäre „9“ größer als „10“. */
function After(userId: string, cursor: string | null): boolean {
    return cursor === null || BigInt(userId) > BigInt(cursor);
}

/** Startet den Nachtrag im Hintergrund. false: Er läuft in diesem Prozess schon. */
export function StartBackfill(client: BotClient): boolean {
    if (running) return false;

    running = true;
    void RunBackfill(client)
        .catch((error) => logger.warn(`📈 Level-Nachtrag abgebrochen - ${String(error)}`))
        .finally(() => {
            running = false;
        });

    return true;
}

/** Alle Server ohne fertigen Nachtrag abarbeiten. Zurück kommt, was dieser Lauf erledigt hat. */
export async function RunBackfill(client: BotClient, now = Date.now(), wait: (ms: number) => Promise<void> = Sleep, since = PROCESS_START): Promise<IBackfillResult[]> {
    const done: IBackfillResult[] = [];

    for (const guild of client.guilds.cache.values()) {
        const row = await client.levelBackfill.Of(guild.id);
        let job: IJob;

        if (row) {
            if (row.doneAt !== null) continue;
            // Läuft noch in diesem Prozess, oder ein anderer hat ihn eben übernommen.
            if (!(await client.levelBackfill.Resume(guild.id, now, since))) continue;

            job = { mode: row.mode, cutoff: row.cutoff, cursor: row.cursor, members: row.members, xp: row.xp };
        } else {
            const cutoff = (await client.levelBackfill.FirstCutoff()) ?? Today(now);
            const wasOn = (await client.settings.RawModules(guild.id)).includes(LEVELS_MODULE);
            const rows = await client.activity.MemberDays(guild.id, cutoff);
            const mode: LevelBackfillMode = !rows.length ? "none" : wasOn ? "prefill" : "backfill";

            if (!(await client.levelBackfill.Claim(guild.id, now, cutoff, mode))) continue;

            job = { mode, cutoff, cursor: null, members: 0, xp: 0 };
        }

        if (job.mode !== "none") await Work(client, guild, job, wait);

        await client.levelBackfill.Finish(guild.id, job, now);
        done.push({ guildId: guild.id, mode: job.mode, cutoff: job.cutoff, members: job.members, xp: job.xp });
    }

    return done;
}

/** Person für Person in ID-Reihenfolge, ab der Marke. */
async function Work(client: BotClient, guild: Guild, job: IJob, wait: (ms: number) => Promise<void>): Promise<void> {
    const settings = await client.levelService.Settings(guild.id);
    const rows = await client.activity.MemberDays(guild.id, job.cutoff);
    const users = [...Group(rows)].filter(([userId]) => After(userId, job.cursor)).sort(([a], [b]) => (BigInt(a) < BigInt(b) ? -1 : 1));
    let announced = 0;

    for (const [userId, own] of users) {
        const days = own.map((row) => ({ guildId: guild.id, userId, day: row.day, xp: BackfillXp(row.messages, row.voice, settings), messages: row.messages, voiceMinutes: row.voice }));
        const xp = days.reduce((sum, day) => sum + day.xp, 0);

        if (job.mode === "prefill") {
            await client.levelBackfill.Progress(guild.id, userId, job.members + 1, job.xp + xp);
            job.members++;
            job.xp += xp;
            await client.levelDays.AddMany(days);

            continue;
        }

        const member = guild.members.cache.get(userId) ?? (await guild.members.fetch(userId).catch(() => null));

        if (!member || member.user.bot || settings.noRoles.some((roleId) => member.roles.cache.has(roleId))) continue;

        // Erst die Marke, dann gutschreiben: lieber einmal nichts als doppelt.
        await client.levelBackfill.Progress(guild.id, userId, job.members + 1, job.xp + xp);
        job.members++;
        job.xp += xp;

        const before = (await client.levels.Of(guild.id, userId))?.level ?? 0;

        await client.levelDays.AddMany(days);
        await client.levels.Add(guild.id, userId, xp, { messages: own.reduce((sum, row) => sum + row.messages, 0), voiceMinutes: own.reduce((sum, row) => sum + row.voice, 0) });

        if (xp <= 0) continue;

        // Verteilt, nicht alles in derselben Sekunde: vor jeder weiteren Aufstiegs-Nachricht warten.
        const after = await client.levels.Of(guild.id, userId);

        if (announced > 0 && after && LevelFromXp(after.xp, settings.base) > before) await wait(BACKFILL_PACE_MS);
        if (await client.levelService.Promote(member, settings, before, null)) announced++;
    }
}

function Group(rows: { userId: string; day: number; messages: number; voice: number }[]): Map<string, { day: number; messages: number; voice: number }[]> {
    const groups = new Map<string, { day: number; messages: number; voice: number }[]>();

    for (const row of rows) groups.set(row.userId, [...(groups.get(row.userId) ?? []), row]);

    return groups;
}
