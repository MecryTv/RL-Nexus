import { readFileSync } from "node:fs";
import path from "node:path";
import type { Attachment, Options } from "nodemailer/lib/mailer/index.js";
import sanitizeHtml from "sanitize-html";
import type { IMailAddress, IMe } from "../../shared/api.ts";
import type { IMember, ITeam } from "../../shared/content.ts";
import type { IConfig } from "../config.ts";
import { contentMeta, readContent } from "../content.ts";
import { escapeHtml } from "./render.ts";

/**
 * Wie eine Mail aus dem Admin Dashboard aussieht.
 *
 * Die dunkle Vorlage aus dem Entwurf (`mail-template-v3.html`), gebaut aus
 * Tabellen mit Inline-Styles: Mailprogramme ignorieren Stylesheets gern,
 * Outlook auch Flexbox. Logo und Avatar hängen als `cid:` an der Mail, damit
 * sie ohne „Bilder laden“ erscheinen.
 */

const LOGO = readFileSync(path.join(import.meta.dirname, "..", "assets", "mail-logo.png"));
const LOGO_CID = "rlnexus-logo@nexus-emb.de";
const AVATAR_CID = "rlnexus-avatar@nexus-emb.de";

const COLORS = {
    base: "#050608",
    panel: "#0a0f15",
    line: "#1d232b",
    text: "#d9dde3",
    white: "#ffffff",
    dim: "#a8b0bc",
    faint: "#7b8693",
    red: "#ff1e2d",
    button: "#d81424",
    link: "#33bfff",
} as const;

/** Was der Editor erzeugen kann. Alles andere fliegt beim Senden raus. */
const EDITOR_TAGS = ["p", "br", "strong", "b", "em", "i", "u", "s", "h2", "h3", "ul", "ol", "li", "blockquote", "a", "hr"];

/** Das HTML aus dem Editor noch einmal prüfen: Der Browser ist nicht die letzte Instanz. */
export function cleanEditorHtml(html: string): string {
    return sanitizeHtml(html, {
        allowedTags: EDITOR_TAGS,
        allowedAttributes: { a: ["href", "data-button"] },
        allowedSchemes: ["http", "https", "mailto"],
        allowProtocolRelative: false,
    }).trim();
}

const STYLES: Readonly<Record<string, string>> = {
    p: "margin:0 0 14px;",
    h2: `margin:6px 0 12px;font-family:Oxanium,Arial,Helvetica,sans-serif;font-size:20px;line-height:1.3;color:${COLORS.white};`,
    h3: `margin:4px 0 10px;font-family:Oxanium,Arial,Helvetica,sans-serif;font-size:17px;line-height:1.3;color:${COLORS.white};`,
    strong: `color:${COLORS.white};`,
    b: `color:${COLORS.white};`,
    a: `color:${COLORS.link};text-decoration:underline;`,
    blockquote: `margin:12px 0;padding:8px 14px;border-left:3px solid #2b333d;color:${COLORS.dim};background:${COLORS.panel};`,
    ul: "margin:0 0 14px;padding-left:22px;",
    ol: "margin:0 0 14px;padding-left:22px;",
    li: "margin:0 0 4px;",
    hr: `border:0;border-top:1px solid ${COLORS.line};margin:18px 0;`,
};

const BUTTON = `display:inline-block;margin:6px 0 8px;padding:12px 22px;background:${COLORS.button};color:${COLORS.white};font-family:Rajdhani,Arial,Helvetica,sans-serif;font-weight:700;font-size:13px;letter-spacing:2px;text-transform:uppercase;text-decoration:none;`;

/**
 * Dieselben Styles als Regeln, für die Vorschau beim Tippen: Dort setzt der
 * Browser das HTML aus dem Editor direkt ein, ohne Umweg über den Server.
 */
const LIVE_CSS = [...Object.entries(STYLES).map(([tag, style]) => `#rl-live-body ${tag}{${style}}`), `#rl-live-body a[data-button]{${BUTTON}}`].join("");

