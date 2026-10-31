import { Events, Interaction } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";

/** Knöpfe und Fenster der Backups (bk:…): Liste, Laden, Rückgängig, Automatisch (Plan 32). */
export default class BackupButtons extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.InteractionCreate,
            description: "Knöpfe und Fenster von /backup und den Backup-Karten",
            once: false,
        });
    }

    async Execute(interaction: Interaction): Promise<void> {
        if (!(interaction.isButton() || interaction.isModalSubmit()) || !interaction.customId.startsWith("bk:")) return;

        try {
            await this.client.serverBackupService.OnButton(interaction);
        } catch (error) {
            const normalized = error instanceof Error ? error : new Error(String(error));

            await this.client.guardian.ReportError(normalized, interaction, `Backup-Knopf: ${interaction.customId}`);
        }
    }
}
