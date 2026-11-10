import type { ChangeKind, ISiteVersion } from "../../domain/interfaces/ISiteContent";

/**
 * W-0062: Namen und Farben für den Changelog. Ohne React, damit `npm run check`
 * es laden kann. Bereiche wie im Admin Dashboard (shared/changelog.ts).
 */
export const KIND: Readonly<Record<ChangeKind, { readonly label: string; readonly color: string; readonly one: string; readonly many: string; readonly unit: string }>> = {
    neu: { label: "Neu", color: "var(--c-win)", one: "neue Funktion", many: "neue Funktionen", unit: "Funktionen" },
    verbessert: { label: "Verbessert", color: "color-mix(in srgb, var(--c-purple) 72%, #fff)", one: "Verbesserung", many: "Verbesserungen", unit: "Änderungen" },
    behoben: { label: "Behoben", color: "var(--c-blue)", one: "behobener Fehler", many: "behobene Fehler", unit: "Fehler" },
};

export const KINDS: readonly ChangeKind[] = ["neu", "verbessert", "behoben"];

const AREAS: Readonly<Record<string, { readonly label: string; readonly alone: string; readonly color: string }>> = {
    bot: { label: "Bot", alone: "den Bot", color: "var(--c-red)" },
    dashboard: { label: "Bot-Dashboard", alone: "das Bot-Dashboard", color: "var(--c-mod-utility)" },
    admin: { label: "Admin", alone: "das Admin Dashboard", color: "var(--c-purple)" },
    webseite: { label: "Webseite", alone: "die Webseite", color: "var(--c-blue)" },
};

export const areaOf = (area: string): { readonly label: string; readonly color: string } => AREAS[area] ?? { label: area, color: "var(--c-text-faint)" };

/** „a, b und c“ */
function list(parts: readonly string[]): string {
    return parts.length < 2 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} und ${parts[parts.length - 1]}`;
}

export function countsOf(version: ISiteVersion): Record<ChangeKind, number> {
    const counts: Record<ChangeKind, number> = { neu: 0, verbessert: 0, behoben: 0 };

    for (const item of version.items) counts[item.kind] += 1;

    return counts;
}

/** „12 Änderungen: 5 neue Funktionen, 4 Verbesserungen und 3 behobene Fehler für Bot, Bot-Dashboard und Admin.“ */
export function versionSummary(version: ISiteVersion): string {
    const counts = countsOf(version);
    const total = version.items.length;

    if (total === 0) return "Diese Version enthält nur interne Änderungen.";
    const kinds = KINDS.filter((kind) => counts[kind] > 0).map((kind) => `${counts[kind]} ${counts[kind] === 1 ? KIND[kind].one : KIND[kind].many}`);
    const areas = [...new Set(version.items.map((item) => item.area))];
    const where = areas.length === 1 ? (AREAS[areas[0] ?? ""]?.alone ?? areas[0]) : list(areas.map((area) => areaOf(area).label));

    return `${total} ${total === 1 ? "Änderung" : "Änderungen"}: ${list(kinds)}${where ? ` für ${where}` : ""}.`;
}

const longDay = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** „5. November 2026“ aus JJJJ-MM-TT. */
export const releaseDay = (day: string): string => longDay.format(new Date(`${day.slice(0, 10)}T12:00:00Z`));
