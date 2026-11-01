import {
    AuditLogEvent,
    AutocompleteInteraction,
    ButtonInteraction,
    ChatInputCommandInteraction,
    Guild,
    InteractionEditReplyOptions,
    InteractionReplyOptions,
    InteractionUpdateOptions,
    LabelBuilder,
    Message,
    MessageCreateOptions,
    MessageEditOptions,
    MessageFlags,
    ModalBuilder,
    ModalSubmitInteraction,
    PermissionFlagsBits,
    TextInputBuilder,
    TextInputStyle,
} from "discord.js";
import BotClient from "../client/BotClient";
import { AutoFailedCard, AutomaticReply, BackupLabel, BackupReply, ChoiceLabel, CompareReply, CreatedReply, DayLabel, DoneCard, ListReply, LoadConfirm, Note, RunningCard, SafetyNotice, Strip } from "../builder/ServerBackupView";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import { BACKUPS_MODULE, DEBRIS_WINDOW_MS, DefaultBackupSettings, IBackupSettings, SERVER_PART_IDS, SNAPSHOT_WAIT_MS } from "../constants/ServerBackup";
import { IBackupInfo, IBackupMeta, IBackupPlanState, IProtect, IServerBackupList, IRestoreJob, IRestoreLine, IRestorePlan, IRestoreReport, IServerSnapshot, RestoreMode, ServerPart } from "../interfaces/services/serverbackup/IServerBackup";
import { AskAdmin, IBackupCall } from "../routes/DashboardApiBackups";
import { AfterServerRestore } from "../utils/guildpanels";
import logger from "../utils/logger";
import { IsLogTarget } from "../utils/logtarget";
import { DiffSnapshots } from "./serverbackup/Diff";
import { FilterIdMap, MapSnapshot } from "./serverbackup/IdMap";
import { PlanRestore } from "./serverbackup/Plan";
import { ImageKind, RunOps } from "./serverbackup/Runner";
import { ReadSnapshot } from "./serverbackup/Snapshot";

/**
 * Backups für den Discord-Server (Plan 32): den Server lesen, Laden als Auftrag
 * abarbeiten, Karten im Meldekanal, Einstellungen des Backup-Moduls.
 * Siehe docs/Backups.md.
 */

type Actor = { id: string; name: string };

export interface IStartInput {
    guild: Guild;
    /** Bei „Auf einen anderen Server“ das Ziel, sonst gleich guild. */
    target: Guild;
    actor: Actor;
    backupId: number;
    mode: RestoreMode;
    parts: ServerPart[];
    areas: string[];
    confirm: string;
}

/** Den Server lesen und ein Laden beginnen dauert: Das Admin Dashboard fragt dabei selbst beim Bot nach. */
const SLOW = 120_000;
const QUICK = 10_000;
/** Die Karte im Meldekanal wird höchstens so oft bearbeitet. */
const CARD_EVERY_MS = 5_000;
/** So lange dauert ein Schritt im Mittel, für „noch etwa“. */
const STEP_MS = 1_500;
const UNREACHABLE = "Backups sind gerade nicht erreichbar. Versuch es gleich noch einmal.";
/** Was der Bot zum Laden braucht, mit dem Namen, den Discord zeigt. */
const NEEDED: readonly (readonly [bigint, string])[] = [
    [PermissionFlagsBits.ManageRoles, "Rollen verwalten"],
    [PermissionFlagsBits.ManageChannels, "Kanäle verwalten"],
    [PermissionFlagsBits.ManageGuild, "Server verwalten"],
    [PermissionFlagsBits.ManageGuildExpressions, "Ausdrücke verwalten"],
    [PermissionFlagsBits.BanMembers, "Mitglieder bannen"],
    [PermissionFlagsBits.ViewAuditLog, "Audit-Log ansehen"],
];

function ErrorOf(answer: { body: unknown }): string {
    const error = (answer.body as { error?: unknown } | null)?.error;

    return typeof error === "string" ? error : UNREACHABLE;
}

function EmptyReport(): IRestoreReport {
    return { lines: [], reposted: [], redrawn: [], remapped: 0, problems: [] };
}

export default class ServerBackupService {
    private readonly client: BotClient;
    /** Aufträge, die dieser Prozess gerade abarbeitet. */
    private readonly runs = new Map<number, Promise<void>>();
    /** Aufträge, die beim nächsten Schritt anhalten sollen. */
    private readonly stopping = new Set<number>();
    /**
     * Server, für die gerade ein Laden beginnt: Zwischen Lock und dem Anlegen des Auftrags liegt der Aufruf beim Admin Dashboard.
     * ponytail: Sperre im Prozess, reicht für den einen Bot; bei mehreren Shards eine Sperre in der Datenbank.
     */
    private readonly starting = new Set<string>();

    constructor(client: BotClient) {
        this.client = client;
    }

    /** Ein Aufruf an das Admin Dashboard für diesen Server. Eigene Methode, damit die Checks sie ersetzen können. */
    AskBackups(guild: Guild, actor: Actor, call: IBackupCall): Promise<{ status: number; body: unknown }> {
        return AskAdmin(this.client.config.ADMIN_INTERNAL_URL, this.client.config.SERVER_JWT_SECRET, guild.id, actor, guild.name, call);
    }

    /** Für Aufrufe, die nur lesen: der Bot selbst. */
    private Self(): Actor {
        return { id: this.client.user?.id ?? "0", name: "Backups" };
    }

