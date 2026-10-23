import { ChannelType } from "discord.js";
import { ILogCategory, ILogEventInfo, ILogSettings, LogCategoryId, LogTone } from "../interfaces/services/logging/ILogging";

/**
 * Logging System: der Katalog der Ereignisse. Diese Liste ist die Wahrheit -
 * das Dashboard baut seine Oberfläche daraus, der LogService prüft gegen sie,
 * und npm run check:logging hält beides zusammen. Siehe docs/Logging.md.
 */

export const LOGGING_MODULE = "logging";

export const MAX_IGNORE = 25;

/** Wie viel Text einer Nachricht in die Karte passt. */
export const MAX_CONTENT = 900;

export const LOG_CATEGORIES: readonly ILogCategory[] = [
    { id: "messages", name: "Messages", hint: "Gelöscht, bearbeitet, angepinnt, Reaktionen", icon: "#i-message" },
    { id: "members", name: "Members", hint: "Kommen, gehen, Namen, Rollen, Boosts", icon: "#i-users" },
    { id: "server", name: "Server", hint: "Kanäle, Rollen, Emojis, Termine, Webhooks", icon: "#i-settings" },
    { id: "voice", name: "Voice", hint: "Wer wo mitredet – und wer verschoben wird", icon: "#i-mic" },
    { id: "moderation", name: "Moderation", hint: "Bann, Kick, Timeout, AutoMod", icon: "#i-gavel" },
] as const;

/**
 * Alles, was ein Bot auf einem Server überhaupt mitbekommen kann. Was ein
 * Ereignis braucht, steht in "needs": das Members-Intent (privilegiert) oder
 * das Recht „Audit-Log ansehen" für die Frage, wer es war.
 */
export const LOG_EVENTS: readonly ILogEventInfo[] = [
    // ---------- Nachrichten ----------
    { key: "messageDelete", category: "messages", name: "Message Delete", hint: "Mit Text, Anhängen und – wenn möglich – wer gelöscht hat", needs: "audit" },
    { key: "messageEdit", category: "messages", name: "Message Edit", hint: "Vorher und nachher, mit Sprung zur Nachricht" },
    { key: "messageBulk", category: "messages", name: "Message Bulk Delete", hint: "Eine Karte je Aufräumaktion, nicht je Nachricht" },
    { key: "messagePin", category: "messages", name: "Message Pin", hint: "Wer im Kanal etwas angepinnt oder losgelöst hat", needs: "audit" },
    { key: "reactionAdd", category: "messages", name: "Reaction Add", hint: "Wer welches Emoji unter welche Nachricht setzt – auf großen Servern viel" },
    { key: "reactionRemove", category: "messages", name: "Reaction Remove", hint: "" },
    { key: "reactionClear", category: "messages", name: "Reaction Clear", hint: "Alle Reaktionen einer Nachricht auf einmal weg" },

    // ---------- Mitglieder ----------
    { key: "memberJoin", category: "members", name: "Member Join", hint: "Mit Alter des Kontos", needs: "members" },
    { key: "memberLeave", category: "members", name: "Member Leave", hint: "Wer von selbst geht – Kicks stehen unter Moderation", needs: "members" },
    { key: "memberNickname", category: "members", name: "Nickname Change", hint: "Vorher und nachher", needs: "members" },
    { key: "memberRoles", category: "members", name: "Role Change", hint: "Dazu und weg, mit dem, der es getan hat", needs: "members" },
    { key: "memberProfile", category: "members", name: "Profile Update", hint: "Discord-Name, Anzeigename oder Profilbild geändert", needs: "members" },
    { key: "memberBoost", category: "members", name: "Server Boost", hint: "Wer den Server boostet – und wer aufhört", needs: "members" },
    { key: "memberScreening", category: "members", name: "Membership Screening", hint: "Nur bei eingeschalteter Mitgliederprüfung", needs: "members" },

    // ---------- Server ----------
    { key: "channels", category: "server", name: "Channels", hint: "Angelegt, umbenannt, gelöscht", needs: "audit" },
    { key: "channelPerms", category: "server", name: "Channel Permissions", hint: "Wer in einem Kanal darf, was er vorher nicht durfte", needs: "audit" },
    { key: "roles", category: "server", name: "Roles", hint: "Angelegt, geändert, gelöscht", needs: "audit" },
    { key: "emojis", category: "server", name: "Emojis", hint: "Hinzugefügt, umbenannt, entfernt" },
    { key: "stickers", category: "server", name: "Stickers", hint: "Hinzugefügt, umbenannt, entfernt" },
    { key: "invites", category: "server", name: "Invites", hint: "Erstellt und abgelaufen" },
    { key: "threads", category: "server", name: "Threads", hint: "Angelegt und gelöscht" },
    { key: "threadUpdate", category: "server", name: "Thread Update", hint: "Umbenannt, archiviert, gesperrt" },
    { key: "guild", category: "server", name: "Server Settings", hint: "Name, Symbol, Banner, Stufe", needs: "audit" },
    { key: "webhooks", category: "server", name: "Webhooks", hint: "Angelegt, geändert, gelöscht", needs: "audit" },
    { key: "integrations", category: "server", name: "Integrations", hint: "Bots und Apps kommen dazu oder gehen", needs: "audit" },
    { key: "scheduled", category: "server", name: "Scheduled Events", hint: "Server-Events angelegt, geändert, abgesagt" },
    { key: "stage", category: "server", name: "Stage Instances", hint: "Eine Bühne geht auf oder zu" },

    // ---------- Sprache ----------
    { key: "voiceJoin", category: "voice", name: "Voice Join", hint: "" },
    { key: "voiceLeave", category: "voice", name: "Voice Leave", hint: "" },
    { key: "voiceMove", category: "voice", name: "Voice Move", hint: "Von wo nach wo" },
    { key: "voiceState", category: "voice", name: "Voice State", hint: "Vom Server stummgeschaltet, Stream oder Kamera an" },
    { key: "voiceForced", category: "voice", name: "Voice Moderation", hint: "Wenn ein Moderator jemanden aus dem Kanal holt", needs: "audit" },

    // ---------- Moderation ----------
    { key: "ban", category: "moderation", name: "Ban", hint: "Mit Grund und Moderator", needs: "audit" },
    { key: "unban", category: "moderation", name: "Unban", hint: "", needs: "audit" },
    { key: "kick", category: "moderation", name: "Kick", hint: "Der Bot unterscheidet Kick und freiwilliges Gehen am Audit-Log", needs: "audit" },
    { key: "timeout", category: "moderation", name: "Timeout", hint: "Gesetzt und wieder aufgehoben", needs: "members" },
    { key: "automodRule", category: "moderation", name: "AutoMod Rules", hint: "Regeln von Discords AutoMod angelegt, geändert, gelöscht", needs: "audit" },
    { key: "automodAction", category: "moderation", name: "AutoMod Action", hint: "Was AutoMod blockiert hat und warum" },
] as const;

