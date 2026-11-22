// Playwright aus dem global installierten playwright-skill laden, damit das Repo
// keine eigene Abhängigkeit braucht. Auch für eigene Skripte:
//   const { chromium, OUT } = require("D:/Development/RL Nexus/.claude/skills/rl-nexus-playwright/pw.js");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function load() {
    try {
        return require("playwright");
    } catch {}

    const base = path.join(os.homedir(), ".claude/plugins/cache/playwright-skill/playwright-skill");
    // Neueste Version des Plugins; nach einem Update fehlt dort evtl. node_modules.
    const version = fs.readdirSync(base).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).pop();
    const skill = path.join(base, version, "skills/playwright-skill");

    try {
        return require(path.join(skill, "node_modules/playwright"));
    } catch {
        throw new Error(`Playwright fehlt. Einmal ausführen: cd "${skill}" && npm run setup`);
    }
}

const ROOT = path.resolve(__dirname, "../../..");
const OUT = path.join(ROOT, ".playwright");

module.exports = { ...load(), ROOT, OUT, ADMIN_STATE: path.join(OUT, "admin-state.json") };
