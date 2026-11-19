import { AttachmentBuilder, MessageFlags } from "discord.js";
import BotClient from "../client/BotClient";
import ComponentV2Builder from "../builder/ComponentV2Builder";
import { IPrimeAccessCard, PRIME_ACCESS_URL, PrimeAccessAlt, PrimeAccessColor, RenderPrimeAccessCard } from "../builder/PrimeAccessCard";
import { PRIME_ACCOUNT } from "../constants/Prime";
import type { PrimeError } from "./PrimeService";
import logger from "../utils/logger";

const FILE = "prime-zugang.png";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Die Zeile unter dem Bild: was live zählen soll, als Discord-Zeitstempel. */
function lineOf(card: IPrimeAccessCard): string {
    const stamp = (at: number) => `<t:${Math.floor(at / 1000)}:R>`;
    const key = " · neuer Schlüssel gehört in `PRIME_API_TOKEN`";

    if (card.state === "soon") return `Läuft ab ${stamp(card.at)}${key}`;
    if (card.state === "locked") return `Abgelehnt seit ${stamp(card.at)}${key}`;

    return `Wieder da seit ${stamp(card.until ?? card.now)}`;
}

/** Die DM nach Entwurf D: Bild mit Alt-Text, darunter die Zeile und der Knopf zur Prime-Kontoseite. */
export async function PrimeAccessMessage(card: IPrimeAccessCard) {
    const file = new AttachmentBuilder(await RenderPrimeAccessCard(card), { name: FILE });
    const container = new ComponentV2Builder({ accentColor: PrimeAccessColor(card.state) as `#${string}` })
        .image(`attachment://${FILE}`, PrimeAccessAlt(card))
        .subtext(lineOf(card))
        .buttons({ url: PRIME_ACCESS_URL, label: "Prime-Konto öffnen" });

    return { components: [container.build()], files: [file], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } } as const;
}

/**
 * Schickt die DM an jeden in DEV_USER_IDs, wie Guardian es mit Fehlern tut.
 * Geschlossene DMs oder unbekannte IDs landen nur im Log. Gibt zurück, an wie
 * viele sie rausging.
 */
export async function SendPrimeAccess(client: BotClient, card: IPrimeAccessCard): Promise<number> {
    const ids = client.config.DEV_USER_IDs;

    if (!ids.length) return 0;

    const message = await PrimeAccessMessage(card);
    let sent = 0;

    for (const id of ids) {
        const user = await client.users.fetch(id).catch(() => null);

        if (!user) {
            logger.warn(`🎮 Prime-Zugang: Developer ${id} nicht gefunden - keine DM.`);
            continue;
        }

        await user
            .send(message)
            .then(() => sent++)
            .catch(() => logger.warn(`🎮 Prime-Zugang: DM an ${user.tag} ging nicht raus - Direktnachrichten zu?`));
    }

    return sent;
}

/**
 * PRIME_ACCESS_EXPIRES: wann der Prime-Zugang abläuft, ISO mit Uhrzeit, etwa
 * "2026-12-18T23:00" (Zeit des Bots, im Container Europe/Berlin) oder mit
 * Versatz "2026-12-18T23:00+01:00". Leer: null. Alles andere: "invalid".
 */
export function ParseAccessExpiry(raw: string): number | null | "invalid" {
    const value = raw.trim();

    if (!value) return null;
    if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.test(value)) return "invalid";

    const at = Date.parse(value.replace(" ", "T"));

    return Number.isFinite(at) ? at : "invalid";
}

/** Was in bot_state steht, damit ein Neustart nichts doppelt schickt. */
interface IAccessRecord {
    state: "ok" | "locked";
    /** Die erste Ablehnung. */
    since: number | null;
    /** Die letzte rote DM - die nächste frühestens 24 Stunden danach, auch bei einer neuen Sperre. */
    sentAt: number | null;
    /** Ob für die laufende Sperre ein Rot rausging - nur dann kommt beim Erfolg Grün. */
    notified: boolean;
    lastOk: number | null;
    refused: number;
    /** Die zuletzt gemeldete gelbe Stufe: "<Ablauf>:<1|2>". */
    warned: string | null;
}

