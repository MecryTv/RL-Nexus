import path from "path";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { ChannelType, DiscordAPIError, Guild, GuildMember, Message, MessageFlags, PermissionFlagsBits, User } from "discord.js";
import BotClient from "../client/BotClient";
import { CaseCard, ICaseExtra, ICaseMessage } from "../builder/ModerationCard";
import { CaseView, DirectView } from "../builder/ModerationView";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import { SNOWFLAKE } from "../constants/Discord";
import {
    ACTION_PERMISSION,
    CaseRef,
    EVIDENCE_ROOT,
    MAX_BAN,
    MAX_DELETE_SECONDS,
    MAX_EVIDENCE,
    MAX_EVIDENCE_BYTES,
    MAX_NOTE,
    MAX_NOTES,
    MAX_PROOF_TEXT,
    MAX_PURGE,
    MAX_REASON,
    MAX_STAGES,
    MAX_SUPPORT_REMIND,
    MAX_SUPPORT_ROLES,
    MAX_TIMEOUT,
    MESSAGE_LINK,
    MIN_DURATION,
    MOD_ACTIONS,
    ParseMessageLink,
    PERMISSION_LABEL,
    PROOF_TIMEOUT_CHOICES,
    ProofNeeded,
    StageFor,
    STORED_EVIDENCE,
    HIDE_REASON_MAX,
} from "../constants/Moderation";
import { IModCase, IModConfig, IModDetails, IModEnded, IModEvidence, IModMessageProof, IModProofRules, IModStage, IModSupport, ModAction, ModSource } from "../interfaces/services/moderation/IModeration";
import { NewModCase } from "../models/ModCases";
import { Shrink } from "../utils/image";
import logger from "../utils/logger";
import { IsLogTarget, SendLog, WarmLogTarget } from "../utils/logtarget";

/** Was der Moderator falsch gemacht hat oder was nicht geht - Befehl und Dashboard zeigen den Text. */
export class ModerationError extends Error {}

export interface IModRequest {
    action: ModAction;
    targetId?: string | null;
    reason?: string | null;
    /** Sekunden - Timeout (Pflicht) und befristeter Bann. */
    duration?: number | null;
    /** ban: so viele Sekunden Nachrichten mitlöschen. */
    deleteSeconds?: number | null;
    /** purge: 1 bis 100. */
    count?: number | null;
    channelId?: string | null;
    /** unwarn: welche Verwarnung - ohne die neueste des Users. */
    caseNumber?: number | null;
}

/** Wer handelt: ein Mitglied - oder der Bot selbst, wenn ein Bann abläuft. */
export interface IModActor {
    id: string;
    name: string;
    member: GuildMember | null;
}

/** Beweise, die eine Strafe gleich mitbringt - jeder für sich, keiner muss klappen. */
export interface IModProof {
    /** Ein Anhang aus Discord. */
    image?: { url: string; size: number; contentType: string | null; name: string };
    /** https - oder ein Nachrichtenlink dieses Servers, dann wird die Nachricht gesichert. */
    link?: string | null;
    /** Die Nachricht vom Rechtsklick. */
    message?: Message;
}

/** Ein Beweis, der nicht ankam: was es war, und warum. */
function ProofProblem(what: string, error: unknown): string {
    if (!(error instanceof ModerationError)) logger.warn(`🛡️ Moderation: ${what} als Beweis fehlgeschlagen - ${String(error)}`);

    return `${what}: ${error instanceof ModerationError ? error.message : "Das ließ sich nicht sichern."}`;
}

/** Diese Strafen zählt die Karte („3. Fall in 30 Tagen“). */
const PENALTIES: ReadonlySet<ModAction> = new Set<ModAction>(["warn", "timeout", "kick", "ban"]);

const EVIDENCE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

const FOREIGN_LINK = "Dieser Nachrichtenlink führt auf einen anderen Server. Gesichert wird nur, was hier steht.";
const HTTPS_ONLY = "Nur https-Links gehen als Beweis.";

function IsHttps(value: string): boolean {
    return value.length <= 500 && URL.canParse(value) && new URL(value).protocol === "https:";
}

/** Woran ein Anhang als Beweis scheitert - null, wenn er taugt. Gilt vor der Strafe wie beim Sichern. */
export function AttachmentFault(attachment: { url: string; size: number; contentType: string | null }): string | null {
    const host = URL.canParse(attachment.url) ? new URL(attachment.url).hostname : "";

    if (!EVIDENCE_TYPES.has((attachment.contentType ?? "").split(";")[0])) return "Nur Bilder: PNG, JPG, GIF oder WebP.";
    if (attachment.size > MAX_EVIDENCE_BYTES) return "Das Bild ist größer als 8 MB.";
    if (host !== "cdn.discordapp.com" && host !== "media.discordapp.net") return "Dieser Anhang kommt nicht von Discord.";

    return null;
}

/**
 * Die Ablehnung, wenn die Pflicht greift (needed) und kein Beweis taugt - sonst
 * null. Einer, der taugt, reicht. Geprüft wird nur, was ohne Netz geht: Art,
 * Größe, Herkunft, Server. Scheitert danach das Sichern, meldet AddProof das.
 */
export function ProofRefusal(needed: string | null, proof: IModProof | undefined, guildId: string): string | null {
    if (!needed) return null;

    const link = proof?.link?.trim();
    const faults: (string | null)[] = [];

    if (proof?.message) faults.push(null);
    if (proof?.image) faults.push(AttachmentFault(proof.image));
    if (link) faults.push(MESSAGE_LINK.test(link) ? (ParseMessageLink(link, guildId) ? null : FOREIGN_LINK) : IsHttps(link) ? null : HTTPS_ONLY);

    if (faults.includes(null)) return null;

    return faults.length ? `${faults[0]} ${needed}` : needed;
}

function IsRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function CleanReason(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim().slice(0, MAX_REASON) : null;
}

/**
 * Das Moderations-Modul: Bannen, Kicken, Timeouts, Verwarnungen mit Stufen und
 * Aufräumen - aus Discord wie aus dem Dashboard derselbe Weg. Jede Aktion wird
 * ein Fall mit Nummer, Log-Karte und auf Wunsch einer DM. Siehe docs/Moderation.md.
 */
export default class ModerationService {
    private readonly client: BotClient;
    // Ein Bann, der sich nicht aufheben lässt, meldet sich nur einmal im Log.
    private readonly stuck = new Set<number>();
    /** Je Fall die laufende Nachbesserung der Log-Karte (UpdateLog). */
    private readonly logQueue = new Map<number, Promise<void>>();

    constructor(client: BotClient) {
        this.client = client;
    }

    /* ----------------------------------------------------------
       Rechte
       ---------------------------------------------------------- */
    /** Auf der Moderatoren-Liste des Servers: selbst eingetragen oder über eine Rolle. */
    async IsModerator(member: GuildMember): Promise<boolean> {
        const { moderators } = await this.client.settings.Of(member.guild.id);

        return moderators.users.includes(member.id) || moderators.roles.some((role) => member.roles.cache.has(role));
    }

