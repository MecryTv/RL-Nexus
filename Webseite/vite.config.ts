import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

const styles = fileURLToPath(new URL("./src/styles", import.meta.url));

/**
 * Die Schriften, die schon im ersten Bild stehen, mit dem HTML anfordern.
 *
 * Ohne das entdeckt der Browser sie erst, wenn das Stylesheet da ist und ein
 * Text sie braucht: eine Runde später, und so lange steht Ersatzschrift da
 * oder das Intro wartet. Nur die Schnitte von Kopfzeile und Hero, nicht alle
 * acht - wer mehr vorlädt, verstopft die Leitung für den Rest.
 */
function preloadFonts(names: readonly string[]): Plugin {
    return {
        name: "rl-nexus:preload-fonts",
        apply: "build",
        transformIndexHtml(_html, context) {
            return Object.keys(context.bundle ?? {})
                .filter((file) => file.endsWith(".woff2") && names.some((name) => file.includes(`/${name}-`)))
                .map((file) => ({
                    tag: "link",
                    attrs: { rel: "preload", href: `/${file}`, as: "font", type: "font/woff2", crossorigin: "" },
                    injectTo: "head" as const,
                }));
        },
    };
}

/**
 * Jede Textdatei des Builds zusätzlich gepackt ablegen, als .gz und als .br.
 *
 * nginx liefert sie mit `gzip_static` und `brotli_static` fertig aus, statt
 * bei jeder Anfrage selbst zu packen - und zwar auf der höchsten Stufe, die
 * beim Ausliefern zu teuer wäre. Bilder und Schriften sind schon gepackt, bei
 * ihnen brächte das nichts.
 */
function precompress(): Plugin {
    return {
        name: "rl-nexus:precompress",
        apply: "build",
        writeBundle({ dir = "dist" }, bundle) {
            for (const file of Object.keys(bundle)) {
                if (!/\.(?:js|css|html|svg)$/.test(file)) continue;

                const path = join(dir, file);
                const source = readFileSync(path);

                // Unter einem Kilobyte frisst der Kopf des Formats den Gewinn auf.
                if (source.length < 1024) continue;

                writeFileSync(`${path}.gz`, gzipSync(source, { level: 9 }));
                writeFileSync(
                    `${path}.br`,
                    brotliCompressSync(source, {
                        params: {
                            [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
                            [constants.BROTLI_PARAM_SIZE_HINT]: source.length,
                        },
                    })
                );
            }
        },
    };
}

/**
 * `/content/*` im Entwicklungsserver, wie im Betrieb nginx: zuerst,
 * was das lokale Admin Dashboard gespeichert hat, sonst der Standard aus dem
 * Export. So lässt sich ein Inhalt im Admin Dashboard ändern und hier sofort
 * ansehen, ohne Docker.
 */
function localContent(): Plugin {
    const live = process.env.CONTENT_DIR ?? fileURLToPath(new URL("../RL Nexus Admin Dashboard/data/site", import.meta.url));
    const defaults = fileURLToPath(new URL("./public/content-default", import.meta.url));

    return {
        name: "rl-nexus:local-content",
        apply: "serve",
        configureServer(server) {
            server.middlewares.use("/content", (request, response) => {
                const file = (request.url ?? "").split("?")[0];

                // Nur Namen, wie es sie gibt. Kein Weg aus den beiden Ordnern heraus.
                const path = /^\/(?:details\/)?[a-z][a-z0-9-]*\.json$/.test(file)
                    ? [join(live, file), join(defaults, file)].find((candidate) => existsSync(candidate))
                    : undefined;

                if (path === undefined) {
                    response.statusCode = 404;
                    response.end();
                    return;
                }

                response.setHeader("Content-Type", "application/json; charset=utf-8");
                response.setHeader("Cache-Control", "no-cache");
                response.end(readFileSync(path));
            });
        },
    };
}

export default defineConfig(({ command, mode }) => {
    // Im Betrieb nimmt nginx /api/contact an und reicht es an den
    // Admin-Server. Steht in keiner .env etwas anderes, baut die Seite mit
    // dieser Adresse. Ein ausdrücklich leerer Wert bleibt der Weg übers Mailprogramm.
    if (command === "build" && !("VITE_CONTACT_ENDPOINT" in loadEnv(mode, process.cwd(), "VITE_"))) {
        process.env.VITE_CONTACT_ENDPOINT = "/api/contact";
    }

    return {
        server: {
            // Wie nginx im Betrieb: das Kontaktformular geht an den Admin-Server.
            // Greift nur mit VITE_CONTACT_ENDPOINT=/api/contact in der .env.
            proxy: {
                "/api/contact": { target: "http://localhost:3001", rewrite: () => "/public/contact" },
                // Ist die Webseite in der Wartung? (Plan 23) Ohne laufendes Admin Dashboard: keine Wartung.
                "/api/wartung": { target: "http://localhost:3001", rewrite: () => "/public/maintenance" },
                // Der Shop (Plan 12) wie im Betrieb. Ohne changeOrigin: Der Admin-Server prüft den Origin der Webseite.
                "/api/shop": { target: "http://localhost:3001", rewrite: (path) => path.replace(/^\/api\/shop/, "/public/shop") },
            },
        },
        plugins: [
            react(),
            localContent(),
            preloadFonts([
                "oxanium-latin-400-normal",
                "oxanium-latin-800-normal",
                "rajdhani-latin-600-normal",
                "orbitron-latin-700-normal",
            ]),
            precompress(),
        ],
        css: {
            preprocessorOptions: {
                scss: {
                    /**
                     * `@use "mixins"` findet die Datei von überall.
                     *
                     * Ohne das trägt jede Datei ihren eigenen relativen Pfad -
                     * `../../styles/mixins` in einer Komponente, `../styles/mixins`
                     * auf einer Seite - und beim Verschieben einer Datei bricht der
                     * Bau an einer Stelle, die mit der Änderung nichts zu tun hat.
                     */
                    loadPaths: [styles],
                },
            },
        },
        build: {
            // Die Rang-Karte im Hero ist HTML, die Logos sind klein: was hier über
            // die Warnschwelle ginge, wäre ein Fehler und keine Nachlässigkeit.
            chunkSizeWarningLimit: 600,

            /**
             * Keine Quelltext-Karten im ausgelieferten Stand.
             *
             * Das ist ohnehin die Voreinstellung - hier steht es ausdrücklich, weil
             * es eine Entscheidung ist und keine Nachlässigkeit: mit `sourcemap`
             * ließe sich der ungebündelte Quellcode samt Kommentaren in den
             * Entwicklerwerkzeugen jedes Besuchers lesen.
             */
            sourcemap: false,

            /**
             * Keine Bilder als Data-URI ins Bündel legen.
             *
             * Vite bettet Dateien unter 4 kB standardmäßig als base64 ein. Bei den
             * Rang-Abzeichen ist das genau falsch: es gibt dreiundzwanzig davon,
             * eine Seite zeigt höchstens acht, und eingebettet zahlt jeder Besucher
             * alle. Als eigene Dateien holt der Browser nur die, die er braucht,
             * und behält sie im Zwischenspeicher.
             */
            assetsInlineLimit: 0,
        },
    };
});
