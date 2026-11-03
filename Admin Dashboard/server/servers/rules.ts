/**
 * Ein Server pro Person (W-0064): die Regeln ohne Datenbank und Discord,
 * damit npm run check sie prüfen kann. Ablauf in flow.ts, Spec
 * docs/superpowers/specs/2026-11-03-ein-server-pro-person-design.md.
 */

/** Wahl beim Start der Regel: 24 Stunden, Erinnerung 2 Stunden vorher, 10 Minuten Bedenkzeit. */
export const CHOICE_HOURS = 24;
export const REMIND_BEFORE = 2 * 3_600_000;
export const THINK_TIME = 10 * 60_000;

export type JoinDecision = "blocked" | "free" | "approved" | "main" | "over";

export interface IJoinInput {
    /** Hat das Team die Regel gestartet? */
    readonly started: boolean;
    /** Paid oder Beta Access läuft. Bei Free Access darf jeder den Bot frei nutzen (Nutzer, 03.11.). */
    readonly paid: boolean;
    /** Server steht auf der Sperrliste (Bot entfernen mit Sperre). */
    readonly blocked: boolean;
    /** Einlader ist Administrator, Developer oder Partner. */
    readonly exempt: boolean;
    /** Bot war schon vor dem Start da: Das regelt die Wahl, nicht der Beitritt. */
    readonly legacy: boolean;
    /** Freigabe für genau diesen Server. */
    readonly approved: boolean;
    /** Weitere aktive Server derselben Person ohne Freigabe. */
    readonly others: number;
}

/** Was mit einem Server passiert, auf den der Bot gerade gekommen ist. */
export function decideJoin(input: IJoinInput): JoinDecision {
    if (input.blocked) return "blocked";
    // Vor legacy: Wird ein alter Server nach einem Neustart neu eingetragen, bleibt seine Freigabe (Review C1).
    if (input.approved) return "approved";
    if (!input.started || !input.paid || input.exempt || input.legacy) return "free";

    return input.others === 0 ? "main" : "over";
}

export interface IChoiceClock {
    readonly state: "open" | "chosen" | "done" | "timeout";
    readonly deadline: number;
    readonly reminded: boolean;
    readonly chosenAt: number | null;
}

/** Was die Uhr mit einer laufenden Wahl tut. Eine Wahl gilt auch über die Frist hinaus. */
export function choiceStep(choice: IChoiceClock, now: number): "remind" | "finish" | "timeout" | null {
    if (choice.state === "chosen") return choice.chosenAt !== null && now - choice.chosenAt >= THINK_TIME ? "finish" : null;
    if (choice.state !== "open") return null;
    if (now >= choice.deadline) return "timeout";

    return !choice.reminded && choice.deadline - now <= REMIND_BEFORE ? "remind" : null;
}

/** Die Signatur einer Freigabe, überall gleich geschrieben. */
export function signature(id: number): string {
    return `F-${String(id).padStart(4, "0")}`;
}

/** Abgelehnt oder zurückgenommen: Der Server bleibt nur, wenn die Person sonst keinen aktiven ohne Freigabe hat. */
export function keepAlone(others: number): boolean {
    return others === 0;
}
