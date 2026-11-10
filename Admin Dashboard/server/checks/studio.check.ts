import assert from "node:assert/strict";
import { History } from "../../src/studio/history.ts";
import { partShortcut, studioShortcut } from "../../src/studio/shortcut.ts";
import { partIndex, readStageMessage } from "../../src/studio/stage.ts";
import { berlinToIso, isoToBerlin, todayBerlin } from "../../src/studio/time.ts";
import { check, section } from "./harness.ts";

/** W-0062 Teil 2: was die Studios ohne Browser rechnen. */
export async function checkStudio(): Promise<void> {
    section("Studio (W-0062 Teil 2)");

    const key = (key: string, more: Partial<{ ctrlKey: boolean; shiftKey: boolean; altKey: boolean; tagName: string }> = {}) => ({
        key,
        ctrlKey: more.ctrlKey ?? false,
        metaKey: false,
        shiftKey: more.shiftKey ?? false,
        altKey: more.altKey ?? false,
        target: { tagName: more.tagName ?? "BODY" },
    });

    await check("Studio: 50 Schritte, Tippen im selben Feld ist ein Schritt", () => {
        const history = new History<{ n: number }>();

        history.remember({ n: 0 }, "a", 0);
        history.remember({ n: 1 }, "a", 100);
        history.remember({ n: 2 }, "b", 2000);
        assert.deepEqual(history.undo({ n: 3 }), { n: 2 });
        assert.deepEqual(history.undo({ n: 2 }), { n: 0 });
        assert.equal(history.canRedo, true);

        for (let i = 0; i < 60; i++) history.remember({ n: i }, `k${i}`, 10_000 + i * 1000);

        assert.equal(history.canRedo, false);

        let steps = 0;

        while (history.undo({ n: -1 })) steps++;

        assert.equal(steps, 50);
    });

    await check("Studio: Kürzel nicht in Textfeldern", () => {
        assert.equal(studioShortcut(key("z", { ctrlKey: true })), "undo");
        assert.equal(studioShortcut(key("z", { ctrlKey: true, shiftKey: true })), "redo");
        assert.equal(studioShortcut(key("y", { ctrlKey: true })), "redo");
        assert.equal(studioShortcut(key("z", { ctrlKey: true, tagName: "TEXTAREA" })), null);
        assert.equal(partShortcut(key("d", { ctrlKey: true, tagName: "DIV" })), "kopie");
        assert.equal(partShortcut(key("Delete")), "weg");
        assert.equal(partShortcut(key("ArrowUp", { altKey: true })), "hoch");
        assert.equal(partShortcut(key("ArrowDown", { altKey: true })), "runter");
        assert.equal(partShortcut(key("Delete", { tagName: "INPUT" })), null);
        assert.equal(partShortcut(key("a")), null);
    });

    await check("Studio: Berliner Zeit mit Versatz", () => {
        assert.equal(berlinToIso("2026-11-12T18:00"), "2026-11-12T18:00:00+01:00");
        assert.equal(berlinToIso("2026-07-01T18:00"), "2026-07-01T18:00:00+02:00");
        assert.equal(new Date(berlinToIso("2026-03-29T02:30")!).toISOString(), "2026-03-29T01:30:00.000Z");
        assert.equal(berlinToIso("kein Datum"), null);
        assert.equal(isoToBerlin("2026-11-12T17:00:00.000Z"), "2026-11-12T18:00");
        assert.equal(isoToBerlin("2026-07-01T16:00:00.000Z"), "2026-07-01T18:00");
        assert.equal(todayBerlin(new Date("2026-11-10T23:30:00Z")), "2026-11-11");
    });

    await check("Studio: Nachrichten der Bühne nur in gültiger Form", () => {
        assert.deepEqual(readStageMessage({ type: "rlnexus:vorschau-wahl", part: "abschnitt:2" }), { kind: "wahl", part: "abschnitt:2" });
        assert.equal(readStageMessage({ type: "rlnexus:vorschau-wahl", part: "block:<img>" }), null);
        assert.equal(readStageMessage({ type: "rlnexus:vorschau-aktion", part: "block:1", action: "sprengen" }), null);
        assert.deepEqual(readStageMessage({ type: "rlnexus:vorschau-aktion", part: "block:1", action: "kopie" }), { kind: "aktion", part: "block:1", action: "kopie" });
        assert.deepEqual(readStageMessage({ type: "rlnexus:vorschau-ungueltig" }), { kind: "ungueltig" });
        assert.deepEqual(readStageMessage({ type: "rlnexus:vorschau-bereit" }), { kind: "bereit" });
        assert.equal(readStageMessage("rlnexus:vorschau-bereit"), null);
        assert.equal(partIndex("block:12", "block"), 12);
        assert.equal(partIndex("kopf", "block"), null);
        assert.equal(partIndex("abschnitt:3", "block"), null);
    });
}
