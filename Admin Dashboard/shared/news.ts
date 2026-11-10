/**
 * News (W-0062): Beiträge, Kurzmeldungen und Termine aus Bausteinen. Gilt für
 * Server und Oberfläche wie shared/partners.ts. Spec:
 * docs/superpowers/specs/2026-11-09-partner-news-design.md, Teil 3 und 6.
 */

import { isHttpsLink, isVideoLink, mediaOf, optionalText, Problem, record, textOf } from "./partners.ts";

export const NEWS_KINDS = ["beitrag", "kurz", "termin"] as const;
export type NewsKind = (typeof NEWS_KINDS)[number];
export const NEWS_KIND_LABELS: Readonly<Record<NewsKind, string>> = { beitrag: "Beitrag", kurz: "Kurzmeldung", termin: "Termin" };

export const NEWS_CATEGORIES = ["update", "partner", "turnier", "ankuendigung", "wartung"] as const;
export type NewsCategory = (typeof NEWS_CATEGORIES)[number];
export const CATEGORY_LABELS: Readonly<Record<NewsCategory, string>> = {
    update: "Update", partner: "Partner/Sponsoring", turnier: "Turnier", ankuendigung: "Ankündigung", wartung: "Wartung",
};

export const POST_STATES = ["draft", "scheduled", "published"] as const;
export type PostState = (typeof POST_STATES)[number];

export const PIN_STATES = ["none", "big", "small"] as const;
export type PinState = (typeof PIN_STATES)[number];

export const BLOCK_TYPES = ["text", "heading", "image", "gallery", "callout", "quote", "partner", "event", "video", "button", "divider"] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export const BLOCK_LABELS: Readonly<Record<BlockType, string>> = {
    text: "Text", heading: "Überschrift", image: "Bild", gallery: "Galerie", callout: "Hinweis", quote: "Zitat",
    partner: "Partner-Karte", event: "Termin", video: "Video", button: "Knopf", divider: "Trenner",
};

export const NEWS_LIMITS = { title: 120, summary: 200, blocks: 60, text: 4000 } as const;

export type IBlock =
    | { readonly type: "text"; readonly md: string; readonly size: "normal" | "lead"; readonly width: "text" | "full" }
    | { readonly type: "heading"; readonly text: string }
    | { readonly type: "image"; readonly url: string; readonly alt: string; readonly caption: string | null }
    | { readonly type: "gallery"; readonly images: readonly string[] }
    | { readonly type: "callout"; readonly title: string | null; readonly text: string }
    | { readonly type: "quote"; readonly text: string; readonly by: string | null }
    | { readonly type: "partner"; readonly entryId: number }
    | { readonly type: "event"; readonly title: string; readonly startsAt: string; readonly place: string | null }
    | { readonly type: "video"; readonly url: string }
    | { readonly type: "button"; readonly label: string; readonly url: string }
    | { readonly type: "divider" };

export interface IPostEvent {
    /** ISO-Zeitpunkt */
    readonly startsAt: string;
    readonly endsAt: string | null;
    readonly place: string | null;
}

export interface IPostInput {
    readonly kind: NewsKind;
    readonly category: NewsCategory;
    readonly title: string;
    /** Nur beim ersten Speichern; danach bleibt die Adresse. */
    readonly slug?: string;
    readonly summary: string;
    readonly cover: string | null;
    readonly blocks: readonly IBlock[];
    /** Verknüpfter Partner oder Sponsor. */
    readonly entryId: number | null;
    /** Nur bei kind termin. */
    readonly event: IPostEvent | null;
    readonly status: PostState;
    /** ISO-Zeitpunkt, nur bei status scheduled. */
    readonly publishAt: string | null;
    readonly pinned: PinState;
    readonly announce: boolean;
}

export interface IPost extends IPostInput {
    readonly id: number;
    readonly slug: string;
    readonly publishedAt: string | null;
    readonly authorName: string;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly announcedAt: string | null;
}

const MOMENT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function oneOf<T extends string>(list: readonly T[], value: unknown, problem: string): T {
    const found = list.find((entry) => entry === value);

    if (!found) throw new Problem(problem);

    return found;
}

function momentOf(value: unknown, label: string): string {
    if (typeof value !== "string" || !MOMENT.test(value) || Number.isNaN(Date.parse(value))) throw new Problem(`${label} fehlt oder hat nicht die Form Datum und Uhrzeit.`);

    return new Date(value).toISOString();
}

function idOf(value: unknown, label: string): number {
    if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Problem(`${label} fehlt.`);

    return value as number;
}

