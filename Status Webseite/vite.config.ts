import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const styles = fileURLToPath(new URL("./src/styles", import.meta.url));

/**
 * Die Daten kommen vom Admin-Server (/public/status). Lokal reicht Vite die
 * Anfrage an ihn weiter, im Betrieb macht das nginx.
 */
const ADMIN_SERVER = process.env.ADMIN_SERVER ?? "http://localhost:3001";

export default defineConfig({
    plugins: [react()],
    css: {
        preprocessorOptions: {
            scss: {
                // `@use "mixins"` findet die Datei von überall, wie im Admin Dashboard.
                loadPaths: [styles],
            },
        },
    },
    server: {
        port: 5176,
        strictPort: true,
        proxy: { "/public": ADMIN_SERVER },
    },
    preview: {
        port: 5177,
        strictPort: true,
        proxy: { "/public": ADMIN_SERVER },
    },
    build: {
        sourcemap: false,
        assetsInlineLimit: 0,
    },
});
