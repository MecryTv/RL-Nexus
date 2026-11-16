import { RLRank } from "../domain/enums/RLRank";
import type { IRankPreview } from "../domain/interfaces/IRankPreview";

/**
 * Die Beispielkarte im Hero.
 *
 * Nachgebaut nach der Karte, die der Bot tatsächlich ausgibt: dieselben
 * Blöcke, dieselbe Anordnung, dieselben Abzeichen. Rangname und Farbe kommen
 * aus `RANK_META`, damit hier keine zweite Wahrheit entsteht.
 *
 * Die 1v1-Playlist steht absichtlich in der Platzierung. Dieser Zustand kommt
 * im Spiel jede Season vor, und eine Beispielkarte, auf der alles ausgefüllt
 * ist, verschweigt genau den Fall, den man sehen will.
 */
export const RANK_PREVIEW: IRankPreview = {
    player: "MecryTv",
    handle: "@mecrytv",
    badge: "DEV",
    reward: { rank: RLRank.Diamond3, label: "Diamant", progress: 0.7 },
    tournament: { rank: RLRank.GrandChampion1, division: "Division I", mmr: 1452, games: 12 },
    playlists: [
        {
            playlist: "1v1",
            subtitle: "DUELL",
            rank: RLRank.Unranked,
            division: "",
            mmr: 779,
            streak: 3,
            games: 2,
            placement: { played: 2, needed: 10 },
        },
        {
            playlist: "2v2",
            subtitle: "DOPPEL",
            rank: RLRank.Champion3,
            division: "Division II",
            mmr: 1350,
            streak: -4,
            games: 40,
        },
        {
            playlist: "3v3",
            subtitle: "TEAM",
            rank: RLRank.Champion1,
            division: "Division IV",
            mmr: 1180,
            streak: 0,
            games: 95,
        },
    ],
    // Dropshot steht noch vor dem ersten Spiel: so sieht die Kachel ohne MMR aus.
    extras: [
        { mode: "heatseeker", label: "Heatseeker", rank: RLRank.Platin3, division: "Division I", mmr: 812, streak: 2, games: 23 },
        { mode: "rumble", label: "Rumble", rank: RLRank.Champion1, division: "Division I", mmr: 1105, streak: -1, games: 54 },
        { mode: "hoops", label: "Hoops", rank: RLRank.Diamond2, division: "Division III", mmr: 1012, streak: 5, games: 31 },
        { mode: "snowday", label: "Snow Day", rank: RLRank.Gold2, division: "Division II", mmr: 640, streak: 0, games: 18 },
        { mode: "dropshot", label: "Dropshot", rank: RLRank.Unranked, division: "", mmr: null, streak: 0, games: 0, placement: { played: 0, needed: 10 } },
    ],
    career: [
        { label: "Shots", value: "13.184", color: "var(--c-mod-community)", icon: "shots" },
        { label: "Goals", value: "6.118", color: "var(--c-mod-competition)", icon: "goals" },
        { label: "Assists", value: "2.298", color: "var(--c-mod-moderation)", icon: "assists" },
        { label: "MVPs", value: "1.015", color: "var(--c-mod-engagement)", icon: "mvps" },
        { label: "Saves", value: "4.399", color: "var(--c-mod-content)", icon: "saves" },
        { label: "Wins", value: "2.350", color: "var(--c-mod-utility)", icon: "wins" },
    ],
    freshness: "Stand gerade eben, wird alle 10 Minuten erneuert",
};
