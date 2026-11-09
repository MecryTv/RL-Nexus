import { IPanelModule } from "../SettingsModel";

/** Platzhalter (W-0014 Teil 4): Die Felder kommen aus dem Entwurf w0014-module-rest.html. */
export const TempVoicePanel: IPanelModule<Record<string, never>> = {
    id: "voice-hub",
    module: "voice-hub",
    name: "Temp Voice",
    emoji: "🔊",
    color: "#23a55a",
    permanent: false,
    dashOnly: [],
    sections: [],
    load: async () => ({}),
    save: async () => null,
};
