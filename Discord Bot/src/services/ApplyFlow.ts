import { randomBytes } from "node:crypto";
import {
    ButtonInteraction,
    ChatInputCommandInteraction,
    Guild,
    LabelBuilder,
    Message,
    MessageCreateOptions,
    MessageFlags,
    ModalBuilder,
    ModalSubmitInteraction,
    StringSelectMenuBuilder,
    StringSelectMenuInteraction,
    TextInputBuilder,
    TextInputStyle,
} from "discord.js";
import BotClient from "../client/BotClient";
import ComponentV2Builder from "../builder/ComponentV2Builder";
import { ApplyNotice, DmQuestionView, DmSummaryView } from "../builder/ApplyView";
import { APPLY_FLOW_PREFIX, APPLY_MODULE, ApplyLink, DRAFT_TTL, MODAL_FIELDS, MODAL_LABEL, MODAL_TEXT, MODAL_TITLE, RECEIVED } from "../constants/Apply";
import { IApplyAnswer, IApplyForm, IApplyQuestion, IApplySettings, IApplySubmission } from "../interfaces/services/apply/IApply";
import { ButtonOptions } from "../interfaces/builder/IComponentV2Builder";
import logger from "../utils/logger";
import type ApplyService from "./ApplyService";
import { ApplyError } from "./ApplyService";

/**
 * Bewerben in Discord (Plan 24): das Fenster (Modal) in Teilen und die
 * Fragen per DM. Was jemand schon beantwortet hat, liegt als Entwurf im
 * Speicher - einer je Person, 30 Minuten ab der letzten Aktivität, nach einem
 * Neustart weg. Abgeschickt wird am Ende immer über ApplyService.Submit, das
 * alles noch einmal prüft. Siehe docs/Apply.md.
 */

export interface IApplyDraft {
    /** Steht in den IDs der Knöpfe und Fenster. Passt sie nicht, ist der Entwurf abgelaufen. */
    id: string;
    userId: string;
    guildId: string;
    formId: number;
    via: "modal" | "dm";
    /** Frage-ID → Antwort. */
    answers: Record<string, string>;
    /** Beim Fenster der Teil (ab 0), bei der DM die Frage (ab 0). */
    step: number;
    touched: number;
    /** Nur bei der DM: der Kanal und die letzte Fragenachricht. */
    channelId: string | null;
    messageId: string | null;
    /** Nur bei der DM: was die letzte Nachricht zeigt, die ID einer Frage oder SUMMARY. */
    shown: string | null;
}

type StartInteraction = ButtonInteraction | StringSelectMenuInteraction | ChatInputCommandInteraction;
type FlowInteraction = ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction;

export const EXPIRED = "Diese Bewerbung ist abgelaufen. Klick im Kanal noch einmal auf „Bewerben“.";
const CHANGED = "Das Formular hat sich gerade geändert. Weiter geht es mit der Nachricht darunter.";

/** Die Fragen in Fenster zu je höchstens 5 - mehr nimmt Discord nicht. */
export function ModalParts(questions: IApplyQuestion[]): IApplyQuestion[][] {
    const parts: IApplyQuestion[][] = [];

    for (let index = 0; index < questions.length; index += MODAL_FIELDS) parts.push(questions.slice(index, index + MODAL_FIELDS));

    return parts;
}

/** „Moderator · Teil 2 von 3“ in 45 Zeichen. Gekürzt wird der Name, nie der Teil. part: ab 1. */
export function ModalTitle(name: string, part: number, parts: number): string {
    const suffix = parts > 1 ? ` · Teil ${part} von ${parts}` : "";
    const room = MODAL_TITLE - suffix.length;

    return `${name.length > room ? `${name.slice(0, room - 1)}…` : name}${suffix}`;
}

/**
 * Was über einem Feld im Fenster steht. Discord erlaubt 45 Zeichen für die
 * Beschriftung: Ist die Frage länger, steht sie gekürzt da und ganz darunter,
 * der Hinweis rückt dann ins Feld.
 */
export function FieldText(question: IApplyQuestion): { label: string; description: string | null; placeholder: string | null } {
    const hint = question.hint ? question.hint.slice(0, MODAL_TEXT) : null;

    if (question.label.length <= MODAL_LABEL) return { label: question.label, description: hint, placeholder: null };

    return {
        label: `${question.label.slice(0, MODAL_LABEL - 1)}…`,
        description: question.label.slice(0, MODAL_TEXT),
        placeholder: question.kind === "choice" ? null : hint,
    };
}

