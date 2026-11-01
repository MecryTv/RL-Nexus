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

const KINDS = ["moderation", "voice", "sixmans", "matchups", "lft", "clips", "guild", "levels", "staff"] as const;

/** Der persönliche Puls (W-0011): Anfragen vom Staff, ein frisch eingeladener Server. */
const MY_KINDS = ["staff", "guilds"] as const;
const ME = "@me";

const streams = new Map<string, IStream>();

/**
 * Hört auf die genannten Stichworte eines Servers. Zurück kommt das Abmelden -
 * ein Abschnitt, der zugeht, gibt seinen Platz damit wieder frei.
 */
export function onPulse(guildId: string, kinds: readonly string[], handler: Handler): () => void {
    return listen(guildId, `${BASE}/api/guild/${encodeURIComponent(guildId)}/pulse`, KINDS, kinds, handler);
}

/** Dasselbe für den persönlichen Puls: gilt auf jeder Seite, egal welcher Server. */
export function onMyPulse(kinds: readonly string[], handler: Handler): () => void {
    return listen(ME, `${BASE}/api/me/pulse`, MY_KINDS, kinds, handler);
}

function listen(key: string, address: string, known: readonly string[], kinds: readonly string[], handler: Handler): () => void {
    const stream = open(key, address, known);

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
            streams.delete(key);
        }
    };
}

function open(key: string, address: string, known: readonly string[]): IStream {
    const found = streams.get(key);

    if (found) return found;

    const source = new EventSource(address);
    const stream: IStream = { source, listeners: new Map() };

    for (const kind of known) {
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

    streams.set(key, stream);

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
