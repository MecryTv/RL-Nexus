import assert from "node:assert/strict";
import { MESSAGE_LIMITS, berlinDay, checkMessage, fillContent, minutesFor, type IMessageContent } from "../../shared/messages.ts";
import { check, config, section } from "./harness.ts";

const GUILD = config.guildId;

/** Ein gültiger Grundinhalt, von dem jede Prüfung eine Stelle ändert. */
const BASE: IMessageContent = {
    color: "blau",
    stamp: "ÄNDERUNG",
    title: "Änderung bei RL Nexus",
    intro: "Hallo {name}, das ändert sich bei RL Nexus.",
    big: null,
    boxes: [{ label: "Was sich ändert", text: "Ab {datum} gibt es neue Befehle.\nMehr auf nexus-emb.de/module." }],
    buttons: [{ label: "Mehr dazu", url: "https://nexus-emb.de/module" }],
    signed: false,
};

const LINK_PROBLEM = "Knöpfe dürfen nur auf nexus-emb.de oder einen Kanal des RL-Nexus-Servers zeigen.";
const ADDRESS_PROBLEM = "Im Text dürfen nur Adressen von nexus-emb.de oder discord.com stehen.";
const SENSITIVE_PROBLEM = "Nachrichten dürfen nicht nach Passwort, Token, Zwei-Faktor-Code oder Zahlungsdaten fragen.";

function problemOf(change: Partial<Record<keyof IMessageContent, unknown>>): string | null {
    const result = checkMessage({ ...BASE, ...change }, GUILD);

    return "problem" in result ? result.problem : null;
}

function contentOf(value: unknown): IMessageContent {
    const result = checkMessage(value, GUILD);
    if ("problem" in result) assert.fail(result.problem);

    return result.content;
}

