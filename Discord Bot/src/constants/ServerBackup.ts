import { RestoreMode, ServerPart } from "../interfaces/services/serverbackup/IServerBackup";

/**
 * Backups für den Discord-Server (Plan 32): Teile, Modi, Grenzen.
 * Das Backup-Modul selbst heißt "backups" und ist fest an.
 */
export const BACKUPS_MODULE = "backups";

/**
 * Backups, die den Discord-Server mitnehmen: Das Admin Dashboard liest ihn
 * beim Bot mit 120 s Zeitlimit (SNAPSHOT_TIMEOUT). Der Bot wartet länger,
 * damit dessen Antwort ankommt (W-0041 M7).
 */
export const SNAPSHOT_WAIT_MS = 130_000;

/** Die Teile in der Reihenfolge, in der sie geladen werden. */
export const SERVER_PARTS: readonly { id: ServerPart; label: string }[] = [
    { id: "roles", label: "Rollen" },
    { id: "channels", label: "Kanäle und Kategorien" },
    { id: "permissions", label: "Berechtigungen" },
    { id: "settings", label: "Servereinstellungen" },
    { id: "expressions", label: "Emojis und Sticker" },
    { id: "members", label: "Rollen der Mitglieder" },
    { id: "bans", label: "Bans" },
];

export const SERVER_PART_IDS = SERVER_PARTS.map((part) => part.id);

export const RESTORE_MODES: readonly { id: RestoreMode; label: string }[] = [
    { id: "repair", label: "Reparieren" },
    { id: "exact", label: "Genau wie im Backup" },
    { id: "other", label: "Auf einen anderen Server" },
];

/** Emoji-, Sticker- und Rollenbilder zusammen höchstens so viel je Backup. */
export const EXPRESSION_BYTES_MAX = 8 * 1024 * 1024;

/** Unterschiede: so viele Namen je Zeile, dann „und N weitere“. */
export const DIFF_NAMES = 10;

/** Reparieren aus einem Sicherheits-Backup nimmt Trümmer aus so vielen Minuten davor. */
export const DEBRIS_WINDOW_MS = 10 * 60_000;

/** Trümmer bleiben 7 Tage. */
export const DEBRIS_KEEP_MS = 7 * 86_400_000;

export interface IBackupSettings {
    logChannelId: string | null;
}

export function DefaultBackupSettings(): IBackupSettings {
    return { logChannelId: null };
}
