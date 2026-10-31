import { ContainerBuilder, Guild, Message, MessageCreateOptions, escapeMarkdown } from "discord.js";
import BotClient from "../client/BotClient";
import ComponentV2Builder from "../builder/ComponentV2Builder";
import { APPLY_FLOW_PREFIX, APPLY_PREFIX, PANEL_SECTIONS, STATUS_LABELS } from "../constants/Apply";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import { ButtonOptions } from "../interfaces/builder/IComponentV2Builder";
import { IApplyAnswer, IApplyForm, IApplySettings, IApplySubmission } from "../interfaces/services/apply/IApply";

/**
 * Die Karte einer Bewerbung im Team-Kanal: wer, worauf, die Antworten - und
 * zwei Knöpfe. Ist entschieden, stehen dort Ergebnis und Name statt der Knöpfe.
 */

const TONE = { open: "#00afff", accepted: "#3ba55c", declined: "#ed4245" } as const;

/**
 * Antworten kürzen: eine Karte hat 4000 Zeichen, nicht mehr. Auch für die
 * Zusammenfassung in der DM, dort mit eigenem Satz am Schnitt.
 */
export function Answers(form: IApplyForm, answers: IApplyAnswer[], cut = "-# … gekürzt, der Rest steht im Dashboard."): string {
    const lines: string[] = [];
    let left = 3200;

    for (const question of form.questions) {
        const answer = answers.find((entry) => entry.id === question.id);

        if (!answer) continue;

        const value = answer.value.length > 400 ? `${answer.value.slice(0, 399)}…` : answer.value;
        const block = `**${question.label}**\n> ${value.replace(/\n/g, "\n> ")}`;

        if (block.length > left) {
            lines.push(cut);
            break;
        }

        left -= block.length;
        lines.push(block);
    }

    return lines.join("\n\n") || "Keine Antworten.";
}

/**
 * ping: beim ersten Senden die eingestellten Rollen erwähnen. Sie stehen in
 * der Karte, denn content geht mit Components V2 nicht. Sonst pingt die Karte
 * niemanden, auch kein @everyone aus einer Antwort.
 */
export function ApplyCard(client: BotClient, form: IApplyForm, submission: IApplySubmission, ping = false): MessageCreateOptions {
    const open = submission.status === "open";
    const roles = ping ? form.settings.pingRoles : [];
    const card = new ComponentV2Builder({ accentColor: TONE[submission.status] });

    if (roles.length) card.subtext(roles.map((role) => `<@&${role}>`).join(" "));

    card.title(`${form.emoji ? `${form.emoji} ` : ""}Bewerbung als ${form.name}`, `#${submission.id} · <@${submission.userId}> \`${submission.userName}\``)
        .separator()
        .text(Answers(form, submission.answers))
        .separator();

    if (open) {
        card.subtext(`Eingegangen <t:${Math.floor(submission.createdAt / 1000)}:R>`);
        card.buttons(
            { customId: `${APPLY_PREFIX}:ja:${submission.id}`, label: "Annehmen", tone: "success" },
            { customId: `${APPLY_PREFIX}:nein:${submission.id}`, label: "Ablehnen", tone: "danger" }
        );
    } else {
        card.text(
            [
                `**${STATUS_LABELS[submission.status]}** von ${submission.decidedBy ? `<@${submission.decidedBy}>` : submission.decidedName ?? "unbekannt"}`,
                submission.note ? `> ${submission.note}` : null,
            ]
                .filter(Boolean)
                .join("\n")
        );
        card.subtext(`Entschieden <t:${Math.floor((submission.decidedAt ?? Date.now()) / 1000)}:R>`);

        // Plan 30: der eigene Kanal lässt sich nach der Entscheidung von Hand aufräumen.
        if (submission.channelId) card.buttons({ customId: `${APPLY_PREFIX}:kanal:${submission.id}`, label: "Kanal löschen", tone: "danger" });
    }

    card.buttons({ url: `${client.server.BaseURL}${DASHBOARD_PATH}/guild/${submission.guildId}/apply`, label: "Im Dashboard öffnen" });

    return { ...card.toMessage(), allowedMentions: { parse: [], roles } };
}

/* ----------------------------------------------------------
   Das Panel im Kanal (Plan 24)
   ---------------------------------------------------------- */

/**
 * Ein Emoji, das Discord im Menü annimmt: ein eigenes (<:name:id>) oder ein
 * Unicode-Emoji. Das Feld am Formular ist Freitext - was hier nicht passt,
 * steht nur im Text, sonst lehnt Discord das ganze Panel ab.
 */
