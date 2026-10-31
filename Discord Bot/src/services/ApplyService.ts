import {
    ButtonInteraction,
    ChannelType,
    DiscordAPIError,
    Guild,
    GuildMember,
    Message,
    MessageCreateOptions,
    MessageEditOptions,
    OverwriteResolvable,
    OverwriteType,
    PermissionFlagsBits,
    PermissionsString,
} from "discord.js";
import BotClient from "../client/BotClient";
import { ApplyCard, ApplyPanelView, IsApplyPanel } from "../builder/ApplyView";
import {
    AFTER_DECISIONS,
    APPLY_MODES,
    APPLY_MODULE,
    APPLY_TARGETS,
    ApplyLink,
    ChannelName,
    CooldownText,
    DEFAULT_CHANNEL_NAME,
    DefaultApplySettings,
    DefaultForm,
    DefaultFormSettings,
    MAX_ANSWER,
    MAX_CHANNEL_NAME,
    MAX_CHOICES,
    MAX_DESCRIPTION,
    MAX_FORMS,
    MAX_HINT,
    MAX_LABEL,
    MAX_NAME,
    MAX_NOTE,
    MAX_QUESTIONS,
    MAX_REVIEWERS,
    STAFF_ONLY,
} from "../constants/Apply";
import {
    AfterDecision,
    ApplyMode,
    ApplyStatus,
    ApplyTarget,
    IApplyAnswer,
    IApplyForm,
    IApplyPanel,
    IApplyQuestion,
    IApplySettings,
    IApplySubmission,
    IFormSettings,
    QuestionKind,
} from "../interfaces/services/apply/IApply";
import logger from "../utils/logger";
import ApplyFlow from "./ApplyFlow";

/**
 * Ein Satz für den Bewerber oder das Dashboard. status: was die Webseite als
 * HTTP-Code bekommt. title: die Überschrift, wenn Discord die Meldung zeigt.
 */
export class ApplyError extends Error {
    constructor(
        message: string,
        readonly status = 400,
        readonly title = "Gerade nicht"
    ) {
        super(message);
    }
}

function IsRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function Int(value: unknown, min: number, max: number, fallback: number): number {
    const number = Math.floor(Number(value));

    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function Text(value: unknown, max: number, fallback = ""): string {
    return typeof value === "string" ? value.trim().slice(0, max) : fallback;
}

const DAY = 86_400_000;

/** Was Bewerber und Prüfer im eigenen Kanal dürfen - dieselben Rechte wie im Ticket (TicketService). */
const MEMBER_ALLOW: PermissionsString[] = ["ViewChannel", "SendMessages", "ReadMessageHistory", "AttachFiles", "EmbedLinks"];
const BOT_ALLOW: PermissionsString[] = [...MEMBER_ALLOW, "ManageChannels", "ManageMessages"];

/** Ein Overwrite darf nichts erlauben, was der Bot selbst nicht hat - sonst lehnt Discord den ganzen Kanal ab. */
function Allowed(guild: Guild, wanted: PermissionsString[]): PermissionsString[] {
    const mine = guild.members.me?.permissions;

    return wanted.filter((permission) => mine?.has(permission));
}

/**
 * Wer einen eigenen Bewerbungskanal sieht (Plan 30): wie bei Tickets
 * niemand außer dem Bewerber, den Prüfern und dem Bot. allow und botAllow
 * sind schon auf das gekürzt, was der Bot selbst darf.
 */
export function ApplyChannelOverwrites(input: {
    everyoneId: string;
    botId: string;
    applicantId: string;
    reviewRoles: string[];
    reviewUsers: string[];
    allow: PermissionsString[];
    botAllow: PermissionsString[];
}): OverwriteResolvable[] {
    const users = [...new Set([input.applicantId, ...input.reviewUsers])].filter((id) => id !== input.botId);

    return [
        { id: input.everyoneId, deny: ["ViewChannel"] },
        { id: input.botId, type: OverwriteType.Member, allow: input.botAllow },
        ...users.map((id) => ({ id, type: OverwriteType.Member, allow: input.allow })),
        ...[...new Set(input.reviewRoles)].map((id) => ({ id, type: OverwriteType.Role, allow: input.allow })),
    ];
}

/** Fehlende Rechte als Satz fürs Dashboard, alles andere bleibt, wie es ist. */
function Explain(error: unknown): Error {
    if (error instanceof DiscordAPIError && (error.code === 50013 || error.code === 50001)) {
        return new ApplyError("Mir fehlen Rechte in diesem Kanal: „Kanal ansehen“ und „Nachrichten senden“.");
    }

    return error instanceof Error ? error : new Error(String(error));
}

/**
 * Apply System: Bewerbungen. Formulare kommen aus dem Dashboard, abgeschickt
 * wird über einen öffentlichen Link, entschieden wird im Dashboard oder direkt
 * an der Karte in Discord. Siehe docs/Apply.md.
 */
export default class ApplyService {
    private readonly client: BotClient;
    /** Bewerben in Discord: Fenster und DM (Plan 24). Hängt hier, weil der Client nur den Service kennt. */
    readonly flow: ApplyFlow;

    constructor(client: BotClient) {
        this.client = client;
        this.flow = new ApplyFlow(client);
    }

    /* ----------------------------------------------------------
       Einstellungen des Moduls
       ---------------------------------------------------------- */
    Settings(guildId: string): Promise<IApplySettings> {
        return this.client.moduleSettings.Of<IApplySettings>(guildId, APPLY_MODULE, DefaultApplySettings());
    }

    CleanSettings(guild: Guild, input: unknown, previous: IApplySettings): IApplySettings {
        const raw = IsRecord(input) ? input : {};
        const ids = (value: unknown, fallback: string[], known: (id: string) => boolean): string[] =>
            value === undefined
                ? fallback
                : Array.isArray(value)
                  ? [...new Set(value.filter((id): id is string => typeof id === "string" && known(id)))].slice(0, MAX_REVIEWERS)
                  : [];

        const channel = typeof raw.channelId === "string" ? guild.channels.cache.get(raw.channelId) : null;

        return {
            mode: APPLY_MODES.includes(raw.mode as ApplyMode) ? (raw.mode as ApplyMode) : previous.mode,
            // Das Panel schreibt nur der Bot beim Senden.
            panel: previous.panel,
            reviewRoles: ids(raw.reviewRoles, previous.reviewRoles, (id) => guild.roles.cache.has(id) && id !== guild.id),
            reviewUsers: ids(raw.reviewUsers, previous.reviewUsers, (id) => /^\d{17,20}$/.test(id)),
            channelId: raw.channelId === undefined ? previous.channelId : channel?.isTextBased() ? channel.id : null,
            open: typeof raw.open === "boolean" ? raw.open : previous.open,
            target: APPLY_TARGETS.includes(raw.target as ApplyTarget) ? (raw.target as ApplyTarget) : previous.target,
            categoryId:
                raw.categoryId === undefined
                    ? previous.categoryId
                    : typeof raw.categoryId === "string" && guild.channels.cache.get(raw.categoryId)?.type === ChannelType.GuildCategory
                      ? raw.categoryId
                      : null,
            channelName: raw.channelName === undefined ? previous.channelName : Text(raw.channelName, MAX_CHANNEL_NAME) || DEFAULT_CHANNEL_NAME,
            afterDecision: AFTER_DECISIONS.includes(raw.afterDecision as AfterDecision) ? (raw.afterDecision as AfterDecision) : previous.afterDecision,
        };
    }

    /** warning: gespeichert, aber der eigene Kanal geht so noch nicht (Plan 30). */
    async SaveSettings(guild: Guild, input: unknown): Promise<{ settings: IApplySettings; warning: string | null }> {
        const settings = this.CleanSettings(guild, input, await this.Settings(guild.id));

        await this.client.moduleSettings.Save(guild.id, APPLY_MODULE, settings);
        await this.RefreshPanel(guild).catch(() => undefined);

        const can = (flag: bigint): boolean => Boolean(guild.members.me?.permissions.has(flag));
        const warning =
            settings.target !== "channel"
                ? null
                : !can(PermissionFlagsBits.ManageChannels)
                  ? "Mir fehlt „Kanäle verwalten“. Bis das da ist, landen die Karten im Sammelkanal."
                  : settings.afterDecision === "close" && !can(PermissionFlagsBits.ManageRoles)
                    ? "Mir fehlt „Rollen verwalten“. Ohne kann ich die Person nach der Entscheidung nicht aus ihrem Kanal nehmen."
                    : null;

        return { settings, warning };
    }

    /**
     * Darf dieses Mitglied Bewerbungen sehen und entscheiden? Wer den Server
     * verwaltet, darf immer - alle anderen brauchen einen Platz auf der Liste.
     */
    async CanReview(member: GuildMember): Promise<boolean> {
        if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;

        const settings = await this.Settings(member.guild.id);

        return settings.reviewUsers.includes(member.id) || settings.reviewRoles.some((role) => member.roles.cache.has(role));
    }

    /* ----------------------------------------------------------
       Formulare
       ---------------------------------------------------------- */
    Forms(guildId: string): Promise<IApplyForm[]> {
        return this.client.applyForms.OfGuild(guildId);
    }

    async Form(guildId: string, id: number): Promise<IApplyForm> {
        const form = await this.client.applyForms.Get(id);

        if (!form || form.guildId !== guildId) throw new ApplyError("Dieses Formular gibt es nicht.");

        return form;
    }

    CleanForm(guild: Guild, input: unknown, previous?: IApplyForm): Pick<IApplyForm, "name" | "description" | "emoji" | "open" | "questions" | "settings"> {
        const raw = IsRecord(input) ? input : {};
        const base = previous ?? { ...DefaultForm(), questions: [], settings: DefaultFormSettings() };
        const name = Text(raw.name, MAX_NAME, base.name);

        if (!name) throw new ApplyError("Gib dem Formular einen Namen – der steht auch auf der öffentlichen Seite.");

        const questions = raw.questions === undefined ? base.questions : this.CleanQuestions(raw.questions);

        if (!questions.length) throw new ApplyError("Ohne Fragen gibt es nichts auszufüllen.");

        return {
            name,
            description: Text(raw.description, MAX_DESCRIPTION, base.description),
            emoji: typeof raw.emoji === "string" && raw.emoji.trim() ? raw.emoji.trim().slice(0, 64) : raw.emoji === null ? null : base.emoji,
            open: typeof raw.open === "boolean" ? raw.open : base.open,
            questions,
            settings: this.CleanFormSettings(guild, raw.settings, base.settings),
        };
    }

    private CleanQuestions(input: unknown): IApplyQuestion[] {
        if (!Array.isArray(input)) return [];

        const seen = new Set<string>();
        const questions: IApplyQuestion[] = [];

        for (const entry of input.slice(0, MAX_QUESTIONS)) {
            if (!IsRecord(entry)) continue;

            const label = Text(entry.label, MAX_LABEL);

            if (!label) continue;

            const id = Text(entry.id, 20) || `q${questions.length + 1}`;

            if (seen.has(id)) continue;

            const kind: QuestionKind = entry.kind === "long" || entry.kind === "choice" ? entry.kind : "short";
            const choices =
                kind === "choice" && Array.isArray(entry.choices)
                    ? [...new Set(entry.choices.map((choice) => Text(choice, 100)).filter(Boolean))].slice(0, MAX_CHOICES)
                    : [];

            // Eine Auswahl ohne Möglichkeiten wäre eine Sackgasse.
            if (kind === "choice" && choices.length === 0) continue;

            seen.add(id);
            questions.push({
                id,
                label,
                hint: Text(entry.hint, MAX_HINT),
                kind,
                choices,
                required: typeof entry.required === "boolean" ? entry.required : true,
                max: Int(entry.max, 20, MAX_ANSWER, kind === "long" ? 1024 : 200),
            });
        }

        return questions;
    }

    private CleanFormSettings(guild: Guild, input: unknown, previous: IFormSettings): IFormSettings {
        const raw = IsRecord(input) ? input : {};

        if (input === undefined) return previous;

        const channel = typeof raw.channelId === "string" ? guild.channels.cache.get(raw.channelId) : null;
        const role = (value: unknown, fallback: string | null): string | null =>
            value === undefined ? fallback : typeof value === "string" && guild.roles.cache.has(value) && value !== guild.id ? value : null;

        return {
            channelId: raw.channelId === undefined ? previous.channelId : channel?.isTextBased() ? channel.id : null,
            acceptRole: role(raw.acceptRole, previous.acceptRole),
            pingRoles: Array.isArray(raw.pingRoles)
                ? [...new Set(raw.pingRoles.filter((id): id is string => typeof id === "string" && guild.roles.cache.has(id) && id !== guild.id))].slice(0, 5)
                : previous.pingRoles,
            dm: typeof raw.dm === "boolean" ? raw.dm : previous.dm,
            cooldownDays: Int(raw.cooldownDays, 0, 365, previous.cooldownDays),
            minAccountDays: Int(raw.minAccountDays, 0, 365, previous.minAccountDays),
            requireRole: role(raw.requireRole, previous.requireRole),
        };
    }

    async CreateForm(guild: Guild, member: GuildMember, input: unknown): Promise<IApplyForm> {
        if ((await this.Forms(guild.id)).length >= MAX_FORMS) throw new ApplyError(`Mehr als ${MAX_FORMS} Formulare gehen nicht.`);

        const clean = this.CleanForm(guild, input);
        const form = await this.client.applyForms.Create({ guildId: guild.id, createdBy: member.id, ...clean });

        logger.user(`📋 Bewerbungs-Formular "${form.name}" auf ${guild.id} angelegt (von ${member.id})`);
        await this.RefreshPanel(guild).catch(() => undefined);

        return form;
    }

    async SaveForm(guild: Guild, id: number, input: unknown): Promise<IApplyForm> {
        const previous = await this.Form(guild.id, id);

        await this.client.applyForms.Save(id, this.CleanForm(guild, input, previous));
        await this.RefreshPanel(guild).catch(() => undefined);

        return this.Form(guild.id, id);
    }

    /** Das Formular und alles, was darauf eingegangen ist. */
    async RemoveForm(guild: Guild, id: number): Promise<void> {
        await this.Form(guild.id, id);
        await this.client.applySubmissions.RemoveOfForm(id);
        await this.client.applyForms.Remove(id);
        await this.RefreshPanel(guild).catch(() => undefined);
    }

    /* ----------------------------------------------------------
       Das Panel in Discord (Plan 24)
       ---------------------------------------------------------- */
    private readonly sending = new Set<string>();

    private async PanelView(guild: Guild, settings: IApplySettings): Promise<MessageCreateOptions> {
        return ApplyPanelView(guild, settings, await this.Forms(guild.id), ApplyLink(this.client.server.BaseURL, guild.id));
    }

    /** panel schreibt nur der Bot - an CleanSettings vorbei. */
    private async SavePanel(guildId: string, panel: IApplyPanel): Promise<void> {
        await this.client.moduleSettings.Save(guildId, APPLY_MODULE, { ...(await this.Settings(guildId)), panel });
    }

    /**
     * Stellt das Panel in einen Kanal, aber nie ein zweites daneben. Wie beim
     * Ticket-Panel: Steht dort schon eins (unter den letzten 50 Nachrichten
     * oder das gemerkte), wird es bearbeitet und jedes weitere gelöscht. Zieht
     * es in einen anderen Kanal, verschwindet das alte.
     */
    async SendPanel(guild: Guild, channelId: string): Promise<{ url: string; panel: IApplyPanel }> {
        if (this.sending.has(guild.id)) throw new ApplyError("Das Panel wird gerade schon gesendet.");

        this.sending.add(guild.id);

        try {
            return await this.PlacePanel(guild, channelId);
        } finally {
            this.sending.delete(guild.id);
        }
    }

    /** Das Panel neu zeichnen, an dem gerade gewählt wurde. Andere Nachrichten mit Menü bleiben, wie sie sind (W-0020). */
    async ResetPanel(message: Message): Promise<void> {
        const guild = message.guild;

        if (!guild || !IsApplyPanel(message, this.client.user!.id, guild.id)) return;

        const view = await this.PanelView(guild, await this.Settings(guild.id));

        await message.edit({ ...view, attachments: [] } as MessageEditOptions).catch(() => undefined);
    }

    private async PlacePanel(guild: Guild, channelId: string): Promise<{ url: string; panel: IApplyPanel }> {
        const channel = guild.channels.cache.get(channelId);

        if (!channel || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) {
            throw new ApplyError("Das Panel braucht einen Textkanal.");
        }

        const settings = await this.Settings(guild.id);
        const botId = this.client.user!.id;
        const recent = await channel.messages.fetch({ limit: 50 }).catch(() => null);
        const found = recent ? [...recent.values()].filter((entry) => IsApplyPanel(entry, botId, guild.id)) : [];
        const tracked = settings.panel.channelId === channelId ? settings.panel.messageId : null;

        // Das gemerkte Panel kann älter sein als die letzten 50 Nachrichten oder ohne Knöpfe dastehen.
        if (tracked && !found.some((entry) => entry.id === tracked)) {
            const known = await channel.messages.fetch(tracked).catch(() => null);

            if (known) found.push(known);
        }

        const view = await this.PanelView(guild, settings);
        const target = found.find((entry) => entry.id === tracked) ?? found[0] ?? null;
        const edited = target ? await target.edit({ ...view, attachments: [] } as MessageEditOptions).catch(() => null) : null;
        const message =
            edited ??
            (await channel.send(view).catch((error) => {
                throw Explain(error);
            }));

        for (const extra of found) {
            if (extra.id !== message.id) await extra.delete().catch(() => undefined);
        }

        const { channelId: before, messageId: old } = settings.panel;

        if (before && before !== channelId && old) {
            const previous = guild.channels.cache.get(before);

            if (previous?.isTextBased()) await previous.messages.delete(old).catch(() => undefined);
        }

        const panel = { channelId, messageId: message.id };

        await this.SavePanel(guild.id, panel);
        logger.user(`📋 Bewerbungs-Panel auf ${guild.id} in ${channelId}`);

        return { url: message.url, panel };
    }

    /**
     * Ein liegendes Panel an Formulare und Einstellungen anpassen. Ist die
     * Nachricht oder der Kanal weg, vergisst der Bot das Panel. Andere Fehler
     * (Rechte, Discord hakt) brechen nichts ab.
     */
    async RefreshPanel(guild: Guild): Promise<void> {
        const settings = await this.Settings(guild.id);
        const { channelId, messageId } = settings.panel;

        if (!channelId || !messageId) return;

        try {
            const channel = guild.channels.cache.get(channelId);

            if (!channel?.isTextBased()) throw Object.assign(new Error("Unknown Channel"), { code: 10003 });

            const message = await channel.messages.fetch(messageId);

            await message.edit({ ...(await this.PanelView(guild, settings)), attachments: [] } as MessageEditOptions);
        } catch (error) {
            const code = (error as { code?: unknown }).code;

            if (code === 10008 || code === 10003) {
                await this.SavePanel(guild.id, { channelId: null, messageId: null });

                return;
            }

            logger.warn(`📋 Bewerbungs-Panel auf ${guild.id} nicht aktualisiert: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /* ----------------------------------------------------------
       Die öffentliche Seite
       ---------------------------------------------------------- */
    /** Was jemand von außen sieht: offene Formulare eines Servers. null: nichts davon. */
    async Public(guildId: string): Promise<{ guild: Guild; forms: IApplyForm[] } | null> {
        const guild = this.client.guilds.cache.get(guildId);

        if (!guild || !this.client.databaseService.Ready) return null;
        if (!(await this.client.settings.Of(guildId)).modules.includes(APPLY_MODULE)) return null;

        const settings = await this.Settings(guildId);

        if (!settings.open) return null;

        const forms = (await this.Forms(guildId)).filter((form) => form.open);

        return forms.length ? { guild, forms } : null;
    }

    /**
     * Was GET /api/public/apply/:id liefert. Bei Fenster und DM nimmt die Seite
     * nichts an: dann nur, wo das Panel liegt und wie viele Fragen es gibt.
     */
    PublicPayload(guild: Guild, forms: IApplyForm[], settings: IApplySettings, me: { id: string; member: boolean } | null): object {
        const channel = settings.panel.channelId && settings.panel.messageId ? guild.channels.cache.get(settings.panel.channelId) : null;
        const head = {
            guild: { id: guild.id, name: guild.name, icon: guild.iconURL?.({ extension: "png", size: 128 }) ?? null },
            mode: settings.mode,
            panel: channel ? { channelId: channel.id, name: channel.name, url: `https://discord.com/channels/${guild.id}/${channel.id}` } : null,
        };
        const about = (form: IApplyForm) => ({ id: form.id, name: form.name, description: form.description, emoji: form.emoji });

        if (settings.mode === "web") return { ...head, me, forms: forms.map((form) => ({ ...about(form), questions: form.questions })) };

        return { ...head, forms: forms.map((form) => ({ ...about(form), questions: form.questions.length })) };
    }

    /**
     * Darf diese Person sich auf dieses Formular bewerben? Gilt für jeden Weg:
     * der Klick im Panel fragt vorher, Submit am Ende noch einmal. Wirft
     * ApplyError mit dem Satz für den Bewerber.
     */
    async Eligible(guildId: string, userId: string, formId: number): Promise<{ guild: Guild; member: GuildMember; form: IApplyForm; settings: IApplySettings }> {
        const open = await this.Public(guildId);

        if (!open) throw new ApplyError("Auf diesem Server kann man sich gerade nicht bewerben.");

        const form = open.forms.find((entry) => entry.id === formId);

        if (!form) throw new ApplyError("Dieses Formular nimmt gerade keine Bewerbungen an.");

        const guild = open.guild;
        const member = guild.members.cache.get(userId) ?? (await guild.members.fetch(userId).catch(() => null));

        if (!member) throw new ApplyError("Du musst auf dem Server sein, um dich zu bewerben.");

        if (form.settings.requireRole && !member.roles.cache.has(form.settings.requireRole)) {
            throw new ApplyError("Dir fehlt die Rolle, die dieses Formular voraussetzt.", 400, "Das geht noch nicht");
        }

        const age = Date.now() - member.user.createdTimestamp;

        if (form.settings.minAccountDays && age < form.settings.minAccountDays * DAY) {
            throw new ApplyError(`Dein Discord-Konto muss mindestens ${form.settings.minAccountDays} Tage alt sein.`, 400, "Das geht noch nicht");
        }

        const last = await this.client.applySubmissions.Last(form.id, userId);

        if (last?.status === "open") throw new ApplyError("Deine letzte Bewerbung läuft noch – warte die Antwort ab.");

        if (last?.status === "declined" && form.settings.cooldownDays && last.decidedAt) {
            const free = last.decidedAt + form.settings.cooldownDays * DAY;

            if (Date.now() < free) {
                throw new ApplyError(CooldownText(form.settings.cooldownDays, free));
            }
        }

        if (last?.status === "accepted") throw new ApplyError("Du bist hier schon angenommen.");

        return { guild, member, form, settings: await this.Settings(guildId) };
    }

    /**
     * Eine Bewerbung geht ein. Geprüft wird alles hier - die Route und die
     * Abläufe in Discord wissen nur, wer sich bewirbt und auf welchem Weg.
     */
    async Submit(guildId: string, userId: string, formId: number, input: unknown, via: ApplyMode): Promise<IApplySubmission> {
        const { guild, member, form, settings } = await this.Eligible(guildId, userId, formId);

        if (via !== settings.mode) {
            throw new ApplyError(
                via === "web"
                    ? "Auf diesem Server bewirbt man sich in Discord."
                    : "Auf diesem Server bewirbt man sich gerade anders. Klick im Kanal noch einmal auf „Bewerben“.",
                409
            );
        }

        const answers = this.CleanAnswers(form, input);
        const submission = await this.client.applySubmissions.Create({
            formId: form.id,
            guildId,
            userId,
            userName: member.displayName,
            answers,
        });

        const channelId = await this.Post(guild, form, submission).catch(() => null);

        logger.user(`📋 Bewerbung #${submission.id} auf ${guildId} für "${form.name}" (von ${userId})`);

        return { ...submission, channelId };
    }

    CleanAnswers(form: IApplyForm, input: unknown): IApplyAnswer[] {
        const raw = IsRecord(input) ? input : {};
        const answers: IApplyAnswer[] = [];

        for (const question of form.questions) {
            const value = Text(raw[question.id], question.max);

            if (!value) {
                if (question.required) throw new ApplyError(`„${question.label}" fehlt noch.`);

                continue;
            }

            if (question.kind === "choice" && !question.choices.includes(value)) {
                throw new ApplyError(`Bei „${question.label}" ist das keine der Möglichkeiten.`);
            }

            answers.push({ id: question.id, value });
        }

        return answers;
    }

    /* ----------------------------------------------------------
       Die Karte in Discord
       ---------------------------------------------------------- */
    /**
     * Die Karte senden. Bei „Eigener Kanal“ (Plan 30) entsteht erst der Kanal,
     * geht das nicht, landet die Karte im Sammelkanal - die Bewerbung ist ja
     * schon gespeichert. Gibt die ID des eigenen Kanals zurück.
     */
    private async Post(guild: Guild, form: IApplyForm, submission: IApplySubmission): Promise<string | null> {
        const settings = await this.Settings(guild.id);

        if (settings.target === "channel") {
            const own = await this.OpenChannel(guild, form, submission, settings).catch((error: unknown) => {
                logger.warn(`📋 Kanal für Bewerbung #${submission.id} auf ${guild.id} nicht angelegt: ${error instanceof Error ? error.message : String(error)}`);

                return null;
            });

            if (own) return own;
        }

        const channelId = form.settings.channelId ?? settings.channelId;

        if (!channelId) return null;

        const channel = guild.channels.cache.get(channelId);

        if (!channel?.isTextBased()) return null;

        const sent = await channel.send(ApplyCard(this.client, form, submission, true)).catch(() => null);

        if (sent) await this.client.applySubmissions.SetMessage(submission.id, sent.id);

        return null;
    }

    /** Der eigene Kanal samt Karte. Steht die Karte nicht drin, verschwindet der Kanal wieder - nie einer ohne Karte. */
    private async OpenChannel(guild: Guild, form: IApplyForm, submission: IApplySubmission, settings: IApplySettings): Promise<string> {
        // Eine gelöschte Rolle oder ein Prüfer, der den Server verlassen hat, ließe Discord den ganzen Kanal ablehnen.
        const reviewRoles = settings.reviewRoles.filter((id) => guild.roles.cache.has(id));
        const reviewUsers = (await Promise.all(settings.reviewUsers.map((id) => guild.members.fetch(id).then(() => id, () => null)))).filter((id): id is string => id !== null);
        const channel = await guild.channels.create({
            name: ChannelName(settings.channelName, { user: submission.userName, id: submission.id, form: form.name }),
            type: ChannelType.GuildText,
            parent: settings.categoryId ?? undefined,
            permissionOverwrites: ApplyChannelOverwrites({
                everyoneId: guild.roles.everyone.id,
                botId: this.client.user!.id,
                applicantId: submission.userId,
                reviewRoles,
                reviewUsers,
                allow: Allowed(guild, MEMBER_ALLOW),
                botAllow: Allowed(guild, BOT_ALLOW),
            }),
            reason: `Bewerbung #${submission.id}`,
        });

        try {
            const sent = await channel.send(ApplyCard(this.client, form, { ...submission, channelId: channel.id }, true));

            await this.client.applySubmissions.SetChannel(submission.id, channel.id);
            await this.client.applySubmissions.SetMessage(submission.id, sent.id);

            return channel.id;
        } catch (error) {
            await channel.delete().catch(() => undefined);

            throw error;
        }
    }

    /**
     * Was nach der Entscheidung mit dem eigenen Kanal passiert (Plan 30):
     * löschen, für den Bewerber schließen oder stehen lassen.
     */
    async AfterDecision(guild: Guild, submission: IApplySubmission, settings: IApplySettings): Promise<void> {
        if (!submission.channelId || settings.afterDecision === "keep") return;

        const channel = guild.channels.cache.get(submission.channelId);

        if (!channel || !("permissionOverwrites" in channel)) return;

        if (settings.afterDecision === "delete") {
            await channel.delete(`Bewerbung #${submission.id} entschieden`);
            await this.client.applySubmissions.SetChannel(submission.id, null);
            await this.client.applySubmissions.SetMessage(submission.id, null);

            return;
        }

        await channel.permissionOverwrites.delete(submission.userId, `Bewerbung #${submission.id} entschieden`);
    }

    /** Die Karte nachziehen, nachdem entschieden wurde. */
    private async Refresh(guild: Guild, form: IApplyForm, submission: IApplySubmission): Promise<void> {
        const settings = await this.Settings(guild.id);
        const channelId = submission.channelId ?? form.settings.channelId ?? settings.channelId;

        if (!channelId || !submission.messageId) return;

        const channel = guild.channels.cache.get(channelId);

        if (!channel?.isTextBased()) return;

        const message = await channel.messages.fetch(submission.messageId).catch(() => null);

        // Beim Bearbeiten will Discord dieselbe Karte ohne die Sende-Flags.
        const { content, components, flags } = ApplyCard(this.client, form, submission);

        await message?.edit({ content: content ?? null, components, flags } as MessageEditOptions).catch(() => undefined);
    }

    /* ----------------------------------------------------------
       Entscheiden
       ---------------------------------------------------------- */
    async Decide(guild: Guild, actor: GuildMember, id: number, status: Exclude<ApplyStatus, "open">, note: unknown): Promise<IApplySubmission> {
        if (!(await this.CanReview(actor))) throw new ApplyError(STAFF_ONLY);

        const submission = await this.client.applySubmissions.Get(id);

        if (!submission || submission.guildId !== guild.id) throw new ApplyError("Diese Bewerbung gibt es nicht.");
        if (submission.status !== "open") throw new ApplyError("Darüber ist schon entschieden.");

        const form = await this.Form(guild.id, submission.formId);

        await this.client.applySubmissions.Decide(id, {
            status,
            note: Text(note, MAX_NOTE) || null,
            decidedBy: actor.id,
            decidedName: actor.displayName,
        });

        const done = (await this.client.applySubmissions.Get(id))!;
        const member = guild.members.cache.get(submission.userId) ?? (await guild.members.fetch(submission.userId).catch(() => null));

        if (status === "accepted" && form.settings.acceptRole && member) {
            await member.roles.add(form.settings.acceptRole, `Bewerbung #${id} angenommen`).catch(() => undefined);
        }

        if (form.settings.dm && member) {
            const text =
                status === "accepted"
                    ? `**${guild.name}** hat deine Bewerbung als **${form.name}** angenommen. Willkommen im Team!`
                    : `**${guild.name}** hat deine Bewerbung als **${form.name}** leider abgelehnt.`;

            await member
                .send({ content: done.note ? `${text}\n\n> ${done.note}` : text })
                .catch(() => undefined);
        }

        await this.Refresh(guild, form, done).catch(() => undefined);
        await this.AfterDecision(guild, done, await this.Settings(guild.id)).catch(() => undefined);

        logger.user(`📋 Bewerbung #${id} auf ${guild.id} ${status === "accepted" ? "angenommen" : "abgelehnt"} (von ${actor.id})`);

        return done;
    }

    /**
     * Eine entschiedene Bewerbung entfernen (Plan 30): bei Annahme die Rolle
     * zurück, die Karte weg, der Eintrag weg. Danach kann sich die Person neu
     * bewerben. Was in Discord nicht klappt, hält das Löschen nicht auf - es
     * steht in left, damit das Dashboard es sagen kann.
     */
    async Remove(guild: Guild, actor: GuildMember, id: number): Promise<{ left: string[] }> {
        if (!(await this.CanReview(actor))) throw new ApplyError(STAFF_ONLY);

        const submission = await this.client.applySubmissions.Get(id);

        if (!submission || submission.guildId !== guild.id) throw new ApplyError("Diese Bewerbung gibt es nicht.");
        if (submission.status === "open") throw new ApplyError("Entscheide erst über die Bewerbung, dann kannst du sie entfernen.");

        const left: string[] = [];
        const form = await this.Form(guild.id, submission.formId).catch(() => null);
        const role = submission.status === "accepted" ? form?.settings.acceptRole : null;

        if (role) {
            const member = guild.members.cache.get(submission.userId) ?? (await guild.members.fetch(submission.userId).catch(() => null));

            // Wer den Server verlassen hat, hat die Rolle ohnehin nicht mehr.
            if (member) {
                await member.roles.remove(role, `Bewerbung #${id} entfernt`).catch(() => {
                    left.push(`Die Rolle @${guild.roles.cache.get(role)?.name ?? role} konnte ich nicht abziehen.`);
                });
            }
        }

        // Der eigene Kanal geht samt Karte, sonst nur die Karte im Sammelkanal. Ist der Kanal
        // schon weg, war die Karte darin - im Sammelkanal gibt es dann nichts zu suchen.
        const own = submission.channelId ? guild.channels.cache.get(submission.channelId) : null;

        if (submission.channelId) {
            await own?.delete(`Bewerbung #${id} entfernt`).catch(() => {
                left.push(`Den Kanal #${own.name} konnte ich nicht löschen.`);
            });
        } else if (submission.messageId && form) {
            const settings = await this.Settings(guild.id);
            const channel = guild.channels.cache.get(form.settings.channelId ?? settings.channelId ?? "");

            if (channel?.isTextBased()) {
                await channel.messages.delete(submission.messageId).catch((error: unknown) => {
                    // Schon gelöscht ist auch gut.
                    if ((error as { code?: unknown }).code !== 10008) left.push("Die Karte in Discord konnte ich nicht löschen.");
                });
            }
        }

        await this.client.applySubmissions.Remove(id);

        logger.user(`📋 Bewerbung #${id} auf ${guild.id} entfernt (von ${actor.id})`);

        return { left };
    }

    /** Die Knöpfe an der Karte. */
    async Handle(interaction: ButtonInteraction): Promise<void> {
        if (!interaction.inCachedGuild()) return;

        const [, what, raw] = interaction.customId.split(":");
        const id = Number(raw);

        if (what === "kanal" && Number.isFinite(id)) return this.DropChannel(interaction, id);

        // Nur ja und nein sind Entscheidungen. Alles andere ist kein Ablehnen.
        if ((what !== "ja" && what !== "nein") || !Number.isFinite(id)) return;

        // Rolle, DM, Karte und eigener Kanal dauern - Discord wartet nur 3 Sekunden auf die erste Antwort.
        await interaction.deferReply({ flags: 64 });

        try {
            const done = await this.Decide(interaction.guild, interaction.member, id, what === "ja" ? "accepted" : "declined", null);

            // Bei „Löschen nach der Entscheidung“ ist der Kanal mit dem Knopf schon weg.
            await interaction.editReply({ content: `Bewerbung #${done.id} ist ${done.status === "accepted" ? "angenommen" : "abgelehnt"}.` }).catch(() => undefined);
        } catch (error) {
            await interaction.editReply({ content: error instanceof ApplyError ? error.message : "Das hat nicht geklappt." }).catch(() => undefined);

            if (!(error instanceof ApplyError)) throw error;
        }
    }

    /** „Kanal löschen“ an einer entschiedenen Karte (Plan 30). */
    private async DropChannel(interaction: ButtonInteraction<"cached">, id: number): Promise<void> {
        if (!(await this.CanReview(interaction.member))) {
            await interaction.reply({ content: STAFF_ONLY, flags: 64 });

            return;
        }

        const submission = await this.client.applySubmissions.Get(id);
        const channel = submission?.guildId === interaction.guildId && submission.channelId ? interaction.guild.channels.cache.get(submission.channelId) : null;

        if (!submission || !channel) {
            await interaction.reply({ content: "Diesen Kanal gibt es nicht mehr.", flags: 64 });

            return;
        }

        await interaction.reply({ content: "Der Kanal wird gelöscht.", flags: 64 });
        await channel.delete(`Bewerbung #${id}: Kanal gelöscht von ${interaction.user.id}`).catch(() => undefined);
        await this.client.applySubmissions.SetChannel(id, null);
        await this.client.applySubmissions.SetMessage(id, null);
    }
}
