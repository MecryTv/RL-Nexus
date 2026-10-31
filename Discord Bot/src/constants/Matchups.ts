import { DASHBOARD_PATH } from "./Dashboard";
import { IMatchup, IMatchupBody, IMatchupRecord, IMatchupSettings, MatchupMode, MatchupStatus, Outcome } from "../interfaces/services/matchups/IMatchups";
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

/* ----------------------------------------------------------
   Plan 28: Discord, Stand, Bilanz
   ---------------------------------------------------------- */
/** Uhrzeiten aus Discord gelten in dieser Zone - Discord nennt dem Bot die des Nutzers nicht. */
export const MATCHUP_ZONE = "Europe/Berlin";
/** So lange steht „Läuft gerade“ höchstens oben in der Ankündigung (Stunden). */
export const LIVE_HOURS = 3;
/** Bis so lange nach Anpfiff gilt eine Partie ohne Ergebnis noch als anstehend (Stunden). */
export const UPCOMING_GRACE_HOURS = 6;
/** So viele Partien zeigt /matchup liste. */
export const LIST_LIMIT = 10;
/** So viele Spiele zeigt die Form. */
export const FORM_SIZE = 5;
/** Höchstens so viele Stunden nach Anpfiff wird ans Ergebnis erinnert. */
export const MAX_RESULT_REMIND = 48;
/** Präfix der Knöpfe, Menüs und Fenster in Discord. */
export const MATCHUPS_PREFIX = "matchups";

export const OUTCOME_COLORS = { win: "#3ba55c", loss: "#f23f43", draw: "#9aa3ad", cancel: "#9aa3ad" } as const;
export const REMIND_ACCENT = "#ffc53d";

/** Wer nicht eintragen darf, liest das - nur für sich. */
export const MATCHUP_NO_RIGHT = "Das dürfen Captain, Co-Captain, Manager und Coach des Teams – und wer den Server verwaltet.";

/** Wenn ParseKickoff nichts versteht. */
export const KICKOFF_HELP = "Das verstehe ich nicht. Schreib es so: „heute 20:00“, „morgen 19:30“, „Sa 18:00“ oder „31.10. 20:00“.";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const WEEKDAYS: Record<string, number> = {
    so: 0, sonntag: 0, mo: 1, montag: 1, di: 2, dienstag: 2, mi: 3, mittwoch: 3,
    do: 4, donnerstag: 4, fr: 5, freitag: 5, sa: 6, samstag: 6,
};
const WEEKDAY_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

/** Ganze Wörter für die Vorschläge beim Tippen: „mor“ wird zu „morgen“ (W-0027). */
const DAY_WORDS = ["heute", "morgen", "übermorgen", "montag", "dienstag", "mittwoch", "donnerstag", "freitag", "samstag", "sonntag"];

/** Datum und Uhrzeit in MATCHUP_ZONE zu einem Zeitpunkt. */
export function ZoneParts(at: number): { year: number; month: number; day: number; hour: number; minute: number; weekday: number } {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat("en-GB", { timeZone: MATCHUP_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" })
            .formatToParts(new Date(at))
            .map((part) => [part.type, part.value])
    );
    const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday ?? "");

    return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), hour: Number(parts.hour), minute: Number(parts.minute), weekday };
}

/**
 * Eine Wanduhr in MATCHUP_ZONE als Zeitpunkt. Den Versatz zur Zone holt
 * Intl, zweimal - so stimmt es auch am Tag der Umstellung. null: das Datum
 * gibt es nicht (31.02.).
 */
export function FromZone(year: number, month: number, day: number, hour: number, minute: number): number | null {
    if (hour > 23 || minute > 59 || month < 1 || month > 12 || day < 1) return null;

    const wall = Date.UTC(year, month - 1, day, hour, minute);
    const check = new Date(wall);

    if (check.getUTCDate() !== day || check.getUTCMonth() !== month - 1) return null;

    const offset = (at: number): number => {
        const parts = ZoneParts(at);

        return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - at;
    };
    const first = wall - offset(wall);

    return wall - offset(first);
}

