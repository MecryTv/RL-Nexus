import { Guild, GuildMember, Interaction, PermissionFlagsBits } from "discord.js";
import BotClient from "../client/BotClient";
import { COOLDOWN_MS, SEEN_DEDUPE_MS } from "../constants/StaffGrant";
import { IStaffGrant, IStaffLogEntry, StaffAccessMode } from "../interfaces/services/staffgrant/IStaffGrant";
import * as Machine from "./staffgrant/Machine";
import { StaffGrantError } from "./staffgrant/Machine";
import { AskList, DurationText } from "./staffgrant/Rules";
import logger from "../utils/logger";

export { StaffGrantError } from "./staffgrant/Machine";

/** Eine neue Anfrage geht gerade nicht (offene, laufende, Sperre nach Nein). Die Route antwortet 409. */
export class StaffGrantBlocked extends StaffGrantError {}

/** Der Weg in die DMs der Gefragten (Task 5: StaffGrantDm). Ohne ihn bleibt es beim Pop-up im Dashboard. */
export interface IStaffDm {
    Send(grant: IStaffGrant, userId: string): Promise<{ channelId: string; messageId: string }>;
    Changed(grant: IStaffGrant): void;
    Logged(grant: IStaffGrant): void;
    /** Knöpfe und Menüs der DM (events/staffgrant/StaffGrantButtons). */
    OnInteraction?(interaction: Interaction): Promise<void>;
}

export interface IStaffRequest {
    guild: Guild;
    staffId: string;
    staffName: string;
    staffRole: "Developer" | "Admin";
    reason: string;
    minutes: number;
    private: boolean;
}

const AREA = "Freigabe";
const PENDING = "Gerade läuft schon eine Anfrage für diesen Server.";
const CLOCK = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });

/**
 * Staff-Freigabe (W-0011, Plan 44): Developer und Seiten-Admins bearbeiten
 * einen fremden Server erst nach einem Ja. Offene und laufende Freigaben
 * liegen im Speicher, jede Änderung geht sofort in die Datenbank, ins
 * Protokoll und als Puls an Staff, Gefragte und das Server-Dashboard.
 * Der Ablauf selbst steht in staffgrant/Machine.ts.
 */
export default class StaffGrantService {
    private readonly client: BotClient;
    private readonly live = new Map<number, IStaffGrant>();
    private readonly seen = new Map<string, number>();
    /** Server, für die gerade eine Anfrage angelegt wird - gegen zwei gleichzeitige. */
    private readonly pending = new Set<string>();
    /** Load lief schon mit Datenbank (sonst holt Tick es nach, Review I5). */
    private loaded = false;
    dm: IStaffDm | null = null;

    constructor(client: BotClient) {
        this.client = client;
    }

    /** Nach dem Start: offene und laufende Freigaben gelten weiter. */
    async Load(): Promise<void> {
        if (!this.client.databaseService.Ready) return;

        for (const grant of await this.client.staffGrants.Live()) this.live.set(grant.id, grant);

        this.loaded = true;
    }

    /** Wer gefragt wird: Free der Owner, Paid wer Zugang hat, Beta wer einen Code eingelöst hat (siehe AskList). */
    async Askees(guild: Guild): Promise<{ mode: StaffAccessMode; users: string[] }> {
        const dashboard = this.client.dashboardService;
        const mode: StaffAccessMode = (await dashboard.BetaMode()) ? "beta" : (await dashboard.Paywall()) ? "paid" : "free";

        if (mode === "free") return { mode, users: [guild.ownerId] };

        // Ohne Members-Intent hinge fetch() bis zum Timeout - dann reicht, wer im Speicher ist (Review I6).
        const members = this.client.config.GUILD_MEMBER_INTENT ? await guild.members.fetch().catch(() => guild.members.cache) : guild.members.cache;
        const managers = [...members.values()]
            .filter((member) => !member.user.bot && member.id !== guild.ownerId && member.permissions.has(PermissionFlagsBits.ManageGuild))
            .map((member) => member.id);
        const ok = new Set<string>();

        for (const id of [guild.ownerId, ...managers]) {
            const fits = mode === "beta" ? await dashboard.BetaMember(id) : (await dashboard.ShopAccess(id)).allowed;

            if (fits) ok.add(id);
            // Paid mit Zugang beim Owner: die Verwalter braucht es nicht mehr.
            if (mode === "paid" && id === guild.ownerId && fits) break;
        }

        return { mode, users: AskList(mode, guild.ownerId, managers, ok) };
    }

