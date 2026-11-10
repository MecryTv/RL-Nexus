/**
 * W-0062: Prüfregeln für Partner, News und Changelog (src/services/Content.ts)
 * und die reine Logik dazu. Läuft mit `npm run check`.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isNewsPreview, isPartnerPreview, isSiteChangelog, isSiteLive, isSiteNews, isSiteNewsPost, isSitePartners } from "../src/services/Content.ts";
import { parseMarkdown } from "../src/services/markdown.ts";
import { categoryCounts, isNew, pinned, shares, timeline, upcoming } from "../src/services/news.ts";
import { navigationFor } from "../src/services/navigation.ts";
import { playerOf } from "../src/services/video.ts";
import { versionSummary } from "../src/components/changelog/meta.ts";
import { eventText, newsFilter, wasUpdated } from "../src/components/news/meta.ts";
import { liveFor, offerActive, sectionOf, supporterBlocks } from "../src/components/partners/entry.ts";

const site = JSON.parse(readFileSync(new URL("./fixtures/site.json", import.meta.url), "utf8"));
const clone = (value) => structuredClone(value);

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

console.log("\n  Partner, News und Changelog (W-0062)");

check("Beispieldaten aus Teil 1 gehen durch", () => {
    assert.ok(isSitePartners(site.partners), "partners");
    assert.ok(isSiteLive(site.live), "live");
    assert.ok(isSiteNews(site.news), "news");
    assert.ok(isSiteNewsPost(site.post), "post");
    assert.ok(isSiteChangelog(site.changelog), "changelog");
});

check("Partner: javascript-Link und unbekannte Farbe fallen durch", () => {
    const bad = clone(site.partners);
    bad.entries[0].links.website = "javascript:alert(1)";
    assert.ok(!isSitePartners(bad));

    const color = clone(site.partners);
    color.entries[0].color = "url(x)";
    assert.ok(!isSitePartners(color));
});

check("Partner: Bild nur aus /content/media, Adresse doppelt fällt durch", () => {
    const image = clone(site.partners);
    image.entries[1].logo = "https://evil.example/x.png";
    assert.ok(!isSitePartners(image));

    const twice = clone(site.partners);
    twice.entries[2].slug = "nordhost";
    assert.ok(!isSitePartners(twice));
});

check("Beitrag: Knopf mit http und unbekannter Baustein fallen durch", () => {
    const button = clone(site.post);
    button.blocks.find((block) => block.type === "button").url = "http://example.com";
    assert.ok(!isSiteNewsPost(button));

    const unknown = clone(site.post);
    unknown.blocks.push({ type: "html", html: "<script>alert(1)</script>" });
    assert.ok(!isSiteNewsPost(unknown));

    const blocks = clone(site.post);
    blocks.blocks = "x";
    assert.ok(!isSiteNewsPost(blocks));
});

check("Beitrag: Video nur von YouTube oder Twitch", () => {
    const video = clone(site.post);
    video.blocks.find((block) => block.type === "video").url = "https://example.com/x.mp4";
    assert.ok(!isSiteNewsPost(video));
});

check("Changelog: interne Art und fremder Discord-Link fallen durch", () => {
    const intern = clone(site.changelog);
    intern.versions[0].items[0].kind = "intern";
    assert.ok(!isSiteChangelog(intern));

    const link = clone(site.changelog);
    link.versions[0].discordUrl = "https://evil.example/channels/1/2/3";
    assert.ok(!isSiteChangelog(link));
});

console.log("\n  Zeitstrahl, Neu-Marke und Markdown (W-0062)");

check("Markdown: HTML bleibt Text, javascript-Link wird kein Link", () => {
    const html = parseMarkdown("<script>alert(1)</script> <img src=x onerror=alert(1)>");
    assert.deepEqual(html, [{ kind: "p", inline: [{ kind: "text", text: "<script>alert(1)</script> <img src=x onerror=alert(1)>" }] }]);

    const link = parseMarkdown("[klick](javascript:alert(1))");
    assert.ok(link[0].inline.every((part) => part.kind !== "link"), JSON.stringify(link));
});

check("Markdown: fett, kursiv, Link, Listen und Absätze", () => {
    assert.deepEqual(parseMarkdown("**a** und *b* [Discord](https://discord.gg/x)")[0].inline, [
        { kind: "strong", text: "a" },
        { kind: "text", text: " und " },
        { kind: "em", text: "b" },
        { kind: "text", text: " " },
        { kind: "link", text: "Discord", href: "https://discord.gg/x" },
    ]);
    assert.deepEqual(parseMarkdown("- eins\n- zwei").map((block) => [block.kind, block.items?.length]), [["ul", 2]]);
    assert.deepEqual(parseMarkdown("1. erst\n2. dann").map((block) => block.kind), ["ol"]);
    assert.deepEqual(parseMarkdown("Absatz eins\n\nAbsatz zwei").map((block) => block.kind), ["p", "p"]);
});

check("Zeitstrahl: Beitrag und Version im selben Monat, neueste zuerst, Angeheftetes nicht doppelt", () => {
    const months = timeline(site.news, site.changelog);
    const november = months.find((month) => month.key === "2026-11");

    assert.equal(months[0].key, "2026-11");
    assert.deepEqual(november.entries.map((entry) => entry.kind), ["changelog", "termin"]);
    assert.equal(november.label, "November 2026");
    assert.ok(!months.flatMap((month) => month.entries).some((entry) => entry.slug === "apex-vortex-ist-neuer-partner"));
});

check("Angeheftet: ein großer, kleine dazu", () => {
    assert.equal(pinned(site.news).big?.slug, "apex-vortex-ist-neuer-partner");
    assert.deepEqual(pinned(site.news).small, []);
});

check("Neu-Marke: beim ersten Besuch nichts, danach was nach dem Besuch kam", () => {
    assert.equal(isNew("2026-11-06T10:00:00.000Z", null), false);
    assert.equal(isNew("2026-11-06T10:00:00.000Z", "2026-11-01T00:00:00.000Z"), true);
    assert.equal(isNew("2026-10-06T10:00:00.000Z", "2026-11-01T00:00:00.000Z"), false);
});

check("Demnächst: nur kommende Termine, früheste zuerst", () => {
    assert.deepEqual(upcoming(site.news, new Date("2026-11-10T00:00:00.000Z")).map((post) => post.slug), ["nordliga-season-3"]);
    assert.deepEqual(upcoming(site.news, new Date("2026-12-01T00:00:00.000Z")), []);
});

check("Anteile einer Version und Arten mit Anzahl", () => {
    assert.deepEqual(shares(site.changelog.versions[0]), { neu: 1, verbessert: 1, behoben: 1 });
    assert.equal(categoryCounts(site.news).partner, 1);
    assert.equal(categoryCounts(site.news).wartung, 1);
});

console.log("\n  Menü, Kontakt, Datenschutz und nginx (W-0062)");

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

check("Menü: News, Changelog und Partner/Sponsorings in der festgelegten Reihenfolge", () => {
    assert.deepEqual(navigationFor("free").map((item) => item.to), ["/", "/module", "/news", "/changelog", "/partner", "/team", "/kontakt"]);
    assert.deepEqual(navigationFor("paid").map((item) => item.to), ["/", "/module", "/preise", "/news", "/changelog", "/partner", "/team", "/kontakt"]);
    assert.equal(navigationFor("free").find((item) => item.to === "/partner")?.label, "Partner/Sponsorings");
});

check("Kontakt: Thema Sponsoring und Vorauswahl über ?thema=", () => {
    assert.match(source("../src/domain/enums/ContactTopic.ts"), /Sponsoring\s*=\s*"sponsoring"/);
    assert.match(source("../src/components/sections/ContactForm.tsx"), /thema/);
});

check("Datenschutz nennt den neuen Eintrag im Browser", () => {
    assert.match(source("../src/pages/LegalPage.tsx"), /rlnexus\.news\.besuch/);
});

check("nginx: Vorschau beim Teilen für Bots und RSS unter /news.xml", () => {
    const conf = source("../../Discord%20Bot/nginx/container/website.conf");

    assert.match(conf, /\$rlnexus_og_bot/);
    assert.match(conf, /Discordbot/);
    assert.match(conf, /\/content\/og/);
    assert.match(conf, /location = \/news\.xml/);
});

// Was Teil 1 lokal wirklich geschrieben hat (Admin Dashboard/data/site), muss durchgehen.
check("Video: YouTube und Twitch werden zum Player, alles andere nicht", () => {
    const host = "nexus-emb.de";

    assert.equal(playerOf("https://www.youtube.com/watch?v=dQw4w9WgXcQ", host)?.src, "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    assert.equal(playerOf("https://youtu.be/dQw4w9WgXcQ?t=12", host)?.src, "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    assert.equal(playerOf("https://youtube.com/shorts/abcDEF12345", host)?.service, "YouTube");
    assert.equal(playerOf("https://www.twitch.tv/videos/123456789", host)?.src, "https://player.twitch.tv/?video=123456789&parent=nexus-emb.de&autoplay=false");
    assert.equal(playerOf("https://www.twitch.tv/rlnexus", host)?.src, "https://player.twitch.tv/?channel=rlnexus&parent=nexus-emb.de&autoplay=false");
    assert.equal(playerOf("https://clips.twitch.tv/FunnyClip-abc", host)?.src, "https://clips.twitch.tv/embed?clip=FunnyClip-abc&parent=nexus-emb.de&autoplay=false");
    assert.equal(playerOf("https://www.twitch.tv/rlnexus/clip/FunnyClip-abc", host)?.service, "Twitch");
    assert.equal(playerOf("https://www.youtube.com/watch?v=<script>", host), null);
    assert.equal(playerOf("https://www.youtube.com/@rlnexus", host), null);
    assert.equal(playerOf("https://example.com/watch?v=dQw4w9WgXcQ", host), null);
    assert.equal(playerOf("kein Link", host), null);
});

check("Changelog: Satz zu einer Version mit Zahlen und Bereichen", () => {
    const version = (items) => ({ ...clone(site.changelog.versions[0]), items });
    const item = (kind, area) => ({ kind, area, text: "x" });

    assert.equal(
        versionSummary(version([item("neu", "bot"), item("neu", "admin"), item("verbessert", "dashboard"), item("behoben", "bot")])),
        "4 Änderungen: 2 neue Funktionen, 1 Verbesserung und 1 behobener Fehler für Bot, Admin und Bot-Dashboard."
    );
    assert.equal(versionSummary(version([item("behoben", "webseite"), item("behoben", "webseite")])), "2 Änderungen: 2 behobene Fehler für die Webseite.");
    assert.equal(versionSummary(version([item("neu", "bot")])), "1 Änderung: 1 neue Funktion für den Bot.");
});

check("Vorschau: Partner-Nachricht nur mit gültiger Ansicht, Eintrag und Teil", () => {
    const entry = clone(site.partners.entries[1]);
    const message = { type: "rlnexus:vorschau-partner", view: "gross", entry, live: site.live.servers["apex-vortex"], selected: "abschnitt:0" };

    assert.ok(isPartnerPreview(message), "gültig");
    assert.ok(isPartnerPreview({ ...message, live: null, selected: null, view: "karte" }), "ohne Live und Auswahl");
    assert.ok(!isPartnerPreview({ ...message, view: "x" }), "unbekannte Ansicht");
    assert.ok(!isPartnerPreview({ ...message, selected: "block:<img>" }), "unbekannter Teil");
    assert.ok(!isPartnerPreview({ ...message, entry: { ...entry, links: { website: "javascript:alert(1)" } } }), "javascript-Link");
    assert.ok(!isPartnerPreview({ ...message, type: "rlnexus:vorschau" }), "falscher Typ");
});

check("Vorschau: News-Nachricht lehnt javascript-Knopf ab", () => {
    const message = { type: "rlnexus:vorschau-news", post: clone(site.post), selected: "block:2" };

    assert.ok(isNewsPreview(message), "gültig");
    assert.ok(isNewsPreview({ ...message, selected: "titelbild" }), "Titelbild");
    assert.ok(!isNewsPreview({ ...message, post: { ...message.post, blocks: [{ type: "button", label: "x", url: "javascript:alert(1)" }] } }), "javascript-Knopf");
});

/* --- Abschlussreview Teil 3 ------------------------------------------------ */

