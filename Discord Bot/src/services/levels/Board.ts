/**
 * Level System, Plan 34: die reine Rechnung hinter der Rangliste - Reihenfolge,
 * Trend und das Vergleichsfenster. Ohne Discord und Datenbank, damit Discord-
 * Bild, Dashboard und Web dasselbe zeigen. Siehe docs/Levels.md.
 */
import { LevelPeriod } from "../../interfaces/services/levels/ILevels";

/** Platz je Person: nur mit Punkten, die meisten zuerst, bei Gleichstand nach ID. */
export function RankOrder(rows: { userId: string; xp: number }[]): Map<string, number> {
    const sorted = rows.filter((row) => row.xp > 0).sort((a, b) => b.xp - a.xp || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));

    return new Map(sorted.map((row, index) => [row.userId, index + 1]));
}

/** Plätze gestiegen (positiv) oder gefallen (negativ); "new", wenn die Person vorher nicht dabei war. */
export function Trend(now: Map<string, number>, before: Map<string, number>, userId: string): number | "new" {
    const was = before.get(userId);
    const is = now.get(userId);

    return was === undefined || is === undefined ? "new" : was - is;
}

/** Wie lang ein Zeitraum ist. null: Lifetime. */
export function PeriodDays(period: LevelPeriod): number | null {
    return period === "7d" ? 7 : period === "30d" ? 30 : null;
}

/** Womit der Trend vergleicht: dasselbe Fenster sieben Tage früher, bei Lifetime der Stand vor sieben Tagen. */
export function PreviousWindow(period: LevelPeriod, today: number): { from: number; to: number } | "lifetime-minus-7" {
    const days = PeriodDays(period);

    return days === null ? "lifetime-minus-7" : { from: today - days - 6, to: today - 7 };
}