    /** null heißt: dieser Staff darf jetzt fragen. Sonst der Satz, warum nicht. */
    async Blocked(guildId: string, staffId: string, now = Date.now()): Promise<string | null> {
        if (this.pending.has(guildId)) return PENDING;

        return Machine.CanRequest(await this.Known(guildId, now), staffId, now);
    }

    /** Offene und laufende aus dem Speicher, dazu was in den letzten 10 Minuten endete (für die Sperre nach Nein). */
    private async Known(guildId: string, now: number): Promise<IStaffGrant[]> {
        const live = [...this.live.values()].filter((grant) => grant.guildId === guildId);
        const ids = new Set(live.map((grant) => grant.id));
        const recent = this.client.databaseService.Ready ? await this.client.staffGrants.OfGuild(guildId, now - COOLDOWN_MS) : [];

        return [...live, ...recent.filter((grant) => !ids.has(grant.id))];
    }

    async Request(input: IStaffRequest): Promise<IStaffGrant> {
        if (!this.client.databaseService.Ready) throw new StaffGrantError("Ohne Datenbank geht das gerade nicht.");

        const reason = Machine.CheckRequest(input.reason, input.minutes);
        const now = Date.now();

        // Sperre vor dem ersten await: Zwei gleichzeitige Anfragen kommen sonst beide durch (Review I1).
        if (this.pending.has(input.guild.id)) throw new StaffGrantBlocked(PENDING);

        this.pending.add(input.guild.id);

        try {
            const blocked = Machine.CanRequest(await this.Known(input.guild.id, now), input.staffId, now);

            if (blocked) throw new StaffGrantBlocked(blocked);

            const { mode, users } = await this.Askees(input.guild);

            if (users.length === 0) throw new StaffGrantError("Niemand kann gerade gefragt werden.");

            const grant: IStaffGrant = {
                id: 0,
                guildId: input.guild.id,
                staffId: input.staffId,
                staffName: input.staffName,
                staffRole: input.staffRole,
                reason,
                minutes: input.minutes,
                mode,
                asked: users,
                denied: [],
                status: "open",
                createdAt: now,
                expiresAt: now + 10 * 60_000,
                answeredBy: null,
                startsAt: null,
                endsAt: null,
                endedBy: null,
                endedAt: null,
                private: input.private ? "asked" : "none",
                privateReason: input.private ? reason : null,
                privateAskedAt: input.private ? now : null,
                privateDeniedAt: null,
                privateDenied: [],
                privateBy: null,
                dms: {},
            };

            grant.id = await this.client.staffGrants.Save(grant);

            // Geschlossene DMs halten nichts auf: Das Pop-up im Dashboard reicht auch.
            for (const userId of users) grant.dms[userId] = this.dm ? await this.dm.Send(grant, userId).catch(() => null) : null;

            this.live.set(grant.id, grant);
            await this.client.staffGrants.Save(grant);
            this.Event(grant, `Angefragt von ${input.staffName} für ${DurationText(input.minutes)}${input.private ? " · mit privaten Bereichen" : ""}`, false);

            return grant;
        } finally {
            this.pending.delete(input.guild.id);
        }
    }

