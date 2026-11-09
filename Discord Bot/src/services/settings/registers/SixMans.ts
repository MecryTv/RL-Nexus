import { IPanelModule } from "../SettingsModel";

/** Platzhalter (W-0014 Teil 4): Die Felder kommen aus dem Entwurf w0014-module-rest.html. */
export const SixMansPanel: IPanelModule<Record<string, never>> = {
    id: "rl-6mans",
    module: "rl-6mans",
    name: "2, 4 & 6 Mans",
    emoji: "🏆",
    color: "#f0b232",
    permanent: false,
    dashOnly: [],
    sections: [],
    load: async () => ({}),
    save: async () => null,
};
