import { ActivityType } from "discord.js";

/**
 * Was unter dem Namen des Bots steht. Fünf Ansagen, die sich alle 15 Sekunden
 * abwechseln - siehe docs/Presence.md.
 *
 * Die Reihenfolge ist die hier: der Bot geht sie der Reihe nach durch und
 * fängt danach wieder vorne an. Wer etwas ändern will, ändert es hier; eine
 * Einstellung im Dashboard gibt es dafür bewusst nicht, weil der Status nicht
 * je Server, sondern für den ganzen Bot gilt.
 */
export interface IPresence {
    /** Wie Discord es schreibt: „Spielt …", „Schaut …", „Hört …", „Tritt an in …". */
    type: ActivityType.Playing | ActivityType.Watching | ActivityType.Listening | ActivityType.Competing;
    /** Der Text. Platzhalter siehe unten - unbekannte bleiben stehen. */
    text: string;
}

/** So oft wird gewechselt. Discord erlaubt fünf Änderungen in zwanzig Sekunden. */
export const PRESENCE_INTERVAL = 15_000;

/**
 * Die Platzhalter:
 *   {server}     auf wie vielen Servern der Bot ist
 *   {mitglieder} wie viele Menschen das zusammen sind
 *   {dashboard}  die Adresse des Dashboards, ohne https://
 *   {befehle}    wie viele Slash-Befehle es gibt
 */
export const PRESENCES: IPresence[] = [
    { type: ActivityType.Watching, text: "{server} Server · {mitglieder} Mitglieder" },
    { type: ActivityType.Playing, text: "Rocket League · /rank zeigt deine Ränge" },
    { type: ActivityType.Competing, text: "RL 2, 4 & 6 Mans" },
    { type: ActivityType.Listening, text: "/lookingfor · Team gesucht?" },
    { type: ActivityType.Watching, text: "{dashboard}" },
];

/** Steht im Status, solange noch keine Zahl feststeht. */
export const PRESENCE_FALLBACK = "RL Nexus";
