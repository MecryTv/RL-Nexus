import { ABSENCE_LIST_DAYS, AddDays, Day, DaysBetween, MAX_ABSENCE_NOTE, ParseDay, Today } from "../../constants/Absences";
import { PLAYING_ROLES } from "../../constants/Teams";
import { IAbsenceSettings, IAbsenceStatus, ITeamAbsence } from "../../interfaces/services/teams/IAbsences";
import { ITeamPlayer } from "../../interfaces/services/teams/ITeams";

/**
 * Die Regeln der Abmeldungen ohne Discord und Datenbank (W-0095): Eingabe
 * prüfen, Zeiträume zusammenlegen, zurückmelden, Stand je Team.
 */

export interface IAbsenceInput {
    from: string;
    to: string;
    reason: string;
    note: string;
}

export type CheckedAbsence = { startsOn: Day; endsOn: Day; reason: string; note: string } | { error: string };

const DAY_HELP = "Geht: heute, morgen, Sa oder 15.11.";

/**
 * Prüft das Formular. Leeres „bis“ heißt: nur der eine Tag. keepStart: Beim
 * Ändern einer laufenden Abmeldung darf ihr alter Start in der Vergangenheit liegen.
 */
export function CheckAbsence(input: IAbsenceInput, settings: IAbsenceSettings, now: number, keepStart: Day | null = null): CheckedAbsence {
    const today = Today(now);
    const startsOn = ParseDay(input.from || "heute", now);

    if (!startsOn) return { error: `„Von“ verstehe ich nicht. ${DAY_HELP}` };

    const endsOn = input.to.trim() ? ParseDay(input.to, now, startsOn) : startsOn;

    if (!endsOn) return { error: `„Bis“ verstehe ich nicht. ${DAY_HELP}` };
    if (endsOn < startsOn) return { error: "„Bis“ liegt vor „Von“." };
    if (startsOn < today && startsOn !== keepStart) return { error: "Abmelden geht ab heute, nicht rückwirkend." };
    if (DaysBetween(startsOn, endsOn) + 1 > settings.maxDays) return { error: `Höchstens ${settings.maxDays} Tage am Stück.` };
    if (DaysBetween(today, startsOn) > settings.aheadDays) return { error: `Höchstens ${settings.aheadDays} Tage im Voraus.` };

    const reason = input.reason.trim();

    if (reason && !settings.reasons.includes(reason)) return { error: "Diesen Grund gibt es hier nicht." };
    if (!reason && settings.reasonRequired) return { error: "Bitte wähl einen Grund." };

    return { startsOn, endsOn, reason, note: input.note.replace(/\s+/g, " ").trim().slice(0, MAX_ABSENCE_NOTE) };
}

/**
 * Legt einen neuen Zeitraum mit denen zusammen, die ihn überschneiden oder
 * direkt anschließen (gleicher Spieler, gleiches Team). keep: diese Zeile
 * wird zum Ganzen, drop: diese fallen weg. keep null: nichts berührt.
 */
export function MergeAbsence(existing: ITeamAbsence[], startsOn: Day, endsOn: Day): { startsOn: Day; endsOn: Day; keep: number | null; drop: number[] } {
    let start = startsOn;
    let end = endsOn;
    let touched = existing.filter((entry) => entry.startsOn <= AddDays(end, 1) && AddDays(entry.endsOn, 1) >= start);

    // Wer dazukommt, kann weitere berühren: so lange erweitern, bis nichts mehr dazukommt.
    for (let grew = true; grew; ) {
        for (const entry of touched) {
            if (entry.startsOn < start) start = entry.startsOn;
            if (entry.endsOn > end) end = entry.endsOn;
        }

        const next = existing.filter((entry) => entry.startsOn <= AddDays(end, 1) && AddDays(entry.endsOn, 1) >= start);

        grew = next.length > touched.length;
        touched = next;
    }

    const ids = touched.map((entry) => entry.id).sort((a, b) => a - b);

    return { startsOn: start, endsOn: end, keep: ids[0] ?? null, drop: ids.slice(1) };
}

/** Zurückmelden: Was heute läuft, endet gestern - oder fällt weg, wenn es erst heute begann. Spätere bleiben. */
export function ReturnPlan(absences: ITeamAbsence[], today: Day): { end: { id: number; endsOn: Day }[]; drop: number[] } {
    const running = absences.filter((entry) => entry.startsOn <= today && entry.endsOn >= today);

    return {
        end: running.filter((entry) => entry.startsOn < today).map((entry) => ({ id: entry.id, endsOn: AddDays(today, -1) })),
        drop: running.filter((entry) => entry.startsOn === today).map((entry) => entry.id),
    };
}

/** Der Hinweis beim Eintragen eines Matchups: „1 von 3 ist dann abgemeldet: Joe.“ */
export function WarningText(here: number, of: number, names: string[]): string {
    const away = of - here;

    return `${away} von ${of} ${away === 1 ? "ist" : "sind"} dann abgemeldet: ${names.join(", ")}.`;
}

/** Wer heute fehlt und wer bald fehlt. Gezählt wird, wer mitspielt; nur wer im Kader steht, zählt überhaupt. */
export function AbsenceStatus(players: ITeamPlayer[], absences: ITeamAbsence[], today: Day): IAbsenceStatus {
    const roster = new Map(players.filter((player) => player.discordId).map((player) => [player.discordId!, player]));
    const mine = absences.filter((entry) => roster.has(entry.userId)).sort((a, b) => (a.startsOn === b.startsOn ? a.id - b.id : a.startsOn < b.startsOn ? -1 : 1));
    const now = mine.filter((entry) => entry.startsOn <= today && entry.endsOn >= today);
    const away = new Set(now.map((entry) => entry.userId));
    const playing = players.filter((player) => PLAYING_ROLES.includes(player.role));
    const horizon = AddDays(today, ABSENCE_LIST_DAYS);

    return {
        here: playing.filter((player) => !player.discordId || !away.has(player.discordId)).length,
        of: playing.length,
        now,
        soon: mine.filter((entry) => entry.startsOn > today && entry.startsOn <= horizon),
    };
}