/** Was /bewerben tut. settings null: das Modul ist aus. */
export function EntryOf(settings: IApplySettings | null, forms: IApplyForm[]): "closed" | "web" | "start" | "pick" {
    const open = forms.filter((form) => form.open);

    if (!settings?.open || open.length === 0) return "closed";
    if (settings.mode === "web") return "web";

    return open.length === 1 ? "start" : "pick";
}

/** Plan 30: Steht die Bewerbung in einem eigenen Kanal, führt die Bestätigung dorthin. */
export function ChannelButton(submission: IApplySubmission): ButtonOptions[] {
    return submission.channelId ? [{ url: `https://discord.com/channels/${submission.guildId}/${submission.channelId}`, label: "Zu deinem Kanal" }] : [];
}

export function DmLink(channelId: string): string {
    return `https://discord.com/channels/@me/${channelId}`;
}

/** Passt dieser Text als Antwort auf die Frage? null: ja, sonst der Satz für den Bewerber. */
export function CheckDmText(question: IApplyQuestion, text: string): string | null {
    const value = text.trim();

    if (question.kind === "choice") return "Wähl oben eine Möglichkeit aus.";
    if (!value) return "Hier brauche ich Text.";

    if (value.length > question.max) {
        return `Das sind ${value.length.toLocaleString("de-DE")} Zeichen, hier gehen höchstens ${question.max.toLocaleString("de-DE")}. Schick sie bitte kürzer.`;
    }

    return null;
}

export type DmEvent = { kind: "text"; text: string } | { kind: "choice"; value: string } | { kind: "skip" } | { kind: "back" } | { kind: "restart" };

/**
 * Ein Schritt in der DM, ohne Discord: was eine Antwort, ein Knopf oder das
 * Menü mit dem Entwurf macht. Gibt einen neuen Entwurf zurück und lässt den
 * alten, wie er ist. step >= Zahl der Fragen heißt Zusammenfassung - auch,
 * wenn das Formular inzwischen Fragen verloren hat.
 */
export function DmStep(draft: IApplyDraft, form: IApplyForm, event: DmEvent): { draft: IApplyDraft; error: string | null } {
    const count = form.questions.length;
    const step = Math.min(draft.step, count);
    const question = form.questions[step];
    const next = (changes: Partial<IApplyDraft>) => ({ draft: { ...draft, answers: { ...draft.answers }, step, ...changes }, error: null });
    const refuse = (error: string) => ({ draft: { ...draft, step }, error });

    if (event.kind === "restart") return next({ step: 0, answers: {} });
    if (event.kind === "back") return next({ step: Math.max(0, step - 1) });
    if (!question) return refuse("Alle Fragen sind beantwortet. Schick die Bewerbung unten ab oder fang neu an.");

    if (event.kind === "skip") {
        if (question.required) return refuse("Diese Frage muss beantwortet werden.");

        const answers = { ...draft.answers };

        delete answers[question.id];

        return next({ step: step + 1, answers });
    }

    if (event.kind === "choice") {
        if (question.kind !== "choice" || !question.choices.includes(event.value)) return refuse(`Bei „${question.label}“ ist das keine der Möglichkeiten.`);

        return next({ step: step + 1, answers: { ...draft.answers, [question.id]: event.value } });
    }

    const error = CheckDmText(question, event.text);

    if (error) return refuse(error);

    return next({ step: step + 1, answers: { ...draft.answers, [question.id]: event.text.trim() } });
}

export const SUMMARY = "summary";

/** Was die DM bei diesem Schritt zeigt: die ID der Frage oder die Zusammenfassung. */
export function DmShown(form: IApplyForm, step: number): string {
    return step < form.questions.length ? form.questions[step].id : SUMMARY;
}

/**
 * Hat sich das Formular geändert, seit die letzte Nachricht rausging? Steht
 * die angezeigte Frage noch drin, gilt die Antwort ihr, auch an anderer
 * Stelle. Fehlt sie oder kam hinter der Zusammenfassung eine Frage dazu, ist
 * die Nachricht veraltet (stale): neu zeigen, die Eingabe nicht werten.
 */
export function DmRealign(draft: IApplyDraft, form: IApplyForm): { draft: IApplyDraft; stale: boolean } {
    if (draft.shown === null || draft.shown === DmShown(form, draft.step)) return { draft, stale: false };

    const index = form.questions.findIndex((question) => question.id === draft.shown);

    if (index >= 0) return { draft: { ...draft, step: index }, stale: false };

    return { draft: { ...draft, step: Math.min(draft.step, form.questions.length) }, stale: true };
}

