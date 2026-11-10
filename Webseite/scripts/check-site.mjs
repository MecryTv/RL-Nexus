/**
 * W-0062: Prüfregeln für Partner, News und Changelog (src/services/Content.ts)
 * und die reine Logik dazu. Läuft mit `npm run check`.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isSiteChangelog, isSiteLive, isSiteNews, isSiteNewsPost, isSitePartners } from "../src/services/Content.ts";

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

// Was Teil 1 lokal wirklich geschrieben hat (Admin Dashboard/data/site), muss durchgehen.
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
