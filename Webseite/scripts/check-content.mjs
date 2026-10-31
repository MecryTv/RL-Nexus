/**
 * Prüft die Prüfregeln aus `src/services/Content.ts`.
 *
 *   npm run check
 *
 * Wichtigster Fall: Jeder heutige Inhalt muss durchgehen. Wäre eine Regel zu
 * streng, verwürfe die Seite jeden Stand aus dem Admin Dashboard still und
 * zeigte die eingebauten Daten, ohne dass es jemand merkt.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { bannerState, isBanner, isCategories, isColor, isCommandsContent, isModuleDetail, isModuleList, isPreviewMessage, isSafeLink, isTeam, toBanner, withBuiltIns } from "../src/services/Content.ts";
import { allCategories, categoryOf, setCategories } from "../src/services/categories.ts";
import { navigationFor } from "../src/services/navigation.ts";

const dir = fileURLToPath(new URL("../public/content-default", import.meta.url));
const read = async (file) => JSON.parse(await readFile(join(dir, file), "utf8"));

const meta = await read("meta.json");
const values = { categories: meta.categories.map((entry) => entry.id), statuses: meta.statuses.map((entry) => entry.id) };
const banner = (await read("banner.json")).data;
const team = (await read("team.json")).data;
const modules = (await read("modules.json")).data;
const categories = (await read("categories.json")).data;

let failures = 0;

function check(name, run) {
    try {
        run();
        console.log(`  ok    ${name}`);
    } catch (error) {
        failures++;
        console.log(`  FAIL  ${name}\n        ${error instanceof Error ? error.message : String(error)}`);
    }
}

console.log("\n  Inhalte der Webseite");

check("Banner, Team und Modulliste aus dem Export gehen durch", () => {
    assert.ok(isBanner(banner));
    assert.ok(isTeam(team));
    assert.ok(isModuleList(modules, values));
});

const details = await Promise.all((await readdir(join(dir, "details"))).map(async (file) => [file, (await read(join("details", file))).data]));

check(`Alle ${details.length} Detailtexte gehen durch`, () => {
    for (const [file, detail] of details) assert.ok(isModuleDetail(detail), file);
});

check("Links nur als https-Adresse oder eigener Pfad", () => {
    for (const good of ["https://discord.gg/abc", "/module/teams"]) assert.ok(isSafeLink(good), good);
    for (const bad of ["javascript:alert(1)", "http://nexus-emb.de", "//evil.example", "/\\evil", "data:text/html,x"]) assert.ok(!isSafeLink(bad), bad);

    assert.ok(!isBanner({ enabled: true, kind: "info", title: "", text: "Hallo", link: { href: "javascript:alert(1)", label: "Klick" } }));

    const member = { ...team.members[0], links: [{ label: "x", href: "javascript:alert(1)", icon: "discord" }] };
    assert.ok(!isTeam({ ...team, members: [member] }));
});

check("Farben nur als var(--c-…) oder Mischung daraus, nie mit url()", () => {
    assert.ok(isColor("var(--c-blue)"));
    assert.ok(isColor("color-mix(in srgb, var(--c-red) 60%, var(--c-text))"));
    for (const bad of ["red", "url(https://evil.example/x.png)", "var(--c-blue); background: url(x)", "var(--x-blue)"]) assert.ok(!isColor(bad), bad);
});

check("Unbekannte Kategorie, unbekannter Status und doppelte IDs fallen durch", () => {
    const [first, second] = modules.modules;

    assert.ok(!isModuleList({ modules: [{ ...first, category: "werbung" }] }, values));
    assert.ok(!isModuleList({ modules: [{ ...first, status: "bald" }] }, values));
    assert.ok(!isModuleList({ modules: [first, { ...second, id: first.id }] }, values));
    assert.ok(!isModuleList({ modules: [{ ...first, id: "Großbuchstaben" }] }, values));
});

check("Banner: alte Form geht durch und wird neu, Arten und Zeitpunkte werden geprüft", () => {
    const old = { enabled: true, tone: "warn", text: "Heute offline." };
    assert.ok(isBanner(old));
    assert.deepEqual(toBanner(old), { enabled: true, kind: "stoerung", title: "", text: "Heute offline." });

    const full = { enabled: true, kind: "wartung", title: "Umzug", text: "30 Minuten weg.", showFrom: "2026-10-10T18:00:00.000Z", countdownTo: "2026-10-11T18:00:00.000Z" };
    assert.ok(isBanner(full));
    assert.deepEqual(toBanner(full), full);

    assert.ok(!isBanner({ enabled: true, kind: "party", text: "x" }));
    assert.ok(!isBanner({ enabled: true, kind: "info", text: "x", showFrom: "morgen" }));
    assert.ok(!isBanner({ enabled: true, kind: "info", title: 3, text: "x" }));
});

check("Banner: sichtbar, geplant, abgelaufen", () => {
    const base = { enabled: true, kind: "info", title: "", text: "x" };
    const now = Date.parse("2026-10-10T12:00:00.000Z");

    assert.equal(bannerState({ ...base, enabled: false }, now), "aus");
    assert.equal(bannerState(base, now), "sichtbar");
    assert.equal(bannerState({ ...base, showFrom: "2026-10-10T13:00:00.000Z" }, now), "geplant");
    assert.equal(bannerState({ ...base, showUntil: "2026-10-10T11:00:00.000Z" }, now), "abgelaufen");
});

check("commands.json aus dem Admin Dashboard: gültige Form geht durch, kaputte nicht", () => {
    const good = { updatedAt: "2026-10-10T12:00:00.000Z", modules: { "rl-tracking": [{ path: "rank me", description: "Zeigt deine eigenen Ränge" }] } };

    assert.ok(isCommandsContent(good));
    assert.ok(isCommandsContent({ updatedAt: "x", modules: {} }));
    for (const bad of [null, { modules: {} }, { updatedAt: "x", modules: { "Kein Modul": [] } }, { updatedAt: "x", modules: { lft: [{ path: 3, description: "" }] } }]) {
        assert.ok(!isCommandsContent(bad), JSON.stringify(bad));
    }
});

check("Kategorien: der Export geht durch, die Module passen dazu", () => {
    assert.ok(isCategories(categories));
    assert.equal(categories.categories.length, 6);
    const ids = new Set(categories.categories.map((entry) => entry.id));
    for (const module of modules.modules) assert.ok(ids.has(module.category), module.id);
});

check("Kategorien: Hex oder Farbe der Webseite, höchstens 12, keine doppelten IDs", () => {
    const one = (patch) => ({ categories: [{ id: "wettbewerb", label: "Wettbewerb", color: "#ff4a3d", ...patch }] });

    assert.ok(isCategories(one({})));
    assert.ok(isCategories(one({ color: "var(--c-mod-community)", description: "Ränge und Teams" })));
    for (const bad of [one({ color: "red" }), one({ color: "#ff4a3" }), one({ id: "Kein Muster" }), one({ label: "" }), null, { categories: "x" }]) {
        assert.ok(!isCategories(bad), JSON.stringify(bad));
    }
    assert.ok(!isCategories({ categories: [...one({}).categories, ...one({}).categories] }), "doppelt");
    assert.ok(!isCategories({ categories: Array.from({ length: 13 }, (_, i) => ({ id: `k${i}`, label: `Kat ${i}`, color: "#000000" })) }), "13");
});

check("Kategorien: geladene gelten, Umbenennen zeigt den neuen Namen, Unbekanntes bekommt eine neutrale Farbe", () => {
    const before = allCategories();

    try {
        setCategories([{ id: "competition", label: "Turniere", color: "#123456" }]);
        assert.deepEqual([categoryOf("competition").label, categoryOf("competition").accent], ["Turniere", "#123456"]);
        assert.deepEqual([categoryOf("weg").label, categoryOf("weg").accent], ["weg", "var(--c-text-dim)"]);
        assert.equal(allCategories().length, 1);
    } finally {
        setCategories(before.map((entry) => ({ id: entry.id, label: entry.label, color: entry.accent, description: entry.description })));
    }
});

check("Vorschau-Nachricht aus dem Admin Dashboard: gültige geht durch, kaputte und fremde nicht", () => {
    const statuses = values.statuses;
    const message = { type: "rlnexus:vorschau", view: "kachel", module: modules.modules[0], detail: null, categories: categories.categories, commands: [{ path: "rank me", description: "Zeigt deine Ränge" }] };

    assert.ok(isPreviewMessage(message, statuses));
    assert.ok(isPreviewMessage({ ...message, view: "detail", detail: details[0][1] }, statuses));
    for (const bad of [
        null,
        { ...message, type: "fremd" },
        { ...message, view: "seite" },
        { ...message, module: { ...modules.modules[0], name: 3 } },
        { ...message, detail: { intro: "kein Array" } },
        { ...message, categories: [{ id: "x", label: "X", color: "red" }] },
        { ...message, commands: [{ path: 1 }] },
    ]) {
        assert.ok(!isPreviewMessage(bad, statuses), JSON.stringify(bad)?.slice(0, 80));
    }
});

check("Kaputte Formen fallen durch", () => {
    for (const bad of [null, [], "text", { enabled: "ja", tone: "info", text: "" }]) assert.ok(!isBanner(bad), JSON.stringify(bad));
    assert.ok(!isModuleDetail({ intro: "kein Array" }));
    assert.ok(!isModuleDetail({ intro: [], showcase: "video" }));
    assert.ok(!isTeam({ members: "niemand", openRoles: [] }));
});

check("Feste Module aus dem Standard kommen dazu, wenn die gespeicherte Liste sie nicht kennt", () => {
    const saved = [{ id: "welcome" }, { id: "gallery", builtIn: true }];
    const defaults = [{ id: "welcome" }, { id: "gallery", builtIn: true }, { id: "backups", builtIn: true }, { id: "entfernt" }];

    // "entfernt" ist kein festes Modul: Wer es im Admin Dashboard gelöscht hat, bekommt es nicht zurück.
    assert.deepEqual(
        withBuiltIns(saved, defaults).map((entry) => entry.id),
        ["welcome", "gallery", "backups"]
    );
});

check("Menü: Bei Free Access ohne Preise, bei Paid und ohne Antwort vom Shop mit", () => {
    const paths = (mode) => navigationFor(mode).map((item) => item.to);

    assert.ok(!paths("free").includes("/preise"));
    assert.ok(paths("paid").includes("/preise"));
    assert.deepEqual(paths(null), paths("paid"));
    assert.deepEqual(
        paths("free"),
        paths("paid").filter((path) => path !== "/preise")
    );
});

check("Menü: Solange der Shop noch nicht geantwortet hat, ohne Preise", () => {
    assert.ok(!navigationFor("loading").some((item) => item.to === "/preise"));
    assert.deepEqual(
        navigationFor("loading").map((item) => item.to),
        navigationFor("beta").map((item) => item.to)
    );
});

check("Menü: Bei Beta Access wie bei Free ohne Preise", () => {
    assert.deepEqual(
        navigationFor("beta").map((item) => item.to),
        navigationFor("free").map((item) => item.to)
    );
});

// W-0013: Die Befehle zeigt künftig der Hilfe-Befehl in Discord. Alte Links landen bei den Modulen.
check("Menü: kein „Commands“ mehr im Kopf", () => {
    for (const mode of ["free", "paid", "beta", null, "loading"]) {
        assert.ok(!navigationFor(mode).some((item) => item.to === "/commands"), String(mode));
    }
});

check("Alte Adresse /commands leitet auf die Module weiter", () => {
    const app = readFileSync(fileURLToPath(new URL("../src/App.tsx", import.meta.url)), "utf8");

    assert.match(app, /<Route path="commands" element=\{<Navigate to="\/module" replace \/>\} \/>/);
    assert.ok(!app.includes("CommandsPage"));
});

console.log(failures === 0 ? "\n  Alles in Ordnung.\n" : `\n  ${failures} Prüfung(en) fehlgeschlagen.\n`);
process.exit(failures === 0 ? 0 : 1);