    DashboardUrl(guildId: string, backupId?: number): string {
        const base = `${this.client.server.BaseURL}${DASHBOARD_PATH}/guild/${guildId}`;

        return backupId === undefined ? `${base}/backups` : `${base}/meine-backups?backup=${backupId}`;
    }

    /** Eine Karte in den Meldekanal der Backups; ohne ihn in fallback (etwa den von Anti Villain), sonst nirgends. */
    private async Notify(guild: Guild, message: MessageCreateOptions, fallback: string | null = null): Promise<void> {
        const channelId = (await this.Settings(guild.id)).logChannelId ?? fallback;
        const channel = channelId ? guild.channels.cache.get(channelId) : undefined;

        if (channel && IsLogTarget(channel) && "send" in channel) await channel.send(message).catch(() => undefined);
    }

    /** „Gesichert vor dem Anti-Nuke“: die kleine Karte unter der von Anti Villain. why: „Name: was“. */
    async SafetyNotice(guild: Guild, input: { at: number; why: string; backupId: number }): Promise<void> {
        const split = input.why.indexOf(": ");
        const [who, why] = split > 0 ? [input.why.slice(0, split), input.why.slice(split + 2)] : ["", input.why];
        const av = await this.client.antiVillainService.Settings(guild.id);

        await this.Notify(guild, SafetyNotice({ at: input.at, who, why, compareUrl: this.DashboardUrl(guild.id, input.backupId) }), av.logChannelId);
    }

    /** „Backup nur halb“: nur in den Meldekanal der Backups. Klappt alles, kommt keine Meldung. */
    async BackupFailed(guild: Guild, reason: string): Promise<void> {
        await this.Notify(guild, AutoFailedCard({ at: Date.now(), reason, dashboardUrl: this.DashboardUrl(guild.id) }));
    }

