// Öffnet das Admin Dashboard in einem sichtbaren Fenster. Der Nutzer meldet sich
// selbst per Discord an, danach wird die Sitzung in .playwright/admin-state.json
// gespeichert (gilt wie das Cookie 12 Stunden). Claude tippt hier nie Zugangsdaten.
//
//   node .claude/skills/rl-nexus-playwright/admin-login.js [url]
const fs = require("node:fs");
const { chromium, OUT, ADMIN_STATE } = require("./pw.js");

const TARGET = process.argv[2] ?? "http://localhost:5174/";
const COOKIE = "rlnexus_admin"; // SESSION_COOKIE in Admin Dashboard/server/session.ts

(async () => {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await page.goto(TARGET);
    console.log("Bitte im Fenster mit Discord anmelden. Ich warte bis zu 10 Minuten.");

    const until = Date.now() + 10 * 60_000;
    while (Date.now() < until && browser.isConnected()) {
        const session = (await context.cookies()).find((c) => c.name === COOKIE);
        if (session) {
            await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
            fs.mkdirSync(OUT, { recursive: true });
            await context.storageState({ path: ADMIN_STATE });
            console.log(`Sitzung gespeichert: ${ADMIN_STATE}`);
            console.log(`Gültig bis ${new Date(session.expires * 1000).toLocaleString("de-DE")}`);
            await browser.close();
            return;
        }
        await new Promise((r) => setTimeout(r, 1000));
    }

    console.error(browser.isConnected() ? "Keine Anmeldung innerhalb von 10 Minuten." : "Fenster geschlossen, keine Sitzung gespeichert.");
    if (browser.isConnected()) await browser.close();
    process.exit(1);
})();
