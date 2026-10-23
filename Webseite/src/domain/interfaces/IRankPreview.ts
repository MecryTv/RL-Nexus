import type { RLRank } from "../enums/RLRank";

/** Die Platzierungsspiele, solange noch kein Rang feststeht. */
export interface IPlacementPreview {
    readonly played: number;
    readonly needed: number;
}

/** Eine Playlist auf der Rang-Karte, also 1v1, 2v2 oder 3v3. */
export interface IPlaylistPreview {
    readonly playlist: string;
    /** Der Untertitel der Vorlage: DUELL, DOPPEL, TEAM. */
    readonly subtitle: string;
    /** Die Rangstufe. Bestimmt Abzeichen, Name und Farbe. */
    readonly rank: RLRank;
    /** Die Division innerhalb der Stufe. Leer während der Platzierung. */
    readonly division: string;
    readonly mmr: number;
    /** Serie: positiv heißt Siege am Stück, negativ Niederlagen. */
    readonly streak: number;
    readonly games: number;
    /** Gesetzt, solange die Platzierungsspiele laufen. Dann statt des Rangs. */
    readonly placement?: IPlacementPreview;
}

/** Ein Karriere-Wert unter den Rängen. */
export interface ICareerPreview {
    readonly label: string;
    readonly value: string;
    readonly color: string;
    /** Dateiname unter `assets/rocketleague/stats`, ohne Endung. */
    readonly icon: string;
}

/** Der Season-Reward im Kopf der Karte. */
export interface IRewardPreview {
    /** Die Stufe, deren Abzeichen gezeigt wird. */
    readonly rank: RLRank;
    /** Der Name der Belohnungsstufe, also „Diamant“ statt „Diamant III“. */
    readonly label: string;
    /** Fortschritt zur nächsten Stufe, 0 bis 1. */
    readonly progress: number;
}

/** Alles, was die nachgebaute Karte zeigt. */
export interface IRankPreview {
    readonly player: string;
    readonly handle: string;
    /** Das Abzeichen über dem Namen, also Clubkürzel oder Rolle. */
    readonly badge: string;
    readonly reward: IRewardPreview;
    readonly playlists: readonly IPlaylistPreview[];
    readonly career: readonly ICareerPreview[];
    /** Die Zeile ganz unten. */
    readonly freshness: string;
}
