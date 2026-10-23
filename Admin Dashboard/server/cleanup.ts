import { databaseReady, query } from "./db.ts";
import { activeGrant } from "./shop/store.ts";
import { HISTORY_DAYS } from "./status/history.ts";

const DAY = 24 * 60 * 60_000;

/**
 * Kontaktnachrichten aus der Zeit, als das Formular sie noch speicherte, 90
 * Tage nach dem Eingang. Protokoll nach 365 Tagen, Statusprüfungen nach 90.
 * Offene Bestellungen nach 30 Tagen, alte Discord-Tokens des Shops. Name und
 * Mail von Shop-Kunden ohne Bestellung und ohne laufenden Zugang 90 Tage nach
 * der letzten Anmeldung (die Zeile mit ID, Test und Sperre bleibt, sonst ginge
 * der Test nach 90 Tagen nochmal).
 */
export async function cleanup(): Promise<void> {
    if (!databaseReady()) return;

    try {
        const contact = await query<{ affectedRows: number }>(
            "DELETE FROM contact_messages WHERE created_at < NOW() - INTERVAL 90 DAY"
        );
        const audit = await query<{ affectedRows: number }>("DELETE FROM admin_audit WHERE created_at < NOW() - INTERVAL 365 DAY");

        // Ohne Meldung: Hier fallen jeden Tag rund 2900 Zeilen weg, das ist Alltag.
        await query(`DELETE FROM status_checks WHERE checked_at < NOW() - INTERVAL ${HISTORY_DAYS} DAY`);
        // Shop: Bestellungen, die nie bezahlt wurden, nach 30 Tagen. Eine Lastschrift meldet sich erst Tage
        // nach dem Checkout (async_payment_succeeded), bis dahin muss die Bestellung da sein.
        // Discord-Tokens, die nicht mehr gelten dürfen.
        await query("DELETE FROM shop_orders WHERE status IN ('open', 'failed') AND created_at < NOW() - INTERVAL 30 DAY");
        // Der Verlauf einer Person: drei Jahre, so lange wie Bestellungen als Nachweis.
        await query("DELETE FROM shop_events WHERE created_at < NOW() - INTERVAL 3 YEAR");
        await query("UPDATE shop_customers SET oauth_sealed = NULL, oauth_until = NULL WHERE oauth_until IS NOT NULL AND oauth_until < NOW()");
        // ponytail: Bestellungen drei Jahre nach Vertragsende löschen kommt, bevor die erste so alt ist (frühestens Oktober 2029).
        await query(
            `UPDATE shop_customers c SET c.name = NULL, c.email = NULL
              WHERE (c.name IS NOT NULL OR c.email IS NOT NULL)
                AND COALESCE(c.last_login_at, c.created_at) < NOW() - INTERVAL 90 DAY
                AND NOT EXISTS (SELECT 1 FROM shop_orders o WHERE o.user_id = c.user_id AND o.status IN ('paid', 'pending', 'refunded'))
                AND NOT EXISTS (SELECT 1 FROM shop_grants g WHERE g.user_id = c.user_id AND ${activeGrant("g")})`
        );

        if (contact.affectedRows + audit.affectedRows > 0) {
            console.log(`🧹 Aufgeräumt: ${contact.affectedRows} Kontaktnachricht(en), ${audit.affectedRows} Protokolleintrag/-einträge`);
        }
    } catch (error) {
        console.error(`⚠️  Aufräumen fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/** Beim Start und danach einmal täglich. Die Uhr hält den Prozess beim Beenden nicht auf. */
export function scheduleCleanup(): void {
    void cleanup();
    setInterval(() => void cleanup(), DAY).unref();
}