    /** Darf member das? Owner, "Server verwalten", die Moderatoren-Liste - oder das passende Discord-Recht. */
    async Allowed(member: GuildMember, action: ModAction): Promise<boolean> {
        if (member.id === member.guild.ownerId || member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
        if (member.permissions.has(ACTION_PERMISSION[action])) return true;

        return this.IsModerator(member);
    }

    /** Was member alles darf - das Dashboard zeigt nur diese Knöpfe. */
    async AllowedActions(member: GuildMember): Promise<ModAction[]> {
        const moderator = await this.IsModerator(member);
        const all = member.id === member.guild.ownerId || member.permissions.has(PermissionFlagsBits.ManageGuild) || moderator;

        return MOD_ACTIONS.filter((action) => all || member.permissions.has(ACTION_PERMISSION[action]));
    }

    /** Den Verlauf sieht, wer irgendeine Aktion darf. */
    /** Rechtsklick und Knöpfe an Beweisen: Modul an, Datenbank da, und nur fürs Team. */
    async TeamGate(member: GuildMember): Promise<void> {
        await this.Ready(member.guild);

        if (!(await this.CanView(member))) throw new ModerationError("Das sieht nur das Moderations-Team.");
    }

    async CanView(member: GuildMember): Promise<boolean> {
        return (await this.AllowedActions(member)).length > 0;
    }

    /** Darf eine Notiz oder einen Beweis eines anderen entfernen: nur wer den Server verwaltet. */
    CanManage(member: GuildMember): boolean {
        return member.id === member.guild.ownerId || member.permissions.has(PermissionFlagsBits.ManageGuild);
    }

    /* ----------------------------------------------------------
       Einstellungen
       ---------------------------------------------------------- */
    Clean(guild: Guild, input: unknown, previous: IModConfig): IModConfig {
        if (!IsRecord(input)) throw new ModerationError("Das sind keine gültigen Einstellungen.");

        const days = Number(input.warnDays);
        const log = input.logChannelId;

        return {
            logChannelId:
                log === undefined
                    ? previous.logChannelId
                    : typeof log === "string" && IsLogTarget(guild.channels.cache.get(log))
                      ? log
                      : null,
            dm: typeof input.dm === "boolean" ? input.dm : previous.dm,
            warnDays: Number.isInteger(days) && days >= 0 && days <= 365 ? days : previous.warnDays,
            stages: Array.isArray(input.stages) ? this.CleanStages(input.stages) : previous.stages,
            support: this.CleanSupport(guild, input.support, previous.support),
            proof: this.CleanProof(input.proof, previous.proof),
        };
    }

    /** Die Beweis-Pflicht - eine Timeout-Grenze nur aus der Auswahl, alles andere heißt keine. */
    CleanProof(input: unknown, previous: IModProofRules): IModProofRules {
        if (!IsRecord(input)) return previous;

        const flag = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);
        const from = input.timeoutFrom;

        return {
            ban: flag(input.ban, previous.ban),
            kick: flag(input.kick, previous.kick),
            timeoutFrom: from === undefined ? previous.timeoutFrom : (PROOF_TIMEOUT_CHOICES.find(([seconds]) => seconds !== null && seconds === from)?.[0] ?? null),
            warn: flag(input.warn, previous.warn),
        };
    }

    /**
     * Der Support-Warteraum. Ohne Kanal für die Meldung säße jemand im
     * Warteraum, ohne dass es jemand merkt - deshalb gibt es den einen nicht
     * ohne den anderen.
     */
    CleanSupport(guild: Guild, input: unknown, previous: IModSupport): IModSupport {
        if (!IsRecord(input)) return previous;

        const room = typeof input.channelId === "string" ? guild.channels.cache.get(input.channelId) : null;
        const notify = typeof input.notifyChannelId === "string" ? guild.channels.cache.get(input.notifyChannelId) : null;
        const minutes = Math.floor(Number(input.remindAfter ?? previous.remindAfter));
        const support: IModSupport = {
            channelId: input.channelId === undefined ? previous.channelId : room?.type === ChannelType.GuildVoice ? room.id : null,
            notifyChannelId:
                input.notifyChannelId === undefined
                    ? previous.notifyChannelId
                    : notify?.type === ChannelType.GuildText || notify?.type === ChannelType.GuildAnnouncement
                      ? notify.id
                      : null,
            roles:
                input.roles === undefined
                    ? previous.roles
                    : Array.isArray(input.roles)
                      ? [...new Set(input.roles.filter((id): id is string => typeof id === "string" && guild.roles.cache.has(id) && id !== guild.id))].slice(0, MAX_SUPPORT_ROLES)
                      : [],
            remindAfter: Number.isFinite(minutes) ? Math.min(MAX_SUPPORT_REMIND, Math.max(0, minutes)) : previous.remindAfter,
        };

        if (support.channelId && !support.notifyChannelId) throw new ModerationError("Wähle auch den Kanal, in dem das Team vom Warteraum erfährt.");

        return support;
    }

    /** Je Zahl höchstens eine Stufe, aufsteigend - eine Dauer nur, wo sie Sinn ergibt. */
    CleanStages(input: unknown[]): IModStage[] {
        const stages = new Map<number, IModStage>();

        for (const raw of input) {
            if (!IsRecord(raw)) continue;

            const warns = Number(raw.warns);
            const action = raw.action;
            const duration = raw.duration === null || raw.duration === undefined ? null : Number(raw.duration);

            if (!Number.isInteger(warns) || warns < 1 || warns > 50 || stages.has(warns)) continue;
            if (action !== "timeout" && action !== "kick" && action !== "ban") continue;

            if (action === "timeout") {
                if (duration === null || !Number.isInteger(duration) || duration < MIN_DURATION || duration > MAX_TIMEOUT) continue;
            } else if (action === "ban" && duration !== null) {
                if (!Number.isInteger(duration) || duration < MIN_DURATION || duration > MAX_BAN) continue;
            }

            stages.set(warns, { warns, action, duration: action === "kick" ? null : duration });
        }

        return [...stages.values()].sort((a, b) => a.warns - b.warns).slice(0, MAX_STAGES);
    }

    async SaveConfig(guild: Guild, input: unknown): Promise<IModConfig> {
        const previous = await this.client.modSettings.Of(guild.id);

        // Ein archivierter Forum-Beitrag steht nicht im Cache - Clean() sucht nur dort.
        if (IsRecord(input)) await WarmLogTarget(guild, input.logChannelId);

        const config = this.Clean(guild, input, previous);

        // Ein Hub zieht jeden sofort in einen eigenen Kanal - als Warteraum säße dort nie jemand.
        if (config.support.channelId && (await this.client.voiceHubs.ByChannel(config.support.channelId).catch(() => null))) {
            throw new ModerationError("Dieser Sprachkanal ist ein Temp-Voice-Hub. Nimm einen gewöhnlichen Sprachkanal als Warteraum.");
        }

        await this.client.modSettings.Save(guild.id, config);

        return config;
    }

