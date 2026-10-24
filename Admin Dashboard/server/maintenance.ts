import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import type { IMaintenance } from "../shared/api.ts";
import { MAINTENANCE_AREAS, REASON_MAX, isRunning, type IMaintenanceState, type MaintenanceArea } from "../shared/maintenance.ts";
import { audit, type IActor } from "./audit.ts";
import type { IConfig } from "./config.ts";
import { databaseReady, query } from "./db.ts";
import { InvalidInput } from "./errors.ts";
import { publish } from "./events.ts";
import { body } from "./validate.ts";

/**
 * Der Wartungsmodus (Plan 23): eine Zeile je Bereich in site_maintenance.
 * Webseite und Bot lesen sie selbst, die Regel „läuft“ steht in
 * shared/maintenance.ts.
 *
 * Die Dateien in FLAGS_DIR sind der Weg von vorher: nginx prüfte nur, ob sie da
 * sind. Eine Wartung, die vor dem Update lief, übernimmt das Admin Dashboard
 * beim Start und lässt ihre Datei liegen, bis sie endet: So übersteht sie das
 * Ausrollen, solange Bot und Webseite noch den alten Stand haben. Neue Dateien
 * legt es nicht mehr an.
 */

export const MAINTENANCE_FILES = { website: "wartung-webseite", dashboard: "wartung-dashboard" } as const;

/** Die Antwort an Formular und Shop, solange die Webseite in der Wartung ist. */
export const MAINTENANCE_CLOSED = "Gerade ist Wartung. Versuch es in ein paar Minuten noch einmal.";

export interface IMaintenanceInput {
    readonly on: boolean;
    readonly reason: string | null;
    /** ISO-Zeitpunkt, null: ohne Endzeit. */
    readonly endsAt: string | null;
    readonly autoEnd: boolean;
}

interface IRow {
    readonly area: MaintenanceArea;
    readonly active: number;
    readonly reason: string | null;
    readonly started_at: Date | null;
    readonly started_by: string | null;
    readonly ends_at: Date | null;
    readonly auto_end: number;
}

function stateOf(row: IRow | undefined, now: Date): IMaintenanceState | null {
    if (!row) return null;

    const endsAt = row.ends_at?.toISOString() ?? null;
    const autoEnd = row.auto_end === 1;

    if (!isRunning({ active: row.active === 1, endsAt, autoEnd }, now)) return null;

    return { reason: row.reason, startedAt: (row.started_at ?? now).toISOString(), startedBy: row.started_by, endsAt, autoEnd };
}

const NONE: IMaintenance = { website: null, dashboard: null };

/** Was gerade läuft. Abgelaufene Wartungen mit Haken sind schon aus, auch wenn noch niemand aufgeräumt hat. Ohne Datenbank: nichts. */
export async function readMaintenance(_config: IConfig, now = new Date()): Promise<IMaintenance> {
    if (!databaseReady()) return NONE;

    const rows = await query<IRow[]>("SELECT area, active, reason, started_at, started_by, ends_at, auto_end FROM site_maintenance");

    return {
        website: stateOf(
            rows.find((row) => row.area === "website"),
            now
        ),
        dashboard: stateOf(
            rows.find((row) => row.area === "dashboard"),
            now
        ),
    };
}

/** Schaltet einen Bereich. Läuft er schon, bleiben Beginn und wer ihn eingeschaltet hat. Ohne Endzeit gibt es kein automatisches Ende. */
export async function setMaintenance(config: IConfig, area: MaintenanceArea, input: IMaintenanceInput, by: string, now = new Date()): Promise<void> {
    if (!input.on) {
        await query("UPDATE site_maintenance SET active = 0 WHERE area = ?", [area]);

        return;
    }

    const running = (await readMaintenance(config, now))[area];
    const endsAt = input.endsAt === null ? null : new Date(input.endsAt);

    await query(
        `INSERT INTO site_maintenance (area, active, reason, started_at, started_by, ends_at, auto_end) VALUES (?, 1, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE active = 1, reason = VALUES(reason), started_at = VALUES(started_at), started_by = VALUES(started_by), ends_at = VALUES(ends_at), auto_end = VALUES(auto_end)`,
        [area, input.reason, running ? new Date(running.startedAt) : now, running ? running.startedBy : by, endsAt, endsAt !== null && input.autoEnd ? 1 : 0]
    );
}