    Answer(id: number, userId: string, yes: boolean, minutes: number, allowPrivate: boolean): Promise<IStaffGrant> {
        return this.Apply(
            id,
            (grant) => Machine.Answer(grant, userId, yes, minutes, allowPrivate, Date.now()),
            (grant) =>
                grant.status === "active"
                    ? `Erteilt von ${this.NameOf(grant.guildId, userId)} für ${DurationText(grant.minutes)}${grant.private === "on" ? " · mit privaten Bereichen" : ""}`
                    : grant.status === "denied"
                      ? "Abgelehnt"
                      : null
        );
    }

    Withdraw(id: number, staffId: string): Promise<IStaffGrant> {
        return this.Apply(id, (grant) => Machine.Withdraw(this.Own(grant, staffId), Date.now()), () => "Zurückgezogen");
    }

    End(id: number, by: string): Promise<IStaffGrant> {
        return this.Apply(id, (grant) => Machine.End(grant, by, Date.now()), (grant) => `Beendet von ${this.NameOf(grant.guildId, by)}`);
    }

    Extend(id: number, by: string): Promise<IStaffGrant> {
        return this.Apply(id, (grant) => Machine.Extend(grant, Date.now()), (grant) => `Verlängert von ${this.NameOf(grant.guildId, by)} bis ${CLOCK.format(grant.endsAt!)}`);
    }

    AskPrivate(id: number, staffId: string, reason: string): Promise<IStaffGrant> {
        return this.Apply(id, (grant) => Machine.AskPrivate(this.Own(grant, staffId), reason, Date.now()), () => "Private Bereiche angefragt");
    }

    AnswerPrivate(id: number, userId: string, yes: boolean): Promise<IStaffGrant> {
        return this.Apply(
            id,
            (grant) => Machine.AnswerPrivate(grant, userId, yes, Date.now()),
            (grant) => (grant.private === "on" ? `Private Bereiche erlaubt von ${this.NameOf(grant.guildId, userId)}` : grant.private === "denied" ? "Private Bereiche abgelehnt" : null)
        );
    }

    RemovePrivate(id: number, by: string): Promise<IStaffGrant> {
        return this.Apply(id, (grant) => Machine.RemovePrivate(grant, by), (grant) => `Private Bereiche weggenommen von ${this.NameOf(grant.guildId, by)}`);
    }

    Get(id: number): IStaffGrant | null {
        return this.live.get(id) ?? null;
    }

    /** Die laufende Freigabe dieses Staffs auf diesem Server. Endet sie gerade, schon null - auch vor dem nächsten Tick. */
    Active(staffId: string, guildId: string, now = Date.now()): IStaffGrant | null {
        for (const grant of this.live.values()) {
            if (grant.status === "active" && grant.staffId === staffId && grant.guildId === guildId && grant.endsAt! > now) return grant;
        }

        return null;
    }

    /** Offene oder laufende Freigabe eines Servers. */
    Current(guildId: string): IStaffGrant | null {
        for (const grant of this.live.values()) if (grant.guildId === guildId) return grant;

        return null;
    }

    /** Was diese Person gerade beantworten soll: offene Anfragen und spät angefragte private Bereiche. */
    OpenFor(userId: string): IStaffGrant[] {
        return [...this.live.values()].filter(
            (grant) =>
                grant.asked.includes(userId) &&
                ((grant.status === "open" && !grant.denied.includes(userId)) ||
                    (grant.status === "active" && grant.private === "asked" && !grant.privateDenied.includes(userId)))
        );
    }

    /** Das Ersatz-Mitglied für Staff mit Freigabe: der Bot selbst. „Von wem“ steht im actor der Gates. */
    StandIn(userId: string, guild: Guild): GuildMember | null {
        return this.Active(userId, guild.id) ? guild.members.me : null;
    }

    /** Eine Änderung von Staff mit Freigabe. */
    Log(grant: IStaffGrant, area: string, text: string, at = Date.now()): void {
        this.Write(grant, area, text, at);
        this.client.pulseService.Emit(grant.guildId, "staff", { id: grant.id });
        this.dm?.Logged(grant);
    }

