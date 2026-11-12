/** Rocket Roulette (W-0087). Siehe docs/superpowers/specs/2026-11-11-rocket-roulette-design.md. */

import { IDrawLobby, IDrawWish } from "../../../services/roulette/Draw";

export type EveningStatus = "planned" | "running" | "ended";
export type RoundStatus = "drawing" | "running" | "ended" | "aborted";

/** Ein Mitglied für Bilder und Dashboard: ohne Profilbild zeichnet der Bot Initialen. */
export interface IAvatar {
    id: string;
    name: string;
    url: string | null;
}

export interface IMessageRef {
    channelId: string;
    messageId: string;
}

export interface IRouletteEvening {
    id: number;
    guildId: string;
    status: EveningStatus;
    startsAt: number;
    createdBy: string;
    createdAt: number;
    endedAt: number | null;
    announce: IMessageRef | null;
    control: IMessageRef | null;
    round: number;
    sitOut: string[];
    wishes: IDrawWish[];
    history: Record<string, number>;
    participants: Record<string, { name: string; rounds: number }>;
}

export interface IRouletteLobby extends IDrawLobby {
    name: string;
    password: string;
    /** Sprachkanäle von Team 0 und Team 1. */
    channels: [string, string] | null;
    /** Die Lobby-Karten in den Text-Chats der beiden Kanäle. */
    cards: [string, string] | null;
    openedAt: number | null;
    /** Anzeigenamen beim Auslosen, für Bilder und Übersicht. */
    names: Record<string, string>;
    /** Der Bot hat die Kanäle angelegt und darf sie löschen (Review I4). Fehlt bei festen Kanälen. */
    auto?: boolean;
}

export interface IRouletteRound {
    id: number;
    eveningId: number;
    guildId: string;
    number: number;
    status: RoundStatus;
    createdAt: number;
    endedAt: number | null;
    lobbies: IRouletteLobby[];
    /** Was vor der Auslosung galt; ein Abbruch schreibt es zurück (Review I5). */
    restore: { sitOut: string[]; wishes: IDrawWish[] } | null;
}

export type RouletteTeamSize = 1 | 2 | 3;

export interface IRouletteSettings {
    /** Hier legt der Bot die Team-Kanäle an. */
    categoryId: string | null;
    /** Ankündigung und Rundenkarten. */
    infoChannelId: string | null;
    /** Steuerkarte, Einspring-Anfragen und Übersicht. */
    controlChannelId: string | null;
    /** Sprachkanal: hier sammelt man sich vor dem Start und als Nachzügler. */
    waitingRoomId: string | null;
    /** Sprachkanal: Treffpunkt ab dem Start und zwischen den Runden. */
    mainVoiceId: string | null;
    moderatorRoleId: string | null;
    /** auto: der Bot legt je Team einen Sprachkanal an. fixed: vorhandene Kanäle aus fixedChannelIds. */
    teamChannels: "auto" | "fixed";
    fixedChannelIds: string[];
    teamSize: RouletteTeamSize;
    /** Muster mit {teams}, Team 1 gegen 2 = Lobby12. */
    lobbyName: string;
    password: { mode: "fixed" | "random"; value: string };
}
