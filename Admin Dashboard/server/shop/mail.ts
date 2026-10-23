import { createTransport } from "nodemailer";
import type { Options } from "nodemailer/lib/mailer/index.js";
import { TAX_NOTE, durationLabel, formatPrice, maskEmail, priceSuffix, type ProductKind } from "../../shared/shop.ts";
import type { IConfig } from "../config.ts";
import { databaseReady } from "../db.ts";
import { accountByAddress } from "../mail/accounts.ts";
import { buildSystemMail, type IFile } from "../mail/compose.ts";
import { escapeHtml } from "../mail/render.ts";
import { sendFrom } from "../mail/send.ts";
import { formatDay } from "./grants.ts";
import { PROVIDER_LINE, legalPdf } from "./legal.ts";

/**
 * Was der Shop verschickt. Absender noreply@ (SHOP_MAIL_FROM), Antworten an
 * support@. Verschickt über das Postfach mit dieser Adresse aus „Postfächer
 * verwalten“, sonst über SMTP_* aus der .env, genau wie das Kontaktformular.
 *
 * Eine Mail, die nicht rausgeht, hält nichts auf: sendShopMail gibt false
 * zurück, der Aufrufer schreibt es in den Verlauf.
 */

export interface IShopMail {
    readonly to: string;
    readonly subject: string;
    readonly html: string;
    readonly files?: readonly IFile[];
    /** Unterzeile unter dem Logo, Standard „Shop“. */
    readonly subline?: string;
}

export type ShopMailer = (options: Options) => Promise<void>;

let mailer: ShopMailer | null = null;

/** Für die Prüfungen: Mails abfangen statt verschicken. null: wieder echt. */
export function setShopMailer(next: ShopMailer | null): void {
    mailer = next;
}

const esc = escapeHtml;
const TIME_FORMAT = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });

export function dashboardUrl(config: IConfig): string {
    return config.developerMode ? "http://localhost:3000/dashboard" : (config.dashboardUrl ?? "https://dashboard.nexus-emb.de");
}

function button(href: string, label: string): string {
    return `<p><a href="${esc(href)}" data-button>${esc(label)}</a></p>`;
}

function footer(config: IConfig): string {
    const link = (href: string, label: string): string =>
        `<a href="${esc(href)}" target="_blank" style="color:#a8b0bc;text-decoration:none;margin-right:12px;"><b style="color:#ff1e2d;">›</b> ${label}</a>`;
    const site = config.shopSiteUrl;

    return `${esc(PROVIDER_LINE)}<br>${link(`${site}/zugang`, "Mein Zugang")}${link(`${site}/kuendigen`, "Verträge hier kündigen")}${link(`${site}/impressum`, "Impressum")}${link(`${site}/datenschutz`, "Datenschutz")}<br>Diese Mail kommt automatisch vom Shop. Fragen? Antworte einfach, die Antwort geht an ${esc(config.contactMail)}.`;
}

async function deliver(config: IConfig, options: Options): Promise<void> {
    if (mailer) return mailer(options);

    const account = databaseReady() ? await accountByAddress(config.shopMailFrom) : null;

    if (account) {
        await sendFrom(config.mail, account, options, [String(options.to)]);
        return;
    }

    if (config.smtp === null) throw new Error(`Weder ein Postfach ${config.shopMailFrom} noch SMTP_* in der .env.`);

    const transport = createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.port === 465,
        auth: { user: config.smtp.user, pass: config.smtp.password },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
    });

    try {
        await transport.sendMail({ ...options, from: { name: "RL Nexus", address: config.smtp.from } });
    } finally {
        transport.close();
    }
}

export async function sendShopMail(config: IConfig, mail: IShopMail): Promise<boolean> {
    const options = buildSystemMail({
        from: { address: config.shopMailFrom, label: "RL Nexus" },
        to: mail.to,
        replyTo: config.contactMail,
        subject: mail.subject,
        html: mail.html,
        footer: footer(config),
        files: mail.files ?? [],
        subline: mail.subline ?? "Shop",
    });

    try {
        await deliver(config, options);
        return true;
    } catch (error) {
        console.error(`📮 Shop-Mail „${mail.subject}“ an ${maskEmail(mail.to)} nicht verschickt: ${error instanceof Error ? error.message : String(error)}`);
        return false;
    }
}

