import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { IContentMeta, IEnvelope } from "../shared/content.ts";
import type { IConfig } from "./config.ts";
import { PublicError } from "./errors.ts";

/**
 * Die Inhaltsdateien der Hauptseite in `SITE_DIR`.
 *
 * Gibt es eine Datei dort nicht, gilt der Standard aus dem Build der
 * Webseite, abgefragt unter `${WEBSITE_URL}/content-default/`. Geschrieben
 * wird nur nach `SITE_DIR`, über eine temporäre Datei und `rename`: Die
 * Webseite liest dieselben Dateien und soll nie eine halbe sehen.
 */

const TIMEOUT = 3000;
const META_TTL = 10 * 60_000;

const WEBSITE_DOWN = "Die Webseite antwortet nicht. Ohne sie lässt sich ihr Stand gerade nicht laden.";

type Envelope = IEnvelope<unknown>;

function isEnvelope(value: unknown): value is Envelope {
    if (typeof value !== "object" || value === null) return false;

    const envelope = value as Record<string, unknown>;

    return typeof envelope.revision === "number" && Number.isInteger(envelope.revision) && envelope.revision >= 0 && "data" in envelope;
}

/**
 * JSON von der Webseite über HTTP. `null`, wenn es die Datei nicht gibt. Der
 * Entwicklungsserver von Vite antwortet dann mit index.html und Status 200,
 * deshalb zählt alles ohne JSON als „gibt es nicht“.
 */
async function fromHttp(config: IConfig, file: string): Promise<unknown> {
    let response: Response;

    try {
        response = await fetch(`${config.websiteUrl}/${file}`, { signal: AbortSignal.timeout(TIMEOUT) });
    } catch {
        throw new PublicError(503, WEBSITE_DOWN);
    }

    if (response.status === 404 || !(response.headers.get("content-type") ?? "").includes("json")) return null;
    if (!response.ok) throw new PublicError(503, WEBSITE_DOWN);

    return response.json().catch(() => null);
}

/**
 * JSON aus dem gebauten dist-Ordner der Webseite. Im Betrieb liefert nginx
 * die Webseite direkt aus diesem Ordner, und das Admin Dashboard bekommt ihn
 * schreibgeschützt eingehängt (WEBSITE_DIST). So stimmt der Standard auch
 * während der Wartung, wenn die Webseite selbst nur die Wartungsseite zeigt.
 */
async function fromDisk(dist: string, file: string): Promise<unknown> {
    const root = path.resolve(dist);
    const full = path.resolve(root, file);

    // Die Namen kommen aus dem Code, trotzdem: nie aus dem Ordner hinaus.
    if (!full.startsWith(root + path.sep)) return null;

    let raw: string;

    try {
        raw = await readFile(full, "utf8");
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw new PublicError(503, "Der Build der Webseite lässt sich nicht lesen. Liegt der dist-Ordner auf dem Server?");
    }

    try {
        return JSON.parse(raw) as unknown;
    } catch {
        return null;
    }
}

/** Eine Datei aus dem Build der Webseite: von der Platte, wenn WEBSITE_DIST gesetzt ist, sonst per HTTP. */
async function fromWebsite(config: IConfig, file: string): Promise<unknown> {
    return config.websiteDist === null ? fromHttp(config, file) : fromDisk(config.websiteDist, file);
}

/** Der Standard aus dem Build der Webseite. `null` ohne Standard, bei einem neuen Modul ohne Detailtext ist das normal. */
async function readDefault(config: IConfig, file: string): Promise<Envelope | null> {
    const body = await fromWebsite(config, `content-default/${file}`);
    if (body === null) return null;
    if (!isEnvelope(body)) throw new PublicError(503, `Die Webseite liefert ${file} in einer unbekannten Form.`);

    return body;
}

function livePath(config: IConfig, file: string): string {
    return path.join(config.siteDir, file);
}

/** Die gespeicherte Datei in `SITE_DIR`, `null` wenn es keine gibt. */
async function readLive(config: IConfig, file: string): Promise<Envelope | null> {
    let raw: string;

    try {
        raw = await readFile(livePath(config, file), "utf8");
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
    }

    try {
        const parsed: unknown = JSON.parse(raw);
        if (isEnvelope(parsed)) return parsed;
    } catch {
        // unten
    }

    throw new PublicError(500, `Die gespeicherte Datei ${file} ist kaputt. Setz sie auf den Stand der Webseite zurück.`);
}

