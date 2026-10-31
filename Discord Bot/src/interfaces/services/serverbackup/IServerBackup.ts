/**
 * Backups für den Discord-Server (Plan 32): der gesicherte Stand eines Servers,
 * die Schritte beim Laden und der Auftrag, der sie abarbeitet.
 * Siehe docs/Backups.md und die Spec 2026-10-30-backups-discord-server-design.md.
 */

export type ServerPart = "roles" | "channels" | "permissions" | "members" | "settings" | "expressions" | "bans";

/** repair: Reparieren, exact: Genau wie im Backup, other: Auf einen anderen Server. */
export type RestoreMode = "repair" | "exact" | "other";

/** type 0: Rolle, 1: Mitglied. allow und deny als Bitfeld in Textform. */
export interface ISnapOverwrite {
    id: string;
    type: 0 | 1;
    allow: string;
    deny: string;
}

/** icon: Bild als Base64, null ohne Bild oder wenn es nicht mehr in die Grenze passte. */
export interface ISnapRole {
    id: string;
    name: string;
    color: number;
    icon: string | null;
    unicodeEmoji: string | null;
    hoist: boolean;
    mentionable: boolean;
    permissions: string;
    position: number;
    everyone: boolean;
}

export interface ISnapChannel {
    id: string;
    type: number;
    name: string;
    parentId: string | null;
    position: number;
    topic: string | null;
    nsfw: boolean;
    rateLimit: number;
    bitrate: number | null;
    userLimit: number | null;
    forum: { tags: { name: string; emoji: string | null; moderated: boolean }[]; defaultReaction: string | null; layout: number | null } | null;
    overwrites: ISnapOverwrite[];
}

export interface ISnapMember {
    id: string;
    roles: string[];
}

export interface ISnapEmoji {
    id: string;
    name: string;
    animated: boolean;
    roles: string[];
    image: string | null;
}

export interface ISnapSticker {
    id: string;
    name: string;
    description: string | null;
    tags: string;
    image: string | null;
}

export interface ISnapBan {
    id: string;
    reason: string | null;
}

export interface ISnapSettings {
    name: string;
    icon: string | null;
    banner: string | null;
    description: string | null;
    verificationLevel: number;
    defaultNotifications: number;
    explicitContentFilter: number;
    afkChannelId: string | null;
    afkTimeout: number;
    systemChannelId: string | null;
    systemChannelFlags: number;
    rulesChannelId: string | null;
    publicUpdatesChannelId: string | null;
    preferredLocale: string;
}

/** members null: ohne Members Intent nicht gelesen. */
export interface IServerCounts {
    roles: number;
    channels: number;
    members: number | null;
    emojis: number;
    stickers: number;
    bans: number;
}

export interface IServerSnapshot {
    version: 1;
    guildId: string;
    takenAt: string;
    settings: ISnapSettings;
    roles: ISnapRole[];
    channels: ISnapChannel[];
    members: ISnapMember[] | null;
    emojis: ISnapEmoji[];
    stickers: ISnapSticker[];
    bans: ISnapBan[];
    /** Was fehlt und warum, für die Anzeige („Emojis über 8 MB“, „Mitglieder ohne Members Intent“). */
    skipped: string[];
    counts: IServerCounts;
}

/** Was beim Laden nie angefasst wird (Spec „Was auf keinen Fall passieren darf“). */
export interface IProtect {
    /** Position der höchsten Rolle des Bots: Rollen darüber bleiben, wie sie sind. */
    botTop: number;
    botRoleId: string | null;
    everyoneId: string;
    /** Quarantäne- und Köder-Rolle, verwaltete Rollen. */
    roles: ReadonlySet<string>;
    /** Quarantäne- und Köder-Kanal, Ticket-, Temp-Voice- und Bewerbungs-Kanäle. */
    channels: ReadonlySet<string>;
    /** Mitglieder mit offenem Anti-Villain-Fall. */
    members: ReadonlySet<string>;
}

/** Ein gelöschtes Objekt aus dem Anti-Nuke, 7 Tage in der Datenbank. */
export interface IDebrisRow {
    kind: "channel" | "role";
    objectId: string;
    name: string;
    data: Record<string, unknown>;
    /** Bei Rollen: wer sie hatte, soweit der Bot es wusste. */
    members: string[];
    at: number;
}

