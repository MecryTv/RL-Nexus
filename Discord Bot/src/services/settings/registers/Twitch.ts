import { IPanelModule } from "../SettingsModel";

/** Platzhalter (W-0014 Teil 4): Die Felder kommen aus dem Entwurf w0014-module-rest.html. */
export const TwitchPanel: IPanelModule<Record<string, never>> = {
    id: "twitch-notifier",
    module: "twitch-notifier",
    name: "Twitch Notifier",
    emoji: "🟣",
    color: "#a46cf0",
    permanent: false,
    dashOnly: [],
    sections: [],
    load: async () => ({}),
    save: async () => null,
};
