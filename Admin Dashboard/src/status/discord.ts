/**
 * Discord-Text für die Vorschau der Statusmeldung (W-0052): genau das, was
 * `payload()` in server/status-post.ts schreibt, nicht mehr. Ohne DOM, damit
 * npm run check es prüfen kann.
 */

import type { IDiscordPostChannel, IDiscordPostResult } from "../../shared/status.ts";

/** Die Vorschau zeigt, was jemand in Deutschland sieht. Feste Zone, damit Prüfung und Browser dasselbe rechnen. */
const ZONE = "Europe/Berlin";

const FORMATS: Readonly<Record<string, Intl.DateTimeFormatOptions>> = {
    t: { timeStyle: "short" },
    T: { timeStyle: "medium" },
    d: { dateStyle: "short" },
    D: { dateStyle: "long" },
    f: { dateStyle: "long", timeStyle: "short" },
    F: { dateStyle: "full", timeStyle: "short" },
};

const UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 365 * 86_400],
    ["month", 30 * 86_400],
    ["day", 86_400],
    ["hour", 3600],
    ["minute", 60],
    ["second", 1],
];

/** `<t:Sekunden:Stil>` so, wie Discord es zeigt. Unbekannter Stil: null, dann bleibt der Text stehen. */
export function discordTime(seconds: number, style: string, now: number): string | null {
    if (style === "R") {
        const diff = seconds - now / 1000;
        const [unit, size] = UNITS.find(([, length]) => Math.abs(diff) >= length) ?? UNITS[UNITS.length - 1];

        return new Intl.RelativeTimeFormat("de", { numeric: "always" }).format(Math.round(diff / size), unit);
    }

    const format = FORMATS[style];

    return format ? new Intl.DateTimeFormat("de-DE", { ...format, timeZone: ZONE }).format(new Date(seconds * 1000)).replace(" um ", " ") : null;
}

export interface ISegment {
    readonly text: string;
    readonly bold: boolean;
}

export interface ILine {
    readonly kind: "h1" | "h2" | "h3" | "small" | "quote" | "text";
    readonly segments: readonly ISegment[];
}

const PREFIXES: readonly [string, ILine["kind"]][] = [
    ["### ", "h3"],
    ["## ", "h2"],
    ["# ", "h1"],
    ["-# ", "small"],
    ["> ", "quote"],
];

/** Eine Zeile: Zeitstempel einsetzen, dann an `**` in fett und nicht fett teilen. */
function segments(line: string, now: number): ISegment[] {
    const timed = line.replace(/<t:(-?\d+):([A-Za-z])>/g, (whole, seconds: string, style: string) => discordTime(Number(seconds), style, now) ?? whole);

    return timed
        .split("**")
        .map((text, index) => ({ text, bold: index % 2 === 1 }))
        .filter((part) => part.text !== "");
}

/** Der Hinweis nach „In Discord aktualisieren“: wo es geklappt hat, wie lange, sonst je Kanal der Fehler. */
export function postSummary(result: IDiscordPostResult): { readonly text: string; readonly ok: boolean } {
    const label = (channel: IDiscordPostChannel): string => (channel.name ? `#${channel.name}` : `Kanal ${channel.id}`);
    const done = result.channels.filter((channel) => channel.ok);
    const failed = result.channels.filter((channel) => !channel.ok);
    const where = done.length === 1 ? label(done[0]) : `${done.length} Kanälen`;
    const parts = [
        ...(done.length > 0 ? [`Neu geschrieben in ${where}`] : []),
        ...(failed.length === 0 ? [`${(result.ms / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} Sek.`] : failed.map((channel) => `${label(channel)}: ${channel.error}`)),
    ];

    return { text: parts.join(" · "), ok: failed.length === 0 };
}

/** Text eines Discord-Bausteins, Zeile für Zeile. */
export function discordLines(content: string, now: number): ILine[] {
    return content.split("\n").map((line) => {
        const [prefix, kind] = PREFIXES.find(([start]) => line.startsWith(start)) ?? ["", "text"];

        return { kind, segments: segments(line.slice(prefix.length), now) };
    });
}
