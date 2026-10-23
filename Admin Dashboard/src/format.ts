/**
 * Zahlen, Laufzeiten und Daten so, wie sie im Admin Dashboard stehen: deutsch
 * und ohne Nachkommastellen, die niemand braucht. Ohne DOM, damit der Check
 * unter Node mitlaufen kann.
 */

const NUMBER = new Intl.NumberFormat("de-DE");
const MONTH = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" });
const DATE = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short", year: "numeric" });
const TIME = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const DATE_TIME = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const SIZE = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
const PERCENT = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });
const UNITS = ["B", "KB", "MB", "GB"] as const;

/** „512 B“, „1,5 KB“, „5,9 MB“. In 1024er-Stufen, wie Windows sie anzeigt. */
export function formatBytes(bytes: number): string {
    let value = Math.max(0, bytes);
    let unit = 0;

    while (value >= 1024 && unit < UNITS.length - 1) {
        value /= 1024;
        unit++;
    }

    return `${SIZE.format(value)} ${UNITS[unit]}`;
}

export function formatNumber(value: number): string {
    return NUMBER.format(value);
}

/** Verfügbarkeit: „99,98 %“, „100 %“, ohne Messung ein Strich. */
export function formatPercent(value: number | null): string {
    return value === null ? "–" : `${PERCENT.format(value)} %`;
}

/** Eine Laufzeit in Sekunden: „3 Tage, 4 Std.“, „4 Std. 12 Min.“, „12 Min.“, „45 Sek.“ */
export function formatDuration(seconds: number): string {
    const total = Math.max(0, Math.floor(seconds));
    const days = Math.floor(total / 86_400);
    const hours = Math.floor((total % 86_400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);

    if (days > 0) return `${days} ${days === 1 ? "Tag" : "Tage"}, ${hours} Std.`;
    if (hours > 0) return `${hours} Std. ${minutes} Min.`;
    if (minutes > 0) return `${minutes} Min.`;

    return `${total} Sek.`;
}

/** „März 2026“, ohne Datum „unbekannt“. */
export function formatMonth(iso: string | null): string {
    return iso ? MONTH.format(new Date(iso)) : "unbekannt";
}

/** „15. März 2021“ */
export function formatDate(iso: string): string {
    return DATE.format(new Date(iso));
}

/** „18:47:05“ */
export function formatTime(timestamp: number): string {
    return TIME.format(new Date(timestamp));
}

/** „5. Okt. 2026, 15:29“ */
export function formatDateTime(iso: string): string {
    return DATE_TIME.format(new Date(iso));
}

/** Wie lange eine Session des Bots lief: „2 Std. 12 Min.“, bei einer laufenden „seit …“, ohne Ende „–“. */
export function formatSessionDuration(
    session: { readonly startedAt: string; readonly endedAt: string | null; readonly running: boolean },
    now = Date.now()
): string {
    const start = Date.parse(session.startedAt);

    if (session.endedAt) return formatDuration((Date.parse(session.endedAt) - start) / 1000);
    if (session.running) return `seit ${formatDuration((now - start) / 1000)}`;

    return "–";
}

/** ISO in den Wert eines datetime-local-Felds, in der Zeitzone des Browsers. */
export function toLocalInput(iso: string | undefined): string {
    if (iso === undefined) return "";

    const date = new Date(iso);
    const pad = (value: number): string => String(value).padStart(2, "0");

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Der Wert eines datetime-local-Felds gilt als Ortszeit. Gespeichert wird ISO in UTC. */
export function fromLocalInput(value: string): string | undefined {
    const time = Date.parse(value);

    return value === "" || !Number.isFinite(time) ? undefined : new Date(time).toISOString();
}
