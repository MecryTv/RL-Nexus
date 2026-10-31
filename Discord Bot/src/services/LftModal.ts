import { randomBytes } from "node:crypto";
import {
    ButtonInteraction,
    ChatInputCommandInteraction,
    InteractionEditReplyOptions,
    MessageFlags,
    ModalBuilder,
    ModalSubmitInteraction,
} from "discord.js";
import BotClient from "../client/BotClient";
import { ApplyNotice } from "../builder/ApplyView";
import { KIND_LABELS, LFT_DRAFT_TTL, LFT_FLOW_PREFIX } from "../constants/Lft";
import { ILftAnswer, ILftQuestion, LftKind } from "../interfaces/services/lft/ILft";
import { ModalField, ModalParts, ModalTitle } from "./ApplyFlow";
import { LftError } from "./LookingForService";

/**
 * Looking for im Fenster (Plan 30): die Fragen in Teilen zu je 5, wie beim
 * Apply System. Was schon beantwortet ist, liegt als Entwurf im Speicher -
 * einer je Person, 30 Minuten ab der letzten Aktivität, nach einem Neustart
 * weg. Veröffentlicht wird über LookingForService.Publish, ohne Vorschau.
 * Siehe docs/LookingFor.md.
 */

interface ILftDraft {
    /** Steht in den IDs der Knöpfe und Fenster. Passt sie nicht, ist der Entwurf abgelaufen. */
    id: string;
    userId: string;
    guildId: string;
    kind: LftKind;
    /** Frage-ID → Antwort. */
    answers: Record<string, string>;
    /** Der Teil, der als Nächstes dran ist (ab 0). */
    step: number;
    touched: number;
}

const EXPIRED = "Diese Suche ist abgelaufen. Klick im Forum noch einmal auf den Knopf.";

/**
 * Die Antworten eines Fensters prüfen - dieselben Regeln wie in der DM:
 * Pflicht, Länge, Auswahl nur aus den Möglichkeiten. Fehlt ein Feld, weil sich
 * die Fragen inzwischen geändert haben, zählt es als leer.
 */
export function CleanLftAnswers(questions: ILftQuestion[], values: Record<string, string>): ILftAnswer[] {
    const answers: ILftAnswer[] = [];

    for (const question of questions) {
        const value = (values[question.id] ?? "").trim();

        if (!value) {
            if (question.required) throw new LftError(`„${question.label}“ fehlt noch.`);

            continue;
        }

        if (value.length > question.max) throw new LftError(`Bei „${question.label}“ sind ${value.length} Zeichen, erlaubt sind ${question.max}.`);
        if (question.kind === "choice" && !question.choices.includes(value)) throw new LftError(`Bei „${question.label}“ ist das keine der Möglichkeiten.`);

        answers.push({ id: question.id, label: question.label, value });
    }

    return answers;
}

export default class LftModal {
    private readonly client: BotClient;
    private readonly drafts = new Map<string, ILftDraft>();

    constructor(client: BotClient) {
        this.client = client;
    }

    /** Erst beim Aufruf: das Fenster entsteht im Konstruktor des Service. */
    private get service() {
        return this.client.lookingForService;
    }

    private Draft(userId: string, id: string, now = Date.now()): ILftDraft | null {
        for (const [owner, draft] of this.drafts) {
            if (now - draft.touched > LFT_DRAFT_TTL) this.drafts.delete(owner);
        }

        const draft = this.drafts.get(userId);

        return draft?.id === id ? draft : null;
    }

    /** Das Fenster für einen Teil der Fragen. */
    private Modal(kind: LftKind, questions: ILftQuestion[], draft: ILftDraft, part: number): ModalBuilder {
        const parts = ModalParts(questions);

        return new ModalBuilder()
            .setCustomId(`${LFT_FLOW_PREFIX}:modal:${draft.id}:${part}`)
            .setTitle(ModalTitle(KIND_LABELS[kind], part + 1, parts.length))
            .addLabelComponents(...(parts[part] ?? []).map(ModalField));
    }

    /**
     * Der Knopf im Panel oder /lookingfor bei „Im Fenster“. Geprüft wird wie
     * bei der DM, danach muss das Fenster sofort aufgehen.
     */
    async Start(interaction: ButtonInteraction<"cached"> | ChatInputCommandInteraction<"cached">, kind: LftKind): Promise<void> {
        let questions: ILftQuestion[];

        try {
            questions = (await this.service.Check(interaction.member, kind)).side.questions;
        } catch (error) {
            if (!(error instanceof LftError)) throw error;

            await interaction.reply(ApplyNotice("error", "Gerade nicht", error.message));

            return;
        }

        const draft: ILftDraft = { id: randomBytes(6).toString("hex"), userId: interaction.user.id, guildId: interaction.guildId, kind, answers: {}, step: 0, touched: Date.now() };

        // Ein neuer Anfang ersetzt einen alten Entwurf dieser Person.
        this.drafts.set(draft.userId, draft);
        await interaction.showModal(this.Modal(kind, questions, draft, 0));
    }

