import {
    ButtonInteraction,
    ChannelType,
    DMChannel,
    ForumChannel,
    Guild,
    GuildForumTagData,
    GuildForumTagEmoji,
    GuildMember,
    MessageFlags,
    PermissionFlagsBits,
} from "discord.js";
import BotClient from "../client/BotClient";
import { AnswersText, ChoiceRow, CloseRow, ConfirmRow, IValueInput, LftRender, LftValues, STEP_CANCEL, TooLong } from "../builder/LftView";
import { Fill } from "../constants/Placeholders";
import {
    ANSWER_TIMEOUT,
    CANCEL_WORDS,
    CLOSED_TAG,
    CONFIRM_TIMEOUT,
    DefaultLftSettings,
    DefaultNotice,
    DefaultDm,
    DefaultSide,
    KINDS,
    KIND_LABELS,
    LFT_MODULE,
    MAX_ANSWER,
    MAX_CHOICES,
    MAX_EXPIRE,
    MAX_HINT,
    MAX_LABEL,
    MAX_MANAGERS,
    MAX_PINGS,
    MAX_QUESTIONS,
    MAX_RETRIES,
    MAX_TAG_NAME,
    MAX_TITLE,
    SKIP_WORDS,
} from "../constants/Lft";
import { ILftAnswer, ILftBody, ILftDm, ILftNotice, ILftQuestion, ILftRequest, ILftSettings, ILftSide, LftKind, LftQuestionKind, LftStatus } from "../interfaces/services/lft/ILft";
import logger from "../utils/logger";

export class LftError extends Error {}

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

function TagEmoji(emoji: string | null): GuildForumTagEmoji | null {
    if (!emoji) return null;

    const custom = emoji.match(/^<a?:\w+:(\d+)>$/);

    return custom ? { id: custom[1], name: null } : { id: null, name: emoji };
}

const DAY = 86_400_000;

/** Das Ergebnis einer Frage: eine Antwort, übersprungen oder Schluss. */
type Step = { ok: true; value: string | null } | { ok: false; reason: "cancel" | "timeout" };

/**
 * Looking for: Spieler suchen ein Team, Teams suchen Spieler.
 *
 * Gefragt wird in der DM - eine Frage je Nachricht, die Fragen selbst kommen
 * aus dem Dashboard. Am Ende steht eine Vorschau mit zwei Knöpfen; erst danach
 * entsteht der Beitrag im Forum. Siehe docs/LookingFor.md.
 */
export default class LookingForService {
    private readonly client: BotClient;

    /** Wer gerade in einem Gespräch steckt - zwei auf einmal wären ein Chaos. */
    private readonly talking = new Set<string>();

    constructor(client: BotClient) {
        this.client = client;
    }

    /* ----------------------------------------------------------
       Einstellungen
       ---------------------------------------------------------- */
    /**
     * Was auf diesem Server gilt. Die Zeile kann aus einer älteren Fassung
     * kommen: was darin fehlt, füllt die Vorgabe - sonst stünde die halbe Seite
     * ohne Werte da.
     */
    async Settings(guildId: string): Promise<ILftSettings> {
        const stored = await this.client.moduleSettings.Of<ILftSettings>(guildId, LFT_MODULE, DefaultLftSettings());

        return {
            ...stored,
            player: this.Whole("player", stored.player),
            team: this.Whole("team", stored.team),
            notice: { ...DefaultNotice(), ...(IsRecord(stored.notice) ? stored.notice : {}) },
            dm: { ...DefaultDm(), ...(IsRecord(stored.dm) ? stored.dm : {}) },
        };
    }

    private Whole(kind: LftKind, side: ILftSide | undefined): ILftSide {
        const base = DefaultSide(kind);

        if (!IsRecord(side)) return base;

        return { ...base, ...side, tag: { ...base.tag, ...(IsRecord(side.tag) ? side.tag : {}) } };
    }

