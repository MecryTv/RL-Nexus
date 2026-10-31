/**
 * Epic-Name geändert (Plan 33): die reine Logik ohne Discord und Datenbank -
 * erkennen, dass ein Name weg ist, und ihn in Kader und Platzhaltern
 * umschreiben. Siehe docs/Teams.md.
 */
import { PlayerKey } from "../../builder/TeamView";
import { PlaceholderKey } from "../../constants/Placeholders";
import { IPlayerSnapshot, ITeam, ITeamSettings } from "../../interfaces/services/teams/ITeams";

/** So steht es im Stand, wenn der Name jetzt einem anderen Konto gehört. */
export const TAKEN_ERROR = "Der Name gehört jetzt einem anderen Epic-Konto.";

/**
 * Nur wenn der Name vorher gefunden wurde (Name oder gemerkte Konto-ID im
 * Stand): "gone", wenn Prime ihn jetzt nicht mehr kennt, "taken", wenn er
 * jetzt zu einem anderen Konto gehört. Fehler und Zeitüberschreitung zählen
 * nicht. "taken" gilt auch für den Stand, den Kept dafür behält - sonst kämen
 * beim nächsten Abgleich die fremden Ränge.
 */
export function NameLost(previous: IPlayerSnapshot | undefined, fresh: IPlayerSnapshot): "gone" | "taken" | null {
    if (!previous?.name && !previous?.accountId) return null;
    if (previous.accountId && fresh.accountId && previous.accountId !== fresh.accountId) return "taken";

    return fresh.missing && !previous.missing ? "gone" : null;
}

/** Der Stand, den der Abgleich behält, wenn der Name weg ist: bei "taken" nie die fremden Ränge. */
export function Kept(previous: IPlayerSnapshot, fresh: IPlayerSnapshot, kind: "gone" | "taken"): IPlayerSnapshot {
    return kind === "gone" ? fresh : { ...previous, at: fresh.at, error: TAKEN_ERROR };
}

/** Schreibt den Namen in diesem Team um: gleiche Discord-ID, wenn bekannt, und gleicher Name ohne Groß/klein. */
export function RenamePlayers(team: ITeam, match: { discordId: string | null; oldName: string }, newName: string): boolean {
    const old = match.oldName.toLowerCase();
    let changed = false;

    for (const player of team.players) {
        if (match.discordId !== null && player.discordId !== match.discordId) continue;
        if (player.epicName.toLowerCase() !== old || player.epicName === newName) continue;

        player.epicName = newName;
        changed = true;
    }

    return changed;
}

/** {altername} und {altername.feld} werden zu {neuername…}, so wie Fill sie liest. null: Es kam keiner vor. */
export function RenamePlaceholders(settings: ITeamSettings, oldName: string, newName: string): ITeamSettings | null {
    const oldKey = PlayerKey(oldName);
    const newKey = PlayerKey(newName);

    if (!oldKey || !newKey || oldKey === newKey) return null;

    let changed = false;
    const json = JSON.stringify(settings).replace(/\{([A-Za-z0-9._-]+)\}/g, (token, key: string) => {
        const normal = PlaceholderKey(key);

        if (normal !== oldKey && !normal.startsWith(`${oldKey}.`)) return token;

        changed = true;

        return `{${newKey}${normal.slice(oldKey.length)}}`;
    });

    return changed ? (JSON.parse(json) as ITeamSettings) : null;
}
