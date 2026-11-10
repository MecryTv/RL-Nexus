import type { EntryColor, IEntryLinks, ISection, ISiteEntry, ISiteLive, ISiteServer, SectionType } from "../../domain/interfaces/ISiteContent";

/** W-0062: Farben der Einträge als Farben der Webseite. Aus den Inhalten kommt nur der Schlüssel, nie CSS. */
export const ENTRY_COLOR: Readonly<Record<EntryColor, string>> = {
    red: "var(--c-red)",
    blue: "var(--c-blue)",
    purple: "var(--c-purple)",
    gold: "var(--c-mod-engagement)",
    green: "var(--c-win)",
    orange: "var(--c-mod-utility)",
    cyan: "var(--c-mod-community)",
    silver: "var(--c-text-dim)",
};

export const LINK_LABELS: Readonly<Record<keyof IEntryLinks, string>> = {
    website: "Webseite",
    discord: "Discord",
    x: "X",
    twitch: "Twitch",
    youtube: "YouTube",
    tiktok: "TikTok",
};

/** „Apex Vortex Esports“ → AV, wenn es kein Logo gibt. */
export function initials(name: string): string {
    return name
        .split(/\s+/)
        .filter((word) => /[\p{L}\p{N}]/u.test(word))
        .slice(0, 2)
        .map((word) => (word.match(/[\p{L}\p{N}]/u)?.[0] ?? "").toUpperCase())
        .join("");
}

/** Der Abschnitt einer Art, wenn er sichtbar ist. Die Studios schicken auch ausgeblendete mit (Vorschau). */
export function sectionOf(entry: ISiteEntry, type: SectionType): ISection | undefined {
    return entry.sections.find((section) => section.type === type && section.visible);
}

/** Links in fester Reihenfolge, nur die eingetragenen. */
export function linksOf(entry: ISiteEntry): { readonly key: keyof IEntryLinks; readonly href: string; readonly label: string }[] {
    return (Object.keys(LINK_LABELS) as (keyof IEntryLinks)[]).flatMap((key) => {
        const href = entry.links[key];

        return href ? [{ key, href, label: LINK_LABELS[key] }] : [];
    });
}

/** „Juni 2026“ aus JJJJ-MM-TT. */
export function monthYear(day: string | null): string | null {
    return day ? new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${day.slice(0, 10)}T12:00:00Z`)) : null;
}

/** „06.11.2026“ aus einem Datum oder Zeitpunkt. */
export function shortDate(value: string): string {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);

    return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" }).format(date);
}

/** Absätze aus einem Text mit Leerzeilen. Einzelne Zeilenumbrüche bleiben im Absatz (white-space: pre-line). */
export function paragraphs(text: string | undefined): string[] {
    return (text ?? "").split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
}

/** Was das Unterstützer-Fenster aus den Abschnitten zeigt, in der gespeicherten Reihenfolge. Links stehen im Fuß (Abschnitt „links“). */
const SUPPORTER_BLOCKS: readonly SectionType[] = ["intro", "stats", "help", "tournaments", "offer"];

export function supporterBlocks(entry: ISiteEntry): { readonly type: SectionType; readonly index: number }[] {
    return entry.sections.flatMap((section, index) => (section.visible && SUPPORTER_BLOCKS.includes(section.type) ? [{ type: section.type, index }] : []));
}

const berlinDay = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" });

/** Ein Angebot gilt bis einschließlich „Gültig bis“ in Berliner Zeit. Ohne Code oder Text gibt es nichts zu zeigen. */
export function offerActive(section: ISection | undefined, now: Date = new Date()): boolean {
    if (!section || (!section.code && !section.text)) return false;

    return !section.until || section.until.slice(0, 10) >= berlinDay.format(now);
}

/** Live-Daten eines Eintrags. Nur eigene Schlüssel, sonst wäre `constructor` ein Server. */
export function liveFor(live: ISiteLive | undefined, slug: string): ISiteServer | null {
    return live && Object.hasOwn(live.servers, slug) ? (live.servers[slug] ?? null) : null;
}