/** Der Kalendertag in MATCHUP_ZONE, days Tage nach dem von now. */
function DayAfter(now: number, days: number): { year: number; month: number; day: number } {
    const today = ZoneParts(now);
    const date = new Date(Date.UTC(today.year, today.month - 1, today.day + days));

    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

/**
 * Liest einen Anpfiff, wie man ihn in Discord tippt: „heute 20:00“, „morgen
 * 19:30“, „übermorgen 18:00“, „Sa 18:00“ (der nächste Samstag), „31.10.
 * 20:00“, „31.10.2026 20:00“ oder nur „20:00“ (heute). Seit W-0027 auch
 * „20.00“, „Sa, 18:00“ und „31.10.26 20:00“. Gemeint ist immer deutsche Zeit.
 * null: nicht lesbar.
 */
export function ParseKickoff(text: string, now: number): number | null {
    const clean = text.toLowerCase().replace(/uhr/g, "").replace(/\bum\b/g, "").replace(/,/g, " ").replace(/\s+/g, " ").trim();
    const match = /^(?:(heute|morgen|übermorgen|uebermorgen|[a-zäöü]+|\d{1,2}\.\d{1,2}\.(?:\d{4}|\d{2})?)\s+)?(\d{1,2})(?:[:.](\d{2}))?$/.exec(clean);

    if (!match) return null;

    const [, when = "heute", hourText, minuteText = "00"] = match;
    const hour = Number(hourText);
    const minute = Number(minuteText);

    if (when === "heute" || when === "morgen" || when === "übermorgen" || when === "uebermorgen") {
        const day = DayAfter(now, when === "heute" ? 0 : when === "morgen" ? 1 : 2);

        return FromZone(day.year, day.month, day.day, hour, minute);
    }

    // Object.hasOwn: sonst gälte auch „constructor“ als Wochentag (W-0027).
    if (Object.hasOwn(WEEKDAYS, when)) {
        const today = ZoneParts(now);
        let ahead = (WEEKDAYS[when]! - today.weekday + 7) % 7;
        let day = DayAfter(now, ahead);
        let at = FromZone(day.year, day.month, day.day, hour, minute);

        // Heute ist schon dieser Tag, aber die Uhrzeit ist vorbei: dann in einer Woche.
        if (at !== null && at < now && ahead === 0) {
            ahead = 7;
            day = DayAfter(now, ahead);
            at = FromZone(day.year, day.month, day.day, hour, minute);
        }

        return at;
    }

    const date = /^(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})?$/.exec(when);

    if (!date) return null;

    const [, dayText, monthText, yearText] = date;
    // „31.10.26“: zwei Stellen sind dieses Jahrhundert.
    const year = yearText ? (yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText)) : ZoneParts(now).year;
    const at = FromZone(year, Number(monthText), Number(dayText), hour, minute);

    // Ohne Jahr und schon vorbei: gemeint ist das nächste Jahr.
    if (!yearText && at !== null && at < now - DAY) return FromZone(year + 1, Number(monthText), Number(dayText), hour, minute);

    return at;
}

/** „Do, 29.10.“ - der Tag eines Zeitpunkts in MATCHUP_ZONE. */
function DayLabel(at: number): string {
    const parts = ZoneParts(at);

    return `${WEEKDAY_SHORT[parts.weekday]}, ${String(parts.day).padStart(2, "0")}.${String(parts.month).padStart(2, "0")}.`;
}

