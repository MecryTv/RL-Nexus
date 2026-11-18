import type { IMailSummary } from "../../shared/api.ts";

/**
 * W-0141: Verschieben und „als ungelesen markieren“ zeigt die Liste sofort,
 * bevor der Server antwortet. Was gerade unterwegs ist, steht hier je UID:
 * "gone" fällt aus der Liste, "unread" steht wieder fett. Scheitert es, nimmt
 * der Lesebereich den Auftrag zurück und die Mail steht wieder wie vorher.
 */
export type MailPending = "gone" | "unread";

export function withPending<T extends IMailSummary>(messages: readonly T[], pending: ReadonlyMap<number, MailPending>): readonly T[] {
    if (pending.size === 0) return messages;

    return messages.filter((entry) => pending.get(entry.uid) !== "gone").map((entry) => (pending.get(entry.uid) === "unread" ? { ...entry, seen: false } : entry));
}