check("Review: „Aktualisiert“ erst ab zehn Minuten Abstand zur Veröffentlichung", () => {
    assert.equal(wasUpdated("2026-11-06T10:00:00.000Z", "2026-11-06T10:00:00.412Z"), false);
    assert.equal(wasUpdated("2026-11-06T10:00:00.000Z", "2026-11-06T10:09:00.000Z"), false);
    assert.equal(wasUpdated("2026-11-06T10:00:00.000Z", "2026-11-07T08:00:00.000Z"), true);
});

check("Review: Termin über zwei Tage nennt beide Daten, „Demnächst“ hält laufende Termine", () => {
    assert.equal(eventText({ startsAt: "2026-11-22T18:00:00.000Z", endsAt: "2026-11-23T17:00:00.000Z", place: null }), "22.11.2026, 19:00 Uhr bis 23.11.2026, 18:00 Uhr");
    assert.equal(eventText({ startsAt: "2026-11-22T18:00:00.000Z", endsAt: "2026-11-22T20:00:00.000Z", place: "Discord" }), "22.11.2026, 19:00 bis 21:00 Uhr · Discord");
    assert.equal(eventText({ startsAt: "2026-11-22T18:00:00.000Z", endsAt: null, place: null }), "22.11.2026, 19:00 Uhr");

    const news = clone(site.news);
    news.posts[1].event = { startsAt: "2026-11-09T18:00:00.000Z", endsAt: "2026-11-11T18:00:00.000Z", place: null };
    assert.deepEqual(upcoming(news, new Date("2026-11-10T12:00:00Z")).map((post) => post.slug), ["nordliga-season-3"]);
});

