import { AttachmentBuilder, MessageFlags } from "discord.js";
import BotClient from "../client/BotClient";
import ComponentV2Builder from "../builder/ComponentV2Builder";
import { IPrimeAccessCard, PRIME_ACCESS_URL, PrimeAccessAlt, PrimeAccessColor, RenderPrimeAccessCard } from "../builder/PrimeAccessCard";
import { PRIME_ACCOUNT } from "../constants/Prime";
import { DATABASE_WAIT_MS } from "./DatabaseService";
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
            .catch((error: unknown) => logger.warn(`🎮 Prime-Zugang: DM an ${user.tag} ging nicht raus - Direktnachrichten zu? (${String(error)})`));
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
    const parts = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/.exec(value);

    if (!parts) return "invalid";

    // Date.parse rollt unmögliche Daten weiter (30.02. wird 02.03.) - deshalb das Datum selbst zurückrechnen (Review).
    const [year, month, day, hour, minute, second] = parts.slice(1).map((part) => Number(part ?? 0)) as [number, number, number, number, number, number];
    const calendar = new Date(Date.UTC(year, month - 1, day));

    if (calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) return "invalid";

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
    /** Die gemeldeten gelben Stufen: "<Ablauf>:<Maske>", 1 = 7 Tage vorher, 2 = 1 Tag vorher. */
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
    /** Wann zuerst nach dem Zustand gefragt wurde - für die Wartezeit auf die Datenbank. */
    private startedAt: number | null = null;
    /** Ohne Datenbank entschieden, nach DATABASE_WAIT_MS. */
    private guessed = false;
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
        if (typeof parsed === "number" && parsed <= Date.now()) {
            logger.warn(`🎮 PRIME_ACCESS_EXPIRES liegt in der Vergangenheit (${new Date(parsed).toISOString()}) - nach dem Erneuern das neue Ablaufdatum eintragen.`);
        }

        this.expires = parsed === "invalid" ? null : parsed;
    }

    /** Eine Abfrage an Prime ist durch: "ok", abgelehnt (PrimeError Art Access) oder sonst gescheitert. */
    Note(result: "ok" | "other" | PrimeError, now = Date.now()): void {
        this.lastQueryAt = Math.max(this.lastQueryAt, now);
        this.Queue(() => this.Handle(result, now));
    }

    /**
     * W-0146: Lehnt Prime den Schlüssel gerade ab? In der Reihe gelesen, also nach
     * allem schon Gemeldeten, und gleich nach einem Neustart aus dem gespeicherten
     * Zustand. Ohne Datenbank (noch kein Zustand) heißt es nein.
     */
    async Locked(now = Date.now()): Promise<boolean> {
        let locked = false;

        this.Queue(async () => void (locked = (await this.Load(now)) && this.record.state === "locked"));
        await this.chain;

        return locked;
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

        this.hours.set(Math.floor(now / HOUR), result === "ok" ? "ok" : "down");

        for (const hour of this.hours.keys()) if (hour <= Math.floor(now / HOUR) - 24) this.hours.delete(hour);

        // Ohne den gespeicherten Zustand keine Entscheidung - sonst schickt ein Neustart doppelt (Review).
        if (!(await this.Load(now))) return;

        if (result === "ok") {
            const was = this.record;

            this.record = { ...was, lastOk: now };

            if (was.state !== "locked") return;

            // Grün ist fällig, aber Discord noch nicht verbunden: gesperrt lassen, beim nächsten Erfolg erneut (Review).
            if (was.notified && !this.Discord()) return;

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
        // Ohne Verbindung zu Discord gilt nichts als geschickt - beim nächsten Mal erneut (Review).
        if ((this.record.sentAt !== null && now - this.record.sentAt < DAY) || !this.Discord()) {
            if (fresh) await this.Save();

            return;
        }

        this.record = { ...this.record, sentAt: now, notified: true };
        await this.Save();
        await this.Deliver({ state: "locked", at: this.record.since ?? now, answer, refused: this.record.refused, warned: this.Warned(), dated: this.expires !== null }, now);
    }

    /** Welche gelben Stufen für das eingetragene Ablaufdatum rausgingen (Maske, 0 ohne Datum). */
    private Warned(): number {
        const [at, mask] = (this.record.warned ?? "").split(":").map(Number);

        return this.expires !== null && at === this.expires ? (mask ?? 0) : 0;
    }

    /** Gelb: 7 Tage und 1 Tag vor dem Ablauf, je Stufe einmal. Nicht, solange Prime schon ablehnt. */
    private async Warn(now: number): Promise<void> {
        if (this.expires === null || !this.client.primeService.IsConfigured) return;
        if (!(await this.Load(now))) return;

        const left = this.expires - now;
        const stage = left <= 0 || left > 7 * DAY ? 0 : left <= DAY ? 2 : 1;
        const done = this.Warned();

        // Je Stufe einmal, und nach der späten Warnung nicht noch die frühe.
        if (stage === 0 || (done & stage) > 0 || (stage === 1 && (done & 2) > 0) || this.record.state === "locked" || !this.Discord()) return;

        this.record.warned = `${this.expires}:${done | stage}`;
        await this.Save();
        await this.Deliver({ state: "soon", at: this.expires, stage: stage as 1 | 2, answer: "Zugang aktiv", refused: 0 }, now);
    }

    /** Wie Guardian: ohne Verbindung zu Discord gibt es niemanden, dem man schreiben kann. */
    private Discord(): boolean {
        return this.client.isReady?.() === true;
    }

    private async Deliver(card: Pick<IPrimeAccessCard, "state" | "at" | "answer" | "refused"> & Partial<IPrimeAccessCard>, now: number): Promise<void> {
        const hours = Array.from({ length: 24 }, (_, index) => this.hours.get(Math.floor(now / HOUR) - 23 + index) ?? null);
        const sent = await this.send(this.client, { now, account: PRIME_ACCOUNT, lastOk: this.record.lastOk, hours, ...card });

        logger.info(`🎮 Prime-Zugang: DM „${card.state}“ an ${sent} Developer`);
    }

    /**
     * Liest den gespeicherten Zustand einmal. false: noch nicht möglich, also
     * nichts entscheiden. Die Datenbank verbindet sich parallel zum Login; so
     * lange wie andere Start-Ereignisse (DATABASE_WAIT_MS) wird auf sie gewartet,
     * danach gilt der Speicher - sonst bliebe ohne Datenbank jede DM aus.
     */
    private async Load(now: number): Promise<boolean> {
        if (this.loaded) return true;

        this.startedAt ??= now;

        if (this.client.databaseService?.Ready) {
            try {
                const [row] = await this.client.databaseService.Query<{ value: string }>("SELECT value FROM bot_state WHERE name = ?", [KEY]);

                // Schon ohne Datenbank entschieden: dann gilt der Speicher und wird jetzt nachgetragen.
                if (this.guessed) await this.Save();
                else if (row?.value) this.record = { ...EMPTY, ...(JSON.parse(row.value) as Partial<IAccessRecord>) };

                this.loaded = true;

                return true;
            } catch (error) {
                logger.warn(`🎮 Prime-Zugang: Zustand nicht gelesen - ${String(error)}`);
            }
        }

        this.guessed ||= now - this.startedAt >= DATABASE_WAIT_MS;

        return this.guessed;
    }

    private async Save(): Promise<void> {
        if (!this.client.databaseService?.Ready) return;

        // Ein Fehler hier darf die DM nicht aufhalten - schlimmstenfalls schickt ein Neustart sie noch einmal (Review).
        await this.client.databaseService
            .Query("INSERT INTO bot_state (name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)", [KEY, JSON.stringify(this.record)])
            .catch((error) => logger.warn(`🎮 Prime-Zugang: Zustand nicht gespeichert - ${String(error)}`));
    }
}
