import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createConnection, createPool, type Pool } from "mariadb";
import type { IConfig, IDatabaseConfig } from "./config.ts";
import { PublicError } from "./errors.ts";

/**
 * Die Datenbank des Bots, mit eigenem Pool.
 *
 * Die Tabellen des Bots liest und schreibt der Admin-Server nur, anlegen und
 * ändern tut sie der Bot. Die eigenen Tabellen kommen aus server/migrations
 * und stehen in admin_migrations, nach dem Muster von schema_migrations im Bot.
 *
 * Ohne Datenbank startet der Server trotzdem. Was sie braucht, sagt dann, dass sie fehlt.
 */

export class DatabaseUnavailable extends PublicError {
    constructor() {
        super(503, "Die Datenbank ist gerade nicht erreichbar.");
    }
}

const MIGRATIONS = path.join(import.meta.dirname, "migrations");
const MIGRATIONS_TABLE = "admin_migrations";
const POOL_LIMIT = 3;

let pool: Pool | null = null;

export function databaseReady(): boolean {
    return pool !== null;
}

export async function connectDatabase(config: IConfig): Promise<void> {
    if (!config.database) {
        console.warn("⚠️  Keine Datenbank eingerichtet. Gruppen, Meldungen und Kontakt bleiben aus.");
        return;
    }

    try {
        await migrate(config.database);

        const { host, port, name, user, password } = config.database;

        // BIGINT und COUNT() als Zahl statt BigInt: JSON kennt kein BigInt, und
        // so große Werte kommen hier nicht vor.
        pool = createPool({
            host,
            port,
            database: name,
            user,
            password,
            connectionLimit: POOL_LIMIT,
            bigIntAsNumber: true,
            insertIdAsNumber: true,
            // Wie im Bot (DatabaseService.ts): "auto" fragt die Zeitzone der
            // Datenbank ab und rechnet um. Ohne liest der Treiber die Ziffern als
            // Ortszeit, unter Windows mit Sommerzeit zwei Stunden daneben.
            // npm run check:db misst das mit.
            timezone: "auto",
        });

        console.log("🗄️  Datenbank verbunden");
    } catch (error) {
        console.error(`❌ Datenbank nicht erreichbar, der Server läuft ohne sie: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Migrationen über eine eigene Verbindung mit multipleStatements, wie im Bot.
 * Der Pool bleibt ohne die Option: dort landen nie zwei Anweisungen in einem Aufruf.
 */
async function migrate(database: IDatabaseConfig): Promise<void> {
    const connection = await createConnection({
        host: database.host,
        port: database.port,
        database: database.name,
        user: database.user,
        password: database.password,
        multipleStatements: true,
    });

    try {
        await connection.query(
            `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
                name       VARCHAR(128) NOT NULL,
                applied_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (name)
            ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci`
        );

        const rows = (await connection.query(`SELECT name FROM ${MIGRATIONS_TABLE}`)) as { name: string }[];
        const done = new Set(rows.map((row) => row.name));
        const files = (await readdir(MIGRATIONS)).filter((file) => file.endsWith(".sql")).sort();

        for (const file of files) {
            if (done.has(file)) continue;

            await connection.query(await readFile(path.join(MIGRATIONS, file), "utf8"));
            await connection.query(`INSERT INTO ${MIGRATIONS_TABLE} (name) VALUES (?)`, [file]);

            console.log(`🗄️  Migration ausgeführt: ${file}`);
        }
    } finally {
        await connection.end();
    }
}

export async function query<T>(sql: string, values: readonly unknown[] = []): Promise<T> {
    if (!pool) throw new DatabaseUnavailable();

    return (await pool.query(sql, values)) as T;
}

/** Eine Abfrage innerhalb einer Transaktion. */
export type TransactionQuery = <R>(sql: string, values?: readonly unknown[]) => Promise<R>;

/** Alles in run gilt zusammen oder gar nicht: bei einem Fehler zurückgerollt und weitergeworfen. */
export async function withTransaction<T>(run: (query: TransactionQuery) => Promise<T>): Promise<T> {
    if (!pool) throw new DatabaseUnavailable();

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();
        const result = await run(async <R>(sql: string, values: readonly unknown[] = []) => (await connection.query(sql, values)) as R);
        await connection.commit();

        return result;
    } catch (error) {
        await connection.rollback().catch(() => undefined);
        throw error;
    } finally {
        await connection.release();
    }
}

export async function closeDatabase(): Promise<void> {
    await pool?.end();
    pool = null;
}
