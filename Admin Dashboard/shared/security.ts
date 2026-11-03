/**
 * Dauerhafte Sperre (W-0057, Spec Teil 4): Bausteine, Vorgaben und was die
 * gesperrte Person liest. Gilt für Admin-Server, Oberfläche und (gespiegelt)
 * den Bot.
 */

/** Die fünf Bausteine einer Sperre (F2). */
export const BLOCKS = ["others", "own", "dashboard", "website", "shop"] as const;
export type Block = (typeof BLOCKS)[number];

export const BLOCK_LABELS: Readonly<Record<Block, string>> = {
    others: "Bot auf fremden Servern",
    own: "Eigene Server",
    dashboard: "Bot-Dashboard",
    website: "Webseite",
    shop: "Shop",
};

export const PRESETS = ["voll", "besitz", "eigene"] as const;
export type Preset = (typeof PRESETS)[number];

export const PRESET_LABELS: Readonly<Record<Preset, string>> = { voll: "Voll", besitz: "Nur Besitz", eigene: "Eigene Auswahl" };

/** Vorlagen für den Grund, nur fürs Team. */
export const BAN_REASONS = ["Raid", "Scam", "Belästigung", "Sperre umgangen", "Sonstiges"] as const;

/** Wo eine Anmeldung stattfand. */
export const SERVICES = ["dashboard", "website", "shop"] as const;
export type Service = (typeof SERVICES)[number];

export const SERVICE_LABELS: Readonly<Record<Service, string>> = { dashboard: "Bot-Dashboard", website: "Webseite", shop: "Shop" };

/** Die Bausteine einer Vorgabe. „eigene“ hat keine festen. */
export function scopeOf(preset: Exclude<Preset, "eigene">): Block[] {
    return preset === "voll" ? [...BLOCKS] : ["own", "dashboard", "shop"];
}

/** Bausteine in fester Reihenfolge, ohne Doppelte und Fremdes. */
export function normalScope(scope: readonly string[]): Block[] {
    return BLOCKS.filter((block) => scope.includes(block));
}

export function presetOf(scope: readonly string[]): Preset {
    const normal = normalScope(scope).join(",");

    if (normal === scopeOf("voll").join(",")) return "voll";
    if (normal === scopeOf("besitz").join(",")) return "besitz";

    return "eigene";
}

/** Sperrt dieser Umfang den Baustein? */
export function blocks(scope: readonly string[], block: Block): boolean {
    return scope.includes(block);
}

