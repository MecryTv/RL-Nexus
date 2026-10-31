import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    Guild,
    MessageActionRowComponentBuilder,
    MessageFlags,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
} from "discord.js";
import BotClient from "../client/BotClient";
import { CustomMessageView, ICustomView } from "./CustomView";
import { AnyPlaceholderValues } from "../constants/Placeholders";
import { CANCEL_WORDS, KIND_LABELS, LFT_PREFIX, PANEL_BUTTONS } from "../constants/Lft";
import { ILftAnswer, ILftBody, ILftQuestion, LftKind } from "../interfaces/services/lft/ILft";

/**
 * Die Nachrichten des Looking-for-Moduls: die Fragen in der DM, die Vorschau,
 * der Beitrag im Forum und die Meldung ans Team. Wie sie aussehen, steht im
 * Dashboard - hier stehen nur die Werte der Platzhalter und die Knöpfe, die der
 * Bot an die fertige Nachricht hängt.
 */

/** Die Knöpfe, die im Gespräch warten. Ohne "lf:" - sie gehören keinem Event. */
export const STEP_SEND = "lfsend";
export const STEP_CANCEL = "lfcancel";
export const STEP_PICK = "lfpick";

/** Ein Zeitpunkt, der von allein weiterläuft - in einem Beitrag steht er tagelang. */
function When(at: number): string {
    return `<t:${Math.floor(at / 1000)}:R>`;
}

/**
 * Die Antworten als Text. Lang: Frage fett, Antwort als Zitat darunter - so
 * bleibt ein langer Text lesbar. Kurz: eine Zeile je Frage, für die Meldung.
 */
export function AnswersText(answers: ILftAnswer[], short = false): string {
    if (!answers.length) return "_Keine Antworten._";

    if (short) return answers.map((answer) => `**${answer.label}** ${answer.value.replace(/\s+/g, " ").slice(0, 120)}`).join("\n");

    return answers.map((answer) => `**${answer.label}**\n> ${answer.value.split("\n").join("\n> ")}`).join("\n\n");
}

export interface IValueInput {
    guild: Guild;
    kind: LftKind;
    user: { id: string; name: string; avatar: string };
    /** Die Fragen der Seite - dafür gibt es {frage1} … auch ohne Antwort. */
    questions?: ILftQuestion[];
    answers?: ILftAnswer[];
    forumId?: string | null;
    /** Der Titel des Beitrags, schon mit eingesetzten Platzhaltern. */
    title?: string;
    url?: string;
    createdAt?: number;
    /** Nur für die Frage-Nachricht. */
    step?: { question: ILftQuestion; index: number; total: number };
}

/**
 * Was die Platzhalter bedeuten. Alle Nachrichten des Moduls holen ihre Werte
 * hier - was eine Nachricht nicht kennt, bleibt als {platzhalter} stehen.
 */
export function LftValues(input: IValueInput): AnyPlaceholderValues {
    const answers = input.answers ?? [];
    const questions = input.questions ?? [];
    const values: Record<string, string> = {
        user: `<@${input.user.id}>`,
        "user.name": input.user.name,
        "user.id": input.user.id,
        "user.avatar": input.user.avatar,
        guild: input.guild.name,
        "guild.id": input.guild.id,
        "guild.icon": input.guild.iconURL({ size: 256 }) ?? "",
        art: KIND_LABELS[input.kind],
        antworten: AnswersText(answers),
        "antworten.kurz": AnswersText(answers, true),
        erstellt: When(input.createdAt ?? Date.now()),
        forum: input.forumId ? `<#${input.forumId}>` : "dem Forum",
        "fragen.anzahl": String(questions.length || answers.length),
    };

    if (input.title) values["post.titel"] = input.title;
    if (input.url) values["post.url"] = input.url;

    // Je Frage ein Paar: {frage1} ist die Frage, {antwort1} die Antwort darauf.
    // Die Nummer richtet sich nach der Reihenfolge im Dashboard, damit sie sich
    // nicht verschiebt, wenn jemand eine freiwillige Frage überspringt.
    const order = questions.length ? questions.map((question) => question.id) : answers.map((answer) => answer.id);

    order.forEach((id, index) => {
        const question = questions.find((entry) => entry.id === id);
        const answer = answers.find((entry) => entry.id === id);

        values[`frage${index + 1}`] = question?.label ?? answer?.label ?? "";
        values[`antwort${index + 1}`] = answer?.value ?? "";
    });

    if (input.step) {
        const { question, index, total } = input.step;

        values.frage = question.label;
        values["frage.hinweis"] = question.hint ? `\n-# ${question.hint}` : "";
        values["frage.nummer"] = String(index + 1);
        values["frage.pflicht"] = question.required ? "Pflichtfrage" : "freiwillig";
        values["fragen.anzahl"] = String(total);
    }

    return values;
}