check("Review: unbekanntes ?art= auf /news gilt als „Alle“", () => {
    assert.equal(newsFilter("turnier"), "turnier");
    assert.equal(newsFilter("changelog"), "changelog");
    assert.equal(newsFilter("gibtsnicht"), null);
    assert.equal(newsFilter(null), null);
});

check("Review: ausgeblendete Abschnitte fallen weg, Reihenfolge und Index bleiben", () => {
    const entry = clone(site.partners.entries[2]);
    entry.sections = [
        { type: "intro", visible: true, text: "Hallo" },
        { type: "stats", visible: false, items: [{ label: "Clips", value: "40" }] },
        { type: "tournaments", visible: true },
        { type: "offer", visible: true, code: "CLIP10" },
    ];

    assert.equal(sectionOf(entry, "stats"), undefined);
    assert.equal(sectionOf(entry, "intro")?.text, "Hallo");
    assert.deepEqual(supporterBlocks(entry), [{ type: "intro", index: 0 }, { type: "tournaments", index: 2 }, { type: "offer", index: 3 }]);
});

check("Review: abgelaufenes Angebot verschwindet, gilt bis Ende des Tages in Berlin", () => {
    const now = new Date("2026-11-10T12:00:00Z");

    assert.equal(offerActive({ type: "offer", visible: true, code: "A", until: "2026-11-10" }, now), true);
    assert.equal(offerActive({ type: "offer", visible: true, code: "A", until: "2026-11-09" }, now), false);
    assert.equal(offerActive({ type: "offer", visible: true, code: "A", until: null }, now), true);
    assert.equal(offerActive({ type: "offer", visible: true, code: "A", until: "2026-11-10" }, new Date("2026-11-10T23:30:00Z")), false);
    assert.equal(offerActive(undefined, now), false);
});

