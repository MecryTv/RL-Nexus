import type { IDeletionResult } from "../../shared/userdata.ts";
import { audit } from "../audit.ts";
import type { IConfig } from "../config.ts";
import { databaseReady } from "../db.ts";
import { publish } from "../events.ts";
import { deletionOf, dueDeletions, forgetOldDeletions } from "./deletions.ts";
import { backupsReason } from "../backups/store.ts";
import { purgeQuarantine } from "./backups.ts";
import { executeDeletion, retryBackups, retryForget } from "./erase.ts";
import { deletionReceipt } from "./receipt.ts";
import { finishedInput, followUp, personBase } from "./flow.ts";

/**
 * Die Uhr der Löschungen (W-0051, Spec-Entscheidung 37): alle 30 Sekunden
 * fällige ausführen. Der Stand liegt in der Datenbank, ein Neustart verliert
 * nichts; eine Runde läuft nie doppelt im selben Prozess, zwischen Prozessen
 * schützt `claimDeletion`.
 */

const EVERY = 30_000;
/** Im Protokoll: wie beim Ausführen selbst. */
const CLOCK = { id: "0", name: "Löschung zur Frist" };

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

let timer: NodeJS.Timeout | null = null;
let running = false;

/** Eine Runde. Gibt zurück, wie viele Löschungen sie ausgeführt hat. */
export async function deletionRound(config: IConfig, now = Date.now()): Promise<number> {
    if (running || !databaseReady()) return 0;

    running = true;

    try {
        let done = 0;

        for (const record of await dueDeletions(now)) {
            // Jede für sich: Scheitert eine, steht das im Protokoll und die nächste läuft trotzdem.
            let result: IDeletionResult | null = null;
            // Name und Bild vorher holen: Danach ist der Name in der Löschung leer.
            const base = await personBase(config, record.userId, record.userName);

            try {
                result = await executeDeletion(config, record.id);
            } catch (error) {
                await audit(CLOCK, "userdata.delete", record.userId, `fehlgeschlagen: ${message(error)}`.slice(0, 250)).catch(() => undefined);
                continue;
            }

            if (!result) continue;

            done++;
            publish("userdata");

            // Gelöscht ist gelöscht. Klappt danach der Beleg oder die DM nicht, steht das im Protokoll.
            try {
                const finished = (await deletionOf(record.id)) ?? record;
                const receipt = { name: `rl-nexus-loeschung-${record.id}.pdf`, data: await deletionReceipt(finished, config.jwtSecret), type: "application/pdf" };

                await followUp(config, finished, "erledigt", finishedInput(base, record, result), receipt);
            } catch (error) {
                await audit(CLOCK, "userdata.dm", record.userId, `„Erledigt“ mit Beleg nicht verschickt: ${message(error)}`.slice(0, 250)).catch(() => undefined);
            }
        }

        await retryForget(config);
        await retryBackups(config);
        if (backupsReason() === null) await purgeQuarantine(now);
        await forgetOldDeletions(now);

        return done;
    } catch (error) {
        console.error(`🗑️  Löschrunde fehlgeschlagen: ${message(error)}`);

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
