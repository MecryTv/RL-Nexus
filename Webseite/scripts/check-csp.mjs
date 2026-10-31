/**
 * Prüft, dass die Content-Security-Policy der Seite jedes Skript erlaubt, das
 * direkt in `index.html` steht - und sonst nichts Eingebettetes.
 *
 * Die CSP setzt nginx im Container (`nginx/container/website.conf` im Bot-Repo).
 * Sie erlaubt Skripte nur von der eigenen Adresse, von Stripe und mit Hash: Das
 * Intro-Skript steht inline, damit nie ein Bild ohne seine Entscheidung auf dem
 * Schirm steht. Ändert sich ein Zeichen darin, ändert sich der Hash, und der
 * Browser blockt es. Genau das fängt dieser Check vor dem Hochladen ab.
 *
 *   node scripts/check-csp.mjs
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const html = readFileSync(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");
const conf = fileURLToPath(new URL("../../Discord Bot/nginx/container/website.conf", import.meta.url));

let failures = 0;

function check(name, passed, detail = "") {
    if (!passed) failures++;
    console.log(`  ${passed ? "ok  " : "FAIL"} ${name}${passed || !detail ? "" : `  → ${detail}`}`);
}

console.log("\nCSP der Webseite\n");

// Ausführbare Skripte ohne src: ohne type, JavaScript oder Modul. JSON-LD sind Daten, die blockt die CSP nicht.
const inline = [...html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .filter(([, attributes = ""]) => !/\bsrc\s*=/.test(attributes))
    .filter(([, attributes = ""]) => {
        const type = /\btype\s*=\s*"([^"]*)"/.exec(attributes)?.[1]?.toLowerCase() ?? "";

        return type === "" || type === "module" || type.includes("javascript");
    })
    .map(([, , body]) => `'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`);

check("index.html hat ein Skript direkt im HTML (das Intro)", inline.length > 0);

if (!existsSync(conf)) {
    check("nginx-Vorlage des Containers gefunden", false, `${conf} fehlt – liegt das Bot-Repo neben der Webseite?`);
} else {
    // Die erste CSP der Datei gilt für den Server; die der Wartungsseite steht in ihrer eigenen location.
    const policy = /add_header Content-Security-Policy "([^"]*)"/.exec(readFileSync(conf, "utf8"))?.[1] ?? "";
    const scripts = /(?:^|;)\s*script-src ([^;]*)/.exec(policy)?.[1]?.trim().split(/\s+/) ?? [];

    check("Die CSP sperrt Skripte (script-src)", scripts.length > 0, policy);
    check("…eigene Adresse erlaubt", scripts.includes("'self'"), scripts.join(" "));
    check("…Stripe erlaubt (Zahlungsfeld)", scripts.includes("https://js.stripe.com") && scripts.includes("https://*.js.stripe.com"), scripts.join(" "));
    check("…kein 'unsafe-inline' und kein 'unsafe-eval'", !scripts.includes("'unsafe-inline'") && !scripts.includes("'unsafe-eval'"), scripts.join(" "));

    for (const hash of inline) check(`…Hash des Skripts in index.html steht drin`, scripts.includes(hash), `fehlt: ${hash}`);

    const stale = scripts.filter((entry) => entry.startsWith("'sha256-") && !inline.includes(entry));

    check("…kein alter Hash mehr drin", stale.length === 0, stale.join(" "));
}

console.log(failures ? `\n❌ ${failures} Prüfung(en) fehlgeschlagen.\n` : "\n✅ CSP passt.\n");
process.exit(failures ? 1 : 0);