    /* ----------------------------------------------------------
       Aktionen
       ---------------------------------------------------------- */
    /** Eine Aktion eines Mitglieds - aus einem Befehl oder dem Dashboard. */
    async Act(guild: Guild, actor: GuildMember, request: IModRequest, source: Exclude<ModSource, "auto">): Promise<IModCase> {
        await this.Ready(guild);

        if (!MOD_ACTIONS.includes(request.action)) throw new ModerationError("Diese Aktion gibt es nicht.");

        if (!(await this.Allowed(actor, request.action))) {
            throw new ModerationError(`Dafür brauchst du „${PERMISSION_LABEL[request.action]}“ – oder einen Platz auf der Moderatoren-Liste.`);
        }

        return this.Run(guild, { id: actor.id, name: actor.displayName, member: actor }, request, source, null);
    }

    /**
     * Wie Act, mit Beweisen. Braucht die Strafe hier einen und fehlt er - oder
     * taugt keiner (falsche Art, zu groß, fremder Server) -, passiert nichts.
     * Sonst gilt die Strafe - ein Beweis, der danach nicht klappt, steht in
     * problems, statt sie zu kippen.
     */
    async ActWithProof(
        guild: Guild,
        actor: GuildMember,
        request: IModRequest,
        source: Exclude<ModSource, "auto">,
        proof?: IModProof
    ): Promise<{ entry: IModCase; problems: string[] }> {
        // Ohne Datenbank oder mit Modul aus soll das dastehen, nicht ein Fehler beim Lesen der Pflicht.
        await this.Ready(guild);

        const given = Boolean(proof?.image || proof?.message || proof?.link?.trim());
        const refused = ProofRefusal(ProofNeeded(await this.client.modSettings.Of(guild.id), request), proof, guild.id);

        // Wer die Aktion gar nicht darf, soll das hören - nicht, dass ein Beweis fehlt.
        if (refused && (await this.Allowed(actor, request.action))) throw new ModerationError(refused);

        const entry = await this.Act(guild, actor, request, source);

        return given && proof ? this.AddProof(guild, { id: actor.id, name: actor.displayName, member: actor }, entry.number, proof) : { entry, problems: [] };
    }

    /**
     * Der Bot handelt von selbst - heute ist das der Auto Mod. Es gibt keinen
     * Moderator, dessen Rechte zu pruefen waeren; die Rechte des Bots pruft Run
     * wie immer. Der Fall traegt den Bot als Moderator und "auto" als Quelle.
     */
    async Auto(guild: Guild, request: IModRequest): Promise<IModCase> {
        await this.Ready(guild);

        const me = guild.members.me ?? (await guild.members.fetchMe());

        return this.Run(guild, { id: me.id, name: me.displayName, member: me }, request, "auto", null);
    }

    private async Ready(guild: Guild): Promise<void> {
        if (!this.client.databaseService.Ready) {
            throw new ModerationError("Ohne Datenbank gibt es keinen Verlauf – und gerade ist sie nicht erreichbar.");
        }

        if (!(await this.client.settings.Of(guild.id)).modules.includes("moderation")) {
            throw new ModerationError("Das Modul Moderation ist hier aus – einschalten im Dashboard oder mit `/module an modul:moderation`.");
        }
    }

    private async Run(guild: Guild, actor: IModActor, request: IModRequest, source: ModSource, related: number | null): Promise<IModCase> {
        const { action } = request;
        const me = guild.members.me ?? (await guild.members.fetchMe());

        // Eine Verwarnung ist nur ein Eintrag - dafür braucht der Bot kein Recht. Löschen prüft je Kanal.
        if (action !== "warn" && action !== "unwarn" && action !== "purge" && !me.permissions.has(ACTION_PERMISSION[action])) {
            throw new ModerationError(`Mir fehlt das Recht „${PERMISSION_LABEL[action]}“.`);
        }

        const reason = CleanReason(request.reason);

        if (action === "purge") return this.Purge(guild, actor, request, reason, source);
        if (action === "unwarn") return this.Unwarn(guild, actor, request, reason, source);

        const targetId = typeof request.targetId === "string" && SNOWFLAKE.test(request.targetId) ? request.targetId : null;

        if (!targetId) throw new ModerationError("Wen? Es fehlt der User.");

        if (action === "unban") return this.Unban(guild, actor, targetId, reason, source);

        const user = await this.client.users.fetch(targetId).catch(() => null);

        if (!user) throw new ModerationError("Diesen User gibt es bei Discord nicht.");

        const member = await guild.members.fetch(targetId).catch(() => null);

        if (!member && action !== "ban") throw new ModerationError(`${user.username} ist nicht (mehr) auf dem Server.`);

        this.CheckTarget(guild, actor, user, member, action);

        const config = await this.client.modSettings.Of(guild.id);
        const base = { targetId, targetName: member?.displayName ?? user.username, reason, source, related };

        if (action === "ban") {
            if (await guild.bans.fetch(targetId).then(() => true, () => false)) throw new ModerationError(`${user.username} ist schon gebannt.`);

            const duration = this.Duration(request.duration, MAX_BAN, false);
            const deleteSeconds = Math.min(Math.max(Math.floor(Number(request.deleteSeconds) || 0), 0), MAX_DELETE_SECONDS);
            const entry = await this.Record(actor, guild, {
                ...base,
                action,
                duration,
                expiresAt: duration ? Date.now() + duration * 1000 : null,
                active: true,
                details: deleteSeconds ? { deleteSeconds } : {},
            });
            // Vorher: danach teilt der User keinen Server mehr mit dem Bot, die DM käme nicht an.
            const dm = member && config.dm ? await this.Direct(user, entry, guild) : undefined;

            await this.Attempt(entry, "bannen", () => guild.members.ban(targetId, { reason: this.Audit(actor, entry), deleteMessageSeconds: deleteSeconds }));

            return this.Finish(guild, entry, { dm });
        }

        if (action === "kick") {
            const entry = await this.Record(actor, guild, { ...base, action, duration: null, expiresAt: null, active: false, details: {} });
            const dm = config.dm ? await this.Direct(user, entry, guild) : undefined;

            await this.Attempt(entry, "kicken", () => member!.kick(this.Audit(actor, entry)));

            return this.Finish(guild, entry, { dm });
        }

        if (action === "timeout") {
            const duration = this.Duration(request.duration, MAX_TIMEOUT, true)!;
            const earlier = await this.client.modCases.ActiveOf(guild.id, targetId, "timeout", true);
            const entry = await this.Record(actor, guild, {
                ...base,
                action,
                duration,
                expiresAt: Date.now() + duration * 1000,
                active: true,
                details: {},
            });

            await this.Attempt(entry, "stummschalten", () => member!.timeout(duration * 1000, this.Audit(actor, entry)));

            // Ein neuer Timeout ersetzt den alten - Discord kennt nur einen.
            for (const old of earlier) await this.End(old, "replaced", entry, actor, null);

            return this.Finish(guild, entry, { dm: config.dm ? await this.Direct(user, entry, guild) : undefined });
        }

        if (action === "untimeout") {
            if (!member!.isCommunicationDisabled()) throw new ModerationError(`${member!.displayName} ist gar nicht stummgeschaltet.`);

            const earlier = await this.client.modCases.ActiveOf(guild.id, targetId, "timeout", true);
            const entry = await this.Record(actor, guild, {
                ...base,
                action,
                related: earlier[0]?.number ?? related,
                duration: null,
                expiresAt: null,
                active: false,
                details: {},
            });

            await this.Attempt(entry, "freischalten", () => member!.timeout(null, this.Audit(actor, entry)));

            for (const old of earlier) await this.End(old, "lifted", entry, actor, reason);

            return this.Finish(guild, entry, { dm: config.dm ? await this.Direct(user, entry, guild) : undefined });
        }

        // Bleibt: warn.
        if (!reason) throw new ModerationError("Eine Verwarnung braucht einen Grund.");

        const entry = await this.Record(actor, guild, { ...base, action: "warn", duration: null, expiresAt: null, active: true, details: {} });
        const since = config.warnDays ? Date.now() - config.warnDays * 86_400_000 : 0;
        const warns = (await this.client.modCases.ActiveOf(guild.id, targetId, "warn")).filter((warn) => warn.createdAt >= since).length;
        const done = await this.Finish(guild, { ...entry, details: { warns } }, {
            warns,
            dm: config.dm ? await this.Direct(user, { ...entry, details: { warns } }, guild) : undefined,
        });
        const stage = StageFor(config.stages, warns);

        if (!stage) return done;

        // Die Stufe greift: dieselbe Hand, aber als "automatisch" und mit Verweis auf den Warn.
        let outcome: IModDetails["stage"];

        try {
            const auto = await this.Run(
                guild,
                actor,
                { action: stage.action, targetId, duration: stage.duration, reason: `Automatisch: ${warns}. Verwarnung (Fall ${CaseRef(done.number)})` },
                "auto",
                done.number
            );

            outcome = { ...stage, case: auto.number };
        } catch (error) {
            outcome = { ...stage, case: null, error: error instanceof ModerationError ? error.message : "Discord hat abgelehnt." };
        }

        const staged = await this.client.modCases.Mutate(done.id, (current) => ({ details: { ...current.details, stage: outcome } }));

        if (staged) void this.UpdateLog(staged);

        return staged ?? done;
    }