// Nur Zahlen, Wahrheitswerte und kurze feste Texte: bot_state.value fasst 255 Zeichen (Migration 058).
// Was Prime sagt, steht deshalb nicht darin, sondern nur im Speicher (Review).
const KEY = "prime_access";
const EMPTY: IAccessRecord = { state: "ok", since: null, sentAt: null, notified: false, lastOk: null, refused: 0, warned: null };

/**
 * W-0145: Meldet den Developern per DM, wenn der Prime-Zugang bald abläuft
 * (gelb, 7 Tage und 1 Tag vorher, nur mit PRIME_ACCESS_EXPIRES), Prime den
 * Schlüssel ablehnt (rot, beim ersten Mal und dann höchstens alle 24 Stunden)
 * und wenn er wieder geht (grün, einmal).
 *
 * PrimeService meldet jede Abfrage über Note(). Tick() läuft alle zehn Minuten
 * (runnables/PrimeAccess.ts): Gelb prüfen und, wenn in der letzten Stunde
 * keine Abfrage lief, eine Probe schicken - so fällt ein Ablauf auch auf, wenn
 * gerade niemand /rank benutzt.
 *
 * ponytail: Stunden-Leiste, letzte Abfrage und Zähler liegen im Speicher und
 * werden nur bei einer DM gespeichert. Nach einem Neustart ist die Leiste
 * grau und der Zähler kann etwas zu niedrig sein.
 */
export class PrimeAccessWatch {
    private record: IAccessRecord = { ...EMPTY };
    private loaded = false;
    private chain: Promise<void> = Promise.resolve();
    private hours = new Map<number, "ok" | "down">();
    private lastQueryAt = 0;
    private expires: number | null;

    constructor(
        private client: BotClient,
        private send: (client: BotClient, card: IPrimeAccessCard) => Promise<number> = SendPrimeAccess
    ) {
        const parsed = ParseAccessExpiry(client.config.PRIME_ACCESS_EXPIRES ?? "");

        if (parsed === "invalid") logger.warn(`🎮 PRIME_ACCESS_EXPIRES ist kein Datum mit Uhrzeit (etwa 2026-12-18T23:00) - keine Warnung vor dem Ablauf.`);

        this.expires = parsed === "invalid" ? null : parsed;
    }

    /** Eine Abfrage an Prime ist durch: "ok", abgelehnt (PrimeError Art Access) oder sonst gescheitert. */
    Note(result: "ok" | "other" | PrimeError, now = Date.now()): void {
        this.lastQueryAt = Math.max(this.lastQueryAt, now);
        this.Queue(() => this.Handle(result, now));
    }

    /** Für die Prüfungen: wartet, bis alles Gemeldete verarbeitet ist. */
    Idle(): Promise<void> {
        return this.chain;
    }

    /** Alle zehn Minuten: Gelb prüfen, und eine Probe, wenn in der letzten Stunde keine Abfrage lief. */
    async Tick(now = Date.now()): Promise<void> {
        this.Queue(() => this.Warn(now));
        await this.chain;

        if (!this.client.primeService.IsConfigured || now - this.lastQueryAt < HOUR) return;

        this.lastQueryAt = now;
        await this.client.primeService.Probe();
        await this.chain;
    }

    private Queue(task: () => Promise<void>): void {
        this.chain = this.chain.then(task).catch((error) => logger.warn(`🎮 Prime-Zugang: ${String(error)}`));
    }

