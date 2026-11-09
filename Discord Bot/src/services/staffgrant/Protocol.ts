import { EXTEND_MIN } from "../../constants/StaffGrant";
import { IStaffChange, IStaffGrant, IStaffLogEntry, StaffAccessMode, StaffGrantStatus, StaffLogKind, StaffPrivate } from "../../interfaces/services/staffgrant/IStaffGrant";

/**
 * W-0049: eine Freigabe, wie die Seite „Protokoll“ im Server-Dashboard sie
 * zeigt. Freigaben von vor W-0049 haben Zeitpunkt der Verlängerung und der
 * privaten Erlaubnis nicht als Angabe - die stehen aber mit Uhrzeit als Satz
 * im Protokoll und werden dort gelesen. Was nirgends steht, bleibt null.
 */

/** id null: nur der Name aus einem alten Satz. */
export interface IProtocolPerson {
    id: string | null;
    name: string;
}

export interface IProtocolEntry {
    id: number;
    at: number;
    kind: StaffLogKind;
    area: string;
    text: string;
    changes: IStaffChange[];
    seconds: number | null;
}

export interface IProtocolGrant {
    id: number;
    status: StaffGrantStatus;
    reason: string;
    staff: { id: string; name: string; avatar: string | null; role: "Developer" | "Admin" };
    mode: StaffAccessMode;
    createdAt: number;
    /** Was Staff angefragt hat, null bei alten Freigaben. */
    requestedMinutes: number | null;
    /** Nach dem Ja die erteilte Dauer, sonst die angefragte. */
    minutes: number;
    asked: IProtocolPerson[];
    denied: IProtocolPerson[];
    answeredBy: IProtocolPerson | null;
    startsAt: number | null;
    endsAt: number | null;
    endedAt: number | null;
    endedBy: IProtocolPerson | null;
    extensions: { at: number; by: IProtocolPerson | null; minutes: number }[];
    private: {
        state: StaffPrivate;
        reason: string | null;
        askedAt: number | null;
        at: number | null;
        by: IProtocolPerson | null;
        deniedAt: number | null;
        removedAt: number | null;
        removedBy: IProtocolPerson | null;
    };
    /** Neueste zuerst. */
    log: IProtocolEntry[];
}

const EXTENDED = "Verlängert von ";
const ALLOWED = "Private Bereiche erlaubt von ";
const REMOVED = "Private Bereiche weggenommen von ";
const GRANTED_PRIVATE = /^Erteilt von (.+) für .+ · mit privaten Bereichen$/;

/** Der erste Freigabe-Satz, der mit prefix beginnt: Zeitpunkt und der Name dahinter (bis „ bis “). */
function said(log: readonly IStaffLogEntry[], prefix: string): { at: number; name: string } | null {
    const found = log.find((entry) => entry.kind === "grant" && entry.text.startsWith(prefix));

    if (!found) return null;

    const rest = found.text.slice(prefix.length);
    const until = rest.lastIndexOf(" bis ");

    return { at: found.at, name: until > 0 ? rest.slice(0, until) : rest };
}

export function ProtocolGrant(grant: IStaffGrant, log: readonly IStaffLogEntry[], name: (id: string) => string, avatar: (id: string) => string | null): IProtocolGrant {
    const person = (id: string | null | undefined): IProtocolPerson | null => (id ? { id, name: name(id) } : null);
    const oldest = [...log].sort((a, b) => a.at - b.at || a.id - b.id);
    const extensions =
        grant.extensions?.map((extension) => ({ at: extension.at, by: person(extension.by), minutes: extension.minutes })) ??
        oldest
            .filter((entry) => entry.kind === "grant" && entry.text.startsWith(EXTENDED))
            .map((entry) => ({ at: entry.at, by: { id: null, name: said([entry], EXTENDED)!.name }, minutes: EXTEND_MIN }));

    // Seit W-0049 eigene Angaben; davor überschrieb Wegnehmen privateBy, und der Zeitpunkt stand nur im Satz.
    const fresh = grant.privateRemovedBy !== undefined || grant.privateAt !== undefined;
    const allowed = said(oldest, ALLOWED);
    const atAnswer = oldest.find((entry) => entry.kind === "grant" && GRANTED_PRIVATE.test(entry.text));
    const removed = said(oldest, REMOVED);
    const open = grant.private === "on" || grant.private === "removed";
    const oldBy = allowed ? { id: null, name: allowed.name } : atAnswer ? { id: null, name: GRANTED_PRIVATE.exec(atAnswer.text)![1]! } : null;

    return {
        id: grant.id,
        status: grant.status,
        reason: grant.reason,
        staff: { id: grant.staffId, name: grant.staffName, avatar: avatar(grant.staffId), role: grant.staffRole },
        mode: grant.mode,
        createdAt: grant.createdAt,
        requestedMinutes: grant.requestedMinutes ?? null,
        minutes: grant.minutes,
        asked: grant.asked.map((id) => person(id)!),
        denied: grant.denied.map((id) => person(id)!),
        answeredBy: person(grant.answeredBy),
        startsAt: grant.startsAt,
        endsAt: grant.endsAt,
        endedAt: grant.endedAt,
        endedBy: person(grant.endedBy),
        extensions,
        private: {
            state: grant.private,
            reason: grant.privateReason,
            askedAt: grant.privateAskedAt,
            at: fresh ? (grant.privateAt ?? null) : open ? (allowed?.at ?? atAnswer?.at ?? null) : null,
            by: fresh ? person(grant.privateBy) : open ? (grant.private === "on" ? person(grant.privateBy) : oldBy) : null,
            deniedAt: grant.privateDeniedAt,
            removedAt: fresh ? (grant.privateRemovedAt ?? null) : (removed?.at ?? null),
            removedBy: fresh ? person(grant.privateRemovedBy) : removed ? { id: null, name: removed.name } : null,
        },
        log: [...oldest].reverse().map((entry) => ({ id: entry.id, at: entry.at, kind: entry.kind, area: entry.area, text: entry.text, changes: entry.changes, seconds: entry.seconds })),
    };
}
