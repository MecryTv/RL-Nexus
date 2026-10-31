/**
 * Epic-Name geändert (Plan 33): ein offener Fall und die Orte, an denen ein
 * Name steht. Siehe docs/Teams.md.
 */

/** Was zuletzt über den alten Namen bekannt war - für „Zuletzt gesehen am …“. */
export interface IEpicLastSeen {
    at: number;
    tierName: string | null;
    divisionName: string | null;
    mmr3: number | null;
}

/** Der Bot fand einen Namen nicht mehr und konnte den neuen nicht selbst holen. Einer je Person und altem Namen. */
export interface IEpicCase {
    id: number;
    userId: string;
    oldName: string;
    /** Die Epic-Konto-ID, wenn bekannt: Der neue Name muss zu ihr gehören. */
    accountId: string | null;
    lastSeen: IEpicLastSeen;
    detectedAt: number;
    dmAt: number | null;
    /** Die DM kam nicht an (DMs zu, kein gemeinsamer Server). */
    dmFailed: boolean;
    channelId: string | null;
    messageId: string | null;
    captainAt: number | null;
    resolvedAt: number | null;
}

/** Ein Kader, in dem der Name steht. */
export interface IEpicPlace {
    guildName: string;
    teamName: string;
}