function invoiceFile(name: string, invoice: Buffer | null): IFile[] {
    return invoice === null ? [] : [{ filename: `${name}.pdf`, contentType: "application/pdf", content: invoice }];
}

export function trialMail(config: IConfig, input: { readonly to: string; readonly name: string; readonly until: Date }): IShopMail {
    return {
        to: input.to,
        subject: "Dein Test läuft",
        html:
            `<h2>Dein Test läuft.</h2>` +
            `<p>Hallo ${esc(input.name)}, du kannst das Bot-Dashboard bis <b>${esc(TIME_FORMAT.format(input.until))} Uhr</b> mit allen Modulen nutzen. Danach entscheidest du, ob du weitermachen willst. Bezahlt hast du nichts, und es verlängert sich nichts.</p>` +
            button(dashboardUrl(config), "Zum Dashboard"),
    };
}

/** AGB und Widerrufsbelehrung eines Stands als PDF. Fehlt der Stand, fehlen die Anhänge; fulfil.ts schreibt das in den Verlauf. */
async function legalFiles(version: string): Promise<IFile[]> {
    const files: IFile[] = [];

    for (const [doc, name] of [["agb", "AGB"], ["widerruf", "Widerrufsbelehrung"]] as const) {
        const pdf = await legalPdf(doc, version);
        if (pdf) files.push({ filename: `${name} ${version}.pdf`, contentType: "application/pdf", content: pdf });
    }

    return files;
}

export async function orderMail(
    config: IConfig,
    input: {
        readonly to: string;
        readonly name: string;
        readonly orderNo: string;
        readonly title: string;
        readonly kind: ProductKind;
        readonly priceCents: number;
        readonly durationDays: number | null;
        readonly startsAt: Date;
        readonly endsAt: Date | null;
        readonly invoice: Buffer | null;
        /** Die Discord-Rolle, wenn Discord sie nennen konnte. */
        readonly roleName: string | null;
        /** Stand der Rechtstexte bei der Bestellung: dessen AGB und Widerruf hängen an. */
        readonly termsVersion: string;
    }
): Promise<IShopMail> {
    const subscription = input.kind === "subscription";
    const term = subscription
        ? `ab ${formatDay(input.startsAt)}, monatlich`
        : input.endsAt === null
          ? `ab ${formatDay(input.startsAt)}, unbegrenzt`
          : `${formatDay(input.startsAt)} bis ${formatDay(input.endsAt)}`;
    const renewal = subscription
        ? "jeden Monat, bis du kündigst. Kündigen geht jederzeit zum Ende des bezahlten Monats."
        : "keine. Der Zugang verlängert sich nicht.";

    return {
        to: input.to,
        subject: `Deine Bestellung ${input.orderNo}`,
        html:
            `<h2>Danke, dein Zugang ist aktiv.</h2>` +
            `<p>Hallo ${esc(input.name)}, das ist die Bestätigung deines Vertrags. Bewahr die Mail am besten auf.</p>` +
            `<p><b>Produkt:</b> ${esc(input.title)} (${esc(durationLabel(input.kind, input.durationDays))})<br>` +
            `<b>Preis:</b> ${esc(formatPrice(input.priceCents))} ${esc(priceSuffix(input.kind))}<br>` +
            `<b>Laufzeit:</b> ${esc(term)}<br>` +
            `<b>Verlängerung:</b> ${esc(renewal)}<br>` +
            (input.roleName ? `<b>Discord-Rolle:</b> ${esc(input.roleName)}<br>` : "") +
            `<b>Bestellnummer:</b> ${esc(input.orderNo)}</p>` +
            `<p>Du hast verlangt, dass der Zugang sofort startet, und bestätigt, dass du weißt: Damit erlischt dein Widerrufsrecht vorzeitig beziehungsweise du schuldest bei einem Widerruf Wertersatz für die Zeit bis dahin. ${esc(TAX_NOTE)}</p>` +
            `<p>Die AGB und die Widerrufsbelehrung in der Fassung, die bei deiner Bestellung galt, hängen an dieser Mail.</p>` +
            button(dashboardUrl(config), "Zum Dashboard"),
        files: [...invoiceFile(`Rechnung ${input.orderNo}`, input.invoice), ...(await legalFiles(input.termsVersion))],
        subline: "Bestellung",
    };
}

