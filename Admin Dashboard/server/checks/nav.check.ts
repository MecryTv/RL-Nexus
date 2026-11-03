import assert from "node:assert/strict";
import type { IMailBox } from "../../shared/api.ts";
import { legacyAllPath, mailPath, startPath } from "../../src/mail/route.ts";
import { AREAS, areaOf, navEntries, pageOf, visibleAreas } from "../../src/nav/areas.ts";
import type { ISearchHit, ISearchResult, SearchKind } from "../../shared/search.ts";
import { countLabel, fold, nextFilter, pageHits, shownHits, ShiftTap, type INavEntry } from "../../src/nav/search.ts";
import { deletionSteps, dueFrom, dueValid, elapsedShare, remaining } from "../../src/userdata/plan.ts";
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
        // Unter 2 Zeichen fragt niemand den Server: keine „0“, die nach „nichts da“ klingt.
        assert.equal(countLabel("mails", 0, null, false), "");
        assert.equal(countLabel("alles", 2, null, false), "2");
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
            ["start", "bot", "shop", "webseite", "datenschutz", "sicherheit"]
        );

        const developer = visibleAreas("developer");

        assert.equal(developer.at(-1)?.id, "dev");
        assert.equal(developer.at(-1)?.pages.length, 5);

        const entries = navEntries("admin");

        // W-0064: Server-Freigaben kam dazu, W-0057 der Bereich Sicherheit mit drei Seiten.
        assert.equal(entries.length, 21);
        assert.ok(entries.every((hit) => !hit.href.startsWith("/dev")));
    });

    await check("Datenschutz (W-0051): Nutzerdaten und Was bleibt, ein Profil gehört zu Nutzerdaten", () => {
        assert.deepEqual(
            AREAS.find((area) => area.id === "datenschutz")?.pages.map((page) => [page.to, page.label]),
            [
                ["/datenschutz", "Nutzerdaten"],
                ["/datenschutz/loeschungen", "Löschungen"],
                ["/datenschutz/regeln", "Was bleibt"],
            ]
        );
        assert.equal(pageOf("/datenschutz/loeschungen")?.page.label, "Löschungen");
        assert.equal(pageOf("/datenschutz/123456789012345678")?.page.to, "/datenschutz");
        assert.equal(pageOf("/datenschutz/regeln")?.page.to, "/datenschutz/regeln");
    });

    await check("Sicherheit (W-0057): Sperren, Verdacht, VPN-Prüfung, das Profil einer Sperre gehört zu Sperren", () => {
        assert.deepEqual(
            AREAS.find((area) => area.id === "sicherheit")?.pages.map((page) => [page.to, page.label]),
            [
                ["/sicherheit", "Sperren"],
                ["/sicherheit/verdacht", "Verdacht"],
                ["/sicherheit/vpn", "VPN-Prüfung"],
            ]
        );
        assert.equal(pageOf("/sicherheit/sperre/12")?.page.to, "/sicherheit");
        assert.equal(pageOf("/sicherheit/verdacht")?.page.label, "Verdacht");
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

    await check("Löschen planen: Frist aus Schnellwahl, eigener Zahl oder Zeitpunkt, 5 Minuten bis 30 Tage", () => {
        const now = Date.UTC(2026, 10, 2, 12, 0);

        assert.equal(dueFrom({ kind: "schnell", minutes: 30 }, now)?.getTime(), now + 30 * 60_000);
        assert.equal(dueFrom({ kind: "eigene", amount: 2, unit: "tage" }, now)?.getTime(), now + 2 * 86_400_000);
        assert.equal(dueFrom({ kind: "eigene", amount: 3, unit: "stunden" }, now)?.getTime(), now + 3 * 3_600_000);
        assert.equal(dueFrom({ kind: "zeitpunkt", value: "kaputt" }, now), null);
        assert.equal(dueFrom({ kind: "eigene", amount: 0, unit: "minuten" }, now)?.getTime(), now);

        assert.equal(dueValid(new Date(now + 4 * 60_000), now), false);
        assert.equal(dueValid(new Date(now + 10 * 60_000), now), true);
        assert.equal(dueValid(new Date(now + 31 * 86_400_000), now), false);
        assert.equal(dueValid(null, now), false);
    });

    await check("Löschungen: Punkte für geplant, DM, Kopie, gelöscht", () => {
        assert.deepEqual(deletionSteps({ state: "geplant", dmState: "zugestellt", copyAt: "2026-11-02T12:00:00.000Z" }), ["ok", "ok", "ok", "todo"]);
        assert.deepEqual(deletionSteps({ state: "angehalten", dmState: "zugestellt", copyAt: null }), ["ok", "ok", "todo", "warn"]);
        assert.deepEqual(deletionSteps({ state: "geplant", dmState: "nicht_zustellbar", copyAt: null }), ["ok", "bad", "todo", "todo"]);
        assert.deepEqual(deletionSteps({ state: "geloescht", dmState: "zugestellt", copyAt: null }), ["ok", "ok", "todo", "ok"]);
        assert.deepEqual(deletionSteps({ state: "abgebrochen", dmState: "zugestellt", copyAt: null }), ["ok", "ok", "todo", "bad"]);
    });

    await check("Löschungen: Restzeit am Ring", () => {
        const now = Date.parse("2026-11-02T20:00:00.000Z");
        const at = (ms: number): string => new Date(now + ms).toISOString();

        assert.equal(remaining(at(27 * 60_000 + 14_000), now), "27:14");
        assert.equal(remaining(at(23 * 3_600_000 + 5 * 60_000), now), "23 Std.");
        assert.equal(remaining(at(3 * 86_400_000), now), "3 Tage");
        assert.equal(remaining(at(-1000), now), "gleich");
        assert.equal(elapsedShare(at(-30 * 60_000), at(30 * 60_000), now), 0.5);
        assert.equal(elapsedShare(at(-60_000), at(-1000), now), 1);
    });
}
