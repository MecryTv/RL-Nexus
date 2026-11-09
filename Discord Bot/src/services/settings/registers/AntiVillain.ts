import { IPanelModule } from "../SettingsModel";

/** Platzhalter (W-0014 Teil 4): Die Felder kommen aus dem Entwurf w0014-module-rest.html. */
export const AntiVillainPanel: IPanelModule<Record<string, never>> = {
    id: "anti-villain",
    module: "anti-villain",
    name: "Anti Villain",
    emoji: "🦹",
    color: "#f23f43",
    permanent: false,
    dashOnly: [],
    sections: [],
    load: async () => ({}),
    save: async () => null,
};