    private async Unban(guild: Guild, actor: IModActor, targetId: string, reason: string | null, source: ModSource): Promise<IModCase> {
        const ban = await guild.bans.fetch(targetId).catch(() => null);

        if (!ban) throw new ModerationError("Dieser User ist hier nicht gebannt.");

        const earlier = await this.client.modCases.ActiveOf(guild.id, targetId, "ban", true);
        const entry = await this.Record(actor, guild, {
            action: "unban",
            targetId,
            targetName: ban.user.username,
            reason,
            source,
            related: earlier[0]?.number ?? null,
            duration: null,
            expiresAt: null,
            active: false,
            details: {},
        });

        await this.Attempt(entry, "entbannen", () => guild.bans.remove(targetId, this.Audit(actor, entry)));

        for (const old of earlier) await this.End(old, "lifted", entry, actor, reason);

        // Keine DM: ohne gemeinsamen Server kommt sie nicht an.
        return this.Finish(guild, entry, {});
    }

    private async Unwarn(guild: Guild, actor: IModActor, request: IModRequest, reason: string | null, source: ModSource): Promise<IModCase> {
        let warn: IModCase | null = null;

        if (request.caseNumber) {
            warn = await this.client.modCases.Get(guild.id, Number(request.caseNumber));

            if (!warn || warn.action !== "warn") throw new ModerationError(`Fall ${CaseRef(Number(request.caseNumber))} ist keine Verwarnung.`);
            if (!warn.active) throw new ModerationError(`Fall ${CaseRef(warn.number)} gilt schon nicht mehr.`);
        } else if (typeof request.targetId === "string" && SNOWFLAKE.test(request.targetId)) {
            [warn] = await this.client.modCases.ActiveOf(guild.id, request.targetId, "warn");

            if (!warn) throw new ModerationError("Dieser User hat keine aktive Verwarnung.");
        } else {
            throw new ModerationError("Welche Verwarnung? Gib den Fall oder den User an.");
        }

        const member = warn.targetId ? await guild.members.fetch(warn.targetId).catch(() => null) : null;

        if (member) this.CheckTarget(guild, actor, member.user, member, "unwarn");

        const entry = await this.Record(actor, guild, {
            action: "unwarn",
            targetId: warn.targetId,
            targetName: member?.displayName ?? warn.targetName,
            reason,
            source,
            related: warn.number,
            duration: null,
            expiresAt: null,
            active: false,
            details: {},
        });
        const config = await this.client.modSettings.Of(guild.id);

        await this.End(warn, "lifted", entry, actor, reason);

        return this.Finish(guild, entry, { dm: member && config.dm ? await this.Direct(member.user, entry, guild) : undefined });
    }

