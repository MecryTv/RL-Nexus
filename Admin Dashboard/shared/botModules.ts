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

/**
 * W-0135: Die Kategorien der Seite Module, dieselben wie auf der Webseite
 * (content-default/categories.json) und in derselben Reihenfolge. color ist der
 * Name der Farbe aus --c-mod-*, wie dort.
 */
export const BOT_MODULE_CATEGORIES = [
    { id: "always", label: "Immer dabei", color: "engagement" },
    { id: "rocket-league", label: "Rocket League", color: "competition" },
    { id: "community", label: "Community", color: "community" },
    { id: "support", label: "Support", color: "utility" },
    { id: "moderation", label: "Moderation", color: "moderation" },
    { id: "content", label: "Inhalte & Meldungen", color: "content" },
] as const;

/**
 * Module, die der Webseiten-Katalog (modules.json) nicht führt. Namen und Texte
 * wie im Bot-Dashboard (Discord Bot/src/dashboard/client/constants/Modules.ts),
 * die Kategorie in der Einteilung der Webseite.
 */
export const BOT_MODULE_FALLBACK: Readonly<Record<string, { readonly name: string; readonly category: string; readonly description: string }>> = {
    "rocket-roulette": { name: "Rocket Roulette", category: "rocket-league", description: "Roulette-Abend mit privaten Matches, Teams jede Runde neu gemischt." },
    "role-lists": { name: "Rollen-Listen", category: "community", description: "Listen, die zeigen, wer welche Rolle hat." },
    "anti-villain": { name: "Anti Villain", category: "moderation", description: "Hält gekaperte Accounts, Raids und Nukes auf." },
    backups: { name: "Backups", category: "always", description: "Module, Einstellungen, Nachrichten und Daten sichern und zurückholen." },
};

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
    /** W-0133: alle Werte aus MODULE_SETTINGS, fehlende mit Standard. */
    readonly values: Readonly<Record<string, number>>;
    /** W-0133: je Wert, ob Server „auf Anfrage änderbar“ sehen. */
    readonly askable: Readonly<Record<string, boolean>>;
    readonly updatedAt: string | null;
    readonly updatedBy: string | null;
}

export interface IBotModuleInput {
    readonly status: ModuleStatus;
    readonly notice: string | null;
    /** null: die gespeicherte Art bleibt. */
    readonly linkMode: LinkMode | null;
    /** Nur die übergebenen Schlüssel, der Rest bleibt. */
    readonly values: Readonly<Record<string, number>>;
    readonly askable: Readonly<Record<string, boolean>>;
}

/** W-0133: Abweichung eines Servers. null heißt jeweils: wie für alle. */
export interface IBotModuleOverride {
    readonly module: string;
    readonly guildId: string;
    readonly status: "on" | "off" | null;
    readonly notice: string | null;
    readonly linkMode: LinkMode | null;
    readonly values: Readonly<Record<string, number>>;
    readonly note: string | null;
    readonly updatedAt: string | null;
    readonly updatedBy: string | null;
}

export type IBotModuleOverrideInput = Pick<IBotModuleOverride, "status" | "notice" | "linkMode" | "values" | "note">;

/** W-0133: ein Eintrag im Verlauf. before/after: ganzer Stand des Bereichs (IBotModuleSetting oder IBotModuleOverride | null). */
export interface IBotModuleChange {
    readonly id: number;
    readonly module: string;
    readonly guildId: string | null;
    readonly before: unknown;
    readonly after: unknown;
    readonly kinds: readonly ("status" | "notice" | "values")[];
    readonly summary: string;
    readonly note: string | null;
    readonly userId: string;
    readonly userName: string;
    readonly botOk: boolean | null;
    readonly undoOf: number | null;
    readonly createdAt: string;
}

/** Ein Eintrag aus dem Protokoll zu einem Modul. */
export interface IBotModuleHistory {
    readonly at: string;
    readonly by: string;
    readonly detail: string;
}

/** Ein Modul, wie die Seite „Module“ es zeigt. Name, Kategorie und Text aus dem Webseiten-Katalog. */
export interface IBotModuleView extends IBotModuleSetting {
    readonly name: string;
    readonly category: string | null;
    readonly description: string | null;
    /** Server, auf denen das Modul eingeschaltet ist; bei RL Tracking und festen Modulen alle. */
    readonly servers: number;
    /** Die letzten Änderungen, neueste zuerst. */
    readonly history: readonly IBotModuleHistory[];
    /** W-0133: Server mit eigenem Wert bei diesem Modul. */
    readonly overrides: number;
    /** W-0133: Slash-Befehle des Moduls, etwa „/giveaway start“. */
    readonly commands: readonly string[];
    /** W-0133: nur bei RL Tracking: Epic-Verknüpfungen, davon nur per Name. */
    readonly links?: { readonly total: number; readonly byName: number };
}

export interface IBotModulesView {
    readonly modules: readonly IBotModuleView[];
    /** Wann der Bot den letzten Bescheid bestätigt hat. null: noch nie seit dem Start des Admins, oder der letzte kam nicht an. */
    readonly botSyncedAt: string | null;
    /** W-0133: Server mit Beta-Zugang laut Bot, null wenn er nicht antwortet. */
    readonly betaServers: number | null;
    /** W-0133: alle Server-Werte, für „Server mit eigenem Wert“. */
    readonly overrides: readonly IBotModuleOverride[];
    /** W-0133: der gewählte Server (?server=), sonst null. */
    readonly server: { readonly id: string; readonly name: string; readonly icon: string | null; readonly overrides: readonly IBotModuleOverride[] } | null;
}

export interface IBotModuleSaved {
    /** Der Wert für alle nach dem Speichern. */
    readonly setting: IBotModuleSetting;
    /** W-0133: nur beim Speichern für einen Server: dessen Stand, null wenn keine Abweichung mehr bleibt. */
    readonly override?: IBotModuleOverride | null;
    readonly changeId: number;
    /** true: Der Bot hat den Stand übernommen. false: nicht erreicht, er holt ihn in spätestens 5 Minuten. */
    readonly bot: boolean;
}

/** W-0133: Antwort auf Löschen eines Server-Werts und auf Zurücknehmen. */
export interface IBotModuleWritten {
    readonly changeId: number;
    readonly bot: boolean;
}

export interface IBotModuleChangePage {
    readonly entries: readonly IBotModuleChange[];
    readonly total: number;
}
