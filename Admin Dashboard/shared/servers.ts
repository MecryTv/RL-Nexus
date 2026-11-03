/**
 * Ein Server pro Person (W-0064): was zwischen Bot, Admin-Server und
 * Oberfläche hin- und hergeht. Spec 2026-11-03-ein-server-pro-person-design.md.
 */

/** Gründe zum Anklicken beim Entfernen. Gleich im Bot-Dashboard (GuildBotTeam.ts). */
export const REMOVE_REASONS = ["Missbrauch", "Wunsch des Owners", "Zweiter Server ohne Freigabe", "Testserver", "Sonstiges"] as const;

export type InviteSource = "audit" | "owner" | "dashboard";
export type RequestKind = "extra" | "switch";
export type RequestOrigin = "dm" | "wahl" | "team";
export type RequestStatus = "open" | "approved" | "declined" | "revoked" | "done";
/** Warum der Bot einen Server verlassen hat. */
export type LeftReason = "limit" | "choice" | "timeout" | "team" | "declined" | "revoked" | "switch" | "blocked" | "gone";

export const LEFT_TEXT: Readonly<Record<LeftReason, string>> = {
    limit: "zweiter Server ohne Freigabe",
    choice: "Wahl in der DM",
    timeout: "keine Wahl in 24 Stunden",
    team: "vom Team entfernt",
    declined: "Freigabe abgelehnt",
    revoked: "Freigabe zurückgenommen",
    switch: "Hauptserver gewechselt",
    blocked: "Server gesperrt",
    gone: "vom Server entfernt",
};

/* Vom Bot (/dcapi/admin/servers*) */

export interface IBotServer {
    readonly id: string;
    readonly name: string;
    readonly icon: string | null;
    readonly ownerId: string;
    readonly members: number;
    readonly joinedAt: string;
}

export interface IBotServerDetail extends IBotServer {
    readonly inviter: { readonly userId: string; readonly source: InviteSource };
    /** Einlader ist Administrator, Developer oder Partner. */
    readonly exempt: boolean;
}

export interface IBotServerFacts {
    readonly modules: number;
    readonly openTickets: number;
    /** Die Person, die im Admin Dashboard schaut, ist auf dem Server. */
    readonly viewerMember: boolean;
    readonly ownerName: string | null;
}

export interface IBotMember {
    readonly id: string;
    readonly name: string;
    readonly handle: string;
    readonly avatar: string | null;
    readonly bot: boolean;
    readonly owner: boolean;
    readonly joinedAt: string | null;
    readonly roles: readonly { readonly name: string; readonly color: string | null }[];
    /** Administrator oder Developer von RL Nexus. */
    readonly team: boolean;
}

export interface IBotMembers {
    readonly total: number;
    /** false: Members-Intent aus, die Liste fehlt. */
    readonly complete: boolean;
    readonly members: readonly IBotMember[];
}

/* Für die Oberfläche */

/** Ein Server zur Auswahl in der DM. */
export interface IServerOptionView {
    readonly id: string;
    readonly name: string;
    readonly members: number;
    readonly role: string;
}

export interface IPersonRef {
    readonly id: string;
    readonly name: string;
    readonly avatar: string | null;
}

export interface IRequestView {
    readonly id: number;
    readonly person: IPersonRef;
    readonly guildId: string;
    readonly guildName: string;
    readonly members: number | null;
    readonly kind: RequestKind;
    readonly reason: string;
    readonly origin: RequestOrigin;
    readonly status: RequestStatus;
    readonly createdAt: string;
    /** Hauptserver der Person gerade. */
    readonly main: { readonly id: string; readonly name: string } | null;
    /** Bot steht noch auf dem Server (Uhr angehalten). */
    readonly botThere: boolean;
    readonly signature: string | null;
    readonly decided: { readonly name: string; readonly role: string | null; readonly at: string } | null;
}

export type InvitedState = "main" | "approved" | "waiting" | "active" | "left";

export interface IInvitedServer {
    readonly id: string;
    readonly name: string;
    readonly icon: string | null;
    readonly members: number;
    readonly ownerId: string;
    readonly ownerName: string | null;
    readonly invitedAt: string;
    readonly source: InviteSource;
    readonly state: InvitedState;
    readonly leftAt: string | null;
    readonly leftReason: LeftReason | null;
    /** Freigabe (mit Signatur) oder offene Anfrage zu diesem Server. */
    readonly request: IRequestView | null;
    readonly facts: IBotServerFacts | null;
}

export interface IPersonServers {
    readonly started: boolean;
    readonly exempt: boolean;
    readonly servers: readonly IInvitedServer[];
    /** Offene Wahl beim Start der Regel. */
    readonly choice: { readonly deadline: string; readonly chosen: string | null } | null;
}

export interface IChoiceView {
    readonly person: IPersonRef;
    readonly deadline: string;
    readonly state: "open" | "chosen";
    readonly chosen: string | null;
    readonly servers: readonly { readonly id: string; readonly name: string }[];
    readonly dmError: string | null;
}

export interface IFreigaben {
    readonly started: string | null;
    /** Paid oder Beta Access läuft. Bei Free Access gilt die Regel nicht. */
    readonly paid: boolean;
    /** Vor dem Start: Personen, die beim Start die Wahl-DM bekämen. */
    readonly preview: number;
    readonly open: readonly IRequestView[];
    readonly approved: readonly IRequestView[];
    readonly choices: readonly IChoiceView[];
}

export const MEMBER_FILTERS = ["alle", "personen", "bots", "daten"] as const;
export type MemberFilter = (typeof MEMBER_FILTERS)[number];
export const MEMBERS_PER_PAGE = 50;

export interface IMemberRow extends IBotMember {
    readonly hasData: boolean;
}

export interface IMemberPage {
    readonly total: number;
    readonly persons: number;
    readonly bots: number;
    readonly team: number;
    readonly withData: number;
    readonly complete: boolean;
    readonly at: string;
    /** Treffer nach Filter und Suche. */
    readonly matches: number;
    readonly page: number;
    readonly rows: readonly IMemberRow[];
}
