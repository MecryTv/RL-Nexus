import { ActivityType, PresenceUpdateStatus } from "discord.js";
import BotClient from "../client/BotClient";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import { PRESENCES, PRESENCE_FALLBACK, PRESENCE_INTERVAL, IPresence } from "../constants/Presence";
import logger from "../utils/logger";

/**
 * Der Status unter dem Namen des Bots.
 *
 * Fünf Ansagen im Wechsel, alle fünfzehn Sekunden eine. Die Zahlen darin kommen
 * aus dem Cache - kein Aufruf bei Discord, keine Datenbank: ein Status ist es
 * nicht wert, dass dafür irgendwo gewartet wird. Siehe docs/Presence.md.
 *
 * Nicht über die Runnables gelöst: die sehen nur alle dreißig Sekunden nach, und
 * fünfzehn Sekunden wären damit nicht zu halten.
 */
export default class PresenceService {
    private readonly client: BotClient;
    private timer: NodeJS.Timeout | null = null;
    private index = -1;

    constructor(client: BotClient) {
        this.client = client;
    }

    /** Die Ansage, die gerade steht. null: es läuft noch keine. */
    get Current(): IPresence | null {
        return this.index >= 0 ? (PRESENCES[this.index % PRESENCES.length] ?? null) : null;
    }

    /**
     * Setzt die erste Ansage sofort und danach alle fünfzehn Sekunden die
     * nächste. Ein zweiter Aufruf fängt von vorn an, statt zwei Uhren
     * nebeneinander laufen zu lassen.
     */
    Start(): void {
        this.Stop();

        if (!PRESENCES.length) return;

        // Von vorn: nach einem Neustart soll die erste Ansage stehen, nicht die,
        // bei der der letzte Lauf aufgehört hat.
        this.index = -1;

        this.Next();
        this.timer = setInterval(() => this.Next(), PRESENCE_INTERVAL);

        // Der Status hält den Prozess nicht am Leben - beim Herunterfahren soll
        // er niemanden aufhalten.
        this.timer.unref?.();

        logger.info(`💬 Status: ${PRESENCES.length} Ansagen im Wechsel (alle ${PRESENCE_INTERVAL / 1000}s)`);
    }

    Stop(): void {
        if (!this.timer) return;

        clearInterval(this.timer);
        this.timer = null;
    }

    /** Die nächste Ansage - von vorn, wenn die letzte durch ist. */
    Next(): void {
        if (!this.client.isReady() || !PRESENCES.length) return;

        this.index = (this.index + 1) % PRESENCES.length;

        const entry = PRESENCES[this.index];
        const name = this.Fill(entry.text);

        this.client.user.setPresence({
            status: PresenceUpdateStatus.Online,
            activities: [{ name: name || PRESENCE_FALLBACK, type: entry.type }],
        });
    }

    /** Was die Platzhalter bedeuten. Unbekannte bleiben stehen. */
    Fill(text: string): string {
        const guilds = this.client.guilds.cache;
        const members = guilds.reduce((sum, guild) => sum + (guild.memberCount || 0), 0);
        const values: Record<string, string> = {
            server: String(guilds.size),
            mitglieder: this.Short(members),
            dashboard: this.Dashboard(),
            befehle: String(this.client.commands.size),
        };

        return text.replace(/\{([a-zäöü.]+)\}/g, (match, key: string) => values[key] ?? match);
    }

    /** 12345 wird zu 12.3k - im Status ist wenig Platz. */
    private Short(value: number): string {
        if (value < 1000) return String(value);

        const thousands = value / 1000;

        return `${thousands >= 10 ? Math.round(thousands) : Math.round(thousands * 10) / 10}k`.replace(".", ",");
    }

    /** Die Adresse des Dashboards, wie man sie vorlesen würde. */
    private Dashboard(): string {
        return `${this.client.server.BaseURL}${DASHBOARD_PATH}`.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    }

    /** Fürs Prüfskript: wie die Ansagen gerade aussähen. */
    Preview(): { type: ActivityType; text: string }[] {
        return PRESENCES.map((entry) => ({ type: entry.type, text: this.Fill(entry.text) }));
    }
}