    /** Knöpfe und Fenster mit lfflow:. */
    async Handle(interaction: ButtonInteraction | ModalSubmitInteraction): Promise<void> {
        if (!interaction.inCachedGuild()) return;

        const [, action, id = "", extra] = interaction.customId.split(":");
        const draft = this.Draft(interaction.user.id, id);

        if (!draft) {
            await interaction.reply(ApplyNotice("error", "Abgelaufen", EXPIRED));

            return;
        }

        if (action === "cancel" && interaction.isButton()) {
            this.drafts.delete(draft.userId);

            const notice = ApplyNotice("info", "Abgebrochen", "Abgebrochen. Nichts wurde gespeichert.");

            await interaction.update({ components: notice.components, allowedMentions: notice.allowedMentions });

            return;
        }

        if ((action === "next" || action === "retry") && interaction.isButton()) {
            const side = (await this.service.Settings(draft.guildId))[draft.kind];

            if (!side.on || draft.step >= ModalParts(side.questions).length) {
                this.drafts.delete(draft.userId);
                await interaction.reply(ApplyNotice("error", "Abgelaufen", EXPIRED));

                return;
            }

            draft.touched = Date.now();
            await interaction.showModal(this.Modal(draft.kind, side.questions, draft, draft.step));

            return;
        }

        if (action === "modal" && interaction.isModalSubmit()) await this.Part(interaction, draft, Number(extra));
    }

    private async Part(interaction: ModalSubmitInteraction<"cached">, draft: ILftDraft, part: number): Promise<void> {
        // Nur der Teil, der dran ist - ein zweites Fenster oder ein Doppelklick überschreibt nichts.
        if (part !== draft.step) {
            await interaction.reply(ApplyNotice("info", "Schon gespeichert", "Diesen Teil hast du schon abgeschickt."));

            return;
        }

        const settings = await this.service.Settings(draft.guildId);
        const side = settings[draft.kind];
        const parts = ModalParts(side.questions);
        const questions = parts[part] ?? [];
        const values: Record<string, string> = {};

        for (const question of questions) {
            try {
                values[question.id] = question.kind === "choice" ? (interaction.fields.getStringSelectValues(question.id)[0] ?? "") : interaction.fields.getTextInputValue(question.id);
            } catch {
                values[question.id] = "";
            }
        }

        try {
            for (const question of questions) delete draft.answers[question.id];
            for (const answer of CleanLftAnswers(questions, values)) draft.answers[answer.id] = answer.value;
        } catch (error) {
            if (!(error instanceof LftError)) throw error;

            await interaction.reply(
                ApplyNotice("error", "Das passt noch nicht", error.message, {
                    buttons: [
                        { customId: `${LFT_FLOW_PREFIX}:retry:${draft.id}`, label: `Teil ${part + 1} noch einmal`, tone: "primary" },
                        { customId: `${LFT_FLOW_PREFIX}:cancel:${draft.id}`, label: "Abbrechen", tone: "secondary" },
                    ],
                })
            );

            return;
        }

        draft.step = part + 1;
        draft.touched = Date.now();

        if (draft.step < parts.length) {
            const left = parts.slice(draft.step).reduce((sum, entry) => sum + entry.length, 0);

            await interaction.reply(
                ApplyNotice("info", `Teil ${part + 1} von ${parts.length} ist gespeichert`, `Noch ${left === 1 ? "1 Frage" : `${left} Fragen`}, dann steht dein Beitrag im Forum.`, {
                    buttons: [
                        { customId: `${LFT_FLOW_PREFIX}:next:${draft.id}`, label: `Weiter zu Teil ${draft.step + 1}`, tone: "primary" },
                        { customId: `${LFT_FLOW_PREFIX}:cancel:${draft.id}`, label: "Abbrechen", tone: "secondary" },
                    ],
                    subtext: "Die Antworten bleiben 30 Minuten liegen.",
                })
            );

            return;
        }

        await this.Finish(interaction, draft);
    }

    /** Alle Teile sind da: noch einmal prüfen, dann veröffentlichen. Der Entwurf ist danach weg, so oder so. */
    private async Finish(interaction: ModalSubmitInteraction<"cached">, draft: ILftDraft): Promise<void> {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        this.drafts.delete(draft.userId);

        const fail = async (text: string): Promise<void> => {
            const notice = ApplyNotice("error", "Gerade nicht", text);

            await interaction.editReply({ components: notice.components, allowedMentions: notice.allowedMentions, flags: MessageFlags.IsComponentsV2 });
        };

        let checked: Awaited<ReturnType<typeof this.service.Check>>;

        // Zwischen erstem Fenster und Abschicken kann viel passieren: Seite aus, Forum weg, eine zweite Suche.
        try {
            checked = await this.service.Check(interaction.member, draft.kind);
        } catch (error) {
            if (!(error instanceof LftError)) throw error;

            return fail(error.message);
        }

        const { settings, side } = checked;
        let answers: ILftAnswer[];

        // Alles noch einmal gegen die aktuellen Fragen: Wurde im Dashboard etwas geändert, gilt der neue Stand.
        try {
            answers = CleanLftAnswers(side.questions, draft.answers);
        } catch (error) {
            if (!(error instanceof LftError)) throw error;

            return fail(`${error.message} Klick im Forum noch einmal auf den Knopf.`);
        }

        if (!answers.length) return fail("Ohne eine einzige Antwort gibt es nichts zu veröffentlichen.");

        const base = this.service.BaseOf(interaction.member, draft.kind, side);
        const title = this.service.TitleOf(interaction.member, draft.kind, side, base, answers);
        const result = await this.service.Publish(interaction.member, draft.kind, settings, answers, title, base);

        if (!result.ok) return fail(result.message);

        await interaction.editReply(result.done as InteractionEditReplyOptions);
    }
}
