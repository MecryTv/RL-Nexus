/**
 * Partner, Sponsoren und Unterstützer (W-0062): Arten, Abschnitte der großen
 * Ansicht und ihre Regeln. Gilt für Server und Oberfläche; der Server prüft
 * verbindlich, die Oberfläche zeigt denselben Satz schon beim Tippen. Spec:
 * docs/superpowers/specs/2026-11-09-partner-news-design.md.
 */

export const ENTRY_KINDS = ["partner", "sponsor", "supporter"] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];
export const KIND_LABELS: Readonly<Record<EntryKind, string>> = { partner: "Partner", sponsor: "Sponsor", supporter: "Unterstützer" };

export const PARTNER_TYPES = ["organisation", "creator", "liga", "community"] as const;
export type PartnerType = (typeof PARTNER_TYPES)[number];
export const PARTNER_TYPE_LABELS: Readonly<Record<PartnerType, string>> = { organisation: "Organisation", creator: "Creator", liga: "Liga", community: "Community" };

export const SPONSOR_TIERS = ["main", "sponsor"] as const;
export type SponsorTier = (typeof SPONSOR_TIERS)[number];
export const TIER_LABELS: Readonly<Record<SponsorTier, string>> = { main: "Hauptsponsor", sponsor: "Sponsor" };

export const SUPPORTER_TYPES = ["firma", "creator", "community", "person"] as const;
export type SupporterType = (typeof SUPPORTER_TYPES)[number];
export const SUPPORTER_TYPE_LABELS: Readonly<Record<SupporterType, string>> = { firma: "Firma", creator: "Creator", community: "Community", person: "Person" };

/** Farben der Webseite; dort wird daraus `var(--c-…)`. */
export const ENTRY_COLORS = ["red", "blue", "purple", "gold", "green", "orange", "cyan", "silver"] as const;
export type EntryColor = (typeof ENTRY_COLORS)[number];

export const SECTION_TYPES = [
    "stats", "about", "teams", "achievements", "discord", "facts", "modules", "news",
    "together", "offer", "intro", "help", "tournaments", "links",
    "gallery", "video", "quote", "text",
] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

export const SECTION_LABELS: Readonly<Record<SectionType, string>> = {
    stats: "Kennzahlen", about: "Über uns", teams: "Teams aus RL Nexus", achievements: "Erfolge", discord: "Discord-Kasten",
    facts: "Steckbrief", modules: "Genutzte Module", news: "News", together: "Was wir zusammen machen", offer: "Angebot",
    intro: "Kurz vorgestellt", help: "Wie wir helfen", tournaments: "Unterstützt bei", links: "Links",
    gallery: "Galerie", video: "Video", quote: "Zitat", text: "Freier Text",
};

/** Standard-Reihenfolge je Art. */
export const SECTIONS_FOR: Readonly<Record<EntryKind, readonly SectionType[]>> = {
    partner: ["stats", "about", "teams", "achievements", "discord", "facts", "modules", "news"],
    sponsor: ["stats", "about", "together", "offer", "facts", "news"],
    supporter: ["intro", "stats", "help", "tournaments", "offer", "links"],
};

/** Was man im Fach „Abschnitte“ dazunehmen kann. */
export const EXTRA_SECTIONS_FOR: Readonly<Record<EntryKind, readonly SectionType[]>> = {
    partner: ["gallery", "video", "quote", "text"],
    sponsor: ["gallery", "video", "quote", "text"],
    supporter: [],
};

/** Diese Abschnitte dürfen mehrfach vorkommen. */
export const REPEATABLE: ReadonlySet<SectionType> = new Set(["gallery", "video", "quote", "text"]);

export const ENTRY_LIMITS = { name: 80, subtitle: 40, shortText: 200, stripText: 60, sectionText: 2000, items: 12, stats: 4, sections: 20, tournaments: 20 } as const;

export interface ISectionItem {
    readonly label: string;
    readonly value?: string;
    readonly text?: string;
    /** JJJJ-MM-TT */
    readonly date?: string;
}

export interface ISection {
    readonly type: SectionType;
    readonly visible: boolean;
    readonly title?: string;
    readonly text?: string;
    readonly items?: readonly ISectionItem[];
    /** Pfade unter /content/media/ */
    readonly images?: readonly string[];
    readonly url?: string;
    /** Rabattcode im Abschnitt „Angebot“. */
    readonly code?: string;
    readonly until?: string | null;
}

