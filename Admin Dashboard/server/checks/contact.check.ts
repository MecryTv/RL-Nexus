import assert from "node:assert/strict";
import type { Transporter } from "nodemailer";
import { buildApp } from "../app.ts";
import { loadConfig } from "../config.ts";
import { contactMailHtml, setNotifyTransport } from "../notify.ts";
import { ENV, check, section } from "./harness.ts";

const FORM = {
    topic: "frage",
    name: "Mecry <b>",
    email: "mecry@example.com",
    discord: "",
    subject: "Wie geht das?",
    message: "Ich finde die Einstellung für die Ränge nicht.",
    context: "",
    website: "",
};
const SMTP_ENV = { ...ENV, SMTP_HOST: "mail.example.test", SMTP_USER: "bot@example.test", SMTP_PASSWORD: "geheim", CONTACT_MAIL: "support@example.test" };
const HOOK = "https://discord.example.test/api/webhooks/1/check";

/** Das Kontaktformular der Webseite: geht als Mail an support@, gespeichert wird nichts. */
export async function checkContact(): Promise<void> {
    section("Kontaktformular");

    const sent: Record<string, unknown>[] = [];
    let failing = false;

    setNotifyTransport({
        sendMail: async (options: Record<string, unknown>) => {
            if (failing) throw new Error("550 abgelehnt");
            sent.push(options);
            return {};
        },
    } as unknown as Pick<Transporter, "sendMail">);

    const app = await buildApp(loadConfig(SMTP_ENV, []));
    const post = (payload: unknown, remoteAddress: string) =>
        app.inject({ method: "POST", url: "/public/contact", headers: { "content-type": "application/json" }, payload: JSON.stringify(payload), remoteAddress });

    try {
        await check("Formular geht als Mail an support@, Antworten geht an die Person", async () => {
            assert.equal((await post(FORM, "10.3.0.1")).statusCode, 204);
            const mail = sent.at(-1)!;

            assert.deepEqual(mail.from, { name: "RL Nexus Kontaktformular", address: "bot@example.test" });
            assert.equal(mail.to, "support@example.test");
            assert.equal(mail.replyTo, "mecry@example.com");
            assert.equal(mail.subject, "[Kontakt · Frage] Wie geht das?");
            assert.match(String(mail.html), /Mecry &lt;b&gt;/);
            assert.match(String(mail.text), /Ich finde die Einstellung/);
        });

        await check("Nur Discord-Name: kein Reply-To, Hinweis über der Nachricht", async () => {
            assert.equal((await post({ ...FORM, email: "", discord: "mecry" }, "10.3.0.2")).statusCode, 204);
            const mail = sent.at(-1)!;

            assert.equal(mail.replyTo, undefined);
            assert.match(String(mail.html), /Antwort nur über Discord möglich: <strong>mecry<\/strong>/);
            assert.match(String(mail.text), /^Antwort nur über Discord möglich: mecry/);
        });

        await check("Scheitert der Versand, bekommt die Person einen Satz statt Erfolg", async () => {
            failing = true;
            const response = await post(FORM, "10.3.0.3");
            failing = false;

            assert.deepEqual([response.statusCode, response.json()], [503, { error: "Die Nachricht ging gerade nicht raus. Versuch es in ein paar Minuten noch einmal." }]);
        });

        await check("Ohne Postfach und ohne SMTP_* sagt das Formular, dass es gerade nicht geht", async () => {
            const bare = await buildApp(loadConfig(ENV, []));

            try {
                const response = await bare.inject({ method: "POST", url: "/public/contact", headers: { "content-type": "application/json" }, payload: JSON.stringify(FORM), remoteAddress: "10.3.0.5" });
                assert.deepEqual([response.statusCode, response.json()], [503, { error: "Das Kontaktformular ist gerade nicht erreichbar. Schreib uns bitte direkt eine Mail." }]);
            } finally {
                await bare.close();
            }
        });

        await check("CONTACT_MAIL leer: es geht an support@nexus-emb.de", () => {
            assert.equal(loadConfig(ENV, []).contactMail, "support@nexus-emb.de");
            assert.equal(loadConfig({ ...ENV, CONTACT_MAIL: "Hilfe@Example.test" }, []).contactMail, "hilfe@example.test");
        });

        await check("Die Falle verschickt nichts und meldet trotzdem Erfolg", async () => {
            const before = sent.length;

            assert.equal((await post({ ...FORM, website: "spam" }, "10.3.0.4")).statusCode, 204);
            assert.equal(sent.length, before);
        });

        await check("Mehr als fünf Nachrichten in zehn Minuten bremst das Formular", async () => {
            const codes: number[] = [];
            for (let index = 0; index < 6; index++) codes.push((await post(FORM, "10.3.0.9")).statusCode);

            assert.deepEqual(codes, [204, 204, 204, 204, 204, 429]);
        });

        await check("Die Mail maskiert jeden Wert", () => {
            const html = contactMailHtml({ topic: "bug", name: "<script>", email: null, discord: "x", subject: "s", message: "a<b", context: "<i>" });

            assert.ok(!html.includes("<script>") && !html.includes("<i>") && html.includes("a&lt;b"));
        });

        await check("Der Discord-Hinweis geht raus, zeigt aufs Postfach und hält das Formular nicht auf", async () => {
            const hooked = await buildApp(loadConfig({ ...SMTP_ENV, CONTACT_WEBHOOK_URL: HOOK }, []));
            const calls: unknown[] = [];
            const real = globalThis.fetch;

            // Ein Webhook, der sich Zeit lässt: Der Server darf trotzdem sofort antworten.
            globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
                const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

                if (url.startsWith(HOOK)) {
                    calls.push(JSON.parse(String(init?.body ?? "{}")));
                    await new Promise((resolve) => setTimeout(resolve, 400));

                    return new Response(null, { status: 204 });
                }

                return real(input, init);
            }) as typeof fetch;

            try {
                const started = Date.now();
                const response = await hooked.inject({
                    method: "POST",
                    url: "/public/contact",
                    headers: { "content-type": "application/json" },
                    payload: JSON.stringify({ ...FORM, subject: "Hinweis" }),
                    remoteAddress: "10.3.0.20",
                });
                const waited = Date.now() - started;

                assert.equal(response.statusCode, 204);
                assert.ok(waited < 300, `Das Formular wartete ${waited} ms auf den Hinweis`);

                await new Promise((resolve) => setTimeout(resolve, 700));
                assert.equal(calls.length, 1);

                const embed = (calls[0] as { embeds: { title: string; url: string; fields: { name: string; value: string }[] }[] }).embeds[0];
                assert.equal(embed.title, "Hinweis");
                assert.match(embed.url, /\/post\/alle$/);
                assert.ok(embed.fields.some((field) => field.name === "Von" && field.value.includes("mecry@example.com")));
            } finally {
                globalThis.fetch = real;
                await hooked.close();
            }
        });
    } finally {
        setNotifyTransport(null);
        await app.close();
    }
}
