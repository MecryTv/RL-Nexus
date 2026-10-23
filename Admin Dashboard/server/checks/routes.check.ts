import assert from "node:assert/strict";
import { buildApp } from "../app.ts";
import { closeEvents, listenerCount, publish } from "../events.ts";
import { SESSION_COOKIE, seal } from "../session.ts";
import { USERS } from "./fakes.ts";
import { SECRET, check, config, section } from "./harness.ts";

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

export async function checkRoutes(): Promise<void> {
    section("Verwaltung ohne Datenbank");

    const app = await buildApp(config);
    const cookie = `${SESSION_COOKIE}=${seal({ id: USERS.admin, name: "nutzer1", avatar: null, exp: Math.floor(Date.now() / 1000) + 600 }, SECRET)}`;

    const get = (url: string) => app.inject({ method: "GET", url, headers: { cookie } });
    const write = (method: "PUT" | "POST" | "PATCH" | "DELETE", url: string, payload?: unknown) =>
        app.inject({
            method,
            url,
            headers: { cookie, origin: config.publicUrl, ...(payload === undefined ? {} : { "content-type": "application/json" }) },
            payload: payload === undefined ? undefined : JSON.stringify(payload),
        });
    const contact = (payload: unknown, remoteAddress: string, type = "application/json") =>
        app.inject({
            method: "POST",
            url: "/public/contact",
            headers: { "content-type": type },
            payload: typeof payload === "string" ? payload : JSON.stringify(payload),
            remoteAddress,
        });

    try {
        await check("Discord-Nutzer lassen sich nachschlagen", async () => {
            assert.deepEqual((await get("/api/users/200000000000000003")).json(), { id: "200000000000000003", name: "nutzer3", avatar: null });

            const ghost = await get(`/api/users/${USERS.ghost}`);
            assert.deepEqual([ghost.statusCode, ghost.json()], [404, { error: "Discord kennt keine Person mit dieser ID." }]);

            assert.equal((await get("/api/users/123")).statusCode, 400);
        });

        await check("Ohne Sitzung gibt es keine Verwaltung", async () => {
            for (const url of ["/api/groups", "/api/users/123456789012345678"]) {
                assert.equal((await app.inject({ method: "GET", url })).statusCode, 401, url);
            }
        });

        await check("Schreiben ohne eigenes Origin wird abgelehnt", async () => {
            const response = await app.inject({
                method: "PUT",
                url: "/api/groups/123456789012345678",
                headers: { cookie, "content-type": "application/json" },
                payload: JSON.stringify({ group: "partner" }),
            });
            assert.equal(response.statusCode, 403);
        });

        await check("Falsche Gruppen-Eingaben werden vor der Datenbank abgefangen", async () => {
            const badId = await write("PUT", "/api/groups/123", { group: "partner" });
            assert.deepEqual([badId.statusCode, badId.json()], [400, { error: "Die Discord-ID besteht aus 17 bis 20 Ziffern." }]);

            const badGroup = await write("PUT", "/api/groups/123456789012345678", { group: "developer" });
            assert.deepEqual([badGroup.statusCode, badGroup.json()], [400, { error: "Die Gruppe ist keiner der erlaubten Werte." }]);
        });

        await check("Ohne Datenbank sagen die Gruppen, dass sie fehlt", async () => {
            const groups = await get("/api/groups");
            assert.deepEqual([groups.statusCode, groups.json()], [503, { error: "Die Datenbank ist gerade nicht erreichbar." }]);
            assert.equal((await write("PUT", "/api/groups/123456789012345678", { group: "partner" })).statusCode, 503);
        });

        await check("Meldungen mit javascript:-Link, ohne Titel oder an zu viele IDs werden abgelehnt", async () => {
            const badLink = await write("POST", "/api/notifications", {
                recipients: { ids: ["123456789012345678"] },
                kind: "info",
                title: "Hallo",
                body: "Text",
                link: "javascript:alert(1)",
            });
            assert.deepEqual([badLink.statusCode, badLink.json()], [400, { error: "Der Link muss mit https:// oder mit / beginnen." }]);

            const noTitle = await write("POST", "/api/notifications", { recipients: { ids: ["123456789012345678"] }, kind: "info", title: " ", body: "Text" });
            assert.deepEqual([noTitle.statusCode, noTitle.json()], [400, { error: "Der Titel fehlt." }]);

            const tooMany = await write("POST", "/api/notifications", {
                recipients: { ids: Array.from({ length: 51 }, (_, index) => `1234567890123456${String(index).padStart(2, "0")}`) },
                kind: "info",
                title: "Hallo",
                body: "Text",
            });
            assert.deepEqual([tooMany.statusCode, tooMany.json()], [400, { error: "Höchstens 50 IDs auf einmal." }]);
        });

        await check("Das Kontaktformular nimmt nur JSON und sagt ohne Mailversand Bescheid", async () => {
            assert.equal((await contact("name=x", "10.1.0.1", "application/x-www-form-urlencoded")).statusCode, 415);

            const off = await contact(CONTACT, "10.1.0.2");
            assert.deepEqual([off.statusCode, off.json()], [503, { error: "Das Kontaktformular ist gerade nicht erreichbar. Schreib uns bitte direkt eine Mail." }]);

            const invalid = await contact({ ...CONTACT, email: "", discord: "" }, "10.1.0.3");
            assert.deepEqual(
                [invalid.statusCode, invalid.json()],
                [400, { error: "Trag eine E-Mail-Adresse oder deinen Discord-Namen ein, damit eine Antwort ankommt." }]
            );
        });

        await check("Die Falle meldet Erfolg, auch ohne Datenbank", async () => {
            assert.equal((await contact({ ...CONTACT, website: "spam" }, "10.1.0.4")).statusCode, 204);
        });

        await check("Die Kontakt-Verwaltung gibt es nicht mehr", async () => {
            for (const url of ["/api/contact", "/api/contact/unread", "/api/contact/1"]) assert.equal((await get(url)).statusCode, 404, url);
        });

        await check("Der Ereignisstrom braucht eine Sitzung und meldet, was sich ändert", async () => {
            assert.equal((await app.inject({ method: "GET", url: "/api/events" })).statusCode, 401);

            // Eine echte Verbindung: inject hält einen Strom nicht offen.
            await app.listen({ port: 0, host: "127.0.0.1" });

            const address = app.server.address();
            const port = typeof address === "object" && address !== null ? address.port : 0;
            const controller = new AbortController();

            try {
                const response = await fetch(`http://127.0.0.1:${port}/api/events`, { headers: { cookie }, signal: controller.signal });

                assert.equal(response.status, 200);
                assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);
                assert.equal(response.headers.get("cache-control"), "no-cache, no-transform");

                const reader = response.body!.getReader();
                const read = async (): Promise<string> => new TextDecoder().decode((await reader.read()).value);

                // Zuerst das Hallo, damit der Browser die Verbindung zählt.
                const hello = await read();
                assert.match(hello, /^retry: 5000\nevent: hello\n/);

                // Dann eine echte Marke, ohne Daten darin.
                const seen = new Promise<string>((resolve) => void read().then(resolve));
                publish("mail");
                assert.match(await seen, /^event: mail\ndata: \d+\n\n$/);

                assert.equal(listenerCount(), 1);
            } finally {
                controller.abort();
            }

            // Nach dem Abbruch räumt der close-Handler auf.
            await new Promise((resolve) => setTimeout(resolve, 150));
            assert.equal(listenerCount(), 0);
        });
    } finally {
        closeEvents();
        await app.close();
    }
}
