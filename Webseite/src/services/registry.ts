import { MODULE_DEFINITIONS } from "../data/modules.data";
import type { IModuleDefinition } from "../domain/interfaces/IModule";
import { withBuiltIns, type ICommandsContent } from "./Content";
import { ModuleRegistry } from "./ModuleRegistry";

/**
 * Die eine Registry der Anwendung.
 *
 * Kein Context: Die Modulliste steht fest, bevor die erste Komponente
 * geladen ist. `main.tsx` holt die Module aus dem Admin Dashboard, setzt sie
 * hier und importiert erst danach `App`. Dadurch sehen auch Stellen, die
 * ihre Werte schon beim Import lesen (Zahlen im Hero, `CommandsPage`), die
 * geladene Liste.
 */
let definitions: readonly IModuleDefinition[] = MODULE_DEFINITIONS;

export let moduleRegistry = new ModuleRegistry(definitions);

/** Die Sätze zu den Commands, wie der Bot sie meldet. Gehen vor den eingebauten. */
const descriptions = new Map<string, string>();

/** Ersetzt die eingebauten Module, feste Module aus dem Standard kommen dazu. Nur in `main.tsx` vor dem Import von `App` aufrufen. */
export function setModules(next: readonly IModuleDefinition[]): void {
    definitions = withBuiltIns(next, MODULE_DEFINITIONS);
    moduleRegistry = new ModuleRegistry(definitions);
}

/**
 * Die Commands aus dem Bot (commands.json). Ein Modul, das dort steht, zeigt
 * genau diese Commands. Fehlt es, bleiben die aus modules.json. Nach
 * `setModules` und vor dem Import von `App` aufrufen.
 */
export function setCommands(modules: ICommandsContent["modules"]): void {
    definitions = definitions.map((definition) => {
        const commands = modules[definition.id];

        return commands === undefined ? definition : { ...definition, commands: commands.map((entry) => entry.path) };
    });
    moduleRegistry = new ModuleRegistry(definitions);

    for (const commands of Object.values(modules)) {
        for (const entry of commands) if (entry.description) descriptions.set(entry.path, entry.description);
    }
}

/** Der Satz zu einem Command aus dem Bot, sonst undefined. */
export function commandDescription(path: string): string | undefined {
    return descriptions.get(path);
}
