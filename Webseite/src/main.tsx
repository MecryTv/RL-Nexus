import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ModuleStatus } from "./domain/enums/ModuleCategory";
import { type IModulesContent, type IModuleValues, isBanner, isCategories, isCommandsContent, isModuleList, loadContent, toBanner } from "./services/Content";
import { setCategories } from "./services/categories";
import { setCommands, setModules } from "./services/registry";

/* Selbst gehostet, keine Anfrage an Google - und nur die Schnitte, die
   tatsächlich vorkommen. Vor dem eigenen Stylesheet, damit dessen Regeln bei
   gleicher Spezifität gewinnen.

   Ausdrücklich `latin-*` und nicht die Sammel-Datei: die zieht bei Rajdhani
   auch Devanagari mit, rund 350 kB für Zeichen, die auf einer deutschen Seite
   nie vorkommen. Umlaute und ß stehen im Latin-Block. */
import "@fontsource/oxanium/latin-400.css";
import "@fontsource/oxanium/latin-500.css";
import "@fontsource/oxanium/latin-700.css";
import "@fontsource/oxanium/latin-800.css";
import "@fontsource/rajdhani/latin-500.css";
import "@fontsource/rajdhani/latin-600.css";
import "@fontsource/rajdhani/latin-700.css";
import "@fontsource/orbitron/latin-700.css";
import "./styles/main.scss";

// Die Kategorie prüft hier niemand: categories.json lädt gleichzeitig, und Unbekanntes bekommt eine neutrale Farbe.
const MODULE_VALUES: IModuleValues = { statuses: Object.values(ModuleStatus) };

const isModules = (data: unknown): data is IModulesContent => isModuleList(data, MODULE_VALUES);

/**
 * Erst die Inhalte aus dem Admin Dashboard, dann die Anwendung.
 *
 * `App` kommt bewusst erst nach `setModules` dazu: Hero, Commands-Seite und
 * „Warum Nexus“ lesen die Modulzahlen schon beim Import. Beide Dateien laden
 * parallel und brauchen höchstens zwei Sekunden, sonst gelten die
 * eingebauten Daten.
 */
async function start(container: HTMLElement): Promise<void> {
    const [modules, stored, commands, categories] = await Promise.all([
        loadContent("modules.json", isModules),
        loadContent("banner.json", isBanner),
        loadContent("commands.json", isCommandsContent),
        loadContent("categories.json", isCategories),
    ]);

    if (categories !== null) setCategories(categories.data.categories);
    if (modules !== null) setModules(modules.data.modules);
    if (commands !== null) setCommands(commands.data.modules);

    const { App } = await import("./App");

    createRoot(container).render(
        <StrictMode>
            <App banner={stored === null ? null : { revision: stored.revision, data: toBanner(stored.data) }} />
        </StrictMode>
    );
}

const container = document.getElementById("root");

// Ohne das Wurzelelement gibt es nichts zu tun - und ein `!` an dieser Stelle
// würde den Fehler erst drei Aufrufe später als "null is not an object" zeigen.
if (container === null) throw new Error("Kein Element mit der ID 'root' gefunden.");

void start(container);
