/**
 * W-0140: Die Reiter der Voice-Seite - Hubs (Einrichtung) und Gerade offen
 * (laufende Temp-Kanäle). Reine Helfer, geprüft in check:dashboard.
 */
export type VoiceTab = "hubs" | "offen";

/** Der Reiter aus der Adresse: nur genau ?reiter=offen öffnet „Gerade offen“. */
export function parseVoiceTab(search: string): VoiceTab {
    return new URLSearchParams(search).get("reiter") === "offen" ? "offen" : "hubs";
}

export function voiceTabHref(base: string, guildId: string, tab: VoiceTab): string {
    return `${base}/guild/${guildId}/voice-hub${tab === "offen" ? "?reiter=offen" : ""}`;
}

export interface IOpenGroup<T> {
    hubId: number | null;
    /** Null bei einem Hub und nur einer Gruppe - dann die Liste ohne Überschrift wie früher. */
    title: string | null;
    items: T[];
}

/** Offene Kanäle nach Hub, in der Reihenfolge der Hubs; Kanäle ohne bekannten Hub zuletzt unter „Ohne Hub“. Ab zwei Hubs immer mit Überschrift (Spec). */
export function openGroups<T extends { hubId: number | null }>(open: T[], hubs: { id: number; channelName: string | null }[]): IOpenGroup<T>[] {
    const known = new Set(hubs.map((hub) => hub.id));
    const groups = [
        ...hubs.map((hub) => ({ hubId: hub.id as number | null, name: hub.channelName ?? "Hub", items: open.filter((entry) => entry.hubId === hub.id) })),
        { hubId: null, name: "Ohne Hub", items: open.filter((entry) => entry.hubId === null || !known.has(entry.hubId)) },
    ].filter((group) => group.items.length);

    return groups.map((group) => ({ hubId: group.hubId, title: groups.length > 1 || hubs.length > 1 ? `${group.name} · ${group.items.length} offen` : null, items: group.items }));
}

/** W-0143: die Kachel „Im Kanal“ - mit Limit „3 von 5“, ohne Limit (0) „3 drin“. */
export function seatsText(count: number, limit: number): { value: string; sub: string } {
    if (limit <= 0) return { value: `${count} drin`, sub: "ohne Limit" };

    const free = limit - count;

    return { value: `${count} von ${limit}`, sub: free > 0 ? `${free} frei` : "voll" };
}

export type PersonState = "stream" | "video" | "mute" | "deaf";

const STATES: [PersonState, string][] = [
    ["stream", "streamt"],
    ["video", "Kamera"],
    ["mute", "stumm"],
    ["deaf", "taub"],
];

/** Was eine Person im Kanal gerade tut, immer in derselben Reihenfolge und mit Wort - nie nur als Farbe. */
export function personStates(person: Record<PersonState, boolean>): [PersonState, string][] {
    return STATES.filter(([key]) => person[key]);
}

/** Name der Region aus der Liste der Seite; ohne Region wählt Discord selbst. */
export function regionName(region: string | null, regions: [string, string][]): string {
    if (!region) return "Automatisch";

    return regions.find(([id]) => id === region)?.[1] ?? region;
}
