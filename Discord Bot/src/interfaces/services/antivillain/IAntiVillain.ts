/**
 * Anti Villain (Plan 31): Typen für Einstellungen, Fälle, Raid und Anti-Nuke.
 * Siehe docs/AntiVillain.md und die Spec 2026-10-30-anti-villain-design.md.
 */

export type GuardId = "hop" | "scam" | "qr" | "lookalike" | "everyone" | "report" | "fresh" | "sleeper" | "bait";

export type ShieldLevel = "locker" | "normal" | "streng";

export type NukeAction = "channelDelete" | "roleDelete" | "banKick" | "webhook" | "botAdd" | "everyonePerms";

/** Wie lange die Nachrichten einer festgehaltenen Person zurück aufgeräumt werden, in Minuten. */
export type CleanupMinutes = 0 | 10 | 60 | 1440;

export interface IAntiVillainSettings {
    level: ShieldLevel;
    guards: Record<GuardId, boolean>;
    /** Team-Accounts: nur melden oder wie alle anderen festhalten. */
    team: "report" | "same";
    /** Rollen, die nie festgehalten, nur gemeldet werden. */
    trustedRoles: string[];
    quarantine: {
        roleId: string | null;
        channelId: string | null;
        stripRoles: boolean;
        cleanup: CleanupMinutes;
        dm: boolean;
        release: "team" | "team-24h";
    };
    /** messageId: die angepinnte Warnung im Köder-Kanal, für den Zähler. */
    bait: { channel: boolean; channelId: string | null; role: boolean; roleId: string | null; messageId: string | null };
    raid: { on: boolean; joins: number; invites: boolean; slowmode: boolean; hold: boolean; ping: boolean; verification: boolean; endMinutes: number };
    nuke: { on: boolean; limits: Record<NukeAction, number>; trustedBots: string[] };
    logChannelId: string | null;
    pingRoleId: string | null;
}

/** Ein Treffer eines Wächters. */
export interface IHit {
    guard: GuardId;
    points: number;
    detail: string;
    at: number;
}

export type CaseStatus = "open" | "released" | "trusted" | "banned" | "kicked";

export interface IDeletedMessage {
    channelId: string;
    at: number;
    text: string;
    files: string[];
}

export interface IAvCase {
    id: number;
    guildId: string;
    userId: string;
    status: CaseStatus;
    score: number;
    hits: IHit[];
    timeline: { at: number; text: string }[];
    savedRoles: string[];
    /** Rollen, die der Bot nicht abnehmen konnte (über ihm oder von Discord verwaltet). */
    partial: string[];
    deleted: IDeletedMessage[];
    teamMessageId: string | null;
    personMessageId: string | null;
    /** Gehört der Fall zu einem Raid, steht hier der Vorfall - dann gibt es keine eigene Team-Karte. */
    incidentId: number | null;
    createdAt: number;
    closedAt: number | null;
    closedBy: string | null;
}

export interface IRaidState {
    incidentId: number;
    guildId: string;
    startedAt: number;
    lastJoin: number;
    members: string[];
    /** Wer aus der Welle schon gebannt, gekickt oder freigegeben wurde. */
    done: string[];
    invitesUntil: number | null;
    restore: { slowmode: Record<string, number>; verification: number | null };
}

/** Ein gelöschter Kanal oder eine gelöschte Rolle, aufgehoben für das Reparieren (W-0034). */
export interface IDebris {
    kind: "channel" | "role";
    id: string;
    name: string;
    data: Record<string, unknown>;
    deletedBy: string;
    at: number;
}

export type SafetyResult = { ok: true; id: number; at: string } | { ok: false; reason: string };

export interface INukeState {
    incidentId: number;
    executorId: string;
    action: NukeAction;
    count: number;
    /** false: Die höchste Rolle der Person steht über dem Bot. */
    stopped: boolean;
    rolesRemoved: number;
    reverted: string[];
    debris: IDebris[];
    backup: SafetyResult | null;
    /** Ein Bot hat genukt: gekickt statt Rollen abgenommen. Ältere Vorfälle haben das Feld nicht. */
    bot?: boolean;
    /** Wer den Bot eingeladen hat - den hält der Anti-Nuke fest. */
    inviterId?: string | null;
}
