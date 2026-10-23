import { Guild } from "discord.js";
import BotClient from "../client/BotClient";
import { TableName } from "../constants/Database";
import logger from "./logger";

/**
 * Die Panels eines Servers: dauerhafte Nachrichten mit Knöpfen, mit denen
 * Mitglieder arbeiten. Gebraucht nach einem Zurückladen aus dem Admin
 * Dashboard (Spec Datenbank-Backups): Der Bot vergisst seinen Cache, löscht
 * Panels, die das Zurückladen entfernt hat, und postet fehlende neu.
 *
 * Eigene Nachrichten zählen nur mit Knöpfen und ohne Zeitplan, sonst würde
 * eine Ankündigung doppelt gepostet. Umfragen und Giveaways sind keine Panels.
 */

export interface IPanelRef {
    kind: "selfrole" | "ticket" | "voice" | "teams" | "team" | "message";
    /** Die ID der Zeile, bei Ticket, Voice und Team-Übersicht der Name der Art. */
    key: string;
    channelId: string;
    messageId: string;
    label: string;
}

export interface IRestoreReport {
    reposted: string[];
    removed: string[];
    problems: string[];
}

export async function PanelsOf(client: BotClient, guildId: string): Promise<IPanelRef[]> {
    const panels: IPanelRef[] = [];

    for (const panel of await client.selfRolePanels.OfGuild(guildId)) {
        if (panel.channelId && panel.messageId) panels.push({ kind: "selfrole", key: String(panel.id), channelId: panel.channelId, messageId: panel.messageId, label: `Rollen-Panel „${panel.name}“` });
    }

    const ticket = (await client.ticketSettings.Of(guildId)).panel;
    if (ticket.channelId && ticket.messageId) panels.push({ kind: "ticket", key: "ticket", channelId: ticket.channelId, messageId: ticket.messageId, label: "Ticket-Panel" });

    const voice = await client.voiceService.Settings(guildId);
    if (voice.panel === "channel" && voice.panelChannelId && voice.panelMessageId) {
        panels.push({ kind: "voice", key: "voice", channelId: voice.panelChannelId, messageId: voice.panelMessageId, label: "Temp-Voice-Panel" });
    }

    const teams = await client.teamService.Settings(guildId);
    if (teams.channelId) {
        if (teams.messageId) panels.push({ kind: "teams", key: "teams", channelId: teams.channelId, messageId: teams.messageId, label: "Team-Übersicht" });

        for (const team of await client.teams.OfGuild(guildId)) {
            if (team.message_id) panels.push({ kind: "team", key: String(team.id), channelId: teams.channelId, messageId: team.message_id, label: `Team-Karte „${team.name}“` });
        }
    }

    for (const message of await client.customMessages.OfGuild(guildId)) {
        if (message.buttons.length > 0 && message.schedule.mode === "off" && message.channelId && message.messageId) {
            panels.push({ kind: "message", key: String(message.id), channelId: message.channelId, messageId: message.messageId, label: `Nachricht „${message.name}“` });
        }
    }

    return panels;
}

/** Weg sind die Panels von vorher, deren Nachricht nach dem Zurückladen zu keinem Panel mehr gehört. */
export function PanelDiff(before: readonly IPanelRef[], after: readonly IPanelRef[]): { remove: IPanelRef[]; keep: IPanelRef[] } {
    const now = new Set(after.map((panel) => panel.messageId));

    return { remove: before.filter((panel) => !now.has(panel.messageId)), keep: before.filter((panel) => now.has(panel.messageId)) };
}

/**
 * Was ein Fehler beim Holen einer Nachricht heißt. Weg ist sie nur bei
 * Unknown Message (10008). Fehlendes Recht oder ein Aussetzer bei Discord
 * heißt "unbekannt": neu posten wäre dann ein zweites Panel neben dem ersten.
 */
export function FetchState(error: unknown): "missing" | "unknown" {
    return (error as { code?: unknown } | null)?.code === 10008 ? "missing" : "unknown";
}

async function Exists(guild: Guild, panel: IPanelRef): Promise<"ok" | "missing" | "nochannel" | "unknown"> {
    const channel = guild.channels.cache.get(panel.channelId);
    if (!channel?.isTextBased()) return "nochannel";

    try {
        await channel.messages.fetch(panel.messageId);
        return "ok";
    } catch (error) {
        return FetchState(error);
    }
}

async function Repost(client: BotClient, guild: Guild, panel: IPanelRef): Promise<void> {
    switch (panel.kind) {
        case "selfrole":
            await client.selfRoleService.Send(guild, await client.selfRoleService.Panel(guild.id, Number(panel.key)));
            return;
        case "ticket":
            await client.ticketService.SendPanel(guild, panel.channelId);
            return;
        case "voice":
            await client.voiceService.SendPanel(guild);
            return;
        case "teams":
        case "team":
            await client.teamService.Publish(guild);
            return;
        case "message":
            await client.messageService.Send(guild, Number(panel.key));
            return;
    }
}

export async function AfterRestore(client: BotClient, guild: Guild, tables: readonly string[], before: readonly IPanelRef[] | null): Promise<IRestoreReport> {
    // Das Admin Dashboard hat an der Datenbank vorbei geschrieben: Cache dieser Tabellen weg.
    for (const table of tables) client.databaseService.Bump(table as TableName);

    const after = await PanelsOf(client, guild.id);
    const report: IRestoreReport = { reposted: [], removed: [], problems: [] };

    // Panels, die nach dem Backup angelegt wurden, gehören zu nichts mehr: ihre Knöpfe liefen ins Leere.
    for (const panel of before ? PanelDiff(before, after).remove : []) {
        const channel = guild.channels.cache.get(panel.channelId);
        const message = channel?.isTextBased() ? await channel.messages.fetch(panel.messageId).catch(() => null) : null;

        if (message && message.author.id === client.user?.id) {
            await message.delete().catch(() => null);
            report.removed.push(panel.label);
        }
    }

    // Team-Übersicht und Karten kommen mit einem Aufruf: nur einmal neu veröffentlichen.
    let teamsDone = false;

    for (const panel of after) {
        const state = await Exists(guild, panel);
        if (state === "ok") continue;

        if (state === "nochannel") {
            report.problems.push(`${panel.label}: Kanal gibt es nicht mehr`);
            continue;
        }

        if (state === "unknown") {
            report.problems.push(`${panel.label}: nicht prüfbar, bleibt, wie es ist`);
            continue;
        }

        if (panel.kind === "teams" || panel.kind === "team") {
            if (teamsDone) continue;
            teamsDone = true;
        }

        try {
            await Repost(client, guild, panel);
            report.reposted.push(panel.kind === "team" ? "Team-Übersicht und Karten" : panel.label);
        } catch (error) {
            report.problems.push(`${panel.label}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    logger.info(`💾 Nach dem Zurückladen auf ${guild.id}: ${report.reposted.length} neu gepostet, ${report.removed.length} gelöscht, ${report.problems.length} Probleme`);

    return report;
}
