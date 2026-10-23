import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ICategories, IEnvelope, IModules, ITeam } from "../../shared/content.ts";
import { buildApp } from "../app.ts";
import { loadConfig } from "../config.ts";
import { contentMeta, forgetMeta, readContent, websiteStatus } from "../content.ts";
import { bannerState } from "../../shared/content.ts";
import { bannerOf, parseBanner, parseCategories, parseDetail, parseModules, parseTeam } from "../content-rules.ts";
import { InvalidInput } from "../errors.ts";
import { SESSION_COOKIE, seal } from "../session.ts";
import { USERS, WEBSITE_PUBLIC, fake } from "./fakes.ts";
import { ENV, SECRET, check, section } from "./harness.ts";

export async function checkContent(): Promise<void> {
    section("Inhalte der Webseite");

    const defaults = path.join(WEBSITE_PUBLIC, "content-default");

    if (!existsSync(path.join(defaults, "meta.json"))) {
        await check("Die Standards der Webseite liegen bereit", () => {
            assert.fail(`${defaults} fehlt. Im Webseiten-Ordner einmal npm run export ausführen.`);
        });
        return;
    }

    // Ein eigener, leerer Ordner statt data/site: Die Checks fassen nichts Echtes an.
    const siteDir = await mkdtemp(path.join(tmpdir(), "rlnexus-site-"));
    const config = loadConfig({ ...ENV, SITE_DIR: siteDir }, []);

    forgetMeta();

    const meta = await contentMeta(config);
    const read = async <T>(file: string): Promise<T> => (JSON.parse(await readFile(path.join(defaults, file), "utf8")) as IEnvelope<T>).data;
    const team = await read<ITeam>("team.json");
    const modules = await read<IModules>("modules.json");
    const categories = await read<ICategories>("categories.json");
    const details = await Promise.all((await readdir(path.join(defaults, "details"))).map(async (file) => [file, await read<unknown>(path.join("details", file))] as const));

    const app = await buildApp(config);
    const cookie = `${SESSION_COOKIE}=${seal({ id: USERS.admin, name: "nutzer1", avatar: null, exp: Math.floor(Date.now() / 1000) + 600 }, SECRET)}`;
    const get = (url: string) => app.inject({ method: "GET", url, headers: { cookie } });
    const write = (method: "PUT" | "DELETE", url: string, payload?: unknown) =>
        app.inject({
            method,
            url,
            headers: { cookie, origin: config.publicUrl, ...(payload === undefined ? {} : { "content-type": "application/json" }) },
            payload: payload === undefined ? undefined : JSON.stringify(payload),
        });

    try {
        await check(`Alle heutigen Inhalte gehen durch und bleiben, wie sie sind (${details.length} Detailtexte)`, async () => {
            assert.deepEqual(parseBanner(await read("banner.json")), await read("banner.json"));
            assert.deepEqual(parseTeam(team, meta), team);
            assert.deepEqual(parseModules(modules, meta), modules);

            for (const [file, detail] of details) assert.deepEqual(parseDetail(detail, meta), detail, file);
        });

        await check("Kategorien: der Startstand geht durch, Grenzen, Farben und IDs werden geprüft", () => {
            const fresh = { modules: { modules: [] }, previous: [] };
            const one = (patch: Record<string, unknown>) => ({ categories: [{ id: "turniere", label: "Turniere", color: "#ff4a3d", ...patch }] });

            assert.deepEqual(parseCategories(categories, meta, { modules, previous: categories.categories }), categories);
            assert.equal(parseCategories(one({ color: "#FF4A3D" }), meta, fresh).categories[0].color, "#ff4a3d");
            assert.equal(parseCategories(one({ color: "var(--c-mod-community)" }), meta, fresh).categories[0].color, "var(--c-mod-community)");

            assert.throws(() => parseCategories(one({ color: "red" }), meta, fresh), /keine Farbe/);
            assert.throws(() => parseCategories(one({ color: "var(--c-gibtsnicht)" }), meta, fresh), /keine Farbe/);
            assert.throws(() => parseCategories(one({ label: "A" }), meta, fresh), /mindestens 2/);
            assert.throws(() => parseCategories(one({ id: "Groß" }), meta, fresh), /Kleinbuchstaben/);
            assert.throws(() => parseCategories({ categories: [...one({}).categories, ...one({}).categories] }, meta, fresh), /zweimal/);
            assert.throws(
                () => parseCategories({ categories: Array.from({ length: 13 }, (_, i) => ({ id: `k${i}`, label: `Kat ${i}`, color: "#000000" })) }, meta, fresh),
                /Höchstens 12 Kategorien/
            );
        });

        await check("Kategorie mit Modulen lässt sich nicht löschen, Umbenennen geht, Module prüfen gegen die Kategorien", () => {
            const count = modules.modules.filter((module) => module.category === "competition").length;
            const without = { categories: categories.categories.filter((entry) => entry.id !== "competition") };
            const renamed = { categories: categories.categories.map((entry) => (entry.id === "competition" ? { ...entry, label: "Turniere" } : entry)) };

            assert.throws(() => parseCategories(without, meta, { modules, previous: categories.categories }), new RegExp(`Wettbewerb hat noch ${count} Module`));
            assert.equal(parseCategories(renamed, meta, { modules, previous: categories.categories }).categories.find((entry) => entry.id === "competition")?.label, "Turniere");
            assert.throws(() => parseModules(modules, meta, ["community"]), /Die Kategorie/);
        });

        await check("Die Oberfläche erfährt, wo die Vorschau der Webseite liegt", async () => {
            const response = await get("/api/content/vorschau");
            assert.deepEqual([response.statusCode, response.json()], [200, { url: `${config.previewUrl}`, origin: new URL(config.previewUrl).origin }]);
        });

        await check("Kategorien speichern über die Route, danach prüfen Module dagegen", async () => {
            const before = (await get("/api/content/categories")).json() as IEnvelope<ICategories>;
            assert.equal(before.data.categories.length, 6);

            const added = { categories: [...before.data.categories, { id: "turniere", label: "Turniere", color: "#00afff" }] };
            const saved = await write("PUT", "/api/content/categories", { revision: before.revision, data: added });
            assert.equal(saved.statusCode, 200, saved.body);

            const current = (await get("/api/content/modules")).json() as IEnvelope<IModules>;
            const moved = { modules: current.data.modules.map((module, index) => (index === 0 ? { ...module, category: "turniere" } : module)) };
            const movedSaved = await write("PUT", "/api/content/modules", { revision: current.revision, data: moved });
            assert.equal(movedSaved.statusCode, 200, movedSaved.body);

            const unknown = { modules: current.data.modules.map((module, index) => (index === 0 ? { ...module, category: "gibtsnicht" } : module)) };
            const refused = await write("PUT", "/api/content/modules", { revision: (movedSaved.json() as IEnvelope<IModules>).revision, data: unknown });
            assert.equal(refused.statusCode, 400);

            // Turniere hat jetzt ein Modul: löschen geht nicht.
            const latest = (await get("/api/content/categories")).json() as IEnvelope<ICategories>;
            const blocked = await write("PUT", "/api/content/categories", { revision: latest.revision, data: before.data });
            assert.deepEqual([blocked.statusCode, blocked.json().error], [400, "Turniere hat noch 1 Module."]);

            await write("DELETE", "/api/content/modules");
            await write("DELETE", "/api/content/categories");
        });

        await check("Fremde Symbole, Farben, Kategorien und IDs fallen durch", () => {
            const [first, second] = modules.modules;
            const member = team.members[0];

            assert.throws(() => parseModules({ modules: [{ ...first, icon: "einhorn" }] }, meta), /kein Symbol der Webseite/);
            assert.throws(() => parseModules({ modules: [{ ...first, category: "werbung" }] }, meta), /Die Kategorie ist keiner/);
            assert.throws(() => parseModules({ modules: [{ ...first, id: "Groß" }] }, meta), /Kleinbuchstaben/);
            assert.throws(() => parseModules({ modules: [first, { ...second, id: first.id }] }, meta), /steht zweimal/);
            assert.throws(() => parseModules({ modules: [{ ...first, commands: ["/rank"] }] }, meta), /kein Command-Name/);
            assert.throws(() => parseTeam({ ...team, members: [{ ...member, accent: "red" }] }, meta), /keine Farbe der Webseite/);
            assert.throws(() => parseTeam({ ...team, members: [{ ...member, accent: "var(--c-gibtsnicht)" }] }, meta), /keine Farbe/);

            const concept = { intro: ["Ein Absatz."], concepts: { title: "T", lead: "L", entries: [{ label: "A", text: "B", color: "url(https://evil.example/x.png)" }] } };
            assert.throws(() => parseDetail(concept, meta), /keine Farbe der Webseite/);
            assert.throws(() => parseDetail({ intro: [] }, meta), /mindestens einen Eintrag/);
            assert.throws(() => parseDetail({ intro: ["x"], showcase: "video" }, meta), InvalidInput);
        });

        await check("Links nur als https-Adresse oder eigener Pfad", () => {
            const member = { ...team.members[0], links: [{ label: "Böse", href: "javascript:alert(1)", icon: "discord" }] };

            assert.throws(() => parseTeam({ ...team, members: [member] }, meta), /https:\/\/ oder mit \//);
            assert.throws(() => parseBanner({ enabled: true, kind: "info", text: "Hallo", link: { href: "javascript:alert(1)", label: "Klick" } }), /https:\/\/ oder mit \//);
            assert.throws(() => parseBanner({ enabled: true, kind: "info", text: "" }), /Der Text fehlt/);
        });

        await check("Banner: alte Form wird übernommen, Zeitfenster und Arten werden geprüft", () => {
            assert.deepEqual(parseBanner({ enabled: true, tone: "warn", text: "Heute offline." }), { enabled: true, kind: "stoerung", title: "", text: "Heute offline." });
            assert.deepEqual(parseBanner({ enabled: false, tone: "info", text: "" }), { enabled: false, kind: "info", title: "", text: "" });

            const times = { showFrom: "2026-10-10T18:00:00.000Z", showUntil: "2026-10-11T20:00:00.000Z", countdownTo: "2026-10-11T18:00:00.000Z" };
            assert.deepEqual(parseBanner({ enabled: true, kind: "wartung", title: " Umzug ", text: "30 Minuten weg.", ...times }), {
                enabled: true,
                kind: "wartung",
                title: "Umzug",
                text: "30 Minuten weg.",
                ...times,
            });

            // Ein Zeitpunkt mit Versatz wird zu UTC, so wie ihn toISOString liefert.
            assert.equal(parseBanner({ enabled: true, kind: "info", text: "x", showFrom: "2026-10-10T20:00:00+02:00" }).showFrom, "2026-10-10T18:00:00.000Z");

            assert.throws(() => parseBanner({ enabled: true, kind: "party", text: "x" }), /Die Art/);
            assert.throws(() => parseBanner({ enabled: true, kind: "info", text: "x", showFrom: "morgen" }), /kein gültiger Zeitpunkt/);
            assert.throws(() => parseBanner({ enabled: true, kind: "info", text: "x", showFrom: times.showUntil, showUntil: times.showFrom }), /muss nach/);
            assert.throws(() => parseBanner({ enabled: true, kind: "info", title: "x".repeat(61), text: "x" }), /Der Titel/);

            assert.equal(bannerOf({ kaputt: true }), null);
            assert.equal(bannerOf({ enabled: true, tone: "info", text: "Hallo" })?.kind, "info");
        });

        await check("Banner: sichtbar, geplant, abgelaufen", () => {
            const base = { enabled: true, kind: "info", title: "", text: "x" } as const;
            const now = Date.parse("2026-10-10T12:00:00.000Z");

            assert.equal(bannerState({ ...base, enabled: false }, now), "aus");
            assert.equal(bannerState(base, now), "sichtbar");
            assert.equal(bannerState({ ...base, showFrom: "2026-10-10T13:00:00.000Z" }, now), "geplant");
            assert.equal(bannerState({ ...base, showUntil: "2026-10-10T11:00:00.000Z" }, now), "abgelaufen");
        });

        await check("Speichern zählt die Revision hoch, ein veralteter Stand gibt 409", async () => {
            const start = (await get("/api/content/banner")).json() as IEnvelope<unknown>;
            assert.equal(start.revision, 0);

            const banner = { enabled: true, kind: "stoerung", title: "", text: "Heute Abend kurz offline." };
            const saved = await write("PUT", "/api/content/banner", { revision: 0, data: banner });
            assert.deepEqual([saved.statusCode, saved.json().revision, saved.json().updatedBy], [200, 1, "nutzer1"]);
            assert.ok(existsSync(path.join(siteDir, "banner.json")));

            const stale = await write("PUT", "/api/content/banner", { revision: 0, data: banner });
            assert.deepEqual([stale.statusCode, stale.json()], [409, { error: "Das hat inzwischen jemand anderes geändert. Lad den aktuellen Stand neu." }]);

            assert.deepEqual((await get("/api/content/banner")).json().data, banner);
        });

        await check("Zurücksetzen löscht die Datei, danach gilt wieder der Stand der Webseite", async () => {
            const reset = await write("DELETE", "/api/content/banner");
            assert.deepEqual([reset.statusCode, reset.json().revision, reset.json().data.enabled], [200, 0, false]);
            assert.ok(!existsSync(path.join(siteDir, "banner.json")));
        });

        await check("Detailtexte: ein neues Modul fängt leer an, die ID ist geprüft", async () => {
            assert.deepEqual((await get("/api/content/details/neues-modul")).json(), { revision: 0, updatedAt: null, updatedBy: null, data: null });

            const saved = await write("PUT", "/api/content/details/neues-modul", { revision: 0, data: { intro: ["Ein erster Absatz."] } });
            assert.deepEqual([saved.statusCode, saved.json().revision], [200, 1]);
            assert.ok(existsSync(path.join(siteDir, "details", "neues-modul.json")));

            assert.equal((await get("/api/content/details/Bad_ID")).statusCode, 400);
            assert.equal((await get("/api/content/details/..%2Fbanner")).statusCode, 400);
            assert.equal((await get("/api/content/gibtsnicht")).statusCode, 404);
        });

        await check("Mit WEBSITE_DIST kommt der Standard von der Platte, auch wenn die Webseite gerade nicht antwortet", async () => {
            // Im Betrieb ist das der dist-Ordner der Webseite, hier tut es ihr public-Ordner nach dem Export.
            const onDisk = loadConfig({ ...ENV, SITE_DIR: siteDir, WEBSITE_DIST: WEBSITE_PUBLIC }, []);

            forgetMeta();
            fake.websiteDown = true;

            try {
                const banner = await readContent(onDisk, "banner.json");
                assert.equal(banner?.revision, 0);
                assert.ok((await contentMeta(onDisk)).icons.length > 0);
                assert.equal(await readContent(onDisk, "details/gibt-es-nicht.json"), null);

                // Ob sie antwortet, fragt der Server trotzdem über HTTP, wie ein Besucher.
                assert.deepEqual(await websiteStatus(onDisk), { online: false, builtAt: null });
            } finally {
                fake.websiteDown = false;
                forgetMeta();
            }

            const up = await websiteStatus(onDisk);
            assert.deepEqual([up.online, typeof up.builtAt], [true, "string"]);
        });

        await check("Ohne Webseite wird nichts gespeichert, und die Übersicht sagt es", async () => {
            const online = (await get("/api/overview")).json().website;
            assert.deepEqual([online.online, typeof online.builtAt, online.banner], [true, "string", "aus"]);

            forgetMeta();
            fake.websiteDown = true;

            try {
                const saved = await write("PUT", "/api/content/team", { revision: 0, data: team });
                assert.deepEqual([saved.statusCode, saved.json()], [503, { error: "Die Webseite antwortet nicht. Ohne sie lässt sich ihr Stand gerade nicht laden." }]);
                assert.deepEqual((await get("/api/overview")).json().website, { online: false, builtAt: null, banner: null });
            } finally {
                fake.websiteDown = false;
                forgetMeta();
            }
        });
    } finally {
        await app.close();
        await rm(siteDir, { recursive: true, force: true });
    }
}
