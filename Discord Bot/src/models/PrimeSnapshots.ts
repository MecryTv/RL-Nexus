import Model from "../structures/Model";
import { TABLES, TableName, Unpack } from "../constants/Database";
import { IPrimeProfile } from "../interfaces/services/prime/IPrimeService";

export interface IPrimeSnapshotRow {
    user_id: string;
    account_id: string;
    display_name: string;
    profile: string | IPrimeProfile;
    fetched_at: Date;
}

/**
 * W-0150: Der letzte vollständige Stand aus Prime, je Discord-Nutzer mit
 * verknüpftem Epic-Konto.
 *
 * Gelesen wird nur von /rank, und nur wenn Prime ausfällt und der
 * Arbeitsspeicher nichts mehr hat - etwa nach einem Neustart. Geschrieben wird
 * bei jeder frischen Antwort für ein hier verknüpftes Konto, egal wer gefragt hat.
 */
export default class PrimeSnapshots extends Model<IPrimeSnapshotRow> {
    readonly Table: TableName = TABLES.primeSnapshots;
    readonly Key = ["user_id"] as const;

    async Save(userId: string, profile: IPrimeProfile): Promise<void> {
        await this.Upsert(
            {
                user_id: userId,
                account_id: profile.accountId,
                display_name: profile.name,
                // Review (Datenschutz): die verknüpften Steam-, PSN-, Xbox- und Switch-Konten deckt die
                // Erklärung nicht ab, und die Karte braucht sie nicht - sie bleiben draußen.
                profile: JSON.stringify({ ...profile, linked: [], stale: undefined, fromStore: undefined }),
                fetched_at: new Date(profile.fetchedAt),
            },
            ["account_id", "display_name", "profile", "fetched_at"]
        );
    }

    /**
     * Über die Konto-ID (/rank me, der Knopf unter der Karte) oder den
     * Anzeigenamen (/rank search). Groß- und Kleinschreibung egal, Akzente nicht
     * (W-0152: die Spalte ist utf8mb4_bin, LOWER auf beiden Seiten).
     *
     * Ohne Cache: gelesen wird nur bei einem Ausfall, und das Admin Dashboard
     * löscht Nutzerdaten an diesem Bot vorbei.
     */
    async Lookup(wanted: string): Promise<IPrimeProfile | null> {
        const row = await this.db.One<IPrimeSnapshotRow>(
            `SELECT profile, fetched_at FROM \`${this.Table}\` WHERE account_id = ? OR LOWER(display_name) = LOWER(?) ORDER BY fetched_at DESC LIMIT 1`,
            [wanted, wanted]
        );

        if (!row) return null;

        const profile = Unpack<IPrimeProfile | null>(row.profile, null);

        return profile ? { ...profile, fetchedAt: new Date(row.fetched_at).toISOString() } : null;
    }

    /** Löscht den Stand. Trennen und Kontowechsel laufen über PlayerRanks.Clear, das ihn mitnimmt (W-0152). */
    async Clear(userId: string): Promise<void> {
        await this.Delete(userId);
    }
}
