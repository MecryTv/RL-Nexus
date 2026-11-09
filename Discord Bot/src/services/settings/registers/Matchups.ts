import { IPanelModule } from "../SettingsModel";

/** Platzhalter (W-0014 Teil 4): Die Felder kommen aus dem Entwurf w0014-module-rest.html. */
export const MatchupsPanel: IPanelModule<Record<string, never>> = {
    id: "matchups",
    module: "matchups",
    name: "Matchups",
    emoji: "⚔️",
    color: "#f23f43",
    permanent: false,
    dashOnly: [],
    sections: [],
    load: async () => ({}),
    save: async () => null,
};
