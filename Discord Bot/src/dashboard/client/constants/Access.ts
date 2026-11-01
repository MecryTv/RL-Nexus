/**
 * W-0017: das Ende des Zugangs auf der Einstellungsseite. Die Daten kommen aus
 * AccessEnds im Bot (dieselben wie „Zugang anzeigen“ in der Shop-DM). Ohne
 * DOM, damit scripts/CheckDashboard.ts den Text prüfen kann.
 */

export interface IAccessEnd {
    name: string;
    kind: "trial" | "renews" | "cancelled" | "until" | "unlimited" | "frozen";
    endsAt: number | null;
}

const DATE = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
const RELATIVE = new Intl.RelativeTimeFormat("de-DE", { numeric: "auto" });

/** „in 30 Tagen“, „morgen“, „heute“ - in ganzen Tagen. */
function Relative(endsAt: number, now: number): string {
    return RELATIVE.format(Math.round((endsAt - now) / 86_400_000), "day");
}

export function AccessText(entry: IAccessEnd, now = Date.now()): string {
    if (entry.kind === "frozen") return `${entry.name} ruht gerade, die Tage bleiben stehen.`;
    if (entry.kind === "unlimited" || entry.endsAt === null) return `${entry.name} läuft unbegrenzt.`;

    const date = DATE.format(entry.endsAt);
    const relative = Relative(entry.endsAt, now);

    if (entry.kind === "renews") return `${entry.name} läuft bis ${date} und verlängert sich dann.`;
    if (entry.kind === "cancelled") return `${entry.name} ist gekündigt und endet am ${date} (${relative}).`;
    if (entry.kind === "trial") return `${entry.name} endet am ${date} (${relative}).`;

    return `${entry.name} läuft bis ${date} (${relative}).`;
}
