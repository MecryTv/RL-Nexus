import { Day } from "../../../constants/Absences";
import { TeamRole } from "./ITeams";

/** Eine Abmeldung (W-0095): ein Spieler, ein Team, ein Zeitraum. „bis“ zählt mit. */
export interface ITeamAbsence {
    id: number;
    guildId: string;
    teamId: number;
    userId: string;
    startsOn: Day;
    endsOn: Day;
    /** Leer: ohne Grund. Sehen nur die Rollen aus viewers. */
    reason: string;
    note: string;
    createdAt: number;
}

/** Einstellungen der Abmeldungen, Teil von ITeamSettings. */
export interface IAbsenceSettings {
    enabled: boolean;
    /** Wer bei /abmeldungen die Gründe sieht. Wer „Server verwalten“ hat, sieht sie immer. */
    viewers: TeamRole[];
    reasonRequired: boolean;
    reasons: string[];
    /** Höchstens so viele Tage lang. */
    maxDays: number;
    /** Höchstens so viele Tage im Voraus. */
    aheadDays: number;
    /** Panel „Verfügbarkeit“ im Kanal des Teams. */
    panel: boolean;
    /** Marke auf der gezeichneten Karte. */
    card: boolean;
    /** Hinweis bei Matchups. */
    matchupWarning: boolean;
}

/** Was ein Team heute und in den nächsten Tagen hat. */
export interface IAbsenceStatus {
    /** Heute da, von allen, die mitspielen. */
    here: number;
    of: number;
    /** Heute weg, nach Beginn. */
    now: ITeamAbsence[];
    /** Fängt in den nächsten Tagen an. */
    soon: ITeamAbsence[];
}
