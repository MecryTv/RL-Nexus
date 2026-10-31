/**
 * Backups je Discord-Server (Spec 2026-10-18-datenbank-backups-design.md):
 * welche Tabellen zu welchem Bereich gehören und was Server und Oberfläche
 * austauschen.
 */

export const BACKUP_KINDS = ["nacht", "vorher", "hand", "plan", "schutz"] as const;
/**
 * nacht: jede Nacht um 0:00, vorher: vor einem Zurückladen, hand: von Hand,
 * plan: automatisch nach der Einstellung eines Servers im Bot-Dashboard.
 * schutz: Sicherheits-Backup, das Anti Villain vor einem Nuke anlegt (Plan 31). Bleibt 7 Tage,
 * zählt nicht zu den Plätzen von Hand und kommt nur vom Bot.
 * nacht und vorher löschen sich nach 72 Stunden, plan nach „wie viele behalten“.
 */
export type BackupKind = (typeof BACKUP_KINDS)[number];

export const BACKUP_ORIGINS = ["admin", "server"] as const;
/** admin: Admin Dashboard und System, server: über das Bot-Dashboard. Das Bot-Dashboard sieht nur server. */
export type BackupOrigin = (typeof BACKUP_ORIGINS)[number];

/** So viele Backups von Hand darf ein Server im Bot-Dashboard anlegen. Die des Teams zählen nicht mit. */
export const SERVER_HAND_MAX = 10;

export const PLAN_EVERY = ["tag", "3tage", "woche", "monat"] as const;
export type PlanEvery = (typeof PLAN_EVERY)[number];

/** Die automatischen Backups eines Servers. Immer zur vollen Stunde nach Berliner Zeit. */
export interface IBackupPlan {
    readonly enabled: boolean;
    readonly every: PlanEvery;
    /** Nur bei "woche": 0 = Montag … 6 = Sonntag. */
    readonly weekday: number;
    /** 0 bis 23. */
    readonly hour: number;
    /** Wie viele automatische Backups bleiben, 1 bis PLAN_KEEP_MAX. */
    readonly keep: number;
    /** Plan 32: Den Discord-Server gleich mit sichern. Ab Werk aus. */
    readonly discord: boolean;
    /** Plan 32: Sicherheits-Backup vor riskanten Änderungen (Anti-Nuke von Anti Villain). Ab Werk an. */
    readonly risky: boolean;
}

export const PLAN_KEEP_MAX = 14;

/** Die Einstellung eines Servers, wie Bot-Dashboard und Admin Dashboard sie zeigen. */
export interface IPlanState {
    readonly plan: IBackupPlan;
    /** Wann das nächste automatische Backup dran ist. null: aus. */
    readonly next: string | null;
    readonly lastOk: string | null;
    /** Der letzte Fehlschlag, bis das nächste klappt. */
    readonly lastError: { readonly at: string; readonly reason: string } | null;
}
export const DEFAULT_PLAN: IBackupPlan = { enabled: false, every: "woche", weekday: 6, hour: 3, keep: 5, discord: false, risky: true };

/** Plan 32: was ein Backup enthält - die Daten des Bots, den Discord-Server oder beides. */
export const BACKUP_PARTS = ["bot", "server"] as const;
export type BackupPart = (typeof BACKUP_PARTS)[number];

/** Plan 32: die Teile des Discord-Servers und die Arten zu laden, wie im Bot (constants/ServerBackup.ts). */
export const SERVER_PART_IDS = ["roles", "channels", "permissions", "settings", "expressions", "members", "bans"] as const;
export type ServerPartId = (typeof SERVER_PART_IDS)[number];
export const RESTORE_MODES = ["repair", "exact", "other"] as const;
export type RestoreMode = (typeof RESTORE_MODES)[number];

/** Die Zähler des Server-Teils. members null: ohne Members Intent nicht gelesen. */
export interface IServerCounts {
    readonly roles: number;
    readonly channels: number;
    readonly members: number | null;
    readonly emojis: number;
    readonly stickers: number;
    readonly bans: number;
}

/** Der Server-Teil, wie der Bot ihn liefert. Das Admin Dashboard kennt nur die Zähler und reicht den Rest durch. */
export interface IServerPartJson {
    readonly counts: IServerCounts;
    readonly [key: string]: unknown;
}

export const AREA_IDS = ["einstellungen", "nachrichten", "bewerbungen", "voice", "level", "tickets", "moderation", "community", "teams", "clips"] as const;
export type AreaId = (typeof AREA_IDS)[number];

/** Eine Tabelle ohne guild_id, deren Zeilen an einer gesicherten hängen. */
export interface IChildTable {
    readonly table: string;
    readonly parent: string;
    /** Spalte im Kind, die auf parent.id zeigt. */
    readonly key: string;
}

export interface IArea {
    readonly id: AreaId;
    readonly label: string;
    /** Tabellen mit guild_id, in der Reihenfolge, in der sie eingefügt werden. */
    readonly tables: readonly string[];
    readonly children: readonly IChildTable[];
    /** Daten der Mitglieder: Zurückladen kostet, was seit dem Backup passiert ist. */
    readonly members: boolean;
}

