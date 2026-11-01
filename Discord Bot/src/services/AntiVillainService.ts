import {
    Attachment,
    ButtonInteraction,
    ChannelType,
    Guild,
    GuildMember,
    InteractionReplyOptions,
    Message,
    MessageFlags,
    PartialGuildMember,
    PermissionFlagsBits,
    StringSelectMenuInteraction,
    TextBasedChannel,
} from "discord.js";
import { LRUCache } from "lru-cache";
import BotClient from "../client/BotClient";
import ComponentV2Builder from "../builder/ComponentV2Builder";
import { BaitCard, ChannelNotice, DeletedView, HoldCard } from "../builder/AntiVillainView";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import MessageIndex from "./antivillain/MessageIndex";
import Quarantine, { QuarantineError } from "./antivillain/Quarantine";
import Raid from "./antivillain/Raid";
import Nuke from "./antivillain/Nuke";
import { ScoreBook, Verdict } from "./antivillain/Score";
import { EveryoneAttempt, Fingerprints, HopTracker, IsSleeper, NameSimilarity, NormalizeName, ScamLinks } from "./antivillain/Guards";
import { AVATAR_SAME, AvatarHash, HasQr, HashDistance } from "./antivillain/Images";
import { SendLog } from "../utils/logtarget";
import { AskAdmin, IBackupCall } from "../routes/DashboardApiBackups";
import {
    ANTI_VILLAIN_MODULE,
    DECAY_MS,
    FRESH_MS,
    HOP_CHANNELS,
    NAME_SIMILAR,
    NOTICE_MS,
    CASE_KEEP_MS,
    DEBRIS_KEEP_MS,
    PROTOCOL_KEEP_MS,
    REPORT_COOLDOWN_MS,
    SAFETY_DEBOUNCE_MS,
    GUARDS,
    QR_MAX_BYTES,
    QR_MAX_IMAGES,
    QR_MAX_SIDE,
    TEAM_ONLY,
    TRUST_MS,
    CLEANUP_OPTIONS,
    DefaultAntiVillainSettings,
    GUARD_IDS,
    LEVEL_IDS,
    MAX_TRUSTED,
    NUKE_ACTIONS,
    NUKE_LIMIT_RANGE,
    RAID_END_RANGE,
    RAID_JOINS_RANGE,
} from "../constants/AntiVillain";
import { CleanupMinutes, GuardId, IAntiVillainSettings, IAvCase, IHit, SafetyResult, ShieldLevel } from "../interfaces/services/antivillain/IAntiVillain";
import { IsLogTarget, WarmLogTarget } from "../utils/logtarget";
import { SNAPSHOT_WAIT_MS } from "../constants/ServerBackup";

export class AntiVillainError extends Error {}

const WHY: [GuardId, string][] = [
    ["bait", "Du hast in den Köder-Kanal geschrieben, der für Bots gedacht ist."],
    ["hop", "Von deinem Account kam gerade dieselbe Nachricht in mehreren Kanälen."],
    ["scam", "Von deinem Account kam ein Betrugslink."],
    ["qr", "Von deinem Account kam ein Bild mit QR-Code, wie es Betrüger nutzen."],
    ["everyone", "Dein Account wollte alle auf dem Server anpingen."],
    ["lookalike", "Dein Name sieht aus wie der eines Teammitglieds."],
    ["report", "Mehrere Mitglieder haben deinen Account gemeldet."],
];

/** Der Satz für die Person: der wichtigste Grund zuerst. */
export function WhyText(hits: IHit[]): string {
    return WHY.find(([guard]) => hits.some((hit) => hit.guard === guard))?.[1] ?? "Dein Account ist gerade sehr auffällig.";
}

function IsRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function Flag(value: unknown, fallback: boolean): boolean {
    return typeof value === "boolean" ? value : fallback;
}

function Clamp(value: unknown, fallback: number, [min, max]: readonly [number, number]): number {
    if (typeof value !== "number" || !Number.isFinite(value)) return fallback;

    return Math.min(max, Math.max(min, Math.round(value)));
}

function OneOf<T extends string | number>(value: unknown, options: readonly T[], fallback: T): T {
    return options.includes(value as T) ? (value as T) : fallback;
}

/**
 * Anti Villain (Plan 31): hält gekaperte Accounts fest, stellt Köder, schützt vor
 * Raids und Nukes. Die reine Logik liegt in services/antivillain/, hier hängt sie
 * an Discord, Datenbank und Karten. Siehe docs/AntiVillain.md.
 */
