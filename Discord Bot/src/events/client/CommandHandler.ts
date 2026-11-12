import { Collection, Events, Interaction } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import Command from "../../structures/Command";
import ComponentV2Builder from "../../builder/ComponentV2Builder";
import logger from "../../utils/logger";
import { CommandsAllowed } from "../../utils/invitepass";
import { NoAccessReply } from "../../utils/servers";

export default class CommandHandler extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.InteractionCreate,
            description: "CommandHandler Event",
            once: false,
        });
    }

    async Execute(interaction: Interaction): Promise<void> {
        if (interaction.isAutocomplete()) {
            const target = this.client.commands.get(interaction.commandName);

            await target?.AutoComplete(interaction).catch((error) =>
                logger.warn(`[CommandHandler] AutoComplete /${interaction.commandName} fehlgeschlagen: ${error}`)
            );

            return;
        }

        // Kontextmenüs (Plan 31: „Hack melden“, W-0014: „Als Beweis sichern“) gehen durch dieselben Prüfungen wie Slash-Befehle.
        if (!interaction.isChatInputCommand() && !interaction.isContextMenuCommand()) return;

        const command: Command | undefined = this.client.commands.get(interaction.commandName);

        if (!command) {
            await interaction.reply(
                new ComponentV2Builder({ accentColor: "Red" })
                    .title("❌ | Unbekannter Befehl")
                    .separator()
                    .text("Diesen Befehl gibt es nicht.")
                    .toMessage({ ephemeral: true })
            );

            return;
        }

        if (command.developerOnly && !this.client.config.DEV_USER_IDs.includes(interaction.user.id)) {
            await interaction.reply(
                new ComponentV2Builder({ accentColor: "Red" })
                    .title("⚠️ | Nur für Entwickler")
                    .separator()
                    .text("Diesen Befehl können nur die Entwickler des Bots nutzen.")
                    .toMessage({ ephemeral: true })
            );

            return;
        }

        // W-0064, Punkt 5: Hat auf dem Server niemand Zugang, laufen keine Commands. Developer-Befehle bleiben.
        if (interaction.inCachedGuild() && !command.developerOnly && !(await CommandsAllowed(this.client, interaction.guild, interaction.user.id))) {
            const accessUrl = `${this.client.config.SITE_PUBLIC_URL.replace(/[/]+$/, "")}/preise`;

            await interaction
                .reply(await NoAccessReply(interaction.guild.name, interaction.memberPermissions.has("ManageGuild"), accessUrl))
                .catch((error: unknown) => logger.warn(`[CommandHandler] Hinweis ohne Zugang zu /${command.name} nicht gesendet: ${String(error)}`));

            return;
        }

        const { cooldowns } = this.client;
        if (!cooldowns.has(command.name)) cooldowns.set(command.name, new Collection());

        const now = Date.now();
        const timestamps = cooldowns.get(command.name)!;
        const cooldownAmount = (command.cooldown || 3) * 1000;
        const expiresAt = (timestamps.get(interaction.user.id) || 0) + cooldownAmount;

        if (timestamps.has(interaction.user.id) && now < expiresAt) {
            const remaining = ((expiresAt - now) / 1000).toFixed(1);

            await interaction.reply(
                new ComponentV2Builder({ accentColor: "Yellow" })
                    .title("⚠️ | Kurz warten")
                    .separator()
                    .text(`Warte noch \`${remaining}\` Sekunden, dann geht der Befehl wieder.`)
                    .toMessage({ ephemeral: true })
            );

            return;
        }

        timestamps.set(interaction.user.id, now);
        setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);

        try {
            if (interaction.isUserContextMenuCommand()) await command.ExecuteUser(interaction);
            else if (interaction.isMessageContextMenuCommand()) await command.ExecuteMessage(interaction);
            else await command.Execute(interaction);
        } catch (error) {
            const normalized = error instanceof Error ? error : new Error(String(error));
            await this.client.guardian.ReportError(normalized, interaction, `Command Error: /${command.name}`);
        }
    }
}
