import { COOLDOWN_MS, EXTEND_MIN, REASON_MAX, REQUEST_TTL_MS, STAFF_MAX } from "../../constants/StaffGrant";
import { IStaffGrant } from "../../interfaces/services/staffgrant/IStaffGrant";
import { ValidMinutes } from "./Rules";

/**
 * Der Ablauf einer Staff-Freigabe als reine Funktionen: jede nimmt den Stand,
 * gibt eine neue Kopie zurück oder wirft einen Satz, den der Nutzer lesen kann.
 * Gespeichert und gemeldet wird in StaffGrantService.
 */
export class StaffGrantError extends Error {}

const MIN = 60_000;
const CLOCK = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });

function fail(message: string): never {
    throw new StaffGrantError(message);
}

function needAsked(g: IStaffGrant, userId: string): void {
    if (!g.asked.includes(userId)) fail("Diese Anfrage ist nicht an dich.");
}

function needActive(g: IStaffGrant): void {
    if (g.status !== "active") fail("Die Freigabe läuft nicht.");
}

function needReason(reason: string): string {
    const text = reason.trim();

    if (!text) fail("Bitte gib einen Grund an.");
    if (text.length > REASON_MAX) fail(`Der Grund darf höchstens ${REASON_MAX} Zeichen haben.`);

    return text;
}

/** Ja oder Nein auf die Anfrage. Das erste Ja gibt frei, abgelehnt erst, wenn alle Nein gesagt haben. */
export function Answer(g: IStaffGrant, userId: string, yes: boolean, minutes: number, allowPrivate: boolean, now: number): IStaffGrant {
    if (g.status !== "open") fail("Schon beantwortet.");
    if (now >= g.expiresAt) fail("Die Anfrage ist schon verfallen.");

    needAsked(g, userId);

    if (!yes) {
        const denied = [...new Set([...g.denied, userId])];
        const all = g.asked.every((id) => denied.includes(id));

        return { ...g, denied, ...(all ? { status: "denied" as const, endedAt: now } : {}) };
    }

    if (!ValidMinutes(minutes)) fail("Bitte 10 Minuten bis 24 Stunden.");

    const asked = g.private === "asked";

    return {
        ...g,
        status: "active",
        minutes,
        answeredBy: userId,
        startsAt: now,
        endsAt: now + minutes * MIN,
        private: asked ? (allowPrivate ? "on" : "denied") : g.private,
        privateBy: asked && allowPrivate ? userId : g.privateBy,
        privateDeniedAt: asked && !allowPrivate ? now : g.privateDeniedAt,
    };
}

/** Was die Zeit erledigt: verfallene Anfrage, abgelaufene Freigabe, verfallene späte private Anfrage. null = nichts. */
export function Tick(g: IStaffGrant, now: number): IStaffGrant | null {
    if (g.status === "open" && now >= g.expiresAt) return { ...g, status: "expired", endedAt: now };
    if (g.status !== "active") return null;
    if (g.endsAt !== null && now >= g.endsAt) return { ...g, status: "ended", endedBy: null, endedAt: g.endsAt };

    if (g.private === "asked" && g.privateAskedAt !== null && now >= g.privateAskedAt + REQUEST_TTL_MS) {
        return { ...g, private: "none", privateReason: null, privateDenied: [] };
    }

    return null;
}

/** +30 Min., zusammen höchstens 24 Stunden. */
export function Extend(g: IStaffGrant, _now: number): IStaffGrant {
    needActive(g);

    const cap = g.startsAt! + STAFF_MAX * MIN;

    if (g.endsAt! >= cap) fail("Mehr als 24 Stunden geht nicht.");

    return { ...g, endsAt: Math.min(g.endsAt! + EXTEND_MIN * MIN, cap) };
}

export function End(g: IStaffGrant, by: string, now: number): IStaffGrant {
    needActive(g);

    return { ...g, status: "ended", endedBy: by, endedAt: now };
}

/** Staff zieht eine offene Anfrage zurück. */
export function Withdraw(g: IStaffGrant, now: number): IStaffGrant {
    if (g.status !== "open") fail("Die Anfrage ist nicht mehr offen.");

    return { ...g, status: "withdrawn", endedAt: now };
}

/** Staff fragt während der Freigabe die privaten Bereiche an. */
export function AskPrivate(g: IStaffGrant, reason: string, now: number): IStaffGrant {
    needActive(g);

    if (g.private === "on") fail("Die privaten Bereiche sind schon offen.");
    if (g.private === "asked") fail("Die privaten Bereiche sind schon angefragt.");
    if (g.private === "denied" && g.privateDeniedAt !== null && now < g.privateDeniedAt + COOLDOWN_MS) {
        fail(`Nach einem Nein geht die nächste Anfrage erst um ${CLOCK.format(g.privateDeniedAt + COOLDOWN_MS)}.`);
    }

    return { ...g, private: "asked", privateReason: needReason(reason), privateAskedAt: now, privateDenied: [] };
}

export function AnswerPrivate(g: IStaffGrant, userId: string, yes: boolean, now: number): IStaffGrant {
    needActive(g);
    needAsked(g, userId);

    if (g.private !== "asked") fail("Schon beantwortet.");
    if (yes) return { ...g, private: "on", privateBy: userId };

    const privateDenied = [...new Set([...g.privateDenied, userId])];
    const all = g.asked.every((id) => privateDenied.includes(id));

    return { ...g, privateDenied, ...(all ? { private: "denied" as const, privateDeniedAt: now } : {}) };
}

/** Nur die privaten Bereiche schließen, die Freigabe läuft weiter. */
export function RemovePrivate(g: IStaffGrant, by: string): IStaffGrant {
    needActive(g);

    if (g.private !== "on") fail("Die privaten Bereiche sind nicht offen.");

    return { ...g, private: "removed", privateBy: by };
}

/**
 * Darf dieser Staff eine neue Anfrage stellen? grants sind die dieses Servers.
 * null heißt ja, sonst der Satz, warum nicht.
 */
export function CanRequest(grants: readonly IStaffGrant[], staffId: string, now: number): string | null {
    const open = grants.find((g) => g.status === "open");
    if (open) return "Gerade läuft schon eine Anfrage für diesen Server.";

    const active = grants.find((g) => g.status === "active");
    if (active) return `${active.staffName} bearbeitet diesen Server gerade.`;

    const last = grants
        .filter((g) => g.status === "denied" && g.staffId === staffId && g.endedAt !== null)
        .reduce<number | null>((latest, g) => Math.max(latest ?? 0, g.endedAt!), null);

    if (last !== null && now < last + COOLDOWN_MS) return `Nach einem Nein geht die nächste Anfrage erst um ${CLOCK.format(last + COOLDOWN_MS)}.`;

    return null;
}

/** Für die Prüfung beim Anlegen: Grund und Dauer der neuen Anfrage. */
export function CheckRequest(reason: string, minutes: unknown): string {
    if (!ValidMinutes(minutes)) fail("Bitte 10 Minuten bis 24 Stunden.");

    return needReason(reason);
}
