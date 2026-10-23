/** Die Aufgabe eines Spielers im Kader. */
export enum RosterRole {
    Captain = "captain",
    CoCaptain = "co-captain",
    Starter = "starter",
    Substitute = "substitute",
    Trial = "trial",
    Coach = "coach",
    Manager = "manager",
}

/**
 * Deutscher Name und Farbe je Aufgabe.
 *
 * Der Co-Captain bekommt das Rot des Captains, aufgehellt: zu sehen, dass er
 * dazugehört, und trotzdem nicht zu verwechseln.
 */
export const ROSTER_ROLE_META: Readonly<Record<RosterRole, { label: string; color: string }>> = {
    [RosterRole.Captain]: { label: "Captain", color: "var(--c-red)" },
    [RosterRole.CoCaptain]: { label: "Co-Captain", color: "color-mix(in srgb, var(--c-red) 60%, var(--c-text))" },
    [RosterRole.Starter]: { label: "Stamm", color: "var(--c-blue)" },
    [RosterRole.Substitute]: { label: "Ersatz", color: "var(--c-text-faint)" },
    [RosterRole.Trial]: { label: "Trial", color: "var(--c-mod-moderation)" },
    [RosterRole.Coach]: { label: "Coach", color: "var(--c-mod-engagement)" },
    [RosterRole.Manager]: { label: "Manager", color: "var(--c-mod-utility)" },
};

/** Kader-Reihenfolge: wer spielt oben, dann der Trial, dann der Staff. */
export const ROSTER_ORDER: readonly RosterRole[] = [
    RosterRole.Captain,
    RosterRole.CoCaptain,
    RosterRole.Starter,
    RosterRole.Substitute,
    RosterRole.Trial,
    RosterRole.Coach,
    RosterRole.Manager,
];

/**
 * Wer in den Schnitt zählt: Captain, Co-Captain, Stamm und Ersatz.
 *
 * Ein Trial steht im Kader, zählt aber erst mit, wenn er fest übernommen ist.
 * Coach und Manager spielen nicht.
 */
export const PLAYING_ROLES: readonly RosterRole[] = [
    RosterRole.Captain,
    RosterRole.CoCaptain,
    RosterRole.Starter,
    RosterRole.Substitute,
];
