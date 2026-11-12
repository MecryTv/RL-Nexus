/** Rocket Roulette (W-0087). Siehe docs/superpowers/specs/2026-11-11-rocket-roulette-design.md. */

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
