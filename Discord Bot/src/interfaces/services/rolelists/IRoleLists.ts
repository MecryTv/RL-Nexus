import { IRoleEntry, IRoleListSettings, RoleListDesign } from "../../../constants/RoleLists";

/** Eine Rollen-Liste, wie sie gespeichert ist. */
export interface IRoleList {
    id: number;
    guildId: string;
    /** Nur in der Leiste des Dashboards. */
    name: string;
    position: number;
    channelId: string | null;
    design: RoleListDesign;
    settings: IRoleListSettings;
    /** Die gesendete Nachricht – null: die Liste wurde noch nie gesendet. */
    messageId: string | null;
    messageKind: "text" | "image" | null;
    /** Fingerabdruck des zuletzt gesendeten Stands – gleich heißt: nichts zu tun. */
    fingerprint: string | null;
    createdAt: number;
    updatedAt: number;
}

/** Ein Mitglied, wie die Liste es braucht. */
export interface IRoleListMember {
    id: string;
    name: string;
    username: string;
    joinedAt: number;
    avatarUrl: string | null;
    roleIds: string[];
}

/** Eine Rolle des Servers, wie die Liste sie braucht. */
export interface IRoleListRole {
    id: string;
    name: string;
    color: string;
    iconUrl: string | null;
}

/** Eine Gruppe der Liste: ein Eintrag mit seiner Rolle und den Leuten darin. */
export interface IRoleListGroup {
    entry: IRoleEntry;
    role: IRoleListRole;
    members: IRoleListMember[];
}
