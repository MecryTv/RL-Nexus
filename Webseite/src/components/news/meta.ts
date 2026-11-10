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
