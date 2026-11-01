import { ACTION_LABELS, MAX_ASKED, STAFF_MAX, STAFF_MIN } from "../../constants/StaffGrant";
import { StaffAccessMode } from "../../interfaces/services/staffgrant/IStaffGrant";

/** Ganze Minuten von 10 bis 24 Stunden. */
export function ValidMinutes(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value) && value >= STAFF_MIN && value <= STAFF_MAX;
}

/** „45 Min.“, „2 Std.“, „1:30“, „45“, „2h“, „1,5 Std.“ in Minuten. null, wenn es nichts davon ist oder außerhalb liegt. */
export function ParseDuration(text: string): number | null {
    const raw = text.trim().toLowerCase();
    const clock = /^(\d{1,2}):(\d{2})$/.exec(raw);
    let minutes: number | null = null;

    if (clock) {
        minutes = Number(clock[1]) * 60 + Number(clock[2]);
    } else {
        const plain = /^(\d+(?:[.,]\d+)?)\s*(m|min|minute|minuten|h|std|stunde|stunden)?\.?$/.exec(raw);

        if (plain) {
            const value = Number(plain[1].replace(",", "."));
            const hours = plain[2] !== undefined && /^(h|std|stunde|stunden)$/.test(plain[2]);

            minutes = Math.round(hours ? value * 60 : value);
        }
    }

    return ValidMinutes(minutes) ? minutes : null;
}

/**
 * Wer gefragt wird. Free: der Owner. Paid: der Owner, wenn er Zugang hat,
 * sonst die Verwalter mit eigenem Zugang. Beta: Owner und Verwalter mit
 * eingelöstem Code. ok sind die, die infrage kommen (Zugang bzw. Code).
 */
export function AskList(mode: StaffAccessMode, ownerId: string, managers: readonly string[], ok: ReadonlySet<string>): string[] {
    if (mode === "free") return [ownerId];
    if (mode === "paid" && ok.has(ownerId)) return [ownerId];

    const candidates = mode === "beta" ? [ownerId, ...managers] : managers;

    return [...new Set(candidates)].filter((id) => ok.has(id)).slice(0, MAX_ASKED);
}

/** „Level System › gespeichert“: Bereich und Aktion fürs Protokoll. */
export function ActionText(area: string, action: unknown): string {
    const key = typeof action === "string" ? action.trim() : "";

    return `${area} › ${key ? (ACTION_LABELS[key] ?? key) : "geändert"}`;
}