check("Review: Live-Daten nur für eigene Schlüssel (Adresse „constructor“)", () => {
    assert.equal(liveFor(site.live, "constructor"), null);
    assert.equal(liveFor(site.live, "apex-vortex")?.members, 1240);
    assert.equal(liveFor(undefined, "apex-vortex"), null);
});

check("Review: Version nur mit internen Änderungen", () => {
    const version = { ...clone(site.changelog.versions[0]), items: [] };

    assert.equal(versionSummary(version), "Diese Version enthält nur interne Änderungen.");
});

check("Vorschau: Antwort auch an ein geöffnetes Fenster, Meldung bei ungültigem Entwurf (Teil 2)", () => {
    const page = readFileSync(new URL("../src/pages/PreviewPage.tsx", import.meta.url), "utf8");

    assert.ok(page.includes("window.opener"), "window.opener");
    assert.ok(page.includes("rlnexus:vorschau-ungueltig"), "vorschau-ungueltig");
});

const live = new URL("../../Admin%20Dashboard/data/site/", import.meta.url);
const stored = (file) => {
    try {
        return JSON.parse(readFileSync(new URL(file, live), "utf8")).data;
    } catch {
        return undefined;
    }
};
const pairs = [["partners.json", isSitePartners], ["partners-live.json", isSiteLive], ["news.json", isSiteNews], ["changelog.json", isSiteChangelog]].filter(([file]) => stored(file) !== undefined);

check(`Lokale Dateien aus dem Admin Dashboard gehen durch (${pairs.length} gefunden)`, () => {
    for (const [file, isValid] of pairs) assert.ok(isValid(stored(file)), file);
});

if (failures > 0) {
    console.log(`\n  ${failures} Prüfung(en) fehlgeschlagen.`);
    process.exit(1);
}

console.log("\n  Alles in Ordnung.");