    CleanSettings(guild: Guild, input: unknown, previous: ILftSettings): ILftSettings {
        const raw = IsRecord(input) ? input : {};

        return {
            player: this.CleanSide(guild, "player", raw.player, previous.player),
            team: this.CleanSide(guild, "team", raw.team, previous.team),
            notice: this.CleanNotice(guild, raw.notice, previous.notice),
            dm: this.CleanDm(guild, raw.dm, previous.dm),
            expireDays: Int(raw.expireDays, 0, MAX_EXPIRE, previous.expireDays),
            manageRoles: this.Roles(guild, raw.manageRoles, previous.manageRoles, MAX_MANAGERS),
        };
    }

    private Roles(guild: Guild, value: unknown, fallback: string[], max: number): string[] {
        if (value === undefined) return fallback;
        if (!Array.isArray(value)) return [];

        return [...new Set(value.filter((id): id is string => typeof id === "string" && guild.roles.cache.has(id) && id !== guild.id))].slice(0, max);
    }

    /**
     * Eine Nachricht aus dem Dashboard. Leer lässt Discord sie nicht - wessen
     * Nachricht fehlt, steht deshalb in der Meldung.
     */
    private CleanBody(guild: Guild, label: string, input: unknown, previous: ILftBody): ILftBody {
        if (input === undefined) return previous;

        try {
            return this.client.messageService.CleanBody(guild, IsRecord(input) ? input : {}, previous, previous.doc);
        } catch (error) {
            throw new LftError(`${label}: ${error instanceof Error ? error.message : "Das hat nicht geklappt."}`);
        }
    }

    private CleanSide(guild: Guild, kind: LftKind, input: unknown, previous: ILftSide): ILftSide {
        if (input === undefined) return previous;

        const raw = IsRecord(input) ? input : {};
        const forum = typeof raw.forumId === "string" ? guild.channels.cache.get(raw.forumId) : null;
        const label = KIND_LABELS[kind];
        const questions = raw.questions === undefined ? previous.questions : this.CleanQuestions(raw.questions);
        const tag = IsRecord(raw.tag) ? raw.tag : {};

        if (!questions.length) throw new LftError(`${label}: ohne Fragen gibt es nichts zu beantworten.`);

        const title = Text(raw.title, MAX_TITLE, previous.title);

        if (!title) throw new LftError(`${label}: der Titel des Beitrags fehlt – ein Forum-Beitrag braucht eine Überschrift.`);

        return {
            on: typeof raw.on === "boolean" ? raw.on : previous.on,
            forumId: raw.forumId === undefined ? previous.forumId : forum?.type === ChannelType.GuildForum ? forum.id : null,
            tag: {
                name: Text(tag.name, MAX_TAG_NAME, previous.tag.name) || previous.tag.name,
                emoji: typeof tag.emoji === "string" && tag.emoji.trim() ? tag.emoji.trim().slice(0, 64) : tag.emoji === null ? null : previous.tag.emoji,
                // Die IDs gehören dem Bot: er legt die Tags an und findet sie
                // darüber wieder. Was das Dashboard dazu schickt, zählt nicht.
                id: previous.tag.id,
                closedId: previous.tag.closedId,
            },
            questions,
            title,
            post: this.CleanBody(guild, `${label} – Beitrag`, raw.post, previous.post),
            preview: this.CleanBody(guild, `${label} – Vorschau`, raw.preview, previous.preview),
        };
    }

