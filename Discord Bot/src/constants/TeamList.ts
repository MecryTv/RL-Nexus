/**
 * Die Vorlagen von {teams} aus dem früheren Reiter „Teams-Liste“. Seit Plan 27
 * gibt es nur noch den Team-Hub und „Alle Teams einzeln“ - {teams} bleibt leer,
 * die Liste wird nur noch gespeichert, damit alte Zeilen gültig bleiben.
 * Ohne Imports: das Dashboard bündelt die Datei mit.
 */

export interface ITeamListSettings {
    /** Wie ein Team in {teams} steht - mehrzeilig, mit den Platzhaltern der Team-Karte. */
    team: string;
    /** Wie ein Spieler in {team.members} steht - darf mehrere Zeilen haben. */
    member: string;
    /** Wie Coach und Manager in {team.members.staff} stehen - sie haben meist keinen Rang und keinen Tracker. */
    staff: string;
    /** Welche Aufgaben {team.members} zeigt. */
    roles: string[];
}

export const MAX_LIST_TEAM = 1000;
export const MAX_LIST_MEMBER = 200;

/** Die Liste ab Werk - nur noch, damit gespeicherte Zeilen vollständig sind. */
export function DefaultTeamList(): ITeamListSettings {
    return {
        team: "**{team.name}** `{team.tag}` · {team.rank.icon} {team.rank.short} · {team.mmr} MMR\n{team.members}\n-# {team.members.staff}\n-# Ligen: {team.leagues}",
        member: "{spieler.role.icon} {spieler.rank.icon} {spieler} · `{spieler.mmr}` · {spieler.tracker}",
        staff: "{spieler.role.icon} {spieler}",
        roles: ["captain", "cocaptain", "player", "sub", "trial"],
    };
}
