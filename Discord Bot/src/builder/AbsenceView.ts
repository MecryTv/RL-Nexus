import { LabelBuilder, MessageFlags, ModalBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import ComponentV2Builder from "./ComponentV2Builder";
import { ABSENCE_PREFIX, Day, DayInput, DayLabel, MAX_ABSENCE_NOTE } from "../constants/Absences";
import { ITeamAbsence } from "../interfaces/services/teams/IAbsences";
import { ITeam } from "../interfaces/services/teams/ITeams";

/**
 * Was die Abmeldungen in Discord zeigen (W-0095): das Formular aus Entwurf B1,
 * die Bestätigung, die eigene Liste und die Auswahl des Teams. Antworten sieht
 * nur, wer fragt. Das Bild für /abmeldungen zeichnet AbsenceCard.ts.
 */

const GREEN = 0x23a55a;
const YELLOW = 0xf0b232;
const RED = 0xff1e2d;

export const ALL_TEAMS = "all";

export interface IAbsenceModalInput {
    /** Mehr als eins: oben die Auswahl „Team“ mit „Alle meine Teams“. */
    teams: ITeam[];
    reasons: string[];
    reasonRequired: boolean;
    /** Beim Ändern: die alte Abmeldung, ihr Team steht dann fest. */
    edit?: ITeamAbsence & { teamName: string };
}

export function AbsenceModal(input: IAbsenceModalInput): ModalBuilder {
    const { edit } = input;
    const title = edit ? `Abmeldung ändern · ${edit.teamName}` : input.teams.length === 1 ? `Abmelden · ${input.teams[0]!.name}` : "Abmelden";
    const modal = new ModalBuilder().setCustomId(edit ? `${ABSENCE_PREFIX}:modal:edit:${edit.id}` : `${ABSENCE_PREFIX}:modal:new`).setTitle(title.slice(0, 45));

    if (!edit && input.teams.length > 1) {
        modal.addLabelComponents(
            new LabelBuilder().setLabel("Team").setStringSelectMenuComponent(
                new StringSelectMenuBuilder()
                    .setCustomId("team")
                    .setRequired(true)
                    .setMinValues(1)
                    .setMaxValues(1)
                    .addOptions(
                        { label: "Alle meine Teams", value: ALL_TEAMS, default: true },
                        ...input.teams.slice(0, 24).map((team) => ({ label: team.name.slice(0, 100), value: String(team.id) }))
                    )
            )
        );
    }

    const from = new TextInputBuilder().setCustomId("from").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(20).setValue(edit ? DayInput(edit.startsOn) : "heute");
    const to = new TextInputBuilder().setCustomId("to").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(20).setPlaceholder("z. B. So oder 20.11. Leer: nur der eine Tag");

    if (edit) to.setValue(DayInput(edit.endsOn));

    modal.addLabelComponents(
        new LabelBuilder().setLabel("Von").setDescription("heute, morgen, Sa oder 15.11.").setTextInputComponent(from),
        new LabelBuilder().setLabel("Bis").setDescription("Bis einschließlich").setTextInputComponent(to)
    );

    if (input.reasons.length) {
        modal.addLabelComponents(
            new LabelBuilder()
                .setLabel("Grund")
                .setDescription("Sehen nur Captain und Co.")
                .setStringSelectMenuComponent(
                    new StringSelectMenuBuilder()
                        .setCustomId("reason")
                        .setRequired(input.reasonRequired)
                        .setMinValues(input.reasonRequired ? 1 : 0)
                        .setMaxValues(1)
                        .setPlaceholder("Grund wählen")
                        .addOptions(input.reasons.map((reason) => ({ label: reason, value: reason, default: edit?.reason === reason })))
                )
        );
    }

    const note = new TextInputBuilder().setCustomId("note").setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(MAX_ABSENCE_NOTE).setPlaceholder("Bin ab Montag wieder fit");

    if (edit?.note) note.setValue(edit.note);

    return modal.addLabelComponents(new LabelBuilder().setLabel("Notiz").setDescription("Optional, sehen nur Captain und Co.").setTextInputComponent(note));
}

/** „Fr 13.11. – So 15.11.“ oder „Sa 14.11.“ */
export function Period(startsOn: Day, endsOn: Day): string {
    return startsOn === endsOn ? DayLabel(startsOn) : `${DayLabel(startsOn)} – ${DayLabel(endsOn)}`;
}

function Ephemeral(card: ComponentV2Builder) {
    return { components: [card.build()], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, allowedMentions: { parse: [] } } as const;
}

/** Nach dem Absenden: grüne Bestätigung mit „Zurückmelden“ und „Ändern“. */
export function AddedReply(saved: ITeamAbsence[], names: Map<number, string>, today: Day) {
    const first = saved[0]!;
    const teams = saved.map((entry) => `**${names.get(entry.teamId) ?? "Team"}**`).join(", ");
    const card = new ComponentV2Builder({ accentColor: GREEN })
        .text(`✅ Du bist bei ${teams} abgemeldet: **${Period(first.startsOn, first.endsOn)}**`)
        .subtext("Deine Captains sehen es mit /abmeldungen. Den Grund und die Notiz sehen nur Captain, Co-Captain, Manager und Coach.");
    const buttons = [
        ...(first.startsOn <= today ? [{ customId: `${ABSENCE_PREFIX}:return`, label: "Zurückmelden", tone: "secondary" as const }] : []),
        ...(saved.length === 1 ? [{ customId: `${ABSENCE_PREFIX}:edit:${first.id}`, label: "Ändern", tone: "secondary" as const }] : []),
    ];

    if (buttons.length) card.buttons(...buttons);

    return Ephemeral(card);
}

/** /abmelden, wenn schon etwas eingetragen ist: die eigenen Abmeldungen, je eine mit „Löschen“. */
export function MineReply(mine: ITeamAbsence[], names: Map<number, string>, today: Day) {
    const card = new ComponentV2Builder({ accentColor: YELLOW }).text(mine.length === 1 ? "Du hast **eine** Abmeldung:" : `Du hast **${mine.length}** Abmeldungen:`);

    for (const entry of mine.slice(0, 8)) {
        const reason = entry.reason ? ` · ${entry.reason}` : "";

        card.section(`**${Period(entry.startsOn, entry.endsOn)}** · ${names.get(entry.teamId) ?? "Team"}${reason}`, {
            type: "button",
            customId: `${ABSENCE_PREFIX}:remove:${entry.id}`,
            label: "Löschen",
            tone: "secondary",
        });
    }

    card.buttons(
        { customId: `${ABSENCE_PREFIX}:new`, label: "Neue Abmeldung", tone: "primary" },
        ...(mine.some((entry) => entry.startsOn <= today) ? [{ customId: `${ABSENCE_PREFIX}:return`, label: "Zurückmelden", tone: "secondary" as const }] : []),
        ...(mine.length === 1 ? [{ customId: `${ABSENCE_PREFIX}:edit:${mine[0]!.id}`, label: "Ändern", tone: "secondary" as const }] : [])
    );

    return Ephemeral(card);
}

/** /abmeldungen bei mehreren Teams: erst wählen. */
export function TeamPicker(teams: ITeam[]) {
    return Ephemeral(
        new ComponentV2Builder({ accentColor: YELLOW }).text("Welches Team?").select({
            customId: `${ABSENCE_PREFIX}:list`,
            placeholder: "Team wählen",
            options: teams.slice(0, 25).map((team) => ({ label: team.name.slice(0, 100), value: String(team.id) })),
        })
    );
}

export function AbsenceNote(text: string, tone: "ok" | "warn" | "error" = "warn") {
    return Ephemeral(new ComponentV2Builder({ accentColor: tone === "ok" ? GREEN : tone === "warn" ? YELLOW : RED }).text(text));
}
