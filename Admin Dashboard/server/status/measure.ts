import type { IBotOverview, IMaintenance } from "../../shared/api.ts";
import type { IBanner } from "../../shared/content.ts";
import { botOverview } from "../bot.ts";
import type { IConfig } from "../config.ts";
import { bannerOf } from "../content-rules.ts";
import { readContent, websiteStatus } from "../content.ts";
import { databaseReady, query } from "../db.ts";
import { readMaintenance } from "../maintenance.ts";
import type { IMeasurement } from "./history.ts";

/**
 * Eine Runde Prüfungen: Bot, Bot-Dashboard, Webseite, Datenbank. Jede mit
 * Zustand und Antwortzeit, dazu, was Statusseite und Discord zeigen.
 */

/** Ab hier gilt eine Seite als langsam. */
const SLOW_PAGE = 1500;
/** Ab hier gilt die Datenbank als langsam. */
const SLOW_DATABASE = 500;

export interface IDatabaseFacts {
    readonly online: boolean;
    readonly version: string | null;
    /** Sekunden, die MariaDB schon läuft. */
    readonly uptime: number | null;
    readonly tables: number;
    readonly bytes: number;
    /** Geschätzt aus information_schema, bei InnoDB nie ganz genau. */
    readonly rows: number;
}

export interface IMeasured {
    readonly at: Date;
    readonly measurements: readonly IMeasurement[];
    readonly bot: IBotOverview | null;
    readonly website: { readonly online: boolean; readonly builtAt: string | null };
    readonly maintenance: IMaintenance;
    readonly database: IDatabaseFacts;
    readonly banner: IBanner | null;
}

async function timed<T>(run: () => Promise<T>): Promise<{ readonly value: T; readonly ms: number }> {
    const start = performance.now();
    const value = await run();

    return { value, ms: Math.round(performance.now() - start) };
}

/**
 * Antwortet das Bot-Dashboard selbst?
 *
 * Es läuft im selben Prozess wie der Bot, aber ein eigener Aufruf zeigt mehr
 * als die Annahme „Bot läuft, also läuft es auch“: Ein Fehler im Dashboard
 * oder eine hängende Route fiele sonst nicht auf. Eine Weiterleitung zur
 * Anmeldung zählt als Antwort, mehr erwartet hier auch niemand.
 */
async function dashboardAnswers(config: IConfig): Promise<boolean> {
    try {
        const response = await fetch(`${config.botApiUrl}/`, { redirect: "manual", signal: AbortSignal.timeout(5000) });

        return response.status < 500;
    } catch {
        return false;
    }
}

const NO_DATABASE: IDatabaseFacts = { online: false, version: null, uptime: null, tables: 0, bytes: 0, rows: 0 };

async function databaseFacts(): Promise<IDatabaseFacts> {
    if (!databaseReady()) return NO_DATABASE;

    try {
        const [[{ version }], [size], [status]] = await Promise.all([
            query<{ version: string }[]>("SELECT VERSION() AS version"),
            query<{ bytes: number | string | null; tables: number; rows: number | string | null }[]>(
                "SELECT SUM(DATA_LENGTH + INDEX_LENGTH) AS bytes, COUNT(*) AS tables, SUM(TABLE_ROWS) AS `rows` FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()"
            ),
            query<{ Value: string }[]>("SHOW GLOBAL STATUS LIKE 'Uptime'"),
        ]);

        return {
            online: true,
            version: version.split("-")[0],
            uptime: status ? Number(status.Value) : null,
            tables: Number(size?.tables ?? 0),
            bytes: Number(size?.bytes ?? 0),
            rows: Number(size?.rows ?? 0),
        };
    } catch {
        return NO_DATABASE;
    }
}

/** Antwortet die Datenbank, und wie schnell? null ohne Antwort. */
async function databasePing(): Promise<number | null> {
    if (!databaseReady()) return null;

    try {
        return (await timed(() => query("SELECT 1"))).ms;
    } catch {
        return null;
    }
}

export async function measure(config: IConfig): Promise<IMeasured> {
    const at = new Date();

    // Der Bot beantwortet die Abfrage im Namen des Systems: Für Discord zählt
    // das Token, die ID landet nur im Protokoll des Bots.
    const [bot, website, dashboard, maintenance, ping, database, banner] = await Promise.all([
        botOverview(config, "status-post").catch(() => null),
        timed(() => websiteStatus(config)),
        timed(() => dashboardAnswers(config)),
        readMaintenance(config).catch((): IMaintenance => ({ website: null, dashboard: null })),
        databasePing(),
        databaseFacts(),
        // null: Die Webseite antwortet nicht, dann steht beim Banner „unbekannt“.
        readContent(config, "banner.json")
            .then((doc) => (doc === null ? null : bannerOf(doc.data)))
            .catch(() => null),
    ]);

    // Wartung zuerst: Dann zeigt nginx nur die Wartungsseite mit 503, die
    // Seite „antwortet“ also nicht, ist aber nicht ausgefallen.
    const page = (answers: boolean, ms: number, paused: boolean): IMeasurement["state"] => {
        if (paused) return "warn";
        if (!answers) return "down";
        if (ms > SLOW_PAGE) return "warn";

        return "ok";
    };

    const measurements: IMeasurement[] = [
        { service: "bot", state: bot === null ? "down" : bot.ready ? "ok" : "warn", latency: bot?.ping ?? null },
        { service: "dashboard", state: page(dashboard.value, dashboard.ms, maintenance.dashboard !== null), latency: dashboard.value ? dashboard.ms : null },
        { service: "website", state: page(website.value.online, website.ms, maintenance.website !== null), latency: website.value.online ? website.ms : null },
        { service: "database", state: ping === null ? "down" : ping > SLOW_DATABASE ? "warn" : "ok", latency: ping },
    ];

    return { at, measurements, bot, website: website.value, maintenance, database, banner };
}