/** Die Antworten eines Entwurfs in der Reihenfolge der Fragen. */
function AnswersOf(form: IApplyForm, draft: IApplyDraft): IApplyAnswer[] {
    return form.questions.filter((question) => draft.answers[question.id] !== undefined).map((question) => ({ id: question.id, value: draft.answers[question.id] }));
}

/** Ein Feld im Fenster: Text oder Auswahl. Looking for nutzt es mit (Plan 30). */
export function ModalField(question: IApplyQuestion): LabelBuilder {
    const text = FieldText(question);
    const label = new LabelBuilder().setLabel(text.label);

    if (text.description) label.setDescription(text.description);

    if (question.kind === "choice") {
        return label.setStringSelectMenuComponent(
            new StringSelectMenuBuilder()
                .setCustomId(question.id)
                .setRequired(question.required)
                .setMinValues(question.required ? 1 : 0)
                .setMaxValues(1)
                .setPlaceholder("Wähl etwas aus")
                .addOptions(question.choices.map((choice) => ({ label: choice, value: choice })))
        );
    }

    const input = new TextInputBuilder()
        .setCustomId(question.id)
        .setStyle(question.kind === "long" ? TextInputStyle.Paragraph : TextInputStyle.Short)
        .setMaxLength(question.max)
        .setRequired(question.required);

    if (text.placeholder) input.setPlaceholder(text.placeholder);

    return label.setTextInputComponent(input);
}

/** Nach einem Fehler beim Abschicken ist der Entwurf weg: sagen, wie es weitergeht - nur, wenn die Meldung das nicht schon tut (W-0020). */
export function RestartHint(message: string): string {
    return /im kanal/i.test(message) ? message : `${message} Im Kanal kannst du neu anfangen.`;
}

export default class ApplyFlow {
    private readonly client: BotClient;
    private readonly drafts = new Map<string, IApplyDraft>();
    /** Bei der DM: endet nach 30 Minuten ohne Antwort von selbst und sagt das. */
    private readonly timers = new Map<string, NodeJS.Timeout>();
    /** Was einen Entwurf ändert, läuft je Person nacheinander. */
    private readonly queues = new Map<string, Promise<void>>();

    constructor(client: BotClient) {
        this.client = client;
    }

    /** Erst beim Aufruf: der Flow entsteht im Konstruktor des Service. */
    private get service() {
        return this.client.applyService;
    }

    /* ----------------------------------------------------------
       Entwürfe
       ---------------------------------------------------------- */
    private Sweep(now: number): void {
        for (const [userId, draft] of this.drafts) {
            if (now - draft.touched <= DRAFT_TTL) continue;

            // Kommt das Aufräumen dem Zeitgeber knapp zuvor, sagt die DM trotzdem Bescheid (W-0020).
            if (draft.via === "dm") void this.Expire(userId, draft.id).catch(() => undefined);
            else this.End(userId);
        }
    }

    /** Ein neuer Entwurf ersetzt den alten dieser Person. */
    Open(draft: Omit<IApplyDraft, "id" | "touched" | "answers" | "step" | "shown">, now = Date.now()): IApplyDraft {
        this.Sweep(now);
        this.End(draft.userId);

        const fresh: IApplyDraft = { ...draft, id: randomBytes(6).toString("hex"), answers: {}, step: 0, touched: now, shown: null };

        this.drafts.set(draft.userId, fresh);
        this.Arm(fresh);

        return fresh;
    }

    private Arm(draft: IApplyDraft): void {
        if (draft.via !== "dm") return;

        clearTimeout(this.timers.get(draft.userId));
        this.timers.set(
            draft.userId,
            setTimeout(() => void this.Expire(draft.userId, draft.id).catch(() => undefined), DRAFT_TTL).unref()
        );
    }

    Draft(userId: string, now = Date.now()): IApplyDraft | null {
        this.Sweep(now);

        return this.drafts.get(userId) ?? null;
    }

    Lookup(userId: string, draftId: string, now = Date.now()): IApplyDraft | null {
        const draft = this.Draft(userId, now);

        return draft?.id === draftId ? draft : null;
    }

    Touch(draft: IApplyDraft, now = Date.now()): void {
        draft.touched = now;
        this.Arm(draft);
    }

    End(userId: string): void {
        clearTimeout(this.timers.get(userId));
        this.timers.delete(userId);
        this.drafts.delete(userId);
    }

