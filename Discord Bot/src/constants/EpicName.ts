/**
 * Epic-Name geändert (Plan 33): Kennungen der Knöpfe und Fenster, Fristen,
 * Grenzen. Siehe docs/Teams.md.
 */

/** Präfix aller Knöpfe und Fenster: epic:ask:<Fall>, epic:again:<Fall>, epic:modal:<Fall>. */
export const EPIC_PREFIX = "epic";

/** So lange nach der DM ohne Antwort bekommt der Captain Bescheid. */
export const CAPTAIN_AFTER_MS = 3 * 86_400_000;

/** Erledigte Fälle bleiben so lange, dann räumt der Zeitgeber sie weg. */
export const CASE_KEEP_MS = 30 * 86_400_000;

/** Höchstens so viele Versuche im Fenster je Person … */
export const ATTEMPTS = 5;
/** … in dieser Zeit. Prime ist ein fremder Dienst. */
export const ATTEMPT_WINDOW_MS = 10 * 60_000;
