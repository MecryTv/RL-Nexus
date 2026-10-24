import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildApp } from "../app.ts";
import { loadConfig } from "../config.ts";
import { query } from "../db.ts";
import { clearFlagFiles, endExpired, importFlagFiles, readMaintenance, setMaintenance } from "../maintenance.ts";
import { SESSION_COOKIE, seal } from "../session.ts";
import { USERS } from "./fakes.ts";
import { ENV, SECRET, check, section } from "./harness.ts";

/**
 * Der Wartungsschalter mit echter Datenbank (Plan 23), aus check-db.ts
 * aufgerufen. Eigener Ordner für die alten Schalter-Dateien. Den Stand der
 * Tabelle merkt sich der Check vorher und stellt ihn danach wieder her: Die
 * Datenbank ist die echte des Entwicklers, die Webseite soll danach nicht in
 * der Wartung stehen.
 */

interface ISavedRow {
    readonly area: string;
    readonly active: number;
    readonly reason: string | null;
    readonly started_at: Date | null;
    readonly started_by: string | null;
    readonly ends_at: Date | null;
    readonly auto_end: number;
}

export async function checkMaintenanceDb(databaseEnv: Readonly<Record<string, string | undefined>>): Promise<void> {
    section("Wartung (Datenbank)");

    const flagsDir = await mkdtemp(path.join(tmpdir(), "rlnexus-wartung-"));
    const config = loadConfig({ ...ENV, ...databaseEnv, FLAGS_DIR: flagsDir }, []);
    const saved = await query<ISavedRow[]>("SELECT area, active, reason, started_at, started_by, ends_at, auto_end FROM site_maintenance");
    const off = { on: false, reason: null, endsAt: null, autoEnd: false };

    try {
        await setMaintenance(config, "website", off, "nutzer1");
        await setMaintenance(config, "dashboard", off, "nutzer1");

        await check("Wartung einschalten: Grund, Endzeit und Haken stehen in der Tabelle", async () => {
            const endsAt = new Date(Date.now() + 3_600_000).toISOString();

            await setMaintenance(config, "website", { on: true, reason: "check:db Update", endsAt, autoEnd: true }, "nutzer1");

            const state = await readMaintenance(config);

            assert.equal(state.dashboard, null);
            assert.equal(state.website?.reason, "check:db Update");
            assert.equal(state.website?.startedBy, "nutzer1");
            assert.equal(state.website?.endsAt, endsAt);
            assert.equal(state.website?.autoEnd, true);
        });

        await check("Ändern einer laufenden Wartung behält Beginn und wer sie eingeschaltet hat", async () => {
            const before = (await readMaintenance(config)).website;

            await setMaintenance(config, "website", { on: true, reason: "anders", endsAt: null, autoEnd: true }, "nutzer2");

            const after = (await readMaintenance(config)).website;

            assert.deepEqual([after?.startedAt, after?.startedBy, after?.reason, after?.endsAt, after?.autoEnd], [before?.startedAt, "nutzer1", "anders", null, false]);
        });

        await check("Endzeit vorbei mit Haken: läuft nicht mehr, Aufräumen schaltet sie aus", async () => {
            await setMaintenance(config, "website", { on: true, reason: null, endsAt: new Date(Date.now() + 60_000).toISOString(), autoEnd: true }, "nutzer1");
            await query("UPDATE site_maintenance SET ends_at = NOW(3) - INTERVAL 1 MINUTE WHERE area = 'website'");

            assert.equal((await readMaintenance(config)).website, null);
            assert.deepEqual(await endExpired(config, new Date()), ["website"]);
            assert.equal((await query<{ active: number }[]>("SELECT active FROM site_maintenance WHERE area = 'website'"))[0]?.active, 0);
            assert.deepEqual(await endExpired(config, new Date()), []);
        });

        await check("Alte Schalter-Datei: Stand wird übernommen, die Datei bleibt", async () => {
            const file = path.join(flagsDir, "wartung-dashboard");

            // Wie direkt nach dem Update: Die Zeile wurde noch nie über die Datenbank geschaltet.
            await query("UPDATE site_maintenance SET active = 0, started_at = NULL, started_by = NULL WHERE area = 'dashboard'");
            await writeFile(file, JSON.stringify({ since: "2026-10-24T10:00:00.000Z", by: "alt" }));
            await importFlagFiles(config);

            const state = (await readMaintenance(config)).dashboard;

            assert.deepEqual([state?.startedAt, state?.startedBy, state?.reason, state?.endsAt], ["2026-10-24T10:00:00.000Z", "alt", null, null]);
            assert.ok(existsSync(file));
        });

        await check("Alte Datei, Wartung lief schon über die Datenbank: kein erneutes Einschalten", async () => {
            // Mit Haken über die Endzeit, während das Admin Dashboard aus war: Die alte Datei liegt noch da.
            await setMaintenance(config, "website", { on: true, reason: "check:db", endsAt: new Date(Date.now() + 60_000).toISOString(), autoEnd: true }, "nutzer1");
            await query("UPDATE site_maintenance SET ends_at = NOW(3) - INTERVAL 1 MINUTE WHERE area = 'website'");
            await writeFile(path.join(flagsDir, "wartung-webseite"), JSON.stringify({ since: "2026-10-24T10:00:00.000Z", by: "alt" }));

            await importFlagFiles(config);

            assert.equal((await readMaintenance(config)).website, null);
        });

        await check("Alte Dateien: nur noch gelöscht, nie neu angelegt", async () => {
            await setMaintenance(config, "website", { on: true, reason: null, endsAt: null, autoEnd: false }, "nutzer1");
            await rm(path.join(flagsDir, "wartung-webseite"), { force: true });
            await clearFlagFiles(config, await readMaintenance(config));

            // Läuft: Eine neue Wartung legt keine Datei an, die alten nginx-Regeln greifen nicht mehr.
            assert.ok(!existsSync(path.join(flagsDir, "wartung-webseite")));
            // Die übernommene Wartung im Bot-Dashboard läuft noch: ihre Datei bleibt.
            assert.ok(existsSync(path.join(flagsDir, "wartung-dashboard")));

            await setMaintenance(config, "website", off, "nutzer1");
            await setMaintenance(config, "dashboard", off, "nutzer1");
            await clearFlagFiles(config, await readMaintenance(config));

            assert.ok(!existsSync(path.join(flagsDir, "wartung-dashboard")));
        });

        // Die Schnittstellen über eine eigene App mit dem eigenen Ordner.
        const app = await buildApp(config);
        const cookie = `${SESSION_COOKIE}=${seal({ id: USERS.developer, name: "nutzer2", avatar: null, exp: Math.floor(Date.now() / 1000) + 600 }, SECRET)}`;
        const put = (payload: unknown) =>
            app.inject({ method: "PUT", url: "/api/maintenance", headers: { cookie, origin: config.publicUrl, "content-type": "application/json" }, payload: JSON.stringify(payload) });
        const site = { origin: config.websitePublicUrl, "content-type": "application/json" };

        try {
            await check("Wartung schalten: Ablehnungen mit Satz", async () => {
                const reject = async (payload: unknown, sentence: string) => {
                    const answer = await put(payload);

                    assert.deepEqual([answer.statusCode, answer.json().error], [400, sentence]);
                };

                await reject({ on: true }, "Sag, welcher Bereich in die Wartung soll: website oder dashboard.");
                await reject({ area: "website", on: true, reason: "x".repeat(201) }, "Der Grund darf höchstens 200 Zeichen haben.");
                await reject({ area: "website", on: true, endsAt: "bald" }, "Die Endzeit ist kein gültiger Zeitpunkt.");
                await reject({ area: "website", on: true, endsAt: new Date(Date.now() - 60_000).toISOString() }, "Die Endzeit liegt in der Vergangenheit.");
                // Ein Tippfehler im Jahr (2062 statt 2026) hielte die Seite sonst jahrelang zu.
                await reject({ area: "website", on: true, endsAt: new Date(Date.now() + 31 * 86_400_000).toISOString() }, "Die Endzeit liegt mehr als 30 Tage in der Zukunft. Stimmt das Datum?");
            });

            await check("Wartung der Webseite: öffentlich mit Grund und Endzeit, ohne Namen", async () => {
                const endsAt = new Date(Date.now() + 3_600_000).toISOString();
                const answer = await put({ area: "website", on: true, reason: "check:db Update", endsAt, autoEnd: true });

                assert.equal(answer.statusCode, 200, answer.body);
                assert.equal(answer.json().website.startedBy, "nutzer2");

                const open = await app.inject({ method: "GET", url: "/public/maintenance" });

                assert.equal(open.headers["cache-control"], "no-store");
                assert.deepEqual(Object.keys(open.json().website).sort(), ["autoEnd", "endsAt", "reason", "startedAt"]);
                assert.deepEqual([open.json().website.reason, open.json().website.endsAt, open.json().website.autoEnd], ["check:db Update", endsAt, true]);
                assert.doesNotMatch(open.body, /nutzer2/);
                // Eine neue Wartung legt keine alte Datei an.
                assert.ok(!existsSync(path.join(flagsDir, "wartung-webseite")));
            });

            await check("Wartung der Webseite: Kontaktformular und Shop nehmen nichts an, der Stripe-Webhook schon", async () => {
                const closed = { error: "Gerade ist Wartung. Versuch es in ein paar Minuten noch einmal." };
                const contact = await app.inject({ method: "POST", url: "/public/contact", headers: site, payload: JSON.stringify({ name: "x", email: "x@example.com", subject: "x", message: "x".repeat(30) }) });
                const checkout = await app.inject({ method: "POST", url: "/public/shop/checkout", headers: site, payload: JSON.stringify({ productId: 1 }) });
                const login = await app.inject({ method: "GET", url: "/public/shop/login" });
                const stripe = await app.inject({ method: "POST", url: "/public/shop/stripe", headers: { "content-type": "application/json" }, payload: "{}" });
                const state = await app.inject({ method: "GET", url: "/public/shop/state" });

                assert.deepEqual([contact.statusCode, contact.json()], [503, closed]);
                assert.deepEqual([checkout.statusCode, checkout.json()], [503, closed]);
                // Die Anmeldung ist ein Seitenaufruf im Browser: Sie führt zur Webseite, und die zeigt die Wartung.
                assert.deepEqual([login.statusCode, login.headers.location], [302, `${config.websitePublicUrl.replace(/\/+$/, "")}/`]);
                assert.notDeepEqual(stripe.statusCode === 503 ? stripe.json() : null, closed);
                assert.equal(state.statusCode, 200);
            });

            await check("Übersicht: Lässt sich die Wartung nicht lesen, lädt der Rest trotzdem", async () => {
                await query("RENAME TABLE site_maintenance TO site_maintenance_weg");

                try {
                    const overview = await app.inject({ method: "GET", url: "/api/overview", headers: { cookie } });

                    assert.equal(overview.statusCode, 200, overview.body);
                    assert.deepEqual(overview.json().maintenance, { website: null, dashboard: null });
                } finally {
                    await query("RENAME TABLE site_maintenance_weg TO site_maintenance");
                }
            });

            await check("Wartung nur im Bot-Dashboard: die Webseite bleibt offen", async () => {
                assert.equal((await put({ area: "website", on: false })).statusCode, 200);
                assert.equal((await put({ area: "dashboard", on: true })).statusCode, 200);

                const open = await app.inject({ method: "GET", url: "/public/maintenance" });

                assert.deepEqual(open.json(), { website: null });
                assert.ok(!existsSync(path.join(flagsDir, "wartung-dashboard")));
                assert.equal((await put({ area: "dashboard", on: false })).statusCode, 200);
            });
        } finally {
            await app.close();
        }
    } finally {
        for (const row of saved) {
            await query("UPDATE site_maintenance SET active = ?, reason = ?, started_at = ?, started_by = ?, ends_at = ?, auto_end = ? WHERE area = ?", [
                row.active,
                row.reason,
                row.started_at,
                row.started_by,
                row.ends_at,
                row.auto_end,
                row.area,
            ]);
        }

        await rm(flagsDir, { recursive: true, force: true });
    }
}
