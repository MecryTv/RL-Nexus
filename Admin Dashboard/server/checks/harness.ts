import { loadConfig } from "../config.ts";

/**
 * Was alle Checks teilen: Zähler, Ausgabe und eine Konfiguration wie im
 * Betrieb, nur mit erfundenen Werten.
 */

let failures = 0;

export async function check(name: string, run: () => void | Promise<void>): Promise<void> {
    try {
        await run();
        console.log(`  ok    ${name}`);
    } catch (error) {
        failures++;
        console.log(`  FAIL  ${name}\n        ${error instanceof Error ? error.message : String(error)}`);
    }
}

export function section(title: string): void {
    console.log(`\n  ${title}`);
}

export function finish(): never {
    console.log(failures === 0 ? "\n  Alles in Ordnung.\n" : `\n  ${failures} Prüfung(en) fehlgeschlagen.\n`);
    process.exit(failures === 0 ? 0 : 1);
}

export const SECRET = "s".repeat(48);

export const ENV: Readonly<Record<string, string>> = {
    CLIENT_ID: "111111111111111111",
    CLIENT_SECRET: "check-client-secret",
    CLIENT_TOKEN: "check-bot-token",
    SERVER_JWT_SECRET: SECRET,
    ADMIN_GUILD_ID: "1547258700480253982",
    ADMIN_ROLE_ID: "1548701400031297619",
    DEVELOPER_ROLE_ID: "1548701516418912370",
    ADMIN_PUBLIC_URL: "https://admin.example.test",
    BOT_API_URL: "http://bot.example.test",
};

export const config = loadConfig(ENV, []);
