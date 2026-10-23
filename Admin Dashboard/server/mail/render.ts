import sanitizeHtml from "sanitize-html";

/**
 * Fremde Mails anzeigen, ohne dass sie im Admin Dashboard etwas anrichten.
 *
 * Zwei Schichten: Hier fliegt alles raus, was etwas ausführen oder abschicken
 * könnte (Skripte, Formulare, on*-Attribute, javascript:). Im Browser landet
 * das Ergebnis dann in einem iframe mit sandbox und eigener CSP, die externe
 * Bilder nur zulässt, wenn jemand „Laden“ geklickt hat. Ein Tracking-Pixel in
 * einem Stylesheet bleibt so auch dann draußen, wenn es hier durchrutscht.
 */

const ESCAPES: Readonly<Record<string, string>> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

const EXTERNAL = /^https?:\/\//i;

export interface ISanitized {
    readonly html: string;
    /** Wie viele externe Bilder zurückgehalten wurden. */
    readonly blocked: number;
}

/**
 * Eine HTML-Mail bereinigen.
 *
 * `cids` ordnet eingebettete Bilder (`cid:logo`) ihrem Inhalt zu, sie kommen
 * als data:-Adresse hinein und brauchen kein „Laden“. Externe Bilder bleiben
 * leer, solange `images` fehlt, und werden gezählt.
 */
export function sanitizeMail(html: string, { images, cids }: { readonly images: boolean; readonly cids: ReadonlyMap<string, string> }): ISanitized {
    let blocked = 0;

    const clean = sanitizeHtml(html, {
        allowedTags: [...sanitizeHtml.defaults.allowedTags, "img", "style", "font", "center", "u", "s", "strike", "big", "small"],
        // <style> ist hier erlaubt: CSS führt nichts aus, und was es nachladen
        // will, hält die CSP des iframes auf.
        allowVulnerableTags: true,
        allowedAttributes: {
            "*": ["style", "class", "align", "valign", "width", "height", "bgcolor", "border", "cellpadding", "cellspacing", "dir", "color", "face", "size", "colspan", "rowspan"],
            a: ["href", "name", "title", "target", "rel"],
            img: ["src", "alt", "title", "width", "height", "data-blocked"],
        },
        allowedSchemes: ["http", "https", "mailto", "tel"],
        allowedSchemesByTag: { img: ["http", "https", "data", "cid"] },
        allowProtocolRelative: false,
        // Der Titel aus dem <head> einer Mail stünde sonst als Text über ihr.
        nonTextTags: ["script", "textarea", "option", "noscript", "title"],
        transformTags: {
            a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer" } }),
            img: (tagName, attribs) => {
                const src = attribs.src ?? "";

                if (src.toLowerCase().startsWith("cid:")) {
                    const data = cids.get(src.slice(4).replace(/^<|>$/g, ""));
                    return { tagName, attribs: { ...attribs, src: data ?? "" } };
                }

                if (EXTERNAL.test(src) && !images) {
                    blocked++;
                    return { tagName, attribs: { ...attribs, src: "", "data-blocked": "1" } };
                }

                return { tagName, attribs };
            },
        },
    });

    // Hintergrundbilder in Stilen zählen mit: Die CSP hält sie auf, „Laden“ soll sie trotzdem anbieten.
    if (!images) blocked += (clean.match(/url\(\s*['"]?https?:/gi) ?? []).length;

    return { html: clean, blocked };
}

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/g;

/** Eine Nur-Text-Mail als HTML, mit erkannten Links. */
export function textToHtml(text: string): string {
    const escaped = escapeHtml(text).replace(URL_PATTERN, (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);

    return `<div style="white-space:pre-wrap;font-family:system-ui,sans-serif;font-size:14px;line-height:1.55">${escaped}</div>`;
}

/** Der Anfang eines Textes für die Liste: ohne HTML, eine Zeile, höchstens 140 Zeichen. */
export function previewText(value: string, html: boolean): string {
    const plain = html
        ? value
              .replace(/<(style|script|head)[^>]*>[\s\S]*?<\/\1>/gi, " ")
              .replace(/<[^>]+>/g, " ")
              .replace(/&nbsp;/g, " ")
              .replace(/&amp;/g, "&")
              .replace(/&lt;/g, "<")
              .replace(/&gt;/g, ">")
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'")
        : value;

    const line = plain
        // Zitierte Zeilen und Trennlinien sagen in einer Vorschau nichts.
        .split(/\r?\n/)
        .filter((entry) => !entry.trimStart().startsWith(">"))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

    return line.length > 140 ? `${line.slice(0, 139)}…` : line;
}