/** Ein Schritt beim Laden. IDs sind Backup-IDs, der Runner übersetzt sie über die Zuordnung. */
export type IRestoreOp =
    | { kind: "role.create"; role: ISnapRole }
    | { kind: "role.edit"; id: string; role: ISnapRole }
    | { kind: "role.delete"; id: string; name: string }
    | { kind: "channel.create"; channel: ISnapChannel }
    | { kind: "channel.edit"; id: string; channel: ISnapChannel }
    | { kind: "channel.delete"; id: string; name: string }
    | { kind: "overwrites"; channelId: string; overwrites: ISnapOverwrite[] }
    | { kind: "settings"; settings: ISnapSettings }
    | { kind: "emoji.create"; emoji: ISnapEmoji }
    | { kind: "emoji.edit"; id: string; emoji: ISnapEmoji }
    | { kind: "emoji.delete"; id: string; name: string }
    | { kind: "sticker.create"; sticker: ISnapSticker }
    | { kind: "sticker.delete"; id: string; name: string }
    | { kind: "member.add"; userId: string; roles: string[] }
    | { kind: "member.remove"; userId: string; roles: string[] }
    | { kind: "ban"; userId: string; reason: string | null }
    | { kind: "order"; roles: string[]; channels: string[] };

/** Eine Zeile der Unterschiede: + neu, ~ zurückgesetzt/geändert, − weg, = bleibt, ! geht nicht. */
export interface IRestoreLine {
    sign: "+" | "~" | "−" | "=" | "!";
    part: ServerPart | "bot" | "debris";
    text: string;
    names: string[];
    more: number;
}

export interface IRestorePlan {
    ops: IRestoreOp[];
    lines: IRestoreLine[];
    /** Was „Genau wie im Backup“ löscht, für die zweite Rückfrage. */
    deletes: string[];
    impossible: string[];
    estimateMs: number;
}

export interface IRestoreReport {
    lines: IRestoreLine[];
    reposted: string[];
    redrawn: string[];
    remapped: number;
    problems: string[];
}

export type RestoreStatus = "running" | "done" | "failed" | "cancelled";

export type RestorePhase = "server" | "bot" | "remap" | "panels" | "done";

/** Ein Laden als Auftrag in der Datenbank - so übersteht es einen Neustart. */
export interface IRestoreJob {
    id: number;
    guildId: string;
    /** Bei „Auf einen anderen Server“ das Ziel, sonst gleich guildId. */
    targetGuildId: string;
    backupId: number;
    /** Das Backup „vorher“ - daraus wird „Rückgängig machen“. */
    safetyId: number | null;
    mode: RestoreMode;
    parts: ServerPart[];
    areas: string[];
    status: RestoreStatus;
    phase: RestorePhase;
    ops: IRestoreOp[];
    done: number;
    failed: { op: number; reason: string }[];
    report: IRestoreReport | null;
    actorId: string;
    actorName: string;
    channelId: string | null;
    messageId: string | null;
    startedAt: number;
    updatedAt: number;
}

export type IdKind = "role" | "channel" | "emoji" | "sticker";

/** Ein Backup, wie das Admin Dashboard es beschreibt (IBackupMeta in Admin Dashboard/shared/backups.ts). */
export interface IBackupMeta {
    id: number;
    guildName: string;
    kind: "nacht" | "vorher" | "hand" | "plan" | "schutz";
    note: string | null;
    byName: string | null;
    createdAt: string;
    bytes: number;
    /** Zeilen je Bereich der Bot-Daten. */
    counts: Record<string, number>;
    parts: ("bot" | "server")[];
    server: IServerCounts | null;
}

/** Was der Bot zum Laden über ein Backup braucht. */
export type IBackupInfo = Pick<IBackupMeta, "id" | "kind" | "createdAt" | "guildName" | "parts">;

/** Die Backups eines Servers, wie das Admin Dashboard sie dem Bot gibt (IServerBackups dort). */
export interface IServerBackupList {
    plan: IBackupPlanState;
    /** Neueste zuerst. */
    backups: IBackupMeta[];
    hand: { used: number; max: number };
}

/** Automatisch sichern, wie das Admin Dashboard es zurückgibt (IPlanState dort). */
export interface IBackupPlanState {
    plan: { enabled: boolean; every: "tag" | "3tage" | "woche" | "monat"; weekday: number; hour: number; keep: number; discord: boolean; risky: boolean };
    next: string | null;
    lastOk: string | null;
    lastError: { at: string; reason: string } | null;
}
