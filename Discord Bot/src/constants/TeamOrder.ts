/**
 * In welcher Reihenfolge die Teams in der Übersicht stehen: Karten, Menü und
 * {teams}. Bot und Dashboard teilen sich diese Datei wie TeamList.ts - der Bot
 * ordnet damit beim Veröffentlichen, das Dashboard jede Vorschau, und so zeigen
 * beide dasselbe. Deshalb ohne Imports. Siehe docs/Teams.md, Abschnitt
 * „Reihenfolge“.
 */

export type TeamOrderBy = "custom" | "mmr" | "name" | "created" | "players" | "league";
export type TeamOrderDirection = "asc" | "desc";

export interface ITeamOrder {
    by: TeamOrderBy;
    direction: TeamOrderDirection;
    /** „Immer oben“: diese Teams in dieser Folge über allen anderen. */
    pinned: number[];
    /** „Eigene Reihenfolge“: Team-IDs von oben nach unten. Wer fehlt, steht dahinter wie bisher. */
    custom: number[];
}

/** Was die Reihenfolge von einem Team wissen muss. */
export interface IOrderFacts {
    id: number;
    name: string;
    position: number;
    createdAt: number;
    /** null: zu wenig Daten - steht in beiden Richtungen am Ende. */
    mmr: number | null;
    players: number;
    /** Die erste Liga des Teams. null: keine - steht am Ende. */
    league: string | null;
}

/** Die Knöpfe „Danach sortiert nach“, von links nach rechts. */
export const TEAM_ORDER_BY: TeamOrderBy[] = ["mmr", "name", "created", "players", "league", "custom"];

export const TEAM_ORDER_LABELS: Record<TeamOrderBy, string> = {
    mmr: "Team-MMR",
    name: "Alphabetisch",
    created: "Neueste zuerst",
    players: "Anzahl Spieler",
    league: "Liga",
    custom: "Eigene Reihenfolge",
};

/** Je Sortierung die beiden Richtungen. first: die, die beim Wechsel der Sortierung gilt. */
export const TEAM_ORDER_DIRECTIONS: Record<Exclude<TeamOrderBy, "custom">, { first: TeamOrderDirection; labels: Record<TeamOrderDirection, string> }> = {
    mmr: { first: "desc", labels: { desc: "Höchste zuerst", asc: "Niedrigste zuerst" } },
    name: { first: "asc", labels: { asc: "A bis Z", desc: "Z bis A" } },
    created: { first: "desc", labels: { desc: "Neueste zuerst", asc: "Älteste zuerst" } },
    players: { first: "desc", labels: { desc: "Meiste zuerst", asc: "Wenigste zuerst" } },
    league: { first: "asc", labels: { asc: "A bis Z", desc: "Z bis A" } },
};

/** Ab Werk: die Reihenfolge von vor Plan 21 (position, dann id). */
export function DefaultTeamOrder(): ITeamOrder {
    return { by: "custom", direction: "asc", pinned: [], custom: [] };
}

/** Die heutige Reihenfolge - Gleichstand bei jeder Sortierung. */
function byPosition(a: IOrderFacts, b: IOrderFacts): number {
    return a.position - b.position || a.id - b.id;
}

/** Vergleicht zwei Werte; null steht in beiden Richtungen hinten. */
function compare<V extends number | string>(a: V | null, b: V | null, direction: TeamOrderDirection): number {
    if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;

    // numeric: „Team 9“ vor „Team 10“ (W-0025).
    const raw = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "de", { numeric: true });

    return direction === "asc" ? raw : -raw;
}

/**
 * Stehen die Karten schon in dieser Folge im Kanal? Discord ordnet Nachrichten
 * nach dem Senden, also müssen die IDs (Snowflakes) streng zunehmen. Fehlt eine
 * Karte in der Mitte, stimmt es nicht; fehlende am Ende werden angehängt.
 */
export function CardsInOrder(messageIds: readonly (string | null)[]): boolean {
    let last: bigint | null = null;
    let gap = false;

    for (const id of messageIds) {
        if (id === null) {
            gap = true;
            continue;
        }

        const current = BigInt(id);

        if (gap || (last !== null && current <= last)) return false;

        last = current;
    }

    return true;
}

/**
 * Ordnet die Teams: erst die angehefteten in ihrer Folge, dann der Rest nach
 * der Sortierung. Unbekannte IDs in pinned und custom fallen still weg.
 */
export function OrderTeams<T>(teams: readonly T[], facts: (team: T) => IOrderFacts, order: ITeamOrder): T[] {
    const entries = teams.map((team) => ({ team, facts: facts(team) }));
    const pins = [...new Set(order.pinned)];
    const pinned = pins.flatMap((id) => entries.filter((entry) => entry.facts.id === id));
    const rest = entries.filter((entry) => !pins.includes(entry.facts.id));

    const key = (entry: IOrderFacts): number | string | null => {
        if (order.by === "mmr") return entry.mmr;
        if (order.by === "name") return entry.name;
        if (order.by === "created") return entry.createdAt;
        if (order.by === "players") return entry.players;
        if (order.by === "league") return entry.league;

        // custom: der Platz in der Liste, wer fehlt, steht dahinter.
        const index = order.custom.indexOf(entry.id);

        return index === -1 ? null : index;
    };
    const direction = order.by === "custom" ? "asc" : order.direction;

    rest.sort((a, b) => compare(key(a.facts), key(b.facts), direction) || byPosition(a.facts, b.facts));

    return [...pinned, ...rest].map((entry) => entry.team);
}
