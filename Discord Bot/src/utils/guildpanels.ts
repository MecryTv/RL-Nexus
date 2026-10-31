import { Guild } from "discord.js";
import BotClient from "../client/BotClient";
import { TABLES, TableName } from "../constants/Database";
import { IApplyPanel } from "../interfaces/services/apply/IApply";
import logger from "./logger";

/**
 * Die Panels eines Servers: dauerhafte Nachrichten mit Knöpfen, mit denen
 * Mitglieder arbeiten. Gebraucht nach einem Zurückladen aus dem Admin
 * Dashboard (Spec Datenbank-Backups): Der Bot vergisst seinen Cache, löscht
 * Panels, die das Zurückladen entfernt hat, und postet fehlende neu.
 *
 * Eigene Nachrichten zählen nur mit Knöpfen und ohne Zeitplan, sonst würde
 * eine Ankündigung doppelt gepostet. Umfragen und Giveaways sind keine Panels.
 *
 * Plan 32 (Laden des Discord-Servers): dazu die Köder-Warnung von Anti Villain,
 * das LFT-Panel, das 6Mans-Panel und die Ankündigungen geplanter Matchups.
 * Keine Panels: Clips (die Nachrichten schreiben die Mitglieder selbst),
 * Runden-Meldungen von Clips und 6Mans, Stream-Karten, Umfragen, Giveaways.
 */

export interface IPanelRef {
    kind: "selfrole" | "ticket" | "voice" | "teams" | "team" | "message" | "apply" | "rolelist" | "bait" | "lft" | "sixmans" | "matchup";
    /** Die ID der Zeile, bei Ticket, Voice und Team-Übersicht der Name der Art. */
    key: string;
    channelId: string;
    messageId: string;
    label: string;
    /** Nur mit PanelsOf(…, true): die Daten hinter dem Panel als Text, um umgeschriebene IDs zu finden. */
    data?: string;
}

export interface IRestoreReport {
    reposted: string[];
    removed: string[];
    problems: string[];
}

/** Das Bewerbungs-Panel als Eintrag, wenn es liegt (Plan 24). */
export function ApplyPanelRef(panel: IApplyPanel): IPanelRef | null {
    return panel.channelId && panel.messageId ? { kind: "apply", key: "apply", channelId: panel.channelId, messageId: panel.messageId, label: "Bewerbungs-Panel" } : null;
}

/** Gesendete Rollen-Listen (Plan 29) - nach dem Zurückladen wie Panels behandelt. */
export async function RoleListPanels(client: BotClient, guildId: string): Promise<IPanelRef[]> {
    return (await client.roleLists.OfGuild(guildId))
        .filter((list) => list.channelId && list.messageId)
        .map((list) => ({ kind: "rolelist" as const, key: String(list.id), channelId: list.channelId!, messageId: list.messageId!, label: `Rollen-Liste „${list.name}“` }));
}

export async function PanelsOf(client: BotClient, guildId: string, withData = false): Promise<IPanelRef[]> {
    const panels: IPanelRef[] = [];
    const add = (panel: IPanelRef, source: unknown) => panels.push(withData ? { ...panel, data: JSON.stringify(source) } : panel);

    for (const panel of await client.selfRolePanels.OfGuild(guildId)) {
        if (panel.channelId && panel.messageId) add({ kind: "selfrole", key: String(panel.id), channelId: panel.channelId, messageId: panel.messageId, label: `Rollen-Panel „${panel.name}“` }, panel);
    }

    const tickets = await client.ticketSettings.Of(guildId);
    if (tickets.panel.channelId && tickets.panel.messageId) add({ kind: "ticket", key: "ticket", channelId: tickets.panel.channelId, messageId: tickets.panel.messageId, label: "Ticket-Panel" }, tickets);

    const applySettings = await client.applyService.Settings(guildId);
    const apply = ApplyPanelRef(applySettings.panel);
    if (apply) add(apply, applySettings);

    const voice = await client.voiceService.Settings(guildId);
    if (voice.panel === "channel" && voice.panelChannelId && voice.panelMessageId) {
        add({ kind: "voice", key: "voice", channelId: voice.panelChannelId, messageId: voice.panelMessageId, label: "Temp-Voice-Panel" }, voice);
    }

    const teams = await client.teamService.Settings(guildId);
    if (teams.channelId) {
        if (teams.messageId) add({ kind: "teams", key: "teams", channelId: teams.channelId, messageId: teams.messageId, label: "Team-Übersicht" }, teams);

        for (const team of await client.teams.OfGuild(guildId)) {
            if (team.message_id) add({ kind: "team", key: String(team.id), channelId: teams.channelId, messageId: team.message_id, label: `Team-Karte „${team.name}“` }, team);
        }
    }

    for (const message of await client.customMessages.OfGuild(guildId)) {
        if (message.buttons.length > 0 && message.schedule.mode === "off" && message.channelId && message.messageId) {
            add({ kind: "message", key: String(message.id), channelId: message.channelId, messageId: message.messageId, label: `Nachricht „${message.name}“` }, message);
        }
    }

    for (const list of await client.roleLists.OfGuild(guildId)) {
        if (list.channelId && list.messageId) add({ kind: "rolelist", key: String(list.id), channelId: list.channelId, messageId: list.messageId, label: `Rollen-Liste „${list.name}“` }, list);
    }

    const { bait } = await client.antiVillainService.Settings(guildId);
    if (bait.channelId && bait.messageId) add({ kind: "bait", key: "bait", channelId: bait.channelId, messageId: bait.messageId, label: "Warnung im Köder-Kanal" }, bait);

    // Das LFT-Panel ist ein Beitrag im Forum: sein Kanal ist der Beitrag selbst.
    const lft = await client.lookingForService.Settings(guildId);
    if (lft.panel.threadId) add({ kind: "lft", key: "lft", channelId: lft.panel.threadId, messageId: lft.panel.messageId ?? lft.panel.threadId, label: "LFT-Panel" }, lft);

    const mans = await client.sixMansService.Settings(guildId);
    if (mans.channelId && mans.panelMessageId) add({ kind: "sixmans", key: "sixmans", channelId: mans.channelId, messageId: mans.panelMessageId, label: "6Mans-Panel" }, mans);

    const matchupChannel = (await client.matchupService.Settings(guildId).catch(() => null))?.channelId ?? null;
    for (const matchup of matchupChannel ? await client.matchups.Announced(guildId) : []) {
        add({ kind: "matchup", key: String(matchup.id), channelId: matchupChannel!, messageId: matchup.messageId!, label: `Matchup-Ankündigung #${matchup.id}` }, matchup);
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
    // Fehlt der Beitrag des LFT-Panels, legt SendPanel im Forum einen neuen an.
    if (!channel && panel.kind === "lft") return "missing";
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
        case "apply":
            await client.applyService.SendPanel(guild, panel.channelId);
            return;
        case "rolelist":
            await client.roleListService.Send(guild, Number(panel.key));
            return;
        case "bait":
            await client.antiVillainService.SendBait(guild);
            return;
        case "lft":
            await client.lookingForService.SendPanel(guild);
            return;
        case "sixmans":
            await client.sixMansService.Panel(guild);
            return;
        case "matchup": {
            const matchup = await client.matchups.Get(Number(panel.key));
            if (matchup) await client.matchupService.Announce(guild, matchup);
            return;
        }
    }
}