/** Jedem Element seine Inline-Styles geben. Ein Link mit data-button wird zum roten Knopf. */
function styled(html: string): string {
    return sanitizeHtml(html, {
        allowedTags: EDITOR_TAGS,
        allowedAttributes: { a: ["href", "style", "target"], "*": ["style"] },
        allowedSchemes: ["http", "https", "mailto"],
        transformTags: Object.fromEntries([
            ...Object.entries(STYLES).map(([tag, style]) => [tag, (tagName: string, attribs: sanitizeHtml.Attributes) => ({ tagName, attribs: { ...attribs, style } })]),
            [
                "a",
                (tagName: string, attribs: sanitizeHtml.Attributes) => ({
                    tagName,
                    attribs: { href: attribs.href ?? "", target: "_blank", style: attribs["data-button"] === undefined ? STYLES.a : BUTTON },
                }),
            ],
        ]),
    });
}

const ENTITIES: Readonly<Record<string, string>> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

/** Die Text-Version für Mailprogramme ohne HTML. */
export function htmlToText(html: string): string {
    return html
        .replace(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, label: string) => {
            const inner = label.replace(/<[^>]+>/g, "").trim();
            return inner === href || href.startsWith("mailto:") ? inner : `${inner} (${href})`;
        })
        .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, inner: string) => `\n${htmlToText(inner).split("\n").map((line) => `> ${line}`).join("\n")}\n\n`)
        .replace(/<li[^>]*>/gi, "- ")
        .replace(/<hr[^>]*>/gi, "\n----\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|h2|h3|ul|ol)>/gi, "\n\n")
        .replace(/<\/li>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (entity) => ENTITIES[entity])
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

export interface IRank {
    readonly label: string;
    readonly color: string;
}

const ROLE_RANKS: Readonly<Record<IMe["role"], IRank>> = {
    admin: { label: "Administrator", color: COLORS.red },
    developer: { label: "Developer", color: "#b06bff" },
};

const loose = (value: string): string => value.toLowerCase().replace(/^@/, "").replace(/[\s_.-]/g, "");

/**
 * Der Rang in der Signatur. Steht die Person mit ihrem Discord-Namen auf der
 * Team-Seite, deren Rolle dort in ihrer Farbe, sonst die Gruppe im Dashboard.
 */
export async function rankOf(config: IConfig, author: Pick<IMe, "name" | "role">): Promise<IRank> {
    try {
        const team = (await readContent(config, "team.json"))?.data as ITeam | undefined;
        const member = team?.members.find((entry: IMember) => loose(entry.name) === loose(author.name) || loose(entry.handle) === loose(author.name));

        if (member) {
            const token = /^var\((--[a-z0-9-]+)\)$/.exec(member.accent)?.[1];
            const color = (await contentMeta(config)).colors.find((entry) => entry.token === token)?.value;

            return { label: member.role, color: color?.startsWith("#") ? color : ROLE_RANKS[author.role].color };
        }
    } catch {
        // Webseite gerade weg: dann eben die Gruppe.
    }

    return ROLE_RANKS[author.role];
}

/** Das Bild von Discord holen, um es einzubetten. Nur von Discords CDN, höchstens 5 Sekunden. */
export async function avatarOf(url: string | null): Promise<Buffer | null> {
    if (url === null || !url.startsWith("https://cdn.discordapp.com/")) return null;

    try {
        const response = await fetch(url.replace(/\.webp(\?|$)/, ".png$1"), { signal: AbortSignal.timeout(5000) });
        const type = response.headers.get("content-type") ?? "";
        if (!response.ok || !/^image\/(png|jpeg|gif)/.test(type)) return null;

        return Buffer.from(await response.arrayBuffer());
    } catch {
        return null;
    }
}

function initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const letters = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : name.trim().slice(0, 2);

    return escapeHtml(letters.toUpperCase() || "RL");
}

export interface IFile {
    readonly filename: string;
    readonly contentType: string;
    readonly content: Buffer;
}

export interface IDraft {
    readonly from: { readonly address: string; readonly label: string };
    readonly author: Pick<IMe, "name" | "role">;
    readonly rank: IRank;
    /** Das Bild aus Discord, schon geholt. null zeigt Initialen. */
    readonly avatar: Buffer | null;
    readonly to: readonly IMailAddress[];
    readonly cc: readonly IMailAddress[];
    readonly bcc: readonly IMailAddress[];
    readonly subject: string;
    /** Aus dem Editor, schon mit cleanEditorHtml geprüft. */
    readonly html: string;
    /** Die Mail, auf die geantwortet oder die weitergeleitet wird, schon mit cleanEditorHtml geprüft. "" heißt: keine. */
    readonly quote: string;
    /** „Vorlage weglassen“: nur der Inhalt, ohne Kopf, Signatur und Fuß. */
    readonly plain: boolean;
    /** Eine Antwort auf eine Mail, die jemand an uns geschrieben hat. Ändert den Satz im Fuß. */
    readonly reply: boolean;
    readonly inReplyTo: string | null;
    readonly references: readonly string[];
    readonly files: readonly IFile[];
}

