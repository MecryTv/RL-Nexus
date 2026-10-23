import { MessageCreateOptions } from "discord.js";
import BotClient from "../client/BotClient";
import ComponentV2Builder from "../builder/ComponentV2Builder";
import { APPLY_PREFIX, STATUS_LABELS } from "../constants/Apply";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import { IApplyForm, IApplySubmission } from "../interfaces/services/apply/IApply";

/**
 * Die Karte einer Bewerbung im Team-Kanal: wer, worauf, die Antworten - und
 * zwei Knöpfe. Ist entschieden, stehen dort Ergebnis und Name statt der Knöpfe.
 */

const TONE = { open: "#00afff", accepted: "#3ba55c", declined: "#ed4245" } as const;

/** Antworten kürzen: eine Karte hat 4000 Zeichen, nicht mehr. */
function Answers(form: IApplyForm, submission: IApplySubmission): string {
    const lines: string[] = [];
    let left = 3200;

    for (const question of form.questions) {
        const answer = submission.answers.find((entry) => entry.id === question.id);

        if (!answer) continue;

        const value = answer.value.length > 400 ? `${answer.value.slice(0, 399)}…` : answer.value;
        const block = `**${question.label}**\n> ${value.replace(/\n/g, "\n> ")}`;

        if (block.length > left) {
            lines.push("-# … gekürzt, der Rest steht im Dashboard.");
            break;
        }

        left -= block.length;
        lines.push(block);
    }

    return lines.join("\n\n") || "Keine Antworten.";
}

export function ApplyCard(client: BotClient, form: IApplyForm, submission: IApplySubmission): MessageCreateOptions {
    const open = submission.status === "open";
    const card = new ComponentV2Builder({ accentColor: TONE[submission.status] })
        .title(`${form.emoji ? `${form.emoji} ` : ""}Bewerbung als ${form.name}`, `#${submission.id} · <@${submission.userId}> \`${submission.userName}\``)
        .separator()
        .text(Answers(form, submission))
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
    }

    card.buttons({ url: `${client.server.BaseURL}${DASHBOARD_PATH}/guild/${submission.guildId}/apply`, label: "Im Dashboard öffnen" });

    return card.toMessage();
}
