import { IMMRSettings, ITeamBody, ITeamChannels, ITeamCreated, ITeamPlayer, ITeamRoleSettings, ITeamSettings, PlaylistSlot, RankStyle, TeamBadge, TeamRole } from "../interfaces/services/teams/ITeams";
import { RankText } from "./Prime";
import { DefaultTeamList } from "./TeamList";
import { DefaultTeamOrder } from "./TeamOrder";

/**
 * RL Team-Übersicht: Grenzen, Beschriftungen und die Vorgaben. Siehe docs/Teams.md.
 */
export const TEAMS_MODULE = "teams";

/** Der Anfang der Custom-IDs: teams:menu:<nachricht>. */
export const TEAMS_PREFIX = "teams";

export const MAX_GROUPS = 12;
export const MAX_TEAMS = 40;
export const MAX_PLAYERS = 12;
export const MAX_NAME = 60;
export const MAX_TAG = 8;
export const MAX_DESCRIPTION = 500;
export const MAX_FORMULA = 200;
/** Ein Auswahlmenü in Discord fasst nicht mehr. */
export const MAX_MENU_TEAMS = 25;

/** So alt darf der Prime-Stand eines Spielers werden, bevor neu geholt wird. */
export const SNAPSHOT_MAX_AGE = 30 * 60 * 1000;

/** Wie viele Spieler ein Abruf höchstens bei Prime nachfragt. */
export const SYNC_BATCH = 12;

export const PLAYLISTS: PlaylistSlot[] = ["1v1", "2v2", "3v3"];

/** Die Reihenfolge ist auch die der Auswahl im Dashboard. */
export const ROLE_LABELS: Record<TeamRole, string> = {
    captain: "Captain",
    cocaptain: "Co-Captain",
    player: "Stamm",
    sub: "Ersatz",
    trial: "Trial",
    coach: "Coach",
    manager: "Manager",
};

/** In dieser Reihenfolge steht der Kader in der Karte. */
export const ROLE_ORDER: TeamRole[] = ["captain", "cocaptain", "player", "sub", "trial", "coach", "manager"];

/** Wer mitspielt: steht in der Aufstellung und zählt bei {team.players}. */
export const PLAYING_ROLES: TeamRole[] = ["captain", "cocaptain", "player", "sub", "trial"];

/** Wer in die Team-MMR zählt. Trial spielt mit, zählt aber nicht - der Platz ist noch nicht fest. */
export const COUNTING_ROLES: TeamRole[] = ["captain", "cocaptain", "player", "sub"];

/** Ligen und Turniere je Team. */
export const MAX_LINKS = 5;
export const MAX_LINK_LABEL = 40;

export const LAYOUT_LABELS: Record<string, string> = {
    cards: "Je Team eine Nachricht",
    menu: "Eine Nachricht mit Auswahlmenü",
    single: "Alles in einer Nachricht",
};

export const RANK_STYLES: Record<RankStyle, string> = {
    text: "Ausgeschrieben",
    icon: "Als Icon",
    both: "Icon und Text",
};

/** Wie ein Rang dasteht: (Stufe, Division) → Text. */
export type RankFormat = (tier: number, division: string | null) => string;

/** Wie eine Aufgabe dasteht: Captain, ihr Icon oder beides. */
export type RoleFormat = (role: TeamRole) => string;

/**
 * Text, Icon oder beides. Gibt es kein Icon, bleibt es beim Text - lieber
 * ausgeschrieben als ein leerer Platz.
 */
function Styled(style: RankStyle, text: string, icon: () => string | null): string {
    const emoji = style === "text" ? null : icon();

    if (!emoji) return text;

    return style === "icon" ? emoji : `${emoji} ${text}`;
}

/** „Ränge zeigen als“ als Schreibweise. icon liefert das Emoji einer Stufe (RankIconService). */
export function RankFormatter(style: RankStyle, icon: (tier: number) => string | null): RankFormat {
    return (tier, division) => Styled(style, RankText(tier, division), () => icon(tier));
}

/** „Aufgaben zeigen als“ als Schreibweise. icon liefert das Abzeichen einer Aufgabe. */
export function RoleFormatter(style: RankStyle, icon: (role: TeamRole) => string | null): RoleFormat {
    return (role) => Styled(style, ROLE_LABELS[role], () => icon(role));
}

/**
 * Wie Ränge und Aufgaben in den Nachrichten stehen: rank und role nach den
 * Einstellungen, rankIcon und roleIcon immer als Icon - für {spieler.rank.icon}
 * und {spieler.role.icon}.
 */
export interface ITeamFormats {
    rank: RankFormat;
    rankIcon: RankFormat;
    role: RoleFormat;
    roleIcon: RoleFormat;
}

/** Was ein eigenes Abzeichen in der Nachricht zeigt. null: keins (oder das Bild ist noch kein Emoji) - dann gilt der Standard. */
export function BadgeOf(badge: TeamBadge | undefined): string | null {
    if (!badge) return null;

    return badge.kind === "emoji" ? badge.value : badge.emoji;
}

/** Alles ausgeschrieben - ohne Icons, etwa ohne laufenden Bot. */
export const PLAIN_FORMATS: ITeamFormats = {
    rank: RankText,
    rankIcon: RankText,
    role: (role) => ROLE_LABELS[role],
    roleIcon: (role) => ROLE_LABELS[role],
};

export const MMR_LABELS: Record<string, string> = {
    wtsi: "WTSI (empfohlen)",
    formula: "Eigene Rechnung",
};

/** Die Platzhalter, die in einer eigenen Rechnung stehen dürfen. */
export const FORMULA_KEYS = ["current1s", "current2s", "current3s", "peak1s", "peak2s", "peak3s", "matches3s", "tier"] as const;

