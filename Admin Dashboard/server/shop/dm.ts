import { readFile } from "node:fs/promises";
import path from "node:path";
import { TAX_NOTE, formatPrice, type ProductKind } from "../../shared/shop.ts";
import type { IConfig } from "../config.ts";
import { fetchRoles, sendDirectMessage } from "../discord.ts";
import type { IGrant } from "./grants.ts";
import { legalDay } from "./legal.ts";
import { dashboardUrl } from "./mail.ts";
import { customerOf, logEvent } from "./records.ts";
import { findProduct } from "./store.ts";

/**
 * Die Direktnachrichten des Bots: Bestellung, Test, fehlgeschlagene Zahlung,
 * Ablauf (Spec 2026-10-17-shop-discord-dm-design.md). Jede ist ein
 * Components-V2-Container mit Banner, Text und Knöpfen. Die Bauteile sind
 * reine Funktionen, sendShopDm schickt sie und schreibt den Verlauf. Die
 * Knöpfe shop:access und shop:cancel beantwortet der Bot
 * (src/events/shop/ShopButtons.ts im Bot-Repo).
 */

export type DmKind = "order" | "trial" | "payment-failed" | "expired";

export interface IShopDm {
    readonly kind: DmKind;
    readonly message: Record<string, unknown>;
    /** Bilder aus server/shop/dm, im Inhalt als attachment://name. */
    readonly files: readonly string[];
}

export const DM_ACCESS = "shop:access";
export const DM_CANCEL = "shop:cancel";

const IS_COMPONENTS_V2 = 1 << 15;
const ACCENT = 0xff1e2d;
const IMAGES = path.join(import.meta.dirname, "dm");
const LABELS: Readonly<Record<DmKind, string>> = { order: "Bestellung", trial: "Test", "payment-failed": "Zahlung fehlgeschlagen", expired: "Zugang abgelaufen" };

type Part = Record<string, unknown>;

// Discords Bausteine: 10 Text, 14 Trennlinie, 12 Galerie, 9 Abschnitt, 11 Vorschaubild, 1 Reihe, 2 Knopf.
const text = (content: string): Part => ({ type: 10, content });
const divider = (): Part => ({ type: 14, divider: true, spacing: 1 });
const banner = (file: string): Part => ({ type: 12, items: [{ media: { url: `attachment://${file}` } }] });
const row = (...buttons: Part[]): Part => ({ type: 1, components: buttons });
const link = (label: string, url: string, emoji?: string): Part => ({ type: 2, style: 5, label, url, ...(emoji ? { emoji: { name: emoji } } : {}) });
const accessButton = (): Part => ({ type: 2, style: 3, label: "Zugang anzeigen", custom_id: DM_ACCESS, emoji: { name: "📋" } });
const cancelButton = (): Part => ({ type: 2, style: 4, label: "Kündigen", custom_id: DM_CANCEL });

function message(parts: readonly Part[]): Record<string, unknown> {
    // Keine Erwähnung pingt, auch wenn ein Name „@everyone“ heißt.
    return { flags: IS_COMPONENTS_V2, allowed_mentions: { parse: [] }, components: [{ type: 17, accent_color: ACCENT, components: parts }] };
}

/** Discord-Zeitstempel: f Datum und Uhrzeit, D Datum, R relativ. Discord zeigt sie in Sprache und Zeitzone der Person. */
function stamp(date: Date, style: "f" | "D" | "R"): string {
    return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
}

function dayAndDistance(date: Date): string {
    return `${stamp(date, "D")} · ${stamp(date, "R")}`;
}

