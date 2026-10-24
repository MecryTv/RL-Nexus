import { createTransport, Transporter } from "nodemailer";
import BotClient from "../client/BotClient";
import { REPORT_LIMITS, REPORT_MAIL, REPORT_MAX, REPORT_WINDOW } from "../constants/Report";
import logger from "../utils/logger";

/** Ein Fehler mit einem Satz für die Oberfläche und dem passenden Statuscode. */
export class ReportError extends Error {
    constructor(
        message: string,
        readonly status: number
    ) {
        super(message);
    }
}

/** Was jemand eingetippt hat. */
export interface IReportInput {
    subject: string;
    message: string;
    /** Wo es passiert ist: Modul, Server, was davor geklickt wurde. */
    context: string;
    /** E-Mail oder Discord-Name für die Antwort. Ohne Anmeldung Pflicht. */
    contact: string;
}

/** Was der Browser von selbst mitschickt (layout/Report.ts im Dashboard). Nur Technik, nichts Getipptes. */
export interface IReportTech {
    browser: string;
    screen: string;
    /** Prüfsumme von app.js: welcher Stand des Dashboards lief. */
    version: string;
    /** Fehlgeschlagene API-Aufrufe und Skriptfehler dieser Sitzung, die neuesten zuletzt. */
    problems: { at: string; what: string }[];
}

export interface IReport extends IReportInput {
    source: "dashboard" | "discord";
    user: { id: string; name: string } | null;
    guild: { id: string; name: string } | null;
    /** Die Seite im Dashboard, auf der das Pop-up aufging. */
    page: string | null;
    tech?: IReportTech | null;
}

const MAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** So viele Probleme gehen höchstens mit, so lang darf jedes sein. */
const PROBLEMS_MAX = 8;
const PROBLEM_LENGTH = 300;
const BERLIN_TIME = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Europe/Berlin" });

