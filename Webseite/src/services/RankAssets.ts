import { RLRank } from "../domain/enums/RLRank";

/**
 * Die Bilddateien der Rang-Abzeichen und Statistiksymbole.
 *
 * `import.meta.glob` sammelt sie zur Bauzeit ein, statt dass dreißig
 * Import-Zeilen von Hand gepflegt werden. `eager` lädt dabei nur die Adressen,
 * nicht die Bilder selbst. Im Bündel steht danach eine Liste mit Pfaden; der
 * Browser holt genau die Dateien, die eine Seite auch anzeigt.
 */
const RANK_FILES = import.meta.glob<string>("../assets/rocketleague/ranks/*.webp", {
    eager: true,
    query: "?url",
    import: "default",
});

const STAT_FILES = import.meta.glob<string>("../assets/rocketleague/stats/*.webp", {
    eager: true,
    query: "?url",
    import: "default",
});

/** Aus dem vollen Pfad den Dateinamen ohne Endung machen. */
function key(path: string): string {
    return path.split("/").pop()?.replace(".webp", "") ?? "";
}

const ranks = new Map(Object.entries(RANK_FILES).map(([path, url]) => [key(path), url]));
const stats = new Map(Object.entries(STAT_FILES).map(([path, url]) => [key(path), url]));

/**
 * Das Abzeichen einer Rangstufe.
 *
 * Fehlt eine Datei, kommt das Unranked-Abzeichen zurück. Ein fehlendes Bild
 * kostet damit sein Symbol und nicht die ganze Karte - genauso hält es der Bot.
 */
export function rankBadge(rank: RLRank): string {
    return ranks.get(rank) ?? ranks.get(RLRank.Unranked) ?? "";
}

/**
 * Das Symbol eines Karriere-Werts.
 *
 * Die Dateien sind schwarze Striche auf durchsichtigem Grund. Eingefärbt wird
 * im Stylesheet über `mask-image`, deshalb gibt es hier nur die Adresse.
 */
export function statIcon(name: string): string {
    return stats.get(name) ?? "";
}
