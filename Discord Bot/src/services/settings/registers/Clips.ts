import { IPanelModule } from "../SettingsModel";

/** Platzhalter (W-0014 Teil 4): Die Felder kommen aus dem Entwurf w0014-module-rest.html. */
export const ClipsPanel: IPanelModule<Record<string, never>> = {
    id: "clips",
    module: "clips",
    name: "Clips der Woche",
    emoji: "🎬",
    color: "#a46cf0",
    permanent: false,
    dashOnly: [],
    sections: [],
    load: async () => ({}),
    save: async () => null,
};
