import type { IConfig } from "../config.ts";
import { databaseReady } from "../db.ts";
import { readMaintenance } from "../maintenance.ts";
import { classify, parseAccessLine, type IHit } from "./parse.ts";
import { readOnce } from "./reader.ts";
import { addHits, pruneActivity, readerState, saveReaderState } from "./store.ts";

/**
 * W-0138: Die Uhr der Aktivität (Muster servers/clock.ts). Jede Minute liest
 * sie das eigene Protokoll weiter, einmal am Tag löscht sie, was älter als
 * 13 Monate ist. Während einer Wartung zählen Anfragen des Bereichs nicht für
 * die Fehler-Ampel - sonst sagte sie nichts über echte Fehler.
 */

const EVERY = 60_000;
const DAY = 86_400_000;
const LIVE = "live";

let timer: NodeJS.Timeout | null = null;
let running = false;
let lastPrune = 0;

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function hitsOf(lines: readonly string[]): IHit[] {
    return lines.flatMap((line) => {
        const parsed = parseAccessLine(line);
        const hit = parsed ? classify(parsed) : null;

        return hit ? [hit] : [];
    });
}

export async function activityRound(config: IConfig, now = new Date()): Promise<void> {
    if (running || !databaseReady()) return;

    running = true;

    try {
        const maintenance = await readMaintenance(config);
        const excluded = (hit: IHit): boolean => (hit.service === "website" && maintenance.website !== null) || (hit.service === "dashboard" && maintenance.dashboard !== null);
        const before = await readerState(LIVE);
        const after = await readOnce(config.accessLogDir, before, (lines) => addHits(hitsOf(lines), excluded));

        if (after !== before) await saveReaderState(LIVE, after);

        if (now.getTime() - lastPrune >= DAY) {
            lastPrune = now.getTime();
            await pruneActivity(now);
        }
    } catch (error) {
        console.error(`📈 Aktivität nicht gelesen: ${message(error)}`);
    } finally {
        running = false;
    }
}

export function scheduleActivity(config: IConfig): void {
    if (timer !== null) return;

    timer = setInterval(() => void activityRound(config), EVERY);
    timer.unref();
    void activityRound(config);
}
