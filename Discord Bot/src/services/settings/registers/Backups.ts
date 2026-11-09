import { IPanelModule } from "../SettingsModel";

/** Platzhalter (W-0014 Teil 4): Die Felder kommen aus dem Entwurf w0014-module-rest.html. */
export const BackupsPanel: IPanelModule<Record<string, never>> = {
    id: "backups",
    module: "backups",
    name: "Backups",
    emoji: "💾",
    color: "#80848e",
    permanent: true,
    dashOnly: [],
    sections: [],
    load: async () => ({}),
    save: async () => null,
};
