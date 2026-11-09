import assert from "node:assert/strict";
import { MESSAGE_LIMITS, berlinDay, checkMessage, fillContent, minutesFor, type IMessageContent } from "../../shared/messages.ts";
import { failureKind, messagePayload, renderMessageDm, sendMessageDm } from "../messages/dm.ts";
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
const ADDRESS_PROBLEM = "Im Text dürfen nur Adressen von nexus-emb.de oder discord.com stehen, bei discord.com nur Kanäle des RL-Nexus-Servers.";
const EMOJI_PROBLEM = "Emojis und Flaggen gehen nicht, weder im Bild noch auf Knöpfen.";
const INVISIBLE_PROBLEM = "Die Nachricht enthält unsichtbare Steuerzeichen.";
const FOREIGN_PROBLEM = "Nur lateinische Buchstaben: Zeichen aus anderen Schriften sehen oft gleich aus und täuschen.";
const SENSITIVE_PROBLEM = "Nachrichten dürfen nicht nach Passwort, Token, Zwei-Faktor-Code oder Zahlungsdaten fragen.";

function problemOf(change: Partial<Record<keyof IMessageContent, unknown>>): string | null {
    const result = checkMessage({ ...BASE, ...change }, GUILD);

    return "problem" in result ? result.problem : null;
}

