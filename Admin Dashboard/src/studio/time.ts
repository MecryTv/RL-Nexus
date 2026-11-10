/**
 * W-0062 Teil 2: Zeiten der Studios. Eingegeben wird in Berliner Zeit
 * (`<input type="datetime-local">`), an den Server geht der Zeitpunkt mit
 * Versatz: Ohne liest der Server ihn in der Zeit des Containers.
 */
const ZONE = "Europe/Berlin";
const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const offsetFormat = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, timeZoneName: "longOffset" });
const partsFormat = new Intl.DateTimeFormat("sv-SE", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** Versatz Berlins zu einem Zeitpunkt in Minuten (60 im Winter, 120 im Sommer). */
function offsetAt(ms: number): number {
    const name = offsetFormat.formatToParts(new Date(ms)).find((part) => part.type === "timeZoneName")?.value ?? "GMT";
    const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name);

    return match ? (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) : 0;
}

const pad = (value: number): string => String(Math.abs(value)).padStart(2, "0");

/**
 * „2026-11-12T18:00“ (Berlin) → „2026-11-12T18:00:00+01:00“. Die Stunde, die es
 * bei der Umstellung im März nicht gibt, rückt eine Stunde vor. Unsinn → null.
 */
export function berlinToIso(local: string): string | null {
    const match = LOCAL.exec(local);

    if (!match) return null;

    const [, year, month, day, hour, minute] = match.map(Number) as [number, number, number, number, number, number];
    const wall = Date.UTC(year, month - 1, day, hour, minute);

    if (Number.isNaN(wall) || new Date(wall).getUTCDate() !== day) return null;

    // Zweimal: erst den Versatz an der Uhrzeit raten, dann am Ergebnis prüfen.
    const first = wall - offsetAt(wall) * 60_000;
    const offset = offsetAt(first);
    const instant = wall - offset * 60_000;
    const shown = isoToBerlin(new Date(instant).toISOString());

    if (shown !== local) {
        // Lücke der Zeitumstellung: denselben Zeitpunkt mit dem neuen Versatz schreiben.
        return `${shown}:00${offsetText(offsetAt(instant))}`;
    }

    return `${local}:00${offsetText(offset)}`;
}

function offsetText(minutes: number): string {
    return `${minutes < 0 ? "-" : "+"}${pad(Math.trunc(minutes / 60))}:${pad(minutes % 60)}`;
}

/** Zeitpunkt → „2026-11-12T18:00“ in Berliner Zeit, für `datetime-local`. */
export function isoToBerlin(iso: string): string {
    return partsFormat.format(new Date(iso)).replace(" ", "T");
}

/** Heute in Berlin als JJJJ-MM-TT. */
export function todayBerlin(now: Date = new Date()): string {
    return partsFormat.format(now).slice(0, 10);
}
