import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Sitzung und Anmelde-Zustand als verschlüsselte Cookies.
 *
 * Wie im Bot (src/utils/seal.ts): AES-256-GCM verschlüsselt und signiert in
 * einem, ein verändertes Byte lässt das Öffnen scheitern. Einen
 * Sitzungsspeicher gibt es nicht, ein Neustart meldet also niemanden ab.
 */

export const SESSION_COOKIE = "rlnexus_admin";
export const STATE_COOKIE = "rlnexus_admin_state";

/** Sekunden. Danach einmal neu anmelden, dank prompt=none meist ein Klick. */
export const SESSION_TTL = 12 * 60 * 60;
export const STATE_TTL = 10 * 60;

/** Was im Sitzungs-Cookie steht. Die Rolle nicht: die kommt bei jeder Anfrage frisch aus Discord. */
export interface ISession {
    readonly id: string;
    readonly name: string;
    readonly avatar: string | null;
    /** Ablauf in Sekunden seit 1970. */
    readonly exp: number;
}

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/**
 * Der Bot leitet aus demselben SERVER_JWT_SECRET mit "rlorgs:seal:v1:" ab (der alte
 * Projektname, bleibt, sonst wären seine versiegelten Daten unlesbar).
 * Ein eigenes Präfix heißt: ein Cookie des einen öffnet beim anderen nichts.
 */
export const KEY_PREFIX = "rlnexus:admin-seal:v1:";

function keyFrom(secret: string): Buffer {
    return createHash("sha256").update(`${KEY_PREFIX}${secret}`).digest();
}

export function seal(value: unknown, secret: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, keyFrom(secret), iv);
    const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);

    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

/** null, sobald irgendetwas nicht stimmt. Ein kaputtes Cookie ist keine Ausnahme, sondern keine Sitzung. */
export function open<T>(sealed: string, secret: string): T | null {
    if (!sealed) return null;

    try {
        const raw = Buffer.from(sealed, "base64url");
        if (raw.length <= IV_LENGTH + TAG_LENGTH) return null;

        const decipher = createDecipheriv(ALGORITHM, keyFrom(secret), raw.subarray(0, IV_LENGTH));
        decipher.setAuthTag(raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH));

        const body = Buffer.concat([decipher.update(raw.subarray(IV_LENGTH + TAG_LENGTH)), decipher.final()]);

        return JSON.parse(body.toString("utf8")) as T;
    } catch {
        return null;
    }
}

/** Liest den Cookie-Header. Unsere Werte sind base64url und brauchen kein Dekodieren. */
export function parseCookies(header: string | undefined): Record<string, string> {
    const cookies: Record<string, string> = {};

    for (const part of (header ?? "").split(";")) {
        const index = part.indexOf("=");
        if (index <= 0) continue;

        cookies[part.slice(0, index).trim()] = part.slice(index + 1).trim();
    }

    return cookies;
}

export interface ICookieOptions {
    readonly path: string;
    /** Sekunden, 0 löscht das Cookie. */
    readonly maxAge: number;
    readonly secure: boolean;
}

/**
 * Der Wert eines Set-Cookie-Headers.
 *
 * SameSite=Lax statt Strict: bei Strict käme das Cookie beim Rücksprung von
 * Discord nicht mit, und der Login liefe im Kreis. Im Bot steht dasselbe.
 */
export function setCookie(name: string, value: string, { path, maxAge, secure }: ICookieOptions): string {
    const parts = [`${name}=${value}`, `Path=${path}`, `Max-Age=${maxAge}`, "HttpOnly", "SameSite=Lax"];
    if (secure) parts.push("Secure");

    return parts.join("; ");
}

export function clearCookie(name: string, path: string, secure: boolean): string {
    return setCookie(name, "", { path, maxAge: 0, secure });
}
