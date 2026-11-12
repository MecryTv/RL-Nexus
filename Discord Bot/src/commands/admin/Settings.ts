import { ChatInputCommandInteraction, InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import BotClient from "../../client/BotClient";
import Command from "../../structures/Command";
import Category from "../../enums/Category";
import { OverviewView, PanelView } from "../../builder/SettingsView";
import { PANEL_MODULES } from "../../services/settings/registers";
import { PanelError } from "../../services/settings/SettingsModel";
import logger from "../../utils/logger";

/**
 * /einstellungen [modul] (W-0014 Teil 3): die einfachen Einstellungen eines
 * Moduls als Panel, nur für den, der es öffnet. Ohne Modul erst die Übersicht.
 * Weiter geht es in events/settings/SettingsButtons.ts. Siehe docs/Settings.md.
 */
export default class Settings extends Command {
    constructor(client: BotClient) {
        super(client, { name: "einstellungen", description: "Einstellungen der Module ändern, wie im Dashboard", category: Category.Admin, cooldown: 3, developerOnly: false, module: "dashboard" });

        this.data = new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .setContexts(InteractionContextType.Guild)
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
            .addStringOption((option) =>
                option
                    .setName("modul")
                    .setDescription("Welches Modul? Leer: alle zur Auswahl")
                    .addChoices(...Object.values(PANEL_MODULES).map((panel) => ({ name: panel.name, value: panel.id })))
            );
    }

    async Execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const service = this.client.settingsPanel;

        try {
            if (!interaction.inCachedGuild()) throw new PanelError("Das geht nur auf einem Server.");
            if (!service.Can(interaction.member)) throw new PanelError("Einstellungen ändert nur, wer den Server verwaltet.");

            // Bilder zeichnen dauert länger, als Discord für eine Antwort lässt.
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const id = interaction.options.getString("modul");
            const view = id ? await PanelView(await service.State(interaction.guild, id)) : await OverviewView(interaction.guild, await service.Overview(interaction.guild), service.Link(interaction.guild, null));

            await interaction.editReply({ ...view, flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });
        } catch (error) {
            if (!(error instanceof PanelError)) logger.error("⚙️ /einstellungen fehlgeschlagen", error);

            const content = `❌ ${error instanceof PanelError ? error.message : "Da ging etwas schief. Versuch es gleich nochmal."}`;

            if (interaction.deferred) await interaction.editReply({ content }).catch(() => undefined);
            else await interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => undefined);
        }
    }
}
