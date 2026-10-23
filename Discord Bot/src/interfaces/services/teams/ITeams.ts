import { IMessageDoc } from "../../builder/IMessageDoc";
import { ICustomEmbed, MessageKind } from "../messages/IMessages";
import { ITeamListSettings } from "../../../constants/TeamList";
import { ITeamOrder } from "../../../constants/TeamOrder";

/**
 * RL Team-Übersicht: Kader eines Servers, gegliedert in Gruppen, angezeigt in
 * einem Kanal. Die Spielerwerte kommen aus Prime, von Hand kommt nur der Peak.
 * Siehe docs/Teams.md.
 */

/**
 * Was jemand im Team macht. Captain, Co-Captain, Stamm und Ersatz zählen in die
 * Team-MMR; Trial spielt mit, zählt aber nicht. Coach und Manager spielen nicht.
 */
export type TeamRole = "captain" | "cocaptain" | "player" | "sub" | "trial" | "manager" | "coach";

/** Wie die Übersicht im Kanal steht. */
export type BoardLayout = "cards" | "menu" | "single";

/** Woher die Team-MMR kommt. */
export type MMRMode = "wtsi" | "formula";

/** Wie ein Rang oder eine Aufgabe in den Nachrichten steht: ausgeschrieben, als Icon oder beides. */
export type RankStyle = "text" | "icon" | "both";

/**
 * Ein eigenes Abzeichen statt des Standards aus teamicons: ein Emoji (vom Server,
 * Unicode oder eins des Bots) oder ein Bild aus der Galerie. Aus dem Bild macht
 * der Bot beim Speichern ein App-Emoji (emoji) - null, solange es das nicht gibt.
 */
export type TeamBadge = { kind: "emoji"; value: string } | { kind: "image"; value: string; emoji: string | null };

/** Die drei Playlists, die zählen. */
export type PlaylistSlot = "1v1" | "2v2" | "3v3";

/** Was Prime zuletzt über einen Spieler hergab. Leer, solange nichts geholt wurde. */
export interface IPlayerSnapshot {
    /** Der Name, unter dem Prime das Konto führt. */
    name: string | null;
    platform: string | null;
    /** Aktuelle MMR je Playlist. null: keine Daten. */
    mmr: Record<PlaylistSlot, number | null>;
    /** Rang und Division in 3v3 - das steht im Kader. */
    tier: number | null;
    tierName: string | null;
    divisionName: string | null;
    /** Wann geholt wurde. 0: noch nie. */
    at: number;
    /** Prime kannte den Namen nicht oder antwortete nicht. */
    error: string | null;
}

export interface ITeamPlayer {
    /** Eindeutig im Team - die Reihenfolge steckt in der Liste, nicht in der ID. */
    id: string;
    /** Das Mitglied auf dem Server. null: jemand ohne Discord-Konto im Kader. */
    discordId: string | null;
    /** Eigener Anzeigename. Leer: der Name aus Prime, sonst der Epic-Name. */
    name: string;
    /** Der Epic-Name für Prime. Leer: für diesen Spieler wird nichts geholt. */
    epicName: string;
    role: TeamRole;
    /** Peak je Playlist, von Hand eingetragen. null: zählt nicht mit. */
    peaks: Record<PlaylistSlot, number | null>;
    /** Der letzte Stand von Prime - gehört dem Bot, nicht dem Dashboard. */
    snapshot?: IPlayerSnapshot;
}

/** Ein Link auf eine Liga oder ein Turnier, in dem das Team spielt. */
export interface ITeamLink {
    /** Was im Link steht, etwa "RLCS Quali". */
    label: string;
    /** Immer https. */
    url: string;
}

/** Eine Gruppe, unter der Teams stehen: Main, Academy, Div 2 … */
export interface ITeamGroup {
    id: number;
    guildId: string;
    name: string;
    position: number;
}

/**
 * Wo ein Team zu Hause ist: entweder eine ganze Kategorie - dann gehoert alles
 * darin dazu - oder einzeln ausgesuchte Text- und Sprachkanaele.
 */
export interface ITeamChannels {
    kind: "category" | "channels";
    categoryId: string | null;
    textIds: string[];
    voiceIds: string[];
}

