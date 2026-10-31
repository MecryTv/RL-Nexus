/**
 * Der Puls: die Seite zieht sich selbst nach, wenn sich auf dem Server etwas
 * tut - ein neuer Moderationsfall, ein frischer Temp-Voice-Kanal, jemand in der
 * 6Mans-Warteschlange. Ohne Neuladen, ohne Nachfragen im Sekundentakt.
 *
 * Eine Leitung je Server, geteilt von allen Abschnitten: wer sich anmeldet,
 * bekommt seine Stichworte, alle anderen stören sich nicht daran. Kommt nichts
 * mehr an, baut EventSource die Leitung von selbst wieder auf.
 *
 * Gemeldet wird nur, **dass** sich etwas geändert hat. Was darin steht, holt
 * die Seite danach über ihre eigene Route - so steht die Rechteprüfung an
 * einer Stelle.
 */

import { BASE } from "./Base.js";

type Handler = (kind: string, data: Record<string, unknown>) => void;

interface IStream {
    source: EventSource;
    listeners: Map<string, Set<Handler>>;
}

const KINDS = ["moderation", "voice", "sixmans", "matchups", "lft", "clips", "guild", "levels"] as const;

const streams = new Map<string, IStream>();

/**
 * Hört auf die genannten Stichworte eines Servers. Zurück kommt das Abmelden -
 * ein Abschnitt, der zugeht, gibt seinen Platz damit wieder frei.
 */
export function onPulse(guildId: string, kinds: readonly string[], handler: Handler): () => void {
    const stream = open(guildId);

    for (const kind of kinds) {
        const set = stream.listeners.get(kind) ?? new Set<Handler>();

        set.add(handler);
        stream.listeners.set(kind, set);
    }

    return () => {
        for (const kind of kinds) stream.listeners.get(kind)?.delete(handler);

        // Hört niemand mehr zu, kann die Leitung weg.
        if ([...stream.listeners.values()].every((set) => set.size === 0)) {
            stream.source.close();
            streams.delete(guildId);
        }
    };
}

function open(guildId: string): IStream {
    const found = streams.get(guildId);

    if (found) return found;

    const source = new EventSource(`${BASE}/api/guild/${encodeURIComponent(guildId)}/pulse`);
    const stream: IStream = { source, listeners: new Map() };

    for (const kind of KINDS) {
        source.addEventListener(kind, (event) => {
            const set = stream.listeners.get(kind);

            if (!set?.size) return;

            let data: Record<string, unknown> = {};

            try {
                data = JSON.parse((event as MessageEvent<string>).data) as Record<string, unknown>;
            } catch {
                // Eine Meldung ohne brauchbare Daten ist trotzdem eine Meldung.
            }

            for (const handler of set) handler(kind, data);
        });
    }

    streams.set(guildId, stream);

    return stream;
}

/**
 * Sammelt Meldungen, die dicht hintereinander kommen: zehn Leute in der
 * Warteschlange sollen nicht zehn Abfragen auslösen. Die erste Meldung zieht
 * nach der Wartezeit einmal nach, alles dazwischen fällt weg.
 */
export function debounce(run: () => void, wait = 400): () => void {
    let timer: number | null = null;

    return () => {
        if (timer !== null) window.clearTimeout(timer);

        timer = window.setTimeout(() => {
            timer = null;
            run();
        }, wait);
    };
}
