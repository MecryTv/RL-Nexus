import type { AccessMode } from "./shop.ts";

/**
 * Beta Access (Plan 22): ein dritter Modus neben Free und Paid Access. Ins
 * Bot-Dashboard kommt dann nur, wer einen Beta-Code eingelöst hat, dazu
 * Administrator und Developer. Wie shared/shop.ts nur wegstreichbare Syntax.
 */

/** Ohne 0, O, 1 und I: Codes werden abgetippt. */
export const BETA_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const BETA_LIMITS = { count: 50, uses: 1000, note: 190 } as const;

const CODE = /^NXB([A-HJ-NP-Z2-9]{4})([A-HJ-NP-Z2-9]{4})$/;

/** Ein getippter Code in der gespeicherten Form NXB-XXXX-XXXX. Groß, klein, Leerzeichen und Striche zählen nicht. Kein Code: null. */
export function normalizeCode(raw: unknown): string | null {
    if (typeof raw !== "string") return null;

    const match = CODE.exec(raw.toUpperCase().replace(/[\s-]/g, ""));

    return match ? `NXB-${match[1]}-${match[2]}` : null;
}

/** Ein neuer Code, zufällig aus BETA_CODE_ALPHABET (crypto.getRandomValues, im Browser wie in Node). */
export function newCode(): string {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    // 256 ist durch 32 teilbar: jeder Buchstabe gleich wahrscheinlich.
    const letters = [...bytes].map((byte) => BETA_CODE_ALPHABET[byte % BETA_CODE_ALPHABET.length]).join("");

    return `NXB-${letters.slice(0, 4)}-${letters.slice(4)}`;
}

export interface IBetaCode {
    readonly id: number;
    readonly code: string;
    readonly maxUses: number;
    readonly uses: number;
    readonly note: string | null;
    readonly createdAt: string;
    readonly createdBy: string | null;
    readonly revokedAt: string | null;
}

export interface IBetaTester {
    readonly userId: string;
    readonly name: string | null;
    readonly avatar: string | null;
    /** Der eingelöste Code. null: der Code wurde inzwischen gelöscht. */
    readonly code: string | null;
    readonly redeemedAt: string;
}

/** GET /api/beta */
export interface IBetaView {
    readonly mode: AccessMode;
    readonly changedAt: string | null;
    readonly codes: readonly IBetaCode[];
    readonly testers: readonly IBetaTester[];
}

export interface IBetaCodesInput {
    readonly count: number;
    readonly maxUses: number;
    readonly note: string | null;
}
