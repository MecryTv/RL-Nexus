/**
 * Prüft die Regeln des Wartungsbildschirms aus `src/maintenance/logic.ts`.
 *
 *   npm run check
 *
 * Die Webseite fragt das Admin Dashboard, ob Wartung ist (Plan 23). Was dabei
 * zurückkommt, ist fremde Eingabe: Eine kaputte Antwort darf die Seite nie in
 * die Wartung schicken. Im Zweifel ist sie offen.
 */
import assert from "node:assert/strict";
import { dayClock, etaLine, isExempt, parseMaintenance, progress, stateChanged, whenText } from "../src/maintenance/logic.ts";

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

const state = (changes = {}) => ({ reason: "Wir spielen ein Update ein.", startedAt: "2026-10-24T14:00:00.000Z", endsAt: "2026-10-24T16:00:00.000Z", autoEnd: true, ...changes });
const now = new Date("2026-10-24T15:00:00Z");

console.log("\n  Wartung");

check("Antwort lesen: gültig, keine Wartung, oder unbrauchbar", () => {
    assert.deepEqual(parseMaintenance({ website: state() }), state());
    assert.deepEqual(parseMaintenance({ website: state({ reason: null, endsAt: null, autoEnd: false }) }), state({ reason: null, endsAt: null, autoEnd: false }));
    assert.equal(parseMaintenance({ website: null }), null);

    for (const broken of ["<html>nginx</html>", null, {}, { website: "an" }, { website: { ...state(), startedAt: 5 } }, { website: { ...state(), endsAt: "bald" } }, { website: { ...state(), autoEnd: "ja" } }]) {
        assert.equal(parseMaintenance(broken), undefined, JSON.stringify(broken));
    }
});

check("Rechtstexte und Vorschau bleiben offen, alles andere zeigt die Wartung", () => {
    for (const path of ["/impressum", "/datenschutz", "/agb", "/widerruf", "/vorschau", "/vorschau/wartung", "/impressum/"]) assert.equal(isExempt(path), true, path);
    for (const path of ["/", "/preise", "/kontakt", "/module/teams", "/agbx"]) assert.equal(isExempt(path), false, path);
});

check("Zeitleiste: Anteil zwischen Beginn und Endzeit", () => {
    assert.equal(progress(state(), now), 0.5);
    assert.equal(progress(state({ endsAt: null }), now), null);
    assert.equal(progress(state(), new Date("2026-10-24T17:00:00Z")), 1);
    assert.equal(progress(state(), new Date("2026-10-24T13:00:00Z")), 0);
});

check("Zeile zur Endzeit: voraussichtlich, offen, oder länger als geplant", () => {
    assert.equal(etaLine(state(), now), "Voraussichtlich zurück heute um 18:00 Uhr");
    assert.equal(etaLine(state({ endsAt: null }), now), "Wie lange es dauert, steht noch nicht fest.");
    assert.equal(etaLine(state({ autoEnd: false }), new Date("2026-10-24T17:00:00Z")), "Es dauert etwas länger als geplant.");
});

check("Zeiten in Berliner Zeit, auch über die Zeitumstellung", () => {
    assert.equal(whenText("2026-10-24T16:00:00Z", new Date("2026-10-24T10:00:00Z")), "heute um 18:00 Uhr");
    assert.equal(whenText("2026-10-25T08:00:00Z", new Date("2026-10-24T10:00:00Z")), "morgen um 9:00 Uhr");
    assert.equal(whenText("2026-10-24T21:30:00Z", new Date("2026-10-24T21:00:00Z")), "heute um 23:30 Uhr");
    assert.equal(whenText("2026-10-31T08:00:00Z", new Date("2026-10-24T10:00:00Z")), "am Samstag, 31. Oktober, um 9:00 Uhr");
});

