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

/** Die Extra-Modi auf der Karte, in der Reihenfolge des Bots (`EXTRA_PLAYLISTS`). */
export type ExtraModeKey = "heatseeker" | "rumble" | "hoops" | "snowday" | "dropshot";

/**
 * Ein Extra-Modus. Wie eine Playlist, nur ohne Untertitel; die MMR fehlt, solange
 * nichts gespielt ist - dann zeigt die Karte einen Strich.
 */
export interface IExtraModePreview extends Omit<IPlaylistPreview, "playlist" | "subtitle" | "mmr"> {
    readonly mode: ExtraModeKey;
    readonly label: string;
    readonly mmr: number | null;
}

/** Der Turnier-Rang im Kopf, neben dem Season Reward. */
export interface ITournamentPreview {
    readonly rank: RLRank;
    readonly division: string;
    readonly mmr: number;
    readonly games: number;
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
    readonly tournament: ITournamentPreview;
    readonly playlists: readonly IPlaylistPreview[];
    readonly extras: readonly IExtraModePreview[];
    readonly career: readonly ICareerPreview[];
    /** Die Zeile ganz unten. */
    readonly freshness: string;
}
