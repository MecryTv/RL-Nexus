import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { IMaintenance, IMaintenanceFlag, IMaintenancePlan, IMaintenanceStart, IMaintenanceState, MaintenanceArea } from "../shared/api.ts";
import { MAINTENANCE_LIMITS } from "../shared/limits.ts";
import type { IConfig } from "./config.ts";
import { InvalidInput, PublicError } from "./errors.ts";
import { text } from "./validate.ts";

/**
 * Der Wartungsmodus: eine Datei in FLAGS_DIR je Bereich. nginx schaut nur,
 * ob sie da ist, und zeigt dann die Wartungsseite. Drin steht, seit wann und
 * von wem, für die Anzeige im Admin Dashboard.
 *
 * Daneben liegt wartung.json, der Plan für die Wartungsseite (Plan 23):
 * Überschrift, geplantes Ende, Fahrplan. Sie ist öffentlich (/wartung/status.json),
 * deshalb steht darin kein Name.
 */

export type { MaintenanceArea };

export const MAINTENANCE_FILES = { website: "wartung-webseite", dashboard: "wartung-dashboard" } as const;
export const PLAN_FILE = "wartung.json";

const AREAS = Object.keys(MAINTENANCE_FILES) as MaintenanceArea[];
const DAY = 86_400_000;

async function readFlag(config: IConfig, area: MaintenanceArea): Promise<IMaintenanceFlag | null> {
    let raw: string;

    try {
        raw = await readFile(path.join(config.flagsDir, MAINTENANCE_FILES[area]), "utf8");
    } catch {
        return null;
    }

    // Die Datei ist da, also ist der Modus an, auch wenn sich ihr Inhalt nicht lesen lässt.
    try {
        const content = JSON.parse(raw) as { since?: unknown; by?: unknown };

        return { since: typeof content.since === "string" ? content.since : null, by: typeof content.by === "string" ? content.by : null };
    } catch {
        return { since: null, by: null };
    }
}

export async function readMaintenance(config: IConfig): Promise<IMaintenance> {
    const [website, dashboard] = await Promise.all([readFlag(config, "website"), readFlag(config, "dashboard")]);

    return { website, dashboard };
}

/** Der Plan oder null. Eine kaputte Datei zählt als keiner. */
export async function readPlan(config: IConfig): Promise<IMaintenancePlan | null> {
    try {
        return JSON.parse(await readFile(path.join(config.flagsDir, PLAN_FILE), "utf8")) as IMaintenancePlan;
    } catch {
        return null;
    }
}

export async function readMaintenanceState(config: IConfig): Promise<IMaintenanceState> {
    const [flags, plan] = await Promise.all([readMaintenance(config), readPlan(config)]);

    return { ...flags, plan };
}

/** Erst in eine Hilfsdatei, dann umbenennen: nginx liefert nie eine halb geschriebene Datei aus. */
async function writePlan(config: IConfig, plan: IMaintenancePlan): Promise<void> {
    const file = path.join(config.flagsDir, PLAN_FILE);

    await mkdir(config.flagsDir, { recursive: true });
    await writeFile(`${file}.tmp`, JSON.stringify(plan));
    await rename(`${file}.tmp`, file);
}