    /** Ein Blick in einen privaten Bereich. Derselbe Gegenstand zählt in 10 Minuten einmal. */
    Seen(grant: IStaffGrant, area: string, item: string, now = Date.now()): void {
        const key = `${grant.id}:${area}:${item}`;
        const last = this.seen.get(key);

        if (last !== undefined && now - last < SEEN_DEDUPE_MS) return;

        this.seen.set(key, now);
        this.Log(grant, area, `${area} › ${item} geöffnet`, now);
    }

    /** Jede Minute (Runnable StaffGrants): Verfall, Ablauf, verfallene späte private Anfrage. */
    async Tick(now: number): Promise<void> {
        if (!this.loaded) await this.Load();

        for (const grant of [...this.live.values()]) {
            const next = Machine.Tick(grant, now);

            if (!next) continue;

            this.Remember(next);
            await this.client.staffGrants.Save(next);
            this.Event(next, next.status === "expired" ? "Verfallen" : next.status === "ended" ? "Zeit abgelaufen" : "Private Bereiche: Anfrage verfallen");
        }

        for (const [key, at] of this.seen) if (now - at >= SEEN_DEDUPE_MS) this.seen.delete(key);
    }

    async Recent(guildId: string, days: number): Promise<{ grants: IStaffGrant[]; log: IStaffLogEntry[] }> {
        const since = Date.now() - days * 86_400_000;

        return { grants: await this.client.staffGrants.OfGuild(guildId, since), log: await this.client.staffGrantLog.OfGuild(guildId, since) };
    }

    LogOf(grantId: number, limit: number): Promise<IStaffLogEntry[]> {
        return this.client.staffGrantLog.Of(grantId, limit);
    }

    NameOf(guildId: string, userId: string): string {
        return this.client.guilds.cache.get(guildId)?.members.cache.get(userId)?.displayName ?? this.client.users.cache.get(userId)?.username ?? userId;
    }

    /* ----------------------------------------------------------
       Intern
       ---------------------------------------------------------- */
    private Own(grant: IStaffGrant, staffId: string): IStaffGrant {
        if (grant.staffId !== staffId) throw new StaffGrantError("Das ist nicht deine Anfrage.");

        return grant;
    }

    /**
     * Ändern, merken, speichern, melden. Der Speicher wechselt vor dem ersten
     * await: Antworten zwei Gefragte gleichzeitig, sieht die zweite schon den
     * neuen Stand und bekommt „Schon beantwortet.“.
     */
    private async Apply(id: number, change: (grant: IStaffGrant) => IStaffGrant, text: (grant: IStaffGrant) => string | null): Promise<IStaffGrant> {
        const current = this.live.get(id);

        if (!current) throw new StaffGrantError("Diese Anfrage gibt es nicht mehr.");

        const next = change(current);

        this.Remember(next);
        await this.client.staffGrants.Save(next);
        this.Event(next, text(next));

        return next;
    }

    private Remember(grant: IStaffGrant): void {
        if (grant.status === "open" || grant.status === "active") this.live.set(grant.id, grant);
        else this.live.delete(grant.id);
    }

    private Event(grant: IStaffGrant, text: string | null, dm = true): void {
        if (text) this.Write(grant, AREA, text, Date.now());

        const pulse = this.client.pulseService;

        pulse.Emit(grant.guildId, "staff", { id: grant.id });
        pulse.EmitUser(grant.staffId, "staff", { id: grant.id });

        for (const userId of grant.asked) pulse.EmitUser(userId, "staff", { id: grant.id });

        if (dm) this.dm?.Changed(grant);
    }

    private Write(grant: IStaffGrant, area: string, text: string, at: number): void {
        if (!this.client.databaseService.Ready) return;

        void this.client.staffGrantLog
            .Add({ grantId: grant.id, guildId: grant.guildId, at, area: area.slice(0, 80), text: text.slice(0, 300) })
            .catch((error: unknown) => logger.warn(`🔐 Staff-Protokoll für ${grant.guildId} nicht geschrieben - ${String(error)}`));
    }
}
