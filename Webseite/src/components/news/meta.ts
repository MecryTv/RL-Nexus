import type { IBlock, NewsCategory } from "../../domain/interfaces/ISiteContent";

/** W-0062: Namen und Farben der Arten. Farben nur als Farben der Webseite. */
export const CATEGORY: Readonly<Record<NewsCategory, { readonly label: string; readonly plural: string; readonly color: string }>> = {
    update: { label: "Update", plural: "Updates", color: "var(--c-blue)" },
    partner: { label: "Partner", plural: "Partner", color: "var(--c-purple)" },
    turnier: { label: "Turnier", plural: "Turniere", color: "var(--c-mod-engagement)" },
    ankuendigung: { label: "Ankündigung", plural: "Ankündigungen", color: "var(--c-red)" },
    wartung: { label: "Wartung", plural: "Wartung", color: "var(--c-mod-utility)" },
};

export const CHANGELOG_COLOR = "var(--c-win)";

const dayFormat = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });
const dayShort = new Intl.DateTimeFormat("de-DE", { day: "2-digit", timeZone: "Europe/Berlin" });
const monthShort = new Intl.DateTimeFormat("de-DE", { month: "short", timeZone: "Europe/Berlin" });
const timeFormat = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });

/** „06.11.2026“ */
export const day = (iso: string): string => dayFormat.format(new Date(iso));
/** „06“ und „Nov“ für den Zeitstrahl und Datumskästen. */
export const dayParts = (iso: string): { readonly day: string; readonly month: string } => ({
    day: dayShort.format(new Date(iso)),
    month: monthShort.format(new Date(iso)).replace(".", ""),
});
/** „19:00“ */
export const time = (iso: string): string => timeFormat.format(new Date(iso));

/** Lesezeit in Minuten, grob 200 Wörter je Minute, mindestens eine. */
export function readingMinutes(blocks: readonly IBlock[]): number {
    const words = blocks
        .map((block) => ("md" in block ? block.md : "text" in block ? block.text : ""))
        .join(" ")
        .split(/\s+/)
        .filter(Boolean).length;

    return Math.max(1, Math.round(words / 200));
}

/** „Aktualisiert“ erst, wenn mehr als zehn Minuten zwischen Veröffentlichen und letzter Änderung liegen. Die Zeiten kommen aus Node und der Datenbank und sind nie ganz gleich. */
export const wasUpdated = (publishedAt: string, updatedAt: string): boolean => Date.parse(updatedAt) - Date.parse(publishedAt) > 10 * 60_000;

/** „22.11.2026, 19:00 bis 21:00 Uhr · Discord“, über zwei Tage mit beiden Daten. */
export function eventText(event: { readonly startsAt: string; readonly endsAt: string | null; readonly place: string | null }): string {
    const start = `${day(event.startsAt)}, ${time(event.startsAt)}`;
    const range = !event.endsAt ? `${start} Uhr` : day(event.endsAt) === day(event.startsAt) ? `${start} bis ${time(event.endsAt)} Uhr` : `${start} Uhr bis ${day(event.endsAt)}, ${time(event.endsAt)} Uhr`;

    return event.place ? `${range} · ${event.place}` : range;
}

export type NewsFilter = NewsCategory | "changelog";

/** `?art=` aus der Adresse. Unbekanntes (alter Link) gilt als „Alle“. */
export const newsFilter = (value: string | null): NewsFilter | null => (value === "changelog" || (value !== null && value in CATEGORY) ? (value as NewsFilter) : null);