function Text(value: unknown, max: number): string {
    return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** Eine Zeile ohne Umbrüche: Was der Browser schickt, soll in der Mail keine eigene Kopfzeile vortäuschen. */
function Line(value: unknown, max: number): string {
    return Text(value, max).replace(/[\u0000-\u001f\u007f]+/g, " ");
}

/**
 * Fehlermeldungen ans Team. Ob sie aus dem Dashboard oder aus /fehler kommen,
 * spielt keine Rolle: beide gehen als Mail an support@nexus-emb.de, damit an
 * genau einer Stelle gelesen wird.
 */
export default class ReportService {
    private readonly client: BotClient;
    private transport: Transporter | null = null;
    private readonly recent = new Map<string, number[]>();

    constructor(client: BotClient) {
        this.client = client;
    }

    /** Ohne Zugangsdaten verschickt der Bot nichts. Das Dashboard öffnet dann das Mailprogramm. */
    get Ready(): boolean {
        const config = this.client.config;

        return Boolean(config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASSWORD);
    }

    /** Prüft die Eingaben. Wirft mit einem Satz, der so in der Oberfläche stehen kann. */
    Clean(input: unknown, signedIn: boolean): IReportInput {
        const raw = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
        const report: IReportInput = {
            subject: Text(raw.subject, REPORT_LIMITS.subject),
            message: Text(raw.message, REPORT_LIMITS.message),
            context: Text(raw.context, REPORT_LIMITS.context),
            contact: Text(raw.contact, REPORT_LIMITS.contact),
        };

        if (report.subject.length < 4) throw new ReportError("Ein Betreff mit ein paar Wörtern hilft beim Einordnen.", 400);
        if (report.message.length < 20) throw new ReportError("Beschreib den Fehler bitte etwas genauer, mindestens 20 Zeichen.", 400);

        // Wer angemeldet ist, hat eine Discord-ID - darüber erreichen wir ihn.
        if (!signedIn && !report.contact) {
            throw new ReportError("Trag eine E-Mail-Adresse oder deinen Discord-Namen ein, damit eine Antwort ankommt.", 400);
        }

        return report;
    }

    /** Prüft den Technik-Block aus dem Browser. Kein Objekt: keiner. */
    Tech(input: unknown): IReportTech | null {
        if (typeof input !== "object" || input === null) return null;

        const raw = input as Record<string, unknown>;
        const problems = (Array.isArray(raw.problems) ? raw.problems : [])
            .map((entry) => (typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>) : {}))
            .map((entry) => ({ at: Line(entry.at, 40), what: Line(entry.what, PROBLEM_LENGTH) }))
            .filter((entry) => entry.what !== "")
            .slice(-PROBLEMS_MAX);

        return { browser: Line(raw.browser, 300), screen: Line(raw.screen, 30), version: Line(raw.version, 40), problems };
    }

    /** Höchstens REPORT_MAX Meldungen je Person (oder Adresse) in zehn Minuten. */
    private Allow(key: string): boolean {
        const now = Date.now();

        // ponytail: Speicher im Prozess, nach einem Neustart leer. Reicht gegen Doppelklicks und Spam-Skripte.
        if (this.recent.size > 1000) {
            for (const [entry, stamps] of this.recent) {
                if (stamps.every((at) => now - at >= REPORT_WINDOW)) this.recent.delete(entry);
            }
        }

        const stamps = (this.recent.get(key) ?? []).filter((at) => now - at < REPORT_WINDOW);
        const allowed = stamps.length < REPORT_MAX;

        if (allowed) stamps.push(now);

        this.recent.set(key, stamps);

        return allowed;
    }

    /** Der Text der Mail. Nur Klartext - das Postfach soll es ohne Bilder und Skripte lesen. */
    Body(report: IReport): string {
        const lines = [
            `Gemeldet über: ${report.source === "discord" ? "Discord (/fehler)" : "Dashboard"}`,
            `Von: ${report.user ? `${report.user.name} (Discord-ID ${report.user.id})` : "nicht angemeldet"}`,
        ];

        if (report.contact) lines.push(`Kontakt: ${report.contact}`);
        if (report.guild) lines.push(`Server: ${report.guild.name} (${report.guild.id})`);
        if (report.page) lines.push(`Seite: ${report.page}`);

        lines.push(`Zeit: ${new Date().toISOString()}`, "", "Was ist passiert?", report.message);

        if (report.context) lines.push("", "Wo und wie:", report.context);

        const tech = report.tech;

        if (tech) {
            lines.push("", "Technik (vom Browser mitgeschickt):", `Browser: ${tech.browser || "?"}`, `Fenster: ${tech.screen || "?"}`, `Version: ${tech.version || "?"}`);
            lines.push(tech.problems.length === 0 ? "Probleme in dieser Sitzung: keine bemerkt" : "Probleme in dieser Sitzung:");

            for (const problem of tech.problems) {
                const at = new Date(problem.at);

                lines.push(`- ${Number.isNaN(at.getTime()) ? "?" : BERLIN_TIME.format(at)} ${problem.what}`);
            }
        }

        return lines.join("\n");
    }

    /** Verschickt die Meldung. key: Discord-ID oder IP - darauf zählt die Grenze. */
    async Send(report: IReport, key: string): Promise<void> {
        if (!this.Ready) throw new ReportError("Der Mailversand ist noch nicht eingerichtet.", 503);
        if (!this.Allow(key)) throw new ReportError("Du hast gerade schon mehrere Meldungen geschickt. Versuch es in ein paar Minuten noch einmal.", 429);

        const config = this.client.config;

        this.transport ??= createTransport({
            host: config.SMTP_HOST,
            port: config.SMTP_PORT,
            // 465 spricht von Anfang an TLS, 587 schaltet mit STARTTLS um.
            secure: config.SMTP_PORT === 465,
            auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD },
            connectionTimeout: 10_000,
            greetingTimeout: 10_000,
            socketTimeout: 20_000,
        });

        try {
            await this.transport.sendMail({
                from: { name: "RL Nexus", address: config.SMTP_FROM || config.SMTP_USER },
                to: REPORT_MAIL,
                replyTo: MAIL_PATTERN.test(report.contact) ? report.contact : undefined,
                subject: `[RL Nexus · Fehler] ${report.subject}`,
                text: this.Body(report),
            });
        } catch (error) {
            logger.error("📮 Fehlermeldung ließ sich nicht verschicken", error);

            throw new ReportError("Die Meldung ließ sich gerade nicht verschicken.", 502);
        }

        logger.user(`📮 Fehlermeldung von ${report.user?.id ?? "Gast"} über ${report.source}`);
    }
}