check("Zeitleiste: nur die Uhrzeit, an einem anderen Tag mit Tag davor", () => {
    // Die Wartung lief über Nacht: „Seit 18:05“ allein hieße heute 18:05.
    assert.equal(dayClock("2026-10-24T16:05:00Z", new Date("2026-10-24T10:00:00Z")), "18:05");
    assert.equal(dayClock("2026-10-23T16:05:00Z", new Date("2026-10-24T10:00:00Z")), "gestern 18:05");
    assert.equal(dayClock("2026-10-25T08:00:00Z", new Date("2026-10-24T10:00:00Z")), "morgen 9:00");
    assert.equal(dayClock("2026-10-31T08:00:00Z", new Date("2026-10-24T10:00:00Z")), "31.10. 9:00");
    assert.equal(dayClock("2026-10-20T08:00:00Z", new Date("2026-10-24T10:00:00Z")), "20.10. 10:00");
});

check("Neu laden, wenn die Wartung beginnt oder endet, auch durch das automatische Ende", () => {
    // Verglichen wird mit dem, was gerade zu sehen ist, nicht mit dem alten Stand zur neuen Uhrzeit.
    assert.equal(stateChanged(null, state(), now), true);
    assert.equal(stateChanged(state(), null, now), true);
    assert.equal(stateChanged(state(), state(), new Date("2026-10-24T16:00:00Z")), true);
    assert.equal(stateChanged(state(), state({ reason: "anders" }), now), false);
    assert.equal(stateChanged(null, null, now), false);
});

check("Ohne Antwort nur neu laden, wenn die gezeigte Wartung von selbst vorbei ist", () => {
    assert.equal(stateChanged(state(), undefined, new Date("2026-10-24T16:00:00Z")), true);
    assert.equal(stateChanged(state(), undefined, now), false);
    assert.equal(stateChanged(state({ autoEnd: false }), undefined, new Date("2026-10-24T17:00:00Z")), false);
    assert.equal(stateChanged(null, undefined, now), false);
});

async function checkAsync(name, run) {
    try {
        await run();
        console.log(`  ok    ${name}`);
    } catch (error) {
        failures++;
        console.log(`  FAIL  ${name}\n        ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * watch.ts mit nachgestelltem Browser: einmal fragen wie beim Start, dann
 * einmal wie jede Minute. Gibt zurück, wie lange es jeweils wartet und ob die
 * Seite neu lädt.
 */
async function watching(shown, answer) {
    const seen = { timeouts: [], reloaded: false };
    const timeout = AbortSignal.timeout;
    let poll = () => {};

    globalThis.window = { setInterval: (run) => (poll = run), location: { reload: () => (seen.reloaded = true) } };
    globalThis.document = { visibilityState: "visible", addEventListener() {} };
    globalThis.fetch = async () => {
        if (answer === undefined) throw new Error("Admin Dashboard nicht erreichbar");

        return { ok: true, json: async () => ({ website: answer }) };
    };
    AbortSignal.timeout = (ms) => {
        seen.timeouts.push(ms);

        return timeout(ms);
    };

    try {
        const { fetchMaintenance, watchMaintenance } = await import("../src/maintenance/watch.ts");

        await fetchMaintenance();
        watchMaintenance(shown);
        poll();
        await new Promise((resolve) => setTimeout(resolve, 20));
    } finally {
        AbortSignal.timeout = timeout;
    }

    return seen;
}

const hour = 3_600_000;

await checkAsync("Nachfragen wartet so lange wie das erste Laden", async () => {
    // Sonst lädt eine langsame Antwort die Seite jede Minute neu: Das Nachfragen
    // sieht die Wartung, das erste Laden gibt vorher auf und zeigt die Seite.
    const { timeouts } = await watching(null, null);

    assert.equal(timeouts.length, 2);
    assert.equal(timeouts[0], timeouts[1]);
});

await checkAsync("Admin Dashboard weg, Wartung von selbst vorbei: Seite lädt neu", async () => {
    const over = state({ startedAt: new Date(Date.now() - 2 * hour).toISOString(), endsAt: new Date(Date.now() - 60_000).toISOString() });
    const running = state({ startedAt: new Date(Date.now() - hour).toISOString(), endsAt: new Date(Date.now() + hour).toISOString() });

    assert.equal((await watching(over, undefined)).reloaded, true);
    assert.equal((await watching(running, undefined)).reloaded, false);
    assert.equal((await watching(null, undefined)).reloaded, false);
});

if (failures > 0) {
    console.log(`\n  ${failures} Prüfung(en) fehlgeschlagen.\n`);
    process.exit(1);
}

console.log("\n  Alles in Ordnung.\n");