export interface IEntryLinks {
    readonly website?: string;
    readonly discord?: string;
    readonly x?: string;
    readonly twitch?: string;
    readonly youtube?: string;
    readonly tiktok?: string;
}

export const LINK_KEYS = ["website", "discord", "x", "twitch", "youtube", "tiktok"] as const;

export interface IEntryInput {
    readonly kind: EntryKind;
    readonly name: string;
    readonly partnerType: PartnerType | null;
    readonly tier: SponsorTier | null;
    readonly supporterType: SupporterType | null;
    /** Branche oder Untertitel, etwa „Hosting“ oder „Clip-Tool“. */
    readonly subtitle: string;
    readonly shortText: string;
    /** Nur Unterstützer: Text beim Drüberfahren in der Leiste. */
    readonly stripText: string | null;
    readonly color: EntryColor;
    readonly logo: string | null;
    readonly banner: string | null;
    /** Partner, Sponsor oder Unterstützer seit (JJJJ-MM-TT). */
    readonly since: string | null;
    /** Nur Unterstützer. */
    readonly endsOn: string | null;
    readonly hideAfterEnd: boolean;
    readonly links: IEntryLinks;
    readonly sections: readonly ISection[];
    /** Ansprechpartner (Discord-ID), nie bei Unterstützern. */
    readonly contactId: string | null;
    readonly access: "free" | "paid" | null;
    /** Verknüpfter Discord-Server für die Live-Zahlen. */
    readonly guildId: string | null;
    readonly showTeams: boolean;
    readonly visible: boolean;
    readonly onHome: boolean;
    /** News-Einträge der Art Termin. */
    readonly tournamentIds: readonly number[];
}

export interface IRoleState {
    /** given: vergeben · pending: wartet auf Beitritt · missing: fehlt (note sagt warum) · removing: soll weg, Wegnehmen steht noch aus · none: ohne Konto */
    readonly state: "given" | "pending" | "missing" | "removing" | "none";
    readonly note: string | null;
    readonly since: string | null;
}

export interface IEntry extends IEntryInput {
    readonly id: number;
    readonly slug: string;
    readonly position: number;
    readonly createdName: string;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly role: IRoleState | null;
    /** Dieser Eintrag hat dem Ansprechpartner die Gruppe Partner gegeben (dann nimmt er sie beim Entfernen wieder). */
    readonly groupGranted: boolean;
}

/* --- Regeln, auch für news.ts --------------------------------------------- */

export class Problem extends Error {}

export const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const SNOWFLAKE = /^\d{17,20}$/;
const MEDIA = /^\/content\/media\/[a-z0-9-]+\.(?:webp|png)$/;

export const record = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null && !Array.isArray(value);

export function textOf(value: unknown, label: string, max: number): string {
    if (typeof value !== "string") throw new Problem(`${label} fehlt.`);

    const text = value.replace(/\s+/g, " ").trim();

    if (!text) throw new Problem(`${label} fehlt.`);
    if (text.length > max) throw new Problem(`${label} darf höchstens ${max} Zeichen haben.`);

    return text;
}

/** Wie textOf, aber leer ist erlaubt. Zeilenumbrüche bleiben (für längere Texte). */
export function optionalText(value: unknown, label: string, max: number, multiline = false): string | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== "string") throw new Problem(`${label} hat nicht die erwartete Form.`);

    const text = multiline ? value.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim() : value.replace(/\s+/g, " ").trim();

    if (text.length > max) throw new Problem(`${label} darf höchstens ${max} Zeichen haben.`);

    return text || undefined;
}

export function isHttpsLink(value: unknown): value is string {
    if (typeof value !== "string" || value.length > 300 || !value.startsWith("https://") || /\s/.test(value)) return false;

    try {
        return new URL(value).protocol === "https:";
    } catch {
        return false;
    }
}

export function isMediaUrl(value: unknown): value is string {
    return typeof value === "string" && MEDIA.test(value);
}

export function dayOf(value: unknown, label: string): string | null {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value !== "string" || !DAY.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new Problem(`${label} braucht die Form JJJJ-MM-TT.`);

    return value;
}

export function mediaOf(value: unknown, label: string): string | null {
    if (value === null || value === undefined || value === "") return null;
    if (!isMediaUrl(value)) throw new Problem(`${label} muss ein hochgeladenes Bild sein.`);

    return value;
}

