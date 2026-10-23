import { Events } from "discord.js";
import BotClient from "../client/BotClient";
import { ForgetLogTargets } from "../utils/logtarget";

/**
 * Der Puls: kurze Meldungen an offene Dashboard-Fenster, damit sich Listen von
 * selbst nachziehen - ein neuer Moderationsfall, ein frischer Temp-Voice-Kanal,
 * jemand steigt in die 6Mans-Warteschlange, in Discord entsteht ein Kanal.
 *
 * Absichtlich klein: eine Meldung sagt nur, **dass** sich etwas geändert hat,
 * nicht was darin steht. Die Seite holt ihre Daten danach auf dem üblichen Weg
 * über ihre eigene Route - so gibt es keine zweite Stelle, an der Rechte
 * geprüft werden müssen, und nichts Vertrauliches geht durch den Stream.
 *
 * Live Tickets haben ihren eigenen Stream (LiveService): dort fließen ganze
 * Nachrichten, und wer was sehen darf, hängt am einzelnen Ticket.
 */
export type PulseKind = "moderation" | "voice" | "sixmans" | "matchups" | "lft" | "clips" | "guild";

interface ISubscriber {
    userId: string;
    send(kind: PulseKind, data: unknown): void;
    ping(): void;
}

/** So viele Fenster darf eine Person gleichzeitig offen haben. */
const MAX_PER_USER = 4;

/** Alle 25 Sekunden ein Doppelpunkt, damit kein Proxy die Leitung kappt. */
const PING = 25_000;

export default class PulseService {
    private readonly client: BotClient;
    private readonly subscribers = new Map<string, Set<ISubscriber>>();
    private pinger: NodeJS.Timeout | null = null;

    constructor(client: BotClient) {
        this.client = client;
    }

    /**
     * Kanäle, Rollen und Emojis: legt jemand in Discord etwas an, benennt es um
     * oder löscht es, ziehen offene Dashboards ihre Auswahlfelder nach
     * (core/Resources.ts im Dashboard). Wer nicht zusieht, kostet das nichts.
     */
    Initialize(): void {
        const client = this.client;
        const changed = (guildId: string, what: string): void => this.Emit(guildId, "guild", { what });
        // Die Log-Ziele hält utils/logtarget.ts eine Minute fest - ohne das stünde
        // ein neuer Kanal nach dem nächsten Speichern wieder nicht in der Liste.
        const rooms = (guildId: string): void => {
            ForgetLogTargets(guildId);
            changed(guildId, "channels");
        };

        client.on(Events.ChannelCreate, (channel) => rooms(channel.guildId));
        client.on(Events.ChannelDelete, (channel) => {
            if (!channel.isDMBased()) rooms(channel.guildId);
        });
        client.on(Events.ChannelUpdate, (before, after) => {
            if (before.isDMBased() || after.isDMBased()) return;

            // Nur was in einer Auswahl zu sehen ist: Name, Art, Ort. Rechte und Themen nicht.
            if (before.name !== after.name || before.type !== after.type || before.parentId !== after.parentId || before.rawPosition !== after.rawPosition) {
                rooms(after.guildId);
            }
        });
        client.on(Events.GuildRoleCreate, (role) => changed(role.guild.id, "roles"));
        client.on(Events.GuildRoleDelete, (role) => changed(role.guild.id, "roles"));
        client.on(Events.GuildRoleUpdate, (before, after) => {
            if (before.name !== after.name || before.hexColor !== after.hexColor || before.position !== after.position) changed(after.guild.id, "roles");
        });
        client.on(Events.GuildEmojiCreate, (emoji) => changed(emoji.guild.id, "emojis"));
        client.on(Events.GuildEmojiDelete, (emoji) => changed(emoji.guild.id, "emojis"));
        client.on(Events.GuildEmojiUpdate, (_before, after) => changed(after.guild.id, "emojis"));
        // Forenbeiträge stehen nur in den Log-Zielen; dort reicht es, dass das nächste Laden frisch holt.
        client.on(Events.ThreadCreate, (thread) => ForgetLogTargets(thread.guildId));
        client.on(Events.ThreadDelete, (thread) => ForgetLogTargets(thread.guildId));
        client.on(Events.ThreadUpdate, (_before, after) => ForgetLogTargets(after.guildId));
    }

    /** Wie viele Fenster gerade zuhören - für die Übersicht im Admin-Bereich. */
    get Open(): number {
        let open = 0;

        for (const set of this.subscribers.values()) open += set.size;

        return open;
    }

    /**
     * Meldet ein Fenster an. null heißt: zu viele offene Fenster derselben
     * Person. Zurück kommt die Abmeldung - sie muss beim Schließen laufen,
     * sonst wächst die Liste.
     */
    Subscribe(guildId: string, userId: string, send: ISubscriber["send"], ping: ISubscriber["ping"]): (() => void) | null {
        let open = 0;

        for (const set of this.subscribers.values()) for (const subscriber of set) if (subscriber.userId === userId) open++;

        if (open >= MAX_PER_USER) return null;

        const subscriber: ISubscriber = { userId, send, ping };
        const set = this.subscribers.get(guildId) ?? new Set<ISubscriber>();

        set.add(subscriber);
        this.subscribers.set(guildId, set);

        this.pinger ??= setInterval(() => {
            for (const group of this.subscribers.values()) for (const entry of group) entry.ping();
        }, PING);

        return () => {
            set.delete(subscriber);

            if (set.size === 0 && this.subscribers.get(guildId) === set) this.subscribers.delete(guildId);

            if (this.subscribers.size === 0 && this.pinger) {
                clearInterval(this.pinger);
                this.pinger = null;
            }
        };
    }

    /**
     * Sagt allen offenen Fenstern eines Servers Bescheid. Kostet nichts, wenn
     * niemand zusieht - deshalb darf jeder Dienst das einfach aufrufen, ohne
     * vorher nachzusehen.
     */
    Emit(guildId: string, kind: PulseKind, data: Record<string, unknown> = {}): void {
        const set = this.subscribers.get(guildId);

        if (!set?.size) return;

        for (const subscriber of set) {
            try {
                subscriber.send(kind, data);
            } catch {
                // Eine tote Leitung räumt ihr eigenes "close" weg.
            }
        }
    }
}