    private CleanQuestions(input: unknown): ILftQuestion[] {
        if (!Array.isArray(input)) return [];

        const seen = new Set<string>();
        const questions: ILftQuestion[] = [];

        for (const entry of input.slice(0, MAX_QUESTIONS)) {
            if (!IsRecord(entry)) continue;

            const label = Text(entry.label, MAX_LABEL);

            if (!label) continue;

            const id = Text(entry.id, 20) || `q${questions.length + 1}`;

            if (seen.has(id)) continue;

            const kind: LftQuestionKind = entry.kind === "long" || entry.kind === "choice" ? entry.kind : "short";
            const choices =
                kind === "choice" && Array.isArray(entry.choices)
                    ? [...new Set(entry.choices.map((choice) => Text(choice, 100)).filter(Boolean))].slice(0, MAX_CHOICES)
                    : [];

            // Eine Auswahl ohne Möglichkeiten wäre in der DM eine Sackgasse.
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

    private CleanNotice(guild: Guild, input: unknown, previous: ILftNotice): ILftNotice {
        if (input === undefined) return previous;

        const raw = IsRecord(input) ? input : {};
        const channel = typeof raw.channelId === "string" ? guild.channels.cache.get(raw.channelId) : null;

        return {
            channelId: raw.channelId === undefined ? previous.channelId : channel?.isTextBased() && !channel.isThread() ? channel.id : null,
            roles: this.Roles(guild, raw.roles, previous.roles, MAX_PINGS),
            body: this.CleanBody(guild, "Meldung ans Team", raw.body, previous.body),
        };
    }

    private CleanDm(guild: Guild, input: unknown, previous: ILftDm): ILftDm {
        if (input === undefined) return previous;

        const raw = IsRecord(input) ? input : {};

        return {
            intro: this.CleanBody(guild, "Begrüßung", raw.intro, previous.intro),
            question: this.CleanBody(guild, "Frage", raw.question, previous.question),
            done: this.CleanBody(guild, "Abschluss", raw.done, previous.done),
        };
    }

    /**
     * Speichert und legt dabei die Tags an. Klappt das nicht - meist fehlt dem
     * Bot ein Recht im Forum -, wird trotzdem gespeichert: sonst ließe sich
     * keine Frage mehr ändern, bis jemand die Rechte richtet.
     */
    async SaveSettings(guild: Guild, input: unknown): Promise<{ settings: ILftSettings; warning: string | null }> {
        const settings = this.CleanSettings(guild, input, await this.Settings(guild.id));
        const warning = await this.SyncTags(guild, settings)
            .then(() => null)
            .catch((error: unknown) => (error instanceof LftError ? error.message : "Die Tags im Forum konnte der Bot nicht anlegen."));

        await this.client.moduleSettings.Save(guild.id, LFT_MODULE, settings);

        return { settings, warning };
    }

    /* ----------------------------------------------------------
       Die Tags im Forum
       ---------------------------------------------------------- */
    /**
     * Legt im Forum die Tags an, die der Bot braucht: einen je Seite und einen
     * für beendete Suchen. Nutzen Spieler- und Team-Suche dasselbe Forum,
     * stehen dort beide Tags nebeneinander - genau darum geht es.
     *
     * Vorhandene Tags des Servers bleiben stehen. Die eigenen findet der Bot
     * über ihre ID wieder, sonst am Namen; umbenannt wird nur der eigene.
     */
    async SyncTags(guild: Guild, settings: ILftSettings): Promise<void> {
        const forums = new Map<string, LftKind[]>();

        for (const kind of KINDS) {
            const id = settings[kind].forumId;

            if (id) forums.set(id, [...(forums.get(id) ?? []), kind]);
        }

        for (const [forumId, kinds] of forums) {
            const forum = guild.channels.cache.get(forumId);

            if (forum?.type !== ChannelType.GuildForum) continue;

            const tags: GuildForumTagData[] = forum.availableTags.map((tag) => ({ id: tag.id, name: tag.name, moderated: tag.moderated, emoji: tag.emoji }));
            const wanted = [
                ...kinds.map((kind) => ({ name: settings[kind].tag.name, emoji: settings[kind].tag.emoji, id: settings[kind].tag.id })),
                { name: CLOSED_TAG.name, emoji: CLOSED_TAG.emoji as string, id: kinds.map((kind) => settings[kind].tag.closedId).find(Boolean) ?? null },
            ];

            let changed = false;

            for (const entry of wanted) {
                const name = entry.name.slice(0, MAX_TAG_NAME);
                const emoji = TagEmoji(entry.emoji);
                const found = tags.find((tag) => entry.id && tag.id === entry.id) ?? tags.find((tag) => tag.name === name);

                if (!found) {
                    tags.push({ name, emoji, moderated: false });
                    changed = true;
                } else if (found.name !== name || found.emoji?.id !== emoji?.id || found.emoji?.name !== emoji?.name) {
                    found.name = name;
                    found.emoji = emoji;
                    changed = true;
                }
            }

            if (tags.length > 20) {
                throw new LftError(`Das Forum bräuchte ${tags.length} Tags, Discord erlaubt 20. Räum im Forum ein paar alte Tags weg.`);
            }

            const updated = changed
                ? await (forum as ForumChannel).setAvailableTags(tags).catch((error: unknown) => {
                      throw this.Explain(error, forum.name);
                  })
                : (forum as ForumChannel);
            const idOf = (name: string): string | null => updated.availableTags.find((tag) => tag.name === name.slice(0, MAX_TAG_NAME))?.id ?? null;

            for (const kind of kinds) {
                settings[kind].tag.id = idOf(settings[kind].tag.name);
                settings[kind].tag.closedId = idOf(CLOSED_TAG.name);
            }
        }
    }

    private Explain(error: unknown, where: string): LftError {
        const code = (error as { code?: number | string }).code;

        if (Number(code) === 50013) return new LftError(`Dem Bot fehlt „Kanäle verwalten“ in #${where} – die Tags konnte er nicht anlegen.`);

        return new LftError(`Die Tags in #${where} konnte der Bot nicht anlegen: ${error instanceof Error ? error.message : String(error)}`);
    }

    /* ----------------------------------------------------------
       Die Anfragen
       ---------------------------------------------------------- */
    Requests(guildId: string, filter: { kind?: LftKind; status?: LftStatus; page?: number }) {
        return this.client.lftRequests.Page(guildId, filter);
    }

    /** Die laufenden Suchen einer Person - ohne Art beide. */
    async Mine(guildId: string, userId: string, kind?: LftKind): Promise<ILftRequest[]> {
        const kinds = kind ? [kind] : KINDS;
        const found = await Promise.all(kinds.map((entry) => this.client.lftRequests.Open(guildId, userId, entry)));

        return found.filter((request): request is ILftRequest => request !== null);
    }

    /** Die Adresse des Beitrags - ohne Beitrag gibt es keine. */
    Link(guildId: string, request: ILftRequest): string | null {
        return request.threadId ? `https://discord.com/channels/${guildId}/${request.threadId}` : null;
    }

    /* ----------------------------------------------------------
       Das Gespräch in der DM
       ---------------------------------------------------------- */
    /**
     * Prüft alles, was von außen kommt, und schreibt die erste Nachricht. Das
     * Gespräch selbst läuft danach für sich weiter - der Befehl wartet nicht
     * zehn Minuten auf eine Antwort.
     */
    async Start(member: GuildMember, kind: LftKind): Promise<string> {
        if (!this.client.databaseService.Ready) throw new LftError("Die Datenbank ist gerade nicht da – versuch es in einem Moment noch einmal.");

        const guild = member.guild;
        const settings = await this.Settings(guild.id);
        const side = settings[kind];
        const label = KIND_LABELS[kind];

        if (!side.on) throw new LftError(`Die ${label} ist auf diesem Server gerade aus.`);
        if (!side.questions.length) throw new LftError(`Für die ${label} sind noch keine Fragen eingestellt – sag das jemandem vom Team.`);

        const forum = side.forumId ? guild.channels.cache.get(side.forumId) : null;

        if (forum?.type !== ChannelType.GuildForum) throw new LftError(`Für die ${label} fehlt noch das Forum – sag das jemandem vom Team.`);

        const open = await this.client.lftRequests.Open(guild.id, member.id, kind);

        if (open) {
            const link = this.Link(guild.id, open);

            throw new LftError(
                `Du hast schon eine laufende ${label}${link ? `: ${link}` : ""}. Beende sie zuerst – mit dem Knopf unter dem Beitrag oder mit \`/lookingfor beenden\`.`
            );
        }

        if (this.talking.has(member.id)) throw new LftError("Ich habe dir schon geschrieben – schau in deine DMs. Mit **abbrechen** kommst du dort raus.");

        const dm = await member.user.createDM().catch(() => null);

        if (!dm) throw new LftError("Ich kann dir nicht schreiben. Erlaube in den Server-Einstellungen Nachrichten von Mitgliedern und versuch es erneut.");

        this.talking.add(member.id);

        // Losgelöst: der Befehl antwortet sofort, das Gespräch läuft weiter.
        void this.Ask(dm, member, kind, settings)
            .catch(async (error: unknown) => {
                const normalized = error instanceof Error ? error : new Error(String(error));

                await dm.send({ content: "Da ist etwas schiefgegangen – das Team weiß davon. Versuch es später noch einmal." }).catch(() => undefined);
                await this.client.guardian.ReportError(normalized, null, `Looking for: Gespräch mit ${member.id}`);
            })
            .finally(() => this.talking.delete(member.id));

        return `Ich habe dir eine Nachricht geschickt: dort stehen **${side.questions.length} Fragen** zur ${label}.`;
    }

    private async Ask(dm: DMChannel, member: GuildMember, kind: LftKind, settings: ILftSettings): Promise<void> {
        const side = settings[kind];
        const guild = member.guild;
        const base = {
            guild,
            kind,
            user: { id: member.id, name: member.displayName, avatar: member.user.displayAvatarURL({ size: 256 }) },
            questions: side.questions,
            forumId: side.forumId,
        };

        await dm.send(await LftRender(this.client, settings.dm.intro, LftValues(base)));

        const answers: ILftAnswer[] = [];

        for (const [index, question] of side.questions.entries()) {
            const step = await this.AskOne(dm, member, settings, base, question, index);

            if (!step.ok) {
                await dm.send({
                    content:
                        step.reason === "cancel"
                            ? "Alles klar, abgebrochen – gespeichert ist nichts. Mit `/lookingfor` fängst du neu an."
                            : "⌛ Ich habe eine Weile nichts gehört und höre hier auf. Mit `/lookingfor` fängst du neu an.",
                }).catch(() => undefined);

                return;
            }

            if (step.value !== null) answers.push({ id: question.id, label: question.label, value: step.value });
        }

        if (!answers.length) {
            await dm.send({ content: "Ohne eine einzige Antwort gibt es nichts zu zeigen – abgebrochen." }).catch(() => undefined);

            return;
        }

        const title = Fill(side.title, LftValues({ ...base, answers })).trim().slice(0, MAX_TITLE) || `${KIND_LABELS[kind]} von ${member.displayName}`;
        const values = LftValues({ ...base, answers, title });
        const card = await dm.send(await LftRender(this.client, side.preview, values, [ConfirmRow()]));
        const click = await card.awaitMessageComponent({ time: CONFIRM_TIMEOUT }).catch(() => null);

        if (click) await click.deferUpdate().catch(() => undefined);

        // Die Knöpfe weg: ein alter Klick würde sonst ins Leere laufen.
        await card.edit(await this.Plain(side.preview, values)).catch(() => undefined);

        if (!click || click.customId === STEP_CANCEL) {
            await dm.send({
                content: click ? "Weggeworfen – nichts landet im Forum. Mit `/lookingfor` fängst du neu an." : "⌛ Die Vorschau ist abgelaufen – nichts landet im Forum.",
            }).catch(() => undefined);

            return;
        }

        await this.Publish(member, kind, settings, answers, title, base);
    }

    /** Eine Frage stellen und auf die Antwort warten. */
    private async AskOne(
        dm: DMChannel,
        member: GuildMember,
        settings: ILftSettings,
        base: Omit<IValueInput, "step">,
        question: ILftQuestion,
        index: number
    ): Promise<Step> {
        const total = base.questions?.length ?? 0;
        const values = LftValues({ ...base, step: { question, index, total } });
        const choice = question.kind === "choice";
        const sent = await dm.send(await LftRender(this.client, settings.dm.question, values, choice ? [ChoiceRow(question)] : []));

        if (choice) {
            const picked = await sent
                .awaitMessageComponent({ time: ANSWER_TIMEOUT })
                .then(async (interaction) => {
                    await interaction.deferUpdate().catch(() => undefined);

                    return interaction.isStringSelectMenu() ? interaction.values[0] : null;
                })
                .catch(() => null);

            // Das Menü weg: es soll nicht zweimal gehen.
            await sent.edit(await this.Plain(settings.dm.question, values)).catch(() => undefined);

            if (!picked) return { ok: false, reason: "timeout" };

            return { ok: true, value: picked };
        }

        for (let tries = 0; tries < MAX_RETRIES; tries++) {
            const collected = await dm
                .awaitMessages({ filter: (message) => message.author.id === member.id, max: 1, time: ANSWER_TIMEOUT, errors: ["time"] })
                .catch(() => null);
            const text = collected?.first()?.content.trim() ?? "";

            if (!collected?.size) return { ok: false, reason: "timeout" };
            if (CANCEL_WORDS.includes(text.toLowerCase())) return { ok: false, reason: "cancel" };

            if (SKIP_WORDS.includes(text.toLowerCase())) {
                if (!question.required) return { ok: true, value: null };

                await dm.send({ content: "Diese Frage ist Pflicht – ohne Antwort geht es hier nicht weiter." }).catch(() => undefined);

                continue;
            }

            if (!text) {
                await dm.send({ content: "Da war kein Text dabei – schreib deine Antwort als Nachricht." }).catch(() => undefined);

                continue;
            }

            if (text.length > question.max) {
                await dm.send({ content: TooLong(text.length, question.max) }).catch(() => undefined);

                continue;
            }

            return { ok: true, value: text };
        }

        return { ok: false, reason: "cancel" };
    }

    /** Dieselbe Nachricht ohne Knöpfe - zum Bearbeiten, wenn sie erledigt ist. */
    private async Plain(body: ILftBody, values: ReturnType<typeof LftValues>) {
        const view = await LftRender(this.client, body, values);

        return { content: view.content ?? null, embeds: view.embeds ?? [], components: view.components, flags: view.flags };
    }

    /* ----------------------------------------------------------
       Der Beitrag im Forum
       ---------------------------------------------------------- */
    private async Publish(
        member: GuildMember,
        kind: LftKind,
        settings: ILftSettings,
        answers: ILftAnswer[],
        title: string,
        base: Omit<IValueInput, "step">
    ): Promise<void> {
        const guild = member.guild;
        const side = settings[kind];
        const dm = await member.user.createDM().catch(() => null);

        // Zwischen Vorschau und Klick kann viel passieren: ein zweiter Befehl in
        // einem anderen Fenster, ein geschlossenes Forum.
        const open = await this.client.lftRequests.Open(guild.id, member.id, kind);

        if (open) {
            await dm?.send({ content: `Du hast inzwischen schon eine laufende ${KIND_LABELS[kind]} – diese hier habe ich verworfen.` }).catch(() => undefined);

            return;
        }

        const forum = side.forumId ? guild.channels.cache.get(side.forumId) : null;

        if (forum?.type !== ChannelType.GuildForum) {
            await dm?.send({ content: "Das Forum gibt es nicht mehr – sag das jemandem vom Team. Deine Antworten sind leider weg." }).catch(() => undefined);

            return;
        }

        // Fehlt der Tag noch, wird er jetzt angelegt: das Forum kann ihn
        // verlangen, und ohne Tag lehnt Discord den Beitrag ab.
        if (!side.tag.id) {
            await this.SyncTags(guild, settings).catch(() => undefined);
            await this.client.moduleSettings.Save(guild.id, LFT_MODULE, settings);
        }

        const request = await this.client.lftRequests.Create({
            guildId: guild.id,
            kind,
            userId: member.id,
            userName: member.displayName,
            title,
            answers,
        });
        const values = LftValues({ ...base, answers, title, createdAt: request.createdAt });
        const view = await LftRender(this.client, side.post, values, [CloseRow(request.id)]);
        const thread = await (forum as ForumChannel).threads
            .create({
                name: title,
                message: { ...view },
                appliedTags: side.tag.id ? [side.tag.id] : [],
                reason: `Looking for #${request.id} von ${member.user.tag}`,
            })
            .catch((error: unknown) => {
                logger.warn(`🔎 Beitrag für Anfrage #${request.id} auf ${guild.id} nicht erstellt: ${String(error)}`);

                return null;
            });

        if (!thread) {
            await this.client.lftRequests.Remove(request.id);
            await dm
                ?.send({ content: `In ${side.forumId ? `<#${side.forumId}>` : "dem Forum"} durfte der Bot keinen Beitrag anlegen – sag das jemandem vom Team.` })
                .catch(() => undefined);

            return;
        }

        // Bei einem Forum-Beitrag hat die erste Nachricht dieselbe ID wie der
        // Beitrag selbst - ein zweiter Abruf wäre umsonst.
        await this.client.lftRequests.SetPost(request.id, thread.id, thread.id);

        const link = `https://discord.com/channels/${guild.id}/${thread.id}`;
        const done = LftValues({ ...base, answers, title, url: link, createdAt: request.createdAt });

        await dm?.send(await LftRender(this.client, settings.dm.done, done)).catch(() => undefined);
        await this.Notify(guild, settings, { ...request, threadId: thread.id }, done).catch(() => undefined);

        logger.user(`🔎 ${KIND_LABELS[kind]} #${request.id} auf ${guild.id} von ${member.id}: ${thread.id}`);
    }

    /** Die Meldung ans Team. Ohne Kanal bleibt sie aus. */
    private async Notify(guild: Guild, settings: ILftSettings, request: ILftRequest, values: ReturnType<typeof LftValues>): Promise<void> {
        const notice = settings.notice;

        if (!notice.channelId) return;

        const channel = guild.channels.cache.get(notice.channelId);

        if (!channel?.isTextBased()) return;

        const ping = notice.roles.map((role) => `<@&${role}>`).join(" ");
        const view = await LftRender(this.client, notice.body, values, [CloseRow(request.id, true)]);
        const sent = await channel
            .send({
                ...view,
                ...(ping ? { content: ping, allowedMentions: { roles: notice.roles } } : {}),
            })
            .catch(() => null);

        if (sent) await this.client.lftRequests.SetNotice(request.id, sent.id);
    }

    /* ----------------------------------------------------------
       Beenden
       ---------------------------------------------------------- */
    /**
     * Beendet eine Suche: der Beitrag bekommt den Tag „Beendet“ und wird
     * geschlossen. Der Verlauf bleibt lesbar - nur schreiben kann dort niemand
     * mehr.
     */
    async Close(guild: Guild, id: number, by: string | null): Promise<ILftRequest> {
        const request = await this.client.lftRequests.Get(id);

        if (!request || request.guildId !== guild.id) throw new LftError("Diese Anfrage gibt es nicht.");
        if (request.status === "closed") throw new LftError("Diese Suche ist schon beendet.");

        const settings = await this.Settings(guild.id);
        const channel = request.threadId ? await guild.channels.fetch(request.threadId).catch(() => null) : null;

        if (channel?.isThread()) {
            const closed = settings[request.kind].tag.closedId;
            const tags = [...new Set([...channel.appliedTags, ...(closed ? [closed] : [])])].slice(0, 5);

            // Tags, Schloss und Archiv in einem Zug: an einem archivierten
            // Beitrag laesst sich nichts mehr aendern.
            await channel.edit({ appliedTags: tags, locked: true, archived: true }).catch(() => undefined);
        }

        await this.client.lftRequests.Close(id, by);

        logger.user(`🔎 Anfrage #${id} auf ${guild.id} beendet${by ? ` (von ${by})` : " (abgelaufen)"}`);

        return (await this.client.lftRequests.Get(id))!;
    }

    /** Löscht den Beitrag mitsamt der Anfrage - für das Team, wenn etwas nicht passt. */
    async Kill(guild: Guild, id: number, by: string): Promise<void> {
        const request = await this.client.lftRequests.Get(id);

        if (!request || request.guildId !== guild.id) throw new LftError("Diese Anfrage gibt es nicht.");

        if (request.threadId) {
            const thread = await guild.channels.fetch(request.threadId).catch(() => null);

            await thread?.delete(`Looking for #${id} gelöscht von ${by}`).catch(() => undefined);
        }

        await this.client.lftRequests.Remove(id);

        logger.user(`🔎 Anfrage #${id} auf ${guild.id} gelöscht (von ${by})`);
    }

    /** Darf dieses Mitglied fremde Suchen beenden? */
    async CanManage(member: GuildMember): Promise<boolean> {
        if (member.permissions.has(PermissionFlagsBits.ManageGuild) || member.permissions.has(PermissionFlagsBits.ManageThreads)) return true;

        const settings = await this.Settings(member.guild.id);

        return settings.manageRoles.some((role) => member.roles.cache.has(role));
    }

    /** Die Knöpfe am Beitrag und an der Meldung. */
    async Handle(interaction: ButtonInteraction): Promise<void> {
        if (!interaction.inCachedGuild()) return;

        const [, what, raw] = interaction.customId.split(":");
        const id = Number(raw);

        if (!Number.isFinite(id)) return;

        // Aufschieben statt antworten: das Schliessen geht ueber Discord und die
        // Datenbank und kann laenger dauern, als eine Interaktion offen bleibt.
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const say = async (text: string): Promise<void> => {
            await interaction.editReply({ content: text });
        };

        try {
            const request = await this.client.lftRequests.Get(id);

            if (!request || request.guildId !== interaction.guildId) return say("Diese Anfrage gibt es nicht mehr.");

            const own = request.userId === interaction.user.id;

            if (!own && !(await this.CanManage(interaction.member))) {
                return say("Das darf nur, wer die Suche gestartet hat – oder das Team.");
            }

            if (what === "kill") {
                if (!(await this.CanManage(interaction.member))) return say("Einen Beitrag löschen darf nur das Team.");

                await this.Kill(interaction.guild, id, interaction.user.id);

                return say("Der Beitrag ist gelöscht.");
            }

            await this.Close(interaction.guild, id, interaction.user.id);
            await say(own ? "Deine Suche ist beendet – der Beitrag ist zu." : `Die Suche von **${request.userName}** ist beendet.`);
        } catch (error) {
            if (!(error instanceof LftError)) throw error;

            await say(error.message).catch(() => undefined);
        }
    }

    /* ----------------------------------------------------------
       Ablauf
       ---------------------------------------------------------- */
    /**
     * Schließt Suchen, die zu lange laufen. Wie lange, sagt jeder Server selbst
     * - bei 0 läuft eine Suche, bis jemand sie beendet.
     */
    async Expire(): Promise<number> {
        if (!this.client.databaseService.Ready) return 0;

        let closed = 0;

        for (const guild of this.client.guilds.cache.values()) {
            if (!(await this.client.settings.Of(guild.id)).modules.includes(LFT_MODULE)) continue;

            const settings = await this.Settings(guild.id);

            if (!settings.expireDays) continue;

            for (const request of await this.client.lftRequests.StaleOf(guild.id, Date.now() - settings.expireDays * DAY)) {
                await this.Close(guild, request.id, null).catch(() => undefined);
                closed++;
            }
        }

        return closed;
    }

    /** Für die Prüfskripte und die Vorschau: die Antworten als Text. */
    Preview(answers: ILftAnswer[], short = false): string {
        return AnswersText(answers, short);
    }
}