/** Breite und Höhe aus dem Kopf einer PNG-Datei. */
export function pngSize(data: Buffer): { readonly width: number; readonly height: number } {
    assert.deepEqual([...data.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "PNG-Signatur");

    return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

const PERSON = { name: "Mira", avatar: null };
const AT = new Date("2026-11-04T12:00:00Z");

/** Discord nachgestellt: Kanal öffnen klappt, die Nachricht beantwortet answer. Merkt sich, was ankam. */
function fakeDiscord(answer: () => Response | Promise<Response>): { readonly bodies: FormData[]; readonly recipients: string[]; restore(): void } {
    const real = globalThis.fetch;
    const bodies: FormData[] = [];
    const recipients: string[] = [];

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

        if (url.endsWith("/users/@me/channels")) {
            recipients.push((JSON.parse(String(init?.body)) as { recipient_id: string }).recipient_id);

            return new Response(JSON.stringify({ id: "500000000000000001" }), { status: 200, headers: { "Content-Type": "application/json" } });
        }

        if (url.includes("/channels/500000000000000001/messages")) {
            bodies.push(init?.body as FormData);

            return answer();
        }

        // Profil und Bild der Person: Discord kennt sie nicht, dann steht „du“ bzw. der gespeicherte Name da.
        return new Response(JSON.stringify({ code: 10013 }), { status: 404, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;

    return { bodies, recipients, restore: () => (globalThis.fetch = real) };
}

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

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

    await check("Keine Emojis und Flaggen, auch nicht auf Knöpfen; ©, ® und ™ gehen", () => {
        assert.equal(problemOf({ title: "Neu 🎉" }), EMOJI_PROBLEM);
        assert.equal(problemOf({ boxes: [{ label: "", text: "Danke ❤️" }] }), EMOJI_PROBLEM);
        assert.equal(problemOf({ intro: "Grüße aus 🇩🇪" }), EMOJI_PROBLEM);
        assert.equal(problemOf({ buttons: [{ label: "Los 🚀", url: "https://nexus-emb.de" }] }), EMOJI_PROBLEM);
        assert.equal(problemOf({ title: "RL Nexus™ © 2026 ®" }), null);
    });

    await check("Unsichtbare Steuerzeichen und fremde Schriften fallen durch", () => {
        assert.equal(problemOf({ intro: "Pass​wort" }), INVISIBLE_PROBLEM);
        assert.equal(problemOf({ title: "Hallo ‮ed.bme-suxen" }), INVISIBLE_PROBLEM);
        assert.equal(problemOf({ buttons: [{ label: "Los", url: "https://nexus-emb.de/​x" }] }), INVISIBLE_PROBLEM);
        // Kyrillisches „а“ (U+0430) statt „a“, griechisches „ο“ statt „o“.
        assert.equal(problemOf({ intro: "Dein Pаsswort" }), FOREIGN_PROBLEM);
        assert.equal(problemOf({ title: "nexus-emb.de/lοgin" }), FOREIGN_PROBLEM);
        assert.equal(problemOf({ intro: "Grüße, Straße, café, 5 € – „so“ · 50 %" }), null);
    });

    await check("Regeln gelten für die NFKC-Form: Vollbreite Zeichen rutschen nicht durch", () => {
        assert.equal(problemOf({ intro: "Schick dein ｐａｓｓｗｏｒｔ" }), SENSITIVE_PROBLEM);
        assert.equal(problemOf({ intro: "Geh auf evil｡com" }), ADDRESS_PROBLEM);
        // Gespeichert bleibt der Text, wie er kam.
        assert.equal(contentOf({ ...BASE, title: "Neu ＃1" }).title, "Neu ＃1");
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

        for (const intro of ["siehe nexus-emb.de/datenschutz", "z. B. heute", "Version 2.0", "Mehr auf https://status.nexus-emb.de", "Frag auf discord.com nach", `Kanal: discord.com/channels/${GUILD}/123.`, `https://discord.com/channels/${GUILD}`]) {
            assert.equal(problemOf({ intro }), null, intro);
        }

        // discord.com nur ohne Pfad oder mit einem Kanal des RL-Nexus-Servers.
        for (const intro of ["Tritt bei: discord.com/invite/abc", "discord.com/oauth2/authorize?client_id=1", "discord.com/channels/1/2", `discord.com/channels/${GUILD}0/2`, "https://discord.com/login"]) {
            assert.equal(problemOf({ intro }), ADDRESS_PROBLEM, intro);
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

        // Discord nimmt höchstens 80 Zeichen als Beschriftung; ein Emoji im Namen wird nicht zerteilt.
        const long = fillContent({ ...BASE, buttons: [{ label: "{name} {name} {name}", url: "https://nexus-emb.de" }] }, { name: `${"x".repeat(31)}🎮`, date: at });
        const label = long.buttons[0]?.label ?? "";

        assert.ok(label.length <= 80, `${label.length} Zeichen`);
        assert.equal(label, `${"x".repeat(31)}🎮 ${"x".repeat(31)}🎮 ${"x".repeat(12)}`);
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

    await check("Fehlerarten: DMs zu oder Konto weg betrifft nur die Person, Spam-Signal, Störung", () => {
        assert.equal(failureKind(403, 50007), "person");
        assert.equal(failureKind(404, 10013), "person");
        assert.equal(failureKind(400, 50033), "person");
        assert.equal(failureKind(403, 40003), "spam");
        assert.equal(failureKind(403, 20026), "spam");
        assert.equal(failureKind(null, null), "trouble");
        assert.equal(failureKind(429, null), "trouble");
        assert.equal(failureKind(502, null), "trouble");
        // Ungültiges Bot-Token trifft alle, nicht nur diese Person.
        assert.equal(failureKind(401, 0), "trouble");
        // Unbekannte 4xx treffen meist alle: fehlende Rechte, kaputte Nachricht.
        assert.equal(failureKind(403, 50001), "trouble");
        assert.equal(failureKind(400, 50035), "trouble");
        assert.equal(failureKind(403, null), "trouble");
    });

    await check("Bild: PNG, 800 breit, wächst mit dem Text; Alt-Text mit allem, was draufsteht", async () => {
        const short = await renderMessageDm({ ...BASE, boxes: [{ label: "Kurz", text: "Eine Zeile." }] }, { person: PERSON, at: AT, sender: "Joe" });
        const paragraph = `${"Wort ".repeat(40).trim()}\n\n${"Noch mehr Text ".repeat(20).trim()}\n`;
        const text = (paragraph + "x".repeat(600)).slice(0, 600);
        const long = await renderMessageDm(
            { ...BASE, big: { text: "Sa., 8. Nov. · 02:00–03:00 Uhr", note: "Bot, Dashboard und Webseite sind bis zu einer Stunde nicht erreichbar." }, boxes: [1, 2, 3].map((n) => ({ label: `Kachel ${n}`, text })) },
            { person: PERSON, at: AT, sender: "Joe" }
        );

        assert.equal(short.name, "rl-nexus-nachricht.png");
        assert.equal(pngSize(short.data).width, 800);
        assert.equal(pngSize(long.data).width, 800);
        assert.ok(pngSize(long.data).height > pngSize(short.data).height + 600, `${pngSize(long.data).height} gegen ${pngSize(short.data).height}`);

        for (const part of [BASE.title, BASE.intro, "Kurz: Eine Zeile.", "Nachricht vom Team von RL Nexus · 4. November 2026"]) {
            assert.ok(short.alt.includes(part), `Alt-Text ohne „${part}“: ${short.alt}`);
        }

        assert.ok(long.alt.length <= 1024, `Alt-Text ${long.alt.length} Zeichen`);
        assert.ok(long.alt.includes(BASE.title) && long.alt.includes("Sa., 8. Nov. · 02:00–03:00 Uhr") && long.alt.includes("Kachel 1: Wort"));
        assert.ok(long.alt.endsWith("Nachricht vom Team von RL Nexus · 4. November 2026"), "die Fußzeile bleibt, auch wenn der Text gekürzt wird");
        assert.ok(!long.alt.includes("\n"));
    });

    await check("Unterschrieben: Fußzeile mit dem Namen des Absenders", async () => {
        const signed = await renderMessageDm({ ...BASE, signed: true }, { person: PERSON, at: AT, sender: "Joe" });

        assert.ok(signed.alt.includes("Joe vom Team von RL Nexus · 4. November 2026"), signed.alt);
        assert.ok(!signed.alt.includes("Nachricht vom Team"));
    });

    await check("Ein langer Stempel und ein langer Titel passen ins Bild", async () => {
        const wide = await renderMessageDm({ ...BASE, stamp: "WWWWWWWWWWWWWW", title: "W".repeat(80), intro: "Lang ".repeat(32).trim() }, { person: { name: "", avatar: Buffer.from("kein Bild") }, at: AT, sender: "Joe" });

        assert.equal(pngSize(wide.data).width, 800);
    });

    await check("Nachricht: oben das Bild, Link-Knöpfe nur, wenn es welche gibt", () => {
        const image = { name: "rl-nexus-nachricht.png", alt: "Alt" };
        const bare = messagePayload(image, []);

        assert.equal(bare.flags, 1 << 15);
        assert.deepEqual(bare.components, [{ type: 12, items: [{ media: { url: "attachment://rl-nexus-nachricht.png" }, description: "Alt" }] }]);

        const withButtons = messagePayload(image, [
            { label: "Status", url: "https://status.nexus-emb.de" },
            { label: "Kontakt", url: "https://nexus-emb.de/kontakt" },
        ]);

        assert.equal(withButtons.flags, 1 << 15);
        assert.equal(withButtons.components.length, 2);
        assert.deepEqual(withButtons.components[1], {
            type: 1,
            components: [
                { type: 2, style: 5, label: "Status", url: "https://status.nexus-emb.de" },
                { type: 2, style: 5, label: "Kontakt", url: "https://nexus-emb.de/kontakt" },
            ],
        });
    });

    await check("Senden: angekommen null, sonst Grund und Art; Platzhalter mit dem gespeicherten Namen", async () => {
        let answer: () => Response | Promise<Response> = () => json(200, { id: "500000000000000002" });
        const discord = fakeDiscord(() => answer());

        try {
            assert.equal(await sendMessageDm(config, "333333333333333301", BASE, "Joe", AT, "Mira"), null);
            assert.deepEqual(discord.recipients, ["333333333333333301"]);

            const payload = JSON.parse(String(discord.bodies[0]?.get("payload_json"))) as { components: { type: number; items?: { description: string }[]; components?: { url: string }[] }[]; attachments: { filename: string }[] };

            assert.ok(payload.components[0]?.items?.[0]?.description.includes("Hallo Mira, das ändert sich"), "Platzhalter eingesetzt");
            assert.equal(payload.components[1]?.components?.[0]?.url, "https://nexus-emb.de/module");
            assert.deepEqual(payload.attachments, [{ id: 0, filename: "rl-nexus-nachricht.png" }]);
            assert.ok(discord.bodies[0]?.get("files[0]") instanceof Blob);

            answer = () => json(403, { code: 50007 });
            assert.deepEqual(await sendMessageDm(config, "333333333333333301", BASE, "Joe", AT), { reason: "Die Person nimmt keine Direktnachrichten vom Bot an.", kind: "person" });

            answer = () => json(403, { code: 40003 });
            assert.equal((await sendMessageDm(config, "333333333333333301", BASE, "Joe", AT))?.kind, "spam");

            answer = () => json(500, {});
            assert.equal((await sendMessageDm(config, "333333333333333301", BASE, "Joe", AT))?.kind, "trouble");

            answer = () => Promise.reject(new Error("Netz weg"));
            assert.equal((await sendMessageDm(config, "333333333333333301", BASE, "Joe", AT))?.kind, "trouble");
        } finally {
            discord.restore();
        }
    });
}