/** „Do, 29.10. 20:00“ in deutscher Zeit - wo Discord keine Zeitstempel zeigt (Menüs). */
export function KickoffLabel(at: number): string {
    const parts = ZoneParts(at);

    return `${DayLabel(at)} ${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

/**
 * Vorschläge beim Tippen für den Anpfiff. Der Wert ist der genaue Zeitpunkt
 * („t:<ms>“), der Name sagt, was gemeint ist: „heute 20:00 · Do, 29.10.“.
 */
export function KickoffSuggestions(text: string, now: number): { name: string; value: string }[] {
    const clean = text.toLowerCase().replace(/\s+/g, " ").trim();
    const parts = clean.split(" ").filter(Boolean);
    const last = parts.at(-1) ?? "";
    const timed = /^\d{1,2}(:\d{0,2})?$/.test(last);
    // Ein angefangenes Wort („mor“) wird zu den Wörtern, die so beginnen (W-0027).
    const expand = (day: string): string[] => {
        if (ParseKickoff(`${day} 12:00`, now) !== null) return [day];

        const words = DAY_WORDS.filter((word) => word.startsWith(day));

        return words.length ? words : [day];
    };
    const days = timed ? (parts.length > 1 ? expand(parts.slice(0, -1).join(" ")) : ["heute", "morgen"]) : clean ? expand(clean) : ["heute", "morgen", "übermorgen"];
    const times: string[] = [];

    if (timed) {
        const [hour, minutes = ""] = last.split(":");

        for (const minute of ["00", "15", "30", "45"]) if (minute.startsWith(minutes)) times.push(`${Number(hour)}:${minute}`);
    } else {
        times.push("18:00", "19:00", "20:00", "21:00");
    }

    const seen = new Set<number>();
    const suggestions: { name: string; value: string }[] = [];

    for (const day of days) {
        for (const time of times) {
            const label = `${day} ${time.padStart(5, "0")}`;
            const at = ParseKickoff(label, now);

            if (at === null || at < now || seen.has(at) || suggestions.length >= 25) continue;

            seen.add(at);
            suggestions.push({ name: `${label} · ${DayLabel(at)}`.slice(0, 100), value: `t:${at}` });
        }
    }

    return suggestions;
}

/** Wie ein Spiel ausging, aus Sicht des eigenen Teams. */
export function OutcomeOf(score: { us: number; them: number }): Outcome {
    return score.us > score.them ? "w" : score.us < score.them ? "l" : "d";
}

/** Die Bilanz aus gespielten Partien - das neueste Spiel zuerst. Abgesagte und Partien ohne Ergebnis zählen nicht. */
export function MatchupRecord(played: IMatchup[]): IMatchupRecord {
    const outcomes = played.filter((matchup) => matchup.status === "played" && matchup.score).map((matchup) => OutcomeOf(matchup.score!));
    let count = 0;

    while (count < outcomes.length && outcomes[count] === outcomes[0]) count++;

    return {
        wins: outcomes.filter((outcome) => outcome === "w").length,
        losses: outcomes.filter((outcome) => outcome === "l").length,
        draws: outcomes.filter((outcome) => outcome === "d").length,
        form: outcomes.slice(0, FORM_SIZE),
        streak: outcomes.length ? { outcome: outcomes[0]!, count } : null,
    };
}

/** Die Bilanz je Team, in der Reihenfolge, in der die Teams in played zuerst auftauchen. */
export function TeamRecords(played: IMatchup[]): { teamId: number | null; name: string; record: IMatchupRecord }[] {
    const teams = new Map<string, IMatchup[]>();

    for (const matchup of played) {
        const key = String(matchup.teamId ?? matchup.teamName);

        teams.set(key, [...(teams.get(key) ?? []), matchup]);
    }

    return [...teams.values()].map((rows) => ({ teamId: rows[0]!.teamId, name: rows[0]!.teamName, record: MatchupRecord(rows) }));
}

/** „9 Siege · 3 Niederlagen · 1 Unentschieden“ - ohne Unentschieden ohne den Teil, ohne Spiele leer. */
export function RecordText(record: IMatchupRecord): string {
    if (!record.wins && !record.losses && !record.draws) return "";

    return [
        `${record.wins} ${record.wins === 1 ? "Sieg" : "Siege"}`,
        `${record.losses} ${record.losses === 1 ? "Niederlage" : "Niederlagen"}`,
        ...(record.draws ? [`${record.draws} Unentschieden`] : []),
    ].join(" · ");
}

/** „3 Siege in Folge“ - erst ab zwei gleichen Ausgängen. */
export function StreakText(record: IMatchupRecord): string {
    if (!record.streak || record.streak.count < 2) return "";

    const { outcome, count } = record.streak;

    return `${count} ${outcome === "w" ? "Siege" : outcome === "l" ? "Niederlagen" : "Unentschieden"} in Folge`;
}

/** Die letzten Spiele als 🟩 🟥 ⬜, das neueste zuerst. */
export function FormText(record: IMatchupRecord): string {
    return record.form.map((outcome) => (outcome === "w" ? "🟩" : outcome === "l" ? "🟥" : "⬜")).join("");
}

export type MatchupStateName = "soon" | "live" | "done" | "cancel";

/** Der Stand einer Partie: vor dem Anpfiff, läuft (ab Anpfiff bis zum Ergebnis), mit Ergebnis, abgesagt. */
export function MatchupState(matchup: IMatchup, now: number): MatchupStateName {
    if (matchup.status === "cancelled") return "cancel";
    if (matchup.status === "played") return "done";

    return matchup.at <= now ? "live" : "soon";
}

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
    "team.logo",
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
    "bilanz",
    "serie",
    "form",
] as const;

/** Die Ergebnis-Nachricht kennt zusätzlich den Ausgang. */
export const RESULT_KEYS = [...MATCHUP_KEYS, "ergebnis", "ausgang"] as const;

export const MATCHUP_IMAGES = ["{team.logo}", "{guild.icon}"] as const;

type CardBlock = string | { body: string; thumbnail: string };

function card(accent: string, ...blocks: CardBlock[]): IMatchupBody {
    return {
        kind: "v2",
        content: "",
        embed: null,
        doc: {
            accent,
            blocks: blocks.map((block) =>
                typeof block !== "string"
                    ? { type: "section" as const, body: block.body, thumbnail: block.thumbnail }
                    : block === "---"
                      ? { type: "separator" as const, line: true }
                      : { type: "text" as const, body: block }
            ),
        },
    };
}

/** Die Ankündigung ab Werk (Plan 28, Entwurf matchups-v2): Logo, wer gegen wen, Liga, Anpfiff. */
export function DefaultAnnounce(): IMatchupBody {
    return card(
        MATCHUPS_ACCENT,
        { body: "## ⚔️ {team} vs. {gegner}\n-# {liga} · {modus}{bestof}", thumbnail: "{team.logo}" },
        "---",
        "**Anpfiff** {zeit} · {countdown}",
        "{notiz}",
        "{stream}",
        "-# {team.role} · Eingetragen von {eingetragen}"
    );
}

export function DefaultRemind(): IMatchupBody {
    return card(REMIND_ACCENT, "## ⏰ {countdown}: {team} vs. {gegner}", "-# {liga} · {modus}{bestof} · Anpfiff {zeit.kurz}");
}

export function DefaultResult(): IMatchupBody {
    return card(
        OUTCOME_COLORS.win,
        { body: "-# {ausgang} · {liga}{bestof}\n## {team} {ergebnis} {gegner}", thumbnail: "{team.logo}" },
        "---",
        "**Bilanz** {bilanz}\n**Form** {form} {serie}",
        "{notiz}",
        "-# Eingetragen von {eingetragen}"
    );
}

/* Die Vorlagen bis Plan 27 - wer sie unverändert hat, bekommt beim Lesen die neuen (NormalizeMatchupSettings). */
export function LegacyAnnounce(): IMatchupBody {
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

export function LegacyRemind(): IMatchupBody {
    return card(
        "#ffc53d",
        "## ⏰ Gleich geht es los",
        "**{team} vs. {gegner}** – {countdown}",
        "-# {liga} · {modus}{bestof} · Anpfiff {zeit.kurz}",
        "{stream}"
    );
}

export function LegacyResult(): IMatchupBody {
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
        discordResults: true,
        resultRemindHours: 2,
        colorByStatus: true,
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