const CUSTOM_EMOJI = /^<a?:\w{2,32}:\d{17,20}>$/;
const GRAPHEMES = new Intl.Segmenter("de", { granularity: "grapheme" });

/** Genau ein Emoji: zwei hintereinander („🎮🎯“) nimmt Discord als emoji.name nicht an. */
function MenuEmoji(emoji: string | null): boolean {
    if (!emoji) return false;
    if (CUSTOM_EMOJI.test(emoji)) return true;

    return [...GRAPHEMES.segment(emoji)].length === 1 && /^\p{Extended_Pictographic}/u.test(emoji);
}

/** Steht in jedem Bewerbungs-Panel, auch im geschlossenen - daran erkennt der Bot sein Panel. */
const PANEL_MARK = "📋 | Bewerbungen bei";

function Questions(count: number): string {
    return count === 1 ? "1 Frage" : `${count} Fragen`;
}

/**
 * Das Panel: je offenem Formular ein Abschnitt mit Knopf, ab 6 ein Menü. Bei
 * der Webseite führen Links auf die Seite, sonst startet der Knopf die
 * Bewerbung in Discord. Sind Bewerbungen aus, bleibt nur ein Satz stehen.
 */
export function ApplyPanelView(guild: Guild, settings: IApplySettings, forms: IApplyForm[], link: string): MessageCreateOptions {
    const open = settings.open ? forms.filter((form) => form.open) : [];
    const web = settings.mode === "web";
    const card = new ComponentV2Builder({ accentColor: TONE.open }).title(`${PANEL_MARK} ${escapeMarkdown(guild.name)}`);

    if (open.length === 0) {
        card.text("Gerade suchen wir niemanden. Schau später wieder rein.");

        return { ...card.toMessage(), allowedMentions: { parse: [] } };
    }

    card.text("Wir suchen Leute. Such dir aus, was passt, und klick auf „Bewerben“.").separator();

    if (open.length <= PANEL_SECTIONS) {
        for (const form of open) {
            const about = form.description.length > 120 ? `${form.description.slice(0, 119)}…` : form.description;
            const line = [about && escapeMarkdown(about), Questions(form.questions.length)].filter(Boolean).join(" · ");

            card.section(
                `${form.emoji ? `${form.emoji} ` : ""}**${escapeMarkdown(form.name)}**\n-# ${line}`,
                web
                    ? { type: "button", url: `${link}?formular=${form.id}`, label: "Bewerben" }
                    : { type: "button", customId: `${APPLY_FLOW_PREFIX}:start:${form.id}`, label: "Bewerben", tone: "primary" }
            );
        }
    } else if (web) {
        card.buttons({ url: link, label: "Zur Bewerbung" });
    } else {
        card.select({
            customId: `${APPLY_FLOW_PREFIX}:pick`,
            placeholder: "Formular wählen …",
            options: open.slice(0, 25).map((form) => ({
                label: form.name.slice(0, 100),
                value: String(form.id),
                description: [Questions(form.questions.length), form.description].filter(Boolean).join(" · ").slice(0, 100),
                ...(form.emoji && MenuEmoji(form.emoji) ? { emoji: form.emoji } : {}),
            })),
        });
    }

    card.separator().subtext("Geht auch mit `/bewerben`");

    return { ...card.toMessage(), allowedMentions: { parse: [] } };
}

/**
 * Ist das ein Bewerbungs-Panel dieses Servers? Der Titel muss das Merkmal
 * tragen - eine Custom Message des Bots mit Bewerbungslink ist keins, sonst
 * überschriebe „Panel senden“ sie. Dazu die Knöpfe, die Links auf die eigene
 * Bewerbungsseite oder, bei „Bewerbungen aus“, gar nichts zum Klicken.
 */
export function IsApplyPanel(message: Message, botId: string, guildId: string): boolean {
    if (message.author.id !== botId) return false;

    const ids: string[] = [];
    const urls: string[] = [];
    const texts: string[] = [];
    const walk = (value: unknown): void => {
        if (Array.isArray(value)) value.forEach(walk);
        else if (value && typeof value === "object") {
            for (const [key, inner] of Object.entries(value)) {
                if (key === "custom_id" && typeof inner === "string") ids.push(inner);
                else if (key === "url" && typeof inner === "string") urls.push(inner);
                else if (key === "content" && typeof inner === "string") texts.push(inner);
                else walk(inner);
            }
        }
    };

    walk(JSON.parse(JSON.stringify(message.components)));

    if (!texts.some((text) => text.includes(PANEL_MARK))) return false;

    return (
        ids.some((id) => id.startsWith(`${APPLY_FLOW_PREFIX}:start:`) || id === `${APPLY_FLOW_PREFIX}:pick`) ||
        urls.some((url) => new RegExp(`/bewerben/${guildId}(?:[?#/]|$)`).test(url)) ||
        (ids.length === 0 && urls.length === 0)
    );
}

