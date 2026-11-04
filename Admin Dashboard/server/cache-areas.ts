/**
 * Was RL Nexus in Redis ablegt (W-0066), an einer Stelle: Schlüssel, Laufzeit
 * und wo es herkommt. Die Nutzer lesen den Anfang von hier, die Seite
 * Dev → Datenbank → Redis zeigt dieselbe Liste. Ändert sich die Form eines
 * Werts, die Version im Anfang hochzählen (v1 → v2).
 */

export interface ICacheArea {
    readonly id: string;
    readonly label: string;
    /** Ohne rln: davor. Ein Schlüssel gehört zum Bereich, wenn er so anfängt. */
    readonly prefix: string;
    /** Sekunden. */
    readonly ttl: number;
    readonly source: string;
    readonly cleared: string;
}

export const CACHE_AREAS = {
    discordUser: { id: "discord-namen", label: "Discord-Namen", prefix: "discord:user:v1:", ttl: 86_400, source: "Discord-API, /users/:id", cleared: "bei einer Löschung von Nutzerdaten" },
    userdataIndex: { id: "nutzerliste", label: "Nutzerliste", prefix: "userdata:index:v1", ttl: 300, source: "MariaDB, alle Quellen der Nutzerdaten", cleared: "nach jeder Löschung" },
} as const satisfies Readonly<Record<string, ICacheArea>>;

export const CACHE_AREA_LIST: readonly ICacheArea[] = Object.values(CACHE_AREAS);

/** Zu welchem Bereich ein Schlüssel (ohne rln:) gehört. */
export function areaOfKey(key: string): ICacheArea | null {
    return CACHE_AREA_LIST.find((area) => key.startsWith(area.prefix)) ?? null;
}
