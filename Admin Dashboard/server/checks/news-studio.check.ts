import assert from "node:assert/strict";
import { checkPostInput, type IBlock } from "../../shared/news.ts";
import { announceConfirm, blockAction, blockLabel, freshPost, insertBlock, moveBlock, newBlock, newPost, postInput, postProblem, saveLabel, switchPostKind, templatePost, wrapSelection } from "../../src/news/draft.ts";
import { newsMessage } from "../../src/news/preview.ts";
import { websiteValidators } from "./partner-studio.check.ts";
import { check, section } from "./harness.ts";

const a: IBlock = { type: "heading", text: "A" };
const b: IBlock = { type: "heading", text: "B" };
const c: IBlock = { type: "heading", text: "C" };

/** W-0062 Teil 2: Entwürfe, Bausteine und Vorschau des News-Studios. */
export async function checkNewsStudio(): Promise<void> {
    section("News-Studio (W-0062 Teil 2)");

    await check("Entwurf: neue Beiträge, Kurzmeldungen und Termine sind speicherbar", () => {
        for (const kind of ["beitrag", "kurz", "termin"] as const) {
            const post = newPost(kind);
            const checked = checkPostInput(post);

            assert.ok("input" in checked, `${kind}: ${JSON.stringify(checked)}`);
            assert.equal(post.status, "draft");
            assert.equal(post.announce, false);
        }

        assert.match(newPost("termin").event!.startsAt, /T19:00:00\+0[12]:00$/);
    });

    await check("Entwurf: ein gespeicherter Beitrag wird wieder zum Entwurf, ohne Adresse und Serverfelder", () => {
        const saved = { ...newPost("termin"), id: 7, slug: "turnier", publishedAt: null, authorName: "Mecry", createdAt: "2026-11-10T10:00:00.000Z", updatedAt: "2026-11-10T10:00:00.000Z", announcedAt: null };
        const input = postInput(saved);

        assert.deepEqual(Object.keys(input).sort(), Object.keys(newPost("termin")).sort());
        assert.equal("slug" in input, false);
        assert.deepEqual(input.event, saved.event);
        assert.ok("input" in checkPostInput(input));
    });

    await check("Entwurf: ein Bild ohne Alternativtext lässt sich nicht speichern, ein leerer Bild-Baustein meldet das fehlende Bild", () => {
        const image: IBlock = { type: "image", url: "/content/media/a.png", alt: "", caption: null };

        assert.equal(postProblem({ ...newPost("beitrag"), blocks: [image] }), "Ein Bild braucht einen Alternativtext.");
        assert.equal(postProblem({ ...newPost("beitrag"), blocks: [{ ...image, alt: "Logo" }] }), null);
        assert.equal(postProblem({ ...newPost("beitrag"), blocks: [newBlock("image")] }), "Ein Bild-Baustein hat kein Bild.");
    });

    await check("Leiste: „Speichern“ heißt nur so, wenn sich der Stand nicht ändert", () => {
        assert.equal(saveLabel("draft", "draft"), "Speichern");
        assert.equal(saveLabel("published", "published"), "Speichern");
        assert.equal(saveLabel("scheduled", "scheduled"), "Speichern");
        assert.equal(saveLabel("published", "draft"), "Veröffentlichen");
        assert.equal(saveLabel("published", "scheduled"), "Veröffentlichen");
        assert.equal(saveLabel("scheduled", "draft"), "Planen");
        assert.equal(saveLabel("draft", "published"), "Als Entwurf speichern");
    });

    await check("Entwurf: Termin → Beitrag → Termin behält Beginn, Ende und Ort (Review)", () => {
        const event = { startsAt: "2026-11-20T18:00:00.000Z", endsAt: "2026-11-20T21:00:00.000Z", place: "Bühne 1" };
        const termin = { ...newPost("termin"), event };
        const back = switchPostKind(switchPostKind(termin, "beitrag"), "termin", event);

        assert.deepEqual(back.event, event);
        assert.equal(switchPostKind(termin, "beitrag").event, null);
    });

    await check("Editor: ein neuerer Stand vom Server (erschienen, von jemand anderem geändert) wird erkannt (Review)", () => {
        const saved = { ...newPost("beitrag"), id: 3, slug: "a", status: "scheduled" as const, publishAt: "2026-11-12T17:00:00.000Z", publishedAt: null, authorName: "M", createdAt: "2026-11-10T10:00:00.000Z", updatedAt: "2026-11-10T10:00:00.000Z", announcedAt: null };
        const appeared = { ...saved, status: "published" as const, publishAt: null, publishedAt: "2026-11-12T17:00:00.000Z", updatedAt: "2026-11-12T17:00:00.000Z" };
        const edited = { ...saved, updatedAt: "2026-11-10T11:00:00.000Z" };

        assert.equal(freshPost(saved, saved), null);
        assert.equal(freshPost(saved, { ...saved }), null);
        assert.equal(freshPost(saved, appeared), appeared);
        assert.equal(freshPost(saved, edited), edited);
        assert.equal(freshPost(edited, saved), null);
        // Die Liste hängt nach dem eigenen Speichern noch hinterher: kein neuerer Stand.
        assert.equal(freshPost(appeared, saved), null);
        assert.equal(freshPost(null, saved), null);
        assert.equal(freshPost(saved, null), null);
    });

    await check("Rückfrage vor der Ankündigung in Discord: beim Veröffentlichen und beim Planen, nicht bei jedem Speichern (Nutzer 11.11.)", () => {
        const later = "2026-11-12T17:00:00.000Z";
        const draft = { ...newPost("beitrag"), announce: true };
        const stored = { ...draft, id: 9, slug: "a", publishedAt: null, authorName: "M", createdAt: later, updatedAt: later, announcedAt: null };
        const planned = { ...stored, status: "scheduled" as const, publishAt: later };

        const now = new Date("2026-11-11T10:00:00.000Z");

        assert.equal(announceConfirm({ ...draft, status: "published" }, null, now), "publish");
        assert.equal(announceConfirm({ ...draft, status: "scheduled", publishAt: later }, null, now), "plan");
        assert.equal(announceConfirm({ ...draft, status: "scheduled", publishAt: later }, stored, now), "plan");
        // Schon geplant und angekündigt wird später: Speichern fragt nicht noch einmal.
        assert.equal(announceConfirm({ ...draft, status: "scheduled", publishAt: later }, planned, now), null);
        // Schon geplant, Ankündigung erst jetzt eingeschaltet: fragen.
        assert.equal(announceConfirm({ ...draft, status: "scheduled", publishAt: later }, { ...planned, announce: false }, now), "plan");
        assert.equal(announceConfirm({ ...draft, announce: false, status: "scheduled", publishAt: later }, null, now), null);
        assert.equal(announceConfirm(draft, null, now), null);
        assert.equal(announceConfirm({ ...draft, status: "published" }, { ...stored, announcedAt: later }, now), null);
        // Geplant für eine Zeit, die schon vorbei ist: erscheint sofort, also wie Veröffentlichen fragen (Review 11.11.).
        assert.equal(announceConfirm({ ...draft, status: "scheduled", publishAt: "2026-11-11T08:00:00.000Z" }, null, now), "publish");
        // Steht schon online, Ankündigung nachträglich an: nur ankündigen (Review 11.11.).
        assert.equal(announceConfirm({ ...draft, status: "published" }, { ...stored, status: "published", announce: false }, now), "announce");
    });

    await check("Entwurf: Bausteine einfügen, verschieben, kopieren, löschen", () => {
        assert.equal(insertBlock([a, b, c], 0, "heading").index, 1);
        assert.equal(insertBlock([a, b, c], 0, "heading").blocks.length, 4);
        assert.equal(insertBlock([], null, "text").index, 0);
        assert.equal(insertBlock([a, b], null, "divider").index, 2);

        const removed = blockAction([a, b, c], 2, "weg");

        assert.deepEqual(removed.blocks, [a, b]);
        assert.equal(removed.selected, 1);
        assert.deepEqual(blockAction([a, b, c], 7, "hoch"), { blocks: [a, b, c], selected: null });

        const copied = blockAction([a, b], 0, "kopie");

        assert.deepEqual(copied.blocks, [a, a, b]);
        assert.notEqual(copied.blocks[1], a);
        assert.equal(copied.selected, 1);
        assert.deepEqual(blockAction([a, b, c], 0, "runter"), { blocks: [b, a, c], selected: 1 });
        assert.deepEqual(blockAction([a, b, c], 0, "hoch"), { blocks: [a, b, c], selected: 0 });
        assert.deepEqual(moveBlock([a, b, c], 0, 2), [b, c, a]);
    });

    await check("Entwurf: Namen der Bausteine im Aufbau", () => {
        assert.equal(blockLabel({ type: "text", md: "Apex Vortex spielt mit drei Teams von Diamant", size: "normal", width: "text" }), "Text · Apex Vortex spielt mit drei …");
        assert.equal(blockLabel({ type: "divider" }), "Trenner");
    });

    await check("Entwurf: Formatleiste schreibt die Markdown-Teilmenge der Webseite", () => {
        assert.deepEqual(wrapSelection("Hallo Welt", 6, 10, "fett"), { text: "Hallo **Welt**", start: 8, end: 12 });
        assert.equal(wrapSelection("Hallo Welt", 6, 10, "kursiv").text, "Hallo *Welt*");
        assert.equal(wrapSelection("Hallo Welt", 6, 10, "link").text, "Hallo [Welt](https://)");
        assert.equal(wrapSelection("eins\nzwei", 0, 9, "liste").text, "- eins\n- zwei");
        assert.equal(wrapSelection("eins\nzwei", 0, 9, "nummern").text, "1. eins\n2. zwei");
    });

    await check("Entwurf: Vorlagen setzen Art und Bausteine, Titel bleibt", () => {
        const post = { ...newPost("beitrag"), title: "Nordliga Season 3" };
        const tournament = templatePost("turnier", post);

        assert.equal(tournament.kind, "termin");
        assert.equal(tournament.category, "turnier");
        assert.equal(tournament.title, "Nordliga Season 3");
        assert.ok("input" in checkPostInput(tournament), JSON.stringify(checkPostInput(tournament)));

        for (const template of ["update", "partner", "wartung"] as const) {
            const next = templatePost(template, post);
            const blocks = next.blocks.filter((block) => block.type !== "partner");

            assert.ok("input" in checkPostInput({ ...next, blocks }), `${template}: ${JSON.stringify(checkPostInput({ ...next, blocks }))}`);
        }
    });

    await check("Vorschau: Entwurf ohne Zeitpunkt bekommt jetzt, besteht die Prüfung der Webseite", async () => {
        const now = new Date("2026-11-10T12:00:00.000Z");
        const input = { ...newPost("beitrag"), title: "Grüne Löwen sind dabei", blocks: [newBlock("text"), newBlock("divider")] };
        const message = newsMessage(input, { id: null, slug: null, publishedAt: null, author: "MecryTv", entries: [], now }, "block:0");

        assert.equal(message.type, "rlnexus:vorschau-news");
        assert.equal(message.post.publishedAt, now.toISOString());
        assert.equal(message.post.slug, "gruene-loewen-sind-dabei");
        assert.equal(message.selected, "block:0");

        const website = await websiteValidators();

        if (!website) {
            console.log("        (Webseite nicht daneben: Prüfung gegen isNewsPreview übersprungen)");
            return;
        }

        assert.ok(website.isNewsPreview(message), "isNewsPreview");
        assert.ok(website.isNewsPreview(newsMessage(newPost("termin"), { id: 3, slug: "termin", publishedAt: "2026-11-01T10:00:00.000Z", author: "MecryTv", entries: [], now }, null)), "Termin");
    });
}