/** Schaltet aus, was mit Haken über die Endzeit ist. Gibt die Bereiche zurück, fürs Protokoll. */
export async function endExpired(_config: IConfig, now: Date): Promise<MaintenanceArea[]> {
    const rows = await query<{ area: MaintenanceArea }[]>("SELECT area FROM site_maintenance WHERE active = 1 AND auto_end = 1 AND ends_at IS NOT NULL AND ends_at <= ?", [now]);
    const areas = rows.map((row) => row.area);

    if (areas.length > 0) await query("UPDATE site_maintenance SET active = 0 WHERE area IN (?)", [areas]);

    return areas;
}

/**
 * Übernimmt den Stand aus den alten Dateien, beim Start nach den Migrationen.
 * Nur in Zeilen, die noch nie über die Datenbank geschaltet wurden: Sonst
 * schaltete eine liegen gebliebene Datei eine Wartung wieder ein, die
 * inzwischen beendet ist oder zur Endzeit abgelaufen ist.
 */
export async function importFlagFiles(config: IConfig): Promise<void> {
    const now = new Date();
    const rows = await query<{ area: MaintenanceArea; started_at: Date | null }[]>("SELECT area, started_at FROM site_maintenance");

    for (const area of MAINTENANCE_AREAS) {
        if (rows.find((row) => row.area === area)?.started_at != null) continue;

        let raw: string;

        try {
            raw = await readFile(path.join(config.flagsDir, MAINTENANCE_FILES[area]), "utf8");
        } catch {
            continue;
        }

        // Die Datei ist da, also war die Wartung an, auch wenn sich ihr Inhalt nicht lesen lässt.
        let content: { since?: unknown; by?: unknown } = {};

        try {
            content = JSON.parse(raw) as { since?: unknown; by?: unknown };
        } catch {
            // Bleibt leer: seit jetzt, von unbekannt.
        }

        const since = typeof content.since === "string" && !Number.isNaN(Date.parse(content.since)) ? new Date(content.since) : now;

        await query("UPDATE site_maintenance SET active = 1, reason = NULL, started_at = ?, started_by = ?, ends_at = NULL, auto_end = 0 WHERE area = ?", [
            since,
            typeof content.by === "string" ? content.by : null,
            area,
        ]);
    }
}

/**
 * Löscht die alten Dateien der Bereiche, deren Wartung nicht mehr läuft. Neu
 * angelegt wird keine: Sonst griffen die alten nginx-Regeln bei jeder neuen
 * Wartung und sperrten Rechtstexte, Vorschau und das Team mit aus. Übrig
 * bleibt nur die Datei einer Wartung, die schon vor dem Update lief.
 */
