import { warmNames } from "./search/sources.ts";
import { scheduleDeletions } from "./userdata/clock.ts";
import { scheduleMessages } from "./messages/clock.ts";
import { scheduleServers } from "./servers/clock.ts";
import { buildApp } from "./app.ts";
import { scheduleBackups } from "./backups/round.ts";
import { ensureBackupDatabase } from "./backups/store.ts";
import { scheduleCleanup } from "./cleanup.ts";
import { scheduleCommandSync } from "./commands-sync.ts";
import { loadConfig, type IConfig } from "./config.ts";
import { closeCache, connectCache } from "./cache.ts";
import { closeDatabase, connectDatabase } from "./db.ts";
import { closeEvents } from "./events.ts";
import { closeAllMail } from "./mail/pool.ts";
import { scheduleShopExpiry } from "./shop/expiry.ts";
import { schedulePartnerRoles } from "./partners/role.ts";
import { scheduleNews } from "./news/clock.ts";
import { scheduleStatusPost } from "./status-post.ts";

/**
 * Start des Admin-Servers: Einstellungen prüfen, Datenbank anbinden, lauschen.
 *
 *   npm run dev:server   lokal, mit .env und Neustart bei Änderungen
 *   npm start            im Container
 */

const config: IConfig = (() => {
    try {
        return loadConfig();
    } catch (error) {
        console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
        return process.exit(1);
    }
})();

await connectDatabase(config);
// W-0066: Redis als Cache, falls eingerichtet. Ohne Redis geht alles direkt an MariaDB.
await connectCache(config);
const backupProblem = await ensureBackupDatabase(config);
if (backupProblem && config.database) console.warn(`⚠️  Backups: ${backupProblem}`);
scheduleBackups(config);
scheduleCleanup();
scheduleStatusPost(config);
// Fällige Löschungen von Nutzerdaten (W-0051), alle 30 Sekunden.
scheduleDeletions(config);
// Nachrichten über den Bot an alle (W-0058): eine DM alle 2 Sekunden. Vorher werden Zeilen von einem Absturz mitten im Senden vermerkt.
await scheduleMessages(config);
// Ein Server pro Person (W-0064): Wahl und Abgleich mit dem Bot.
scheduleServers(config);
// Namen für die Suche (W-0059). Läuft nebenher, der Start wartet nicht darauf.
void warmNames(config).catch((error: unknown) => console.error(`🔎 Namen für die Suche nicht geholt: ${error instanceof Error ? error.message : String(error)}`));
scheduleCommandSync(config);
scheduleShopExpiry(config);
schedulePartnerRoles(config);
scheduleNews(config);

const app = await buildApp(config);
await app.listen({ port: config.port, host: "0.0.0.0" });

console.log(`🛡️  Admin Dashboard läuft auf Port ${config.port} (öffentlich: ${config.publicUrl})`);
console.log(
    config.developerMode
        ? `🧪 Dev-Modus: Anmeldung und Rollenabfrage über die Dev-Application ${config.clientId}`
        : `🚀 Produktion: Anmeldung und Rollenabfrage über die Application ${config.clientId}`
);

// Docker beendet mit SIGTERM. Ohne Handler wartet es zehn Sekunden und beendet dann hart.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
        // Offene Ereignisströme zuerst: Sonst wartet app.close() auf Antworten,
        // die nie enden.
        closeEvents();
        void Promise.all([app.close(), closeAllMail()]).then(() => Promise.all([closeDatabase(), closeCache()])).finally(() => process.exit(0));
    });
}