/** W-0058: Inhalt einer Nachricht über den Bot, ihre Regeln und Platzhalter. Ohne Datenbank und Discord. */
export async function checkMessages(): Promise<void> {
    section("Nachrichten über den Bot (W-0058)");

    await check("Grundinhalt ist gültig und bleibt, wie er ist", () => {
        assert.deepEqual(contentOf(BASE), BASE);
    });

    await check("Leerzeichen am Rand weg, Zeilenumbrüche nur in Kacheltexten", () => {
        const content = contentOf({ ...BASE, title: "  Neue\nBefehle  ", intro: "Hallo\r\n{name}", boxes: [{ label: " Was ", text: " Zeile eins\r\nZeile zwei " }] });

        assert.equal(content.title, "Neue Befehle");
        assert.equal(content.intro, "Hallo {name}");
        assert.deepEqual(content.boxes, [{ label: "Was", text: "Zeile eins\nZeile zwei" }]);
    });

    await check("Ohne große Zeile und ohne Kachel ist die Nachricht leer", () => {
        assert.match(problemOf({ big: null, boxes: [] }) ?? "", /leer/);
        assert.equal(problemOf({ big: { text: "Sa., 8. Nov.", note: "" }, boxes: [] }), null);
        // Eine große Zeile ohne Text und ohne Notiz gilt als nicht da.
        assert.match(problemOf({ big: { text: " ", note: "" }, boxes: [] }) ?? "", /leer/);
    });

    await check("Pflichtfelder, Farbe und Form", () => {
        assert.ok(problemOf({ title: "  " }));
        assert.ok(problemOf({ stamp: "" }));
        assert.ok(problemOf({ color: "pink" }));
        assert.ok(problemOf({ signed: "ja" }));
        assert.ok(problemOf({ boxes: "keine" }));
        assert.ok(problemOf({ big: { text: "", note: "Nur eine Notiz" } }));
        assert.ok("problem" in checkMessage(null, GUILD));
        assert.ok("problem" in checkMessage("Text", GUILD));
    });

    await check("Jede Grenze knapp drüber nennt die Grenze", () => {
        const long = (count: number): string => "a".repeat(count);
        const box = (change: object) => [{ ...BASE.boxes[0], ...change }];
        const button = (change: object) => [{ ...BASE.buttons[0], ...change }];
        const cases: [Partial<Record<keyof IMessageContent, unknown>>, number][] = [
            [{ stamp: long(MESSAGE_LIMITS.stamp + 1) }, MESSAGE_LIMITS.stamp],
            [{ title: long(MESSAGE_LIMITS.title + 1) }, MESSAGE_LIMITS.title],
            [{ intro: long(MESSAGE_LIMITS.intro + 1) }, MESSAGE_LIMITS.intro],
            [{ big: { text: long(MESSAGE_LIMITS.big + 1), note: "" } }, MESSAGE_LIMITS.big],
            [{ big: { text: "Heute", note: long(MESSAGE_LIMITS.note + 1) } }, MESSAGE_LIMITS.note],
            [{ boxes: [...BASE.boxes, ...BASE.boxes, ...BASE.boxes, ...BASE.boxes] }, MESSAGE_LIMITS.boxes],
            [{ boxes: box({ label: long(MESSAGE_LIMITS.boxLabel + 1) }) }, MESSAGE_LIMITS.boxLabel],
            [{ boxes: box({ text: long(MESSAGE_LIMITS.boxText + 1) }) }, MESSAGE_LIMITS.boxText],
            [{ buttons: [...BASE.buttons, ...BASE.buttons, ...BASE.buttons] }, MESSAGE_LIMITS.buttons],
            [{ buttons: button({ label: long(MESSAGE_LIMITS.buttonLabel + 1) }) }, MESSAGE_LIMITS.buttonLabel],
            [{ buttons: button({ url: `https://nexus-emb.de/${long(MESSAGE_LIMITS.url)}` }) }, MESSAGE_LIMITS.url],
        ];

        for (const [change, limit] of cases) {
            const problem = problemOf(change);

            assert.ok(problem?.includes(String(limit)), `${JSON.stringify(change).slice(0, 60)} → ${problem}`);
        }

        assert.equal(problemOf({ stamp: long(MESSAGE_LIMITS.stamp), title: long(MESSAGE_LIMITS.title), intro: long(MESSAGE_LIMITS.intro) }), null);
        assert.equal(problemOf({ boxes: [...BASE.boxes, ...BASE.boxes, ...BASE.boxes], buttons: [...BASE.buttons, ...BASE.buttons] }), null);
    });

    await check("Platzhalter: nur {name} und {datum}", () => {
        assert.equal(problemOf({ title: "Hallo {nmae}" }), "{nmae} gibt es nicht. Erlaubt: {name}, {datum}.");
        assert.equal(problemOf({ stamp: "{X}" }), "{X} gibt es nicht. Erlaubt: {name}, {datum}.");
        assert.equal(problemOf({ boxes: [{ label: "Am {datum}", text: "Für {name}" }] }), null);
        // Eine einzelne Klammer ist kein Platzhalter.
        assert.equal(problemOf({ intro: "Hallo {name}, alles im Plan :-{" }), null);
    });

    await check("Emojis kann das Bild nicht zeigen", () => {
        assert.equal(problemOf({ title: "Neu 🎉" }), "Emojis kann das Bild nicht zeigen.");
        assert.equal(problemOf({ boxes: [{ label: "", text: "Danke ❤️" }] }), "Emojis kann das Bild nicht zeigen.");
    });

    await check("Knöpfe nur auf nexus-emb.de oder einen Kanal des RL-Nexus-Servers", () => {
        for (const url of ["https://nexus-emb.de/kontakt", "https://status.nexus-emb.de", `https://discord.com/channels/${GUILD}/123`, `https://www.discord.com/channels/${GUILD}/123/456`]) {
            assert.equal(problemOf({ buttons: [{ label: "Los", url }] }), null, url);
        }

        for (const url of [
            "http://nexus-emb.de",
            "https://nexus-emb.de.evil.com",
            "https://evilnexus-emb.de",
            "https://discord.com/oauth2/authorize?client_id=1",
            "https://discord.com/invite/abc",
            "https://discord.com/channels/1/2",
            `https://discord.com/channels/${GUILD}0/2`,
            "https://nexus-emb.de@evil.com",
            "https://user:pass@nexus-emb.de",
            "javascript:alert(1)",
            "kein Link",
        ]) {
            assert.equal(problemOf({ buttons: [{ label: "Los", url }] }), LINK_PROBLEM, url);
        }
    });

    await check("Adressen im Text nur von nexus-emb.de und discord.com", () => {
        assert.equal(problemOf({ intro: "Geh auf nexus-login.xyz" }), ADDRESS_PROBLEM);
        assert.equal(problemOf({ boxes: [{ label: "", text: "Hier: https://bit.ly/x" }] }), ADDRESS_PROBLEM);
        assert.equal(problemOf({ buttons: [{ label: "Auf evil.com", url: "https://nexus-emb.de" }] }), ADDRESS_PROBLEM);

        for (const intro of ["siehe nexus-emb.de/datenschutz", "z. B. heute", "Version 2.0", "Mehr auf https://status.nexus-emb.de", "Frag auf discord.com nach"]) {
            assert.equal(problemOf({ intro }), null, intro);
        }
    });

    await check("Keine Fragen nach Passwort, Token oder Zahlungsdaten, auch nicht in Knöpfen", () => {
        assert.equal(problemOf({ intro: "Schick uns dein Passwort" }), SENSITIVE_PROBLEM);
        assert.equal(problemOf({ boxes: [{ label: "Konto", text: "Deine IBAN bitte" }] }), SENSITIVE_PROBLEM);
        assert.equal(problemOf({ buttons: [{ label: "IBAN eintragen", url: "https://nexus-emb.de/konto" }] }), SENSITIVE_PROBLEM);
        assert.equal(problemOf({ title: "Wir fragen nie nach deinem Token" }), SENSITIVE_PROBLEM);
    });

    await check("Platzhalter einsetzen: überall, ein Name mit {datum}, $& oder $1 bleibt wörtlich", () => {
        const at = new Date("2026-11-04T12:00:00Z");
        const filled = fillContent({ ...BASE, stamp: "{name}", big: { text: "{datum}", note: "für {name}" }, buttons: [{ label: "Hallo {name}", url: "https://nexus-emb.de/{name}" }] }, { name: "Joe", date: at });

        assert.equal(filled.stamp, "Joe");
        assert.equal(filled.intro, "Hallo Joe, das ändert sich bei RL Nexus.");
        assert.deepEqual(filled.big, { text: "4. November 2026", note: "für Joe" });
        assert.equal(filled.boxes[0]?.text, "Ab 4. November 2026 gibt es neue Befehle.\nMehr auf nexus-emb.de/module.");
        assert.equal(filled.buttons[0]?.label, "Hallo Joe");
        // Links bleiben ohne Platzhalter.
        assert.equal(filled.buttons[0]?.url, "https://nexus-emb.de/{name}");

        const tricky = fillContent(BASE, { name: "{datum} $& $1", date: at });

        assert.equal(tricky.intro, "Hallo {datum} $& $1, das ändert sich bei RL Nexus.");
        // Der Inhalt selbst bleibt unverändert.
        assert.equal(BASE.intro, "Hallo {name}, das ändert sich bei RL Nexus.");
    });

    await check("Datum in Berliner Zeit, Minuten zum Senden aufgerundet", () => {
        assert.equal(berlinDay(new Date("2026-11-04T23:30:00Z")), "5. November 2026");
        assert.equal(berlinDay(new Date("2026-11-04T12:00:00Z")), "4. November 2026");
        assert.equal(minutesFor(169), 6);
        assert.equal(minutesFor(30), 1);
        assert.equal(minutesFor(0), 0);
    });
}
