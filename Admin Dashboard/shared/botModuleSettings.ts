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
        def("rankMaxAgeMinutes", "Ränge neu holen nach", "Min.", 10, 10, 120, false, false),
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
    ],
    levels: [
        def("maxXpPerAction", "XP je Aktion höchstens", null, 500, 1, 5000, true, true),
        def("maxBoosts", "Boosts höchstens", null, 10, 1, 50, true, true),
        def("maxBoostFactor", "Boost-Faktor höchstens", null, 3, 1, 10, true, true),
        def("logKeepDays", "Protokoll aufbewahren", "Tage", 180, 7, 180, false, false),
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
    // W-0137 (18.11.2026): Grenzen für alle Module; Standard = bisherige Konstante.
    "rl-6mans": [
        def("maxRanks", "Eigene Stufen höchstens", null, 12, 1, 25, true, true),
        def("maxRunning", "Laufende Runden höchstens", null, 10, 1, 50, true, true),
    ],
    lft: [
        def("maxQuestions", "Fragen je Seite höchstens", null, 15, 1, 25, true, true),
        def("maxExpireDays", "Suche läuft höchstens", "Tage", 180, 1, 365, true, false),
    ],
    matchups: [
        def("maxLeagues", "Ligen höchstens", null, 12, 1, 25, true, true),
        def("maxAheadDays", "Eintragen im Voraus höchstens", "Tage", 180, 30, 365, true, false),
        def("maxOpen", "Offene Partien höchstens", null, 100, 10, 500, true, true),
    ],
    "rocket-roulette": [
        def("maxFixedChannels", "Feste Team-Kanäle höchstens", null, 40, 2, 50, true, true),
        def("maxLobbies", "Lobbys je Runde höchstens", null, 20, 1, 24, true, false),
        def("maxPlanned", "Geplante Abende höchstens", null, 10, 1, 30, true, false),
    ],
    "role-lists": [
        def("maxLists", "Listen höchstens", null, 10, 1, 25, true, true),
        def("maxRoles", "Rollen je Liste höchstens", null, 20, 1, 25, true, true),
        def("maxPresets", "Bild-Vorlagen höchstens", null, 10, 1, 25, true, false),
    ],
    moderation: [
        def("maxStages", "Warn-Stufen höchstens", null, 10, 1, 20, true, false),
        def("maxEvidence", "Beweise je Fall höchstens", null, 20, 1, 50, true, true),
        def("evidenceMegabytes", "Beweisbild höchstens", "MB", 8, 1, 25, true, true),
    ],
    automod: [
        def("maxWords", "Wörter je Filter höchstens", null, 200, 10, 1000, true, true),
        def("maxIgnore", "Ausnahmen je Liste höchstens", null, 25, 1, 25, true, false),
    ],
    logging: [def("maxIgnore", "Ausnahmen je Liste höchstens", null, 25, 1, 25, true, false)],
    welcome: [def("maxRoles", "Auto-Rollen höchstens", null, 10, 1, 25, true, true)],
    apply: [
        def("maxForms", "Formulare höchstens", null, 15, 1, 25, true, true),
        def("maxQuestions", "Fragen je Formular höchstens", null, 20, 1, 50, true, true),
        def("maxReviewers", "Prüfer höchstens", null, 15, 1, 25, true, false),
    ],
    "reaction-roles": [
        def("maxPanels", "Panels höchstens", null, 25, 1, 50, true, true),
        def("maxRoles", "Rollen je Panel höchstens", null, 25, 1, 25, true, false),
        def("maxReactions", "Rollen bei Reaktionen höchstens", null, 20, 1, 20, true, false),
    ],
    polls: [
        def("maxOptions", "Antworten je Umfrage höchstens", null, 10, 2, 10, true, false),
        def("maxOpen", "Offene Umfragen höchstens", null, 25, 1, 100, true, true),
    ],
    "voice-hub": [
        def("maxHubs", "Hubs höchstens", null, 10, 1, 25, true, true),
        def("maxTempChannels", "Temporäre Kanäle höchstens", null, 50, 5, 200, true, true),
        def("maxTrusted", "Vertraute und Gesperrte höchstens", null, 25, 1, 25, true, false),
    ],
    "custom-message": [
        def("maxMessages", "Nachrichten höchstens", null, 50, 1, 200, true, true),
        def("maxResponses", "Stichwörter höchstens", null, 50, 1, 200, true, true),
    ],
};

/** Die Einstellungen eines Moduls, leer für Module ohne eigene Werte. */
export function settingsOf(module: string): readonly IModuleSettingDef[] {
    return MODULE_SETTINGS[module] ?? [];
}