/** Namen und Titel als reiner Text: kein Umbruch (sonst eine neue Überschrift), kein Markdown, kein Link. */
export function escapeMarkdown(value: string): string {
    return value.replace(/\s*[\r\n]+\s*/g, " ").replace(/[\\*_~`|<>#[\]()@:-]/g, "\\$&");
}

function named(greeting: string, name: string | null): string {
    return name?.trim() ? `${greeting}, ${escapeMarkdown(name.trim())}!` : `${greeting}!`;
}

/** Was die Mail wirklich mitbrachte. Die DM verspricht nichts, das nicht rausging. */
function mailLine(config: IConfig, mail: { sent: boolean; invoice: boolean; legal: boolean }, termsVersion: string): string {
    if (!mail.sent) return `-# 📧 Die Bestätigungsmail konnten wir gerade nicht senden. Schreib uns über ${config.shopSiteUrl}/kontakt, dann schicken wir sie dir.`;

    const legal = `AGB und Widerrufsbelehrung (Stand ${legalDay(termsVersion)})`;
    if (mail.invoice && mail.legal) return `-# 📧 Rechnung, ${legal} kommen per Mail.`;
    if (mail.invoice) return "-# 📧 Die Bestätigung mit Rechnung kommt per Mail.";
    if (mail.legal) return `-# 📧 Die Bestätigung mit ${legal} kommt per Mail.`;

    return "-# 📧 Die Bestätigung kommt per Mail.";
}

export function orderDm(
    config: IConfig,
    input: {
        readonly name: string | null;
        readonly title: string;
        readonly kind: ProductKind;
        readonly priceCents: number;
        /** Beim Absenden der Kasse. */
        readonly orderedAt: Date;
        /** Als die Zahlung ankam und der Zugang angelegt wurde. */
        readonly paidAt: Date;
        readonly startsAt: Date;
        /** Beim Abo die nächste Zahlung, beim Einmalkauf das Ende, null heißt unbegrenzt. */
        readonly endsAt: Date | null;
        readonly roleName: string | null;
        readonly orderNo: string;
        readonly termsVersion: string;
        readonly mail: { readonly sent: boolean; readonly invoice: boolean; readonly legal: boolean };
    }
): IShopDm {
    const site = config.shopSiteUrl;
    const subscription = input.kind === "subscription";
    const price = `**${formatPrice(input.priceCents)}** ${subscription ? "pro Monat · Abo" : "einmalig"}`;
    const term = [
        `> **Bestellt:** ${stamp(input.orderedAt, "f")}`,
        // Ein Einmalkauf auf einen laufenden beginnt erst an dessen Ende. Gemessen an der Zahlung, nicht an der Bestellung (Zeit im Kartenformular).
        ...(input.startsAt.getTime() - input.paidAt.getTime() > 60_000 ? [`> **Beginnt:** ${dayAndDistance(input.startsAt)}`] : []),
        ...(subscription
            ? [...(input.endsAt ? [`> **Nächste Zahlung:** ${dayAndDistance(input.endsAt)}`] : []), "> **Kündigen:** jederzeit zum Ende des bezahlten Monats"]
            : [input.endsAt ? `> **Gültig bis:** ${dayAndDistance(input.endsAt)}` : "> **Gültig:** unbegrenzt", "> **Verlängerung:** keine"]),
    ];
    const discord = [...(input.roleName ? [`> **Rolle:** **${escapeMarkdown(input.roleName)}**`] : []), `> **Bestellnummer:** \`${input.orderNo}\``];
    const links = [`[AGB](${site}/agb)`, `[Widerrufsbelehrung](${site}/widerruf)`, ...(subscription ? [`[Kündigen](${site}/kuendigen)`] : []), `[Datenschutz](${site}/datenschutz)`];

    return {
        kind: "order",
        files: ["bestaetigt.png", "logo.png"],
        message: message([
            banner("bestaetigt.png"),
            text(`## ${named("Danke", input.name)} 🎉\nDein Zugang zum **RL Nexus Bot-Dashboard** ist freigeschaltet. Du kannst sofort loslegen.`),
            divider(),
            {
                type: 9,
                components: [text(`### 📦 ${escapeMarkdown(input.title)}\n${price}\n-# ${subscription ? "Verlängert sich jeden Monat, bis du kündigst." : "Verlängert sich nicht."}`)],
                accessory: { type: 11, media: { url: "attachment://logo.png" }, description: "RL Nexus Logo" },
            },
            divider(),
            text(`### 🗓️ Laufzeit\n${term.join("\n")}`),
            text(`### 🎮 Auf Discord\n${discord.join("\n")}`),
            divider(),
            text(
                [
                    `-# ⚖️ Du hast verlangt, dass der Zugang sofort startet, und bestätigt, dass du weißt: Damit erlischt dein Widerrufsrecht vorzeitig beziehungsweise du schuldest bei einem Widerruf Wertersatz für die Zeit bis dahin. ${TAX_NOTE}`,
                    mailLine(config, input.mail, input.termsVersion),
                    `-# ${links.join(" · ")}`,
                ].join("\n")
            ),
            row(link("Zum Dashboard", dashboardUrl(config), "🚀"), accessButton(), ...(subscription ? [cancelButton()] : [])),
        ]),
    };
}

export function trialDm(config: IConfig, input: { readonly name: string | null; readonly days: number; readonly until: Date }): IShopDm {
    return {
        kind: "trial",
        files: ["test.png"],
        message: message([
            banner("test.png"),
            text(`## ${named("Dein Test läuft", input.name)} 🧪\nProbier das Bot-Dashboard **${input.days} ${input.days === 1 ? "Tag" : "Tage"}** lang kostenlos aus.`),
            divider(),
            text(`### ⏳ Test\n> **Endet:** ${stamp(input.until, "f")} · ${stamp(input.until, "R")}\n> **Kosten:** keine, der Test endet von selbst`),
            row(link("Zum Dashboard", dashboardUrl(config), "🚀"), accessButton(), link("Preise", `${config.shopSiteUrl}/preise`, "🛒")),
        ]),
    };
}

export function paymentFailedDm(config: IConfig, input: { readonly title: string; readonly amountCents: number | null }): IShopDm {
    const what = input.amountCents === null ? `die Zahlung für **${escapeMarkdown(input.title)}**` : `**${formatPrice(input.amountCents)}** für **${escapeMarkdown(input.title)}**`;

    return {
        kind: "payment-failed",
        files: ["fehlgeschlagen.png"],
        message: message([
            banner("fehlgeschlagen.png"),
            // Kein Datum: Das gespeicherte Ende ist in diesem Moment nicht verlässlich (Spec).
            text(`## Zahlung hat nicht geklappt\nStripe konnte ${what} gerade nicht einziehen und versucht es in den nächsten Tagen noch ein paar Mal.`),
            divider(),
            text("> Dein Zugang läuft bis zum Ende des bezahlten Monats weiter.\n-# Ändere die Zahlungsart unter Mein Zugang, dann klappt der nächste Versuch."),
            row(link("Zahlungsart ändern", `${config.shopSiteUrl}/zugang`, "💳"), accessButton()),
        ]),
    };
}

export function expiredDm(config: IConfig, input: { readonly title: string | null; readonly endsAt: Date | null; readonly roleName: string | null }): IShopDm {
    const what = input.title ? `**${escapeMarkdown(input.title)}**` : "Dein Zugang";
    const role = input.roleName ? `Die Rolle **${escapeMarkdown(input.roleName)}** ist weg` : "Die Rolle dafür ist weg";

    return {
        kind: "expired",
        files: ["abgelaufen.png"],
        message: message([
            banner("abgelaufen.png"),
            text(
                `## Dein Zugang ist abgelaufen\n${what} ${input.endsAt ? `lief bis ${stamp(input.endsAt, "D")}` : "ist vorbei"}. ${role}, du bleibst aber auf dem Server. Deine Einstellungen bleiben gespeichert.`
            ),
            row(link("Wieder freischalten", `${config.shopSiteUrl}/preise`, "🛒"), link("Mein Zugang", `${config.shopSiteUrl}/zugang`, "👤")),
        ]),
    };
}

/** Titel, Ende und Rollenname eines abgelaufenen Zugangs für expiredDm. Wackelt Discord, fehlt nur der Rollenname. */
export async function expiredFacts(config: IConfig, grant: IGrant | null): Promise<{ title: string | null; endsAt: Date | null; roleName: string | null }> {
    if (!grant) return { title: null, endsAt: null, roleName: null };

    const product = grant.productId === null ? null : await findProduct(grant.productId);
    const roleName = grant.roleId === null ? null : await fetchRoles(config).then((roles) => roles.find((role) => role.id === grant.roleId)?.name ?? null, () => null);

    // Vorzeitig beendet (etwa ein Abo, das Stripe nach fehlgeschlagener Zahlung beendet): Das gespeicherte Ende kann schon die nächste Periode sein.
    const endsAt = grant.endedAt !== null && (grant.endsAt === null || grant.endedAt < grant.endsAt) ? grant.endedAt : grant.endsAt;

    return { title: product?.title ?? (grant.source === "trial" ? "Test" : null), endsAt, roleName };
}

/** Die Bilder, einmal gelesen. Scheitert das Lesen, versucht es der nächste Aufruf neu. */
const images = new Map<string, Promise<Buffer>>();

function image(name: string): Promise<Buffer> {
    let file = images.get(name);

    if (!file) {
        file = readFile(path.join(IMAGES, name));
        file.catch(() => images.delete(name));
        images.set(name, file);
    }

    return file;
}

/** Schickt die DM und schreibt das Ergebnis in den Verlauf. Gesperrte bekommen nie eine. Wirft nie. */
export async function sendShopDm(config: IConfig, userId: string, dm: IShopDm): Promise<boolean> {
    try {
        if ((await customerOf(userId))?.bannedAt != null) return false;

        const files = await Promise.all(dm.files.map(async (name) => ({ name, data: await image(name), type: "image/png" })));
        const reason = await sendDirectMessage(config, userId, dm.message, files);

        await logEvent(userId, reason === null ? `dm.${dm.kind}` : "dm.failed", reason === null ? null : `${LABELS[dm.kind]}: ${reason}`.slice(0, 500));

        return reason === null;
    } catch (error) {
        console.warn(`💬 Discord-Nachricht (${LABELS[dm.kind]}) an ${userId} nicht geschickt: ${error instanceof Error ? error.message : String(error)}`);

        return false;
    }
}
