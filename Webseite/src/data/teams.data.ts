import { RLRank } from "../domain/enums/RLRank";
import { RosterRole } from "../domain/enums/RosterRole";
import type { ITeamDefinition } from "../domain/interfaces/ITeam";
import { RLTeam } from "../domain/models/RLTeam";

/**
 * Drei Beispiel-Kader.
 *
 * Erfundene Spieler. Auf einer öffentlichen Seite stehen keine echten Namen und
 * keine echten Ränge. Name und Farbe einer Stufe kommen aus `RANK_META`, damit
 * hier keine zweite Wahrheit entsteht.
 *
 * Absichtlich unterschiedlich besetzt: eines mit Co-Captain, Ersatz und Coach,
 * eines mit Trial und Manager und eines ganz ohne. So ist auf der Seite zu
 * sehen, dass nur zählt, wer fest spielt.
 */
const DEFINITIONS: readonly ITeamDefinition[] = [
    {
        id: "main",
        name: "Nexus Main",
        tag: "NXS",
        mode: "3v3",
        accent: "var(--c-red)",
        players: [
            { name: "Vortex", role: RosterRole.Captain, rank: RLRank.GrandChampion1, mmr: 1521 },
            { name: "Aeon", role: RosterRole.CoCaptain, rank: RLRank.GrandChampion1, mmr: 1488 },
            { name: "Kite", role: RosterRole.Starter, rank: RLRank.Champion3, mmr: 1442 },
            { name: "Nova", role: RosterRole.Substitute, rank: RLRank.Champion2, mmr: 1354 },
            { name: "Hexa", role: RosterRole.Coach, rank: RLRank.GrandChampion2, mmr: 1604 },
        ],
    },
    {
        id: "academy",
        name: "Nexus Academy",
        tag: "NXS.A",
        mode: "3v3",
        accent: "var(--c-blue)",
        players: [
            { name: "Slice", role: RosterRole.Captain, rank: RLRank.Champion1, mmr: 1276 },
            { name: "Riven", role: RosterRole.Starter, rank: RLRank.Diamond3, mmr: 1198 },
            { name: "Puls", role: RosterRole.Starter, rank: RLRank.Diamond3, mmr: 1184 },
            { name: "Echo", role: RosterRole.Trial, rank: RLRank.Diamond2, mmr: 1129 },
            { name: "Juno", role: RosterRole.Manager, rank: RLRank.Platin3, mmr: 1003 },
        ],
    },
    {
        id: "duo",
        name: "Nexus Duo",
        tag: "NXS.D",
        mode: "2v2",
        accent: "var(--c-mod-engagement)",
        players: [
            { name: "Fade", role: RosterRole.Captain, rank: RLRank.Champion2, mmr: 1341 },
            { name: "Onyx", role: RosterRole.Starter, rank: RLRank.Diamond1, mmr: 1062 },
        ],
    },
];

export const EXAMPLE_TEAMS: readonly RLTeam[] = DEFINITIONS.map((definition) => new RLTeam(definition));
