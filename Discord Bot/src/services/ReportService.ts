import { createTransport, Transporter } from "nodemailer";
import BotClient from "../client/BotClient";
import { REPORT_LIMITS, REPORT_MAIL, REPORT_MAX, REPORT_WINDOW } from "../constants/Report";
import logger from "../utils/logger";
import { NewErrorId } from "../Guardian";

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

export interface IReport extends IReportInput {
    source: "dashboard" | "discord";
    user: { id: string; name: string } | null;
    guild: { id: string; name: string } | null;
    /** Die Seite im Dashboard, auf der das Pop-up aufging. */
    page: string | null;
    /** „Firefox 140 · Windows“, nur aus dem Dashboard. */
    browser: string | null;
    /** Die letzten Fehler-IDs dieses Tabs, höchstens drei (Plan 24). */
    errorIds: string[];
}

const ERROR_ID = /^NEXUS-\d{10}-[A-HJ-NP-Z2-9]{6}$/;

/** Was das Dashboard automatisch mitschickt, geprüft: Browser und die letzten Fehler-IDs. */
export function ReportExtras(body: Record<string, unknown>): Pick<IReport, "browser" | "errorIds"> {
    const ids = Array.isArray(body.errorIds) ? body.errorIds.filter((id): id is string => typeof id === "string" && ERROR_ID.test(id)) : [];

    return { browser: typeof body.browser === "string" && body.browser.trim() ? body.browser.trim().slice(0, 120) : null, errorIds: ids.slice(-3) };
}

const MAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function Text(value: unknown, max: number): string {
    return typeof value === "string" ? value.trim().slice(0, max) : "";
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

        return lines.join("\n");
    }

    /**
     * Verschickt die Meldung: als Mail an support@ und als DM an die Devs
     * (Plan 24). Klappt eins von beiden, ist sie angekommen. key: Discord-ID
     * oder IP - darauf zählt die Grenze.
     */
    async Send(report: IReport, key: string): Promise<void> {
        if (!this.Allow(key)) throw new ReportError("Du hast gerade schon mehrere Meldungen geschickt. Versuch es in ein paar Minuten noch einmal.", 429);

        const mailed = this.Ready ? await this.Mail(report) : false;
        const direct = await this.client.guardian.Report(this.Info(report, mailed)).sent;

        if (!mailed && direct === 0) {
            throw this.Ready ? new ReportError("Die Meldung ließ sich gerade nicht verschicken.", 502) : new ReportError("Der Mailversand ist noch nicht eingerichtet.", 503);
        }

        logger.user(`📮 Fehlermeldung über ${report.source}: ${mailed ? "Mail" : "keine Mail"}, ${direct} DM(s)`);
    }

    /** Die Mail an support@. false: ging nicht raus. */
    private async Mail(report: IReport): Promise<boolean> {
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

            return true;
        } catch (error) {
            logger.error("📮 Fehlermeldung ließ sich nicht als Mail verschicken", error);

            return false;
        }
    }

    /** Die DM 📮 an die Devs: Betreff als Titel, nie zusammengefasst. */
    private Info(report: IReport, mailed: boolean) {
        const fields: [string, string][] = [["Text", report.message.slice(0, 1500)]];

        if (report.context) fields.push(["Wo und wie", report.context.slice(0, 600)]);

        fields.push(["Von", report.user ? `${report.user.name} \`${report.user.id}\`` : "nicht angemeldet"]);

        if (report.contact) fields.push(["Kontakt", report.contact]);
        if (report.guild) fields.push(["Server", `${report.guild.name} \`${report.guild.id}\``]);

        fields.push(["Woher", report.source === "discord" ? "Discord (/fehler)" : `Dashboard${report.page ? ` · \`${report.page}\`` : ""}`]);

        if (report.browser) fields.push(["Browser", report.browser]);
        if (report.errorIds.length) fields.push(["Fehler davor", report.errorIds.map((id) => `\`${id}\``).join(", ")]);

        return {
            id: NewErrorId(),
            kind: "report" as const,
            title: `📮 ${report.subject}`,
            message: report.subject,
            where: report.page ?? report.source,
            fields,
            excerpt: null,
            note: mailed ? `Auch per Mail an ${REPORT_MAIL}.` : `Die Mail an ${REPORT_MAIL} ging nicht raus. Antworte über Discord.`,
        };
    }
}