export async function clearFlagFiles(config: IConfig, state: IMaintenance): Promise<void> {
    for (const area of MAINTENANCE_AREAS) {
        if (state[area]) continue;

        try {
            await unlink(path.join(config.flagsDir, MAINTENANCE_FILES[area]));
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
    }
}

/* ------------------------------------------------------------------
   Eingabe, Zwischenspeicher, Takt
   ------------------------------------------------------------------ */

/** Was das Admin Dashboard schickt, geprüft. Jede Ablehnung ist ein ganzer Satz. */
export function parseMaintenanceInput(raw: unknown, now: Date): { area: MaintenanceArea; input: IMaintenanceInput } {
    const input = body(raw);
    const area = input.area;

    if (typeof area !== "string" || !(MAINTENANCE_AREAS as readonly string[]).includes(area)) throw new InvalidInput("Sag, welcher Bereich in die Wartung soll: website oder dashboard.");
    if (typeof input.on !== "boolean") throw new InvalidInput("Sag, ob die Wartung an oder aus sein soll.");

    const reason = typeof input.reason === "string" && input.reason.trim() !== "" ? input.reason.trim() : null;
    if (reason !== null && reason.length > REASON_MAX) throw new InvalidInput(`Der Grund darf höchstens ${REASON_MAX} Zeichen haben.`);

    let endsAt: string | null = null;

    if (input.endsAt !== undefined && input.endsAt !== null) {
        const at = typeof input.endsAt === "string" ? Date.parse(input.endsAt) : Number.NaN;

        if (Number.isNaN(at)) throw new InvalidInput("Die Endzeit ist kein gültiger Zeitpunkt.");
        if (input.on && at <= now.getTime()) throw new InvalidInput("Die Endzeit liegt in der Vergangenheit.");

        endsAt = new Date(at).toISOString();
    }

    return { area: area as MaintenanceArea, input: { on: input.on, reason, endsAt, autoEnd: endsAt !== null && input.autoEnd === true } };
}

/**
 * Der Stand für Webseite, Kontaktformular und Shop, höchstens 5 Sekunden alt.
 * Die Webseite fragt jede Minute nach, das Formular bei jedem Absenden.
 * Kann die Datenbank nicht antworten, gilt: keine Wartung. Lieber offen als grundlos zu.
 */
let cached: { readonly at: number; readonly state: IMaintenance } | null = null;

export async function currentMaintenance(config: IConfig): Promise<IMaintenance> {
    if (cached && Date.now() - cached.at < 5_000) return cached.state;

    const state = await readMaintenance(config).catch((): IMaintenance => NONE);

    cached = { at: Date.now(), state };

    return state;
}

/** Nach dem Schalten: gleich neu lesen, nicht erst nach 5 Sekunden. */
export function forgetMaintenance(): void {
    cached = null;
}

export async function websiteClosed(config: IConfig): Promise<boolean> {
    return (await currentMaintenance(config)).website !== null;
}

/** Nach dem Schalten und im Takt: neu lesen und alte Dateien aufräumen. Mit `changed` erfahren es auch die offenen Oberflächen. */
export async function afterChange(config: IConfig, changed = true): Promise<IMaintenance> {
    forgetMaintenance();

    const state = await readMaintenance(config);

    await clearFlagFiles(config, state).catch((error: unknown) => console.warn(`🛠️  Wartung: alte Schalter-Dateien nicht gelöscht: ${String(error)}`));
    if (changed) publish("maintenance");

    return state;
}

const SYSTEM: IActor = { id: "0", name: "System" };
const AREA_NAMES: Readonly<Record<MaintenanceArea, string>> = { website: "Webseite", dashboard: "Bot-Dashboard" };
const EVERY = 30_000;
let timer: ReturnType<typeof setInterval> | null = null;

async function tick(config: IConfig): Promise<void> {
    if (!databaseReady()) return;

    try {
        const ended = await endExpired(config, new Date());

        for (const area of ended) await audit(SYSTEM, "maintenance.set", AREA_NAMES[area], "automatisch beendet");

        // Aufgeräumt wird auch ohne Änderung: Eine Wartung mit Haken ist zur Endzeit aus, bevor hier jemand aufräumt.
        await afterChange(config, ended.length > 0);
    } catch (error) {
        console.warn(`🛠️  Wartung: Takt fehlgeschlagen: ${String(error)}`);
    }
}

/** Beim Start: alte Dateien übernehmen, dann alle 30 Sekunden abgelaufene Wartungen beenden und alte Dateien aufräumen. */
export function scheduleMaintenance(config: IConfig): void {
    if (timer !== null || !databaseReady()) return;

    void importFlagFiles(config)
        .catch((error: unknown) => console.warn(`🛠️  Wartung: alte Schalter-Dateien nicht übernommen: ${String(error)}`))
        .then(() => tick(config));

    timer = setInterval(() => void tick(config), EVERY);
    timer.unref();
}

/** Für die Checks. */
export function stopMaintenance(): void {
    if (timer !== null) clearInterval(timer);
    timer = null;
}