function bool(value: unknown): boolean {
    return value === true;
}

function oneOf<T extends string>(list: readonly T[], value: unknown, problem: string): T {
    const found = list.find((entry) => entry === value);

    if (!found) throw new Problem(problem);

    return found;
}

/* --- Abschnitte ----------------------------------------------------------- */

const VIDEO_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "twitch.tv", "www.twitch.tv", "clips.twitch.tv"]);

export function isVideoLink(value: unknown): value is string {
    return isHttpsLink(value) && VIDEO_HOSTS.has(new URL(value).hostname);
}

function itemOf(value: unknown): ISectionItem {
    if (!record(value)) throw new Problem("Ein Eintrag im Abschnitt hat nicht die erwartete Form.");

    const date = dayOf(value.date, "Das Datum");
    const item: ISectionItem = {
        label: textOf(value.label, "Die Beschriftung", 80),
        ...(optionalText(value.value, "Der Wert", 40) ? { value: optionalText(value.value, "Der Wert", 40) } : {}),
        ...(optionalText(value.text, "Der Text", 200) ? { text: optionalText(value.text, "Der Text", 200) } : {}),
        ...(date ? { date } : {}),
    };

    return item;
}

function sectionOf(value: unknown, kind: EntryKind): ISection {
    if (!record(value)) throw new Problem("Ein Abschnitt hat nicht die erwartete Form.");

    const type = oneOf(SECTION_TYPES, value.type, "Diesen Abschnitt gibt es nicht.");

    if (![...SECTIONS_FOR[kind], ...EXTRA_SECTIONS_FOR[kind]].includes(type)) {
        throw new Problem(`Der Abschnitt „${SECTION_LABELS[type]}“ passt nicht zu ${KIND_LABELS[kind] === "Unterstützer" ? "einem Unterstützer" : `einem ${KIND_LABELS[kind]}`}.`);
    }

    const items = value.items === undefined ? undefined : Array.isArray(value.items) ? value.items.map(itemOf) : null;

    if (items === null) throw new Problem("Die Einträge eines Abschnitts haben nicht die erwartete Form.");

    const max = type === "stats" ? ENTRY_LIMITS.stats : ENTRY_LIMITS.items;

    if (items && items.length > max) throw new Problem(`Höchstens ${max} Einträge im Abschnitt „${SECTION_LABELS[type]}“.`);

    const images = value.images === undefined ? undefined : Array.isArray(value.images) ? value.images : null;

    if (images === null || (images && (images.length > 12 || !images.every(isMediaUrl)))) throw new Problem("Die Galerie nimmt bis zu 12 hochgeladene Bilder.");

    let url: string | undefined;

    if (value.url !== undefined && value.url !== null && value.url !== "") {
        const link = value.url;

        if (type === "video" ? !isVideoLink(link) : !isHttpsLink(link)) {
            throw new Problem(type === "video" ? "Videos gehen nur als Link zu YouTube oder Twitch." : "Links müssen mit https:// beginnen.");
        }
        url = link as string;
    }

    const title = optionalText(value.title, "Die Überschrift", 80);
    const text = optionalText(value.text, "Der Text", ENTRY_LIMITS.sectionText, true);
    const code = optionalText(value.code, "Der Code", 40);
    const until = dayOf(value.until, "Gültig bis");

    return {
        type,
        visible: value.visible !== false,
        ...(title ? { title } : {}),
        ...(text ? { text } : {}),
        ...(items ? { items } : {}),
        ...(images ? { images: images as string[] } : {}),
        ...(url ? { url } : {}),
        ...(code ? { code } : {}),
        ...(until ? { until } : {}),
    };
}

/* --- Eintrag -------------------------------------------------------------- */

function linksOf(value: unknown): IEntryLinks {
    if (value === undefined || value === null) return {};
    if (!record(value)) throw new Problem("Die Links haben nicht die erwartete Form.");

    const links: Record<string, string> = {};

    for (const key of LINK_KEYS) {
        const link = value[key];

        if (link === undefined || link === null || link === "") continue;
        if (!isHttpsLink(link)) throw new Problem("Links müssen mit https:// beginnen.");

        links[key] = link;
    }

    return links;
}

function snowflakeOf(value: unknown, label: string): string | null {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value !== "string" || !SNOWFLAKE.test(value)) throw new Problem(`${label} ist keine gültige Discord-ID.`);

    return value;
}