    private async Handle(result: "ok" | "other" | PrimeError, now: number): Promise<void> {
        if (result === "other") return;

        await this.Load();
        this.hours.set(Math.floor(now / HOUR), result === "ok" ? "ok" : "down");

        for (const hour of this.hours.keys()) if (hour <= Math.floor(now / HOUR) - 24) this.hours.delete(hour);

        if (result === "ok") {
            const was = this.record;

            this.record = { ...was, lastOk: now };

            if (was.state !== "locked") return;

            // sentAt bleibt: Flattert der Zugang, kommt das nächste Rot erst einen Tag nach dem letzten (Review).
            this.record = { ...this.record, state: "ok", since: null, refused: 0, notified: false };
            await this.Save();

            // Grün nur, wenn für diese Sperre ein Rot rausging.
            if (was.notified) await this.Deliver({ state: "back", at: was.since ?? now, until: now, answer: "Zugang wieder aktiv", refused: was.refused }, now);

            return;
        }

        if (result.type !== "Access") return;

        // Gekürzt: die Kachel zeigt ohnehin nur zwei Zeilen.
        const answer = (result.reason ? `${result.status} · ${result.reason}` : `HTTP ${result.status}`).slice(0, 80);
        const fresh = this.record.state !== "locked";

        this.record = fresh ? { ...this.record, state: "locked", since: now, refused: 1, notified: false } : { ...this.record, refused: this.record.refused + 1 };

        // Rot höchstens einmal je Tag - als Erinnerung und auch bei einer neuen Sperre kurz nach der letzten.
        if (this.record.sentAt !== null && now - this.record.sentAt < DAY) {
            if (fresh) await this.Save();

            return;
        }

        this.record = { ...this.record, sentAt: now, notified: true };
        await this.Save();
        await this.Deliver({ state: "locked", at: this.record.since ?? now, answer, refused: this.record.refused }, now);
    }

    /** Gelb: 7 Tage und 1 Tag vor dem Ablauf, je Stufe einmal. Nicht, solange Prime schon ablehnt. */
    private async Warn(now: number): Promise<void> {
        if (this.expires === null || !this.client.primeService.IsConfigured) return;

        await this.Load();

        const left = this.expires - now;
        const stage = left <= 0 || left > 7 * DAY ? 0 : left <= DAY ? 2 : 1;
        const [at, sent] = (this.record.warned ?? "").split(":").map(Number);
        const done = at === this.expires ? (sent ?? 0) : 0;

        if (stage === 0 || stage <= done || this.record.state === "locked") return;

        this.record.warned = `${this.expires}:${stage}`;
        await this.Save();
        await this.Deliver({ state: "soon", at: this.expires, stage: stage as 1 | 2, answer: "Zugang aktiv", refused: 0 }, now);
    }

    private async Deliver(card: Pick<IPrimeAccessCard, "state" | "at" | "answer" | "refused"> & Partial<IPrimeAccessCard>, now: number): Promise<void> {
        // Wie Guardian: ohne Verbindung zu Discord gibt es niemanden, dem man schreiben kann.
        if (!this.client.isReady?.()) return;

        const hours = Array.from({ length: 24 }, (_, index) => this.hours.get(Math.floor(now / HOUR) - 23 + index) ?? null);
        const sent = await this.send(this.client, { now, account: PRIME_ACCOUNT, lastOk: this.record.lastOk, hours, ...card });

        logger.info(`🎮 Prime-Zugang: DM „${card.state}“ an ${sent} Developer`);
    }

    private async Load(): Promise<void> {
        if (this.loaded) return;

        this.loaded = true;

        // ponytail: ohne Datenbank gilt nur der Speicher - ein Neustart kann dann einmal doppelt schicken.
        if (!this.client.databaseService?.Ready) return;

        const [row] = await this.client.databaseService.Query<{ value: string }>("SELECT value FROM bot_state WHERE name = ?", [KEY]);

        if (row?.value) this.record = { ...EMPTY, ...(JSON.parse(row.value) as Partial<IAccessRecord>) };
    }

    private async Save(): Promise<void> {
        if (!this.client.databaseService?.Ready) return;

        await this.client.databaseService.Query("INSERT INTO bot_state (name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)", [KEY, JSON.stringify(this.record)]);
    }
}
