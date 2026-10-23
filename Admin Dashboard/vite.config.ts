import { type ChildProcess, spawn } from "node:child_process";
import { connect } from "node:net";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const styles = fileURLToPath(new URL("./src/styles", import.meta.url));
const root = fileURLToPath(new URL(".", import.meta.url));

/** Der Admin-Server lokal. Vite reicht /api und /public an ihn weiter. */
const SERVER_PORT = 3001;
const SERVER = `http://localhost:${SERVER_PORT}`;

/** Nimmt auf dem Port schon jemand Verbindungen an? */
function portTaken(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const socket = connect(port, "localhost");

        socket.once("connect", () => {
            socket.destroy();
            resolve(true);
        });
        socket.once("error", () => resolve(false));
    });
}

/**
 * `npm run dev` startet den Admin-Server gleich mit, so wie `npm run
 * dev:server`. Ohne ihn zeigt die Oberfläche nur „Der Admin-Server antwortet
 * gerade nicht“, und die Statusseite bekommt keine Daten.
 *
 * Läuft auf dem Port schon einer, etwa in einem eigenen Terminal, bleibt es
 * bei dem. Der mitgestartete Server endet mit Vite.
 */
function adminServer(): Plugin {
    return {
        name: "rl-nexus:admin-server",
        apply: "serve",
        async configureServer(server) {
            if (await portTaken(SERVER_PORT)) {
                server.config.logger.info(`Admin-Server läuft schon auf Port ${SERVER_PORT}, Vite nimmt den.`);
                return;
            }

            const child: ChildProcess = spawn(process.execPath, ["--watch", "--env-file=.env", "server/index.ts", "--dev"], { cwd: root, stdio: "inherit" });

            // Nicht beim Neustart von Vite beenden (etwa nach einer Änderung an
            // dieser Datei): Der neue Durchlauf findet den Port dann belegt und nimmt ihn.
            process.once("exit", () => child.kill());
        },
    };
}

export default defineConfig({
    plugins: [react(), adminServer()],
    css: {
        preprocessorOptions: {
            scss: {
                // `@use "mixins"` findet die Datei von überall, wie auf der Webseite.
                loadPaths: [styles],
            },
        },
    },
    server: {
        // Fest, weil die Redirect-URI im Developer Portal diesen Port enthält.
        port: 5174,
        strictPort: true,
        proxy: { "/api": SERVER, "/public": SERVER },
    },
    build: {
        // Keine Quelltext-Karten im ausgelieferten Stand, wie auf der Webseite.
        sourcemap: false,
        assetsInlineLimit: 0,
    },
});
