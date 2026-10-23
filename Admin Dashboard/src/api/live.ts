import { useEffect, useRef, useState } from "react";

/**
 * Die Verbindung, über die der Server sagt, was sich geändert hat.
 *
 * Eine für die ganze Anwendung: Jede Seite, die zuhört, hängt sich an dieselbe
 * `EventSource`. Ein Browser lässt pro Adresse nur eine Handvoll offener
 * Verbindungen zu, und sechs Seiten mit je einer eigenen hätten davon schon
 * alle verbraucht.
 *
 * Reißt die Verbindung ab, verbindet der Browser selbst neu. Danach lädt jede
 * Ansicht einmal nach: In der Lücke kann etwas passiert sein, wovon niemand
 * erfahren hat.
 */

/** Dieselbe Liste wie TOPICS in server/events.ts. Wer hier fehlt, bekommt nie Bescheid. */
const TOPICS = ["content", "maintenance", "groups", "notifications", "bot", "status", "mail", "shop", "backups", "beta"] as const;
export type Topic = (typeof TOPICS)[number];

type Handler = () => void;

const handlers = new Map<Topic, Set<Handler>>();
const connectionHandlers = new Set<(online: boolean) => void>();

let source: EventSource | null = null;
let online = false;
/** Nach dem ersten Verbinden ist jedes weitere eine Wiederaufnahme: Dann wird nachgeladen. */
let hadConnection = false;

function setOnline(value: boolean): void {
    if (online === value) return;

    online = value;
    for (const handler of connectionHandlers) handler(value);
}

function fire(topic: Topic): void {
    for (const handler of handlers.get(topic) ?? []) handler();
}

function connect(): void {
    if (source !== null) return;

    source = new EventSource("/api/events");

    source.addEventListener("hello", () => {
        setOnline(true);

        // Beim Wiederaufnehmen alles nachladen, was jemand beobachtet.
        if (hadConnection) for (const topic of handlers.keys()) fire(topic);

        hadConnection = true;
    });

    source.addEventListener("error", () => setOnline(false));

    for (const topic of TOPICS) {
        source.addEventListener(topic, () => fire(topic));
    }
}

function disconnectIfIdle(): void {
    const listeners = [...handlers.values()].reduce((sum, set) => sum + set.size, 0);
    if (listeners > 0 || connectionHandlers.size > 0 || source === null) return;

    source.close();
    source = null;
    setOnline(false);
}

/**
 * Auf Änderungen an einem Thema hören.
 *
 * `onChange` darf bei jedem Rendern eine neue Funktion sein: Angemeldet wird
 * ein Zwischenstück, das immer die zuletzt übergebene aufruft. Stünde die
 * Funktion selbst in den Abhängigkeiten, meldete sich der Hook bei jedem
 * Rendern ab und wieder an.
 */
export function useLive(topic: Topic, onChange: () => void): void {
    const latest = useRef(onChange);

    // Nach jedem Rendern nachziehen, nicht währenddessen: React darf einen
    // Durchlauf verwerfen, und dann zeigte das Ref auf eine Fassung, die es
    // nie gab.
    useEffect(() => {
        latest.current = onChange;
    });

    useEffect(() => {
        const handler = (): void => latest.current();
        const set = handlers.get(topic) ?? new Set<Handler>();

        set.add(handler);
        handlers.set(topic, set);
        connect();

        return () => {
            set.delete(handler);
            if (set.size === 0) handlers.delete(topic);
            disconnectIfIdle();
        };
    }, [topic]);
}

/** Ob die Verbindung gerade steht. Für den Hinweis in der Kopfzeile. */
export function useLiveStatus(): boolean {
    const [value, setValue] = useState(online);

    // Der Anfangswert kommt aus useState, jede Änderung danach über den
    // angemeldeten Handler. Dazwischen liegt nur dieser Effekt, und `connect`
    // darin kann frühestens beim nächsten Durchlauf etwas melden.
    useEffect(() => {
        connectionHandlers.add(setValue);
        connect();

        return () => {
            connectionHandlers.delete(setValue);
            disconnectIfIdle();
        };
    }, []);

    return value;
}
