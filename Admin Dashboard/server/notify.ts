import { createTransport, type Transporter } from "nodemailer";
import { CONTACT_TOPIC_LABELS } from "../shared/limits.ts";
import type { IConfig } from "./config.ts";
import type { IContactInput } from "./contact.ts";
import { databaseReady } from "./db.ts";
import { accountByAddress, loginOf } from "./mail/accounts.ts";
import { smtpTransport } from "./mail/connect.ts";

/**
 * Was mit einer Nachricht aus dem Kontaktformular passiert.
 *
 * Zwei Wege: Die Nachricht geht als Mail an support@, darauf wartet das
 * Formular, denn gespeichert wird sie sonst nirgends. Verschickt wird über das
 * Postfach mit derselben Adresse aus „Postfächer verwalten“, sonst über
 * SMTP_* aus der .env. Dazu, falls
 * eingerichtet, ein Hinweis in einen Discord-Kanal. Der läuft nebenher, und
 * scheitert er, steht es nur im Log.
 */

/** Discord nimmt höchstens so viele Zeichen je Feld eines Embeds. */
const FIELD_MAX = 1024;

let transport: Pick<Transporter, "sendMail"> | null = null;

/** Für die Prüfungen: einen eigenen Transport unterschieben, null nimmt wieder den echten. */
export function setNotifyTransport(next: Pick<Transporter, "sendMail"> | null): void {
    transport = next;
}

function transportFor(smtp: NonNullable<IConfig["smtp"]>): Pick<Transporter, "sendMail"> {
    transport ??= createTransport({
        host: smtp.host,
        port: smtp.port,
        // 465 spricht von Anfang an TLS, 587 schaltet mit STARTTLS um. Wie im Bot.
        secure: smtp.port === 465,
        auth: { user: smtp.user, pass: smtp.password },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
    });

    return transport;
}

function shorten(text: string, max = FIELD_MAX): string {
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function topicOf(input: IContactInput): string {
    return CONTACT_TOPIC_LABELS[input.topic] ?? input.topic;
}

/** Wer geschrieben hat, in einer Zeile. */
function sender(input: IContactInput): string {
    const ways = [input.email, input.discord].filter((value): value is string => typeof value === "string" && value.length > 0);

    return ways.length === 0 ? input.name : `${input.name} (${ways.join(", ")})`;
}

const esc = (value: string): string => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const lines = (value: string): string => esc(value).replace(/\n/g, "<br>");

/** Ohne E-Mail-Adresse kann support@ nur über Discord antworten. Das soll oben stehen. */
function discordOnly(input: IContactInput): string | null {
    return input.email === null && input.discord !== null ? input.discord : null;
}

/** Die Mail an support@: schlicht, hell, ohne Bilder von außen. Jeder Wert maskiert. */
export function contactMailHtml(input: IContactInput): string {
    const row = (label: string, value: string | null): string =>
        value ? `<tr><td style="padding:4px 12px 4px 0;color:#5f6368;white-space:nowrap;vertical-align:top;">${label}</td><td style="padding:4px 0;">${esc(value)}</td></tr>` : "";
    const block = (title: string, value: string): string =>
        `<h3 style="margin:20px 0 6px;font-size:14px;color:#202124;">${title}</h3><div style="padding:12px;background:#f6f8fa;border:1px solid #e1e4e8;">${lines(value)}</div>`;
    const only = discordOnly(input);
    const note = only === null ? "" : `<p style="margin:0 0 16px;padding:10px 12px;background:#fff4e5;border-left:3px solid #f29900;">Antwort nur über Discord möglich: <strong>${esc(only)}</strong></p>`;

    return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#202124;max-width:640px;">
${note}<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
${row("Thema", topicOf(input))}${row("Name", input.name)}${row("E-Mail", input.email)}${row("Discord", input.discord)}
</table>
${block("Nachricht", input.message)}${input.context ? block("Angaben zur Lage", input.context) : ""}
</div>`;
}

function contactMailText(input: IContactInput): string {
    const only = discordOnly(input);

    return [
        only === null ? null : `Antwort nur über Discord möglich: ${only}\n`,
        `Thema: ${topicOf(input)}`,
        `Von: ${sender(input)}`,
        input.context ? `\nAngaben zur Lage:\n${input.context}` : null,
        `\nNachricht:\n${input.message}`,
    ]
        .filter((line): line is string => line !== null)
        .join("\n");
}

/** Es gibt weder das Postfach von CONTACT_MAIL noch SMTP_*: Das Formular kann nichts verschicken. */
export class ContactMailUnavailable extends Error {}

/** Das Postfach von CONTACT_MAIL, falls es angelegt ist. Ohne Datenbank gibt es keins. */
async function contactAccount(config: IConfig) {
    return databaseReady() ? accountByAddress(config.contactMail) : null;
}

/** Die Nachricht aus dem Formular an support@. Wartet und wirft, damit das Formular ehrlich antworten kann. */
export async function sendContactMail(config: IConfig, input: IContactInput): Promise<void> {
    const message = {
        to: config.contactMail,
        // Antworten geht damit direkt aus dem Postfach an die Person.
        replyTo: input.email ?? undefined,
        subject: `[Kontakt · ${topicOf(input)}] ${input.subject}`,
        html: contactMailHtml(input),
        text: contactMailText(input),
    };
    const account = await contactAccount(config);

    // Das Postfach schreibt sich selbst: Die Nachricht landet in seinem
    // Posteingang, nicht in „Gesendet“.
    if (account) {
        const transport = smtpTransport(loginOf(config.mail, account));

        try {
            await transport.sendMail({ ...message, from: { name: "RL Nexus Kontaktformular", address: account.address } });
        } finally {
            transport.close();
        }

        return;
    }

    if (config.smtp === null) throw new ContactMailUnavailable(`Weder ein Postfach ${config.contactMail} noch SMTP_* in der .env.`);

    await transportFor(config.smtp).sendMail({ ...message, from: { name: "RL Nexus Kontaktformular", address: config.smtp.from } });
}

async function sendDiscord(config: IConfig, input: IContactInput): Promise<void> {
    if (config.contactWebhook === null) return;

    const response = await fetch(config.contactWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({
            username: "RL Nexus Kontakt",
            embeds: [
                {
                    title: shorten(input.subject, 256),
                    // Die Farbe der Webseite, damit die Nachricht erkennbar ist.
                    color: 0xff_1e_2d,
                    url: `${config.publicUrl}/post/alle`,
                    description: shorten(input.message, 2000),
                    fields: [
                        { name: "Thema", value: topicOf(input), inline: true },
                        { name: "Von", value: shorten(sender(input), 256), inline: true },
                        ...(input.context ? [{ name: "Angaben zur Lage", value: shorten(input.context) }] : []),
                    ],
                    timestamp: new Date().toISOString(),
                },
            ],
        }),
    });

    if (!response.ok) throw new Error(`Discord antwortet mit ${response.status}`);
}

/** Der Hinweis nach Discord, nebenher. Scheitert er, steht es im Log. */
export function notifyContact(config: IConfig, input: IContactInput): void {
    void sendDiscord(config, input).catch((error: unknown) => {
        console.error(`📮 Kontakt-Hinweis per Discord fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);
    });
}

/** Für die Technik-Ansicht: Welcher Weg ist eingerichtet? */
export async function notifyStatus(config: IConfig): Promise<{ readonly mail: boolean; readonly discord: boolean }> {
    const account = await contactAccount(config).catch(() => null);

    return { mail: account !== null || config.smtp !== null, discord: config.contactWebhook !== null };
}
