import { IYouTubeSettings } from "../../../interfaces/services/community/ICommunity";
import { StreamError } from "../../StreamService";
import { IPanelModule, PanelError } from "../SettingsModel";
import { F } from "./Shared";

type S = IYouTubeSettings;

export const YouTubePanel: IPanelModule<S> = {
    id: "youtube-notifier",
    module: "youtube-notifier",
    name: "YouTube Notifier",
    emoji: "🔴",
    color: "#f23f43",
    permanent: false,
    dashOnly: ["Kanäle", "Nachrichten"],
    sections: [
        {
            title: "Live-Rolle",
            fields: [F<S>("role", "liveRole", "Live-Rolle", "Bekommt der verknüpfte Discord-User, solange sein Livestream läuft.", (s) => s.liveRoleId, (value: string | null) => ({ liveRoleId: value }))],
        },
    ],
    load(client, guild) {
        return client.streamService.YouTubeSettings(guild.id);
    },
    async save(client, guild, patch) {
        try {
            await client.streamService.SaveYouTubeSettings(guild, patch);
        } catch (error) {
            if (error instanceof StreamError) throw new PanelError(error.message);

            throw error;
        }

        return null;
    },
};
