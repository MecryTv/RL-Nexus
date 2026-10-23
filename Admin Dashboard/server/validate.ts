import { isSafeLink } from "../shared/links.ts";
import { SNOWFLAKE } from "../shared/limits.ts";
import { InvalidInput } from "./errors.ts";

/**
 * Prüfungen für alles, was von außen kommt. Jede Funktion gibt den sauberen
 * Wert zurück oder wirft InvalidInput mit einem Satz, der so in der
 * Oberfläche stehen kann.
 */

/** Das JSON-Objekt im Body. */
export function body(value: unknown): Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new InvalidInput("Die Anfrage braucht ein JSON-Objekt.");

    return value as Record<string, unknown>;
}

/** Ein Text, getrimmt. Fehlt er, zählt er als leer. */
export function text(value: unknown, label: string, { min = 0, max }: { readonly min?: number; readonly max: number }): string {
    const raw = value ?? "";
    if (typeof raw !== "string") throw new InvalidInput(`${label} muss Text sein.`);

    const trimmed = raw.trim();

    if (trimmed.length < min) throw new InvalidInput(min <= 1 ? `${label} fehlt.` : `${label} braucht mindestens ${min} Zeichen.`);
    if (trimmed.length > max) throw new InvalidInput(`${label} darf höchstens ${max} Zeichen lang sein.`);

    return trimmed;
}

export function snowflake(value: unknown, label = "Die Discord-ID"): string {
    if (typeof value !== "string" || !SNOWFLAKE.test(value)) throw new InvalidInput(`${label} besteht aus 17 bis 20 Ziffern.`);

    return value;
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
    if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
        throw new InvalidInput(`${label} ist keiner der erlaubten Werte.`);
    }

    return value as T;
}

/** Eine positive ganze Zahl aus der Adresse, etwa die ID einer Kontaktnachricht. */
export function id(value: unknown): number {
    const parsed = typeof value === "string" && /^\d{1,10}$/.test(value) ? Number(value) : Number.NaN;

    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 4_294_967_295) throw new InvalidInput("Die ID ist ungültig.");

    return parsed;
}

/** Ein optionaler Link. Leer heißt null. */
export function link(value: unknown, label: string, max: number): string | null {
    const href = text(value, label, { max });
    if (href === "") return null;
    if (!isSafeLink(href)) throw new InvalidInput(`${label} muss mit https:// oder mit / beginnen.`);

    return href;
}
