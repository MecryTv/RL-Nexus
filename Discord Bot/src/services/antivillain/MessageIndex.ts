import { LRUCache } from "lru-cache";

const DAY = 86_400_000;
const PER_PERSON = 200;

export interface IIndexedMessage {
    channelId: string;
    messageId: string;
    at: number;
    text: string;
    files: string[];
}

/**
 * Wo jemand in den letzten 24 Stunden geschrieben hat (Plan 31) - damit das
 * Aufräumen beim Festhalten nicht jeden Kanal durchsuchen muss, und damit „Gelöschte
 * ansehen“ den Text noch kennt, wenn Discord die Nachricht schon gelöscht hat.
 *
 * ponytail: im Arbeitsspeicher, je Person höchstens 200 Nachrichten, nach einem
 * Neustart leer. Dann räumt das Festhalten auf, was es findet, und sagt das.
 */
export default class MessageIndex {
    private readonly people = new LRUCache<string, IIndexedMessage[]>({ max: 20_000, ttl: DAY });

    Note(guildId: string, userId: string, channelId: string, messageId: string, at: number, text: string, files: string[]): void {
        const key = `${guildId}:${userId}`;
        const list = (this.people.get(key) ?? []).filter((entry) => at - entry.at <= DAY);

        list.push({ channelId, messageId, at, text, files });
        this.people.set(key, list.slice(-PER_PERSON));
    }

    /** Neueste zuerst, nur die der letzten sinceMs. */
    Recent(guildId: string, userId: string, sinceMs: number, now: number): IIndexedMessage[] {
        return (this.people.get(`${guildId}:${userId}`) ?? []).filter((entry) => now - entry.at <= sinceMs).sort((a, b) => b.at - a.at);
    }

    Forget(guildId: string, userId: string): void {
        this.people.delete(`${guildId}:${userId}`);
    }
}
