/**
 * Staff-Freigabe (W-0011, Plan 44): Staff bearbeitet einen fremden Server erst
 * nach einem Ja. Siehe docs/Dashboard.md, Abschnitt „Staff-Freigabe“.
 */

/** Die festen Dauern in Minuten. Dazu kommt „Eigene“ zwischen STAFF_MIN und STAFF_MAX. */
export const STAFF_PRESETS = [30, 60, 180] as const;
export const STAFF_MIN = 10;
export const STAFF_MAX = 1440;

/** So lange wartet eine Anfrage auf ein Ja. */
export const REQUEST_TTL_MS = 10 * 60_000;
/** Nach einem Nein fragt derselbe Staff frühestens nach dieser Zeit wieder. */
export const COOLDOWN_MS = 10 * 60_000;
/** +30 Min. je Klick, zusammen höchstens STAFF_MAX. */
export const EXTEND_MIN = 30;
/** So lange vor Schluss bekommt Staff einen Hinweis. */
export const WARN_MS = 5 * 60_000;

export const LOG_KEEP_DAYS = 180;
export const OVERVIEW_DAYS = 30;
/** „Bisher geändert“ in der DM höchstens so oft. */
export const DM_EDIT_MS = 30_000;
export const REASON_MAX = 200;
export const MAX_ASKED = 10;
/** Dasselbe Ansehen in einem privaten Bereich zählt in dieser Zeit nur einmal. */
export const SEEN_DEDUPE_MS = 10 * 60_000;

export const PRIVATE_AREAS = ["Live Tickets", "Transcripts", "Bewerbungen", "Fälle Moderation", "Fälle Anti Villain"] as const;
export const PRIVATE_HINT = "Privater Bereich: Dafür braucht es ein extra Ja, die laufende Freigabe reicht nicht.";

/** Wie eine Aktion aus body.action im Protokoll heißt. Unbekannte bleiben, wie sie sind. */
export const ACTION_LABELS: Record<string, string> = {
    save: "gespeichert",
    create: "angelegt",
    delete: "gelöscht",
    send: "gesendet",
    reset: "zurückgesetzt",
    on: "an",
    off: "aus",
};