interface ILinks {
    readonly website: string;
    readonly discord: string | null;
}

function signature(draft: IDraft, links: ILinks): string {
    const { rank } = draft;
    const avatar =
        draft.avatar === null
            ? `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="46" height="46" align="center" valign="middle" style="width:46px;height:46px;border-radius:50%;border:2px solid ${rank.color};background:#1a212b;color:${COLORS.dim};font-family:Arial,Helvetica,sans-serif;font-weight:700;font-size:15px;">${initials(draft.author.name)}</td></tr></table>`
            : `<img src="cid:${AVATAR_CID}" width="46" height="46" alt="" style="display:block;width:46px;height:46px;border-radius:50%;border:2px solid ${rank.color};">`;
    const host = links.website.replace(/^https?:\/\//, "");
    const discord = links.discord === null ? "" : ` · <a href="${escapeHtml(links.discord)}" target="_blank" style="color:${COLORS.dim};">Discord</a>`;

    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${COLORS.line};">
<tr>
<td width="58" valign="middle" style="padding:16px 12px 20px 0;width:58px;">${avatar}</td>
<td valign="middle" style="padding:16px 0 20px;font-family:Arial,Helvetica,sans-serif;">
<span style="color:${COLORS.white};font-weight:700;font-size:15px;">${escapeHtml(draft.author.name)}</span>
<span style="display:inline-block;margin-left:6px;padding:2px 7px;border:1px solid ${rank.color};color:${rank.color};font-family:Rajdhani,Arial,Helvetica,sans-serif;font-weight:700;font-size:11px;letter-spacing:2px;text-transform:uppercase;vertical-align:2px;">${escapeHtml(rank.label)}</span>
<div style="color:${COLORS.faint};font-size:12px;margin-top:3px;line-height:1.5;">Team RL Nexus · ${escapeHtml(draft.from.address)}<br><a href="${escapeHtml(links.website)}" target="_blank" style="color:${COLORS.dim};">${escapeHtml(host)}</a>${discord}</div>
</td>
</tr>
</table>`;
}

function footer(draft: IDraft, links: ILinks): string {
    const link = (href: string, label: string): string =>
        `<a href="${escapeHtml(href)}" target="_blank" style="color:${COLORS.dim};text-decoration:none;margin-right:12px;"><b style="color:${COLORS.red};">›</b> ${label}</a>`;
    const why = draft.reply
        ? "Du bekommst diese Mail, weil du RL Nexus geschrieben hast. Antworte einfach auf diese Mail."
        : "Diese Mail kommt vom Team von RL Nexus. Hast du Fragen, antworte einfach darauf.";

    return `${link(links.website, "Webseite")}${links.discord === null ? "" : link(links.discord, "Discord")}${link(`${links.website}/impressum`, "Impressum")}${link(`${links.website}/datenschutz`, "Datenschutz")}<br>${why}`;
}

interface IFrame {
    readonly subject: string;
    readonly label: string;
    /** Schon gestylt. */
    readonly body: string;
    /** Eine ganze Tabellenzeile oder "". */
    readonly signature: string;
    /** Eine ganze Tabellenzeile oder "". */
    readonly quote: string;
    readonly footer: string;
    readonly live: boolean;
}

/** Kopf, roter Streifen, Betreff, Inhalt, Fuß: das, was jede Mail aus dem Admin Dashboard teilt. */
function frame({ subject, label, body, signature, quote, footer, live }: IFrame): string {
    const font = "font-family:Arial,Helvetica,sans-serif;";

    return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${escapeHtml(subject)}</title>
<style>
@media (max-width: 620px) {
  .rl-pad { padding-left: 18px !important; padding-right: 18px !important; }
  .rl-content a[style*="inline-block"] { display: block !important; text-align: center !important; }
}
</style>${live ? `\n<style>${LIVE_CSS}</style>` : ""}
</head>
<body style="margin:0;padding:0;background:${COLORS.base};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.base};">
<tr><td align="center" style="padding:24px 10px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:${COLORS.base};border:1px solid ${COLORS.line};">
<tr><td class="rl-pad" style="padding:22px 26px 18px;background:${COLORS.panel};background-image:radial-gradient(120% 140% at 0% 0%,rgba(255,30,45,0.26),rgba(255,30,45,0) 55%);">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td width="56" valign="middle" style="width:56px;padding-right:12px;"><img src="cid:${LOGO_CID}" width="44" height="44" alt="RL Nexus" style="display:block;width:44px;height:44px;border:0;"></td>
<td valign="middle">
<div style="font-family:Oxanium,Arial,Helvetica,sans-serif;font-weight:700;font-size:22px;letter-spacing:2px;color:${COLORS.white};line-height:1;">RL <span style="color:${COLORS.red};">NEXUS</span></div>
<div style="font-family:Rajdhani,Arial,Helvetica,sans-serif;font-weight:700;font-size:11px;letter-spacing:3px;color:${COLORS.dim};text-transform:uppercase;margin-top:5px;">${escapeHtml(label)}</div>
</td>
</tr></table>
</td></tr>
<tr><td style="height:3px;line-height:3px;font-size:0;background:${COLORS.button};background-image:linear-gradient(90deg,#ff1e2d,#d81424 55%,rgba(255,30,45,0));">&nbsp;</td></tr>
<tr><td class="rl-pad" style="padding:14px 26px 0;font-family:Rajdhani,Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${COLORS.faint};">${live ? `<span id="rl-live-subject">${escapeHtml(subject)}</span>` : escapeHtml(subject)}</td></tr>
<tr><td class="rl-pad rl-content" style="padding:10px 26px 8px;${font}font-size:15px;line-height:1.65;color:${COLORS.text};">${body}</td></tr>
${signature}${quote}<tr><td class="rl-pad" style="padding:16px 26px 18px;background:${COLORS.panel};border-top:1px solid ${COLORS.line};${font}font-size:12px;color:#8d97a3;line-height:1.6;">${footer}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** `live`: für die Vorschau, mit Stellen, in die der Browser beim Tippen schreibt. Nie in einer echten Mail. */
function document(draft: IDraft, links: ILinks, live = false): string {
    const font = "font-family:Arial,Helvetica,sans-serif;";

    return frame({
        subject: draft.subject,
        label: draft.from.label,
        body: live ? `<div id="rl-live-body">${styled(draft.html)}</div>` : styled(draft.html),
        signature: `<tr><td class="rl-pad" style="padding:0 26px;">${signature(draft, links)}</td></tr>\n`,
        // Die alte Vorlage hatte hier eine eigene Zeile, auch wenn sie leer blieb. Das \n hält die Ausgabe gleich.
        quote: `${
            draft.quote === ""
                ? ""
                : `<tr><td class="rl-pad" style="padding:0 26px 20px;${font}font-size:13px;line-height:1.6;color:${COLORS.dim};"><div style="padding:10px 14px;border-left:3px solid #2b333d;background:${COLORS.panel};">${styled(draft.quote)}</div></td></tr>`
        }\n`,
        footer: footer(draft, links),
        live,
    });
}

const formatAddress = (entry: IMailAddress): { name: string; address: string } => ({ name: entry.name, address: entry.address });

/** Das Zitat für die Text-Version: jede Zeile mit „> “ davor. */
function quotedText(html: string): string {
    return html === "" ? "" : `\n\n${htmlToText(html)
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n")}`;
}

/** Ohne Vorlage auch ohne ihre Farben: Weiße Schrift für Fettes wäre auf hellem Grund unsichtbar. */
function plainHtml(draft: IDraft, live = false): string {
    const quote = draft.quote === "" ? "" : `<blockquote style="margin:16px 0 0;padding:0 0 0 12px;border-left:3px solid #c8ccd1;color:#5f6368;">${draft.quote}</blockquote>`;

    return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;">${live ? `<div id="rl-live-body">${draft.html}</div>` : draft.html}${quote}</div>`;
}

/**
 * Die fertige Mail für nodemailer: HTML in der Vorlage, Text-Version,
 * Logo und Avatar als eingebettete Bilder, dazu die Anhänge.
 */
export function buildMail(config: Pick<IConfig, "websitePublicUrl" | "discordInviteUrl">, draft: IDraft): Options {
    const links: ILinks = { website: config.websitePublicUrl, discord: config.discordInviteUrl };
    const body = htmlToText(draft.html);

    const text = draft.plain
        ? `${body}${quotedText(draft.quote)}`
        : `${body}\n\n-- \n${draft.author.name} · ${draft.rank.label}\nTeam RL Nexus · ${draft.from.address}\n${links.website}${links.discord === null ? "" : `\n${links.discord}`}\n${quotedText(draft.quote)}`;

    const inline: Attachment[] = draft.plain
        ? []
        : [
              { filename: "rl-nexus.png", content: LOGO, contentType: "image/png", cid: LOGO_CID, contentDisposition: "inline" },
              ...(draft.avatar === null ? [] : [{ filename: "avatar.png", content: draft.avatar, contentType: "image/png", cid: AVATAR_CID, contentDisposition: "inline" as const }]),
          ];

    return {
        from: { name: draft.from.label, address: draft.from.address },
        to: draft.to.map(formatAddress),
        cc: draft.cc.map(formatAddress),
        bcc: draft.bcc.map(formatAddress),
        subject: draft.subject,
        html: draft.plain ? plainHtml(draft) : document(draft, links),
        text,
        inReplyTo: draft.inReplyTo ?? undefined,
        references: draft.references.length === 0 ? undefined : [...draft.references],
        attachments: [...inline, ...draft.files.map((file) => ({ filename: file.filename, content: file.content, contentType: file.contentType }))],
    };
}

export interface ISystemMail {
    readonly from: { readonly address: string; readonly label: string };
    readonly to: string;
    readonly replyTo: string;
    readonly subject: string;
    /** Aus Bausteinen des Editors (p, br, b, a data-button …), jeder eingesetzte Wert schon mit escapeHtml maskiert. */
    readonly html: string;
    /** Der Fuß, fertiges HTML. */
    readonly footer: string;
    readonly files: readonly IFile[];
    /** Unterzeile unter dem Logo. Ohne: der Name des Absenders. */
    readonly subline?: string;
}

/** Eine Mail ohne Person dahinter, etwa vom Shop: dieselbe Vorlage, ohne Signatur. */
export function buildSystemMail(mail: ISystemMail): Options {
    return {
        from: { name: mail.from.label, address: mail.from.address },
        to: mail.to,
        replyTo: mail.replyTo,
        subject: mail.subject,
        html: frame({ subject: mail.subject, label: mail.subline ?? mail.from.label, body: styled(mail.html), signature: "", quote: "", footer: mail.footer, live: false }),
        text: htmlToText(mail.html),
        attachments: [
            { filename: "rl-nexus.png", content: LOGO, contentType: "image/png", cid: LOGO_CID, contentDisposition: "inline" },
            ...mail.files.map((file) => ({ filename: file.filename, content: file.content, contentType: file.contentType })),
        ],
    };
}

const LOGO_DATA = `data:image/png;base64,${LOGO.toString("base64")}`;

/**
 * Die Mail, wie sie ankommt, für die Vorschau im Browser. Statt der
 * eingebetteten Bilder: das Logo als data:-URL, der Avatar direkt von Discord.
 */
export function previewHtml(config: Pick<IConfig, "websitePublicUrl" | "discordInviteUrl">, draft: IDraft, avatarUrl: string | null): string {
    if (draft.plain) return `<!doctype html><html lang="de"><head><meta charset="utf-8"></head><body style="margin:0;padding:16px;background:#fff;color:#202124;">${plainHtml(draft, true)}</body></html>`;

    const links: ILinks = { website: config.websitePublicUrl, discord: config.discordInviteUrl };
    // document() fragt nur, ob es einen Avatar gibt. Das Bild selbst kommt per Adresse.
    const html = document({ ...draft, avatar: avatarUrl === null ? null : Buffer.alloc(0) }, links, true);

    return html.replaceAll(`cid:${LOGO_CID}`, LOGO_DATA).replaceAll(`cid:${AVATAR_CID}`, escapeHtml(avatarUrl ?? ""));
}
