import type { IBackupsOverview, NightState } from "../../shared/backups.ts";
import { botOverview } from "../bot.ts";
import type { IConfig } from "../config.ts";
import { databaseReady } from "../db.ts";
import { publish } from "../events.ts";
import { berlinDate, daysBefore } from "../status/history.ts";
import { schedulePlans, stopPlans } from "./plan.ts";
import { backupGuilds, backupsReady, createBackup, lastFullRound, pruneBackups, recordRun, type IRunRow } from "./store.ts";

/**
 * Die nächtliche Runde: um 0:00 Berliner Zeit ein Backup jedes Servers, auf
 * dem der Bot ist. Antwortet der Bot nicht, gilt die Liste der letzten
 * vollständigen Runde, denn die Backups selbst brauchen nur die Datenbank.
 * War der Server um Mitternacht aus, holt er die Runde beim Start nach.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NIGHTS = 14;
/** Nach dem Start erst kurz warten: Datenbank und Bot sollen bereit sein. */
const CATCH_UP_DELAY = 60_000;

const BERLIN_TIME = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** Bis zur nächsten Mitternacht in Berlin. Genau um Mitternacht: die übernächste. */
export function msUntilBerlinMidnight(now: number): number {
    const [year, month, day] = berlinDate(now).split("-").map(Number);

    // Mitternacht in Berlin ist 22:00 (Sommer) oder 23:00 (Winter) UTC des Vortags.
    for (const offset of [2, 1]) {
        const candidate = Date.UTC(year, month - 1, day + 1) - offset * HOUR;
        if (candidate > now && BERLIN_TIME.format(candidate) === "00:00") return candidate - now;
    }

    return DAY;
}

/** Die letzten 14 Kalendernächte in Berlin, älteste zuerst: lief die Runde, scheiterte sie, oder gab es nur ein Backup von Hand. */
export function nightsOf(runs: readonly { readonly roundAt: Date; readonly ok: boolean }[], hand: readonly Date[], now: number): NightState[] {
    const today = berlinDate(now);

    return Array.from({ length: NIGHTS }, (_, index): NightState => {
        // Nach Kalendertagen, nicht in 24-Stunden-Schritten: um die Zeitumstellung fehlte sonst ein Tag.
        const date = daysBefore(today, NIGHTS - 1 - index);
        const that = runs.filter((run) => berlinDate(run.roundAt.getTime()) === date);

        if (that.some((run) => run.ok)) return "ok";
        if (that.length > 0) return "fail";
        if (hand.some((at) => berlinDate(at.getTime()) === date)) return "hand";

        return "none";
    });
}

/** Die letzte volle Runde. Ein Server, der danach erfolgreich nachgeholt wurde, zählt als gesichert. */
export function summarizeRound(runs: readonly IRunRow[]): IBackupsOverview["round"] {
    const full = runs.filter((run) => run.full);
    const last = full.at(-1)?.roundAt.getTime();
    if (last === undefined) return null;

    const round = full.filter((run) => run.roundAt.getTime() === last);
    const recovered = (guildId: string): boolean => runs.some((run) => run.guildId === guildId && run.ok && run.roundAt.getTime() > last);
    const failed = round.filter((run) => !run.ok && !recovered(run.guildId));

    return {
        at: new Date(last).toISOString(),
        ok: round.length - failed.length,
        total: round.length,
        failed: failed.map((run) => ({ guildId: run.guildId, name: run.guildName, reason: run.reason ?? "unbekannter Fehler" })),
    };
}

export function shouldCatchUp(lastRound: Date | null, now: number): boolean {
    return lastRound === null || now - lastRound.getTime() > 24 * HOUR;
}

/** Die zuletzt angestoßene Runde. key: "*" für alle Server, sonst die IDs beim Nachholen. */
let running: { readonly key: string; readonly promise: Promise<{ ok: number; failed: number }> } | null = null;

export function roundRunning(): boolean {
    return running !== null;
}

/**
 * Eine Runde für alle Server oder, mit guildIds, nur für diese (Nachholen).
 * Läuft dieselbe schon, kommt ihr Ergebnis zurück. Eine andere wartet
 * dahinter: Sonst übernähme die volle Runde um Mitternacht das Ergebnis eines
 * Nachholens, und die Nacht fiele aus.
 */
export function runRound(config: IConfig, guildIds?: readonly string[]): Promise<{ ok: number; failed: number }> {
    const key = guildIds ? [...guildIds].sort().join(",") : "*";
    if (running?.key === key) return running.promise;

    const before = running?.promise.catch(() => undefined);
    const promise = (async () => {
        await before;
        return doRound(config, guildIds);
    })().finally(() => {
        if (running?.promise === promise) running = null;
    });

    running = { key, promise };

    return promise;
}

async function doRound(config: IConfig, guildIds?: readonly string[]): Promise<{ ok: number; failed: number }> {
    if (!databaseReady() || (await backupsReady(config)) !== null) return { ok: 0, failed: 0 };

    const roundAt = new Date();
    const overview = await botOverview(config, "backups");
    // Noch nicht bereit heißt: Die Liste ist leer, nicht, dass der Bot auf keinem Server ist.
    const known = overview?.ready ? overview.guilds.map((guild) => ({ id: guild.id, name: guild.name })) : ((await lastFullRound())?.guilds ?? []);

    let list = known;
    if (guildIds) {
        const names = new Map([...(await backupGuilds()).map((entry) => [entry.guildId, entry.guildName] as const), ...known.map((guild) => [guild.id, guild.name] as const)]);
        list = guildIds.map((id) => ({ id, name: names.get(id) ?? id }));
    }

    let ok = 0;
    let failed = 0;

    // Nacheinander: so wartet die Datenbank des Bots nie auf viele große Abfragen gleichzeitig.
    for (const guild of list) {
        try {
            const meta = await createBackup({ guildId: guild.id, guildName: guild.name, kind: "nacht", note: null, byName: null });
            await recordRun({ roundAt, guildId: guild.id, guildName: guild.name, ok: true, reason: null, backupId: meta.id, full: !guildIds });
            ok++;
        } catch (error) {
            failed++;
            await recordRun({
                roundAt,
                guildId: guild.id,
                guildName: guild.name,
                ok: false,
                reason: error instanceof Error ? error.message : String(error),
                backupId: null,
                full: !guildIds,
            }).catch(() => undefined);
        }
    }

    await pruneBackups(new Date()).catch(() => undefined);
    publish("backups");

    return { ok, failed };
}

let timer: NodeJS.Timeout | null = null;

function planNext(config: IConfig): void {
    timer = setTimeout(() => {
        void runRound(config).catch((error: unknown) => console.error(`⚠️  Backup-Runde fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`));
        planNext(config);
    }, msUntilBerlinMidnight(Date.now()));
    timer.unref();
}

/** Täglich um 0:00 Berliner Zeit, die Uhr wird jeden Tag neu gestellt (Sommerzeit). Beim Start: nachholen, wenn nötig. */
export function scheduleBackups(config: IConfig): void {
    if (timer !== null) return;

    planNext(config);
    schedulePlans(config);
    setTimeout(() => {
        void (async () => {
            if ((await backupsReady(config)) !== null) return;
            if (shouldCatchUp((await lastFullRound())?.at ?? null, Date.now())) await runRound(config);
        })().catch(() => undefined);
    }, CATCH_UP_DELAY).unref();
}

export function stopBackups(): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    stopPlans();
}
