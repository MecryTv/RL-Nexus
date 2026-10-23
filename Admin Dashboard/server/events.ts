import type { FastifyReply } from "fastify";

/**
 * Was sich geändert hat, erfährt die Oberfläche sofort.
 *
 * Server-Sent Events statt WebSocket: Es fließt nur in eine Richtung, der
 * Browser bringt die Technik mit (`EventSource`, samt Wiederverbinden), und
 * durch jeden Proxy geht es wie eine lange HTTP-Antwort.
 *
 * Verschickt werden nur Marken, keine Daten: „an den Kontakten hat sich etwas
 * geändert“. Was genau, holt die Oberfläche über die Route, die sie ohnehin
 * kennt. So kann über diesen Weg nichts hinausgehen, was der Empfänger nicht
 * auch direkt abrufen dürfte.
 */

/** Worüber Bescheid gesagt wird. Jede Marke gehört zu einer Ansicht. */
export const TOPICS = ["content", "maintenance", "groups", "notifications", "bot", "status", "mail", "shop", "backups", "beta"] as const;
export type Topic = (typeof TOPICS)[number];

interface IListener {
    readonly reply: FastifyReply;
}

const listeners = new Set<IListener>();

/** Alle 25 Sekunden ein Lebenszeichen: Ohne das kappt mancher Proxy nach 30. */
const HEARTBEAT = 25_000;

let heartbeat: NodeJS.Timeout | null = null;

function write(listener: IListener, line: string): void {
    try {
        listener.reply.raw.write(line);
    } catch {
        // Verbindung weg. Das Aufräumen übernimmt der close-Handler.
        listeners.delete(listener);
    }
}

/**
 * Allen Bescheid sagen.
 *
 * Absichtlich ohne `await`: Ein Aufrufer, der gerade etwas gespeichert hat,
 * soll nicht darauf warten, dass alle offenen Verbindungen bedient sind.
 */
export function publish(topic: Topic): void {
    const line = `event: ${topic}\ndata: ${Date.now()}\n\n`;

    for (const listener of listeners) write(listener, line);
}

/** Wie viele gerade zuhören. Für die Technik-Ansicht. */
export function listenerCount(): number {
    return listeners.size;
}

/**
 * Eine neue Verbindung aufnehmen.
 *
 * Gibt nichts zurück: Die Antwort bleibt offen, bis der Browser geht. Fastify
 * erfährt das über `reply.hijack()`, sonst würde es die Antwort beenden.
 */
export function subscribe(reply: FastifyReply): void {
    reply.hijack();
    reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        // Für nginx und andere Puffer-freudige Proxys davor.
        "X-Accel-Buffering": "no",
    });

    const listener: IListener = { reply };
    listeners.add(listener);

    // Sofort ein Zeichen, damit der Browser die Verbindung als offen zählt,
    // und die Wartezeit vor dem Wiederverbinden festlegen.
    reply.raw.write(`retry: 5000\nevent: hello\ndata: ${Date.now()}\n\n`);

    heartbeat ??= setInterval(() => {
        // Ein Kommentar, keine Marke: Die Oberfläche soll davon nichts merken.
        for (const entry of listeners) write(entry, `: ping\n\n`);
    }, HEARTBEAT).unref();

    const drop = (): void => {
        listeners.delete(listener);

        if (listeners.size === 0 && heartbeat !== null) {
            clearInterval(heartbeat);
            heartbeat = null;
        }
    };

    reply.raw.on("close", drop);
    reply.raw.on("error", drop);
}

/** Beim Herunterfahren: offene Verbindungen schließen, sonst hängt der Prozess. */
export function closeEvents(): void {
    for (const listener of listeners) {
        try {
            listener.reply.raw.end();
        } catch {
            // Schon zu.
        }
    }

    listeners.clear();

    if (heartbeat !== null) {
        clearInterval(heartbeat);
        heartbeat = null;
    }
}
