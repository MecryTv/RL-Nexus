import { Events, Interaction } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import { ABSENCE_PREFIX } from "../../constants/Absences";
import { AbsenceNote } from "../../builder/AbsenceView";

/** W-0095: Formular, Knöpfe und Team-Auswahl der Abmeldungen. */
export default class AbsenceInteractions extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.InteractionCreate,
            description: "Bedient Formular und Knöpfe der Abmeldungen",
            once: false,
        });
    }

    async Execute(interaction: Interaction): Promise<void> {
        if (!interaction.isButton() && !interaction.isModalSubmit() && !interaction.isStringSelectMenu()) return;
        if (!interaction.customId.startsWith(`${ABSENCE_PREFIX}:`)) return;
        if (!interaction.inCachedGuild()) return;

        const service = this.client.absenceService;

        try {
            if (interaction.isModalSubmit()) return await service.Submit(interaction);
            if (interaction.isStringSelectMenu()) return await service.Picked(interaction);

            await service.Button(interaction);
        } catch (error) {
            const normalized = error instanceof Error ? error : new Error(String(error));

            await this.client.guardian.ReportError(normalized, interaction, `Abmeldungen: ${interaction.customId}`);

            if (!interaction.replied && !interaction.deferred) await interaction.reply(AbsenceNote("Das hat nicht geklappt. Versuch es gleich noch einmal.", "error")).catch(() => undefined);
        }
    }
}