function shape(value: unknown): IEntryInput {
    if (!record(value)) throw new Problem("Der Eintrag hat nicht die erwartete Form.");

    const kind = oneOf(ENTRY_KINDS, value.kind, "Wähl Partner, Sponsor oder Unterstützer.");
    const supporter = kind === "supporter";
    const name = textOf(value.name, "Der Name", ENTRY_LIMITS.name);
    const partnerType = kind === "partner" ? oneOf(PARTNER_TYPES, value.partnerType, "Wähl die Art des Partners.") : null;
    const tier = kind === "sponsor" ? oneOf(SPONSOR_TIERS, value.tier, "Wähl die Stufe des Sponsors.") : null;
    const supporterType = supporter ? oneOf(SUPPORTER_TYPES, value.supporterType, "Wähl die Art des Unterstützers.") : null;
    const stripText = supporter ? textOf(value.stripText, "Der Text für die Leiste", ENTRY_LIMITS.stripText) : null;

    if (!Array.isArray(value.sections)) throw new Problem("Die Abschnitte haben nicht die erwartete Form.");
    if (value.sections.length > ENTRY_LIMITS.sections) throw new Problem(`Höchstens ${ENTRY_LIMITS.sections} Abschnitte.`);

    const sections = value.sections.map((section) => sectionOf(section, kind));
    const seen = new Set<SectionType>();

    for (const section of sections) {
        if (seen.has(section.type) && !REPEATABLE.has(section.type)) throw new Problem(`Den Abschnitt „${SECTION_LABELS[section.type]}“ gibt es nur einmal.`);
        seen.add(section.type);
    }

    const contactId = supporter ? null : snowflakeOf(value.contactId, "Der Ansprechpartner");
    const access = contactId === null ? null : oneOf(["free", "paid"] as const, value.access, "Wähl Free oder Paid Access.");
    const tournaments = value.tournamentIds === undefined ? [] : value.tournamentIds;

    if (!Array.isArray(tournaments) || tournaments.length > ENTRY_LIMITS.tournaments || !tournaments.every((id) => Number.isSafeInteger(id) && id > 0)) {
        throw new Problem("Die Turniere haben nicht die erwartete Form.");
    }

    return {
        kind,
        name,
        partnerType,
        tier,
        supporterType,
        subtitle: optionalText(value.subtitle, "Der Untertitel", ENTRY_LIMITS.subtitle) ?? "",
        shortText: textOf(value.shortText, "Der Kurztext", ENTRY_LIMITS.shortText),
        stripText,
        color: oneOf(ENTRY_COLORS, value.color, "Diese Farbe gibt es nicht."),
        logo: mediaOf(value.logo, "Das Logo"),
        banner: mediaOf(value.banner, "Das Banner"),
        since: dayOf(value.since, "„Seit“"),
        endsOn: supporter ? dayOf(value.endsOn, "Das Ende") : null,
        hideAfterEnd: supporter && bool(value.hideAfterEnd),
        links: linksOf(value.links),
        sections,
        contactId,
        access,
        guildId: supporter ? null : snowflakeOf(value.guildId, "Der Server"),
        showTeams: kind === "partner" && bool(value.showTeams),
        visible: value.visible !== false,
        onHome: bool(value.onHome),
        tournamentIds: [...new Set(tournaments as number[])],
    };
}

/** Prüft einen Eintrag. Gibt ihn bereinigt zurück, sonst den Satz für die Oberfläche. */
export function checkEntryInput(value: unknown): { readonly input: IEntryInput } | { readonly problem: string } {
    try {
        return { input: shape(value) };
    } catch (error) {
        if (error instanceof Problem) return { problem: error.message };

        throw error;
    }
}

const UMLAUTS: Readonly<Record<string, string>> = { ä: "ae", ö: "oe", ü: "ue", ß: "ss" };

/** Adresse aus dem Namen: „Grüne Löwen e.V.“ → gruene-loewen-e-v, belegt → -2, -3 … */
export function slugify(name: string, taken: ReadonlySet<string>): string {
    const base = name
        .toLowerCase()
        .replace(/[äöüß]/g, (letter) => UMLAUTS[letter] ?? letter)
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 56)
        .replace(/-+$/g, "") || "eintrag";

    if (!taken.has(base)) return base;

    for (let n = 2; ; n += 1) {
        const candidate = `${base}-${n}`;

        if (!taken.has(candidate)) return candidate;
    }
}
