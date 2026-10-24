/**
 * Baut das Dashboard-Frontend: TypeScript aus src/dashboard/client, gebündelt
 * und verkleinert nach src/dashboard/public/assets.
 *
 *   npm run build:dashboard     einmal (prüft vorher die Typen mit tsc)
 *   npm run dev:dashboard       baut bei jeder Änderung neu
 *
 * app.js ist der Einstieg - fester Name, die HTML-Seiten binden ihn ein. Jede
 * Seite und der geteilte Code landen als Stücke mit Prüfsumme im Namen unter
 * assets/chunks: eine solche Datei ändert sich nie, der Browser darf sie ein
 * Jahr behalten (DashboardAssets). Vorher waren es rund 40 Module, die jede
 * Seite einzeln und alle nachgeladen hat.
 */
import { build, BuildOptions, context, Plugin } from "esbuild";
import { mkdir, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";

const ROOT = path.join(process.cwd(), "src", "dashboard");
const OUT = path.join(ROOT, "public", "assets");

// Die Ordner, in die tsc früher jedes Modul einzeln geschrieben hat.
const LEGACY = ["core", "pages", "layout", "constants", "interfaces", "services"];

/**
 * Die Karten (Source Maps) mit den Quellen: außerhalb von public/, damit
 * niemand die Quellen abrufen kann. Der Bot übersetzt damit Fehler aus dem
 * Browser zurück (Guardian.Translate). Nicht in git, im Image dabei.
 */
const MAPS = path.join(ROOT, "maps");

/** Schiebt die Karten nach jedem Bau aus public/assets nach maps/, in dieselben Unterordner. */
const moveMaps: Plugin = {
    name: "rl-nexus:maps",
    setup(builder) {
        builder.onEnd(async () => {
            await rm(MAPS, { recursive: true, force: true });

            for (const file of (await readdir(OUT, { recursive: true })).map(String).filter((name) => name.endsWith(".map"))) {
                await mkdir(path.dirname(path.join(MAPS, file)), { recursive: true });
                await rename(path.join(OUT, file), path.join(MAPS, file));
            }
        });
    },
};

const options: BuildOptions = {
    entryPoints: [path.join(ROOT, "client", "app.ts")],
    bundle: true,
    splitting: true,
    format: "esm",
    minify: true,
    target: "es2022",
    outdir: OUT,
    entryNames: "[name]",
    chunkNames: "chunks/[name]-[hash]",
    legalComments: "none",
    logLevel: "info",
    // Extern und ohne Verweis in den Dateien: Der Browser sucht die Karten gar nicht erst.
    sourcemap: "external",
    sourcesContent: true,
    plugins: [moveMaps],
};

async function main(): Promise<void> {
    // Alte Stücke weg - sonst sammeln sich mit jedem Bau Dateien mit alten Prüfsummen.
    for (const folder of ["chunks", ...LEGACY]) await rm(path.join(OUT, folder), { recursive: true, force: true });

    if (process.argv.includes("--watch")) {
        await (await context(options)).watch();

        return;
    }

    await build(options);
}

void main();
