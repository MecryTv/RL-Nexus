import type { EntryColor, IEntryLinks, ISection, ISiteEntry, SectionType } from "../../domain/interfaces/ISiteContent";

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

export function sectionOf(entry: ISiteEntry, type: SectionType): ISection | undefined {
    return entry.sections.find((section) => section.type === type);
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