/* ----------------------------------------------------------
   Hinweise beim Bewerben in Discord (Plan 24)
   ---------------------------------------------------------- */

/**
 * Eine Meldung nur für den, der geklickt hat: blau für Hinweise, grün für
 * erledigt, rot für Fehler. Pingt nie jemanden.
 */
export function ApplyNotice(
    tone: "info" | "done" | "error",
    title: string,
    text: string,
    extra: { buttons?: ButtonOptions[]; subtext?: string; ephemeral?: boolean } = {}
): { components: ContainerBuilder[]; flags: number; allowedMentions: { parse: [] } } {
    const card = new ComponentV2Builder({ accentColor: tone === "done" ? TONE.accepted : tone === "error" ? TONE.declined : TONE.open }).heading(title, 3);

    if (text) card.text(text);
    if (extra.buttons?.length) card.buttons(...extra.buttons);
    if (extra.subtext) card.subtext(extra.subtext);

    return { ...card.toMessage({ ephemeral: extra.ephemeral ?? true }), allowedMentions: { parse: [] } };
}

/* ----------------------------------------------------------
   Per DM (Plan 24)
   ---------------------------------------------------------- */

/**
 * Eine Frage in der DM. live: mit Knöpfen und Menü - ist die Frage
 * beantwortet oder abgelaufen, steht sie ohne da.
 */
export function DmQuestionView(guildName: string, form: IApplyForm, index: number, draftId: string, live = true): MessageCreateOptions {
    const question = form.questions[index];
    const hint =
        question.kind === "choice"
            ? question.hint
            : `${question.hint ? `${question.hint.replace(/[.!?…]+$/, "")}. ` : ""}Schreib die Antwort einfach hier in den Chat.`;
    const card = new ComponentV2Builder({ accentColor: TONE.open })
        .heading(`📋 | Bewerbung als ${form.name}`, 3)
        .subtext(`${guildName} · Frage ${index + 1} von ${form.questions.length}`)
        .text(`**${question.label}**${hint ? `\n-# ${hint}` : ""}`);

    if (live) {
        if (question.kind === "choice") {
            card.select({
                customId: `${APPLY_FLOW_PREFIX}:choice:${draftId}`,
                placeholder: "Wähl etwas aus",
                options: question.choices.map((choice) => ({ label: choice, value: choice })),
            });
        }

        const buttons: ButtonOptions[] = [];

        if (index > 0) buttons.push({ customId: `${APPLY_FLOW_PREFIX}:back:${draftId}`, label: "Zurück", tone: "secondary" });
        if (!question.required) buttons.push({ customId: `${APPLY_FLOW_PREFIX}:skip:${draftId}`, label: "Überspringen", tone: "secondary" });

        buttons.push({ customId: `${APPLY_FLOW_PREFIX}:cancel:${draftId}`, label: "Abbrechen", tone: "secondary" });
        card.buttons(...buttons);
    }

    return { ...card.toMessage(), allowedMentions: { parse: [] } };
}

/** Am Ende der DM: alle Antworten, gekürzt wie die Team-Karte, und Abschicken. */
export function DmSummaryView(form: IApplyForm, answers: IApplyAnswer[], draftId: string, live = true): MessageCreateOptions {
    const card = new ComponentV2Builder({ accentColor: TONE.open })
        .heading("Fertig. Das geht ans Team:", 3)
        .text(Answers(form, answers, "-# … gekürzt, abgeschickt wird alles."));

    if (live) {
        card.buttons(
            { customId: `${APPLY_FLOW_PREFIX}:send:${draftId}`, label: "Abschicken", tone: "success" },
            { customId: `${APPLY_FLOW_PREFIX}:restart:${draftId}`, label: "Neu anfangen", tone: "secondary" },
            { customId: `${APPLY_FLOW_PREFIX}:cancel:${draftId}`, label: "Abbrechen", tone: "secondary" }
        );
    }

    return { ...card.toMessage(), allowedMentions: { parse: [] } };
}