    private async Purge(guild: Guild, actor: IModActor, request: IModRequest, reason: string | null, source: ModSource): Promise<IModCase> {
        const count = Math.floor(Number(request.count));
        const channel = typeof request.channelId === "string" ? guild.channels.cache.get(request.channelId) : undefined;

        if (!Number.isInteger(count) || count < 1 || count > MAX_PURGE) throw new ModerationError(`Zwischen 1 und ${MAX_PURGE} Nachrichten.`);
        if (!channel || !channel.isTextBased() || !("bulkDelete" in channel)) throw new ModerationError("In diesem Kanal gibt es nichts zu löschen.");

        if (actor.member && !channel.permissionsFor(actor.member).has(PermissionFlagsBits.ViewChannel)) {
            throw new ModerationError("Diesen Kanal siehst du selbst nicht.");
        }

        const mine = channel.permissionsFor(guild.members.me!);

        if (!mine?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages])) {
            throw new ModerationError(`In #${channel.name} fehlen mir „Nachrichten verwalten“ oder „Nachrichtenverlauf lesen“.`);
        }

        const targetId = typeof request.targetId === "string" && SNOWFLAKE.test(request.targetId) ? request.targetId : null;
        // Discord löscht in einem Rutsch nur, was jünger als 14 Tage ist. Angeheftetes bleibt stehen.
        const cutoff = Date.now() - 14 * 86_400_000 + 60_000;
        const fetched = await channel.messages.fetch({ limit: 100 });
        const picked = [...fetched.values()]
            .filter((message) => !message.pinned && message.createdTimestamp > cutoff && (!targetId || message.author.id === targetId))
            .slice(0, count);

        if (picked.length === 0) {
            throw new ModerationError("Nichts zu löschen – nur Nachrichten der letzten 14 Tage zählen, angeheftete bleiben stehen.");
        }

        const deleted = await channel.bulkDelete(picked, true).catch((error) => {
            throw this.Failed(error, "löschen");
        });
        const target = targetId ? (fetched.find((message) => message.author.id === targetId)?.member?.displayName ?? null) : null;
        const entry = await this.Record(actor, guild, {
            action: "purge",
            targetId,
            targetName: target ?? (targetId ? (await this.client.users.fetch(targetId).catch(() => null))?.username ?? null : null),
            reason,
            source,
            related: null,
            duration: null,
            expiresAt: null,
            active: false,
            details: { channelId: channel.id, channelName: channel.name, deleted: deleted.size, requested: count },
        });

        return this.Finish(guild, entry, {});
    }

    /* ----------------------------------------------------------
       Bausteine
       ---------------------------------------------------------- */
    /** Die Regeln, bevor irgendwas passiert: nicht sich selbst, nicht den Owner, nur nach unten. */
    private CheckTarget(guild: Guild, actor: IModActor, user: User, member: GuildMember | null, action: ModAction): void {
        const name = member?.displayName ?? user.username;

        if (user.id === actor.id) throw new ModerationError("Dich selbst? Lieber nicht.");
        if (user.id === this.client.user?.id) throw new ModerationError("Mich selbst kann ich damit nicht belegen.");
        if (user.id === guild.ownerId) throw new ModerationError("Nicht beim Owner des Servers.");

        if (!member) return;

        if (actor.member && actor.member.id !== guild.ownerId && member.roles.highest.comparePositionTo(actor.member.roles.highest) >= 0) {
            throw new ModerationError(`${name} steht in der Rollen-Reihenfolge gleich hoch oder über dir.`);
        }

        const able =
            action === "ban" ? member.bannable : action === "kick" ? member.kickable : action === "timeout" || action === "untimeout" ? member.moderatable : true;

        if (!able) {
            throw new ModerationError(
                (action === "timeout" || action === "untimeout") && member.permissions.has(PermissionFlagsBits.Administrator)
                    ? `${name} ist Admin – Admins lassen sich nicht stummschalten.`
                    : `Bei ${name} geht das nicht: meine höchste Rolle steht nicht über der von ${name}.`
            );
        }
    }

    /** Sekunden aus einer Anfrage - Pflicht beim Timeout, beim Bann frei (dann dauerhaft). */
    private Duration(value: unknown, max: number, required: boolean): number | null {
        if (value === null || value === undefined || value === 0) {
            if (required) throw new ModerationError("Wie lange? Es fehlt die Dauer.");

            return null;
        }

        const seconds = Math.floor(Number(value));

        if (!Number.isFinite(seconds) || seconds < MIN_DURATION || seconds > max) {
            throw new ModerationError(`Die Dauer muss zwischen 60 Sekunden und ${max === MAX_TIMEOUT ? "28 Tagen" : "einem Jahr"} liegen.`);
        }

        return seconds;
    }

    private async Record(actor: IModActor, guild: Guild, entry: Omit<NewModCase, "guildId" | "moderatorId" | "moderatorName">): Promise<IModCase> {
        const made = await this.client.modCases.Create({ ...entry, guildId: guild.id, moderatorId: actor.id, moderatorName: actor.name });

        // Offene Dashboard-Fenster ziehen ihre Liste selbst nach.
        this.client.pulseService.Emit(guild.id, "moderation", { id: made.id, action: made.action });

        return made;
    }

    /** Die Discord-Aktion selbst. Scheitert sie, verschwindet der schon angelegte Fall wieder. */
    private async Attempt(entry: IModCase, verb: string, run: () => Promise<unknown>): Promise<void> {
        try {
            await run();
        } catch (error) {
            await this.client.modCases.Delete(entry.id).catch(() => undefined);

            throw this.Failed(error, verb);
        }
    }

    private Failed(error: unknown, verb: string): ModerationError {
        if (error instanceof DiscordAPIError && (error.code === 50013 || error.code === 50001)) {
            return new ModerationError(`Discord lässt mich nicht ${verb} – mir fehlt ein Recht oder meine Rolle steht zu tief.`);
        }

        logger.warn(`🛡️ Moderation: ${verb} fehlgeschlagen - ${String(error)}`);

        return new ModerationError(`Das ${verb.charAt(0).toUpperCase()}${verb.slice(1)} ging nicht – Discord hat abgelehnt.`);
    }

    /** Steht im Audit-Log von Discord: Grund, wer und welcher Fall. */
    private Audit(actor: IModActor, entry: IModCase): string {
        return `${entry.reason ?? "Ohne Grund"} – ${actor.name} (Fall ${CaseRef(entry.number)})`.slice(0, 512);
    }

    private Direct(user: User, entry: IModCase, guild: Guild): Promise<boolean> {
        return user
            .send({ ...DirectView(entry, guild.name), flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } })
            .then(() => true)
            .catch(() => false);
    }

    /** Ein Fall gilt nicht mehr - wie, sagt how; by ist der Fall, der ihn beendet hat. */
    private async End(entry: IModCase, how: IModEnded["how"], by: IModCase | null, actor: IModActor | null, reason: string | null): Promise<void> {
        const ended = await this.client.modCases.Mutate(entry.id, (current) =>
            current.active
                ? {
                      active: false,
                      details: {
                          ...current.details,
                          ended: { how, at: Date.now(), by: actor?.id ?? null, byName: actor?.name ?? null, reason, case: by?.number ?? null },
                      },
                  }
                : null
        );

        if (ended) void this.UpdateLog(ended);
    }

    /** Details nachtragen, die Karte in den Log-Kanal, fertig. */
    private async Finish(guild: Guild, entry: IModCase, details: IModDetails): Promise<IModCase> {
        const extra = Object.fromEntries(Object.entries(details).filter(([, value]) => value !== undefined)) as IModDetails;
        let current = Object.keys(extra).length
            ? ((await this.client.modCases.Mutate(entry.id, (row) => ({ details: { ...row.details, ...extra } }))) ?? entry)
            : entry;
        const { logChannelId } = await this.client.modSettings.Of(guild.id);
        const message = await SendLog(guild, logChannelId, {
            ...(await this.LogCard(current)),
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: { parse: [] },
        });

        if (message) {
            current = (await this.client.modCases.Mutate(current.id, () => ({ logChannel: message.channelId, logMessage: message.id }))) ?? current;
        }

        logger.user(
            `🛡️ Fall ${CaseRef(current.number)} auf ${guild.id}: ${current.action}${current.targetId ? ` gegen ${current.targetId}` : ""} (von ${current.moderatorId}, ${current.source})`
        );

        return current;
    }

    /**
     * Zieht die Karte im Log-Kanal nach - Status, Notizen, Beweise. Je Fall
     * eins nach dem anderen und immer mit dem neuesten Stand: sonst überholt ein
     * langsames Zeichnen ein schnelleres und die Karte zeigt einen alten.
     */
    async UpdateLog(entry: IModCase): Promise<void> {
        if (!entry.logChannel || !entry.logMessage) return;

        const next = (this.logQueue.get(entry.id) ?? Promise.resolve()).then(() => this.EditLog(entry)).catch(() => undefined);

        this.logQueue.set(entry.id, next);
        await next;

        if (this.logQueue.get(entry.id) === next) this.logQueue.delete(entry.id);
    }

    private async EditLog(stale: IModCase): Promise<void> {
        const entry = (await this.client.modCases.ById(stale.id)) ?? stale;

        if (!entry.logChannel || !entry.logMessage) return;

        const guild = this.client.guilds.cache.get(entry.guildId);
        const channel = guild ? (guild.channels.cache.get(entry.logChannel) ?? (await guild.channels.fetch(entry.logChannel).catch(() => null))) : null;

        if (!channel?.isTextBased()) return;

        const message = await channel.messages.fetch(entry.logMessage).catch(() => null);

        // attachments: [] nimmt die Bilder der alten Karte weg, files bringt die neuen.
        await message?.edit({ ...(await this.LogCard(entry)), attachments: [], allowedMentions: { parse: [] } }).catch(() => undefined);
    }

    /** Die gezeichnete Karte (W-0014) - klappt das Zeichnen nicht, die alte als Text. */
    async LogCard(entry: IModCase): Promise<ICaseMessage> {
        return CaseCard(entry, await this.CaseExtra(entry)).catch((error: unknown) => {
            logger.warn(`🛡️ Fall ${CaseRef(entry.number)}: Karte nicht gezeichnet - ${String(error)}`);

            return { ...CaseView(entry, this.Link(entry)), files: [] };
        });
    }

    /** Was die Karte braucht und der Fall nicht selbst weiß: Zählung, Bild des Users, Vorschauen. */
    private async CaseExtra(entry: IModCase): Promise<ICaseExtra> {
        const target = entry.targetId;
        const thumbs = new Map<number, Buffer>();

        for (const item of entry.evidence.slice(0, 3)) {
            const file = await this.EvidenceFile(entry, item);

            if (file) thumbs.set(item.id, file);
        }

        return {
            link: this.Link(entry),
            recent: target && PENALTIES.has(entry.action) ? await this.client.modCases.RecentPenalties(entry.guildId, target, entry.createdAt).catch(() => null) : null,
            avatar: target ? await this.Avatar(target) : null,
            thumbs,
        };
    }

    private async Avatar(userId: string): Promise<Buffer | null> {
        const user = await this.client.users.fetch(userId).catch(() => null);
        const response = user ? await fetch(user.displayAvatarURL({ extension: "png", size: 128 }), { signal: AbortSignal.timeout(3000) }).catch(() => null) : null;

        return response?.ok ? Buffer.from(await response.arrayBuffer()) : null;
    }

    /** Die gespeicherte Datei eines Bild-Beweises - null, wenn sie fehlt oder es keiner ist. */
    async EvidenceFile(entry: IModCase, item: IModEvidence): Promise<Buffer | null> {
        if (item.kind !== "image" || !STORED_EVIDENCE.test(item.value)) return null;

        return readFile(path.join(EVIDENCE_ROOT, entry.guildId, String(entry.id), item.value)).catch(() => null);
    }

    /** Der Fall im Dashboard. */
    Link(entry: Pick<IModCase, "guildId" | "number">): string {
        return `${this.client.server.BaseURL}${DASHBOARD_PATH}/guild/${entry.guildId}/moderation?fall=${entry.number}`;
    }

    /* ----------------------------------------------------------
       Notizen und Beweise
       ---------------------------------------------------------- */
    /** W-0071: Ausgeblendete Fälle gibt es nur mit withHidden - für die, die den Server verwalten. */
    async CaseOf(guildId: string, number: number, withHidden = false): Promise<IModCase> {
        const entry = Number.isInteger(number) && number > 0 ? await this.client.modCases.Get(guildId, number) : null;

        if (!entry || (entry.hidden && !withHidden)) throw new ModerationError(`Fall ${CaseRef(number)} gibt es hier nicht.`);

        return entry;
    }

    /**
     * W-0071: Ein Fall wird nie ganz gelöscht, nur für Moderatoren ausgeblendet.
     * Grund ist Pflicht. Die Karte im Log-Kanal geht weg - den lesen Moderatoren
     * mit. Eine laufende Strafe in Discord bleibt, Ausblenden hebt nichts auf.
     */
    async Hide(guild: Guild, member: GuildMember, number: number, reason: unknown): Promise<IModCase> {
        if (!(await this.CanView(member))) throw new ModerationError("Ausblenden darf nur das Moderations-Team.");

        const text = typeof reason === "string" ? reason.trim().slice(0, HIDE_REASON_MAX) : "";

        if (text.length < 3) throw new ModerationError("Schreib kurz dazu, warum der Fall ausgeblendet wird.");

        const entry = await this.CaseOf(guild.id, number);
        const hidden = await this.client.modCases.Mutate(entry.id, (row) =>
            row.hidden ? null : { hidden: { at: Date.now(), by: member.id, byName: member.displayName, reason: text }, logChannel: null, logMessage: null }
        );

        if (!hidden?.hidden || hidden.hidden.by !== member.id) throw new ModerationError(`Fall ${CaseRef(number)} ist schon ausgeblendet.`);

        if (entry.logChannel && entry.logMessage) {
            const channel = guild.channels.cache.get(entry.logChannel) ?? (await guild.channels.fetch(entry.logChannel).catch(() => null));

            if (channel?.isTextBased()) await channel.messages.delete(entry.logMessage).catch(() => undefined);
        }

        this.client.pulseService.Emit(guild.id, "moderation", { id: entry.id, action: entry.action });
        logger.user(`🙈 Fall ${CaseRef(number)} auf ${guild.id} ausgeblendet (von ${member.id})`);

        return hidden;
    }

    /** W-0071: Wieder einblenden darf nur, wer den Server verwaltet. Der Fall bekommt eine neue Karte im Log-Kanal. */
    async Unhide(guild: Guild, member: GuildMember, number: number): Promise<IModCase> {
        if (!this.CanManage(member)) throw new ModerationError("Wieder einblenden darf nur, wer den Server verwaltet.");

        const entry = await this.CaseOf(guild.id, number, true);

        if (!entry.hidden) throw new ModerationError(`Fall ${CaseRef(number)} ist nicht ausgeblendet.`);

        let shown = (await this.client.modCases.Mutate(entry.id, () => ({ hidden: null }))) ?? entry;
        const { logChannelId } = await this.client.modSettings.Of(guild.id);
        const message = await SendLog(guild, logChannelId, { ...(await this.LogCard(shown)), flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });

        if (message) shown = (await this.client.modCases.Mutate(shown.id, () => ({ logChannel: message.channelId, logMessage: message.id }))) ?? shown;

        this.client.pulseService.Emit(guild.id, "moderation", { id: entry.id, action: entry.action });
        logger.user(`👁️ Fall ${CaseRef(number)} auf ${guild.id} wieder eingeblendet (von ${member.id})`);

        return shown;
    }

    async AddNote(guildId: string, author: IModActor, number: number, text: unknown): Promise<IModCase> {
        const clean = typeof text === "string" ? text.trim().slice(0, MAX_NOTE) : "";

        if (!clean) throw new ModerationError("Die Notiz ist leer.");

        const entry = await this.CaseOf(guildId, number);
        const updated = await this.client.modCases.Mutate(entry.id, (current) => {
            if (current.notes.length >= MAX_NOTES) throw new ModerationError(`Mehr als ${MAX_NOTES} Notizen gehen an einem Fall nicht.`);

            const id = Math.max(0, ...current.notes.map((note) => note.id)) + 1;

            return { notes: [...current.notes, { id, by: author.id, byName: author.name, at: Date.now(), text: clean }] };
        });

        if (updated) void this.UpdateLog(updated);

        return updated ?? entry;
    }

    async RemoveNote(guildId: string, member: GuildMember, number: number, noteId: number): Promise<IModCase> {
        const entry = await this.CaseOf(guildId, number);
        const manage = this.CanManage(member);
        const updated = await this.client.modCases.Mutate(entry.id, (current) => {
            const note = current.notes.find((item) => item.id === noteId);

            if (!note) throw new ModerationError("Diese Notiz gibt es nicht mehr.");
            if (note.by !== member.id && !manage) throw new ModerationError("Fremde Notizen entfernt nur, wer den Server verwaltet.");

            return { notes: current.notes.filter((item) => item.id !== noteId) };
        });

        if (updated) void this.UpdateLog(updated);

        return updated ?? entry;
    }

    async AddLink(guildId: string, author: IModActor, number: number, url: unknown, name?: unknown): Promise<IModCase> {
        const value = typeof url === "string" ? url.trim() : "";

        if (!IsHttps(value)) throw new ModerationError(HTTPS_ONLY);

        return this.AddEvidence(guildId, author, number, "link", value, typeof name === "string" ? name.trim().slice(0, 100) || null : null);
    }

    /** Ein Bild als Beweis - einmal durch den Canvas, so bleibt nichts als Pixel übrig. */
    async AddImage(guildId: string, author: IModActor, number: number, buffer: Buffer, type: string, name: string | null): Promise<IModCase> {
        if (!EVIDENCE_TYPES.has(type)) throw new ModerationError("Nur PNG, JPG, GIF oder WebP.");
        if (buffer.length === 0 || buffer.length > MAX_EVIDENCE_BYTES) throw new ModerationError("Das Bild ist leer oder größer als 8 MB.");

        const entry = await this.CaseOf(guildId, number);
        const image = await Shrink(buffer, type).catch(() => {
            throw new ModerationError("Das Bild ließ sich nicht lesen.");
        });
        const directory = path.join(EVIDENCE_ROOT, guildId, String(entry.id));

        // Erst die Nummer unter Sperre, dann die Datei: bei 20 Beweisen bleibt keine liegen, zwei zugleich überschreiben sich nicht.
        return this.AddEvidence(guildId, author, number, "image", (id) => `${id}${image.extension}`, name ? name.slice(0, 100) : null, undefined, async (file) => {
            await mkdir(directory, { recursive: true });
            await writeFile(path.join(directory, file), image.buffer);
        });
    }

    /**
     * Mehrere Beweise auf einmal, jeder für sich: was nicht klappt, steht mit
     * Grund in problems, der Rest kommt trotzdem an den Fall.
     */
    async AddProof(guild: Guild, author: IModActor, number: number, proof: IModProof): Promise<{ entry: IModCase; problems: string[] }> {
        const problems: string[] = [];
        const attempt = (what: string, run: () => Promise<unknown>) => run().catch((error: unknown) => void problems.push(ProofProblem(what, error)));
        const keep = (result: { problems: string[] }) => void problems.push(...result.problems);
        const { image, message } = proof;
        const link = proof.link?.trim();

        if (image) await attempt("Bild", () => this.AddAttachment(guild.id, author, number, image));

        if (link && MESSAGE_LINK.test(link)) {
            await attempt("Nachricht", async () => keep(await this.AddMessage(guild, author, number, await this.LinkedMessage(guild, author, link))));
        } else if (link) {
            await attempt("Link", () => this.AddLink(guild.id, author, number, link));
        }

        if (message) await attempt("Nachricht", async () => keep(await this.AddMessage(guild, author, number, message)));

        return { entry: await this.CaseOf(guild.id, number), problems };
    }

    /**
     * Die Nachricht hinter einem Nachrichtenlink - nur von diesem Server, nur
     * aus Kanälen, die der Bot und der Sichernde lesen dürfen. Sonst sähe das
     * Team über den Fall, was es nicht sehen soll.
     */
    private async LinkedMessage(guild: Guild, author: IModActor, link: string): Promise<Message> {
        const target = ParseMessageLink(link, guild.id);

        if (!target) throw new ModerationError(FOREIGN_LINK);

        const channel = guild.channels.cache.get(target.channelId) ?? (await guild.channels.fetch(target.channelId).catch(() => null));
        const me = guild.members.me ?? (await guild.members.fetchMe());
        const read = PermissionFlagsBits.ViewChannel | PermissionFlagsBits.ReadMessageHistory;

        if (!channel?.isTextBased() || !channel.permissionsFor(me).has(read)) throw new ModerationError("In diesen Kanal kann ich nicht hineinsehen.");
        if (author.member && !channel.permissionsFor(author.member).has(read)) throw new ModerationError("Diesen Kanal kannst du selbst nicht lesen.");

        const found = await channel.messages.fetch(target.messageId).catch(() => null);

        if (!found) throw new ModerationError("Diese Nachricht gibt es nicht mehr.");

        return found;
    }

    /**
     * Eine Nachricht als Beweis, wie sie jetzt ist: Verfasser, Kanal, Zeit und
     * Text bleiben am Fall, auch wenn sie später gelöscht wird. Ihre Bilder
     * werden eigene Bild-Beweise; eins, das nicht klappt, steht in problems.
     */
    async AddMessage(guild: Guild, author: IModActor, number: number, message: Message): Promise<{ entry: IModCase; problems: string[] }> {
        const snapshot: IModMessageProof = {
            authorId: message.author.id,
            authorName: message.member?.displayName ?? message.author.username,
            channelId: message.channelId,
            channelName: "name" in message.channel ? (message.channel.name ?? "") : "",
            content: message.content.slice(0, MAX_PROOF_TEXT),
            sentAt: message.createdTimestamp,
        };
        let entry = await this.AddEvidence(guild.id, author, number, "message", message.url, snapshot.content.slice(0, 100) || null, snapshot);
        const problems: string[] = [];
        const images = [...message.attachments.values()].filter((file) => (file.contentType ?? "").startsWith("image/"));

        for (const [index, image] of images.entries()) {
            try {
                entry = await this.AddAttachment(guild.id, author, number, image);
            } catch (error) {
                problems.push(ProofProblem(`Bild ${index + 1} der Nachricht`, error));
            }
        }

        return { entry, problems };
    }

    /** Ein Anhang aus Discord (/fall beweis) - nur von Discords eigenem Speicher. */
    async AddAttachment(guildId: string, author: IModActor, number: number, attachment: { url: string; size: number; contentType: string | null; name: string }): Promise<IModCase> {
        const fault = AttachmentFault(attachment);

        if (fault) throw new ModerationError(fault);

        // Ein hängender Download hielte die Antwort an den Moderator auf.
        const response = await fetch(attachment.url, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
        const body = response?.ok ? await response.arrayBuffer().catch(() => null) : null;

        if (!body) throw new ModerationError("Der Anhang ließ sich nicht laden.");

        return this.AddImage(guildId, author, number, Buffer.from(body), (attachment.contentType ?? "").split(";")[0], attachment.name);
    }

    /**
     * Die Nummer vergibt Mutate unter Sperre - zwei Beweise zugleich bekommen
     * nie dieselbe. Ein Bild heißt nach ihr: value baut den Dateinamen, store
     * legt die Datei ab, bevor die Karte sie zeichnet. Klappt das nicht, geht
     * der Beweis wieder weg.
     */
    private async AddEvidence(
        guildId: string,
        author: IModActor,
        number: number,
        kind: "image" | "link" | "message",
        value: string | ((id: number) => string),
        name: string | null,
        message?: IModMessageProof,
        store?: (value: string) => Promise<void>
    ): Promise<IModCase> {
        const entry = await this.CaseOf(guildId, number);
        let added = 0;
        let stored = "";
        const updated = await this.client.modCases.Mutate(entry.id, (current) => {
            if (current.evidence.length >= MAX_EVIDENCE) throw new ModerationError(`Mehr als ${MAX_EVIDENCE} Beweise gehen an einem Fall nicht.`);

            added = Math.max(0, ...current.evidence.map((item) => item.id)) + 1;
            stored = typeof value === "string" ? value : value(added);

            return { evidence: [...current.evidence, { id: added, kind, value: stored, name, ...(message ? { message } : {}), by: author.id, byName: author.name, at: Date.now() }] };
        });

        if (store && added) {
            try {
                await store(stored);
            } catch (error) {
                await this.client.modCases.Mutate(entry.id, (current) => ({ evidence: current.evidence.filter((item) => item.id !== added) })).catch(() => null);

                throw error;
            }
        }

        if (updated) void this.UpdateLog(updated);

        return updated ?? entry;
    }

    async RemoveEvidence(guildId: string, member: GuildMember, number: number, evidenceId: number): Promise<IModCase> {
        const entry = await this.CaseOf(guildId, number);
        const manage = this.CanManage(member);
        let removed: string | null = null;
        const updated = await this.client.modCases.Mutate(entry.id, (current) => {
            const item = current.evidence.find((evidence) => evidence.id === evidenceId);

            if (!item) throw new ModerationError("Diesen Beweis gibt es nicht mehr.");
            if (item.by !== member.id && !manage) throw new ModerationError("Fremde Beweise entfernt nur, wer den Server verwaltet.");

            removed = item.kind === "image" ? item.value : null;

            return { evidence: current.evidence.filter((evidence) => evidence.id !== evidenceId) };
        });

        if (removed) await rm(path.join(EVIDENCE_ROOT, guildId, String(entry.id), removed), { force: true }).catch(() => undefined);
        if (updated) void this.UpdateLog(updated);

        return updated ?? entry;
    }

    /** Der Pfad eines Beweisbilds - null, wenn der Name nicht passt. */
    EvidencePath(guildId: string, caseId: number, file: string): string | null {
        return STORED_EVIDENCE.test(file) ? path.join(EVIDENCE_ROOT, guildId, String(caseId), file) : null;
    }

    /* ----------------------------------------------------------
       Minütlich: befristete Banns und Timeouts
       ---------------------------------------------------------- */
    async RunDue(): Promise<void> {
        if (!this.client.databaseService.Ready || !this.client.user) return;

        for (const due of await this.client.modCases.Due(Date.now())) {
            const guild = this.client.guilds.cache.get(due.guildId);

            // Timeouts hebt Discord selbst auf - hier wird nur ausgetragen. Ohne Server ebenso.
            if (due.action === "timeout" || !guild || !due.targetId) {
                await this.End(due, "expired", null, null, null);
                continue;
            }

            const bot: IModActor = { id: this.client.user.id, name: this.client.user.username, member: guild.members.me };

            try {
                await guild.bans.remove(due.targetId, `Befristeter Bann abgelaufen (Fall ${CaseRef(due.number)})`);
            } catch (error) {
                // 10026: der Bann ist schon weg - etwa von Hand aufgehoben. Dann nur austragen.
                if (!(error instanceof DiscordAPIError && error.code === 10026)) {
                    if (!this.stuck.has(due.id)) logger.warn(`🛡️ Fall ${CaseRef(due.number)} auf ${due.guildId}: Bann nicht aufhebbar - ${String(error)}`);

                    this.stuck.add(due.id);
                    continue;
                }
            }

            const entry = await this.Record(bot, guild, {
                action: "unban",
                targetId: due.targetId,
                targetName: due.targetName,
                reason: `Befristeter Bann abgelaufen (Fall ${CaseRef(due.number)})`,
                source: "auto",
                related: due.number,
                duration: null,
                expiresAt: null,
                active: false,
                details: {},
            });

            await this.End(due, "expired", entry, bot, null);
            await this.Finish(guild, entry, {});
        }
    }

    /** Jemand hat in Discord selbst entbannt: offene Bann-Fälle enden damit. */
    async BanRemoved(guild: Guild, userId: string): Promise<void> {
        if (!this.client.databaseService.Ready) return;

        // W-0071: auch ein ausgeblendeter Bann endet, wenn ihn jemand in Discord aufhebt.
        for (const ban of await this.client.modCases.ActiveOf(guild.id, userId, "ban", true)) await this.End(ban, "discord", null, null, null);
    }
}