export function renewedMail(_config: IConfig, input: { readonly to: string; readonly name: string; readonly title: string; readonly endsAt: Date; readonly invoice: Buffer | null }): IShopMail {
    return {
        to: input.to,
        subject: "Dein Abo ist verlängert",
        html: `<p>Hallo ${esc(input.name)}, dein Abo „${esc(input.title)}“ läuft jetzt bis ${esc(formatDay(input.endsAt))}. Die Rechnung hängt an. ${esc(TAX_NOTE)}</p>`,
        files: invoiceFile(`Rechnung ${input.title} bis ${formatDay(input.endsAt)}`, input.invoice),
    };
}

export function paymentFailedMail(config: IConfig, input: { readonly to: string; readonly name: string; readonly title: string }): IShopMail {
    return {
        to: input.to,
        subject: "Die Zahlung für dein Abo hat nicht geklappt",
        html:
            `<p>Hallo ${esc(input.name)}, Stripe konnte die Zahlung für „${esc(input.title)}“ gerade nicht einziehen. Stripe versucht es in den nächsten Tagen noch ein paar Mal. Dein Zugang läuft bis zum Ende des bezahlten Monats weiter.</p>` +
            `<p>Unter „Mein Zugang“ kannst du die Zahlungsart ändern.</p>` +
            button(`${config.shopSiteUrl}/zugang`, "Mein Zugang"),
    };
}

export function cancelReceivedMail(_config: IConfig, input: { readonly to: string; readonly name: string; readonly title: string; readonly at: Date; readonly endsAt: Date | null }): IShopMail {
    return {
        to: input.to,
        subject: "Deine Kündigung ist eingegangen",
        html:
            `<p>Hallo ${esc(input.name)}, deine Kündigung für „${esc(input.title)}“ ist am ${esc(TIME_FORMAT.format(input.at))} Uhr eingegangen.</p>` +
            `<p>${input.endsAt === null ? "Der Vertrag endet zum nächstmöglichen Zeitpunkt." : `Der Vertrag endet am <b>${esc(formatDay(input.endsAt))}</b>. Bis dahin kannst du das Dashboard weiter nutzen, danach wird nichts mehr abgebucht.`}</p>`,
    };
}

export function expiredMail(config: IConfig, input: { readonly to: string; readonly name: string }): IShopMail {
    return {
        to: input.to,
        subject: "Dein Zugang ist abgelaufen",
        html:
            `<p>Hallo ${esc(input.name)}, dein Zugang zum Bot-Dashboard ist abgelaufen. Die Rolle auf dem Discord-Server ist weg, du bleibst aber Mitglied. Deine Einstellungen bleiben erhalten.</p>` +
            button(`${config.shopSiteUrl}/preise`, "Zugang holen"),
    };
}

/** Free oder Beta Access: Der Zugang ist pausiert, es wird nichts abgebucht. beta: Ins Bot-Dashboard geht es dann nur mit Beta-Code. */
export function pausedMail(config: IConfig, input: { readonly to: string; readonly name: string; readonly beta?: boolean }): IShopMail {
    const why = input.beta ? "RL Nexus ist gerade in der geschlossenen Beta" : "RL Nexus ist gerade kostenlos";
    const meanwhile = input.beta
        ? `<p>In der Beta kommst du mit einem Beta-Code ins Bot-Dashboard. Hast du noch keinen, frag beim Support nach.</p>`
        : `<p>Bis dahin nutzt du das Bot-Dashboard wie alle anderen ohne Kosten.</p>`;

    return {
        to: input.to,
        subject: "Dein Zugang ist pausiert",
        html:
            `<p>Hallo ${esc(input.name)}, ${why}. Dein Zugang ist deshalb pausiert: Es wird nichts abgebucht, und deine Tage bleiben stehen. Sobald es wieder Preise gibt, läuft er genau da weiter, wo er jetzt steht.</p>` +
            meanwhile +
            button(dashboardUrl(config), "Zum Dashboard"),
    };
}

/** Zurück auf Paid Access: Der Zugang läuft weiter, mit den Tagen aus der Pause. */
export function resumedMail(config: IConfig, input: { readonly to: string; readonly name: string; readonly until: Date | null; readonly subscription: boolean }): IShopMail {
    const until = input.until ? ` bis ${esc(formatDay(input.until))}` : "";

    return {
        to: input.to,
        subject: "Dein Zugang läuft weiter",
        html:
            `<p>Hallo ${esc(input.name)}, bei RL Nexus gibt es wieder Preise, und dein Zugang läuft weiter${until}. Die Tage aus der Pause hast du nicht verloren.</p>` +
            (input.subscription && input.until ? `<p>Dein Abo bucht erst am ${esc(formatDay(input.until))} wieder ab.</p>` : "") +
            button(dashboardUrl(config), "Zum Dashboard"),
    };
}

