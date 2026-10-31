import { CleanupMinutes, GuardId, IAntiVillainSettings, NukeAction, ShieldLevel } from "../interfaces/services/antivillain/IAntiVillain";

/**
 * Anti Villain (Plan 31): der Katalog der Wächter, die Schutzstufen und alle
 * Grenzen. Diese Liste ist die Wahrheit - der Dienst rechnet mit ihr, das
 * Dashboard baut seine Kacheln daraus, npm run check:antivillain hält beides
 * zusammen. Siehe docs/AntiVillain.md.
 */

export const ANTI_VILLAIN_MODULE = "anti-villain";

export interface IGuardInfo {
    id: GuardId;
    name: string;
    hint: string;
    icon: string;
    points: number;
}

export const GUARDS: readonly IGuardInfo[] = [
    { id: "hop", name: "Kanal-Sprung", hint: "Gleiche Nachricht oder gleiches Bild in 3 Kanälen binnen einer Minute.", icon: "#i-copy", points: 50 },
    { id: "scam", name: "Betrugslink", hint: "Bekannte Maschen und nachgemachte Seiten wie dlscord oder steamcommunlty.", icon: "#i-link", points: 40 },
    { id: "qr", name: "QR-Code im Bild", hint: "„Scann für Nitro“: Damit stehlen Betrüger Accounts. Der Bot liest QR-Codes in Bildern.", icon: "#i-image", points: 40 },
    { id: "lookalike", name: "Doppelgänger", hint: "Name oder Avatar fast wie bei einem Teammitglied.", icon: "#i-user-search", points: 60 },
    { id: "everyone", name: "@everyone-Versuch", hint: "Schreibt @everyone oder @here, ohne es zu dürfen.", icon: "#i-bell", points: 30 },
    { id: "report", name: "Meldungen", hint: "Mitglieder melden über „Apps → Hack melden“. Jede Meldung zählt, aber nur einmal je Person.", icon: "#i-shield-users", points: 25 },
    { id: "fresh", name: "Neuer Account", hint: "Discord-Account jünger als 7 Tage. Allein nie genug, zusammen mit einem Link schon.", icon: "#i-clock", points: 20 },
    { id: "sleeper", name: "Schläfer", hint: "90 Tage still, dann plötzlich Links.", icon: "#i-eye", points: 20 },
    { id: "bait", name: "Köder", hint: "Schreibt in den Köder-Kanal oder bekommt die Köder-Rolle.", icon: "#i-sparkle", points: 100 },
];

export const GUARD_IDS = GUARDS.map((guard) => guard.id) as readonly GuardId[];

export const LEVELS: Record<ShieldLevel, { report: number; hold: number | null }> = {
    locker: { report: 40, hold: null },
    normal: { report: 40, hold: 70 },
    streng: { report: 30, hold: 50 },
};

export const LEVEL_IDS = Object.keys(LEVELS) as ShieldLevel[];

export const NUKE_ACTIONS: readonly { id: NukeAction; label: string; icon: string; limit: number }[] = [
    { id: "channelDelete", label: "Kanäle löschen", icon: "#i-hash", limit: 3 },
    { id: "roleDelete", label: "Rollen löschen", icon: "#i-badge", limit: 3 },
    { id: "banKick", label: "Bannen oder kicken", icon: "#i-gavel", limit: 5 },
    { id: "webhook", label: "Webhooks anlegen", icon: "#i-link", limit: 2 },
    { id: "botAdd", label: "Bots einladen", icon: "#i-bot", limit: 1 },
    { id: "everyonePerms", label: "@everyone-Rechte ändern", icon: "#i-unlock", limit: 1 },
];

