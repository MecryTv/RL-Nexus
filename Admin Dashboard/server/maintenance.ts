import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { IMaintenance, IMaintenanceFlag } from "../shared/api.ts";
import type { IConfig } from "./config.ts";

/**
 * Der Wartungsmodus: eine Datei in FLAGS_DIR je Bereich. nginx schaut nur,
 * ob sie da ist, und zeigt dann die Wartungsseite. Drin steht, seit wann und
 * von wem, für die Anzeige im Admin Dashboard.
 */

export const MAINTENANCE_FILES = { website: "wartung-webseite", dashboard: "wartung-dashboard" } as const;
export type MaintenanceArea = keyof typeof MAINTENANCE_FILES;

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

/** Schaltet einen Bereich. Ist er schon an, bleibt „seit wann“ stehen. */
export async function setMaintenance(config: IConfig, area: MaintenanceArea, on: boolean, by: string): Promise<void> {
    const file = path.join(config.flagsDir, MAINTENANCE_FILES[area]);

    if (!on) {
        try {
            await unlink(file);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }

        return;
    }

    if ((await readFlag(config, area)) !== null) return;

    await mkdir(config.flagsDir, { recursive: true });
    await writeFile(file, JSON.stringify({ since: new Date().toISOString(), by }));
}
