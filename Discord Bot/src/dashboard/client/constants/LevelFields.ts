/**
 * Welche Einstellungen des Level Systems zu welcher Seite gehören - gespeichert
 * wird je Seite nur das, damit keine die andere überschreibt (Plan 34). Ohne
 * DOM, damit scripts/CheckLevels.ts die Listen prüfen kann.
 *
 * Plan 36: Die Zeile über dem Aufstiegs-Bild (`upLine`) steht nur noch im
 * Aufstiegs-Studio unter Level-Karte und wird dort mit dem Design gespeichert.
 * Plan 37: doppelte Punkte unter Level System, Aktivste unter Belohnungen.
 * Plan 43: die Boost-Nachrichten mit den doppelten Punkten; die Rangliste im
 * Kanal speichert die Ranglisten-Seite selbst (nur boardPost).
 */
export const LEVEL_FIELDS = {
    levels: ["chat", "voice", "base", "roleBonus", "channelBonus", "noChannels", "noRoles", "fair", "boosts", "boostChannelId", "boostMessages"],
    "level-rewards": ["announce", "announceChannelId", "announceDelete", "message", "rewards", "stack", "upMode", "top"],
} as const satisfies Record<string, readonly string[]>;

export type LevelView = keyof typeof LEVEL_FIELDS;
