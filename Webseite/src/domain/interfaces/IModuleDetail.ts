/** Etwas, das das Modul von selbst erledigt - ein Punkt mit Symbol. */
export interface IModuleFeature {
    readonly title: string;
    readonly text: string;
    readonly icon: string;
}

/**
 * Ein Begriff, den man auseinanderhalten muss.
 *
 * Dasselbe Muster wie die Kaderrollen auf der Team-Seite: eine farbige
 * Bezeichnung und ein Satz dazu, was sie bedeutet. Fast jedes Modul hat drei
 * bis fünf solcher Begriffe, und fast jedes Missverständnis beim Einrichten
 * kommt daher, dass zwei davon für dasselbe gehalten wurden.
 */
export interface IModuleConcept {
    readonly label: string;
    readonly text: string;
    readonly color: string;
}

/** Ein Schritt beim Einrichten. */
export interface IModuleStep {
    readonly title: string;
    readonly text: string;
}

/**
 * Ein Teil, der mit dem Modul kommt.
 *
 * Im Dashboard des Bots ein eigener Bereich ohne eigenen Schalter: Live
 * Tickets und Transcriptions gehen mit dem Ticket System an. Hier steht nur,
 * dass es sie gibt und wofür.
 */
export interface IModulePart {
    readonly name: string;
    readonly text: string;
}

/** Ein benannter Abschnitt mit Überschrift und Einleitung. */
export interface IModuleBlock<T> {
    readonly title: string;
    readonly lead: string;
    readonly entries: readonly T[];
}

/**
 * Der ausführliche Teil eines Moduls.
 *
 * Was auf der Kachel steht, reicht für eine Übersicht und für nichts sonst. Wer
 * ein Modul wirklich einschalten will, hat andere Fragen: Was passiert
 * automatisch? Was muss ich vorher entscheiden? Was heißen die Begriffe? Diese
 * Fragen beantwortet die Detailseite - alles optional, weil nicht jedes Modul
 * jede Art von Erklärung braucht.
 */
export interface IModuleDetail {
    /** Zwei bis vier Absätze. Was das Modul löst und für wen. */
    readonly intro: readonly string[];
    /** Die Begriffe des Moduls. */
    readonly concepts?: IModuleBlock<IModuleConcept>;
    /** Was der Bot von selbst erledigt. */
    readonly automations?: IModuleBlock<IModuleFeature>;
    /** Die Einrichtung, in Schritten. */
    readonly setup?: IModuleBlock<IModuleStep>;
    /** Was im Dashboard mitkommt, etwa Live Tickets beim Ticket System. */
    readonly parts?: readonly IModulePart[];
    /**
     * Ein Beispiel zum Ansehen statt zum Lesen.
     *
     * Nur für die zwei Module, bei denen der Bot etwas Sichtbares ausgibt.
     * Dreiundzwanzig nachgebaute Discord-Nachrichten wären dreiundzwanzig
     * Stellen, an denen die Seite altert, ohne dass es jemand merkt.
     */
    readonly showcase?: "rank-card" | "team-roster";
}
