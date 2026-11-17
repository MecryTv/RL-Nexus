import { IGiveawayRequirements, IGiveawaySettings } from "../interfaces/services/community/ICommunity";

/** Giveaways: Grenzen und Standardwerte. Siehe docs/Giveaways.md. */

export const GIVEAWAY_PREFIX = "giveaway";
export const GIVEAWAY_ACCENT = "#ffc53d";

export const MAX_PRIZE = 200;
export const MAX_GIVEAWAY_DESCRIPTION = 1500;
export const MAX_BONUS_TICKETS = 10;
/** Ein Giveaway läuft mindestens eine Minute. Gewinner, Laufzeit, Vorlauf und Bonus-Rollen kommen aus dem Admin (W-0133). */
export const MIN_GIVEAWAY_SECONDS = 60;
export const CLAIM_CHOICES = [0, 6, 12, 24, 48, 72, 168];

export function DefaultRequirements(): IGiveawayRequirements {
    return { roles: [], allRoles: false, forbidden: [], booster: "any", serverDays: 0, accountDays: 0, messages: 0, linked: false };
}

export function DefaultGiveawaySettings(): IGiveawaySettings {
    return { dm: true, claimHours: 24, ping: null, accent: null };
}