export const NUKE_LIMIT_RANGE = [1, 20] as const;
export const RAID_JOINS_RANGE = [5, 50] as const;
export const RAID_END_RANGE = [1, 120] as const;
export const CLEANUP_OPTIONS: readonly CleanupMinutes[] = [0, 10, 60, 1440];

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Punkte verfallen eine Stunde nach dem letzten Treffer, je Wächter zählt ein Treffer je Stunde. */
export const DECAY_MS = HOUR;
export const HOP_WINDOW_MS = MINUTE;
export const HOP_CHANNELS = 3;
/** Kürzere Texte geben keinen Fingerabdruck - „gg“ in drei Kanälen ist kein Hack. */
export const HOP_MIN_TEXT = 10;
export const QR_MAX_BYTES = 4 * 1024 * 1024;
export const QR_MAX_SIDE = 2000;
export const QR_MAX_IMAGES = 3;
export const NAME_SIMILAR = 0.85;
export const FRESH_MS = 7 * DAY;
export const SLEEPER_MS = 90 * DAY;
export const REPORT_COOLDOWN_MS = DAY;
export const RAID_WINDOW_MS = 30_000;
export const INVITE_PAUSE_MAX_MS = DAY;
export const RAID_SLOWMODE = 30;
export const NUKE_WINDOW_MS = 10 * MINUTE;
export const SAFETY_DEBOUNCE_MS = 10 * MINUTE;
export const TRUST_MS = 30 * DAY;
export const AUTO_RELEASE_MS = DAY;
export const PROTOCOL_KEEP_MS = 30 * DAY;
export const CASE_KEEP_MS = 30 * DAY;
export const DEBRIS_KEEP_MS = 7 * DAY;
export const NOTICE_MS = 30_000;
export const MAX_DELETED = 20;
export const MAX_DELETED_TEXT = 500;
export const MAX_TRUSTED = 25;

/**
 * Bekannte Betrugs-Domains. Wird mit dem Bot gepflegt: Kommt eine neue Masche
 * auf, gehört sie hier hinein. Nachgemachte Seiten fängt zusätzlich BRANDS.
 */
export const SCAM_DOMAINS: readonly string[] = [
    "steamcommunlty.com",
    "steamcommnuity.com",
    "stearncommunity.com",
    "steamcomminuty.com",
    "discordgift.site",
    "discord-nitro.gift",
    "dlscord-nitro.com",
    "discord-airdrop.com",
    "nitro-discord.com",
    "free-nitro.gift",
    "discordnitro.gift",
    "epicgames-gift.com",
];

/** Echte Marken. Wer ihnen bis auf ein, zwei Zeichen gleicht, ohne es zu sein, ist nachgemacht. */
export const BRANDS: readonly string[] = ["discord.com", "discord.gg", "discordapp.com", "discord.media", "steamcommunity.com", "steampowered.com", "epicgames.com", "rocketleague.com"];

/** Was hinter einem Namen steht, gehört nicht zum Namen: „Tim | Admin“ ist Tim. */
export const STAFF_WORDS: readonly string[] = ["admin", "administrator", "mod", "moderator", "support", "team", "staff", "owner", "official", "offiziell", "helper"];

/** Wörtlich aus der Spec. */
export const TEAM_ONLY = "Das entscheidet das Team.";
export const MODULE_OFF = "Anti Villain ist auf diesem Server aus.";

export function DefaultAntiVillainSettings(): IAntiVillainSettings {
    return {
        level: "normal",
        guards: Object.fromEntries(GUARD_IDS.map((id) => [id, true])) as Record<GuardId, boolean>,
        team: "report",
        trustedRoles: [],
        quarantine: { roleId: null, channelId: null, stripRoles: true, cleanup: 60, dm: true, release: "team" },
        bait: { channel: true, channelId: null, role: false, roleId: null, messageId: null },
        raid: { on: true, joins: 10, invites: true, slowmode: true, hold: true, ping: true, verification: false, endMinutes: 15 },
        nuke: { on: true, limits: Object.fromEntries(NUKE_ACTIONS.map((action) => [action.id, action.limit])) as Record<NukeAction, number>, trustedBots: [] },
        logChannelId: null,
        pingRoleId: null,
    };
}