export const LOG_EVENT_KEYS: readonly string[] = LOG_EVENTS.map((event) => event.key);

export function LogEvent(key: string): ILogEventInfo | undefined {
    return LOG_EVENTS.find((event) => event.key === key);
}

/** Die Farbe einer Karte: dazugekommen, weg, geändert. */
export const LOG_TONES: Record<LogTone, number> = {
    add: 0x3ba55c,
    remove: 0xed4245,
    change: 0x3b82f6,
};

export function DefaultLogSettings(): ILogSettings {
    const events: ILogSettings["events"] = {};

    // Alles an, aber ohne Ziel passiert nichts - erst ein Kanal macht ein
    // Ereignis sichtbar. So muss niemand vierzig Schalter umlegen, um anzufangen.
    for (const event of LOG_EVENTS) events[event.key] = { on: true, channelId: null };

    return {
        categories: { messages: null, members: null, server: null, voice: null, moderation: null },
        events,
        ignoreChannels: [],
        ignoreRoles: [],
        ignoreBots: true,
    };
}

/** Kürzt einen Text auf das, was in eine Karte passt. */
export function Shorten(text: string, max = MAX_CONTENT): string {
    const clean = text.trim();

    return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export function CategoryOf(key: string): LogCategoryId | null {
    return LogEvent(key)?.category ?? null;
}

/** Die Art eines Kanals auf Deutsch - ChannelType[type] waere "GuildText". */
const CHANNEL_KINDS: Record<number, string> = {
    [ChannelType.GuildText]: "Textkanal",
    [ChannelType.GuildVoice]: "Sprachkanal",
    [ChannelType.GuildCategory]: "Kategorie",
    [ChannelType.GuildAnnouncement]: "Ankündigungen",
    [ChannelType.GuildStageVoice]: "Bühne",
    [ChannelType.GuildForum]: "Forum",
    [ChannelType.GuildMedia]: "Medien",
};

export function ChannelKind(type: number): string {
    return CHANNEL_KINDS[type] ?? "Kanal";
}
