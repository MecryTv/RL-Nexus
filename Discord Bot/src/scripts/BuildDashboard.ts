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
 *
 * Gepflegt wird client/style.css, ausgeliefert assets/style.css: dieselbe Datei
 * ohne Kommentare und Leerraum (W-0141). Ohne Bündeln, damit url("fonts/...")
 * so stehen bleibt, wie es neben der fertigen Datei passt.
 */
import { build, BuildOptions, context } from "esbuild";
import { rm } from "node:fs/promises";
import path from "node:path";

const ROOT = path.join(process.cwd(), "src", "dashboard");
const OUT = path.join(ROOT, "public", "assets");

// Die Ordner, in die tsc früher jedes Modul einzeln geschrieben hat.
const LEGACY = ["core", "pages", "layout", "constants", "interfaces", "services"];

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
};

const styles: BuildOptions = {
    entryPoints: [path.join(ROOT, "client", "style.css")],
    minify: true,
    outfile: path.join(OUT, "style.css"),
    legalComments: "none",
    logLevel: "info",
};

async function main(): Promise<void> {
    // Alte Stücke weg - sonst sammeln sich mit jedem Bau Dateien mit alten Prüfsummen.
    for (const folder of ["chunks", ...LEGACY]) await rm(path.join(OUT, folder), { recursive: true, force: true });

    if (process.argv.includes("--watch")) {
        await (await context(options)).watch();
        await (await context(styles)).watch();

        return;
    }

    await Promise.all([build(options), build(styles)]);
}

void main();
