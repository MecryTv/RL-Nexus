/**
 * Rank Roles: Rollen nach Rocket-League-Rang. Wer den Befehl eingibt, bekommt
 * die Rolle, die zu seinem Rang gehört - je Playlist eine eigene.
 * Siehe docs/RankRoles.md.
 */

export type Playlist = "1v1" | "2v2" | "3v3";

export interface IPlaylistRoles {
    on: boolean;
    /** Rang ("t1" bis "t22") zu Rollen-ID. Leer heißt: keine Rolle. */
    roles: Record<string, string | null>;
}

export interface IRankRoleSettings {
    playlists: Record<Playlist, IPlaylistRoles>;
    /** Die alte Rang-Rolle derselben Playlist abnehmen. */
    replace: boolean;
    /** Platzierungsspiele zählen als kein Rang. */
    skipPlacement: boolean;
}

/** Was bei einem Spieler herauskam. */
export interface IRankRoleChange {
    playlist: Playlist;
    tier: number;
    tierName: string;
    mmr: number;
    roleId: string | null;
    /** Warum nichts passiert ist - null, wenn alles lief. */
    problem: string | null;
}

export interface IRankRoleResult {
    /** Der Epic-Name, über den geholt wurde. */
    epicName: string;
    added: string[];
    removed: string[];
    changes: IRankRoleChange[];
    /** Rollen, die der Bot nicht vergeben darf. */
    blocked: string[];
}
