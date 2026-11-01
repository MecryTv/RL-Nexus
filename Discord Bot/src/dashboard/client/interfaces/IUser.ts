/** Der angemeldete Nutzer und die Antwort von /api/me. */

import { IGuild } from "./IGuild.js";
import { IAccessEnd } from "../constants/Access.js";

// Spiegelt IDashboardUser aus dem Backend.
export type DashboardGroup = "administrator" | "developer" | "partner" | "premium" | "beta" | "zugang" | "guardian" | "free" | "testphase";

export interface IUser {
    id: string;
    name: string;
    handle: string;
    email: string | null;
    avatar: string | null;
    group: DashboardGroup;
    /** W-0017: die laufenden Zugänge aus dem Shop, null ohne Datenbank. */
    access?: IAccessEnd[] | null;
}

export interface IPayload {
    user: IUser;
    guilds: IGuild[];
    inviteURL: string;
}
