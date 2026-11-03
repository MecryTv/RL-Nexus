import type { IConfig } from "../config.ts";
import { databaseReady } from "../db.ts";
import { choiceRound, reconcile } from "./flow.ts";

/**
 * Die Uhr von „ein Server pro Person“ (W-0064): alle 30 Sekunden die Wahl
 * (Erinnerung, Bedenkzeit, Frist), alle 10 Minuten der Abgleich mit der
 * Serverliste des Bots. Der erste Abgleich läuft kurz nach dem Start, damit
 * der Bot dann sicher erreichbar ist.
 */

const EVERY = 30_000;
const RECONCILE_EVERY = 10 * 60_000;
const FIRST_RECONCILE = 20_000;

let timer: NodeJS.Timeout | null = null;
let running = false;
let lastReconcile = Date.now() - RECONCILE_EVERY + FIRST_RECONCILE;

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export async function serverRound(config: IConfig, now = Date.now()): Promise<void> {
    if (running || !databaseReady()) return;

    running = true;

    try {
        await choiceRound(config, now);

        if (now - lastReconcile >= RECONCILE_EVERY) {
            lastReconcile = now;
            await reconcile(config);
        }
    } catch (error) {
        console.error(`🧭 Runde „ein Server pro Person“ fehlgeschlagen: ${message(error)}`);
    } finally {
        running = false;
    }
}

export function scheduleServers(config: IConfig): void {
    if (timer !== null) return;

    timer = setInterval(() => void serverRound(config), EVERY);
    timer.unref();
}
