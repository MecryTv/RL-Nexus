import { ChannelType, Guild } from "discord.js";
import BotClient from "../../../client/BotClient";
import { FieldKind, IPanelField } from "../SettingsModel";

/** Kanäle für Nachrichten. */
export const TEXT = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
/** Kanäle mit Text-Chat, auch Sprachkanäle - so viel nimmt das Speichern mancher Module an (isTextBased). */
export const CHAT = [...TEXT, ChannelType.GuildVoice];
/** Alles, was eine Ausnahme sein kann: jede Kanalart und Kategorien. Beiträge erben vom Kanal darüber. */
export const ANY_CHANNEL = [...TEXT, ChannelType.GuildVoice, ChannelType.GuildStageVoice, ChannelType.GuildCategory, ChannelType.GuildForum, ChannelType.GuildMedia];
/** Log-Ziele: ein Textkanal oder ein Beitrag, genau was IsLogTarget annimmt (utils/logtarget.ts). Private Threads nicht, die würde das Speichern still leeren. */
export const LOG = [...TEXT, ChannelType.PublicThread, ChannelType.AnnouncementThread];

/** Ein Feld in einer Zeile - die Register bleiben so lesbar wie eine Tabelle. */
export function F<S>(
    kind: FieldKind,
    key: string,
    label: string,
    hint: string,
    get: (settings: S) => unknown,
    set: (value: never, settings: S) => Record<string, unknown>,
    extra: Partial<IPanelField<S>> = {}
): IPanelField<S> {
    return { kind, key, label, hint, get, set: set as IPanelField<S>["set"], ...extra };
}

/* ----------------------------------------------------------
   Sonderfälle, die nicht über Save des Moduls laufen
   ---------------------------------------------------------- */
/** Die Moderatoren-Rollen stehen in den Server-Einstellungen und gelten für Moderation und Tickets. */
export const MODERATORS = "__moderators";
/** Tickets: der Panel-Kanal wird gesetzt, indem der Bot das Panel dorthin schickt. */
export const PANEL = "__panel";

export function ModeratorsField<S extends { teamRoles: string[] }>(): IPanelField<S> {
    return F<S>("roles", "moderators", "Moderatoren", "Rollen, die moderieren und alle Tickets sehen. Gilt für Moderation und Tickets.", (s) => s.teamRoles, (value: string[]) => ({ [MODERATORS]: value }), { max: 25 });
}

export async function TeamRoles(client: BotClient, guildId: string): Promise<string[]> {
    return (await client.settings.Of(guildId)).moderators.roles;
}

/** Wie die Seite Moderatoren im Dashboard: nur die Rollen ändern, einzelne User bleiben. */
export async function SaveModerators(client: BotClient, guild: Guild, roles: unknown): Promise<void> {
    const before = (await client.settings.Of(guild.id)).moderators;
    const after = client.ticketService.CleanModerators(guild, { users: before.users, roles });

    await client.settings.SaveModerators(guild.id, after);
    void client.ticketService.SyncModerators(guild, before, after);
}
