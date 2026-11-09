import { IPanelModule } from "../SettingsModel";

/** Platzhalter (W-0014 Teil 4): Die Felder kommen aus dem Entwurf w0014-module-rest.html. */
export const RankRolesPanel: IPanelModule<Record<string, never>> = {
    id: "rank-roles",
    module: "rank-roles",
    name: "Rank Roles",
    emoji: "🎖️",
    color: "#f0b232",
    permanent: false,
    dashOnly: [],
    sections: [],
    load: async () => ({}),
    save: async () => null,
};
