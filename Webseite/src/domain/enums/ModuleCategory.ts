/**
 * Die Schublade, in die ein Modul gehört.
 *
 * Sechs Kategorien, weil die Rang-Karte sechs Karriere-Werte nebeneinander
 * stellt und jede ihre Farbe aus derselben Reihe bekommt. Mehr Kategorien
 * hieße neue Farben erfinden, weniger hieße Module zusammenwerfen, die nichts
 * miteinander zu tun haben.
 */
export enum ModuleCategory {
    // W-0085: dieselben Bereiche wie im Bot-Dashboard (Leiste und /hilfe), in dieser Reihenfolge.
    Always = "always",
    RocketLeague = "rocket-league",
    Community = "community",
    Support = "support",
    Moderation = "moderation",
    Content = "content",
}

/** Wie weit ein Modul ist. Bestimmt Abzeichen und Sortierung. */
export enum ModuleStatus {
    Live = "live",
    Beta = "beta",
    Planned = "planned",
}

/** Die Reihenfolge, in der Module gelistet werden: Fertiges zuerst. */
export const STATUS_RANK: Readonly<Record<ModuleStatus, number>> = {
    [ModuleStatus.Live]: 0,
    [ModuleStatus.Beta]: 1,
    [ModuleStatus.Planned]: 2,
};
