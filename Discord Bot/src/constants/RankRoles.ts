import { TIERS } from "./Prime";
import { IRankRoleSettings, Playlist } from "../interfaces/services/rankroles/IRankRoles";

/**
 * Rank Roles: die Stufen, auf die Rollen gelegt werden. Siehe docs/RankRoles.md.
 */
export const RANK_ROLES_MODULE = "rank-roles";

export const RANK_ROLES_ACCENT = "#00afff";

export const PLAYLISTS: Playlist[] = ["1v1", "2v2", "3v3"];

export const PLAYLIST_LABELS: Record<Playlist, string> = {
    "1v1": "1v1 Duell",
    "2v2": "2v2 Doppel",
    "3v3": "3v3 Standard",
};

/**
 * Die acht Rang-Familien. Sie stehen nicht mehr zur Auswahl - die Zuordnung
 * laeuft ueber alle 22 Raenge einzeln. Geblieben sind sie fuer die Farbe, die
 * im Dashboard vor jedem Rang steht.
 *
 * from und to sind Rang-Stufen, wie Prime sie liefert: 1 ist Bronze I, 22
 * Supersonic Legend. Stufe 0 ist "Unranked" und bekommt nie eine Rolle - wer
 * nicht platziert ist, hat keinen Rang.
 */
export const RANK_GROUPS = [
    { key: "bronze", name: "Bronze", from: 1, to: 3, color: "#8c5a3c" },
    { key: "silber", name: "Silber", from: 4, to: 6, color: "#9fa9b4" },
    { key: "gold", name: "Gold", from: 7, to: 9, color: "#e2b53c" },
    { key: "platin", name: "Platin", from: 10, to: 12, color: "#6ad4e0" },
    { key: "diamant", name: "Diamant", from: 13, to: 15, color: "#4c6bff" },
    { key: "champion", name: "Champion", from: 16, to: 18, color: "#a04cff" },
    { key: "grandchampion", name: "Grand Champion", from: 19, to: 21, color: "#ff3b5c" },
    { key: "ssl", name: "Supersonic Legend", from: 22, to: 22, color: "#ffffff" },
] as const;

export type RankGroupKey = (typeof RANK_GROUPS)[number]["key"];

/** Alle 22 Raenge, so wie sie im Dashboard untereinander stehen. */
export function Steps(): { key: string; name: string; color: string; tier: number }[] {
    return TIERS.slice(1).map((name, index) => ({
        key: `t${index + 1}`,
        name,
        color: RANK_GROUPS.find((group) => index + 1 >= group.from && index + 1 <= group.to)?.color ?? "#9fa9b4",
        tier: index + 1,
    }));
}

/** Der Schlüssel zu einem Rang. null: kein Rang, keine Rolle. */
export function StepOf(tier: number): string | null {
    return Number.isFinite(tier) && tier >= 1 && tier <= 22 ? `t${tier}` : null;
}

export function EmptyPlaylist(): { on: boolean; roles: Record<string, string | null> } {
    return { on: false, roles: {} };
}

export function DefaultRankRoleSettings(): IRankRoleSettings {
    return {
        playlists: {
            "1v1": EmptyPlaylist(),
            // Die beiden Team-Playlists sind das, wonach auf den meisten Servern
            // gefragt wird - sie stehen deshalb ab Werk auf an.
            "2v2": { on: true, roles: {} },
            "3v3": { on: true, roles: {} },
        },
        replace: true,
        channelId: null,
        skipPlacement: true,
    };
}
