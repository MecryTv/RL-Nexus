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
