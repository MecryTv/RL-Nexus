import type { IBotCommand } from "../shared/api.ts";
import type { ICommandPath, ICommandsContent } from "../shared/content.ts";
import { botCommands } from "./bot.ts";
import type { IConfig } from "./config.ts";
import { readContent, writeContent } from "./content.ts";
import { publish } from "./events.ts";

/**
 * Die Commands der Webseite kommen aus dem Bot.
 *
 * Alle fünf Minuten und beim Start fragt der Server den Bot, ordnet die
 * Commands nach Modul und schreibt `commands.json`, wenn sich etwas geändert
 * hat. Eine eigene Datei statt `modules.json`: So bekommt ein offener
 * Modul-Editor keinen 409, nur weil im Hintergrund Commands nachgezogen wurden.
 * Antwortet der Bot nicht, bleibt die Datei, wie sie ist.
 */

export const COMMANDS_FILE = "commands.json";

const EVERY = 5 * 60_000;

let timer: NodeJS.Timeout | null = null;

/** Pfade je Modul, sortiert. Commands ohne Modul (Dev) gehören auf keine Webseite. */
export function commandsByModule(commands: readonly IBotCommand[]): Record<string, ICommandPath[]> {
    const modules: Record<string, ICommandPath[]> = {};

    for (const command of commands) {
        if (command.module === null) continue;

        (modules[command.module] ??= []).push(...command.paths.map((entry) => ({ path: entry.path, description: entry.description })));
    }

    for (const paths of Object.values(modules)) paths.sort((a, b) => a.path.localeCompare(b.path));

    return Object.fromEntries(Object.entries(modules).sort(([a], [b]) => a.localeCompare(b)));
}

/** Einmal abgleichen. `by` steht als Urheber in der Datei, etwa „Bot“ oder der Name der Person. */
export async function syncCommands(config: IConfig, by: string): Promise<"changed" | "same" | "offline"> {
    const commands = await botCommands(config, "system");
    if (commands === null) return "offline";

    const modules = commandsByModule(commands);
    const current = await readContent(config, COMMANDS_FILE);
    const stored = (current?.data as ICommandsContent | undefined)?.modules;

    if (stored !== undefined && JSON.stringify(stored) === JSON.stringify(modules)) return "same";

    const data: ICommandsContent = { updatedAt: new Date().toISOString(), modules };
    await writeContent(config, COMMANDS_FILE, current?.revision ?? 0, data, by);
    publish("content");

    return "changed";
}

/** Beim Start (nach 15 Sekunden, der Bot braucht einen Moment) und danach alle fünf Minuten. */
export function scheduleCommandSync(config: IConfig): void {
    if (timer !== null) return;

    const run = (): void => {
        void syncCommands(config, "Bot")
            .then((result) => {
                if (result === "changed") console.log("🧩 Commands vom Bot übernommen");
            })
            .catch((error: unknown) => console.error(`🧩 Commands-Abgleich fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`));
    };

    setTimeout(run, 15_000).unref();
    timer = setInterval(run, EVERY);
    timer.unref();
}
