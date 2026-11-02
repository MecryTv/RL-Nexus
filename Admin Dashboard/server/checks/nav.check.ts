import assert from "node:assert/strict";
import { AREAS, areaOf, navEntries, pageOf, visibleAreas } from "../../src/nav/areas.ts";
import { fold, searchNav, ShiftTap, type INavEntry } from "../../src/nav/search.ts";
import { check, section } from "./harness.ts";

const entry = (name: string, text: string): INavEntry => ({ href: `/${fold(name)}`, name, icon: "dashboard", area: "Bot", text });

/** Leiste und Suche (W-0053): reine Funktionen in src/nav, ohne DOM. */
export async function checkNav(): Promise<void> {
    section("Leiste und Suche");

    await check("Umlaute und Großschreibung zählen nicht", () => {
        assert.equal(fold("Übersicht"), "ubersicht");
        assert.equal(fold("Größe"), "grosse");
    });

    await check("Treffer am Namen vor Treffern in der Beschreibung, leere Eingabe ohne Treffer", () => {
        const entries = [entry("Status", "Dienste, Störungen und Backups der Nacht"), entry("Beta Access", "Codes für die Beta"), entry("Backups", "Sicherungen je Server")];

        assert.deepEqual(
            searchNav(entries, "back").map((hit) => hit.name),
            ["Backups", "Status"]
        );
        assert.deepEqual(searchNav(entries, "BACK"), searchNav(entries, "back"));
        assert.deepEqual(
            searchNav(entries, "sicherung").map((hit) => hit.name),
            ["Backups"]
        );
        assert.deepEqual(searchNav(entries, ""), []);
        assert.deepEqual(searchNav(entries, "   "), []);
    });

    await check("Nur die rechte Umschalttaste allein, kurz und außerhalb von Feldern öffnet die Suche", () => {
        const tap = new ShiftTap();

        tap.down("ShiftRight", 0, false);
        assert.equal(tap.up("ShiftRight", 200), true);

        tap.down("ShiftRight", 0, false);
        assert.equal(tap.up("ShiftRight", 700), false);

        tap.down("ShiftLeft", 0, false);
        assert.equal(tap.up("ShiftLeft", 100), false);

        tap.down("ShiftRight", 0, false);
        tap.down("KeyA", 50, false);
        assert.equal(tap.up("ShiftRight", 100), false);

        tap.down("ShiftRight", 0, true);
        assert.equal(tap.up("ShiftRight", 100), false);
    });

    await check("Tiefe Adressen gehören zu ihrer Seite und ihrem Bereich", () => {
        assert.equal(pageOf("/")?.page.to, "/");
        assert.equal(pageOf("/post/3/INBOX/12")?.page.to, "/post");
        assert.equal(pageOf("/kontakt/5")?.page.to, "/post");
        assert.equal(pageOf("/backups/123/zurueckladen/9")?.page.to, "/backups");
        assert.equal(areaOf("/backups/123/zurueckladen/9")?.id, "bot");
        assert.equal(pageOf("/webseite/neues-modul")?.page.to, "/webseite/module");
        assert.equal(pageOf("/webseite/module/abc")?.page.to, "/webseite/module");
        assert.equal(pageOf("/dev/datenbank/users")?.page.to, "/dev/datenbank");
        assert.equal(pageOf("/postfach"), null);
        assert.equal(pageOf("/gibts-nicht"), null);
    });

    await check("Ein Admin sieht keinen Bereich Developer, und die Suche findet keine Developer-Seite", () => {
        assert.deepEqual(
            visibleAreas("admin").map((area) => area.id),
            ["start", "bot", "shop", "webseite"]
        );

        const developer = visibleAreas("developer");

        assert.equal(developer.at(-1)?.id, "dev");
        assert.equal(developer.at(-1)?.pages.length, 5);

        const entries = navEntries("admin");

        assert.equal(entries.length, 14);
        assert.ok(entries.every((hit) => !hit.href.startsWith("/dev")));
    });

    await check("Jede Seite hat einen Satz für Seitenkopf und Suche", () => {
        for (const page of AREAS.flatMap((area) => area.pages)) {
            assert.ok(page.description.length > 0 && page.description.length <= 90, page.to);
        }
    });
}