function joined(names: readonly string[]): string {
    return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} und ${names.at(-1)}`;
}

/**
 * Die Listen „Gesperrt“ und „Weiter nutzbar“ für DM und Sperrseite (S-B):
 * Bot auf beiden Arten von Servern als eine Zeile, die Webdienste
 * zusammengefasst. Bei „Weiter nutzbar“ alles in einer Zeile.
 */
export function dmLists(scope: readonly string[]): { readonly blocked: string[]; readonly usable: string[] } {
    const on = (block: Block): boolean => scope.includes(block);
    const blocked: string[] = [];
    const usable: string[] = [];

    if (on("others") && on("own")) blocked.push("Bot auf allen Servern", "Eigene Server");
    else {
        if (on("own")) blocked.push("Eigene Server");
        if (on("others")) blocked.push("Bot auf anderen Servern");
    }

    const web = (["dashboard", "website", "shop"] as const).filter(on).map((block) => BLOCK_LABELS[block]);
    if (web.length) blocked.push(joined(web));

    const free = [
        ...(on("others") ? [] : ["Bot auf anderen Servern"]),
        ...(on("own") ? [] : ["eigene Server"]),
        ...(["dashboard", "website", "shop"] as const).filter((block) => !on(block)).map((block) => BLOCK_LABELS[block]),
    ];

    if (free.length) usable.push(free.join(", "));

    return { blocked, usable };
}

/** Was Sperrseite und VPN-Seite über die Person zeigen (C4c, V-A+). */
export interface IBlockedView {
    readonly kind: "ban" | "vpn";
    readonly service: Service;
    readonly name: string;
    readonly avatar: string | null;
    /** Nur bei kind "ban": Bausteine, seit wann, wann zuletzt geändert. */
    readonly scope: readonly Block[];
    readonly since: string | null;
    readonly changedAt: string | null;
    /** Nur bei kind "vpn": wann geprüft. */
    readonly checkedAt: string;
}

/* Für die Oberfläche im Admin Dashboard (Bereich Sicherheit). */

export interface IPersonRefView {
    readonly id: string;
    readonly name: string;
    readonly avatar: string | null;
}

export interface IBanListItem {
    readonly id: number;
    readonly person: IPersonRefView;
    readonly scope: readonly Block[];
    readonly preset: Preset;
    readonly state: "active" | "lifted";
    readonly since: string;
    readonly by: string;
    /** Abgewiesene Anmeldungen und Verdachtsfälle mit Bezug zu dieser Sperre. */
    readonly hits: number;
}

export interface ISecurityOverview {
    readonly active: number;
    readonly suspects: number;
    readonly vpnToday: number;
    readonly bans: readonly IBanListItem[];
}

export interface IBanChangeView {
    readonly action: "ban" | "change" | "lift" | "server" | "evidence" | "dm";
    readonly before: string | null;
    readonly after: string | null;
    readonly note: string | null;
    readonly by: string;
    readonly at: string;
}

export interface IEvidenceView {
    readonly id: number;
    readonly kind: "file" | "discord";
    readonly name: string;
    readonly size: number;
    readonly mime: string | null;
    readonly message: Readonly<Record<string, unknown>> | null;
    readonly error: string | null;
    readonly at: string;
}

export interface IOwnServerView {
    readonly id: string;
    readonly name: string;
    readonly members: number;
    readonly since: string;
    /** „Bot verlässt“ steht für diesen Server. */
    readonly leave: boolean;
    readonly active: boolean;
    /** Die Person ist Owner. Nur dann gibt es den Schalter „Bot verlässt“, sonst hat sie den Server nur eingeladen. */
    readonly owner: boolean;
}

export interface IBanProfile extends IBanListItem {
    readonly reasons: readonly string[];
    readonly note: string | null;
    readonly changedAt: string | null;
    readonly liftedAt: string | null;
    readonly linkedTo: number | null;
    readonly changes: readonly IBanChangeView[];
    readonly evidence: readonly IEvidenceView[];
    readonly servers: readonly IOwnServerView[];
    readonly suspects: readonly ISuspectView[];
}

export interface ILinkedCandidate {
    readonly person: IPersonRefView;
    readonly reason: "same_ip" | "net" | "vpn";
    readonly accountDays: number;
}

export interface IPersonPrefill {
    readonly person: IPersonRefView;
    readonly handle: string | null;
    readonly accountDays: number;
    readonly team: boolean;
    readonly activeBan: number | null;
    /** Für den Knopf „Vorgeschichte“: frühere Sperren, Verdachtsfälle, Mod-Fälle und Ticket-Sperren auf allen Servern. */
    readonly history: { readonly bans: number; readonly suspects: number; readonly modCases: number; readonly ticketBlocks: number };
    readonly servers: readonly IOwnServerView[];
    readonly linked: readonly ILinkedCandidate[];
}

export interface ISuspectView {
    readonly id: number;
    readonly person: IPersonRefView;
    readonly kind: "same_ip" | "vpn_young" | "net";
    readonly service: Service;
    readonly state: "open" | "ok" | "banned";
    readonly banId: number | null;
    readonly banned: IPersonRefView | null;
    readonly accountDays: number;
    readonly at: string;
}

export interface IVpnLoginView {
    readonly person: IPersonRefView;
    readonly service: Service;
    readonly result: "in" | "marked" | "blocked" | "unchecked" | "banned";
    readonly reason: string | null;
    readonly at: string;
}

export interface IVpnView {
    readonly keySet: boolean;
    readonly lastAnswer: string | null;
    readonly logins: readonly IVpnLoginView[];
}

export const EVIDENCE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const EVIDENCE_MAX = 8 * 1024 * 1024;