    /** Ein Bild für das Backup holen. Eigene Methode, damit die Checks sie ersetzen können. */
    async FetchImage(url: string): Promise<Buffer> {
        const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });

        if (!response.ok) throw new Error(`Bild nicht geladen (${response.status})`);

        return Buffer.from(await response.arrayBuffer());
    }

    /** Kanäle, die der Bot selbst anlegt und wieder löscht: offene Tickets, Temp-Voice, einzelne Bewerbungen. */
    async SkipChannels(guildId: string): Promise<Set<string>> {
        const [tickets, voices, applications] = await Promise.all([
            this.client.tickets.OpenOfGuild(guildId).catch(() => []),
            this.client.tempVoices.OfGuild(guildId).catch(() => []),
            this.client.applySubmissions.ChannelsOf(guildId).catch(() => []),
        ]);

        return new Set([...tickets.map((ticket) => ticket.channelId), ...voices.map((voice) => voice.channelId), ...applications].filter((id): id is string => typeof id === "string"));
    }

    async Snapshot(guild: Guild, withImages = true): Promise<IServerSnapshot> {
        return ReadSnapshot(guild, {
            skipChannels: await this.SkipChannels(guild.id),
            withImages,
            withMembers: this.client.config.GUILD_MEMBER_INTENT === true,
            fetchImage: (url) => this.FetchImage(url),
        });
    }

    /* ----------------------------------------------------------
       Was nie angefasst wird, was fehlt, wer gelöscht hat
       ---------------------------------------------------------- */
    async Protect(guild: Guild): Promise<IProtect> {
        const me = guild.members.me;
        const [av, open, skip] = await Promise.all([this.client.antiVillainService.Settings(guild.id), this.client.avCases.Open(guild.id).catch(() => []), this.SkipChannels(guild.id)]);
        const ids = (list: readonly (string | null | undefined)[]) => new Set(list.filter((id): id is string => typeof id === "string"));
        const managed = [...guild.roles.cache.values()].filter((role) => role.managed).map((role) => role.id);

        return {
            // Ohne eigenes Mitglied im Cache gilt alles als „über dem Bot“: lieber nichts ändern als das Falsche.
            botTop: me?.roles.highest.position ?? 0,
            botRoleId: me?.roles.botRole?.id ?? null,
            everyoneId: guild.id,
            roles: ids([av.quarantine.roleId, av.bait.roleId, ...managed]),
            channels: ids([av.quarantine.channelId, av.bait.channelId, ...skip]),
            members: new Set(open.map((entry) => entry.userId)),
        };
    }

    /** Was dem Bot zum Laden fehlt: Rechte, Rollen über ihm, der Members Intent für die Rollen der Mitglieder. */
    Readiness(guild: Guild): { missing: string[]; aboveBot: string[]; intent: boolean } {
        const me = guild.members.me;
        const top = me?.roles.highest.position ?? 0;

        return {
            missing: NEEDED.filter(([flag]) => !me?.permissions.has(flag)).map(([, name]) => name),
            aboveBot: [...guild.roles.cache.values()]
                .filter((role) => role.position > top)
                .sort((a, b) => b.position - a.position)
                .map((role) => role.name),
            intent: this.client.config.GUILD_MEMBER_INTENT === true,
        };
    }

    /** Wer gelöschte Kanäle und Rollen gelöscht hat, laut Audit-Log. Ohne Recht oder bei Fehlern einfach leer. */
    async WhoDeleted(guild: Guild, ids: readonly string[]): Promise<Map<string, { name: string; at: number }>> {
        const wanted = new Set(ids);
        const found = new Map<string, { name: string; at: number }>();
        const logs = await Promise.all([
            guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 100 }).catch(() => null),
            guild.fetchAuditLogs({ type: AuditLogEvent.RoleDelete, limit: 100 }).catch(() => null),
        ]);

        for (const log of logs) {
            for (const entry of log?.entries.values() ?? []) {
                if (entry.targetId && wanted.has(entry.targetId) && !found.has(entry.targetId)) found.set(entry.targetId, { name: entry.executor?.username ?? "unbekannt", at: entry.createdTimestamp });
            }
        }

        return found;
    }

    /* ----------------------------------------------------------
       Vergleichen, Vorschau, Laden
       ---------------------------------------------------------- */
    /** Die Schritte für dieses Backup auf diesem Server, so wie er jetzt ist. */
    private async PlanFor(target: Guild, server: IServerSnapshot, backup: IBackupInfo, mode: RestoreMode, parts: readonly ServerPart[]): Promise<IRestorePlan> {
        const at = Date.parse(backup.createdAt);
        // Trümmer nur beim Reparieren aus einem Sicherheits-Backup, und nur aus den 10 Minuten davor.
        const debris = mode === "repair" && backup.kind === "schutz" && Number.isFinite(at) ? await this.client.avDebris.Between(target.id, at - DEBRIS_WINDOW_MS, at) : [];
        const [map, live, protect] = await Promise.all([this.client.serverIdMap.Of(target.id), this.Snapshot(target, false), this.Protect(target)]);

        return PlanRestore({ backup: MapSnapshot(server, FilterIdMap(FilterIdMap(map, target.id), server.guildId)), live, mode, parts, protect, debris });
    }

    /** Für die Seite Backups: Zähler des Servers, was zum Laden fehlt, der Meldekanal, ob Anti Villain an ist, die Kanäle für den Meldekanal. */
    async ServerInfo(guild: Guild): Promise<{
        counts: { roles: number; channels: number };
        readiness: ReturnType<ServerBackupService["Readiness"]>;
        settings: IBackupSettings;
        antiVillain: boolean;
        channels: { id: string; name: string }[];
    }> {
        const all = [...guild.channels.cache.values()];
        const modules = (await this.client.settings.Of(guild.id)).modules;

        return {
            counts: { roles: guild.roles.cache.size, channels: all.filter((channel) => !channel.isThread()).length },
            readiness: this.Readiness(guild),
            settings: await this.Settings(guild.id),
            antiVillain: modules.includes("anti-villain"),
            channels: all.filter((channel) => IsLogTarget(channel) && !channel.isThread()).map((channel) => ({ id: channel.id, name: channel.name })).slice(0, 300),
        };
    }

    /** Ein Backup mit Discord-Server fürs Dashboard: der Stand ohne Bilder, „Seitdem geändert“ und wer Fehlendes gelöscht hat. */
    async ServerView(guild: Guild, backupId: number, actor: Actor = this.Self()): Promise<{ server: IServerSnapshot; changed: IRestoreLine[]; missing: string[]; deletedBy: Record<string, { name: string; at: number }> } | string> {
        const answer = await this.AskBackups(guild, actor, { method: "GET", path: `/${backupId}/server`, timeout: SLOW });

        if (answer.status !== 200) return ErrorOf(answer);

        const server = MapSnapshot(answer.body as IServerSnapshot, FilterIdMap(await this.client.serverIdMap.Of(guild.id), guild.id));
        const live = await this.Snapshot(guild, false);
        const now = new Set([...live.roles.map((role) => role.id), ...live.channels.map((channel) => channel.id)]);
        const missing = [...server.roles.map((role) => role.id), ...server.channels.map((channel) => channel.id)].filter((id) => !now.has(id));

        return { server, changed: DiffSnapshots(server, live), missing, deletedBy: Object.fromEntries(await this.WhoDeleted(guild, missing)) };
    }

    /** Ein Auftrag dieses Servers (als Quelle oder Ziel), sonst null. */
    async Job(guildId: string, jobId: number): Promise<IRestoreJob | null> {
        const job = Number.isSafeInteger(jobId) ? await this.client.serverRestores.Get(jobId) : null;

        return job && (job.guildId === guildId || job.targetGuildId === guildId) ? job : null;
    }

    /** „Mit jetzt vergleichen“: was seit dem Backup anders ist. Ändert nichts. */
    async Compare(guild: Guild, backupId: number, actor: Actor = this.Self()): Promise<IRestoreLine[] | string> {
        const answer = await this.AskBackups(guild, actor, { method: "GET", path: `/${backupId}/server`, timeout: SLOW });

        if (answer.status !== 200) return ErrorOf(answer);

        return DiffSnapshots(MapSnapshot(answer.body as IServerSnapshot, FilterIdMap(await this.client.serverIdMap.Of(guild.id), guild.id)), await this.Snapshot(guild, false));
    }

    /** Schritt 3 beim Laden: die Unterschiede und die Dauer, ohne Auftrag. */
    async Preview(guild: Guild, input: { target: Guild; backupId: number; mode: RestoreMode; parts: ServerPart[] }, actor: Actor = this.Self()): Promise<IRestorePlan | string> {
        const [meta, server] = await Promise.all([
            this.AskBackups(guild, actor, { method: "GET", path: `/${input.backupId}`, timeout: QUICK }),
            this.AskBackups(guild, actor, { method: "GET", path: `/${input.backupId}/server`, timeout: SLOW }),
        ]);

        if (meta.status !== 200) return ErrorOf(meta);
        if (server.status !== 200) return ErrorOf(server);

        return this.PlanFor(input.target, server.body as IServerSnapshot, meta.body as IBackupInfo, input.mode, input.parts);
    }

    /** Laden beginnen. Gibt den Auftrag zurück oder einen Satz, warum nicht. Die Schritte laufen im Hintergrund. */
    async Start(input: IStartInput): Promise<IRestoreJob | string> {
        const { guild, target, actor } = input;
        const other = input.mode === "other";

        const busy = "Gerade wird schon ein Backup geladen. Warte, bis es fertig ist.";

        // Prüfen und eintragen ohne await dazwischen: Zwei Klicks zugleich sollen nicht beide durchkommen (Review I1).
        if (this.starting.has(target.id) || this.starting.has(guild.id)) return busy;

        this.starting.add(target.id);
        this.starting.add(guild.id);

        try {
            if ((await this.Lock(guild.id)) || (await this.Lock(target.id))) return busy;

            const answer = await this.AskBackups(guild, actor, {
                method: "POST",
                path: `/${input.backupId}/server`,
                body: { confirm: input.confirm, parts: input.parts, areas: other ? [] : input.areas, mode: input.mode, ...(other ? { targetGuildId: target.id } : {}) },
                headers: other ? { "X-Target-Name": encodeURIComponent(target.name) } : undefined,
                timeout: SNAPSHOT_WAIT_MS,
            });

            if (answer.status !== 200) return ErrorOf(answer);

            const { safetyId, server, backup } = answer.body as { safetyId: number; server: IServerSnapshot; backup: IBackupInfo };
            const plan = await this.PlanFor(target, server, backup, input.mode, input.parts).catch((error: unknown) => {
                logger.warn(`💾 Laden auf ${target.id} nicht geplant - ${String(error)}`);
                return null;
            });

            if (!plan) return "Den Discord-Server konnte der Bot gerade nicht lesen. Versuch es gleich noch einmal.";
            const now = Date.now();
            const job: Omit<IRestoreJob, "id"> = {
                guildId: guild.id,
                targetGuildId: target.id,
                backupId: input.backupId,
                safetyId,
                mode: input.mode,
                parts: input.parts,
                areas: other ? [] : input.areas,
                status: "running",
                phase: "server",
                ops: plan.ops,
                done: 0,
                failed: [],
                // Die Unterschiede gleich mit: Nach einem Neustart weiß die Karte noch, was geladen wird.
                report: { ...EmptyReport(), lines: plan.lines },
                actorId: actor.id,
                actorName: actor.name,
                channelId: null,
                messageId: null,
                startedAt: now,
                updatedAt: now,
            };
            const created = { ...job, id: await this.client.serverRestores.Create(job) };

            void this.Run(created);

            return created;
        } finally {
            this.starting.delete(target.id);
            this.starting.delete(guild.id);
        }
    }

    /** „Rückgängig machen“: das „vorher“ dieses Ladens mit „Genau wie im Backup“, dieselben Teile und Bereiche. */
    async Undo(guild: Guild, actor: Actor, jobId: number, confirm: string): Promise<IRestoreJob | string> {
        const job = await this.client.serverRestores.Get(jobId);

        if (!job || job.targetGuildId !== guild.id || job.safetyId === null) return "Dieses Laden lässt sich nicht rückgängig machen.";

        return this.Start({ guild, target: guild, actor, backupId: job.safetyId, mode: "exact", parts: job.parts, areas: job.areas, confirm });
    }

    /* ----------------------------------------------------------
       Aufträge
       ---------------------------------------------------------- */
    /** Der laufende Auftrag, der diesen Server betrifft (als Quelle oder Ziel), sonst null. Gilt über Neustarts. */
    async Lock(guildId: string): Promise<IRestoreJob | null> {
        return (await this.client.serverRestores.Running(guildId))[0] ?? null;
    }

    /** Nach einem Neustart: jeden laufenden Auftrag weiterführen. Gibt zurück, wie viele es waren. */
    async Resume(): Promise<number> {
        const jobs = await this.client.serverRestores.Running();

        for (const job of jobs) void this.Run(job);

        return jobs.length;
    }

    /** Hält den laufenden Auftrag vor dem nächsten Schritt an. Was gemacht ist, bleibt. */
    async Cancel(guildId: string, actorId: string): Promise<boolean> {
        const job = await this.Lock(guildId);

        // Review M6: Nach den Schritten am Server gibt es nichts mehr anzuhalten - dann kein „ok“.
        if (!job || job.phase !== "server") return false;

        logger.info(`💾 Laden ${job.id} auf ${job.targetGuildId} abgebrochen von ${actorId}`);

        if (this.runs.has(job.id)) this.stopping.add(job.id);
        else await this.client.serverRestores.Save(job.id, { status: "cancelled" });

        return true;
    }

    /** Review M4: Wartezeit, bis ein Laden nach einem Datenbank-Fehler von selbst weitermacht. */
    retryMs = 60_000;

    /** Holt den Auftrag neu und macht weiter, solange er läuft. Datenbank noch weg: später noch einmal. */
    private Retry(id: number): void {
        setTimeout(async () => {
            const fresh = await this.client.serverRestores.Get(id).catch(() => undefined);

            if (fresh === undefined) return this.Retry(id);
            if (fresh?.status === "running" && !this.runs.has(id)) void this.Run(fresh);
        }, this.retryMs);
    }

    /** Arbeitet einen Auftrag ab. Läuft er schon, kommt derselbe Lauf zurück. */
    Run(job: IRestoreJob): Promise<void> {
        const running = this.runs.get(job.id);

        if (running) return running;

        const run = this.Work({ ...job }).finally(() => {
            this.runs.delete(job.id);
            this.stopping.delete(job.id);
        });

        this.runs.set(job.id, run);

        return run;
    }

    /**
     * Die Phasen nacheinander. Nach jeder steht die nächste in der Datenbank:
     * Ein Neustart macht mit der Phase weiter, in der er stand.
     */
    private async Work(job: IRestoreJob): Promise<void> {
        const save = async (patch: Partial<IRestoreJob>) => {
            Object.assign(job, patch);
            await this.client.serverRestores.Save(job.id, patch);
        };
        const guild = this.client.guilds.cache.get(job.targetGuildId);

        if (!guild) {
            await save({ status: "failed" });
            return;
        }

        // Das Backup gehört zur Quelle; beim anderen Server ist das nicht das Ziel.
        const source = this.client.guilds.cache.get(job.guildId) ?? guild;
        const actor = { id: job.actorId, name: job.actorName };
        const report = job.report ?? EmptyReport();
        // Schon Schritte gemacht oder eine spätere Phase: Der Bot macht nach einem Neustart weiter.
        const resumed = job.done > 0 || job.phase !== "server";

        try {
            const meta = await this.AskBackups(source, actor, { method: "GET", path: `/${job.backupId}`, timeout: QUICK }).catch(() => null);
            const label = meta?.status === 200 ? BackupLabel(meta.body as IBackupMeta) : `Backup ${job.backupId}`;
            const card = await this.Card(guild, job, save, label, resumed);

            if (job.phase === "server") {
                // Die Server-IDs nie als „alte ID“: sonst zeigten guild_id und die Rechte von @everyone auf einen Kanal (Review C2).
                const servers = new Set([guild.id, job.guildId]);
                const map = FilterIdMap(FilterIdMap(await this.client.serverIdMap.Of(guild.id), guild.id), job.guildId);
                const held = { at: 0, ids: new Set<string>() };
                const result = await RunOps(guild, job, {
                    idMap: (id) => map.get(id),
                    remember: async (kind, oldId, newId) => {
                        if (servers.has(oldId)) return;

                        map.set(oldId, newId);
                        await this.client.serverIdMap.Add(guild.id, kind, oldId, newId);
                    },
                    save,
                    progress: card.progress,
                    cancelled: () => this.stopping.has(job.id),
                    image: this.Images(source, actor, job.backupId),
                    relock: (channel) => this.client.antiVillainService.quarantine.OnChannelCreate(channel),
                    // Offene Fälle höchstens alle 30 Sekunden neu: Ein Laden mit Tausenden Mitgliedern fragt sonst je Schritt.
                    held: async (userId) => {
                        if (Date.now() - held.at > 30_000) {
                            held.ids = new Set((await this.client.avCases.Open(guild.id).catch(() => [])).map((entry) => entry.userId));
                            held.at = Date.now();
                        }

                        return held.ids.has(userId);
                    },
                });

                if (result === "cancelled") return await card.done();

                await save({ phase: "bot" });
            }

            if (job.phase === "bot") {
                if (job.mode !== "other" && job.areas.length > 0) {
                    const problem = await this.LoadBotData(source, actor, job);
                    if (problem) report.problems.push(problem);
                }

                await save({ phase: "remap", report });
            }

            if (job.phase === "remap") {
                // Beim anderen Server kommen keine Bot-Daten - dort zeigt nichts auf die IDs des Backups.
                if (job.mode !== "other") {
                    const answer = await this.AskBackups(guild, actor, { method: "POST", path: "/remap", timeout: SLOW });

                    if (answer.status === 200) report.remapped = Number((answer.body as { rows?: unknown } | null)?.rows) || 0;
                    else report.problems.push(`IDs in den Bot-Daten nicht umgeschrieben: ${ErrorOf(answer)}`);
                }

                await save({ phase: "panels", report });
            }

            if (job.phase === "panels") {
                // Beim anderen Server bleiben die Bot-Daten des Ziels, wie sie sind - und mit ihnen seine Panels.
                if (job.mode !== "other") {
                    const panels = await this.Panels(guild, job.startedAt).catch((error: unknown) => ({ reposted: [], redrawn: [], problems: [`Panels nicht geprüft: ${String(error)}`] }));

                    report.reposted = panels.reposted;
                    report.redrawn = panels.redrawn;
                    report.problems.push(...panels.problems);
                }

                await save({ phase: "done", status: "done", report });
            }

            await card.done();
        } catch (error) {
            // Kommt nur, wenn die Datenbank nicht schreibt - der Auftrag bleibt „läuft“ und geht gleich von selbst weiter (Review M4).
            logger.warn(`💾 Laden ${job.id} unterbrochen - ${String(error)}`);
            this.Retry(job.id);
        }
    }

    /** Panels nach dem Laden: fehlende senden, die mit gerade angelegten IDs neu zeichnen. Eigene Methode, damit die Checks sie ersetzen können. */
    async Panels(guild: Guild, since: number): Promise<{ reposted: string[]; redrawn: string[]; problems: string[] }> {
        return AfterServerRestore(this.client, guild, await this.client.serverIdMap.Since(guild.id, since), null);
    }

    /** Die Bot-Daten des Backups, mit dem „vorher“ dieses Ladens statt einem zweiten. Gibt einen Satz zurück, wenn es nicht ging. */
    private async LoadBotData(source: Guild, actor: Actor, job: IRestoreJob): Promise<string | null> {
        const meta = await this.AskBackups(source, actor, { method: "GET", path: `/${job.backupId}`, timeout: QUICK });

        if (meta.status !== 200) return `Bot-Daten nicht geladen: ${ErrorOf(meta)}`;

        // Den Namen hat das Admin Dashboard beim Start geprüft. Die Route verlangt ihn trotzdem.
        const answer = await this.AskBackups(source, actor, {
            method: "POST",
            path: `/${job.backupId}/restore`,
            body: { areas: job.areas, confirm: (meta.body as IBackupInfo).guildName, ...(job.safetyId === null ? {} : { safetyId: job.safetyId }) },
            timeout: SLOW,
        });

        return answer.status === 200 ? null : `Bot-Daten nicht geladen: ${ErrorOf(answer)}`;
    }

    /**
     * Bilder, die im Auftrag fehlen: einmal das ganze Backup mit Bildern holen,
     * dann nachsehen. Scheitert das Holen, versucht es das nächste Bild noch
     * einmal - höchstens dreimal je Lauf (W-0041 M10).
     */
    private Images(source: Guild, actor: Actor, backupId: number): (kind: ImageKind, id: string) => Promise<string | null> {
        let full: Promise<IServerSnapshot | null> | null = null;
        let tries = 0;

        return async (kind, id) => {
            if (!full && tries < 3) {
                tries++;
                full = this.AskBackups(source, actor, { method: "GET", path: `/${backupId}/server?images=1`, timeout: SLOW })
                    .then((answer) => (answer.status === 200 && Array.isArray((answer.body as IServerSnapshot | null)?.roles) ? (answer.body as IServerSnapshot) : null))
                    .catch(() => null);
            }

            const server = await full;

            if (!server) {
                full = null;

                return null;
            }

            switch (kind) {
                case "role":
                    return server.roles.find((role) => role.id === id)?.icon ?? null;
                case "emoji":
                    return server.emojis.find((emoji) => emoji.id === id)?.image ?? null;
                case "sticker":
                    return server.stickers.find((sticker) => sticker.id === id)?.image ?? null;
                case "icon":
                    return server.settings.icon;
                case "banner":
                    return server.settings.banner;
            }
        };
    }

    /** Die Karte im Meldekanal: beim ersten Mal senden, danach dieselbe Nachricht bearbeiten, auch nach einem Neustart. */
    private async Card(guild: Guild, job: IRestoreJob, save: (patch: Partial<IRestoreJob>) => Promise<void>, label: string, resumed: boolean): Promise<{ progress: () => void; done: () => Promise<void> }> {
        const channelId = job.channelId ?? (await this.Settings(guild.id)).logChannelId;
        const channel = channelId ? guild.channels.cache.get(channelId) : undefined;
        const running = () => RunningCard({ job, backupLabel: label, etaMs: (job.ops.length - job.done) * STEP_MS, resumed }) as MessageEditOptions;

        if (!channel || !IsLogTarget(channel) || !("send" in channel)) return { progress: () => undefined, done: async () => undefined };

        let message: Message | null = job.messageId ? await channel.messages.fetch(job.messageId).catch(() => null) : null;

        if (!message) {
            message = await channel.send(RunningCard({ job, backupLabel: label, etaMs: (job.ops.length - job.done) * STEP_MS, resumed })).catch(() => null);
            if (message) await save({ channelId: channel.id, messageId: message.id });
        }

        let last = Date.now();

        return {
            progress: () => {
                if (!message || Date.now() - last < CARD_EVERY_MS) return;

                last = Date.now();
                void message.edit(running()).catch(() => undefined);
            },
            done: async () => {
                const minutes = Math.max(1, Math.round((Date.now() - job.startedAt) / 60_000));

                await message?.edit(DoneCard({ job, backupLabel: label, minutes, dashboardUrl: this.DashboardUrl(guild.id) }) as MessageEditOptions).catch(() => undefined);
            },
        };
    }

    /* ----------------------------------------------------------
       /backup und die Knöpfe (bk:…)
       ---------------------------------------------------------- */
    /** Server verwalten und Zugang zum Dashboard. Sonst eine Antwort mit dem Grund und null. */
    private async Gate(interaction: ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction): Promise<{ guild: Guild; actor: Actor } | null> {
        if (!interaction.inCachedGuild()) {
            await this.Say(interaction, "Das geht nur auf einem Server.");
            return null;
        }

        if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
            await this.Say(interaction, "Dafür brauchst du „Server verwalten“.");
            return null;
        }

        if (!(await this.client.dashboardService.GuildAllowed(interaction.user.id, interaction.guild.id))) {
            const access = await this.client.dashboardService.ShopAccess(interaction.user.id);

            await this.Say(interaction, access.reason || "Für diesen Server gibt es gerade keinen Zugang zu den Backups.");
            return null;
        }

        return { guild: interaction.guild, actor: { id: interaction.user.id, name: interaction.member.displayName || interaction.user.username } };
    }

    /** Antwort nur für den Fragenden: neu, oder die aufgeschobene ersetzen. */
    private async Say(interaction: ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction, payload: MessageCreateOptions | string): Promise<void> {
        const message = typeof payload === "string" ? Note(payload) : payload;

        if (interaction.deferred || interaction.replied) await interaction.editReply(message as InteractionEditReplyOptions);
        else await interaction.reply({ ...(message as InteractionReplyOptions), flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    }

    private async List(guild: Guild, actor: Actor): Promise<IServerBackupList | string> {
        const answer = await this.AskBackups(guild, actor, { method: "GET", path: "", timeout: QUICK });

        return answer.status === 200 ? (answer.body as IServerBackupList) : ErrorOf(answer);
    }

    private async Meta(guild: Guild, actor: Actor, backupId: number): Promise<IBackupMeta | string> {
        if (!Number.isSafeInteger(backupId) || backupId < 1) return "Wähl ein Backup aus der Liste.";

        const answer = await this.AskBackups(guild, actor, { method: "GET", path: `/${backupId}`, timeout: QUICK });

        return answer.status === 200 ? (answer.body as IBackupMeta) : ErrorOf(answer);
    }

    private async CreateView(guild: Guild, actor: Actor, note: string | null, what: string): Promise<MessageCreateOptions> {
        const parts = what === "bot" ? ["bot"] : what === "server" ? ["server"] : ["bot", "server"];
        const made = await this.AskBackups(guild, actor, { method: "POST", path: "", body: { note, parts }, timeout: SNAPSHOT_WAIT_MS });

        if (made.status !== 200) return Note(ErrorOf(made));

        const meta = made.body as IBackupMeta;
        const list = await this.List(guild, actor);
        const hand = typeof list === "string" ? { used: 0, max: 10 } : list.hand;

        return CreatedReply(meta, hand.used, hand.max, this.DashboardUrl(guild.id, meta.id));
    }

    private async ListView(guild: Guild, actor: Actor, page: number): Promise<MessageCreateOptions> {
        const list = await this.List(guild, actor);

        return typeof list === "string" ? Note(list) : ListReply({ backups: list.backups, page, strip: Strip(list.backups) });
    }

    private async OpenView(guild: Guild, actor: Actor, backupId: number): Promise<MessageCreateOptions> {
        const meta = await this.Meta(guild, actor, backupId);

        return typeof meta === "string" ? Note(meta) : BackupReply(meta);
    }

    private async CompareView(guild: Guild, actor: Actor, backupId: number): Promise<MessageCreateOptions> {
        const meta = await this.Meta(guild, actor, backupId);

        if (typeof meta === "string") return Note(meta);
        if (!meta.parts.includes("server")) return Note("Dieses Backup hat keinen Discord-Server.");

        const lines = await this.Compare(guild, backupId, actor);

        return typeof lines === "string" ? Note(lines) : CompareReply(lines, DayLabel(meta), backupId);
    }

    private async ConfirmView(guild: Guild, actor: Actor, backupId: number, mode: "repair" | "exact"): Promise<MessageCreateOptions> {
        const meta = await this.Meta(guild, actor, backupId);

        if (typeof meta === "string") return Note(meta);
        if (!meta.parts.includes("server")) return Note("Dieses Backup hat keinen Discord-Server.");

        const plan = await this.Preview(guild, { target: guild, backupId, mode, parts: [...SERVER_PART_IDS] }, actor);

        return typeof plan === "string" ? Note(plan) : LoadConfirm(plan, DayLabel(meta), mode, backupId);
    }

    private async AutoView(guild: Guild, actor: Actor, toggle?: "enabled" | "discord" | "risky"): Promise<MessageCreateOptions> {
        const list = await this.List(guild, actor);

        if (typeof list === "string") return Note(list);
        if (!toggle) return AutomaticReply(list.plan, this.DashboardUrl(guild.id));

        const plan = { ...list.plan.plan, [toggle]: !list.plan.plan[toggle] };
        const answer = await this.AskBackups(guild, actor, { method: "PUT", path: "/plan", body: plan, timeout: QUICK });

        return answer.status === 200 ? AutomaticReply(answer.body as IBackupPlanState, this.DashboardUrl(guild.id)) : Note(ErrorOf(answer));
    }

    /** Was „Rückgängig machen“ täte, mit der Liste dessen, was verschwindet. */
    private async UndoView(guild: Guild, actor: Actor, jobId: number): Promise<MessageCreateOptions> {
        const job = await this.client.serverRestores.Get(jobId);

        if (!job || job.targetGuildId !== guild.id || job.safetyId === null) return Note("Dieses Laden lässt sich nicht rückgängig machen.");

        const plan = await this.Preview(guild, { target: guild, backupId: job.safetyId, mode: "exact", parts: job.parts }, actor);

        return typeof plan === "string" ? Note(plan) : LoadConfirm(plan, "vor dem Laden", "exact", job.safetyId, job.id);
    }

    /** Nach dem Namen fragen: vor dem Laden und vor „Rückgängig machen“. */
    private NameModal(customId: string, title: string, guild: Guild): ModalBuilder {
        const input = new TextInputBuilder().setCustomId("name").setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(true).setPlaceholder(guild.name.toLowerCase().slice(0, 100));

        return new ModalBuilder()
            .setCustomId(customId)
            .setTitle(title)
            .addLabelComponents(new LabelBuilder().setLabel("Name des Servers zum Bestätigen").setDescription(`„${guild.name}“, Groß- und Kleinschreibung egal`.slice(0, 100)).setTextInputComponent(input));
    }

    /** Läuft: wo man den Fortschritt sieht. */
    private async Started(guild: Guild, job: IRestoreJob | string): Promise<MessageCreateOptions> {
        if (typeof job === "string") return Note(job);

        const { logChannelId } = await this.Settings(guild.id);

        return Note(`⏳ Läuft. ${logChannelId ? `Den Fortschritt siehst du in <#${logChannelId}>.` : "Den Fortschritt siehst du im Dashboard unter Backups."} Vorher hat der Bot den jetzigen Stand gesichert.`);
    }

    async OnCommand(interaction: ChatInputCommandInteraction): Promise<void> {
        const gate = await this.Gate(interaction);

        if (!gate) return;

        const { guild, actor } = gate;
        const backupId = Number(interaction.options.getString("backup") ?? Number.NaN);

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        switch (interaction.options.getSubcommand()) {
            case "neu":
                return this.Say(interaction, await this.CreateView(guild, actor, interaction.options.getString("notiz"), interaction.options.getString("was") ?? "alles"));
            case "liste":
                return this.Say(interaction, await this.ListView(guild, actor, 0));
            case "ansehen":
                return this.Say(interaction, await this.OpenView(guild, actor, backupId));
            case "vergleichen":
                return this.Say(interaction, await this.CompareView(guild, actor, backupId));
            case "laden":
                return this.Say(interaction, await this.ConfirmView(guild, actor, backupId, interaction.options.getString("modus") === "genau" ? "exact" : "repair"));
            case "automatisch":
                return this.Say(interaction, await this.AutoView(guild, actor));
        }
    }

    /** Das Feld „backup“: höchstens 25 Backups, lesbar; laden und vergleichen nur mit Discord-Server. */
    async OnAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
        const guild = interaction.guild;

        // Review M8: Backups sieht nur, wer den Server verwalten darf - wie beim Befehl selbst.
        if (!guild || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) || !(await this.client.dashboardService.GuildAllowed(interaction.user.id, guild.id))) {
            return void (await interaction.respond([]).catch(() => undefined));
        }

        const list = await this.List(guild, { id: interaction.user.id, name: interaction.user.username });
        const typed = interaction.options.getFocused().toLowerCase();
        const sub = interaction.options.getSubcommand();
        const choices = (typeof list === "string" ? [] : list.backups)
            .filter((meta) => (sub === "ansehen" || meta.parts.includes("server")) && ChoiceLabel(meta).toLowerCase().includes(typed))
            .slice(0, 25)
            .map((meta) => ({ name: ChoiceLabel(meta), value: String(meta.id) }));

        await interaction.respond(choices).catch(() => undefined);
    }

    async OnButton(interaction: ButtonInteraction | ModalSubmitInteraction): Promise<void> {
        const [, action = "", first = "", second = ""] = interaction.customId.split(":");

        if (action === "page") return;

        const gate = await this.Gate(interaction);

        if (!gate) return;

        const { guild, actor } = gate;
        const update = async (view: Promise<MessageCreateOptions>) => {
            await interaction.deferUpdate();
            await interaction.editReply((await view) as InteractionEditReplyOptions);
        };

        if (interaction.isButton()) {
            switch (action) {
                case "list":
                    return update(this.ListView(guild, actor, Number(first) || 0));
                case "open":
                    return update(this.OpenView(guild, actor, Number(first)));
                case "compare":
                    return update(this.CompareView(guild, actor, Number(first)));
                case "ask":
                    return update(this.ConfirmView(guild, actor, Number(first), second === "exact" ? "exact" : "repair"));
                case "cancel":
                    return void (await interaction.update(Note("Abgebrochen. Es wurde nichts geändert.") as InteractionUpdateOptions));
                case "auto":
                    return update(this.AutoView(guild, actor, first === "discord" || first === "risky" ? first : "enabled"));
                case "load":
                    return void (await interaction.showModal(this.NameModal(`bk:confirm:${Number(first)}:${second === "exact" ? "exact" : "repair"}`, second === "exact" ? "Server genau wie im Backup laden" : "Server reparieren", guild)));
                case "undo":
                    // Rückgängig lädt „vorher“ genau wie im Backup: erst zeigen, was verschwindet (Review I6).
                    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                    return this.Say(interaction, await this.UndoView(guild, actor, Number(first)));
                case "undoask":
                    return void (await interaction.showModal(this.NameModal(`bk:undoconfirm:${Number(first)}`, "Laden rückgängig machen", guild)));
                case "retry": {
                    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                    const list = await this.List(guild, actor);

                    return this.Say(interaction, await this.CreateView(guild, actor, "nachgeholt", typeof list !== "string" && list.plan.plan.discord ? "alles" : "bot"));
                }
            }

            return;
        }

        const confirm = interaction.fields.getTextInputValue("name");

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        if (action === "confirm") {
            const job = await this.Start({ guild, target: guild, actor, backupId: Number(first), mode: second === "exact" ? "exact" : "repair", parts: [...SERVER_PART_IDS], areas: [], confirm });

            return this.Say(interaction, await this.Started(guild, job));
        }

        if (action === "undoconfirm") return this.Say(interaction, await this.Started(guild, await this.Undo(guild, actor, Number(first), confirm)));
    }

    /* ----------------------------------------------------------
       Einstellungen
       ---------------------------------------------------------- */
    async Settings(guildId: string): Promise<IBackupSettings> {
        return { ...DefaultBackupSettings(), ...(await this.client.moduleSettings.Of<Partial<IBackupSettings>>(guildId, BACKUPS_MODULE, {})) };
    }

    /** Nur ein Kanal, in den der Bot Karten schreiben kann, sonst keiner. */
    async SaveSettings(guild: Guild, input: unknown): Promise<IBackupSettings> {
        const log = (input as { logChannelId?: unknown } | null)?.logChannelId;
        const settings: IBackupSettings = { logChannelId: typeof log === "string" && IsLogTarget(guild.channels.cache.get(log)) ? log : null };

        await this.client.moduleSettings.Save(guild.id, BACKUPS_MODULE, settings);

        return settings;
    }
}