/**
 * Ein Panel, das noch steht, mit den umgeschriebenen IDs neu zeichnen. Die
 * meisten Sende-Wege bearbeiten die vorhandene Nachricht. Temp-Voice sendet
 * nur neu: dort erst die alte Nachricht des Bots löschen.
 */
async function Redraw(client: BotClient, guild: Guild, panel: IPanelRef): Promise<void> {
    switch (panel.kind) {
        case "voice": {
            const channel = guild.channels.cache.get(panel.channelId);
            const old = channel?.isTextBased() ? await channel.messages.fetch(panel.messageId).catch(() => null) : null;

            if (old && old.author.id === client.user?.id) await old.delete();
            await client.voiceService.SendPanel(guild);
            return;
        }
        case "message": {
            const message = await client.customMessages.Get(Number(panel.key));
            if (message) await client.messageService.Update(guild, message);
            return;
        }
        case "bait":
            await client.antiVillainService.UpdateBait(guild);
            return;
        case "matchup": {
            const matchup = await client.matchups.Get(Number(panel.key));
            if (matchup) await client.matchupService.Refresh(guild, matchup);
            return;
        }
        default:
            await Repost(client, guild, panel);
    }
}

export async function AfterRestore(client: BotClient, guild: Guild, tables: readonly string[], before: readonly IPanelRef[] | null): Promise<IRestoreReport> {
    // Das Admin Dashboard hat an der Datenbank vorbei geschrieben: Cache dieser Tabellen weg.
    for (const table of tables) client.databaseService.Bump(table as TableName);

    // Rollen-Listen merken sich, welche Listen auf welche Rollen hören - das stimmt jetzt nicht mehr.
    client.roleListService.Forget(guild.id);

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
        // Das Bewerbungs-Panel bearbeitet sich an Ort und Stelle: so zeigt es wieder den Stand aus dem Backup (W-0020).
        // Die anderen senden neu - bei ihnen gäbe das ein zweites Panel.
        if (state === "ok" && panel.kind !== "apply") continue;

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

/**
 * Nach dem Laden des Discord-Servers (Plan 32): erst wie nach dem Zurückladen
 * fehlende Panels senden (jetzt mit den neuen Kanälen), dann jedes noch
 * stehende Panel neu zeichnen, dessen Daten eine gerade angelegte ID tragen.
 * Sonst trügen etwa die Knöpfe eines Rollen-Panels weiter die alten Rollen.
 */
export async function AfterServerRestore(client: BotClient, guild: Guild, remapped: ReadonlyMap<string, string>, before: readonly IPanelRef[] | null): Promise<{ reposted: string[]; redrawn: string[]; problems: string[] }> {
    // Das Admin Dashboard hat IDs in beliebigen Tabellen umgeschrieben: der ganze Cache weg.
    const first = await AfterRestore(client, guild, Object.values(TABLES), before);
    const fresh = [...new Set(remapped.values())];
    const done = new Set(first.reposted);
    const redrawn: string[] = [];
    const problems = [...first.problems];
    let teamsDone = done.has("Team-Übersicht und Karten");

    for (const panel of fresh.length ? await PanelsOf(client, guild.id, true) : []) {
        if (done.has(panel.label) || !fresh.some((id) => panel.data?.includes(id))) continue;

        if (panel.kind === "teams" || panel.kind === "team") {
            if (teamsDone) continue;
            teamsDone = true;
        }

        try {
            await Redraw(client, guild, panel);
            redrawn.push(panel.kind === "team" ? "Team-Übersicht und Karten" : panel.label);
        } catch (error) {
            problems.push(`${panel.label}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    return { reposted: first.reposted, redrawn, problems };
}