    /**
     * Nacheinander je Person: Zwei schnelle Nachrichten oder ein Klick während
     * einer Antwort rechneten sonst beide vom selben Schritt aus, und eine
     * Antwort ginge verloren. Ein Fehler bricht die Kette nicht.
     */
    private Queue(userId: string, work: () => Promise<void>): Promise<void> {
        const run = (this.queues.get(userId) ?? Promise.resolve()).then(work, work);
        const tail = run.catch(() => undefined);

        this.queues.set(userId, tail);
        void tail.then(() => {
            if (this.queues.get(userId) === tail) this.queues.delete(userId);
        });

        return run;
    }

    /** Gehört eine DM dieser Person gerade zu einer Bewerbung? */
    Owns(userId: string, now = Date.now()): boolean {
        return this.Draft(userId, now)?.via === "dm";
    }

    /** Nur der Teil, der gerade dran ist - ein zweites Fenster oder ein Doppelklick überschreibt nichts. */
    AcceptPart(draft: IApplyDraft, part: number): boolean {
        return part === draft.step;
    }

    /* ----------------------------------------------------------
       Start: Panel, Menü, /bewerben
       ---------------------------------------------------------- */
    /**
     * Der Weg von /bewerben, auch für den Knopf „Bei uns bewerben“ im Team-Hub
     * (Plan 26): geschlossen, Webseite, gleich los oder erst wählen - je nach
     * Stand des Apply Systems in dem Moment, in dem jemand klickt. Vor einem
     * Fenster (showModal) wird nichts aufgeschoben, sonst ginge es nicht auf.
     */
    async Entry(interaction: ChatInputCommandInteraction<"cached"> | ButtonInteraction<"cached">): Promise<void> {
        const service = this.client.applyService;
        const on = this.client.databaseService.Ready && (await this.client.settings.Of(interaction.guildId)).modules.includes(APPLY_MODULE);
        const settings = on ? await service.Settings(interaction.guildId) : null;
        const forms = on ? (await service.Forms(interaction.guildId)).filter((form) => form.open) : [];

        switch (EntryOf(settings, forms)) {
            case "closed":
                await interaction.reply(ApplyNotice("info", "Gerade suchen wir niemanden.", ""));

                return;
            case "web":
                await interaction.reply(
                    ApplyNotice("info", "Bewerben auf der Webseite", "Das Formular liegt auf der Webseite.", {
                        buttons: [{ url: ApplyLink(this.client.server.BaseURL, interaction.guildId), label: "Zur Bewerbung" }],
                    })
                );

                return;
            case "start":
                await this.Start(interaction, forms[0]!.id);

                return;
            case "pick":
                await interaction.reply({
                    ...new ComponentV2Builder({ accentColor: "#00afff" })
                        .heading("Wofür willst du dich bewerben?", 3)
                        .select({
                            customId: `${APPLY_FLOW_PREFIX}:pick`,
                            placeholder: "Formular wählen …",
                            options: forms.slice(0, 25).map((form) => ({
                                label: form.name.slice(0, 100),
                                value: String(form.id),
                                description: form.description ? form.description.slice(0, 100) : undefined,
                            })),
                        })
                        .toMessage({ ephemeral: true }),
                    allowedMentions: { parse: [] },
                });

                return;
        }
    }

    async Start(interaction: StartInteraction, formId: number): Promise<void> {
        if (!interaction.inCachedGuild()) return;

        const running = this.Draft(interaction.user.id);

        // Sonst würde ein neuer Start eine laufende DM-Bewerbung still beenden, auch von einem anderen Server.
        if (running?.via === "dm") {
            const form = await this.service.Form(running.guildId, running.formId).catch(() => null);
            const guild = this.client.guilds.cache.get(running.guildId);

            await interaction.reply(
                ApplyNotice(
                    "error",
                    "Gerade nicht",
                    `Du hast schon eine Bewerbung offen: ${form?.name ?? "ein Formular"} auf ${guild?.name ?? "einem Server"}. Mach sie fertig oder brich sie ab.`,
                    running.channelId ? { buttons: [{ url: DmLink(running.channelId), label: "Zur DM" }] } : {}
                )
            );

            return;
        }

        let allowed: Awaited<ReturnType<ApplyService["Eligible"]>>;

        try {
            allowed = await this.service.Eligible(interaction.guildId, interaction.user.id, formId);
        } catch (error) {
            if (!(error instanceof ApplyError)) throw error;

            await interaction.reply(ApplyNotice("error", error.title, error.message));

            return;
        }

        const { guild, form, settings } = allowed;

        if (settings.mode === "dm") {
            await this.StartDm(interaction, guild, form);

            return;
        }

        if (settings.mode === "web") {
            await interaction.reply(
                ApplyNotice("info", "Bewerben auf der Webseite", "Das Formular liegt auf der Webseite.", {
                    buttons: [{ url: `${ApplyLink(this.client.server.BaseURL, guild.id)}?formular=${form.id}`, label: "Zur Bewerbung" }],
                })
            );

            return;
        }

        const draft = this.Open({ userId: interaction.user.id, guildId: guild.id, formId: form.id, via: "modal", channelId: null, messageId: null });

        // Ein Formular ohne Fragen: es gibt nichts auszufüllen.
        if (form.questions.length === 0) {
            await this.Finish(interaction, draft, form);

            return;
        }

        // Das Fenster muss die erste Antwort auf den Klick sein.
        await interaction.showModal(this.Modal(form, draft, 0));
    }

