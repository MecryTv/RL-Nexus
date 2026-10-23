import { DASHBOARD_PATH } from "./Dashboard";
import { IMatchupBody, IMatchupSettings, MatchupMode, MatchupStatus } from "../interfaces/services/matchups/IMatchups";
import { TeamRole } from "../interfaces/services/teams/ITeams";

/**
 * Matchups: Grenzen, Vorgaben und Beschriftungen. Siehe docs/Matchups.md.
 */
export const MATCHUPS_MODULE = "matchups";

export const MATCHUPS_ACCENT = "#ff1e2d";

export const MAX_OPPONENT = 80;
export const MAX_LEAGUE = 60;
export const MAX_NOTE = 500;
export const MAX_LEAGUES = 12;
export const MAX_PINGS = 5;
export const MAX_SCORE = 99;
/** So weit im Voraus darf höchstens eingetragen werden. */
export const MAX_AHEAD = 180;
/** So lange vorher darf höchstens erinnert werden (Minuten). */
export const MAX_REMIND = 1440;
/** Wie viele Partien eine Liste auf einmal zeigt. */
export const PAGE_SIZE = 25;

/**
 * Wer im Kader eintragen darf. Spieler und Ersatz nicht: sonst trägt jeder
 * etwas ein, und niemand weiß, welcher Termin gilt.
 */
export const ENTRY_ROLES: TeamRole[] = ["captain", "cocaptain", "manager", "coach"];

export const MODES: MatchupMode[] = ["1v1", "2v2", "3v3", "4v4"];

export const MODE_LABELS: Record<MatchupMode, string> = {
    "1v1": "1v1 Duell",
    "2v2": "2v2 Doppel",
    "3v3": "3v3 Standard",
    "4v4": "4v4 Chaos",
};

export const STATUS_LABELS: Record<MatchupStatus, string> = {
    planned: "Geplant",
    played: "Gespielt",
    cancelled: "Abgesagt",
};

/** Best-of zur Auswahl. 0 heißt: nicht festgelegt. */
export const BEST_OF = [0, 1, 3, 5, 7, 9];

/**
 * Die Platzhalter je Nachricht. Das Dashboard führt dieselben Schlüssel mit
 * Beschriftung und Beispiel (src/dashboard/client/constants/Placeholders.ts);
 * npm run check:matchups vergleicht beide Listen.
 */
export const MATCHUP_KEYS = [
    "guild",
    "guild.icon",
    "team",
    "team.tag",
    "team.role",
    "gegner",
    "liga",
    "modus",
    "bestof",
    "zeit",
    "zeit.kurz",
    "countdown",
    "stream",
    "stream.link",
    "notiz",
    "eingetragen",
] as const;

/** Die Ergebnis-Nachricht kennt zusätzlich den Ausgang. */
export const RESULT_KEYS = [...MATCHUP_KEYS, "ergebnis", "ausgang"] as const;

export const MATCHUP_IMAGES = ["{guild.icon}"] as const;

function card(accent: string, ...blocks: string[]): IMatchupBody {
    return {
        kind: "v2",
        content: "",
        embed: null,
        doc: {
            accent,
            blocks: blocks.map((body) => (body === "---" ? { type: "separator" as const, line: true } : { type: "text" as const, body })),
        },
    };
}

export function DefaultAnnounce(): IMatchupBody {
    return card(
        MATCHUPS_ACCENT,
        "## ⚔️ {team} vs. {gegner}",
        "-# {liga} · {modus}{bestof}",
        "---",
        "**Anpfiff** {zeit}\n**Das ist** {countdown}",
        "{stream}",
        "-# Eingetragen von {eingetragen}"
    );
}

export function DefaultRemind(): IMatchupBody {
    return card(
        "#ffc53d",
        "## ⏰ Gleich geht es los",
        "**{team} vs. {gegner}** – {countdown}",
        "-# {liga} · {modus}{bestof} · Anpfiff {zeit.kurz}",
        "{stream}"
    );
}

export function DefaultResult(): IMatchupBody {
    return card(
        "#3ba55c",
        "## {ausgang} {team} {ergebnis} {gegner}",
        "-# {liga} · {modus}{bestof} · {zeit.kurz}",
        "---",
        "{notiz}"
    );
}

export function DefaultMatchupSettings(): IMatchupSettings {
    return {
        channelId: null,
        pingRoles: [],
        remindMinutes: 30,
        open: true,
        results: true,
        maxAhead: 60,
        leagues: [],
        announce: DefaultAnnounce(),
        remind: DefaultRemind(),
        result: DefaultResult(),
    };
}

/** Die Adresse, unter der Captains ihre Partien eintragen. Im Dev-Modus mit Praefix. */
export function MatchupLink(base: string, guildId: string): string {
    return `${base}${DASHBOARD_PATH}/matchups/${guildId}`;
}
