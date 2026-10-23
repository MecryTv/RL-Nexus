import assert from "node:assert/strict";
import { isTrap, parseContact } from "../contact.ts";
import { DatabaseUnavailable } from "../db.ts";
import { DiscordUnavailable } from "../discord.ts";
import { InvalidInput, PublicError, errorResponse } from "../errors.ts";
import { id, link, oneOf, snowflake, text } from "../validate.ts";
import { isSafeLink } from "../../shared/links.ts";
import { check, section } from "./harness.ts";

const CONTACT = {
    topic: "frage",
    name: "Mecry",
    email: "mecry@example.com",
    discord: "",
    subject: "Wie geht das?",
    message: "Ich finde die Einstellung für die Ränge nicht.",
    context: "",
    website: "",
};

export async function checkInput(): Promise<void> {
    section("Eingaben und Fehler");

    await check("Texte werden getrimmt und an ihren Grenzen gemessen", () => {
        assert.equal(text("  Hallo  ", "Der Titel", { min: 1, max: 10 }), "Hallo");
        assert.equal(text(undefined, "Die Notiz", { max: 10 }), "");
        assert.throws(() => text("", "Der Titel", { min: 1, max: 10 }), /Der Titel fehlt/);
        assert.throws(() => text("ab", "Der Name", { min: 3, max: 10 }), /mindestens 3 Zeichen/);
        assert.throws(() => text("x".repeat(11), "Der Titel", { max: 10 }), /höchstens 10 Zeichen/);
        assert.throws(() => text(42, "Der Titel", { max: 10 }), InvalidInput);
    });

    await check("Discord-IDs, feste Werte und Nachrichten-IDs", () => {
        assert.equal(snowflake("123456789012345678"), "123456789012345678");
        assert.throws(() => snowflake("123"), InvalidInput);
        assert.throws(() => snowflake(42), InvalidInput);
        assert.equal(oneOf("partner", ["administrator", "partner"] as const, "Die Gruppe"), "partner");
        assert.throws(() => oneOf("developer", ["administrator", "partner"] as const, "Die Gruppe"), InvalidInput);
        assert.equal(id("42"), 42);

        for (const bad of ["0", "-1", "1.5", "abc", "99999999999"]) assert.throws(() => id(bad), InvalidInput, bad);
    });

    await check("Links nur als https-Adresse oder eigener Pfad, nie javascript:", () => {
        for (const good of ["https://nexus-emb.de/module", "/guild/123/uebersicht"]) assert.ok(isSafeLink(good), good);

        for (const bad of ["javascript:alert(1)", "JAVASCRIPT:alert(1)", "http://nexus-emb.de", "//evil.example", "/\\evil.example", "data:text/html,x", "nexus-emb.de"]) {
            assert.ok(!isSafeLink(bad), bad);
        }

        assert.equal(link("", "Der Link", 190), null);
        assert.throws(() => link("javascript:alert(1)", "Der Link", 190), /https:\/\/ oder mit \//);
    });

    await check("Das Kontaktformular gilt mit denselben Regeln wie auf der Webseite", () => {
        assert.deepEqual(parseContact(CONTACT), {
            topic: "frage",
            name: "Mecry",
            email: "mecry@example.com",
            discord: null,
            subject: "Wie geht das?",
            message: "Ich finde die Einstellung für die Ränge nicht.",
            context: null,
        });
        assert.throws(() => parseContact({ ...CONTACT, email: "", discord: "" }), /E-Mail-Adresse oder deinen Discord-Namen/);
        assert.throws(() => parseContact({ ...CONTACT, email: "keine-adresse" }), /nicht wie eine E-Mail-Adresse/);
        assert.throws(() => parseContact({ ...CONTACT, topic: "bug", context: "kaputt" }), /Welches Modul/);
        assert.throws(() => parseContact({ ...CONTACT, message: "zu kurz" }), /mindestens 20 Zeichen/);
        assert.throws(() => parseContact({ ...CONTACT, topic: "werbung" }), InvalidInput);
        assert.equal(parseContact({ ...CONTACT, email: "", discord: "@mecrytv" }).discord, "@mecrytv");
    });

    await check("Die Falle erkennt ausgefüllte unsichtbare Felder", () => {
        assert.equal(isTrap(CONTACT), false);
        assert.equal(isTrap({ ...CONTACT, website: "https://spam.example" }), true);
    });

    await check("Jeder Fehler wird zu Status und deutschem Satz, Internes nur ins Log", () => {
        assert.deepEqual(errorResponse(new InvalidInput("Der Titel fehlt.")), { status: 400, message: "Der Titel fehlt.", log: false });
        assert.deepEqual(errorResponse(new PublicError(404, "Weg.")), { status: 404, message: "Weg.", log: false });
        assert.deepEqual(errorResponse(new DatabaseUnavailable()), { status: 503, message: "Die Datenbank ist gerade nicht erreichbar.", log: false });
        assert.deepEqual(errorResponse(new DiscordUnavailable("intern")), { status: 503, message: "Discord antwortet gerade nicht. Versuch es gleich noch einmal.", log: true });
        assert.equal(errorResponse({ code: "ER_NO_SUCH_TABLE" }).status, 503);
        assert.equal(errorResponse({ code: "ECONNREFUSED" }).message, "Die Datenbank ist gerade nicht erreichbar.");
        assert.deepEqual(errorResponse({ statusCode: 429 }), { status: 429, message: "Zu viele Anfragen auf einmal. Warte einen Moment.", log: false });

        const unexpected = errorResponse(new Error("SELECT * FROM geheim"));
        assert.deepEqual([unexpected.status, unexpected.log], [500, true]);
        assert.doesNotMatch(unexpected.message, /geheim/);
    });
}