/**
 * Was der Bot für ein Team selbst angelegt hat. Nur das bietet das Löschen des
 * Teams zum Mitlöschen an - eine Rolle, die schon vorher da war, rührt er nicht an.
 */
export interface ITeamCreated {
    roleId: string | null;
    categoryId: string | null;
    textIds: string[];
    voiceIds: string[];
}

export interface ITeam {
    id: number;
    guildId: string;
    /** null: das Team steht ohne Gruppe da. */
    groupId: number | null;
    name: string;
    tag: string;
    description: string;
    /** Farbe der Karte, "#rrggbb". null: die Farbe des Moduls. */
    color: string | null;
    /** Bild der Karte: Galerie-Pfad oder Link. */
    logo: string | null;
    /** Die Rolle des Teams: steht in der Karte als {team.role} und geht an jeden im Kader. */
    roleId: string | null;
    /** Die Kanäle des Teams, für {team.channels} und {team.voice}. */
    channels: ITeamChannels;
    created: ITeamCreated;
    /** Ligen und Turniere, für {team.leagues}. */
    links: ITeamLink[];
    players: ITeamPlayer[];
    position: number;
    /** Die Nachricht dieses Teams im Kanal - nur bei "cards". */
    messageId: string | null;
    createdAt: number;
    updatedAt: number;
}

/** Eine Nachricht, wie sie der Editor im Dashboard baut. */
export interface ITeamBody {
    kind: MessageKind;
    content: string;
    embed: ICustomEmbed | null;
    doc: IMessageDoc;
}

export interface IMMRSettings {
    mode: MMRMode;
    /**
     * Die eigene Rechnung, je Spieler ausgewertet: Platzhalter wie {peak3s} und
     * {current3s}, dazu + - * / ^ ( ) und sqrt/min/max/abs/round.
     */
    formula: string;
}

/** Rollen, die der Bot im Kader vergibt. */
export interface ITeamRoleSettings {
    /** An: wer mit Discord-Konto im Kader steht, bekommt die Rollen - und verliert sie, wenn er rausgeht. */
    sync: boolean;
    /** Eine Rolle je Aufgabe, etwa @Captain. Gilt über alle Teams. */
    positions: Record<TeamRole, string | null>;
}

export interface ITeamSettings {
    /** Wohin die Übersicht geht. */
    channelId: string | null;
    layout: BoardLayout;
    mmr: IMMRSettings;
    roles: ITeamRoleSettings;
    /** „Ränge zeigen als“ - gilt für {team.lineup}, {team.roster}, {team.rank} und {epicname.rank}. */
    rankStyle: RankStyle;
    /** „Aufgaben zeigen als“ - gilt für {team.lineup}, {team.roster}, {team.staff} und {spieler.role}. */
    roleStyle: RankStyle;
    /** Eigene Abzeichen je Aufgabe. Was fehlt, zeigt das Standard-Abzeichen. */
    badges: Partial<Record<TeamRole, TeamBadge>>;
    /** Wie {teams} die Teams aufschreibt (Reiter „Teams-Liste“). */
    list: ITeamListSettings;
    /** In welcher Reihenfolge die Teams stehen: Karten, Menü und {teams} (Karte „Reihenfolge“). */
    order: ITeamOrder;
    /** Der Kopf: bei "menu" und "single" die ganze Nachricht. */
    board: ITeamBody;
    /** Eine Team-Karte: bei "cards" je Nachricht, bei "menu" die Antwort auf die Auswahl. */
    team: ITeamBody;
    /** Die Kopf-Nachricht im Kanal - bei "menu" und "single". */
    messageId: string | null;
}

/** Was eine Karte über ein Team weiß, nachdem gerechnet wurde. */
export interface ITeamView {
    team: ITeam;
    group: ITeamGroup | null;
    /** Die Team-MMR. null: zu wenig Daten. */
    mmr: number | null;
    players: {
        player: ITeamPlayer;
        /** Der Wert dieses Spielers nach der eingestellten Rechnung. */
        value: number | null;
        label: string;
    }[];
    /** Der älteste Stand im Kader - dafür steht "Stand" unter der Karte. */
    fetchedAt: number;
}