    /* ----------------------------------------------------------
       Per DM
       ---------------------------------------------------------- */
    /** Die erste Frage per DM. Geht keine DM durch, bleibt nichts liegen. */
    async StartDm(interaction: StartInteraction, guild: Guild, form: IApplyForm): Promise<void> {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const draft = this.Open({ userId: interaction.user.id, guildId: guild.id, formId: form.id, via: "dm", channelId: null, messageId: null });
        let dmChannel: string;

        try {
            const dm = await interaction.user.createDM();
            const message = await dm.send(this.DmView(guild.name, form, draft));

            dmChannel = dm.id;
            draft.channelId = dm.id;
            draft.messageId = message.id;
            draft.shown = DmShown(form, 0);
        } catch (error) {
            this.End(draft.userId);

            if ((error as { code?: unknown }).code !== 50007) throw error;

            await this.Edit(
                interaction,
                ApplyNotice(
                    "error",
                    "Ich komme nicht in deine DMs",
                    "Erlaub Direktnachrichten von Mitgliedern dieses Servers: Rechtsklick auf den Server, „Privatsphäre-Einstellungen“. Danach klick noch einmal auf „Bewerben“."
                )
            );

            return;
        }

        const count = form.questions.length;

        await this.Edit(
            interaction,
            ApplyNotice("info", "Schau in deine DMs", `Ich hab dir geschrieben. Dort stelle ich dir ${count === 1 ? "die Frage" : `die ${count} Fragen`} für „${form.name}“.`, {
                buttons: [{ url: DmLink(dmChannel), label: "Zur DM" }],
            })
        );
    }

    /** Nach deferReply: dieselbe Meldung als Bearbeitung. */
    private async Edit(interaction: StartInteraction | ModalSubmitInteraction, notice: ReturnType<typeof ApplyNotice>): Promise<void> {
        await interaction.editReply({ components: notice.components, allowedMentions: notice.allowedMentions, flags: MessageFlags.IsComponentsV2 });
    }

    /** Die Nachricht für den Stand des Entwurfs: die nächste Frage oder die Zusammenfassung. */
    private DmView(guildName: string, form: IApplyForm, draft: IApplyDraft, live = true): MessageCreateOptions {
        return draft.step < form.questions.length
            ? DmQuestionView(guildName, form, draft.step, draft.id, live)
            : DmSummaryView(form, AnswersOf(form, draft), draft.id, live);
    }

    private GuildName(draft: IApplyDraft): string {
        return this.client.guilds.cache.get(draft.guildId)?.name ?? "dein Server";
    }

    private async OldMessage(draft: IApplyDraft): Promise<Message | null> {
        if (!draft.channelId || !draft.messageId) return null;

        const channel = await this.client.channels.fetch(draft.channelId).catch(() => null);

        return channel?.isTextBased() ? await channel.messages.fetch(draft.messageId).catch(() => null) : null;
    }

    /** Die letzte Fragenachricht ohne Knöpfe - egal, ob das klappt. */
    private async Freeze(draft: IApplyDraft, form: IApplyForm): Promise<void> {
        const view = this.DmView(this.GuildName(draft), form, draft, false);

        await (await this.OldMessage(draft))?.edit({ components: view.components, allowedMentions: view.allowedMentions }).catch(() => undefined);
    }

    /** Zeigt die alte Nachricht etwas, das es nicht mehr gibt, wird sie zu diesem Satz. */
    private async Retire(draft: IApplyDraft): Promise<void> {
        const notice = ApplyNotice("info", "Geändert", CHANGED, { ephemeral: false });

        await (await this.OldMessage(draft))?.edit({ components: notice.components, allowedMentions: notice.allowedMentions }).catch(() => undefined);
    }

