import { ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from "discord.js";
import BotClient from "../../client/BotClient";
import Command from "../../structures/Command";
import Category from "../../enums/Category";
import { InfoCard } from "../../builder/CommunityView";
import { KIND_LABELS, LFT_ACCENT, LFT_MODULE } from "../../constants/Lft";
import { LftError } from "../../services/LookingForService";
import { LftKind } from "../../interfaces/services/lft/ILft";

/**
 * /lookingfor - eine Anfrage erstellen.
 *
 * Der Befehl selbst fragt nichts: er schreibt eine DM und stellt dort die
 * Fragen, die im Dashboard stehen. Fertig wird daraus ein Beitrag im Forum.
 * Siehe docs/LookingFor.md.
 */
export default class LookingFor extends Command {
    constructor(client: BotClient) {
        super(client, {
            name: "lookingfor",
            description: "Sucht ein Team oder Spieler – der Bot fragt dich per DM",
            category: Category.User,
            cooldown: 15,
            developerOnly: false,
            module: "lft",
        });

        this.data = new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .addSubcommand((sub) => sub.setName("spieler").setDescription("Du suchst ein Team"))
            .addSubcommand((sub) => sub.setName("team").setDescription("Ihr seid ein Team und sucht Spieler"))
            .addSubcommand((sub) =>
                sub
                    .setName("beenden")
                    .setDescription("Beendet deine Suche und schließt den Beitrag")
                    .addStringOption((option) =>
                        option
                            .setName("art")
                            .setDescription("Welche Suche, wenn beide laufen")
                            .addChoices({ name: KIND_LABELS.player, value: "player" }, { name: KIND_LABELS.team, value: "team" })
                    )
            );
    }

    async Execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.inCachedGuild()) return;

        if (!(await this.client.settings.Of(interaction.guildId)).modules.includes(LFT_MODULE)) {
            await this.Say(interaction, "Looking for ist auf diesem Server aus.");

            return;
        }

        const what = interaction.options.getSubcommand();

        try {
            if (what === "beenden") return await this.Stop(interaction);

            await this.Say(interaction, await this.client.lookingForService.Start(interaction.member, what === "team" ? "team" : "player"));
        } catch (error) {
            if (!(error instanceof LftError)) throw error;

            await this.Say(interaction, error.message);
        }
    }

    /**
     * Antwortet - egal, ob schon aufgeschoben wurde. "beenden" schiebt auf, die
     * Fehlermeldung darf trotzdem in derselben Antwort landen.
     */
    private async Say(interaction: ChatInputCommandInteraction, text: string): Promise<void> {
        if (interaction.deferred || interaction.replied) await interaction.editReply({ ...InfoCard(text, LFT_ACCENT), flags: MessageFlags.IsComponentsV2 });
        else await interaction.reply({ ...InfoCard(text, LFT_ACCENT), flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    }

    /* ------------------------------------------------------------------
       /lookingfor beenden
       ------------------------------------------------------------------ */
    private async Stop(interaction: ChatInputCommandInteraction<"cached">): Promise<void> {
        const service = this.client.lookingForService;
        const wanted = interaction.options.getString("art") as LftKind | null;

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const open = await service.Mine(interaction.guildId, interaction.user.id, wanted ?? undefined);

        if (!open.length) {
            await this.Say(interaction, wanted ? `Du hast gerade keine laufende ${KIND_LABELS[wanted]}.` : "Du hast gerade keine laufende Suche.");

            return;
        }

        // Beide Arten laufen und keine ist gemeint: lieber fragen als die
        // falsche schliessen.
        if (open.length > 1) {
            await this.Say(interaction, "Bei dir laufen beide Suchen. Sag mit `art`, welche ich beenden soll.");

            return;
        }

        const request = open[0];

        await service.Close(interaction.guild, request.id, interaction.user.id);

        const link = service.Link(interaction.guildId, request);

        await this.Say(interaction, `Deine ${KIND_LABELS[request.kind]} ist beendet${link ? ` – der Beitrag ist zu: ${link}` : "."}`);
    }
}