/** Der aktuelle Stand: die gespeicherte Datei, sonst der Standard, sonst `null`. */
export async function readContent(config: IConfig, file: string): Promise<Envelope | null> {
    return (await readLive(config, file)) ?? readDefault(config, file);
}

// Schreibvorgänge auf dieselbe Datei laufen nacheinander. Sonst lesen zwei
// gleichzeitige Speicherungen dieselbe Revision und beide kämen durch.
const queues = new Map<string, Promise<unknown>>();

function oneAtATime<T>(file: string, task: () => Promise<T>): Promise<T> {
    const run = (queues.get(file) ?? Promise.resolve()).then(task, task);

    queues.set(file, run.catch(() => undefined));

    return run;
}

/**
 * Speichert einen geprüften Inhalt. `expected` ist die Revision, die der
 * Editor geladen hat. Weicht sie ab, hat inzwischen jemand anderes gespeichert:
 * 409, und nichts wird überschrieben.
 */
export function writeContent(config: IConfig, file: string, expected: number, data: unknown, by: string): Promise<Envelope> {
    return oneAtATime(file, async () => {
        // Ohne gespeicherte Datei gilt der Standard, und der hat Revision 0.
        const current = (await readLive(config, file))?.revision ?? 0;

        if (current !== expected) {
            throw new PublicError(409, "Das hat inzwischen jemand anderes geändert. Lad den aktuellen Stand neu.");
        }

        const next: Envelope = { revision: current + 1, updatedAt: new Date().toISOString(), updatedBy: by, data };
        const target = livePath(config, file);
        const temporary = `${target}.${process.pid}-${Date.now()}.tmp`;

        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(temporary, JSON.stringify(next));
        await rename(temporary, target);

        return next;
    });
}

/** Löscht die gespeicherte Datei. Danach gilt wieder der Stand der Webseite. */
export function resetContent(config: IConfig, file: string): Promise<void> {
    return oneAtATime(file, async () => {
        try {
            await unlink(livePath(config, file));
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
    });
}

function isMeta(value: unknown): value is IContentMeta {
    if (typeof value !== "object" || value === null) return false;

    const meta = value as Record<string, unknown>;

    return ["categories", "statuses", "icons", "colors", "showcases"].every((key) => Array.isArray(meta[key]));
}

let meta: { readonly value: IContentMeta; readonly at: number } | null = null;

/**
 * Was ein Inhalt enthalten darf: Kategorien, Status, Symbole, Farben. Zehn
 * Minuten gemerkt. Ohne diese Liste prüft und speichert der Server nichts.
 */
export async function contentMeta(config: IConfig, now = Date.now()): Promise<IContentMeta> {
    if (meta && now - meta.at < META_TTL) return meta.value;

    const body = await fromWebsite(config, "content-default/meta.json");

    if (!isMeta(body)) {
        throw new PublicError(503, "Die Webseite liefert keine Liste ihrer Symbole und Farben. Ohne die speichert das Admin Dashboard keine Inhalte.");
    }

    meta = { value: body, at: now };

    return body;
}

/** Für die Checks: die gemerkte Liste vergessen. */
export function forgetMeta(): void {
    meta = null;
}

/**
 * Ob die Webseite antwortet und wann sie gebaut wurde. Für Übersicht und Status.
 *
 * Gefragt wird immer über HTTP: Im Betrieb ist WEBSITE_URL die öffentliche
 * Adresse, die Antwort kommt also durch nginx, wie bei jedem Besucher.
 * Der Zeitpunkt des Builds kommt bei WEBSITE_DIST von der Platte.
 */
export async function websiteStatus(config: IConfig): Promise<{ readonly online: boolean; readonly builtAt: string | null }> {
    const builtAtOf = (body: unknown): string | null => {
        const value = (body as { builtAt?: unknown } | null)?.builtAt;

        return typeof value === "string" ? value : null;
    };

    try {
        const live = await fromHttp(config, "version.json");
        const built = config.websiteDist === null ? live : await fromDisk(config.websiteDist, "version.json").catch(() => live);

        return { online: true, builtAt: builtAtOf(built) };
    } catch {
        return { online: false, builtAt: null };
    }
}