    /** Der Entwurf rückt weiter: alte Nachricht einfrieren, neue senden. */
    private async Advance(draft: IApplyDraft, next: IApplyDraft, form: IApplyForm, send: (view: MessageCreateOptions) => Promise<Message>): Promise<void> {
        Object.assign(draft, { answers: next.answers, step: next.step });
        this.Touch(draft);

        const message = await send(this.DmView(this.GuildName(draft), form, draft));

        draft.messageId = message.id;
        draft.shown = DmShown(form, draft.step);
    }

    /**
     * Eine DM an den Bot. true: sie gehört zu einer laufenden Bewerbung und ist
     * damit erledigt. false: weiter wie bisher an Mod Mail.
     */
    async OnDirectMessage(message: Message): Promise<boolean> {
        if (!this.Owns(message.author.id)) return false;

        await this.Queue(message.author.id, () => this.DmText(message));

        return true;
    }

    private async DmText(message: Message): Promise<void> {
        const draft = this.Draft(message.author.id);

        // In der Warteschlange abgebrochen oder abgeschickt: Für diese Nachricht gibt es nichts mehr zu tun.
        if (draft?.via !== "dm") return;

        const form = await this.service.Form(draft.guildId, draft.formId).catch(() => null);
        const reply = async (notice: ReturnType<typeof ApplyNotice>): Promise<void> => {
            await message.reply({ components: notice.components, flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [], repliedUser: false } }).catch(() => undefined);
        };

        if (!form) {
            this.End(draft.userId);
            await reply(ApplyNotice("error", "Gerade nicht", "Dieses Formular nimmt gerade keine Bewerbungen an.", { ephemeral: false }));

            return;
        }

        const aligned = DmRealign(draft, form);
        const send = (view: MessageCreateOptions): Promise<Message> => message.author.send(view as never);

        draft.step = aligned.draft.step;
        this.Touch(draft);

        // Die Frage gibt es so nicht mehr: neu zeigen, die Antwort nicht werten.
        if (aligned.stale) {
            await this.Retire(draft);
            await this.Advance(draft, draft, form, send);

            return;
        }

        const result = DmStep(draft, form, { kind: "text", text: message.content });

        if (result.error) {
            await reply(ApplyNotice("error", "Noch nicht", result.error, { ephemeral: false }));

            return;
        }

