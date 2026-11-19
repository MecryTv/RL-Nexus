import BotClient from "../client/BotClient";
import Runnable from "../structures/Runnable";
import TaskTypes from "../enums/TaskTypes";

/**
 * W-0145: Alle zehn Minuten nach dem Prime-Zugang sehen - gelbe Warnung vor dem
 * Ablauf (nur mit PRIME_ACCESS_EXPIRES) und, wenn in der letzten Stunde keine
 * Abfrage lief, eine Probe. Sonst fiele ein abgelaufener Zugang erst auf, wenn
 * jemand /rank benutzt. Siehe services/PrimeAccessService.ts.
 */
export default class PrimeAccess extends Runnable {
    constructor(client: BotClient) {
        super(client, {
            name: "PrimeAccess",
            description: "Prüft den Prime-Zugang und meldet den Developern einen nahen oder schon erfolgten Ablauf",
            type: TaskTypes.INTERVAL,
            expression: "10m",
        });
    }

    async Execute(): Promise<void> {
        await this.client.primeService.access.Tick();
    }
}