/** Ein Admin hat Zugang geschenkt (Shop → Kunden). */
export function giftMail(config: IConfig, input: { readonly to: string; readonly name: string; readonly title: string; readonly until: Date | null }): IShopMail {
    return {
        to: input.to,
        subject: "Du hast einen Zugang geschenkt bekommen",
        html:
            `<h2>Dein Zugang ist da.</h2>` +
            `<p>Hallo ${esc(input.name)}, du hast Zugang zum Bot-Dashboard bekommen: ${esc(input.title)}, ${input.until === null ? "unbegrenzt" : `bis ${esc(formatDay(input.until))}`}. Es wird nichts abgebucht.</p>` +
            button(dashboardUrl(config), "Zum Dashboard"),
    };
}

/** Ein Admin hat den Zugang sofort beendet, mit oder ohne Erstattung. */
export function endedMail(_config: IConfig, input: { readonly to: string; readonly name: string; readonly title: string; readonly refundCents: number | null }): IShopMail {
    return {
        to: input.to,
        subject: "Dein Zugang ist beendet",
        html: `<p>Hallo ${esc(input.name)}, dein Zugang „${esc(input.title)}“ ist beendet. ${
            input.refundCents === null
                ? ""
                : input.refundCents > 0
                  ? `Wir haben dir ${esc(formatPrice(input.refundCents))} erstattet, das Geld ist in ein paar Tagen zurück. `
                  : "Eine Erstattung gibt es dafür nicht. "
        }Fragen? Antworte einfach auf diese Mail.</p>`,
    };
}

/** Eingangsbestätigung nach /kuendigen (§ 312k BGB). Geht immer raus, auch wenn nichts zugeordnet wurde. */
export function cancelReceiptMail(
    _config: IConfig,
    input: {
        readonly to: string;
        readonly receivedAt: Date;
        readonly kind: "ordinary" | "extraordinary";
        readonly name: string;
        readonly reference: string;
        readonly reason: string;
        readonly matched: boolean;
        readonly title: string | null;
        readonly endsAt: Date | null;
    }
): IShopMail {
    const extraordinary = input.kind === "extraordinary";
    // § 312k Abs. 4 BGB: Inhalt der Kündigung, Datum und Uhrzeit des Eingangs, Zeitpunkt des Endes.
    const content =
        `<p><b>Art:</b> ${extraordinary ? "außerordentlich, aus wichtigem Grund" : "ordentlich, zum nächstmöglichen Zeitpunkt"}<br>` +
        `<b>Name:</b> ${esc(input.name)}<br>` +
        `<b>Discord-Name oder Bestellnummer:</b> ${esc(input.reference)}` +
        (extraordinary ? `<br><b>Grund:</b> ${esc(input.reason.slice(0, 500))}` : "") +
        "</p>";
    const contract =
        input.matched && input.endsAt
            ? `<p><b>Vertrag:</b> ${esc(input.title ?? "Abo")}<br><b>Vertragsende:</b> ${esc(formatDay(input.endsAt))}. Bis dahin bleibt dein Zugang, danach wird nichts mehr abgebucht.</p>`
            : "<p>Wir ordnen sie von Hand deinem Vertrag zu und melden uns, spätestens in zwei Werktagen. Der Vertrag endet zum nächstmöglichen Zeitpunkt.</p>";

    return {
        to: input.to,
        subject: "Deine Kündigung ist eingegangen",
        html:
            `<h2>Deine Kündigung ist eingegangen.</h2>` +
            `<p>Wir haben sie am <b>${esc(TIME_FORMAT.format(input.receivedAt))} Uhr</b> erhalten. Das hast du uns geschickt:</p>` +
            content +
            contract +
            (extraordinary ? "<p>Deine außerordentliche Kündigung schauen wir uns an und melden uns dazu.</p>" : ""),
    };
}

/** Ein Hinweis an support@, etwa bei einer Rückbuchung. */
export function supportNoteMail(config: IConfig, input: { readonly subject: string; readonly text: string }): IShopMail {
    return { to: config.contactMail, subject: `[Shop] ${input.subject}`, html: `<p>${esc(input.text)}</p>` };
}
