import { EmptyPlaylist, PLAYLISTS, PLAYLIST_LABELS } from "../../../constants/RankRoles";
import { IRankRoleSettings } from "../../../interfaces/services/rankroles/IRankRoles";
import { RankRoleError } from "../../RankRoleService";
import { IPanelModule, PanelError } from "../SettingsModel";
import { F } from "./Shared";

type S = IRankRoleSettings;

export const RankRolesPanel: IPanelModule<S> = {
    id: "rank-roles",
    module: "rank-roles",
    name: "Rank Roles",
    emoji: "🎖️",
    color: "#f0b232",
    permanent: false,
    dashOnly: ["Die Rolle je Rang"],
    sections: [
        {
            title: "Playlists",
            // Die Playlist ganz mitschicken: CleanSettings baut ihre Rollen nur aus dem, was kommt - ohne sie wären sie weg.
            fields: PLAYLISTS.map((playlist) =>
                F<S>("toggle", `p${playlist}`, PLAYLIST_LABELS[playlist], `/rank me vergibt eine Rolle für ${playlist}.`, (s) => s.playlists[playlist]?.on ?? false, (value: boolean, s) => ({
                    playlists: { [playlist]: { ...(s.playlists[playlist] ?? EmptyPlaylist()), on: value } },
                }))
            ),
        },
        {
            title: "Vergabe",
            fields: [
                F<S>("toggle", "replace", "Alte Rolle abnehmen", "Beim Aufstieg geht die vorherige Rolle derselben Playlist weg.", (s) => s.replace, (value: boolean) => ({ replace: value })),
                F<S>("toggle", "placement", "Platzierung auslassen", "Wer noch Platzierungsspiele hat, bekommt keine Rang-Rolle.", (s) => s.skipPlacement, (value: boolean) => ({ skipPlacement: value })),
            ],
        },
    ],
    load(client, guild) {
        return client.rankRoleService.Settings(guild.id);
    },
    async save(client, guild, patch) {
        try {
            await client.rankRoleService.SaveSettings(guild, patch);
        } catch (error) {
            if (error instanceof RankRoleError) throw new PanelError(error.message);

            throw error;
        }

        return null;
    },
};
