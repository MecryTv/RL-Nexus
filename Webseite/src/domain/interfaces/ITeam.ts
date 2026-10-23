import type { RLRank } from "../enums/RLRank";
import type { RosterRole } from "../enums/RosterRole";

/** Ein Spieler im Kader. */
export interface IPlayer {
    readonly name: string;
    readonly role: RosterRole;
    /** Die Rangstufe aus dem verknüpften Epic-Konto. */
    readonly rank: RLRank;
    readonly mmr: number;
}

/** Ein Team, wie es in den Beispieldaten steht. */
export interface ITeamDefinition {
    readonly id: string;
    readonly name: string;
    /** Das Kürzel vor dem Spielernamen, z. B. "NXS". */
    readonly tag: string;
    readonly mode: string;
    readonly accent: string;
    readonly players: readonly IPlayer[];
}

/** Ein Team samt allem, was sich aus dem Kader ergibt. */
export interface ITeam extends ITeamDefinition {
    /** Durchschnittliche MMR aller, die spielen. Der Staff zählt nicht mit. */
    readonly averageMMR: number;
    /** Captain, Co-Captain, Stamm und Ersatz. */
    readonly lineup: readonly IPlayer[];
}
