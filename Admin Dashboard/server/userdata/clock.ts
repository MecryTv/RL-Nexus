import type { IConfig } from "../config.ts";
import { databaseReady } from "../db.ts";
import { publish } from "../events.ts";
import { deletionOf, dueDeletions, forgetOldDeletions } from "./deletions.ts";
import { executeDeletion, retryForget } from "./erase.ts";
import { deletionReceipt } from "./receipt.ts";
import { finishedInput, followUp, personBase } from "./flow.ts";

/**
 * Die Uhr der Löschungen (W-0051, Spec-Entscheidung 37): alle 30 Sekunden
 * fällige ausführen. Der Stand liegt in der Datenbank, ein Neustart verliert
 * nichts; eine Runde läuft nie doppelt im selben Prozess, zwischen Prozessen
 * schützt `claimDeletion`.
 */

const EVERY = 30_000;

let timer: NodeJS.Timeout | null = null;
let running = false;

/** Eine Runde. Gibt zurück, wie viele Löschungen sie ausgeführt hat. */
export async function deletionRound(config: IConfig, now = Date.now()): Promise<number> {
    if (running || !databaseReady()) return 0;

    running = true;

    try {
        let done = 0;

        for (const record of await dueDeletions(now)) {
            // Name und Bild vorher holen: Danach ist der Name in der Löschung leer.
            const base = await personBase(config, record.userId, record.userName);
            const result = await executeDeletion(config, record.id);
            if (!result) continue;

            done++;
            // Der Beleg kommt als PDF mit der DM „Erledigt“ (Runde 3).
            const finished = (await deletionOf(record.id)) ?? record;
            const receipt = { name: `rl-nexus-loeschung-${record.id}.pdf`, data: await deletionReceipt(finished, config.jwtSecret), type: "application/pdf" };

            await followUp(config, finished, "erledigt", finishedInput(base, record, result), receipt);
            publish("userdata");
        }

        await retryForget(config);
        await forgetOldDeletions(now);

        return done;
    } catch (error) {
        console.error(`🗑️  Löschrunde fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);

        return 0;
    } finally {
        running = false;
    }
}

export function scheduleDeletions(config: IConfig): void {
    if (timer !== null) return;

    timer = setInterval(() => void deletionRound(config), EVERY);
    timer.unref();
}

export function stopDeletions(): void {
    if (timer !== null) clearInterval(timer);
    timer = null;
}
