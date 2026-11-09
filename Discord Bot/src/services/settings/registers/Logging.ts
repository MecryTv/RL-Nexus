import { IPanelModule } from "../SettingsModel";

/** Platzhalter (W-0014 Teil 4): Die Felder kommen aus dem Entwurf w0014-module-rest.html. */
export const LoggingPanel: IPanelModule<Record<string, never>> = {
    id: "logging",
    module: "logging",
    name: "Logging System",
    emoji: "📜",
    color: "#80848e",
    permanent: false,
    dashOnly: [],
    sections: [],
    load: async () => ({}),
    save: async () => null,
};
