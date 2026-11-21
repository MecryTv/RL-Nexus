import { IHubConfig, IVoiceSettings, VoiceAction } from "../interfaces/services/voice/IVoice";

/**
 * Temp Voice: die Optionen des Panels, Grenzen und Vorgaben. Was hier steht,
 * sieht der Nutzer genau so im Auswahlmenü. Siehe docs/Voice.md.
 */
export const VOICE_PREFIX = "voice";
export const VOICE_ACCENT = "#5865f2";

export const MAX_PRESETS = 5;
export const MAX_VOICE_NAME = 90;
export const MAX_LIMIT = 99;

/**
 * Die Auswahl im Panel - Reihenfolge, Text und Symbol wie hier. W-0151: deutsche
 * Namen wie bei den Presets, sortiert nach Kanal, Leute, Mehr. Discord-Menüs
 * kennen keine Zwischenüberschriften, deshalb steht der Bereich vorn in der
 * Beschreibung. Das Dashboard zeigt dieselben Namen (DashboardApiVoice).
 */
export const VOICE_ACTIONS: { name: string; value: VoiceAction; description: string; emoji: string }[] = [
    { name: "Umbenennen", value: "name", description: "Kanal · Neuer Name für den Kanal", emoji: "✏️" },
    { name: "Plätze", value: "userlimit", description: "Kanal · Wie viele hineindürfen", emoji: "👥" },
    { name: "Zutritt", value: "privacy", description: "Kanal · Öffentlich oder privat", emoji: "🔒" },
    { name: "Unsichtbar", value: "stealthmode", description: "Kanal · Kanal für andere aus- oder einblenden", emoji: "👻" },
    { name: "Region", value: "region", description: "Kanal · Sprachregion des Kanals", emoji: "🌐" },
    { name: "Einladen", value: "inviteuser", description: "Leute · Jemanden direkt einladen", emoji: "🔗" },
    { name: "Freigeben", value: "trustuser", description: "Leute · Darf auch in den privaten Kanal", emoji: "✅" },
    { name: "Freigabe entziehen", value: "untrustuser", description: "Leute · Freigabe wieder wegnehmen", emoji: "❌" },
    { name: "Rauswerfen", value: "kickuser", description: "Leute · Jemanden aus dem Kanal nehmen", emoji: "🚪" },
    { name: "Sperren", value: "blockuser", description: "Leute · Kommt nicht mehr hinein", emoji: "🚫" },
    { name: "Entsperren", value: "unblockuser", description: "Leute · Sperre aufheben", emoji: "🔓" },
    { name: "Übergeben", value: "transferownership", description: "Mehr · Kanal an jemand anderen geben", emoji: "🔄" },
    { name: "Kanal löschen", value: "deletechannel", description: "Mehr · Kanal sofort löschen", emoji: "🗑️" },
];

/** Was ins Menü kommt: alles außer Löschen, das hat einen eigenen roten Knopf. */
export const VOICE_MENU_ACTIONS = VOICE_ACTIONS.filter((entry) => entry.value !== "deletechannel");

export const VOICE_ACTION_VALUES = VOICE_ACTIONS.map((entry) => entry.value);

/** Welche Aktion wen braucht - danach richtet sich, was nach der Auswahl kommt. */
export const NEEDS_USER: VoiceAction[] = ["trustuser", "untrustuser", "inviteuser", "kickuser", "blockuser", "unblockuser", "transferownership"];

/** Discords Sprachregionen. Automatisch heißt: Discord sucht sie selbst aus. */
export const VOICE_REGIONS: [string, string][] = [
    ["", "Automatisch"],
    ["rotterdam", "Rotterdam"],
    ["frankfurt", "Frankfurt"],
    ["milan", "Mailand"],
    ["london", "London"],
    ["madrid", "Madrid"],
    ["stockholm", "Stockholm"],
    ["warsaw", "Warschau"],
    ["us-east", "USA Ost"],
    ["us-central", "USA Mitte"],
    ["us-west", "USA West"],
    ["brazil", "Brasilien"],
    ["singapore", "Singapur"],
    ["sydney", "Sydney"],
    ["japan", "Japan"],
    ["india", "Indien"],
    ["south-africa", "Südafrika"],
];

export const REGION_LABELS = new Map(VOICE_REGIONS);

export function DefaultVoiceSettings(): IVoiceSettings {
    return { name: null, limit: 0, privacy: "public", stealth: false, region: null, trusted: [], blocked: [] };
}

export function DefaultHubConfig(): IHubConfig {
    return {
        name: "{user}s Kanal",
        categoryId: null,
        defaults: DefaultVoiceSettings(),
        actions: [...VOICE_ACTION_VALUES],
        presets: true,
        support: false,
    };
}

/** "{user}s Kanal" wird zu "Laras Kanal". {nummer} zählt die offenen Kanäle des Hubs. */
export function FormatVoiceName(template: string, values: { user: string; number: number; game: string | null }): string {
    return (
        template
            .replaceAll("{user}", values.user)
            .replaceAll("{nummer}", String(values.number))
            .replaceAll("{spiel}", values.game ?? "Voice")
            .trim()
            .slice(0, MAX_VOICE_NAME) || values.user
    );
}
