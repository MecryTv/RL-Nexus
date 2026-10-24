/**
 * {teams} in der Team-Übersicht: wie ein Team in der Liste steht, nach den
 * Vorlagen aus dem Reiter „Teams-Liste“. Bot und Dashboard teilen sich diese
 * Datei - der Bot baut damit die Nachricht, das Dashboard die Live-Vorschau,
 * und so schreiben beide dasselbe. Deshalb ohne Imports: das Dashboard bündelt
 * sie mit (esbuild), der Bot übersetzt sie wie jede andere Datei.
 *
 * Die Vorlagen bauen aufeinander auf: die Zeile je Team setzt mit
 * {team.members} die Spieler ein und mit {team.members.staff} Coach und
 * Manager; wie jeder von ihnen aussieht, steht in einer eigenen Vorlage.
 * Siehe docs/Teams.md.
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

/** Wer nicht spielt - steht in {team.members.staff}. */
export const STAFF_ROLES = ["coach", "manager"];

/**
 * Die Liste ab Werk: je Spieler eine Zeile mit Abzeichen, Rang-Icon,
 * Erwähnung, MMR und Tracker-Link, der Staff klein darunter. Die frühere Liste
 * ab Werk gibt es weiter als Vorlage „Kompakt“.
 */
export function DefaultTeamList(): ITeamListSettings {
    return {
        team: "**{team.name}** `{team.tag}` · {team.rank.icon} {team.rank.short} · {team.mmr} MMR\n{team.members}\n-# {team.members.staff}\n-# Ligen: {team.leagues}",
        member: "{spieler.role.icon} {spieler.rank.icon} {spieler} · `{spieler.mmr}` · {spieler.tracker}",
        staff: "{spieler.role.icon} {spieler}",
        roles: ["captain", "cocaptain", "player", "sub", "trial"],
    };
}

/** Eine fertige Liste zum Anklicken - die Leiste „Vorlagen“ im Reiter „Teams-Liste“. */
export interface ITeamListPreset {
    id: string;
    name: string;
    hint: string;
    list: ITeamListSettings;
}

export const TEAM_LIST_PRESETS: ITeamListPreset[] = [
    { id: "rows", name: "Spieler untereinander", hint: "Ab Werk · je Spieler eine Zeile: Abzeichen, Rang-Icon, Erwähnung, MMR und Tracker-Link", list: DefaultTeamList() },
    {
        id: "twolines",
        name: "Zweizeilig",
        hint: "Je Spieler Abzeichen und Name, darunter klein Rang, MMR und Tracker",
        list: {
            ...DefaultTeamList(),
            member: "{spieler.role.icon} {spieler}\n-# {spieler.rank.icon} `{spieler.mmr}` · {spieler.tracker}",
        },
    },
    {
        id: "compact",
        name: "Kompakt",
        hint: "Kopfzeile mit Rang und MMR, darunter jeder Spieler klein",
        list: {
            team: "**{team.name}** `{team.tag}` · {team.rank} · MMR {team.mmr} · {team.players} Spieler\n-# {team.members}\n-# Staff: {team.members.staff}\n-# Ligen: {team.leagues}",
            member: "{spieler}",
            staff: "{spieler}",
            roles: ["captain", "cocaptain", "player", "sub", "trial"],
        },
    },
];

/** Was es je Spieler in der Liste gibt: {spieler}, {spieler.name}, {spieler.rank} … - .icon steht immer als Icon da. */
export const MEMBER_FIELDS = ["", "name", "role", "role.icon", "rank", "rank.short", "rank.icon", "mmr", "current", "peak", "tracker"] as const;

/** Ein Team, wie die Liste es braucht. */
export interface IListTeam {
    /** Die ID seiner Gruppe, null: ohne Gruppe. */
    group: number | null;
    /** Die Platzhalter des Teams - dieselben wie in der Team-Karte. */
    values: Record<string, string>;
    /** Der Kader in der Reihenfolge der Karte: je Spieler seine Aufgabe und {spieler} … */
    members: { role: string; values: Record<string, string> }[];
}

const PLACEHOLDER = /\{([A-Za-z0-9._-]+)\}/g;

/** Wie Fill im Bot: Groß und klein egal, Unter- und Bindestriche auch. */
function looseKey(key: string): string {
    return key.toLowerCase().replace(/[_-]/g, "");
}