        await this.Freeze(draft, form);
        await this.Advance(draft, result.draft, form, send);
    }

    /** Ist der Entwurf abgelaufen, sagt die DM das einmal und die letzte Frage verliert ihre Knöpfe. */
    private async Expire(userId: string, draftId: string): Promise<void> {
        const draft = this.drafts.get(userId);

        if (!draft || draft.id !== draftId) return;

        this.End(userId);

        const form = await this.service.Form(draft.guildId, draft.formId).catch(() => null);

        if (form) await this.Freeze(draft, form);

        const notice = ApplyNotice("info", "Abgelaufen", "Die Bewerbung ist abgelaufen, weil 30 Minuten nichts kam. Im Kanal kannst du neu anfangen.", { ephemeral: false });
        const channel = draft.channelId ? await this.client.channels.fetch(draft.channelId).catch(() => null) : null;

        if (channel?.isSendable()) await channel.send({ components: notice.components, flags: MessageFlags.IsComponentsV2, allowedMentions: notice.allowedMentions }).catch(() => undefined);

        logger.user(`📋 DM-Bewerbung von ${userId} auf ${draft.guildId} abgelaufen`);
    }

    /* ----------------------------------------------------------
       Knöpfe, Menüs und Fenster mit applyflow:
       ---------------------------------------------------------- */
    async Handle(interaction: FlowInteraction): Promise<void> {
        const [, action, id = "", extra] = interaction.customId.split(":");

        if (action === "start" && interaction.isButton()) return this.Start(interaction, Number(id));
        // „Bei uns bewerben“ im Team-Hub (Plan 26): derselbe Weg wie /bewerben.
        if (action === "entry" && interaction.isButton() && interaction.inCachedGuild()) return this.Entry(interaction);
        if (action === "pick" && interaction.isStringSelectMenu()) {
            // Discord merkt sich die Wahl im Menü - sonst ließe sich dasselbe Formular nicht gleich noch einmal wählen (W-0020).
            void this.service.ResetPanel(interaction.message).catch(() => undefined);

            return this.Start(interaction, Number(interaction.values[0]));
        }

        const draft = this.Lookup(interaction.user.id, id);

        if (!draft) {
            await interaction.reply(ApplyNotice("error", "Abgelaufen", EXPIRED));

            return;
        }

        // Das Fenster muss sofort aufgehen, das ändert den Entwurf nicht.
        if ((action === "next" || action === "retry") && interaction.isButton()) return this.ShowPart(interaction, draft);

        // Alles andere ändert den Entwurf: nacheinander je Person, mit frischem Blick auf ihn.
        return this.Queue(interaction.user.id, async () => {
            const current = this.Lookup(interaction.user.id, id);

            if (!current) {
                await interaction.reply(ApplyNotice("error", "Abgelaufen", EXPIRED));

                return;
            }

            if (action === "cancel" && !interaction.isModalSubmit()) {
                this.End(current.userId);

                const notice = ApplyNotice("info", "Abgebrochen", "Abgebrochen. Nichts wurde abgeschickt.");

                await interaction.update({ components: notice.components, allowedMentions: notice.allowedMentions });

                return;
            }

            if (action === "modal" && interaction.isModalSubmit()) return this.ModalPart(interaction, current, Number(extra));

            await this.DmAction(interaction, current, action);
        });
    }

    /** Zurück, Überspringen, Auswahl, Neu anfangen und Abschicken in der DM. */
    private async DmAction(interaction: FlowInteraction, draft: IApplyDraft, action: string): Promise<void> {
        if (interaction.isModalSubmit()) return;

        // Knöpfe einer älteren Frage gelten nicht - sonst übersprünge ein alter Knopf die aktuelle Frage.
        if (interaction.message.id !== draft.messageId) {
            await interaction.reply(ApplyNotice("info", "Ältere Nachricht", "Antworte bitte auf die letzte Frage weiter unten."));

            return;
        }

        const form = await this.service.Form(draft.guildId, draft.formId).catch(() => null);

        if (!form) {
            this.End(draft.userId);
            await interaction.reply(ApplyNotice("error", "Gerade nicht", "Dieses Formular nimmt gerade keine Bewerbungen an."));

            return;
        }

        const aligned = DmRealign(draft, form);

        draft.step = aligned.draft.step;

        // Die Nachricht zeigt etwas, das es so nicht mehr gibt: neu zeigen, den Klick nicht werten.
        if (aligned.stale) {
            const notice = ApplyNotice("info", "Geändert", CHANGED, { ephemeral: false });

            this.Touch(draft);
            await interaction.update({ components: notice.components, allowedMentions: notice.allowedMentions });
            await this.Advance(draft, draft, form, (view) => interaction.user.send(view as never));

            return;
        }

        const frozen = this.DmView(this.GuildName(draft), form, draft, false);

        if (action === "send" && interaction.isButton()) {
            await interaction.update({ components: frozen.components, allowedMentions: frozen.allowedMentions });
            this.End(draft.userId);

            let notice: ReturnType<typeof ApplyNotice>;

            try {
                const sent = await this.service.Submit(draft.guildId, draft.userId, draft.formId, draft.answers, "dm");

                notice = ApplyNotice("done", "✅ Abgeschickt", RECEIVED, { ephemeral: false, buttons: ChannelButton(sent) });
            } catch (error) {
                if (!(error instanceof ApplyError)) throw error;

                notice = ApplyNotice("error", error.title, RestartHint(error.message), { ephemeral: false });
            }

            await interaction.followUp({ components: notice.components, flags: MessageFlags.IsComponentsV2, allowedMentions: notice.allowedMentions });

            return;
        }

        const event: DmEvent | null =
            action === "choice" && interaction.isStringSelectMenu()
                ? { kind: "choice", value: interaction.values[0] ?? "" }
                : action === "back" || action === "skip" || action === "restart"
                  ? { kind: action }
                  : null;

        if (!event) return;

        const result = DmStep(draft, form, event);

        this.Touch(draft);

        if (result.error) {
            await interaction.reply(ApplyNotice("error", "Noch nicht", result.error));

            return;
        }

        await interaction.update({ components: frozen.components, allowedMentions: frozen.allowedMentions });
        await this.Advance(draft, result.draft, form, (view) => interaction.user.send(view as never));
    }

    /* ----------------------------------------------------------
       Fenster in Discord
       ---------------------------------------------------------- */
    private Modal(form: IApplyForm, draft: IApplyDraft, part: number): ModalBuilder {
        const parts = ModalParts(form.questions);

        return new ModalBuilder()
            .setCustomId(`${APPLY_FLOW_PREFIX}:modal:${draft.id}:${part}`)
            .setTitle(ModalTitle(form.name, part + 1, parts.length))
            .addLabelComponents(...(parts[part] ?? []).map(ModalField));
    }

    private async ShowPart(interaction: ButtonInteraction, draft: IApplyDraft): Promise<void> {
        const form = await this.service.Form(draft.guildId, draft.formId).catch(() => null);

        if (!form || draft.step >= ModalParts(form.questions).length) {
            this.End(draft.userId);
            await interaction.reply(ApplyNotice("error", "Abgelaufen", EXPIRED));

            return;
        }

        this.Touch(draft);
        await interaction.showModal(this.Modal(form, draft, draft.step));
    }

    private async ModalPart(interaction: ModalSubmitInteraction, draft: IApplyDraft, part: number): Promise<void> {
        if (!this.AcceptPart(draft, part)) {
            await interaction.reply(ApplyNotice("info", "Schon gespeichert", "Diesen Teil hast du schon abgeschickt."));

            return;
        }

        const form = await this.service.Form(draft.guildId, draft.formId).catch(() => null);

        if (!form) {
            this.End(draft.userId);
            await interaction.reply(ApplyNotice("error", "Gerade nicht", "Dieses Formular nimmt gerade keine Bewerbungen an."));

            return;
        }

        const parts = ModalParts(form.questions);
        const questions = parts[part] ?? [];
        const values: Record<string, string> = {};

        // Hat jemand das Formular inzwischen geändert, fehlt ein Feld - dann zählt es als leer.
        for (const question of questions) {
            try {
                values[question.id] = question.kind === "choice" ? (interaction.fields.getStringSelectValues(question.id)[0] ?? "") : interaction.fields.getTextInputValue(question.id);
            } catch {
                values[question.id] = "";
            }
        }

        try {
            for (const answer of this.service.CleanAnswers({ ...form, questions }, values)) draft.answers[answer.id] = answer.value;
        } catch (error) {
            if (!(error instanceof ApplyError)) throw error;

            await interaction.reply(
                ApplyNotice("error", "Das passt noch nicht", error.message, {
                    buttons: [
                        { customId: `${APPLY_FLOW_PREFIX}:retry:${draft.id}`, label: `Teil ${part + 1} noch einmal`, tone: "primary" },
                        { customId: `${APPLY_FLOW_PREFIX}:cancel:${draft.id}`, label: "Abbrechen", tone: "secondary" },
                    ],
                })
            );

            return;
        }

        draft.step = part + 1;
        this.Touch(draft);

        if (draft.step < parts.length) {
            const left = parts.slice(draft.step).reduce((sum, entry) => sum + entry.length, 0);

            await interaction.reply(
                ApplyNotice("info", `Teil ${part + 1} von ${parts.length} ist gespeichert`, `Noch ${left === 1 ? "1 Frage" : `${left} Fragen`}, dann ist deine Bewerbung als ${form.name} fertig.`, {
                    buttons: [
                        { customId: `${APPLY_FLOW_PREFIX}:next:${draft.id}`, label: `Weiter zu Teil ${draft.step + 1}`, tone: "primary" },
                        { customId: `${APPLY_FLOW_PREFIX}:cancel:${draft.id}`, label: "Abbrechen", tone: "secondary" },
                    ],
                    subtext: "Die Antworten bleiben 30 Minuten liegen.",
                })
            );

            return;
        }

        await this.Finish(interaction, draft, form);
    }

    /** Abschicken über Submit, der alles noch einmal prüft. Der Entwurf ist danach weg, so oder so. */
    private async Finish(interaction: StartInteraction | ModalSubmitInteraction, draft: IApplyDraft, form: IApplyForm): Promise<void> {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        this.End(draft.userId);

        let sent: IApplySubmission;

        try {
            sent = await this.service.Submit(draft.guildId, draft.userId, draft.formId, draft.answers, draft.via);
        } catch (error) {
            if (!(error instanceof ApplyError)) throw error;

            const notice = ApplyNotice("error", error.title, RestartHint(error.message));

            await interaction.editReply({ components: notice.components, allowedMentions: notice.allowedMentions, flags: MessageFlags.IsComponentsV2 });

            return;
        }

        const notice = ApplyNotice("done", "✅ Abgeschickt", RECEIVED, { buttons: ChannelButton(sent) });

        await interaction.editReply({ components: notice.components, allowedMentions: notice.allowedMentions, flags: MessageFlags.IsComponentsV2 });
    }
}
