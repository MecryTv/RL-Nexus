import Model from "../structures/Model";
import { OrNull, Platform, TABLES, TableName } from "../constants/Database";
import { CurrentLinkMode } from "../utils/moduleFlags";

export interface IPlayerAccountRow {
    user_id: string;
    platform: Platform;
    account_id: string;
    display_name: string | null;
    verified: number;
    linked_at: Date;
    changed_at: Date;
}

/** Was einer Änderung im Weg steht - oder eben nicht. */
export interface ICooldown {
    /** true, wenn jetzt geändert werden darf. */
    open: boolean;
    /** Millisekunden bis zur nächsten erlaubten Änderung. 0, wenn offen. */
    waitMs: number;
    /** Wann es wieder geht - ISO-8601, null wenn es jetzt geht. */
    until: string | null;
    /** W-0125: Bis wann (ms) ein Wechsel als Korrektur gilt, sonst null. */
    fixUntil: number | null;
}

/**
 * W-0131: Darf diese Verknüpfung hier zählen? card: Karte, /rank me, Name im
 * Kader. trusted: Rang-Rollen, Giveaway-Bedingung, Anzeige als Besitzer. Per
 * Login verbunden (verified 1) zählt immer, per Name je nach Art im Admin.
 */
export function LinkUsable(row: Pick<IPlayerAccountRow, "verified">, need: "card" | "trusted"): boolean {
    if (Number(row.verified) === 1) return true;

    const mode = CurrentLinkMode();

    return need === "card" ? mode !== "login" : mode === "name";
}

/**
 * Verknüpfte Spielerkonten: Discord-Nutzer zu Epic, Steam, Xbox, PSN oder Switch.
 *
 * "verified" ist 1, sobald die Rocket-League-API den Namen bestätigt hat - beim
 * Epic-Konto passiert genau das beim Verknüpfen.
 */
export default class PlayerAccount extends Model<IPlayerAccountRow> {
    readonly Table: TableName = TABLES.accounts;
    readonly Key = ["user_id", "platform"] as const;

    async Of(userId: string): Promise<IPlayerAccountRow[]> {
        return this.Where({ user_id: userId }, "`platform` ASC");
    }

    async On(userId: string, platform: Platform): Promise<IPlayerAccountRow | null> {
        return this.Find(userId, platform);
    }

    /**
     * Verknüpft ein Konto oder wechselt es. "changed_at" wird ausdrücklich
     * mitgeschrieben - daran hängt die Sperrfrist. Eine Korrektur im Fenster
     * gibt den alten Zeitpunkt mit, damit die Frist nicht neu beginnt.
     */
    async Link(
        userId: string,
        platform: Platform,
        accountId: string,
        displayName?: string,
        verified = false,
        changedAt = new Date()
    ): Promise<void> {
        const values = { account_id: accountId, display_name: OrNull(displayName), verified: verified ? 1 : 0, changed_at: changedAt };

        // Review W-0125: kein Upsert. Seit Migration 057 gibt es zwei eindeutige
        // Schlüssel; kollidiert beim ersten Verbinden nur uq_account, hätte
        // ON DUPLICATE KEY still die Zeile des anderen Nutzers überschrieben.
        // So wirft beides ER_DUP_ENTRY, und der Aufrufer kann absagen.
        if (await this.On(userId, platform)) await this.Update([userId, platform], values);
        else await this.Insert({ user_id: userId, platform, ...values });
    }

    /**
     * Plan 33: nur der Anzeigename, wenn sich derselbe Account umbenannt hat.
     * changed_at bleibt - daran hängt die Sperrfrist, und das Konto ist ja dasselbe.
     */
    async Rename(userId: string, platform: Platform, displayName: string): Promise<void> {
        await this.Update([userId, platform], { display_name: displayName });
    }

    async Unlink(userId: string, platform: Platform): Promise<boolean> {
        const result = await this.Delete(userId, platform);

        return result.affectedRows > 0;
    }

    /**
     * Wie lange eine Änderung noch gesperrt ist.
     *
     * Gerechnet wird gegen changed_at. Gibt es noch keine Verknüpfung, ist der
     * Weg frei - die Sperre gilt dem Wechseln, nicht dem ersten Verbinden.
     * Mit fixMs ist der Weg in dieser Zeit nach changed_at ebenfalls frei
     * (W-0125: falsches Epic-Konto erwischt), fixUntil sagt dann bis wann.
     */
    async Cooldown(userId: string, platform: Platform, windowMs: number, fixMs = 0, now = Date.now()): Promise<ICooldown> {
        const open: ICooldown = { open: true, waitMs: 0, until: null, fixUntil: null };
        const row = await this.On(userId, platform);

        if (!row) return open;

        const changed = new Date(row.changed_at).getTime();

        // Ein unlesbarer Zeitstempel darf niemanden aussperren.
        if (Number.isNaN(changed)) return open;

        if (now < changed + fixMs) return { ...open, fixUntil: changed + fixMs };

        const until = changed + windowMs;
        const waitMs = until - now;

        if (waitMs <= 0) return open;

        return { open: false, waitMs, until: new Date(until).toISOString(), fixUntil: null };
    }

    /** W-0131: die Verknüpfung, wenn sie für need zählt (siehe LinkUsable). On bleibt roh, für Verbinden und Trennen. */
    async Linked(userId: string, platform: Platform, need: "card" | "trusted"): Promise<IPlayerAccountRow | null> {
        const row = await this.On(userId, platform);

        return row && LinkUsable(row, need) ? row : null;
    }

    /** W-0131: der Besitzer zum Anzeigen - nur, wenn seine Verknüpfung als bestätigt zählt. */
    async TrustedOwner(platform: Platform, accountId: string): Promise<string | null> {
        const [row] = await this.Where({ platform, account_id: accountId });

        return row && LinkUsable(row, "trusted") ? row.user_id : null;
    }

    /** W-0131: der Besitzer samt der Frage, ob per Login (verified 1) oder nur per Name verbunden. */
    async OwnerRow(platform: Platform, accountId: string): Promise<{ userId: string; verified: boolean } | null> {
        const [row] = await this.Where({ platform, account_id: accountId });

        return row ? { userId: row.user_id, verified: Number(row.verified) === 1 } : null;
    }

    /** W-0131: Dasselbe Konto erst per Name, dann per Login verbunden - jetzt bestätigt. */
    async SetVerified(userId: string, platform: Platform): Promise<void> {
        await this.Update([userId, platform], { verified: 1 });
    }

    /** Rückwärts: welcher Discord-Nutzer steckt hinter diesem Spielernamen? */
    async Owner(platform: Platform, accountId: string): Promise<string | null> {
        const rows = await this.Where({ platform, account_id: accountId });

        return rows[0]?.user_id ?? null;
    }
}
