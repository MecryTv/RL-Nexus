import { DECAY_MS, GUARDS, LEVELS } from "../../constants/AntiVillain";
import { GuardId, IHit, ShieldLevel } from "../../interfaces/services/antivillain/IAntiVillain";

const POINTS = new Map(GUARDS.map((guard) => [guard.id, guard.points]));

export interface IScore {
    total: number;
    /** Die Treffer, die zählen - ein neuer Account erst, wenn etwas anderes dazukommt. */
    hits: IHit[];
}

/**
 * Die Verdachtspunkte je Person (Plan 31). Ein Wächter zählt je Person einmal in
 * der Stunde. Eine Stunde nach dem letzten Treffer ist alles verfallen.
 *
 * ponytail: lebt im Arbeitsspeicher und ist nach einem Neustart leer - die Punkte
 * gelten ohnehin nur eine Stunde.
 */
export class ScoreBook {
    private readonly entries = new Map<string, { last: number; hits: IHit[] }>();

    /**
     * key ist `${guildId}:${userId}`. points: ein eigener Wert statt der Punkte des
     * Wächters - bei Meldungen 25 je Melder. Ein höherer Wert ersetzt den alten Treffer.
     */
    Add(key: string, guard: GuardId, detail: string, now: number, points?: number): IScore {
        const entry = this.Live(key, now) ?? { last: now, hits: [] };
        const known = entry.hits.find((hit) => hit.guard === guard);
        const value = points ?? POINTS.get(guard) ?? 0;

        entry.last = now;
        if (!known) entry.hits.push({ guard, points: value, detail, at: now });
        else if (value > known.points) Object.assign(known, { points: value, detail, at: now });

        this.entries.set(key, entry);

        return Tally(entry.hits);
    }

    Of(key: string, now: number): IScore {
        const entry = this.Live(key, now);

        return entry ? Tally(entry.hits) : { total: 0, hits: [] };
    }

    Clear(key: string): void {
        this.entries.delete(key);
    }

    private Live(key: string, now: number): { last: number; hits: IHit[] } | null {
        const entry = this.entries.get(key);

        if (!entry) return null;
        if (now - entry.last > DECAY_MS) {
            this.entries.delete(key);
            return null;
        }

        return entry;
    }
}

function Tally(hits: IHit[]): IScore {
    // Ein neuer Account allein ist kein Verdacht, zusammen mit etwas anderem schon.
    const counted = hits.some((hit) => hit.guard !== "fresh") ? hits : [];

    return { total: counted.reduce((sum, hit) => sum + hit.points, 0), hits: [...counted] };
}

/** Was aus einer Summe folgt. Team-Accounts werden ab Werk nur gemeldet. */
export function Verdict(total: number, level: ShieldLevel, team: boolean, teamRule: "report" | "same"): "none" | "report" | "hold" {
    const { report, hold } = LEVELS[level];

    if (hold !== null && total >= hold) return team && teamRule === "report" ? "report" : "hold";

    return total >= report ? "report" : "none";
}