async function removeFile(file: string): Promise<void> {
    try {
        await unlink(file);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
}

/** Ein Zeitpunkt nach jetzt und höchstens sieben Tage voraus, oder null für offen. */
function parseUntil(value: unknown, now: Date): string | null {
    if (value === null) return null;

    const at = typeof value === "string" ? Date.parse(value) : Number.NaN;

    if (Number.isNaN(at)) throw new InvalidInput("Das Ende ist kein Zeitpunkt. Wähl eine Uhrzeit oder „offen“.");
    if (at <= now.getTime()) throw new InvalidInput("Das Ende liegt in der Vergangenheit.");
    if (at > now.getTime() + MAINTENANCE_LIMITS.aheadDays * DAY) throw new InvalidInput(`Das Ende darf höchstens ${MAINTENANCE_LIMITS.aheadDays} Tage voraus liegen.`);

    return new Date(at).toISOString();
}

/** Prüft, was „Wartung einschalten“ schickt. */
export function parseStart(input: unknown, now: Date): IMaintenanceStart {
    const raw = typeof input === "object" && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : {};

    if (!Array.isArray(raw.areas) || raw.areas.length === 0) throw new InvalidInput("Wähl mindestens einen Bereich: Webseite oder Bot-Dashboard.");
    if (!raw.areas.every((area) => (AREAS as unknown[]).includes(area))) throw new InvalidInput("Es gibt nur die Bereiche Webseite und Bot-Dashboard.");

    const steps = raw.steps ?? [];

    if (!Array.isArray(steps)) throw new InvalidInput("Der Fahrplan ist eine Liste von Schritten.");
    if (steps.length > MAINTENANCE_LIMITS.steps) throw new InvalidInput(`Höchstens ${MAINTENANCE_LIMITS.steps} Schritte.`);

    return {
        areas: AREAS.filter((area) => (raw.areas as unknown[]).includes(area)),
        title: text(raw.title, "Die Überschrift", { min: 1, max: MAINTENANCE_LIMITS.title }),
        text: text(raw.text, "Der Zusatz", { max: MAINTENANCE_LIMITS.text }),
        until: parseUntil(raw.until ?? null, now),
        steps: steps.map((step, index) => text(step, `Schritt ${index + 1}`, { min: 1, max: MAINTENANCE_LIMITS.step })),
    };
}

async function writeFlag(config: IConfig, area: MaintenanceArea, by: string, now: Date): Promise<void> {
    await mkdir(config.flagsDir, { recursive: true });
    await writeFile(path.join(config.flagsDir, MAINTENANCE_FILES[area]), JSON.stringify({ since: now.toISOString(), by }));
}

/** Schaltet die Wartung mit Plan ein. Erst der Plan, dann die Schalter: Die Seite hat sofort, was sie zeigen soll. */
export async function startMaintenance(config: IConfig, start: IMaintenanceStart, by: string, now: Date): Promise<void> {
    const state = await readMaintenanceState(config);

    if (state.plan !== null || state.website !== null || state.dashboard !== null) {
        throw new PublicError(409, "Die Wartung läuft schon. Beende sie zuerst oder schalte den Fahrplan weiter.");
    }

    const since = now.toISOString();

    await writePlan(config, {
        areas: start.areas,
        title: start.title,
        text: start.text,
        since,
        until: start.until,
        steps: start.steps.map((name, index) => ({ name, startedAt: index === 0 ? since : null })),
        current: start.steps.length > 0 ? 0 : null,
    });

    for (const area of start.areas) await writeFlag(config, area, by, now);
}

async function runningPlan(config: IConfig): Promise<IMaintenancePlan> {
    const plan = await readPlan(config);

    if (!plan) throw new PublicError(409, "Gerade läuft keine Wartung mit Fahrplan.");

    return plan;
}

/** Weiter: der nächste Schritt beginnt jetzt. Zurück: der vorige läuft wieder, der verlassene hat keine Startzeit mehr. */
export async function stepMaintenance(config: IConfig, direction: "next" | "back", now: Date): Promise<IMaintenancePlan> {
    const plan = await runningPlan(config);
    const current = plan.current;

    if (current === null) throw new PublicError(409, "Diese Wartung hat keinen Fahrplan.");
    if (direction === "next" && current >= plan.steps.length - 1) throw new PublicError(409, "Das ist schon der letzte Schritt. Zum Abschluss die Wartung beenden.");
    if (direction === "back" && current === 0) throw new PublicError(409, "Das ist schon der erste Schritt.");

    const target = direction === "next" ? current + 1 : current - 1;
    const steps = plan.steps.map((step, index) =>
        index === target && direction === "next" ? { ...step, startedAt: now.toISOString() } : index > target ? { ...step, startedAt: null } : step
    );
    const next = { ...plan, steps, current: target };

    await writePlan(config, next);

    return next;
}

/** Neues Ende oder offen. */
export async function setMaintenanceUntil(config: IConfig, until: unknown, now: Date): Promise<IMaintenancePlan> {
    const plan = await runningPlan(config);
    const next = { ...plan, until: parseUntil(until, now) };

    await writePlan(config, next);

    return next;
}

/**
 * Beendet die Wartung eines Bereichs. Erst der Schalter, dann der Plan: Bleibt
 * kein Bereich übrig, verschwindet er, und die Seite lädt sich neu.
 */
export async function endMaintenance(config: IConfig, area: MaintenanceArea): Promise<void> {
    await removeFile(path.join(config.flagsDir, MAINTENANCE_FILES[area]));

    const plan = await readPlan(config);

    if (!plan) return;

    const areas = plan.areas.filter((entry) => entry !== area);

    if (areas.length === 0) await removeFile(path.join(config.flagsDir, PLAN_FILE));
    else await writePlan(config, { ...plan, areas });
}
