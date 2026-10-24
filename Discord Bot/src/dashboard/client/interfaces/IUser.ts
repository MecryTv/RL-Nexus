/** Der angemeldete Nutzer und die Antwort von /api/me. */

import { IGuild } from "./IGuild.js";

// Spiegelt IDashboardUser aus dem Backend.
export type DashboardGroup = "administrator" | "developer" | "partner" | "premium" | "beta" | "zugang" | "guardian" | "free" | "testphase";

export interface IUser {
    id: string;
    name: string;
    handle: string;
    email: string | null;
    avatar: string | null;
    group: DashboardGroup;
}

/** Laufende Wartung des Bot-Dashboards. Spiegelt IMaintenanceNote aus dem Backend. */
export interface IMaintenanceNote {
    reason: string | null;
    startedAt: string;
    /** null: ohne Endzeit. */
    endsAt: string | null;
    autoEnd: boolean;
}

export interface IPayload {
    user: IUser;
    guilds: IGuild[];
    inviteURL: string;
    /**
     * Nur für Administrator und Developer, und nur, solange die Wartung läuft.
     * `until`: das Ende als „18:00“ oder „morgen 9:00“, vom Server gerechnet,
     * null ohne Endzeit. Fehlt bei einem älteren Bot.
     */
    maintenance?: (IMaintenanceNote & { until: string | null }) | null;
}