export default class AntiVillainService {
    private readonly client: BotClient;
    readonly index = new MessageIndex();
    readonly scores = new ScoreBook();
    readonly hop = new HopTracker();
    /** Wer in der letzten Stunde schon eine Verdachts-Meldung bekommen hat. */
    private readonly warned = new LRUCache<string, number>({ max: 10_000, ttl: DECAY_MS });
    /** Das letzte Sicherheits-Backup je Server - höchstens eins in 10 Minuten. */
    private readonly safety = new Map<string, { at: number; result: SafetyResult | null }>();
    /** Teammitglieder je Server und Avatar-Hashes für den Doppelgänger-Wächter. */
    private readonly teams = new LRUCache<string, GuildMember[]>({ max: 1000, ttl: 60_000 });
    private readonly avatars = new LRUCache<string, string>({ max: 5000, ttl: 3_600_000 });
    readonly quarantine: Quarantine;
    readonly raid: Raid;
    readonly nuke: Nuke;
    /** Seit wann der Dienst läuft - davor kennt der Nachrichten-Index nichts. */
    startedAt = Date.now();
    private timer: NodeJS.Timeout | null = null;

    constructor(client: BotClient) {
        this.client = client;
        this.quarantine = new Quarantine(client);
        this.raid = new Raid(client);
        this.nuke = new Nuke(client);
        // Erste riskante Aktion beim Anti-Nuke: ein Sicherheits-Backup, damit es vor dem Nuke liegt.
        this.nuke.onRisky = (guild, executorId, why) => this.SafetyBackup(guild, `${guild.members.cache.get(executorId)?.user.username ?? executorId}: ${why}`);
    }

    /** Zeitgeber starten: 24-Stunden-Freigabe alle 5 Minuten. Erst wenn der Bot bereit ist. */
    Start(): void {
        if (this.timer) return;

        // Ein Raid, der beim Neustart noch lief: beenden, Slowmode und Verifizierung zurück.
        void this.raid.Recover().catch(() => undefined);

        this.timer = setInterval(() => void this.quarantine.Tick(Date.now()).catch(() => undefined), 5 * 60_000);
        this.timer.unref();
    }

    /**
     * Stündlich (runnables/AntiVillainPrune): Protokoll und abgeschlossene Fälle
     * nach 30 Tagen, Vorfälle samt aufgehobener Trümmer nach 7, abgelaufenes
     * „Vertraut“ und Meldungen älter als 24 Stunden.
     */
    async Prune(now = Date.now()): Promise<void> {
        this.nuke.PruneDebris(now);

        await Promise.all([
            this.client.avEvents.Prune(now - PROTOCOL_KEEP_MS),
            this.client.avCases.Prune(now - CASE_KEEP_MS),
            this.client.avIncidents.Prune(now - DEBRIS_KEEP_MS),
            this.client.avDebris.Prune(now - DEBRIS_KEEP_MS),
            this.client.avTrust.Prune(now),
            this.client.avReports.Prune(now - REPORT_COOLDOWN_MS),
        ]);
    }

    /** Ist das Modul auf diesem Server an? */
    async On(guildId: string): Promise<boolean> {
        return (await this.client.settings.Of(guildId)).modules.includes(ANTI_VILLAIN_MODULE);
    }