export const AREAS: readonly IArea[] = [
    { id: "einstellungen", label: "Module und Einstellungen", tables: ["guild_settings", "module_settings", "ticket_settings", "mod_settings"], children: [], members: false },
    { id: "nachrichten", label: "Nachrichten und Panels", tables: ["custom_messages", "self_role_panels", "auto_responses", "role_lists"], children: [], members: false },
    { id: "bewerbungen", label: "Bewerbungen", tables: ["apply_forms", "apply_submissions"], children: [], members: true },
    { id: "voice", label: "Voice und Streams", tables: ["voice_hubs", "stream_notifiers"], children: [], members: false },
    { id: "level", label: "Level und Aktivität", tables: ["levels", "member_activity", "guild_activity", "channel_activity"], children: [], members: true },
    { id: "tickets", label: "Tickets", tables: ["tickets", "ticket_transcripts", "ticket_blacklist"], children: [], members: true },
    { id: "moderation", label: "Moderation", tables: ["mod_cases"], children: [], members: true },
    {
        id: "community",
        label: "Community",
        tables: ["polls", "giveaways"],
        children: [
            { table: "poll_votes", parent: "polls", key: "poll_id" },
            { table: "giveaway_entries", parent: "giveaways", key: "giveaway_id" },
        ],
        members: true,
    },
    {
        id: "teams",
        label: "Teams und Wettbewerb",
        tables: ["team_groups", "teams", "matches", "matchups", "lft_requests", "sixmans_players", "sixmans_rounds"],
        children: [{ table: "team_members", parent: "teams", key: "team_id" }],
        members: true,
    },
    { id: "clips", label: "Clips", tables: ["clip_rounds", "clip_entries"], children: [{ table: "clip_votes", parent: "clip_rounds", key: "round_id" }], members: true },
];

/** Tabellen mit guild_id, die bewusst nicht gesichert werden: offene Kanäle und Warteschlangen, ein alter Stand wäre falsch. */
// av_*: Anti Villain ist Live-Zustand, der zu einem Zeitpunkt gehört. Ein Sicherheits-Backup entsteht vor dem Fall
// des Nukers - zurückgeladen, löschte es dessen gemerkte Rollen. Also nie im Backup, nie überschrieben.
// server_*: Zuordnung alter zu neuer IDs und laufende Ladevorgänge (Plan 32), ebenfalls Live-Zustand.
export const EXCLUDED_TABLES = ["temp_voices", "support_waits", "av_cases", "av_trust", "av_reports", "av_incidents", "av_events", "av_debris", "server_id_map", "server_restores"] as const;

export interface IBackupMeta {
    readonly id: number;
    readonly guildId: string;
    readonly guildName: string;
    readonly kind: BackupKind;
    readonly origin: BackupOrigin;
    readonly note: string | null;
    readonly byName: string | null;
    readonly createdAt: string;
    readonly bytes: number;
    readonly counts: Readonly<Partial<Record<AreaId, number>>>;
    /** Plan 32: welche Teile drin sind. Ältere Backups: nur bot. */
    readonly parts: readonly BackupPart[];
    /** Die Zähler des Server-Teils, null ohne ihn. */
    readonly server: IServerCounts | null;
}

/** Ein Backup mit der Anzahl Zeilen je Tabelle, für „Ansehen“. */
export interface IBackupDetail extends IBackupMeta {
    readonly tables: Readonly<Record<string, number>>;
}

/** Eine der 14 Nächte im Streifen einer Kachel. */
export type NightState = "ok" | "fail" | "hand" | "none";

export interface IGuildTile {
    readonly id: string;
    readonly name: string;
    readonly members: number | null;
    readonly modules: number | null;
    /** 14 Nächte, älteste zuerst. */
    readonly nights: readonly NightState[];
    readonly last: { readonly at: string; readonly kind: BackupKind } | null;
    /** Warum die letzte Nacht nicht geklappt hat, sonst null. */
    readonly problem: string | null;
    /** false: Der Bot ist nicht mehr auf dem Server, es gibt nur noch Backups von früher. */
    readonly present: boolean;
}

export interface IBackupsOverview {
    readonly available: boolean;
    /** Warum Backups gerade nicht gehen, sonst null. */
    readonly reason: string | null;
    readonly round: {
        readonly at: string;
        readonly ok: number;
        readonly total: number;
        readonly failed: readonly { readonly guildId: string; readonly name: string; readonly reason: string }[];
    } | null;
    readonly running: boolean;
    readonly guilds: readonly IGuildTile[];
}

export interface IGuildBackups {
    readonly guild: IGuildTile;
    /** Was der Server im Bot-Dashboard für automatische Backups eingestellt hat. */
    readonly plan: IPlanState;
    /** Neueste zuerst. */
    readonly backups: readonly IBackupMeta[];
}

export interface IRestoreInput {
    readonly areas: readonly AreaId[];
    /** Der Name des Servers, eingetippt zur Bestätigung. */
    readonly confirm: string;
}

export interface IBotRestoreReport {
    readonly reached: boolean;
    readonly reposted: readonly string[];
    readonly removed: readonly string[];
    readonly problems: readonly string[];
}

export interface IRestoreResult {
    /** Das automatische Backup vom Stand davor: damit lässt sich das Zurückladen rückgängig machen. */
    readonly safetyId: number;
    readonly areas: readonly { readonly area: AreaId; readonly rows: number }[];
    readonly bot: IBotRestoreReport;
}

/** Was das Bot-Dashboard zu einem Server bekommt: nur Backups mit Herkunft server. */
export interface IServerBackups {
    readonly guildId: string;
    readonly plan: IPlanState;
    /** Neueste zuerst. */
    readonly backups: readonly IBackupMeta[];
    readonly hand: { readonly used: number; readonly max: number };
}

/** Höchstlänge der Notiz bei einem Backup von Hand. */
export const BACKUP_NOTE_MAX = 200;
