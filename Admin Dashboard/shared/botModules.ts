/**
 * W-0131: Was für alle Server gilt, je Modul des Bots. Server und Seite
 * „Module“ kennen dieselben Werte; der Bot liest die Tabelle
 * bot_module_settings. Wie shared/limits.ts nur wegstreichbare Syntax.
 *
 * Die Liste ist MODULE_IDS aus Discord Bot/src/constants/Modules.ts plus
 * rl-tracking (/rank, kein Server-Modul). npm run check:dashboard im Bot prüft,
 * dass beide übereinstimmen.
 */
export const BOT_MODULE_IDS = [
    "rl-6mans",
    "lft",
    "teams",
    "rank-roles",
    "clips",
    "matchups",
    "rocket-roulette",
    "role-lists",
    "moderation",
    "automod",
    "anti-villain",
    "logging",
    "welcome",
    "apply",
    "reaction-roles",
    "levels",
    "giveaways",
    "polls",
    "voice-hub",
    "tickets",
    "twitch-notifier",
    "youtube-notifier",
    "custom-message",
    "gallery",
    "backups",
    "rl-tracking",
] as const;

/** Gehören fest zum Bot, wie PERMANENT_MODULES dort: nur der Hinweis ist einstellbar. */
export const PERMANENT_BOT_MODULES = ["gallery", "backups", "levels"] as const;

export const MODULE_STATUSES = ["on", "beta", "off"] as const;
export type ModuleStatus = (typeof MODULE_STATUSES)[number];

export const MODULE_STATUS_LABELS: Readonly<Record<ModuleStatus, string>> = { on: "An", beta: "Nur Beta-Server", off: "Aus" };

/** Wie Mitglieder ihr Epic-Konto verbinden (nur rl-tracking). */
export const LINK_MODES = ["login", "name", "both"] as const;
export type LinkMode = (typeof LINK_MODES)[number];

export const LINK_MODE_LABELS: Readonly<Record<LinkMode, string>> = { login: "Epic-Anmeldung", name: "Nur Epic-Name", both: "Beides" };

export const NOTICE_MAX = 300;

/** Die Antwort für ein abgeschaltetes Modul ohne eigenen Hinweis. Derselbe Satz steht im Bot. */
export const CLOSED_TEXT = "Dieses Modul ist gerade abgeschaltet.";

export interface IBotModuleSetting {
    readonly module: string;
    readonly status: ModuleStatus;
    readonly notice: string | null;
    /** Nur bei rl-tracking gesetzt. */
    readonly linkMode: LinkMode | null;
    readonly updatedAt: string | null;
    readonly updatedBy: string | null;
}

export interface IBotModuleInput {
    readonly status: ModuleStatus;
    readonly notice: string | null;
    readonly linkMode: LinkMode | null;
}
