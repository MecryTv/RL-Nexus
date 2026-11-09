import assert from "node:assert/strict";
import { checkVersionInput, filterVersions, parseWorksChangelog, stampKind, type IChangeItem, type IChangelogVersion, type IVersionInput } from "../../shared/changelog.ts";
import { check, section } from "./harness.ts";

/** Eine gültige Version, von der jede Prüfung eine Stelle ändert. */
const BASE: IVersionInput = {
    version: "1.4.0",
    releasedOn: "2026-11-09",
    title: "Einstellungen für alle Module",
    items: [{ kind: "neu", area: "bot", text: "/einstellungen für alle Module", task: "W-0014" }],
};

function problemOf(change: Record<string, unknown>): string | null {
    const result = checkVersionInput({ ...BASE, ...change });

    return "problem" in result ? result.problem : null;
}

const item = (change: Partial<IChangeItem> = {}): IChangeItem => ({ ...BASE.items[0]!, ...change });

function version(id: number, input: Partial<IVersionInput>): IChangelogVersion {
    return { ...BASE, ...input, id, createdName: "check", createdAt: "2026-11-09T12:00:00.000Z", updatedAt: "2026-11-09T12:00:00.000Z", posted: null };
}

/** W-0061: Regeln einer Version, Einfügen aus works, Suche und Filter. Ohne Datenbank und Discord. */
export async function checkChangelog(): Promise<void> {
    section("Changelog (W-0061)");

    await check("Gültige Version bleibt, wie sie ist, Text getrimmt", () => {
        const result = checkVersionInput({ ...BASE, title: "  Einstellungen für alle Module ", items: [item({ text: "  /einstellungen für alle Module  " })] });

        assert.ok("input" in result, JSON.stringify(result));
        assert.deepEqual(result.input, BASE);
    });

    await check("Grenzen nennen den Satz", () => {
        assert.equal(problemOf({ version: "1.4" }), "Die Version braucht die Form 1.4.0.");
        assert.equal(problemOf({ version: "v1.4.0" }), "Die Version braucht die Form 1.4.0.");
        assert.ok(problemOf({ title: "a".repeat(81) })?.includes("80"));
        assert.equal(problemOf({ title: "  " }), "Der Titel fehlt.");
        assert.equal(problemOf({ items: [] }), "Eine Version braucht mindestens eine Änderung.");
        assert.ok(problemOf({ items: Array.from({ length: 31 }, () => item()) })?.includes("30"));
        assert.ok(problemOf({ items: [item({ text: "a".repeat(201) })] })?.includes("200"));
        assert.equal(problemOf({ items: [item({ text: " " })] }), "Der Text einer Änderung fehlt.");
        assert.equal(problemOf({ items: [item({ task: "14" })] }), "Die Aufgabe braucht die Form W-0014.");
        assert.ok(problemOf({ items: [{ ...item(), kind: "x" }] }));
        assert.ok(problemOf({ items: [{ ...item(), area: "x" }] }));
        assert.ok(problemOf({ releasedOn: "9.11.2026" }));
        assert.ok("problem" in checkVersionInput(null));
    });

    await check("Leere Aufgabe wird null", () => {
        const result = checkVersionInput({ ...BASE, items: [item({ task: "" as unknown as null })] });

        assert.ok("input" in result);
        assert.equal(result.input.items[0]?.task, null);
    });

    await check("works-Ausgabe wird zu Zeilen, Fremdes bleibt stehen", () => {
        const text = [
            "## Unveröffentlicht (2026-11-09)",
            "",
            "### Neu",
            "",
            "- Admin Dashboard: Nutzerdaten löschen (W-0051)",
            "- Level System (W-0043)",
            "### Behoben",
            "- Dashboard: live nach dem Einladen (W-0011)",
            "- Bot-Dashboard: Leiste scrollt (W-0055)",
            "### Sonstiges",
            "- Aufräumen (W-0040)",
            "### Verbessert",
            "- Webseite: schnellere Bilder (W-0050)",
            "- Ohne Aufgabe",
            "Hallo",
        ].join("\n");
        const parsed = parseWorksChangelog(text);

        assert.deepEqual(parsed.items, [
            { kind: "neu", area: "admin", text: "Nutzerdaten löschen", task: "W-0051" },
            { kind: "neu", area: "bot", text: "Level System", task: "W-0043" },
            { kind: "behoben", area: "dashboard", text: "live nach dem Einladen", task: "W-0011" },
            { kind: "behoben", area: "dashboard", text: "Leiste scrollt", task: "W-0055" },
            { kind: "intern", area: "bot", text: "Aufräumen", task: "W-0040" },
            { kind: "verbessert", area: "webseite", text: "schnellere Bilder", task: "W-0050" },
            { kind: "verbessert", area: "bot", text: "Ohne Aufgabe", task: null },
        ]);
        assert.equal(parsed.rest, "Hallo");
    });

    await check("Filter: Suche, Art, Bereich, Aufgabe", () => {
        const versions = [
            version(2, { version: "1.4.0", items: [item({ text: "Bot einladen mit Code Grant", task: "W-0069" }), item({ kind: "behoben", area: "admin", text: "Anmeldung", task: "W-0048" })] }),
            version(1, { version: "1.3.0", title: "DMs", items: [item({ kind: "verbessert", area: "dashboard", text: "Neue Leiste", task: "W-0055" })] }),
        ];
        const all = { query: "", kinds: [], areas: [], task: null };
        const rows = (filter: Partial<typeof all>) => filterVersions(versions, { ...all, ...filter }).map((hit) => `${hit.version.version}:${hit.items.map((entry) => entry.text).join("|")}`);

        assert.deepEqual(rows({}), ["1.4.0:Bot einladen mit Code Grant|Anmeldung", "1.3.0:Neue Leiste"]);
        assert.deepEqual(rows({ query: "EINLADEN" }), ["1.4.0:Bot einladen mit Code Grant"]);
        assert.deepEqual(rows({ query: "1.3" }), ["1.3.0:Neue Leiste"]);
        assert.deepEqual(rows({ query: "dms" }), ["1.3.0:Neue Leiste"]);
        assert.deepEqual(rows({ query: "w-0048" }), ["1.4.0:Anmeldung"]);
        assert.deepEqual(rows({ kinds: ["behoben"] }), ["1.4.0:Anmeldung"]);
        assert.deepEqual(rows({ areas: ["dashboard"] }), ["1.3.0:Neue Leiste"]);
        assert.deepEqual(rows({ task: "W-0069" }), ["1.4.0:Bot einladen mit Code Grant"]);
        assert.deepEqual(rows({ query: "gibt es nicht" }), []);
    });

    await check("Stempel nach der Art mit den meisten Zeilen, Gleichstand Neu vor Verbessert vor Behoben", () => {
        assert.equal(stampKind([item(), item(), item({ kind: "behoben" })]), "neu");
        assert.equal(stampKind([item({ kind: "verbessert" }), item({ kind: "behoben" })]), "verbessert");
        assert.equal(stampKind([item({ kind: "behoben" }), item({ kind: "behoben" }), item()]), "behoben");
        assert.equal(stampKind([item({ kind: "intern" })]), null);
    });
}
