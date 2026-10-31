import { AutocompleteInteraction, ChatInputCommandInteraction, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import BotClient from "../../client/BotClient";
import Command from "../../structures/Command";
import Category from "../../enums/Category";

/**
 * /backup (Plan 32): Backups mit Discord-Server anlegen, ansehen, vergleichen,
 * laden und automatisch sichern, ohne das Dashboard. Nur mit „Server
 * verwalten“ und Zugang zum Dashboard; Antworten sieht nur, wer fragt.
 * „Auf einen anderen Server“ gibt es nur im Dashboard.
 */
export default class Backup extends Command {
    constructor(client: BotClient) {
        super(client, {
            name: "backup",
            description: "Backups des Servers: anlegen, ansehen, vergleichen, laden",
            category: Category.Admin,
            cooldown: 3,
            developerOnly: false,
            module: "backups",
        });

        const backup = (option: import("discord.js").SlashCommandStringOption) => option.setName("backup").setDescription("Welches Backup?").setRequired(true).setAutocomplete(true);

        this.data = new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
            .setContexts(InteractionContextType.Guild)
            .addSubcommand((sub) =>
                sub
                    .setName("neu")
                    .setDescription("Legt ein Backup an")
                    .addStringOption((option) => option.setName("notiz").setDescription("Wofür, etwa „vor dem Turnier“").setMaxLength(200))
                    .addStringOption((option) =>
                        option
                            .setName("was")
                            .setDescription("Was ins Backup soll")
                            .addChoices({ name: "Alles", value: "alles" }, { name: "Nur Bot", value: "bot" }, { name: "Nur Discord-Server", value: "server" })
                    )
            )
            .addSubcommand((sub) => sub.setName("liste").setDescription("Zeigt deine Backups, die letzten 14 Tage auf einen Blick"))
            .addSubcommand((sub) => sub.setName("ansehen").setDescription("Was drin ist: Kanäle, Rollen, Bereiche im Bot").addStringOption(backup))
            .addSubcommand((sub) => sub.setName("vergleichen").setDescription("Was sich seitdem geändert hat, ohne etwas zu ändern").addStringOption(backup))
            .addSubcommand((sub) =>
                sub
                    .setName("laden")
                    .setDescription("Reparieren oder genau wie im Backup, mit Rückfrage")
                    .addStringOption(backup)
                    .addStringOption((option) =>
                        option.setName("modus").setDescription("Wie laden?").addChoices({ name: "Reparieren (legt nur an, löscht nichts)", value: "reparieren" }, { name: "Genau wie im Backup", value: "genau" })
                    )
            )
            .addSubcommand((sub) => sub.setName("automatisch").setDescription("Wann der Bot von selbst sichert, an oder aus"));
    }

    async AutoComplete(interaction: AutocompleteInteraction): Promise<void> {
        await this.client.serverBackupService.OnAutocomplete(interaction);
    }

    async Execute(interaction: ChatInputCommandInteraction): Promise<void> {
        await this.client.serverBackupService.OnCommand(interaction);
    }
}