export type FormulaKey = (typeof FORMULA_KEYS)[number];

export const FORMULA_HINTS: Record<FormulaKey, string> = {
    current1s: "Aktuelle MMR 1v1",
    current2s: "Aktuelle MMR 2v2",
    current3s: "Aktuelle MMR 3v3",
    peak1s: "Eingetragener Peak 1v1",
    peak2s: "Eingetragener Peak 2v2",
    peak3s: "Eingetragener Peak 3v3",
    matches3s: "Gespielte Partien 3v3",
    tier: "Rang-Stufe 3v3 (0 bis 22)",
};

/** Fertige Rechnungen zum Anklicken - Name, Formel, ein Satz dazu. */
export const FORMULA_PRESETS: { name: string; formula: string; hint: string }[] = [
    { name: "Peak 3v3", formula: "{peak3s}", hint: "Nur der eingetragene Peak, ohne Tagesform" },
    { name: "Peak mit Form", formula: "{peak3s} * 0.7 + {current3s} * 0.3", hint: "Der Peak trägt, die aktuelle MMR korrigiert" },
    { name: "2v2 und 3v3", formula: "({peak2s} + {peak3s} * 2) / 3", hint: "3v3 zählt doppelt, 2v2 einfach" },
    { name: "Nur aktuell", formula: "{current3s}", hint: "Was gerade auf dem Konto steht" },
    { name: "Gedämpft wie WTSI", formula: "{peak3s} * sqrt(min({current3s} / max({peak3s}, 1), 1))", hint: "Peak, gedämpft um die aktuelle Form" },
];

/**
 * Mit welchen Playlists die eingestellte Rechnung arbeitet: WTSI mit 2v2 und
 * 3v3, eine eigene Formel mit denen, deren Platzhalter darin stehen. Rechnet
 * sie mit keiner (etwa nur {tier}), gilt 3v3 - dort steht auch der Rang.
 */
export function UsedSlots(mmr: IMMRSettings): PlaylistSlot[] {
    if (mmr.mode === "wtsi") return ["2v2", "3v3"];

    const used = PLAYLISTS.filter((slot) => mmr.formula.includes(`{current${slot[0]}s}`) || mmr.formula.includes(`{peak${slot[0]}s}`));

    return used.length ? used : ["3v3"];
}

export function DefaultMMR(): IMMRSettings {
    return { mode: "wtsi", formula: "{peak3s} * 0.7 + {current3s} * 0.3" };
}

/** Die Nachricht der Übersicht, wie sie ab Werk aussieht. */
export function DefaultBoardBody(): ITeamBody {
    return {
        kind: "v2",
        content: "",
        embed: null,
        doc: {
            accent: "#00afff",
            blocks: [
                { type: "text", body: "# 🛡️ Competitive Teams" },
                { type: "text", body: "-# {teams.count} Teams · Stand {updated}" },
                { type: "separator", line: true },
                { type: "text", body: "{teams}" },
            ],
        },
    };
}

/** Eine Team-Karte, wie sie ab Werk aussieht. */
export function DefaultTeamBody(): ITeamBody {
    return {
        kind: "v2",
        content: "",
        embed: null,
        doc: {
            accent: "#ff1e2d",
            blocks: [
                { type: "text", body: "## 🛡️ {team.name} `{team.tag}`\n{team.description}" },
                { type: "separator", line: true },
                { type: "text", body: "**Ø Team-MMR** {team.mmr}  ·  **Kader** {team.players}  ·  {team.group}" },
                { type: "text", body: "{team.lineup}" },
                { type: "separator", line: true },
                { type: "text", body: "{team.staff}" },
                // Ohne Liga-Links leer - dann laesst RenderDoc den Baustein weg.
                { type: "text", body: "{team.leagues}" },
                { type: "text", body: "-# Ränge aus Rocket League · Stand {updated}" },
            ],
        },
    };
}

/** Ab Werk vergibt der Bot die Rollen; welche, legt der Server fest. */
export function DefaultRoles(): ITeamRoleSettings {
    return { sync: true, positions: Object.fromEntries(ROLE_ORDER.map((role) => [role, null])) as Record<TeamRole, string | null> };
}

export function DefaultTeamSettings(): ITeamSettings {
    return {
        channelId: null,
        layout: "cards",
        mmr: DefaultMMR(),
        roles: DefaultRoles(),
        rankStyle: "text",
        roleStyle: "text",
        badges: {},
        list: DefaultTeamList(),
        order: DefaultTeamOrder(),
        board: DefaultBoardBody(),
        team: DefaultTeamBody(),
        messageId: null,
    };
}

/** Wie viele Kanaele ein Team hoechstens einzeln fuehren kann. */
export const MAX_TEAM_CHANNELS = 10;

export function EmptyChannels(): ITeamChannels {
    return { kind: "channels", categoryId: null, textIds: [], voiceIds: [] };
}

export function EmptyCreated(): ITeamCreated {
    return { roleId: null, categoryId: null, textIds: [], voiceIds: [] };
}

export function EmptyPeaks(): Record<PlaylistSlot, number | null> {
    return { "1v1": null, "2v2": null, "3v3": null };
}

export function DefaultPlayer(id: string): ITeamPlayer {
    return { id, discordId: null, name: "", epicName: "", role: "player", peaks: EmptyPeaks() };
}

/** Eine Spieler-ID, die es im Team noch nicht gibt. */
export function NextPlayerId(players: ITeamPlayer[]): string {
    const taken = new Set(players.map((player) => player.id));

    for (let index = 1; index <= MAX_PLAYERS + 1; index++) {
        if (!taken.has(`p${index}`)) return `p${index}`;
    }

    return `p${Date.now()}`;
}