    /** Team: Besitzer, „Server verwalten“ oder auf der Moderatoren-Liste. */
    async IsTeam(member: GuildMember): Promise<boolean> {
        if (member.id === member.guild.ownerId || member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;

        return this.client.moderationService.IsModerator(member);
    }

    DashboardUrl(guildId: string): string {
        return `${this.client.server.BaseURL}${DASHBOARD_PATH}/guild/${guildId}/anti-villain`;
    }

    /* ----------------------------------------------------------
       Ablauf: Nachricht → Wächter → Punkte → Folge
       ---------------------------------------------------------- */
    async OnMessage(message: Message): Promise<void> {
        if (!message.inGuild() || message.author.bot || message.webhookId) return;
        if (!(await this.On(message.guildId))) return;

        const now = Date.now();
        const guild = message.guild;
        const member = message.member ?? (await guild.members.fetch(message.author.id).catch(() => null));

        if (!member) return;

        const settings = await this.Settings(guild.id);
        const files = [...message.attachments.values()];

        this.index.Note(guild.id, member.id, message.channelId, message.id, now, message.content, files.map((file) => file.name));

        // Köder-Kanal: Wer hier schreibt, ist ein Bot oder gekapert. Das Team darf.
        if (settings.bait.channel && settings.bait.channelId === message.channelId) {
            if (await this.IsTeam(member)) return;

            await message.delete().catch(() => undefined);
            await this.Caught(guild, member, "schrieb in den Köder-Kanal");
            return;
        }

        const hits: { guard: GuardId; detail: string }[] = [];
        const on = (guard: GuardId) => settings.guards[guard];
        const key = `${guild.id}:${member.id}`;

        if (on("hop")) {
            const prints = Fingerprints({ content: message.content, attachments: files.map((file) => ({ size: file.size, width: file.width ?? null, height: file.height ?? null, contentType: file.contentType ?? null })) });
            const channels = prints.length ? this.hop.Note(key, message.channelId, prints, now) : 0;

            if (channels >= HOP_CHANNELS) hits.push({ guard: "hop", detail: `gleiche Nachricht in ${channels} Kanälen in einer Minute` });
        }

        const scam = on("scam") ? ScamLinks(message.content) : [];

        if (scam.length) hits.push({ guard: "scam", detail: scam.map((domain) => `\`${domain}\``).join(", ") });
        if (on("everyone") && EveryoneAttempt(message.content, member.permissions.has(PermissionFlagsBits.MentionEveryone))) hits.push({ guard: "everyone", detail: "ohne Recht" });
        if (on("qr") && (await this.HasQrImage(files))) hits.push({ guard: "qr", detail: "QR-Code in einem Bild" });
        if (on("sleeper") && /https?:\/\//i.test(message.content)) {
            const last = await this.LastMessage(guild.id, member.id);
            // Ein Wert aus den letzten Sekunden stammt schon von dieser Nachricht: dann weiß der Bot nichts.
            if (last !== null && message.createdTimestamp - last > 5_000 && IsSleeper(last, now)) hits.push({ guard: "sleeper", detail: `${Math.floor((now - last) / 86_400_000)} Tage still` });
        }

        if (hits.length === 0) return;
        if (on("fresh") && now - member.user.createdTimestamp < FRESH_MS) hits.push({ guard: "fresh", detail: `Account ${Math.max(1, Math.floor((now - member.user.createdTimestamp) / 86_400_000))} Tage alt` });

        await this.Score(guild, member, hits, now);
    }

    /** Punkte zählen, Urteil fällen, handeln. */
    async Score(guild: Guild, member: GuildMember, hits: { guard: GuardId; detail: string; points?: number }[], now = Date.now()): Promise<void> {
        const settings = await this.Settings(guild.id);
        const key = `${guild.id}:${member.id}`;
        let score = this.scores.Of(key, now);

        for (const hit of hits) score = this.scores.Add(key, hit.guard, hit.detail, now, hit.points);

        let verdict = Verdict(score.total, settings.level, await this.IsTeam(member), settings.team);

        // Vertraute (Rolle oder „War kein Hack“) werden nur gemeldet.
        if (verdict === "hold" && ((settings.trustedRoles.some((role) => member.roles.cache.has(role))) || (await this.client.avTrust.Until(guild.id, member.id)) > now)) verdict = "report";
        if (verdict === "none") return;

        await this.Act(guild, member, verdict, score.hits, now);
    }

    async Act(guild: Guild, member: GuildMember, verdict: "report" | "hold", hits: IHit[], now = Date.now()): Promise<void> {
        if (verdict === "hold") {
            await this.quarantine.Hold(guild, member, hits, WhyText(hits));
            return;
        }

        // Je Person höchstens eine Meldung in der Stunde - der Meldekanal soll nicht volllaufen.
        const key = `${guild.id}:${member.id}`;

        if (this.warned.has(key)) return;
        this.warned.set(key, now);

        const settings = await this.Settings(guild.id);
        const pseudo: IAvCase = {
            id: 0,
            guildId: guild.id,
            userId: member.id,
            status: "open",
            score: Math.min(100, hits.reduce((sum, hit) => sum + hit.points, 0)),
            hits,
            timeline: [],
            savedRoles: [],
            partial: [],
            deleted: [],
            teamMessageId: null,
            personMessageId: null,
            incidentId: null,
            createdAt: now,
            closedAt: null,
            closedBy: null,
        };

        await SendLog(
            guild,
            settings.logChannelId,
            HoldCard({ case: pseudo, userName: member.user.username, avatarUrl: member.user.displayAvatarURL?.() || null, ping: null, dashboardUrl: this.DashboardUrl(guild.id), partial: [], incomplete: false, mode: "report", quarantineChannelId: null })
        );
        await this.client.avEvents.Add(guild.id, "report", `Verdacht: ${member.user.username}`, hits.map((hit) => hit.detail).join(" · ")).catch(() => undefined);
    }

    /** Lädt ein Bild. Eigene Methode, damit die Checks es ersetzen können. */
    async FetchImage(url: string): Promise<Buffer> {
        const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });

        return Buffer.from(await response.arrayBuffer());
    }

    /** Wann jemand zuletzt geschrieben hat, aus dem Level System. null: unbekannt. */
    async LastMessage(guildId: string, userId: string): Promise<number | null> {
        const entry = await this.client.levels.Of(guildId, userId).catch(() => null);

        return entry?.lastMessage || null;
    }

    private async HasQrImage(files: Attachment[]): Promise<boolean> {
        const images = files
            .filter((file) => (file.contentType ?? "").startsWith("image/") && file.size <= QR_MAX_BYTES && (file.width ?? 0) <= QR_MAX_SIDE && (file.height ?? 0) <= QR_MAX_SIDE)
            .slice(0, QR_MAX_IMAGES);

        for (const file of images) {
            const found = await this.FetchImage(file.url).then(HasQr).catch(() => false);

            if (found) return true;
        }

        return false;
    }

    /* ----------------------------------------------------------
       Beitritte und Änderungen: Doppelgänger, Wiederkommen
       ---------------------------------------------------------- */
    async OnJoin(member: GuildMember): Promise<void> {
        if (member.user.bot) return;

        // Wer festgehalten geht und wiederkommt, bleibt festgehalten - auch wenn das Modul inzwischen aus ist.
        await this.quarantine.OnRejoin(member);

        if (!(await this.On(member.guild.id))) return;

        await this.raid.OnJoin(member);
        await this.CheckLookalike(member);
    }

    async OnMemberUpdate(before: GuildMember | PartialGuildMember, after: GuildMember): Promise<void> {
        if (after.user.bot || !(await this.On(after.guild.id))) return;

        const { bait } = await this.Settings(after.guild.id);

        // Köder-Rolle: egal wie sie kam (Rollen-Panel, Onboarding), wer sie neu hat, ist gefangen.
        if (bait.role && bait.roleId && !before.roles.cache.has(bait.roleId) && after.roles.cache.has(bait.roleId) && !(await this.IsTeam(after))) {
            await this.Caught(after.guild, after, "bekam die Köder-Rolle");
            return;
        }
        if (before.displayName !== after.displayName || before.avatar !== after.avatar) await this.CheckLookalike(after);
    }

    /** Die Teammitglieder im Cache - mit ihnen vergleicht der Doppelgänger-Wächter. */
    private async TeamMembers(guild: Guild): Promise<GuildMember[]> {
        // Eine Minute aus dem Speicher: Sonst prüft jeder Beitritt den ganzen Mitglieder-Cache.
        const known = this.teams.get(guild.id);

        if (known) return known;

        const team: GuildMember[] = [];

        for (const member of guild.members.cache.values()) if (!member.user.bot && (await this.IsTeam(member))) team.push(member);

        this.teams.set(guild.id, team);

        return team;
    }

    /** Der Hash eines Avatars, eine Stunde gemerkt. "" heißt: ließ sich nicht laden. */
    private async AvatarOf(url: string): Promise<string | null> {
        const known = this.avatars.get(url);

        if (known !== undefined) return known || null;

        const hash = await this.FetchImage(url).then(AvatarHash).catch(() => null);

        this.avatars.set(url, hash ?? "");

        return hash;
    }

    private async CheckLookalike(member: GuildMember): Promise<void> {
        const settings = await this.Settings(member.guild.id);

        // Während eines Raids nicht: Die Welle wird ohnehin festgehalten, und jeder Beitritt kostete Zeit.
        if (!settings.guards.lookalike || this.raid.Active(member.guild.id) || (await this.IsTeam(member))) return;

        const name = NormalizeName(member.displayName);
        const team = (await this.TeamMembers(member.guild)).filter((entry) => entry.id !== member.id);
        let twin = team.find((entry) => NameSimilarity(name, NormalizeName(entry.displayName)) >= NAME_SIMILAR || NameSimilarity(name, NormalizeName(entry.user.username)) >= NAME_SIMILAR);

        if (!twin) {
            const own = member.user.displayAvatarURL?.({ extension: "png", size: 64 });
            const mine = own ? await this.AvatarOf(own) : null;

            for (const entry of mine ? team.slice(0, 10) : []) {
                const url = entry.user.displayAvatarURL?.({ extension: "png", size: 64 });
                const theirs = url ? await this.AvatarOf(url) : null;

                if (theirs && HashDistance(mine!, theirs) <= AVATAR_SAME) {
                    twin = entry;
                    break;
                }
            }
        }

        if (twin) await this.Score(member.guild, member, [{ guard: "lookalike", detail: `ähnelt ${twin.displayName}` }]);
    }

    /* ----------------------------------------------------------
       Sicherheits-Backup (zusammen mit dem Backup-Modul)
       ---------------------------------------------------------- */
    /**
     * Legt über die interne Schnittstelle des Admin Dashboards ein Backup der Art
     * „Sicherheit“ an. Höchstens eins je Server in 10 Minuten, danach kommt das
     * letzte zurück. Klappt es nicht, sagt das Ergebnis warum - der Anti-Nuke macht
     * trotzdem weiter.
     */
    /** null: „Vor riskanten Änderungen“ ist aus, dann keine Zeile auf der Karte (Plan 32). */
    async SafetyBackup(guild: Guild, why: string): Promise<SafetyResult | null> {
        const now = Date.now();
        const last = this.safety.get(guild.id);

        if (last && now - last.at < SAFETY_DEBOUNCE_MS) return last.result;

        // Plan 32: mit dem Discord-Server, damit „Reparieren“ ihn aus diesem Backup zurückholen kann.
        const answer = await this.AskBackups(guild, { method: "POST", path: "", body: { kind: "schutz", note: `vor dem Anti-Nuke: ${why}`.slice(0, 200), parts: ["bot", "server"] }, timeout: SNAPSHOT_WAIT_MS });
        const made = answer.body as { id?: unknown; createdAt?: unknown; error?: unknown; skipped?: unknown } | null;

        if (answer.status === 200 && typeof made?.skipped === "string") {
            this.safety.set(guild.id, { at: now, result: null });
            return null;
        }

        const result: SafetyResult =
            answer.status === 200 && typeof made?.id === "number"
                ? { ok: true, id: made.id, at: typeof made.createdAt === "string" ? made.createdAt : new Date(now).toISOString() }
                : { ok: false, reason: typeof made?.error === "string" ? made.error : "Der Backup-Dienst hat nicht geantwortet." };

        this.safety.set(guild.id, { at: now, result });
        // Plan 32: die kleine Karte „Gesichert vor dem Anti-Nuke“ in den Meldekanal der Backups.
        if (result.ok) void this.client.serverBackupService.SafetyNotice(guild, { at: now, why, backupId: result.id }).catch(() => undefined);
        await this.client.avEvents.Add(guild.id, "backup", result.ok ? "Sicherheits-Backup angelegt" : "Sicherheits-Backup ging nicht", result.ok ? why : result.reason).catch(() => undefined);

        return result;
    }

    /** Der Aufruf an die Backups. Eigene Methode, damit die Checks ihn ersetzen können. */
    async AskBackups(guild: Guild, call: IBackupCall): Promise<{ status: number; body: unknown }> {
        return AskAdmin(this.client.config.ADMIN_INTERNAL_URL, this.client.config.SERVER_JWT_SECRET, guild.id, { id: this.client.user?.id ?? "bot", name: "Anti Villain" }, guild.name, call);
    }

    /* ----------------------------------------------------------
       „Hack melden“
       ---------------------------------------------------------- */
    /**
     * Ein Mitglied meldet ein anderes. Je Melder und Person einmal in 24 Stunden.
     * Der Wächter „Meldungen“ gibt 25 Punkte je Melder der letzten 24 Stunden.
     */
    async Report(guild: Guild, reporter: GuildMember, target: GuildMember): Promise<"counted" | "again" | "off"> {
        if (!(await this.On(guild.id))) return "off";
        if (reporter.id === target.id || target.user.bot) return "again";

        const now = Date.now();

        if (now - (await this.client.avReports.Last(guild.id, target.id, reporter.id)) < REPORT_COOLDOWN_MS) return "again";
        // Melder jünger als 7 Tage zählen nicht: sonst hielten drei Zweit-Accounts jeden fest. Dieselbe Antwort,
        // damit niemand herausfindet, ab wann eine Meldung zählt.
        if (now - reporter.user.createdTimestamp < FRESH_MS) return "counted";

        await this.client.avReports.Note(guild.id, target.id, reporter.id, now);

        const { guards } = await this.Settings(guild.id);

        if (!guards.report) return "counted";

        const count = await this.client.avReports.CountSince(guild.id, target.id, now - REPORT_COOLDOWN_MS);
        const points = (GUARDS.find((guard) => guard.id === "report")?.points ?? 25) * count;

        await this.Score(guild, target, [{ guard: "report", detail: `${count} ${count === 1 ? "Meldung" : "Meldungen"} in 24 Stunden`, points }], now);

        return "counted";
    }

    /* ----------------------------------------------------------
       Köder
       ---------------------------------------------------------- */
    /** In den Köder getappt: 100 Punkte, ins Protokoll, Zähler an der angepinnten Warnung. */
    private async Caught(guild: Guild, member: GuildMember, how: string): Promise<void> {
        await this.Score(guild, member, [{ guard: "bait", detail: how }]);
        await this.client.avEvents.Add(guild.id, "bait", `${member.user.username} in den Köder getappt`, how).catch(() => undefined);
        await this.UpdateBait(guild);
    }

    /** Die Warnung im Köder-Kanal neu senden und anpinnen, wenn sie fehlt (nach einem Laden des Discord-Servers, Plan 32). */
    async SendBait(guild: Guild): Promise<void> {
        const settings = await this.Settings(guild.id);
        const channel = settings.bait.channelId ? guild.channels.cache.get(settings.bait.channelId) : undefined;

        if (!channel?.isTextBased() || !("send" in channel)) throw new Error("Köder-Kanal gibt es nicht mehr");

        const caught = await this.client.avEvents.CountSince(guild.id, "bait", Date.now() - PROTOCOL_KEEP_MS).catch(() => 0);
        const sent = await channel.send(BaitCard(caught));

        await sent.pin().catch(() => undefined);
        await this.client.moduleSettings.Save(guild.id, ANTI_VILLAIN_MODULE, { ...settings, bait: { ...settings.bait, messageId: sent.id } });
    }

    async UpdateBait(guild: Guild): Promise<void> {
        const { bait } = await this.Settings(guild.id);

        if (!bait.channelId || !bait.messageId) return;

        const channel = guild.channels.cache.get(bait.channelId);

        if (!channel?.isTextBased()) return;

        const caught = await this.client.avEvents.CountSince(guild.id, "bait", Date.now() - PROTOCOL_KEEP_MS).catch(() => 0);
        const message = await channel.messages.fetch(bait.messageId).catch(() => null);
        const card = BaitCard(caught);

        await message?.edit({ components: card.components, allowedMentions: card.allowedMentions }).catch(() => undefined);
    }

    /** Köder-Kanal ganz oben mit angepinnter Warnung, auf Wunsch die Köder-Rolle. */
    async SetupBait(guild: Guild): Promise<{ channelId: string | null; roleId: string | null; problems: string[] }> {
        const settings = await this.Settings(guild.id);
        const bait = { ...settings.bait };
        const problems: string[] = [];

        if (bait.channel && !(bait.channelId && guild.channels.cache.has(bait.channelId))) {
            const made = await guild.channels.create({ name: "nicht-schreiben", type: ChannelType.GuildText, position: 0, reason: "Anti Villain: Köder" }).catch(() => null);

            if (made) {
                bait.channelId = made.id;

                const sent = await made.send(BaitCard(0)).catch(() => null);

                bait.messageId = sent?.id ?? null;
                await sent?.pin().catch(() => undefined);
            } else {
                problems.push("Den Köder-Kanal konnte ich nicht anlegen. Mir fehlt „Kanäle verwalten“.");
            }
        }

        if (bait.role && !(bait.roleId && guild.roles.cache.has(bait.roleId))) {
            const role = await guild.roles.create({ name: "Nicht anklicken", permissions: [], reason: "Anti Villain: Köder-Rolle" }).catch(() => null);

            if (role) bait.roleId = role.id;
            else problems.push("Die Köder-Rolle konnte ich nicht anlegen. Mir fehlt „Rollen verwalten“.");
        }

        await this.client.moduleSettings.Save(guild.id, ANTI_VILLAIN_MODULE, { ...settings, bait });

        return { channelId: bait.channelId, roleId: bait.roleId, problems };
    }

    /* ----------------------------------------------------------
       Knöpfe und Menüs (av:…)
       ---------------------------------------------------------- */
    async OnButton(interaction: ButtonInteraction | StringSelectMenuInteraction): Promise<void> {
        const [, action, id] = interaction.customId.split(":");

        // „Erledigt“ kommt auch aus der DM - ohne Server an der Interaktion.
        if (action === "done") return void (await this.Done(interaction, Number(id)));
        if (!interaction.inCachedGuild()) return;

        const guild = interaction.guild;
        const member = interaction.member;
        const say = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

        try {
            if (action === "release" || action === "trust") {
                await this.quarantine.Release(guild, member, Number(id), action === "trust");
                return void (await say(action === "trust" ? "Freigegeben und 30 Tage vertraut." : "Freigegeben."));
            }

            if (action === "ban") {
                await this.quarantine.Ban(guild, member, Number(id));
                return void (await say("Gebannt."));
            }

            if (action === "deleted") {
                if (!(await this.IsTeam(member))) return void (await say(TEAM_ONLY));

                const found = await this.client.avCases.Get(Number(id));

                if (!found || found.guildId !== guild.id) return void (await say("Diesen Fall gibt es nicht."));

                return void (await interaction.reply({ ...DeletedView(found), flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral } as InteractionReplyOptions));
            }

            if (action === "holdu" || action === "trustu") {
                // Über sich selbst entscheidet niemand, auch kein gemeldetes Teammitglied.
                if (id === member.id || !(await this.IsTeam(member))) return void (await say(TEAM_ONLY));

                const target = await guild.members.fetch(id).catch(() => null);

                if (action === "trustu") {
                    await this.client.avTrust.Set(guild.id, id, Date.now() + TRUST_MS);
                    this.scores.Clear(`${guild.id}:${id}`);
                    return void (await say("Vermerkt: 30 Tage vertraut."));
                }

                if (!target) return void (await say("Die Person ist nicht mehr auf dem Server."));

                const score = this.scores.Of(`${guild.id}:${id}`, Date.now());

                await this.quarantine.Hold(guild, target, score.hits, `Vom Team festgehalten (${member.displayName}).`);
                return void (await say("Festgehalten."));
            }

            await this.OnRaidButton(interaction, action, Number(id));
        } catch (error) {
            if (error instanceof QuarantineError || error instanceof AntiVillainError) return void (await say(error.message).catch(() => undefined));

            throw error;
        }
    }

    /** Die Person drückt „Erledigt“: Das Team bekommt Bescheid, freigegeben wird nicht. */
    private async Done(interaction: ButtonInteraction | StringSelectMenuInteraction, caseId: number): Promise<void> {
        const say = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
        const found = await this.client.avCases.Get(caseId);

        if (!found || found.userId !== interaction.user.id) return void (await say("Das ist nicht dein Knopf."));
        if (found.status !== "open") return void (await say("Du bist schon freigegeben."));
        if (found.timeline.some((entry) => entry.text.startsWith("Erledigt gedrückt"))) return void (await say("Das Team weiß schon Bescheid."));

        const now = Date.now();
        const settings = await this.Settings(found.guildId);

        await this.client.avCases.Save(found.id, { timeline: [...found.timeline, { at: now, text: "Erledigt gedrückt: Passwort geändert, sagt die Person" }] });
        const guild = this.client.guilds.cache.get(found.guildId);

        if (guild) {
            const card = new ComponentV2Builder({ accentColor: "#248046" }).text(`✅ <@${found.userId}> hat „Erledigt“ gedrückt: Passwort geändert, sagt die Person.`).subtext("Anti Villain · Freigeben in der Karte darüber");

            await SendLog(guild, settings.logChannelId, { ...card.toMessage(), allowedMentions: { parse: [] } });
        }

        await say("Danke. Das Team weiß Bescheid und gibt dich frei, sobald es nachgesehen hat.");
    }

    /** Raid-Karte: Menü „Was passiert mit den …?“, Rückfrage vor dem Bannen, „Raid-Modus beenden“. */
    private async OnRaidButton(interaction: ButtonInteraction | StringSelectMenuInteraction, action: string, id: number): Promise<void> {
        if (!interaction.inCachedGuild()) return;

        const say = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
        const guild = interaction.guild;
        const member = interaction.member;

        if (!["raid", "raidend", "raidconfirm"].includes(action)) return void (await say("Diesen Knopf kenne ich nicht."));
        if (!(await this.IsTeam(member))) return void (await say(TEAM_ONLY));

        if (action === "raidend") {
            await this.raid.End(guild, member.id);
            return void (await say("Raid-Modus beendet. Slowmode und Einladungen sind wie vorher."));
        }

        if (action === "raidconfirm") {
            const count = await this.raid.Decide(guild, member, id, "ban");
            return void (await say(`${count} gebannt.`));
        }

        const choice = interaction.isStringSelectMenu() ? interaction.values[0] : "";
        const state = this.raid.Active(guild.id);
        const open = state && state.incidentId === id ? state.members.length - state.done.length : 0;

        if (choice === "look") return void (await say(`Einzeln ansehen: ${this.DashboardUrl(guild.id)}`));
        if (choice === "ban") {
            const card = new ComponentV2Builder({ accentColor: "#da373c" })
                .text(`**Wirklich alle ${open} aus der Welle bannen?** Das lässt sich nicht rückgängig machen.`)
                .buttons({ customId: `av:raidconfirm:${id}:ban`, label: `Ja, alle ${open} bannen`, tone: "danger" });

            return void (await interaction.reply({ ...card.toMessage({ ephemeral: true }), allowedMentions: { parse: [] } } as InteractionReplyOptions));
        }

        if (choice === "kick" || choice === "release") {
            const count = await this.raid.Decide(guild, member, id, choice);
            return void (await say(`${count} ${choice === "kick" ? "gekickt" : "freigegeben"}.`));
        }

        await say("Diese Auswahl kenne ich nicht.");
    }

    /** Für den roten Balken über allen Modulseiten im Dashboard. */
    RaidBanner(guildId: string): { since: number; joins: number; invitesUntil: number | null } | null {
        const state = this.raid.Active(guildId);

        return state ? { since: state.startedAt, joins: state.members.length, invitesUntil: state.invitesUntil } : null;
    }

    /** Der kurze Hinweis im Kanal, in dem etwas gelöscht wurde. Verschwindet nach 30 Sekunden. */
    async Notice(channel: TextBasedChannel): Promise<void> {
        if (!channel.isSendable()) return;

        const sent = await channel.send(ChannelNotice()).catch(() => null);

        if (sent) setTimeout(() => void sent.delete().catch(() => undefined), NOTICE_MS).unref();
    }

    /* ----------------------------------------------------------
       Einstellungen
       ---------------------------------------------------------- */
    async Settings(guildId: string): Promise<IAntiVillainSettings> {
        const stored = await this.client.moduleSettings.Of<Partial<IAntiVillainSettings>>(guildId, ANTI_VILLAIN_MODULE, {});
        const base = DefaultAntiVillainSettings();

        // Ältere oder halbe Zeilen: was fehlt, kommt aus den Vorgaben.
        return {
            ...base,
            ...stored,
            guards: { ...base.guards, ...stored.guards },
            quarantine: { ...base.quarantine, ...stored.quarantine },
            bait: { ...base.bait, ...stored.bait },
            raid: { ...base.raid, ...stored.raid },
            nuke: { ...base.nuke, ...stored.nuke, limits: { ...base.nuke.limits, ...stored.nuke?.limits } },
        };
    }

    Clean(guild: Guild, input: unknown, previous: IAntiVillainSettings): IAntiVillainSettings {
        const raw = IsRecord(input) ? input : {};
        const role = (value: unknown, fallback: string | null): string | null =>
            value === undefined ? fallback : typeof value === "string" && value !== guild.id && guild.roles.cache.has(value) ? value : null;
        const channel = (value: unknown, fallback: string | null): string | null =>
            value === undefined ? fallback : typeof value === "string" && guild.channels.cache.has(value) ? value : null;
        const roles = (value: unknown, fallback: string[]): string[] =>
            value === undefined
                ? fallback
                : Array.isArray(value)
                  ? [...new Set(value.filter((id): id is string => typeof id === "string" && id !== guild.id && guild.roles.cache.has(id)))].slice(0, MAX_TRUSTED)
                  : [];

        const guards = { ...previous.guards };
        if (IsRecord(raw.guards)) for (const id of GUARD_IDS) guards[id] = Flag(raw.guards[id], guards[id]);

        const q = IsRecord(raw.quarantine) ? raw.quarantine : {};
        const bait = IsRecord(raw.bait) ? raw.bait : {};
        const raid = IsRecord(raw.raid) ? raw.raid : {};
        const nuke = IsRecord(raw.nuke) ? raw.nuke : {};
        const limits = { ...previous.nuke.limits };
        if (IsRecord(nuke.limits)) for (const action of NUKE_ACTIONS) limits[action.id] = Clamp(nuke.limits[action.id], limits[action.id], NUKE_LIMIT_RANGE);

        const log = raw.logChannelId;

        return {
            level: OneOf<ShieldLevel>(raw.level, LEVEL_IDS, previous.level),
            guards,
            team: OneOf(raw.team, ["report", "same"] as const, previous.team),
            trustedRoles: roles(raw.trustedRoles, previous.trustedRoles),
            quarantine: {
                roleId: role(q.roleId, previous.quarantine.roleId),
                channelId: channel(q.channelId, previous.quarantine.channelId),
                stripRoles: Flag(q.stripRoles, previous.quarantine.stripRoles),
                cleanup: OneOf<CleanupMinutes>(q.cleanup, CLEANUP_OPTIONS, previous.quarantine.cleanup),
                dm: Flag(q.dm, previous.quarantine.dm),
                release: OneOf(q.release, ["team", "team-24h"] as const, previous.quarantine.release),
            },
            bait: {
                channel: Flag(bait.channel, previous.bait.channel),
                channelId: channel(bait.channelId, previous.bait.channelId),
                role: Flag(bait.role, previous.bait.role),
                roleId: role(bait.roleId, previous.bait.roleId),
                // Die angepinnte Warnung setzt nur SetupBait, nie das Dashboard.
                messageId: previous.bait.messageId,
            },
            raid: {
                // Ohne Server Members Intent kommen keine Beitritte an: Einschalten geht dann nicht.
                on: raid.on === true && !this.client.config.GUILD_MEMBER_INTENT ? false : Flag(raid.on, previous.raid.on),
                joins: Clamp(raid.joins, previous.raid.joins, RAID_JOINS_RANGE),
                invites: Flag(raid.invites, previous.raid.invites),
                slowmode: Flag(raid.slowmode, previous.raid.slowmode),
                hold: Flag(raid.hold, previous.raid.hold),
                ping: Flag(raid.ping, previous.raid.ping),
                verification: Flag(raid.verification, previous.raid.verification),
                endMinutes: Clamp(raid.endMinutes, previous.raid.endMinutes, RAID_END_RANGE),
            },
            nuke: {
                on: Flag(nuke.on, previous.nuke.on),
                limits,
                trustedBots:
                    nuke.trustedBots === undefined
                        ? previous.nuke.trustedBots
                        : Array.isArray(nuke.trustedBots)
                          ? [...new Set(nuke.trustedBots.filter((id): id is string => typeof id === "string" && /^\d{17,20}$/.test(id)))].slice(0, MAX_TRUSTED)
                          : [],
            },
            logChannelId: log === undefined ? previous.logChannelId : typeof log === "string" && IsLogTarget(guild.channels.cache.get(log)) ? log : null,
            pingRoleId: role(raw.pingRoleId, previous.pingRoleId),
        };
    }

    async Save(guild: Guild, input: unknown): Promise<IAntiVillainSettings> {
        if (IsRecord(input)) await WarmLogTarget(guild, input.logChannelId);

        const settings = this.Clean(guild, input, await this.Settings(guild.id));

        await this.client.moduleSettings.Save(guild.id, ANTI_VILLAIN_MODULE, settings);

        return settings;
    }
}
