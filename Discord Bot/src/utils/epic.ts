import BotClient from "../client/BotClient";
import { IPrimeProfile } from "../interfaces/services/prime/IPrimeService";

/**
 * Alles, was nach einem erfolgreich aufgeloesten Epic-Konto passieren muss.
 *
 * Der Weg hierher ist /rank link: der Epic-Name, den Prime aufloest.
 *
 * Verknuepft wird ausschliesslich Epic. Die Plattformen, die Prime am Konto
 * haengen sieht, werden bewusst nicht mitgeschrieben: fuer PlayStation und
 * Nintendo gibt es keinen oeffentlichen Login, und die Raenge sind auf allen
 * Plattformen ohnehin dieselben - siehe Migration 007.
 */
export async function EpicAdopt(client: BotClient, userId: string, profile: IPrimeProfile): Promise<void> {
    await client.accounts.Link(userId, "epic", profile.accountId, profile.name, true);

    await client.ranks.Snapshot(userId, profile.ranks);
    await client.ranks.SaveProfile(userId, profile.seasonLevel, profile.seasonWins, profile.stats, profile.club);
}
