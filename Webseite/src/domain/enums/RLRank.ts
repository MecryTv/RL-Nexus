/**
 * Die Rangstufen von Rocket League.
 *
 * Der Schlüssel ist zugleich der Dateiname des Abzeichens unter
 * `assets/rocketleague/ranks`. Dieselbe Liste steht im Bot in
 * `constants/RankCard.ts`, dort als Reihenfolge der Bilddateien. Wer hier eine
 * Stufe einfügt, muss sie auch dort einfügen.
 */
export enum RLRank {
    Unranked = "unranked",
    Bronze1 = "bronze-1",
    Bronze2 = "bronze-2",
    Bronze3 = "bronze-3",
    Silver1 = "silver-1",
    Silver2 = "silver-2",
    Silver3 = "silver-3",
    Gold1 = "gold-1",
    Gold2 = "gold-2",
    Gold3 = "gold-3",
    Platin1 = "platin-1",
    Platin2 = "platin-2",
    Platin3 = "platin-3",
    Diamond1 = "diamond-1",
    Diamond2 = "diamond-2",
    Diamond3 = "diamond-3",
    Champion1 = "champion-1",
    Champion2 = "champion-2",
    Champion3 = "champion-3",
    GrandChampion1 = "grand-champion-1",
    GrandChampion2 = "grand-champion-2",
    GrandChampion3 = "grand-champion-3",
    SuperSonicLegend = "super-sonic-legend",
}

/** Was eine Rangstufe über sich weiß. */
export interface IRankMeta {
    /** Der deutsche Anzeigename, so wie ihn das Spiel schreibt. */
    readonly label: string;
    /** Die Farbe der Stufe. Dieselbe Staffelung wie `TierColor()` im Bot. */
    readonly color: string;
}

/**
 * Farbe und Name je Stufe.
 *
 * Die Farben folgen dem Bot: Bronze kupfern, Silber grau, Gold warm, Platin
 * türkis, Diamant blau, Champion violett, Grand Champion rot, Supersonic Legend
 * fast weiß. Innerhalb einer Stufe bleibt die Farbe gleich, weil das Spiel es
 * ebenso hält.
 */
export const RANK_META: Readonly<Record<RLRank, IRankMeta>> = {
    [RLRank.Unranked]: { label: "Unranked", color: "var(--c-text-faint)" },
    [RLRank.Bronze1]: { label: "Bronze I", color: "#c07a45" },
    [RLRank.Bronze2]: { label: "Bronze II", color: "#c07a45" },
    [RLRank.Bronze3]: { label: "Bronze III", color: "#c07a45" },
    [RLRank.Silver1]: { label: "Silber I", color: "#9fb0bd" },
    [RLRank.Silver2]: { label: "Silber II", color: "#9fb0bd" },
    [RLRank.Silver3]: { label: "Silber III", color: "#9fb0bd" },
    [RLRank.Gold1]: { label: "Gold I", color: "#e8b64c" },
    [RLRank.Gold2]: { label: "Gold II", color: "#e8b64c" },
    [RLRank.Gold3]: { label: "Gold III", color: "#e8b64c" },
    [RLRank.Platin1]: { label: "Platin I", color: "#6fd6e0" },
    [RLRank.Platin2]: { label: "Platin II", color: "#6fd6e0" },
    [RLRank.Platin3]: { label: "Platin III", color: "#6fd6e0" },
    [RLRank.Diamond1]: { label: "Diamant I", color: "#5b8dff" },
    [RLRank.Diamond2]: { label: "Diamant II", color: "#5b8dff" },
    [RLRank.Diamond3]: { label: "Diamant III", color: "#5b8dff" },
    [RLRank.Champion1]: { label: "Champion I", color: "#8a4dff" },
    [RLRank.Champion2]: { label: "Champion II", color: "#8a4dff" },
    [RLRank.Champion3]: { label: "Champion III", color: "#8a4dff" },
    [RLRank.GrandChampion1]: { label: "Grand Champion I", color: "#ff4d6a" },
    [RLRank.GrandChampion2]: { label: "Grand Champion II", color: "#ff4d6a" },
    [RLRank.GrandChampion3]: { label: "Grand Champion III", color: "#ff4d6a" },
    [RLRank.SuperSonicLegend]: { label: "Supersonic Legend", color: "#e8ecff" },
};
