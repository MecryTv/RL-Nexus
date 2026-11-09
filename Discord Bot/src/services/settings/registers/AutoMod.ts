import { IPanelModule } from "../SettingsModel";

/** Platzhalter (W-0014 Teil 4): Die Felder kommen aus dem Entwurf w0014-module-rest.html. */
export const AutoModPanel: IPanelModule<Record<string, never>> = {
    id: "automod",
    module: "automod",
    name: "Auto Mod",
    emoji: "🤖",
    color: "#5aa9e6",
    permanent: false,
    dashOnly: [],
    sections: [],
    load: async () => ({}),
    save: async () => null,
};
