import { IRouletteSettings } from "../interfaces/services/roulette/IRoulette";
import { ALPHABET, LobbyCode } from "./SixMans";
import { ParseDate, ParseTime, ZonedDate } from "../services/RunnableService";

/**
 * Rocket Roulette (W-0087): Roulette-Abend mit privaten Rocket-League-Lobbys.
 * Siehe docs/superpowers/specs/2026-11-11-rocket-roulette-design.md.
 */
export const ROULETTE_MODULE = "rocket-roulette";

/** Anfang der Custom-IDs: rr:<aktion>:<abend>[:<runde>[:<lobby>]]. */
export const ROULETTE_PREFIX = "rr";

/** Bilder, die sich ändern, höchstens so oft je Nachricht neu zeichnen. */
export const IMAGE_THROTTLE_MS = 4_000;
/** Wartet eine Lobby länger auf ihren Host, warnt die Steuerkarte. */
export const HOST_WAIT_WARN_MS = 3 * 60_000;
/** So lange bleiben beendete Abende gespeichert. */
export const KEEP_MS = 30 * 24 * 3_600_000;

export const MAX_FIXED_CHANNELS = 40;
export const MAX_LOBBY_NAME = 20;
export const MAX_PASSWORD = 16;

/** Erlaubt in Passwörtern (wie bei 2, 4 & 6 Mans: nichts, was man am Controller verwechselt). */
export const PASSWORD_ALPHABET = ALPHABET;

export { LobbyCode };

export function DefaultRouletteSettings(): IRouletteSettings {
    return {
        categoryId: null,
        infoChannelId: null,
        controlChannelId: null,
        waitingRoomId: null,
        mainVoiceId: null,
        moderatorRoleId: null,
        teamChannels: "auto",
        fixedChannelIds: [],
        teamSize: 3,
        lobbyName: "Lobby{teams}",
        password: { mode: "fixed", value: "testo" },
    };
}

/** Lobby-Name aus dem Muster: {teams} wird zu den Teamnummern, ohne {teams} hängen sie hinten dran. */
export function LobbyLabel(pattern: string, teams: number[]): string {
    const numbers = teams.join("");

    return pattern.includes("{teams}") ? pattern.split("{teams}").join(numbers) : `${pattern}${numbers}`;
}

/**
 * Startzeit aus „/roulette planen zeit: datum:“ in deutscher Zeit. Ohne Datum
 * heute, ist die Zeit schon vorbei morgen. Unsinn oder ein Datum in der
 * Vergangenheit ergibt null.
 */
export function StartTime(time: string, date: string | null, now: number): number | null {
    const clock = ParseTime(time.trim().replace(/^(\d):/, "0$1:"));

    if (!clock) return null;

    if (date?.trim()) {
        const day = ParseDate(date);
        const at = day ? ZonedDate(day.year, day.month, day.day, clock.hours, clock.minutes).getTime() : null;

        return at !== null && at > now ? at : null;
    }

    const today = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(now));
    const part = (type: string) => Number(today.find((entry) => entry.type === type)?.value);
    const at = ZonedDate(part("year"), part("month"), part("day"), clock.hours, clock.minutes).getTime();

    return at > now ? at : ZonedDate(part("year"), part("month"), part("day") + 1, clock.hours, clock.minutes).getTime();
}
