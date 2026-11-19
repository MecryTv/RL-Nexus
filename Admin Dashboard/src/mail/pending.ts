import type { IMailSummary } from "../../shared/api.ts";

/**
 * W-0141: Verschieben und „als ungelesen markieren“ zeigt die Liste sofort,
 * bevor der Server antwortet. Je UID steht hier, was unterwegs ist: "gone"
 * fällt aus der Liste, "unread" steht wieder fett.
 *
 * Ablauf (Review W-0141): start, dann done, sobald der Server ja sagt; der
 * Eintrag bleibt, bis die Liste frische Daten hat (fresh), dann zeigt sie
 * den Stand selbst. failed nimmt ihn sofort zurück. Öffnet man die Mail
 * wieder (opened), gilt ihr eigener Stand. Solange eine Aktion auf eine Mail
 * läuft, startet keine zweite: Ein Doppelklick schickt nur eine Anfrage.
 */
export type MailPending = "gone" | "unread";

interface IPendingEntry {
    readonly kind: MailPending;
    readonly phase: "sending" | "settling";
}

export type PendingState = ReadonlyMap<number, IPendingEntry>;

/** Eine Aktion beginnt. null: Auf diese Mail läuft schon eine. */
export function pendingStart(state: PendingState, uid: number, kind: MailPending): PendingState | null {
    if (state.get(uid)?.phase === "sending") return null;

    return new Map(state).set(uid, { kind, phase: "sending" });
}

/** Der Server hat ja gesagt: sichtbar, bis die Liste frische Daten hat. */
export function pendingDone(state: PendingState, uid: number): PendingState {
    const entry = state.get(uid);

    return entry ? new Map(state).set(uid, { ...entry, phase: "settling" }) : state;
}

function only(state: PendingState, keep: (uid: number, entry: IPendingEntry) => boolean): PendingState {
    const next = new Map([...state].filter(([uid, entry]) => keep(uid, entry)));

    return next.size === state.size ? state : next;
}

/** Der Server hat nein gesagt: Die Mail steht wieder wie vorher. */
export function pendingFailed(state: PendingState, uid: number): PendingState {
    return only(state, (entry) => entry !== uid);
}

/** Frische Daten der Liste: Was der Server bestätigt hat, zeigt sie jetzt selbst. Laufendes bleibt. */
export function pendingFresh(state: PendingState): PendingState {
    return only(state, (_uid, entry) => entry.phase === "sending");
}

/** Die Mail ist wieder offen: Ab jetzt gilt ihr eigener Stand. */
export function pendingOpened(state: PendingState, uid: number): PendingState {
    return only(state, (entry) => entry !== uid);
}

/** Der Stand gilt für einen Ordner (`key`, etwa "3-INBOX"); ein anderer Ordner beginnt leer. */
export interface IPendingStore {
    readonly key: string;
    readonly state: PendingState;
}

/**
 * Ein Schritt für den Ordner `key`. null: abgelehnt (etwa ein Doppelklick). Ändert der Schritt
 * nichts, kommt `stored` selbst zurück: Dann muss niemand neu zeichnen. Nachreview W-0141: Eine
 * späte Antwort aus einem Ordner, den man schon verlassen hat, ändert nichts und lässt damit den
 * Stand des neuen Ordners stehen.
 */
export function pendingStep(stored: IPendingStore, key: string, next: (state: PendingState) => PendingState | null): IPendingStore | null {
    const current = stored.key === key ? stored.state : new Map<number, IPendingEntry>();
    const updated = next(current);

    if (updated === null) return null;

    return updated !== current ? { key, state: updated } : stored;
}

export function withPending<T extends IMailSummary>(messages: readonly T[], pending: PendingState): readonly T[] {
    if (pending.size === 0) return messages;

    return messages.filter((entry) => pending.get(entry.uid)?.kind !== "gone").map((entry) => (pending.get(entry.uid)?.kind === "unread" ? { ...entry, seen: false } : entry));
}