/**
 * Eine Nachricht aus dem Dashboard, dazu die Knöpfe des Bots. Bei einer Karte
 * gehören sie in den Container, sonst darunter - genau wie in der
 * Team-Übersicht.
 */
export async function LftRender(
    client: BotClient,
    body: ILftBody,
    values: AnyPlaceholderValues,
    rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [],
    ping: string[] = []
): Promise<ICustomView> {
    // Ping-Rollen: bei einer Karte als Zeile oben drin - Text über einer Karte lehnt Discord ab (wie MatchupView).
    const top = ping.map((role) => `<@&${role}>`).join(" ");
    const doc = top && body.kind === "v2" ? { ...body.doc, blocks: [{ type: "text" as const, body: top }, ...body.doc.blocks] } : body.doc;
    let view = await CustomMessageView(client, { id: 0, kind: body.kind, content: body.content, embed: body.embed, doc, buttons: [], reserve: rows.length }, values);

    if (top) {
        view = {
            ...view,
            ...(body.kind === "v2" ? {} : { content: [top, view.content ?? ""].filter(Boolean).join("\n").slice(0, 2000) }),
            allowedMentions: { parse: [], roles: ping },
        };
    }

    if (!rows.length) return view;

    if (view.flags === MessageFlags.IsComponentsV2) {
        const container = view.components[0] as ContainerBuilder;

        for (const row of rows) container.addActionRowComponents(row);

        return view;
    }

    return { ...view, components: [...view.components, ...rows] };
}

function row(...buttons: ButtonBuilder[]): ActionRowBuilder<MessageActionRowComponentBuilder> {
    return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(...buttons);
}

/** Unter dem Beitrag: die Suche beenden. Überlebt einen Neustart. */
export function CloseRow(id: number, kill = false): ActionRowBuilder<MessageActionRowComponentBuilder> {
    const close = new ButtonBuilder().setCustomId(`${LFT_PREFIX}:close:${id}`).setLabel("Suche beenden").setEmoji("✅").setStyle(ButtonStyle.Secondary);

    if (!kill) return row(close);

    return row(close, new ButtonBuilder().setCustomId(`${LFT_PREFIX}:kill:${id}`).setLabel("Beitrag löschen").setEmoji("🗑️").setStyle(ButtonStyle.Danger));
}

/** Unter der Vorschau in der DM: abschicken oder wegwerfen. */
export function ConfirmRow(): ActionRowBuilder<MessageActionRowComponentBuilder> {
    return row(
        new ButtonBuilder().setCustomId(STEP_SEND).setLabel("Abschicken").setEmoji("📨").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(STEP_CANCEL).setLabel("Abbrechen").setEmoji("✖️").setStyle(ButtonStyle.Secondary)
    );
}

/** Eine Auswahl-Frage: das Menü steht unter der Frage. */
export function ChoiceRow(question: ILftQuestion): ActionRowBuilder<MessageActionRowComponentBuilder> {
    const menu = new StringSelectMenuBuilder()
        .setCustomId(`${STEP_PICK}:${question.id}`)
        .setPlaceholder("Antwort wählen")
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(question.choices.slice(0, 25).map((choice) => new StringSelectMenuOptionBuilder().setLabel(choice.slice(0, 100)).setValue(choice.slice(0, 100))));

    return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(menu);
}

/**
 * Unter dem Panel im Forum (Plan 30): je Seite, die an ist, ein Knopf. Ist
 * keine an, steht ein abgeschalteter Knopf da, der das sagt.
 */
export function PanelRow(kinds: LftKind[]): ActionRowBuilder<MessageActionRowComponentBuilder> {
    if (!kinds.length) {
        return row(new ButtonBuilder().setCustomId(`${LFT_PREFIX}:none`).setLabel("Gerade läuft hier keine Suche").setStyle(ButtonStyle.Secondary).setDisabled(true));
    }

    return row(
        ...kinds.map((kind) =>
            new ButtonBuilder().setCustomId(`${LFT_PREFIX}:start:${kind}`).setLabel(PANEL_BUTTONS[kind].label).setEmoji(PANEL_BUTTONS[kind].emoji).setStyle(ButtonStyle.Primary)
        )
    );
}

/** Die Platzhalter des Panels - es gehört niemandem, deshalb nur der Server. */
export function PanelValues(guild: Guild): AnyPlaceholderValues {
    return { guild: guild.name, "guild.id": guild.id, "guild.icon": guild.iconURL?.({ extension: "png", size: 256 }) ?? "" };
}

/** Was der Bot sagt, wenn eine Antwort zu lang war. */
export function TooLong(length: number, max: number): string {
    return `Das sind **${length} Zeichen**, erlaubt sind **${max}**. Schreib es etwas kürzer – oder ${CANCEL_WORDS[0]}.`;
}
