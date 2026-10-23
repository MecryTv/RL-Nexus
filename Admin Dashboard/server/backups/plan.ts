import { DEFAULT_PLAN, type IBackupPlan, type IPlanState } from "../../shared/backups.ts";
import { botOverview } from "../bot.ts";
import type { IConfig } from "../config.ts";
import { databaseReady } from "../db.ts";
import { publish } from "../events.ts";
import { berlinDate, daysBefore } from "../status/history.ts";
import { backupsReady, createBackup, enabledPlans, markPlan, trimPlan, type IPlanRow } from "./store.ts";

/**
 * Automatische Backups, die ein Server im Bot-Dashboard selbst eingestellt
 * hat: jeden Tag, alle 3 Tage, jede Woche oder jeden Monat, immer zur vollen
 * Stunde nach Berliner Zeit. Der Admin-Server sieht jede volle Stunde nach,
 * wer dran ist, und beim Start einmal: So wird ein verpasstes Backup
 * nachgeholt, aber nur eins.
 */

const HOUR = 3_600_000;
/** Nach dem Start erst kurz warten: Datenbank und Bot sollen bereit sein. */
const CATCH_UP_DELAY = 60_000;
/** Etwas nach der vollen Stunde, damit der Termin sicher schon erreicht ist. */
const TICK_MARGIN = 2000;

const BERLIN_HOUR = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" });

/** Die volle Stunde eines Berliner Tags („YYYY-MM-DD“) in UTC-Millisekunden. In der Lücke der Sommerzeit die erste gültige Zeit danach. */
export function berlinSlot(date: string, hour: number): number {
    const [year, month, day] = date.split("-").map(Number);
    const wanted = String(hour).padStart(2, "0");

    // Sommerzeit zuerst: Kommt eine Stunde im Herbst zweimal vor, gilt die erste.
    for (const offset of [2, 1]) {
        const candidate = Date.UTC(year, month - 1, day, hour) - offset * HOUR;
        if (berlinDate(candidate) === date && BERLIN_HOUR.format(candidate) === wanted) return candidate;
    }

    return Date.UTC(year, month - 1, day, hour) - HOUR;
}

/** 0 = Montag … 6 = Sonntag. */
function weekdayOf(date: string): number {
    const [year, month, day] = date.split("-").map(Number);

    return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}

function fits(plan: IBackupPlan, date: string): boolean {
    if (plan.every === "woche") return weekdayOf(date) === plan.weekday;
    if (plan.every === "monat") return date.endsWith("-01");

    return true;
}

/** Wann das nächste automatische Backup dran ist. */
export function nextRun(plan: IBackupPlan, lastOk: Date | null, enabledAt: Date): Date {
    // Ein Backup von vor dem Einschalten oder vor einer Änderung des Rhythmus zählt nicht: sonst stünde „Nächstes“ in der Vergangenheit.
    const counted = lastOk && lastOk.getTime() >= enabledAt.getTime() ? lastOk : null;

    // Alle 3 Tage zählt ab dem letzten, das geklappt hat. Ohne eins: der nächste Termin ab dem Einschalten.
    if (plan.every === "3tage" && counted) return new Date(berlinSlot(daysBefore(berlinDate(counted.getTime()), -3), plan.hour));

    const after = (counted ?? enabledAt).getTime();
    let date = berlinDate(after);

    // Höchstens gut ein Monat bis zum nächsten Termin, die Grenze ist nur ein Netz.
    for (let step = 0; step < 40; step++) {
        const slot = berlinSlot(date, plan.hour);
        if (slot > after && fits(plan, date)) return new Date(slot);

        date = daysBefore(date, -1);
    }

    return new Date(after + 24 * HOUR);
}

/** Was das Bot-Dashboard und das Admin Dashboard zur Einstellung zeigen. Ohne Zeile: die Standardwerte, aus. */
export function planState(row: IPlanRow | null): IPlanState {
    if (!row) return { plan: DEFAULT_PLAN, next: null, lastOk: null, lastError: null };

    return {
        plan: row.plan,
        next: row.plan.enabled ? nextRun(row.plan, row.lastOk, row.enabledAt).toISOString() : null,
        lastOk: row.lastOk?.toISOString() ?? null,
        lastError: row.lastError ? { at: row.lastError.at.toISOString(), reason: row.lastError.reason } : null,
    };
}

/** Was im Bot-Dashboard als Grund steht: kurz und ohne SQL. Die Meldung des Treibers hängt die ganze Anweisung an. */
export function shortReason(error: unknown): string {
    const code = (error as { code?: unknown } | null)?.code;
    if (typeof code === "string" && code.startsWith("ER_")) return `Fehler in der Datenbank (${code})`;

    return (error instanceof Error ? error.message : String(error)).split("\n")[0].slice(0, 200);
}

let running = false;

/** Jede fällige Einstellung einmal, nacheinander. Läuft schon ein Durchgang, passiert nichts. */
export async function runPlans(config: IConfig, now: number): Promise<{ ok: number; failed: number }> {
    if (running || !databaseReady() || (await backupsReady(config)) !== null) return { ok: 0, failed: 0 };

    running = true;
    let ok = 0;
    let failed = 0;

    try {
        const due = (await enabledPlans()).filter((row) => nextRun(row.plan, row.lastOk, row.enabledAt).getTime() <= now);
        if (due.length === 0) return { ok, failed };

        // Nur wenn der Bot bereit ist und den Server nicht nennt, ist er weg. Antwortet er nicht, wird trotzdem gesichert.
        const overview = await botOverview(config, "backups");
        const known = overview?.ready ? new Set(overview.guilds.map((guild) => guild.id)) : null;

        for (const row of due) {
            if (known && !known.has(row.guildId)) continue;

            try {
                await createBackup({ guildId: row.guildId, guildName: row.guildName, kind: "plan", note: null, byName: null, origin: "server" });
                await markPlan(row.guildId, { ok: true, at: new Date(now) });
                await trimPlan(row.guildId, row.plan.keep);
                ok++;
            } catch (error) {
                failed++;
                console.error(`⚠️  Automatisches Backup für ${row.guildId} fehlgeschlagen:`, error);
                await markPlan(row.guildId, { ok: false, at: new Date(now), reason: shortReason(error) }).catch(() => undefined);
            }
        }

        publish("backups");

        return { ok, failed };
    } finally {
        running = false;
    }
}

let timer: NodeJS.Timeout | null = null;

function planNext(config: IConfig): void {
    const now = Date.now();

    timer = setTimeout(
        () => {
            void runPlans(config, Date.now()).catch((error: unknown) => console.error(`⚠️  Automatische Backups fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`));
            planNext(config);
        },
        HOUR - (now % HOUR) + TICK_MARGIN
    );
    timer.unref();
}

/** Jede volle Stunde, und einmal kurz nach dem Start: Was in der Zwischenzeit fällig war, kommt dann. */
export function schedulePlans(config: IConfig): void {
    if (timer !== null) return;

    planNext(config);
    setTimeout(() => void runPlans(config, Date.now()).catch(() => undefined), CATCH_UP_DELAY).unref();
}

export function stopPlans(): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
}
