/**
 * W-0138: die ersten 14 Tage aus dem bisherigen nginx-Protokoll nachlesen.
 *
 *   node server/activity-import.ts <ordner mit access.log>
 *
 * Beim Ausrollen einmal in einem kurzlebigen Container, der /var/log/nginx nur
 * für diesen Lauf schreibgeschützt sieht (Discord Bot/docs/Hosting.md).
 */
import { importHistory } from "./activity/import.ts";
import { loadConfig } from "./config.ts";
import { closeDatabase, connectDatabase, databaseReady } from "./db.ts";

const dir = process.argv[2];

if (!dir) {
    console.error("Aufruf: node server/activity-import.ts <ordner mit access.log>");
    process.exit(2);
}

const config = loadConfig();

await connectDatabase(config);

if (!databaseReady()) {
    console.error("❌ Keine Datenbank, nichts nachgelesen.");
    process.exit(1);
}

try {
    const result = await importHistory(dir, new Date());

    if (result === "already") console.log("Schon nachgelesen, nichts zu tun.");
    else if (result === "no-live-yet") console.log("Das eigene Protokoll wurde noch nicht gelesen. Erst den Admin ein paar Minuten laufen lassen, dann nachlesen.");
    else console.log(`📈 Nachgelesen: ${result.lines} Zeilen vor dem eigenen Protokoll, davon ${result.hits} von den drei Seiten.`);
} finally {
    await closeDatabase();
}