/** Wie Fill im Bot, nur eigene Schlüssel. */
function lookup(values: Record<string, string>, key: string): string | undefined {
    if (Object.hasOwn(values, key)) return values[key];

    return Object.hasOwn(values, looseKey(key)) ? values[looseKey(key)] : undefined;
}

/**
 * Füllt eine Zeile. empty: sie hatte Platzhalter, und alle waren leer - dann
 * fällt sie weg, statt als „Staff:“ ohne Staff dazustehen.
 */
function fillLine(line: string, values: Record<string, string>): { text: string; empty: boolean } {
    let seen = 0;
    let filled = 0;
    const text = line.replace(PLACEHOLDER, (match: string, key: string) => {
        const value = lookup(values, key);

        if (value === undefined) return match;

        seen++;

        if (value.trim()) filled++;

        return value;
    });

    // Ein Team ohne Kürzel hinterließe aus `{team.tag}` zwei leere Backticks.
    return { text: text.replace(/ ?(?<!`)``(?!`)/g, ""), empty: seen > 0 && filled === 0 };
}

/** Ein Spieler als Zeilen: seine Vorlage, gefüllt - leere Zeilen fallen weg wie in der Zeile je Team. */
function memberLines(template: string, values: Record<string, string>): string[] {
    return template
        .split("\n")
        .map((line) => fillLine(line, values))
        .filter((line) => !line.empty && line.text.trim())
        .map((line) => line.text);
}

/** Welche Liste eine Zeile einsetzt: {team.members} oder {team.members.staff} - auch als {Team.Members}. */
function listIn(line: string): "team.members" | "team.members.staff" | null {
    for (const match of line.matchAll(PLACEHOLDER)) {
        const key = looseKey(match[1]);

        if (key === "team.members" || key === "team.members.staff") return key;
    }

    return null;
}

/**
 * Ein Team als Zeilen der Liste. Jeder Spieler steht in eigener Zeile, und
 * was in der Zeile je Team um {team.members} herum steht, steht um jede
 * seiner Zeilen: aus „-# {team.members}“ wird je Zeile eine kleine.
 */
export function TeamListLines(team: IListTeam, list: ITeamListSettings): string[] {
    const blocks = (pick: (role: string) => boolean, template: string): string[] =>
        team.members.filter((entry) => pick(entry.role)).flatMap((entry) => memberLines(template, entry.values));
    const lists = {
        "team.members": blocks((role) => list.roles.includes(role), list.member),
        "team.members.staff": blocks((role) => STAFF_ROLES.includes(role), list.staff),
    };
    // Steht die zweite Liste in derselben Zeile, kommt sie am Stück.
    const joined = { "team.members": lists["team.members"].join("\n"), "team.members.staff": lists["team.members.staff"].join("\n") };
    const lines: string[] = [];

    for (const line of list.team.split("\n")) {
        const own = listIn(line);

        if (own) {
            for (const entry of lists[own]) lines.push(fillLine(line, { ...team.values, ...joined, [own]: entry }).text);

            continue;
        }

        const filled = fillLine(line, { ...team.values, ...joined });

        if (!filled.empty) lines.push(filled.text);
    }

    return lines;
}

/**
 * {teams} in Stücken, je Team eins: seine Zeilen, beim ersten Team einer Gruppe
 * mit deren Überschrift davor. Zwischen den Stücken darf die Liste auf die
 * nächste Nachricht umbrechen (TeamView.BoardViews), nie mitten im Kader.
 */
export function TeamListParts(teams: IListTeam[], groups: { id: number; name: string }[], list: ITeamListSettings): string[] {
    const parts: string[] = [];
    const add = (members: IListTeam[], header: string | null): void => {
        members.forEach((team, index) => {
            const lines = [...(index === 0 && header ? [header] : []), ...TeamListLines(team, list)];

            if (lines.length) parts.push(lines.join("\n"));
        });
    };

    for (const group of groups) add(teams.filter((team) => team.group === group.id), `### ${group.name}`);

    add(
        teams.filter((team) => !groups.some((group) => group.id === team.group)),
        parts.length ? "### Ohne Gruppe" : null
    );

    return parts;
}

/** {teams}: je Gruppe eine Überschrift, darunter ihre Teams; Teams ohne Gruppe stehen am Ende. */
export function TeamListText(teams: IListTeam[], groups: { id: number; name: string }[], list: ITeamListSettings): string {
    return TeamListParts(teams, groups, list).join("\n") || "Noch keine Teams.";
}
