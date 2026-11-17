/**
 * W-0133: Was je Modul im Admin einstellbar ist, mit dem heutigen festen Wert
 * des Bots als Standard und harten Grenzen. Dieselbe Liste steht im Bot
 * (Discord Bot/src/constants/ModuleSettings.ts); npm run check:dashboard dort
 * prüft, dass beide gleich sind. Wie shared/limits.ts nur wegstreichbare Syntax.
 *
 * server: false heißt „nur für alle Server“ (gemeinsamer Ablauf im Bot oder eine
 * Sperre, die der Person gehört). askable: Voreinstellung für „Server sehen ‚auf
 * Anfrage änderbar‘“.
 */
export interface IModuleSettingDef {
    readonly key: string;
    readonly label: string;
    readonly unit: string | null;
    readonly standard: number;
    readonly min: number;
    readonly max: number;
    readonly server: boolean;
    readonly askable: boolean;
}

const def = (key: string, label: string, unit: string | null, standard: number, min: number, max: number, server: boolean, askable: boolean): IModuleSettingDef => ({
    key,
    label,
    unit,
    standard,
    min,
    max,
    server,
    askable,
});

export const MODULE_SETTINGS: Readonly<Record<string, readonly IModuleSettingDef[]>> = {
    "rl-tracking": [
        def("switchDays", "Wechsel-Sperre", "Tage", 3, 0, 30, false, true),
        def("fixMinutes", "Korrektur-Fenster", "Min.", 60, 0, 1440, false, false),
        def("linkMinutes", "Link gültig", "Min.", 10, 2, 60, false, false),
        def("rankMaxAgeMinutes", "Ränge neu holen nach", "Min.", 10, 2, 120, false, false),
    ],
    teams: [
        def("maxGroups", "Gruppen höchstens", null, 12, 1, 50, true, true),
        def("maxTeams", "Teams höchstens", null, 40, 1, 200, true, true),
        def("maxPlayers", "Spieler je Team", null, 12, 1, 50, true, true),
        def("maxAbsenceDays", "Abwesenheit höchstens", "Tage", 365, 1, 730, true, false),
    ],
    "anti-villain": [
        def("raidWindowSeconds", "Raid erkannt in", "s", 30, 5, 300, true, false),
        def("raidSlowmodeSeconds", "Slowmode bei Raid", "s", 30, 0, 21600, true, false),
        def("nukeWindowMinutes", "Nuke erkannt in", "Min.", 10, 1, 60, true, false),
        def("trustDays", "Vertraut ab", "Tage", 30, 1, 365, true, false),
        def("freshDays", "Neues Konto bis", "Tage", 7, 0, 90, true, false),
    ],
    tickets: [
        def("maxOpenPerUser", "Offene Tickets je Person, höchste Wahl", null, 10, 1, 24, true, true),
        def("maxModerators", "Moderatoren höchstens", null, 25, 1, 25, true, false),
        def("transcriptMessages", "Transkript höchstens", "Nachrichten", 5000, 100, 20000, true, true),
        def("transcriptMegabytes", "Transkript höchstens", "MB", 100, 1, 500, true, true),
    ],
    levels: [
        def("maxXpPerAction", "XP je Aktion höchstens", null, 500, 1, 5000, true, true),
        def("maxBoosts", "Boosts höchstens", null, 10, 1, 50, true, true),
        def("maxBoostFactor", "Boost-Faktor höchstens", null, 3, 1, 10, true, true),
        def("logKeepDays", "Protokoll aufbewahren", "Tage", 180, 7, 730, false, false),
    ],
    giveaways: [
        def("maxWinners", "Gewinner höchstens", null, 50, 1, 500, true, true),
        def("maxDays", "Laufzeit höchstens", "Tage", 60, 1, 365, true, true),
        def("scheduleDays", "Planen voraus", "Tage", 90, 1, 365, true, false),
        def("maxBonusRoles", "Bonus-Rollen höchstens", null, 10, 0, 25, true, false),
    ],
    "twitch-notifier": [
        def("maxNotifiers", "Meldungen je Server", null, 25, 1, 100, true, true),
        def("cardMinutes", "Live-Karte aktualisieren alle", "Min.", 5, 1, 60, false, false),
    ],
    "youtube-notifier": [
        def("maxNotifiers", "Meldungen je Server", null, 25, 1, 100, true, true),
        def("checkMinutes", "Prüfen alle", "Min.", 5, 1, 60, false, false),
    ],
    clips: [
        def("maxPerUser", "Clips je Person, höchste Wahl", null, 10, 1, 50, true, true),
        def("fileMegabytes", "Clip-Datei höchstens", "MB", 100, 1, 500, true, true),
        def("places", "Plätze in der Wahl", null, 3, 1, 10, true, false),
    ],
    gallery: [def("imageMegabytes", "Bild höchstens", "MB", 8, 1, 9, true, true)],
};

/** Die Einstellungen eines Moduls, leer für Module ohne eigene Werte. */
export function settingsOf(module: string): readonly IModuleSettingDef[] {
    return MODULE_SETTINGS[module] ?? [];
}
