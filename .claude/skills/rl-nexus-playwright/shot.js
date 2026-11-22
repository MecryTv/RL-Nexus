// Screenshots einer oder mehrerer Seiten in mehreren Breiten, dazu Konsolenfehler,
// Seitenfehler und fehlgeschlagene Anfragen. Exit-Code 1, wenn etwas davon auftrat.
//
//   node .claude/skills/rl-nexus-playwright/shot.js <url> [<url> ...]
//
// Umgebung: NAME (Dateipräfix, sonst aus der URL), WIDTHS (Standard 390,768,1440),
// STATE=admin (gespeicherte Admin-Sitzung), THEME=dark, HEADED=1 (Fenster zeigen).
const fs = require("node:fs");
const path = require("node:path");
const { chromium, OUT, ADMIN_STATE } = require("./pw.js");

const urls = process.argv.slice(2);
if (urls.length === 0) {
    console.error("Aufruf: node shot.js <url> [<url> ...]");
    process.exit(2);
}

const widths = (process.env.WIDTHS ?? "390,768,1440").split(",").map(Number);
const admin = process.env.STATE === "admin";
if (admin && !fs.existsSync(ADMIN_STATE)) {
    console.error("Keine Admin-Sitzung gespeichert. Erst: node .claude/skills/rl-nexus-playwright/admin-login.js");
    process.exit(2);
}

const dir = path.join(OUT, "shots");
fs.mkdirSync(dir, { recursive: true });

function slug(url) {
    const u = new URL(url);
    return `${u.port || u.hostname}${u.pathname}`.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "seite";
}

(async () => {
    const browser = await chromium.launch({ headless: !process.env.HEADED });
    let problems = 0;

    for (const url of urls) {
        const name = urls.length === 1 && process.env.NAME ? process.env.NAME : [process.env.NAME, slug(url)].filter(Boolean).join("-");

        for (const width of widths) {
            const context = await browser.newContext({
                viewport: { width, height: 900 },
                colorScheme: process.env.THEME === "dark" ? "dark" : "light",
                storageState: admin ? ADMIN_STATE : undefined,
            });
            const page = await context.newPage();
            const errors = [];

            page.on("console", (m) => m.type() === "error" && errors.push(`Konsole: ${m.text()}`));
            page.on("pageerror", (e) => errors.push(`Seitenfehler: ${e.message}`));
            page.on("response", (r) => r.status() >= 400 && errors.push(`HTTP ${r.status()}: ${r.url()}`));
            page.on("requestfailed", (r) => errors.push(`Abgebrochen: ${r.url()} (${r.failure()?.errorText})`));

            try {
                await page.goto(url, { waitUntil: "load", timeout: 30_000 });
                // Vite hält einen Websocket offen; networkidle ist deshalb nur ein Versuch.
                await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
                // Abschnitte erscheinen erst beim Scrollen; ohne das bleibt die Ganzseite halb leer.
                await page.evaluate(async () => {
                    for (let y = 0; y < document.body.scrollHeight; y += innerHeight / 2) {
                        scrollTo(0, y);
                        await new Promise((r) => setTimeout(r, 120));
                    }
                    scrollTo(0, 0);
                    await new Promise((r) => setTimeout(r, 600));
                });
                const file = path.join(dir, `${name}-${width}.png`);
                await page.screenshot({ path: file, fullPage: true });
                console.log(`${width}px  ${file}${page.url() !== url ? `  (gelandet auf ${page.url()})` : ""}`);
            } catch (e) {
                errors.push(`Laden: ${e.message.split("\n")[0]}`);
            }

            for (const line of new Set(errors)) console.log(`        ${line}`);
            problems += errors.length;
            await context.close();
        }
    }

    await browser.close();
    if (problems > 0) process.exit(1);
})();
