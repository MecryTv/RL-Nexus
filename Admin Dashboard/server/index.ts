import { buildApp } from "./app.ts";
import { scheduleBackups } from "./backups/round.ts";
import { ensureBackupDatabase } from "./backups/store.ts";
import { scheduleCleanup } from "./cleanup.ts";
import { scheduleCommandSync } from "./commands-sync.ts";
import { loadConfig, type IConfig } from "./config.ts";
import { closeDatabase, connectDatabase } from "./db.ts";
import { closeEvents } from "./events.ts";
import { closeAllMail } from "./mail/pool.ts";
import { scheduleShopExpiry } from "./shop/expiry.ts";
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
const backupProblem = await ensureBackupDatabase(config);
if (backupProblem && config.database) console.warn(`⚠️  Backups: ${backupProblem}`);
scheduleBackups(config);
scheduleCleanup();
scheduleStatusPost(config);
scheduleCommandSync(config);
scheduleShopExpiry(config);

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
        void Promise.all([app.close(), closeAllMail()]).then(closeDatabase).finally(() => process.exit(0));
    });
}
