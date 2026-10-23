/**
 * Schreibt die Inhalte der Seite als JSON nach `public/content-default/` und
 * den Build-Zeitpunkt nach `public/version.json`.
 *
 *   npm run export     läuft auch vor `npm run dev` und vor jedem Build
 *
 * Die Dateien sind die Standards: Die Seite lädt zur Laufzeit zuerst, was das
 * Admin Dashboard in `data/site` gespeichert hat, und fällt sonst auf diese
 * zurück. Das Admin Dashboard holt sie als Ausgangsstand für seine Editoren,
 * dazu `meta.json` mit allem, was ein Inhalt enthalten darf.
 *
 * Vite statt eines eigenen Parsers: Die Datendateien benutzen TS-Enums, die
 * Symbole sind JSX. Beides übersetzt Vite ohnehin, `ssrLoadModule` wertet die
 * Dateien danach aus wie im Browser.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = join(root, "public", "content-default");

/** Die erlaubten Beispiele einer Detailseite, siehe `IModuleDetail.showcase`. */
const SHOWCASES = ["rank-card", "team-roster"];

/** Jede Datei in derselben Hülle wie im Admin Dashboard. Revision 0 heißt: Stand aus dem Build. */
function envelope(data) {
    return JSON.stringify({ revision: 0, updatedAt: null, updatedBy: null, data });
}

/** Jede Farbe `--c-*` aus den Tokens, mit ihrem Wert für die Vorschau im Admin Dashboard. */
async function colors() {
    const tokens = await readFile(join(root, "src", "styles", "_tokens.scss"), "utf8");

    return [...tokens.matchAll(/^\s*(--c-[a-z0-9-]+):\s*([^;]+);/gm)].map(([, token, value]) => ({ token, value: value.trim() }));
}

// Eigener Cache-Ordner und keine Suche nach Abhängigkeiten: Läuft daneben
// schon `npm run dev`, kommen sich die beiden sonst in node_modules/.vite in
// die Quere.
const vite = await createServer({
    root,
    logLevel: "error",
    appType: "custom",
    cacheDir: "node_modules/.vite-export",
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, watch: null },
});

// Erst alles einsammeln, dann Vite schließen, dann schreiben. Schriebe das
// Skript bei offenem Server in public/, meldete dessen Dateibeobachter die
// neuen Dateien noch, während er schon schließt, und Vite würfe Fehler.
let content;

try {
    const { MODULE_DEFINITIONS } = await vite.ssrLoadModule("/src/data/modules.data.ts");
    const { MODULE_DETAILS } = await vite.ssrLoadModule("/src/data/moduleDetails.data.ts");
    const { TEAM_MEMBERS, OPEN_ROLES } = await vite.ssrLoadModule("/src/data/team.data.ts");
    const { STATUS_LABEL } = await vite.ssrLoadModule("/src/domain/models/BotModule.ts");
    const { DEFAULT_CATEGORIES } = await vite.ssrLoadModule("/src/services/categories.ts");
    const { Icon, ICON_NAMES } = await vite.ssrLoadModule("/src/components/ui/Icon.tsx");
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");

    content = {
        modules: MODULE_DEFINITIONS,
        details: MODULE_DETAILS,
        team: { members: TEAM_MEMBERS, openRoles: OPEN_ROLES },
        categories: DEFAULT_CATEGORIES.map(({ id, label, accent, description }) => ({ id, label, color: accent, description })),
        meta: {
            categories: DEFAULT_CATEGORIES.map(({ id, label, accent }) => ({ id, label, accent })),
            statuses: Object.entries(STATUS_LABEL).map(([id, label]) => ({ id, label })),
            icons: ICON_NAMES.map((name) => ({ name, svg: renderToStaticMarkup(createElement(Icon, { name, size: 24 })) })),
            colors: await colors(),
            showcases: SHOWCASES,
        },
    };
} finally {
    await vite.close();
}

const { modules, details, team, categories, meta } = content;

// Vorher leeren: ein entferntes Modul soll keinen Detailtext zurücklassen.
await rm(out, { recursive: true, force: true });
await mkdir(join(out, "details"), { recursive: true });

await writeFile(join(out, "banner.json"), envelope({ enabled: false, kind: "info", title: "", text: "" }));
await writeFile(join(out, "team.json"), envelope(team));
await writeFile(join(out, "modules.json"), envelope({ modules }));
await writeFile(join(out, "categories.json"), envelope({ categories }));

for (const [id, detail] of Object.entries(details)) {
    await writeFile(join(out, "details", `${id}.json`), envelope(detail));
}

await writeFile(join(out, "meta.json"), JSON.stringify(meta));
await writeFile(join(root, "public", "version.json"), JSON.stringify({ builtAt: new Date().toISOString() }));

console.log(
    `Inhalte exportiert: ${modules.length} Module, ${Object.keys(details).length} Detailtexte, ` +
        `${team.members.length} Mitglieder, ${meta.icons.length} Symbole, ${meta.colors.length} Farben`
);
