/**
 * W-0062 Teil 2: was die Webseite in der Bühne der Studios zurückmeldet
 * (Protokoll aus Teil 3 Task 9). Nur gültige Formen zählen; der Origin wird in
 * `PreviewStage` geprüft.
 */
export type StageAction = "hoch" | "runter" | "kopie" | "weg" | "aus";

export type StageEvent =
    | { readonly kind: "bereit" }
    | { readonly kind: "ungueltig" }
    | { readonly kind: "wahl"; readonly part: string }
    | { readonly kind: "aktion"; readonly part: string; readonly action: StageAction };

const PART = /^(?:kopf|titelbild|block:\d{1,3}|abschnitt:\d{1,3})$/;
const ACTIONS: readonly string[] = ["hoch", "runter", "kopie", "weg", "aus"];

const isPart = (value: unknown): value is string => typeof value === "string" && PART.test(value);

export function readStageMessage(data: unknown): StageEvent | null {
    if (typeof data !== "object" || data === null) return null;

    const message = data as { type?: unknown; part?: unknown; action?: unknown };

    switch (message.type) {
        case "rlnexus:vorschau-bereit":
            return { kind: "bereit" };
        case "rlnexus:vorschau-ungueltig":
            return { kind: "ungueltig" };
        case "rlnexus:vorschau-wahl":
            return isPart(message.part) ? { kind: "wahl", part: message.part } : null;
        case "rlnexus:vorschau-aktion":
            return isPart(message.part) && typeof message.action === "string" && ACTIONS.includes(message.action)
                ? { kind: "aktion", part: message.part, action: message.action as StageAction }
                : null;
        default:
            return null;
    }
}

/** „block:12“ → 12. Anderer Teil → null. */
export function partIndex(part: string, prefix: "block" | "abschnitt"): number | null {
    const match = new RegExp(`^${prefix}:(\\d{1,3})$`).exec(part);

    return match ? Number(match[1]) : null;
}