function blockOf(value: unknown): IBlock {
    if (!record(value)) throw new Problem("Ein Baustein hat nicht die erwartete Form.");

    const type = oneOf(BLOCK_TYPES, value.type, "Diesen Baustein gibt es nicht.");

    switch (type) {
        case "text":
            return {
                type,
                md: (() => {
                    const md = optionalText(value.md, "Der Text", NEWS_LIMITS.text, true);

                    if (!md) throw new Problem("Ein Text-Baustein ist leer.");

                    return md;
                })(),
                size: value.size === "lead" ? "lead" : "normal",
                width: value.width === "full" ? "full" : "text",
            };
        case "heading":
            return { type, text: textOf(value.text, "Die Überschrift", 120) };
        case "image": {
            const url = mediaOf(value.url, "Das Bild");

            if (!url) throw new Problem("Ein Bild-Baustein hat kein Bild.");

            return { type, url, alt: optionalText(value.alt, "Der Alternativtext", 200) ?? "", caption: optionalText(value.caption, "Die Bildunterschrift", 200) ?? null };
        }
        case "gallery": {
            const images = Array.isArray(value.images) ? value.images.map((image) => mediaOf(image, "Ein Galeriebild")) : null;

            if (!images || images.length < 2 || images.length > 12 || images.some((image) => image === null)) throw new Problem("Eine Galerie braucht 2 bis 12 hochgeladene Bilder.");

            return { type, images: images as string[] };
        }
        case "callout":
            return { type, title: optionalText(value.title, "Die Überschrift des Hinweises", 80) ?? null, text: textOf(value.text, "Der Hinweis", 1000) };
        case "quote":
            return { type, text: textOf(value.text, "Das Zitat", 600), by: optionalText(value.by, "Von wem", 80) ?? null };
        case "partner":
            return { type, entryId: idOf(value.entryId, "Der Partner") };
        case "event":
            return { type, title: textOf(value.title, "Der Termin", 80), startsAt: momentOf(value.startsAt, "Der Zeitpunkt"), place: optionalText(value.place, "Der Ort", 80) ?? null };
        case "video":
            if (!isVideoLink(value.url)) throw new Problem("Videos gehen nur als Link zu YouTube oder Twitch.");

            return { type, url: value.url };
        case "button":
            if (!isHttpsLink(value.url)) throw new Problem("Ein Knopf braucht einen Link mit https://.");

            return { type, label: textOf(value.label, "Die Beschriftung des Knopfs", 40), url: value.url };
        case "divider":
            return { type };
    }
}

function eventOf(value: unknown): IPostEvent {
    if (!record(value)) throw new Problem("Ein Termin braucht Datum und Uhrzeit.");

    const startsAt = momentOf(value.startsAt, "Der Beginn");
    const endsAt = value.endsAt === null || value.endsAt === undefined || value.endsAt === "" ? null : momentOf(value.endsAt, "Das Ende");

    if (endsAt && Date.parse(endsAt) < Date.parse(startsAt)) throw new Problem("Das Ende liegt vor dem Beginn.");

    return { startsAt, endsAt, place: optionalText(value.place, "Der Ort", 80) ?? null };
}

function shape(value: unknown): IPostInput {
    if (!record(value)) throw new Problem("Der Beitrag hat nicht die erwartete Form.");

    const kind = oneOf(NEWS_KINDS, value.kind, "Wähl Beitrag, Kurzmeldung oder Termin.");
    const status = oneOf(POST_STATES, value.status, "Wähl Entwurf, Sofort oder Geplant.");

    if (!Array.isArray(value.blocks)) throw new Problem("Die Bausteine haben nicht die erwartete Form.");
    if (value.blocks.length > NEWS_LIMITS.blocks) throw new Problem(`Höchstens ${NEWS_LIMITS.blocks} Bausteine.`);

    let slug: string | undefined;

    if (value.slug !== undefined && value.slug !== null && value.slug !== "") {
        if (typeof value.slug !== "string" || value.slug.length > 60 || !SLUG.test(value.slug)) throw new Problem("Die Adresse darf nur Kleinbuchstaben, Ziffern und Bindestriche haben.");
        slug = value.slug;
    }

    return {
        kind,
        category: oneOf(NEWS_CATEGORIES, value.category, "Wähl eine Art für den Beitrag."),
        title: textOf(value.title, "Der Titel", NEWS_LIMITS.title),
        ...(slug ? { slug } : {}),
        summary: textOf(value.summary, "Der Kurztext", NEWS_LIMITS.summary),
        cover: mediaOf(value.cover, "Das Titelbild"),
        blocks: value.blocks.map(blockOf),
        entryId: value.entryId === null || value.entryId === undefined ? null : idOf(value.entryId, "Der Partner"),
        event: kind === "termin" ? eventOf(value.event) : null,
        status,
        publishAt: status === "scheduled" ? momentOf(value.publishAt, "Der Zeitpunkt der Veröffentlichung") : null,
        pinned: oneOf(PIN_STATES, value.pinned ?? "none", "So kann man nicht anheften."),
        announce: value.announce === true,
    };
}

/** Prüft einen Beitrag. Gibt ihn bereinigt zurück, sonst den Satz für die Oberfläche. */
export function checkPostInput(value: unknown): { readonly input: IPostInput } | { readonly problem: string } {
    try {
        return { input: shape(value) };
    } catch (error) {
        if (error instanceof Problem) return { problem: error.message };

        throw error;
    }
}
