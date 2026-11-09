import { ITwitchSettings } from "../../../interfaces/services/community/ICommunity";
import { StreamError } from "../../StreamService";
import { IPanelModule, PanelError } from "../SettingsModel";
import { F } from "./Shared";

type S = ITwitchSettings;

export const TwitchPanel: IPanelModule<S> = {
    id: "twitch-notifier",
    module: "twitch-notifier",
    name: "Twitch Notifier",
    emoji: "🟣",
    color: "#a46cf0",
    permanent: false,
    dashOnly: ["Streamer", "Nachrichten"],
    sections: [
        {
            title: "Live-Rolle",
            // Das Speichern nimmt immer beide Rollen - fehlt eine, ist sie weg. Darum schickt jedes Feld die andere mit.
            fields: [
                F<S>("role", "liveRole", "Live-Rolle", "Bekommt, wer auf Twitch live ist, und verliert sie nach dem Stream.", (s) => s.liveRoleId, (value: string | null, s) => ({ liveRoleId: value, liveRoleFilter: s.liveRoleFilter })),
                F<S>("role", "filter", "Nur mit Rolle", "Über den Streaming-Status bekommt die Live-Rolle nur, wer diese Rolle hat, leer heißt jeder.", (s) => s.liveRoleFilter, (value: string | null, s) => ({ liveRoleId: s.liveRoleId, liveRoleFilter: value })),
            ],
        },
    ],
    load(client, guild) {
        return client.streamService.TwitchSettings(guild.id);
    },
    async save(client, guild, patch) {
        try {
            await client.streamService.SaveTwitchSettings(guild, patch);
        } catch (error) {
            if (error instanceof StreamError) throw new PanelError(error.message);

            throw error;
        }

        return null;
    },
};
