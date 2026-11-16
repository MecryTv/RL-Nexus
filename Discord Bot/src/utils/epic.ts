import BotClient from "../client/BotClient";
import { IPrimeProfile } from "../interfaces/services/prime/IPrimeService";
import { IEpicAccount } from "./epicLogin";

/**
 * Alles, was nach einem bestätigten Epic-Konto passieren muss.
 *
 * Der Weg hierher ist der Epic-Login aus /rank link (W-0125, routes/EpicCallback.ts):
 * Konto-ID und Name kommen von Epic selbst. Ränge holt danach Prime, über die ID -
 * fällt Prime aus, ist das Konto trotzdem verbunden, nur noch ohne Ränge.
 *
 * Ist dasselbe Konto schon verbunden, ändert sich nur der Name. changed_at bleibt
 * dann stehen, sonst setzte erneutes Bestätigen die Sperrfrist neu. Dasselbe mit
 * keepChangedAt bei einem Wechsel im Korrektur-Fenster (LINK_FIX).
 *
 * Verknüpft wird ausschliesslich Epic. Die Plattformen, die Prime am Konto
 * haengen sieht, werden bewusst nicht mitgeschrieben: fuer PlayStation und
 * Nintendo gibt es keinen oeffentlichen Login, und die Raenge sind auf allen
 * Plattformen ohnehin dieselben - siehe Migration 007.
 */
export async function EpicAdopt(client: BotClient, userId: string, epic: IEpicAccount, keepChangedAt?: Date, verified = true): Promise<{ name: string; profile: IPrimeProfile | null }> {
    const profile = client.primeService.IsConfigured ? await client.primeService.Profile(epic.accountId).catch(() => null) : null;
    const name = epic.displayName ?? profile?.name ?? epic.accountId;
    const current = await client.accounts.On(userId, "epic");

    if (current?.account_id === epic.accountId) {
        if (current.display_name !== name) await client.accounts.Rename(userId, "epic", name);
        // W-0131: erst per Name, jetzt per Login - die Verknüpfung ist ab jetzt bestätigt. Andersherum bleibt sie es.
        if (verified && Number(current.verified) === 0) await client.accounts.SetVerified(userId, "epic");
    } else {
        await client.accounts.Link(userId, "epic", epic.accountId, name, verified, keepChangedAt);
    }

    // Review W-0125: Ein anderes Konto als vorher - Ränge und Rang-Rollen des alten gehen.
    // Die Rollen im Hintergrund: die Seite soll nicht auf jeden Server warten.
    if (current && current.account_id !== epic.accountId) {
        await client.ranks.Clear(userId);
        void client.rankRoleService.Strip(userId).catch(() => 0);
    }

    if (profile) {
        await client.ranks.Snapshot(userId, profile.ranks);
        await client.ranks.SaveProfile(userId, profile.seasonLevel, profile.seasonWins, profile.stats, profile.club);
    }

    return { name, profile };
}
