export type StaffGrantStatus = "open" | "active" | "denied" | "expired" | "withdrawn" | "ended";
export type StaffPrivate = "none" | "asked" | "on" | "denied" | "removed";
/** Wie der Zugang gerade läuft: Bezahlschranke, frei oder Beta (siehe StaffGrantService.Askees). */
export type StaffAccessMode = "paid" | "free" | "beta";

/** Eine Anfrage von Staff und, nach dem Ja, die Freigabe selbst (W-0011). Zeiten in ms. */
export interface IStaffGrant {
    id: number;
    guildId: string;
    staffId: string;
    staffName: string;
    staffRole: "Developer" | "Admin";
    reason: string;
    /** Vorschlag von Staff, nach dem Ja die erteilte Dauer. */
    minutes: number;
    mode: StaffAccessMode;
    asked: string[];
    denied: string[];
    status: StaffGrantStatus;
    createdAt: number;
    expiresAt: number;
    answeredBy: string | null;
    startsAt: number | null;
    endsAt: number | null;
    /** null bei „Zeit abgelaufen“. */
    endedBy: string | null;
    endedAt: number | null;
    private: StaffPrivate;
    privateReason: string | null;
    privateAskedAt: number | null;
    privateDeniedAt: number | null;
    privateDenied: string[];
    privateBy: string | null;
    /** Die DM je Gefragtem, null wenn sie nicht ankam. */
    dms: Record<string, { channelId: string; messageId: string } | null>;
}

export interface IStaffLogEntry {
    id: number;
    grantId: number;
    guildId: string;
    at: number;
    area: string;
    text: string;
}
