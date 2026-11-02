import assert from "node:assert/strict";
import type { IMailBox } from "../../shared/api.ts";
import { legacyAllPath, mailPath, startPath } from "../../src/mail/route.ts";
import { AREAS, areaOf, navEntries, pageOf, visibleAreas } from "../../src/nav/areas.ts";
import type { ISearchHit, ISearchResult, SearchKind } from "../../shared/search.ts";
import { countLabel, fold, nextFilter, pageHits, shownHits, ShiftTap, type INavEntry } from "../../src/nav/search.ts";
import { check, section } from "./harness.ts";

const entry = (name: string, text: string): INavEntry => ({ href: `/${fold(name)}`, name, icon: "dashboard", area: "Bot", text });

const server = { host: "mail.example.test", port: 993 };

/** Ein Postfach mit Posteingang; ohne Posteingang ist es nicht erreichbar. */
const box = (id: number, inbox: { path: string; unread: number } | null): IMailBox => ({
    id,
    address: `box${id}@example.test`,
    label: `Box ${id}`,
    position: id,
    imap: server,
    smtp: server,
    folders: inbox && [{ path: inbox.path, name: "Posteingang", role: "inbox", unread: inbox.unread, total: 10 }],
    error: inbox ? null : "nicht erreichbar",
});

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
            pageHits(entries, "back").map((hit) => hit.title),
            ["Backups", "Status"]
        );
        assert.deepEqual(pageHits(entries, "BACK"), pageHits(entries, "back"));
        assert.deepEqual(
            pageHits(entries, "sicherung").map((hit) => hit.title),
            ["Backups"]
        );
        assert.deepEqual(pageHits(entries, ""), []);
        assert.deepEqual(pageHits(entries, "   "), []);
    });

    await check("Seiten als Treffer: Art Seiten, Ort ist der Bereich, Ziel die Seite", () => {
        const [post] = pageHits(navEntries("admin"), "post");

        assert.deepEqual([post.kind, post.title, post.place, post.href], ["seiten", "Postfach", "Start", "/post"]);
    });

    const hits = (kind: SearchKind, count: number): ISearchHit[] => Array.from({ length: count }, (_, index) => ({ kind, icon: "", title: `${kind} ${index}`, place: "", context: "", href: "", at: null, rank: 0 }));
    const result = (counts: ISearchResult["counts"], capped: SearchKind[] = []): ISearchResult => ({ hits: hits("mails", 30), counts, capped, failed: [] });

    await check("Tab wechselt den Filter ringsum, Umschalt+Tab zurück", () => {
        assert.equal(nextFilter("alles", 1), "seiten");
        assert.equal(nextFilter("seiten", 1), "personen");
        assert.equal(nextFilter("protokoll", 1), "alles");
        assert.equal(nextFilter("alles", -1), "protokoll");
    });

    await check("Zahl am Filter: Punkt beim Laden, 20+ an der Grenze, Seiten sofort", () => {
        assert.equal(countLabel("mails", 0, null, true), "·");
        assert.equal(countLabel("seiten", 2, null, true), "2");
        assert.equal(countLabel("mails", 0, result({ mails: 20 }, ["mails"]), false), "20+");
        assert.equal(countLabel("server", 0, result({ mails: 20 }), false), "0");
        assert.equal(countLabel("alles", 2, result({ mails: 3, personen: 1 }), false), "6");
        assert.equal(countLabel("alles", 2, result({ mails: 20 }, ["mails"]), false), "22+");
        assert.equal(countLabel("alles", 2, null, true), "·");
    });

    await check("Liste: in Alles höchstens 40 gemischt, sonst nur die Art und höchstens 20", () => {
        const pages = hits("seiten", 30);

        assert.equal(shownHits(pages, result({}), "alles").length, 40);
        const mails = shownHits(pages, result({}), "mails");
        assert.equal(mails.length, 20);
        assert.ok(mails.every((hit) => hit.kind === "mails"));
        assert.equal(shownHits(pages, null, "seiten").length, 20);
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

    await check("Gehaltene rechte Umschalttaste öffnet die Suche nicht, auch wenn Windows keydown wiederholt", () => {
        const tap = new ShiftTap();

        tap.down("ShiftRight", 0, false);
        tap.down("ShiftRight", 500, false, true);
        tap.down("ShiftRight", 1500, false, true);
        assert.equal(tap.up("ShiftRight", 1600), false);
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

    await check("Das Postfach öffnet das erste Postfach mit ungelesener Post, ohne Postfach nichts", () => {
        const a = box(1, { path: "INBOX", unread: 0 });
        const b = box(2, { path: "Posteingang", unread: 3 });

        assert.equal(startPath([a, b]), "/post/2/Posteingang");
        assert.equal(startPath([a]), "/post/1/INBOX");
        assert.equal(startPath([box(3, null)]), "/post/3/INBOX");
        assert.equal(startPath([]), null);
    });

    await check("Alte Links auf „Alle Posteingänge“ landen im Posteingang ihres Postfachs", () => {
        const boxes = [box(1, { path: "INBOX", unread: 0 }), box(2, { path: "Posteingang", unread: 3 })];

        assert.equal(legacyAllPath(boxes, 2, 55), "/post/2/Posteingang/55");
        assert.equal(legacyAllPath(boxes, 9, 55), "/post/2/Posteingang");
        assert.equal(legacyAllPath(boxes, null, null), "/post/2/Posteingang");
        assert.equal(legacyAllPath([], 2, 55), "/post");
        assert.equal(mailPath(2, "Sent/Alt", 4), "/post/2/Sent%2FAlt/4");
    });

    await check("Jede Seite hat einen Satz für Seitenkopf und Suche", () => {
        for (const page of AREAS.flatMap((area) => area.pages)) {
            assert.ok(page.description.length > 0 && page.description.length <= 90, page.to);
        }
    });
}
