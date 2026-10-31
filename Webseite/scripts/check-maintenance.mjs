/**
 * Prüft die Wartungs-Regeln der Webseite aus `src/services/maintenance.ts`
 * (Plan 23): welche Seiten der Wächter durchlässt und was der lokale Spiegel
 * in `vite.config.ts` antwortet. Im Betrieb entscheidet nginx dasselbe
 * (`nginx/container/website.conf` im Bot-Repo).
 *
 *   npm run check
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { LEGAL_PATHS, isLegalPath, maintenanceAnswer } from "../src/services/maintenance.ts";

/** Die nginx-Dateien aus dem Bot-Repo: Webseite (Container) und Bot-Dashboard (Host). */
const CONFS = ["container/website.conf", "dashboard.nexus-emb.de.conf"].map((name) => ({
    name,
    text: readFileSync(fileURLToPath(new URL(`../../Discord Bot/nginx/${name}`, import.meta.url)), "utf8").replace(/#.*$/gm, ""),
}));

/** Die location-Blöcke mit ihrem Inhalt, Klammern gezählt - darin stehen auch if-Blöcke. */
function locations(text) {
    return [...text.matchAll(/^\s*location\s+([^{]+)\{/gm)].map((match) => {
        let depth = 1;
        let index = match.index + match[0].length;
        const start = index;

        while (depth > 0 && index < text.length) {
            if (text[index] === "{") depth++;
            else if (text[index] === "}") depth--;
            index++;
        }

        return { name: match[1].trim(), body: text.slice(start, index - 1) };
    });
}

let failures = 0;

function check(name, run) {
    try {
        run();
        console.log(`  ok    ${name}`);
    } catch (error) {
        failures++;
        console.log(`  FAIL  ${name}\n        ${error.message.split("\n")[0]}`);
    }
}

console.log("\n  Wartung");

check("Rechtstexte: die vier Seiten, mit und ohne Schrägstrich", () => {
    assert.deepEqual([...LEGAL_PATHS], ["/impressum", "/datenschutz", "/agb", "/widerruf"]);
    for (const path of ["/impressum", "/impressum/", "/datenschutz", "/agb", "/widerruf/"]) assert.equal(isLegalPath(path), true, path);
    for (const path of ["/impressum-x", "/", "/module", "/preise", "/impressum/mehr"]) assert.equal(isLegalPath(path), false, path);
});

check("Spiegel: Seiten zeigen die Wartungsseite, Rechtstexte und ihr Zubehör gehen durch", () => {
    assert.equal(maintenanceAnswer("/", "GET", "text/html", true), "page");
    assert.equal(maintenanceAnswer("/module", "GET", "text/html", true), "page");
    assert.equal(maintenanceAnswer("/impressum", "GET", "text/html", true), "pass");
    assert.equal(maintenanceAnswer("/assets/a.js", "GET", "*/*", true), "pass");
    assert.equal(maintenanceAnswer("/content/banner.json", "GET", "application/json", true), "pass");
    assert.equal(maintenanceAnswer("/wartung/status.json", "GET", "application/json", true), "pass");
    assert.equal(maintenanceAnswer("/favicon.png", "GET", "image/png", true), "pass");
});

check("Spiegel: vom Shop nur Lesen und der Webhook, sonst der JSON-Satz", () => {
    assert.equal(maintenanceAnswer("/api/shop/state", "GET", "application/json", true), "pass");
    assert.equal(maintenanceAnswer("/api/shop/legal/agb", "GET", "application/json", true), "pass");
    assert.equal(maintenanceAnswer("/api/shop/stripe", "POST", "application/json", true), "pass");
    assert.equal(maintenanceAnswer("/api/shop/state", "POST", "application/json", true), "json");
    assert.equal(maintenanceAnswer("/api/shop/checkout", "POST", "application/json", true), "json");
    assert.equal(maintenanceAnswer("/api/contact", "POST", "application/json", true), "json");
    assert.equal(maintenanceAnswer("/module", "GET", "application/json", true), "json");
});

check("Spiegel: ohne Schalter geht alles durch", () => {
    for (const [path, method, accept] of [["/", "GET", "text/html"], ["/api/contact", "POST", "application/json"], ["/module", "GET", "application/json"]]) {
        assert.equal(maintenanceAnswer(path, method, accept, false), "pass", path);
    }
});

// W-0022: Ein add_header in einer location verdrängt die des Servers - die Spec verlangt die Sicherheits-Header dort noch einmal.
check("nginx: jede location mit eigenen Headern trägt die Sicherheits-Header", () => {
    for (const conf of CONFS) {
        for (const block of locations(conf.text).filter((entry) => /\badd_header\b/.test(entry.body))) {
            for (const header of ["Strict-Transport-Security", "X-Content-Type-Options", "Referrer-Policy", "Content-Security-Policy"]) {
                assert.ok(block.body.includes(`add_header ${header} `), `${conf.name} ${block.name}: ${header} fehlt`);
            }
        }
    }
});

// W-0022: Nach einem Update holt der Browser das neue wartung.js, statt ein altes aus dem Cache zu nehmen.
check("nginx: /wartung/ im Bot-Dashboard fragt nach, ob es Neues gibt", () => {
    const conf = CONFS.find((entry) => entry.name === "dashboard.nexus-emb.de.conf");
    const block = locations(conf.text).find((entry) => entry.name === "^~ /wartung/");

    assert.ok(block, "location ^~ /wartung/ fehlt");
    assert.match(block.body, /\bexpires -1;/);
});

if (failures > 0) {
    console.log(`\n  ${failures} Prüfung(en) fehlgeschlagen.\n`);
    process.exit(1);
}

console.log("\n  Alles in Ordnung.\n");
