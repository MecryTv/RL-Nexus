import { PLAYING_ROLES, ROSTER_ORDER } from "../enums/RosterRole";
import type { IPlayer, ITeam, ITeamDefinition } from "../interfaces/ITeam";

/**
 * Ein Team der Organisation.
 *
 * Rechnet aus dem Kader aus, was auf der Team-Karte steht: wer spielt, wer
 * daneben steht und wie stark das Team im Schnitt ist. Nach derselben Regel wie
 * das Modul im Bot - nur mit Beispielspielern statt echten Konten.
 */
export class RLTeam implements ITeam {
    public constructor(private readonly definition: ITeamDefinition) {}

    public get id(): string {
        return this.definition.id;
    }

    public get name(): string {
        return this.definition.name;
    }

    public get tag(): string {
        return this.definition.tag;
    }

    public get mode(): string {
        return this.definition.mode;
    }

    public get accent(): string {
        return this.definition.accent;
    }

    /** Der Kader in fester Reihenfolge - Captain oben, Manager unten. */
    public get players(): readonly IPlayer[] {
        return [...this.definition.players].sort(
            (a, b) => ROSTER_ORDER.indexOf(a.role) - ROSTER_ORDER.indexOf(b.role)
        );
    }

    /** Wer spielt: Captain, Co-Captain, Stamm und Ersatz. */
    public get lineup(): readonly IPlayer[] {
        return this.definition.players.filter((player) => PLAYING_ROLES.includes(player.role));
    }

    /**
     * Der Schnitt aller, die spielen.
     *
     * Wie im Bot zählt nur, wer spielt: Captain, Co-Captain, Stamm und Ersatz.
     * Trial, Coach und Manager nicht. Der Bot gewichtet ab Werk nach WTSI mit
     * dem Peak; die Beispiele haben keinen Peak, deshalb steht hier der
     * einfache Schnitt der aktuellen MMR.
     */
    public get averageMMR(): number {
        const lineup = this.lineup;

        if (lineup.length === 0) return 0;

        return Math.round(lineup.reduce((sum, player) => sum + player.mmr, 0) / lineup.length);
    }
}
