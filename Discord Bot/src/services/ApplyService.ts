import { ButtonInteraction, Guild, GuildMember, MessageEditOptions, PermissionFlagsBits } from "discord.js";
import BotClient from "../client/BotClient";
import { ApplyCard } from "../builder/ApplyView";
import {
    APPLY_MODULE,
    DefaultApplySettings,
    DefaultForm,
    DefaultFormSettings,
    MAX_ANSWER,
    MAX_CHOICES,
    MAX_DESCRIPTION,
    MAX_FORMS,
    MAX_HINT,
    MAX_LABEL,
    MAX_NAME,
    MAX_NOTE,
    MAX_QUESTIONS,
    MAX_REVIEWERS,
} from "../constants/Apply";
import {
    ApplyStatus,
    IApplyAnswer,
    IApplyForm,
    IApplyQuestion,
    IApplySettings,
    IApplySubmission,
    IFormSettings,
    QuestionKind,
} from "../interfaces/services/apply/IApply";
import logger from "../utils/logger";

export class ApplyError extends Error {}

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

/**
 * Apply System: Bewerbungen. Formulare kommen aus dem Dashboard, abgeschickt
 * wird über einen öffentlichen Link, entschieden wird im Dashboard oder direkt
 * an der Karte in Discord. Siehe docs/Apply.md.
 */
export default class ApplyService {
    private readonly client: BotClient;

    constructor(client: BotClient) {
        this.client = client;
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
            reviewRoles: ids(raw.reviewRoles, previous.reviewRoles, (id) => guild.roles.cache.has(id) && id !== guild.id),
            reviewUsers: ids(raw.reviewUsers, previous.reviewUsers, (id) => /^\d{17,20}$/.test(id)),
            channelId: raw.channelId === undefined ? previous.channelId : channel?.isTextBased() ? channel.id : null,
            open: typeof raw.open === "boolean" ? raw.open : previous.open,
        };
    }

    async SaveSettings(guild: Guild, input: unknown): Promise<IApplySettings> {
        const settings = this.CleanSettings(guild, input, await this.Settings(guild.id));

        await this.client.moduleSettings.Save(guild.id, APPLY_MODULE, settings);

        return settings;
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

        return form;
    }

    async SaveForm(guild: Guild, id: number, input: unknown): Promise<IApplyForm> {
        const previous = await this.Form(guild.id, id);

        await this.client.applyForms.Save(id, this.CleanForm(guild, input, previous));

        return this.Form(guild.id, id);
    }

    /** Das Formular und alles, was darauf eingegangen ist. */
    async RemoveForm(guild: Guild, id: number): Promise<void> {
        await this.Form(guild.id, id);
        await this.client.applySubmissions.RemoveOfForm(id);
        await this.client.applyForms.Remove(id);
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
     * Eine Bewerbung geht ein. Geprüft wird alles hier - die Route weiß nur,
     * wer angemeldet ist.
     */
    async Submit(guildId: string, userId: string, formId: number, input: unknown): Promise<IApplySubmission> {
        const open = await this.Public(guildId);

        if (!open) throw new ApplyError("Auf diesem Server kann man sich gerade nicht bewerben.");

        const form = open.forms.find((entry) => entry.id === formId);

        if (!form) throw new ApplyError("Dieses Formular nimmt gerade keine Bewerbungen an.");

        const guild = open.guild;
        const member = guild.members.cache.get(userId) ?? (await guild.members.fetch(userId).catch(() => null));

        if (!member) throw new ApplyError("Du musst auf dem Server sein, um dich zu bewerben.");

        if (form.settings.requireRole && !member.roles.cache.has(form.settings.requireRole)) {
            throw new ApplyError("Dir fehlt die Rolle, die dieses Formular voraussetzt.");
        }

        const age = Date.now() - member.user.createdTimestamp;

        if (form.settings.minAccountDays && age < form.settings.minAccountDays * DAY) {
            throw new ApplyError(`Dein Discord-Konto muss mindestens ${form.settings.minAccountDays} Tage alt sein.`);
        }

        const last = await this.client.applySubmissions.Last(form.id, userId);

        if (last?.status === "open") throw new ApplyError("Deine letzte Bewerbung läuft noch – warte die Antwort ab.");

        if (last?.status === "declined" && form.settings.cooldownDays && last.decidedAt) {
            const free = last.decidedAt + form.settings.cooldownDays * DAY;

            if (Date.now() < free) {
                throw new ApplyError(`Nach einer Absage sind ${form.settings.cooldownDays} Tage Pause – du kannst es ab <t:${Math.floor(free / 1000)}:D> wieder versuchen.`);
            }
        }

        if (last?.status === "accepted") throw new ApplyError("Du bist hier schon angenommen.");

        const answers = this.CleanAnswers(form, input);
        const submission = await this.client.applySubmissions.Create({
            formId: form.id,
            guildId,
            userId,
            userName: member.displayName,
            answers,
        });

        await this.Post(guild, form, submission).catch(() => undefined);

        logger.user(`📋 Bewerbung #${submission.id} auf ${guildId} für "${form.name}" (von ${userId})`);

        return submission;
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
    private async Post(guild: Guild, form: IApplyForm, submission: IApplySubmission): Promise<void> {
        const settings = await this.Settings(guild.id);
        const channelId = form.settings.channelId ?? settings.channelId;

        if (!channelId) return;

        const channel = guild.channels.cache.get(channelId);

        if (!channel?.isTextBased()) return;

        const ping = form.settings.pingRoles.map((role) => `<@&${role}>`).join(" ");
        const sent = await channel
            .send({
                ...ApplyCard(this.client, form, submission),
                ...(ping ? { content: ping, allowedMentions: { roles: form.settings.pingRoles } } : {}),
            })
            .catch(() => null);

        if (sent) await this.client.applySubmissions.SetMessage(submission.id, sent.id);
    }

    /** Die Karte nachziehen, nachdem entschieden wurde. */
    private async Refresh(guild: Guild, form: IApplyForm, submission: IApplySubmission): Promise<void> {
        const settings = await this.Settings(guild.id);
        const channelId = form.settings.channelId ?? settings.channelId;

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
        if (!(await this.CanReview(actor))) throw new ApplyError("Bewerbungen sehen und entscheiden nur, wer dafür eingetragen ist.");

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

        logger.user(`📋 Bewerbung #${id} auf ${guild.id} ${status === "accepted" ? "angenommen" : "abgelehnt"} (von ${actor.id})`);

        return done;
    }

    /** Die Knöpfe an der Karte. */
    async Handle(interaction: ButtonInteraction): Promise<void> {
        if (!interaction.inCachedGuild()) return;

        const [, what, raw] = interaction.customId.split(":");
        const id = Number(raw);

        if (!Number.isFinite(id)) return;

        try {
            const done = await this.Decide(interaction.guild, interaction.member, id, what === "ja" ? "accepted" : "declined", null);

            await interaction.reply({
                content: `Bewerbung #${done.id} ist ${done.status === "accepted" ? "angenommen" : "abgelehnt"}.`,
                flags: 64,
            });
        } catch (error) {
            await interaction.reply({
                content: error instanceof ApplyError ? error.message : "Das hat nicht geklappt.",
                flags: 64,
            });

            if (!(error instanceof ApplyError)) throw error;
        }
    }
}
