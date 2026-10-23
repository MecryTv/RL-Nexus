import { ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from "discord.js";
import BotClient from "../../client/BotClient";
import Command from "../../structures/Command";
import Category from "../../enums/Category";
import { InfoCard } from "../../builder/CommunityView";
import { PLAYLIST_LABELS, RANK_ROLES_ACCENT, RANK_ROLES_MODULE } from "../../constants/RankRoles";
import { RankRoleError } from "../../services/RankRoleService";

/**
 * /rangrollen - holt sich die Rolle, die zum eigenen Rang gehört.
 *
 * Der Bot fragt nichts von selbst: wer aufsteigt, gibt den Befehl noch einmal
 * ein. Der Epic-Name kommt aus dem verknüpften Konto (/rank link), die Ränge
 * aus Prime. Siehe docs/RankRoles.md.
 */
export default class RankRoles extends Command {
    constructor(client: BotClient) {
        super(client, {
            name: "rangrollen",
            description: "Holt dir die Rolle zu deinem Rocket-League-Rang",
            category: Category.User,
            cooldown: 15,
            developerOnly: false,
            module: "rank-roles",
        });

        this.data = new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .addSubcommand((sub) => sub.setName("holen").setDescription("Setzt deine Rang-Rollen auf den aktuellen Stand"))
            .addSubcommand((sub) => sub.setName("ablegen").setDescription("Nimmt dir alle Rang-Rollen wieder ab"));
    }

    async Execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.inCachedGuild()) return;

        const say = (text: string) =>
            interaction.reply({ ...InfoCard(text, RANK_ROLES_ACCENT), flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });

        if (!(await this.client.settings.Of(interaction.guildId)).modules.includes(RANK_ROLES_MODULE)) {
            await say("Rank Roles ist auf diesem Server aus.");

            return;
        }

        const settings = await this.client.rankRoleService.Settings(interaction.guildId);

        // Ein eigener Kanal ist da, um den Rest des Servers nicht zuzuspammen -
        // die Antwort sieht zwar nur der Fragende, der Befehl selbst aber nicht.
        if (settings.channelId && settings.channelId !== interaction.channelId) {
            await say(`Das geht nur in <#${settings.channelId}>.`);

            return;
        }

        if (interaction.options.getSubcommand() === "ablegen") return this.Strip(interaction);

        return this.Apply(interaction);
    }

    /* ------------------------------------------------------------------
       /rangrollen holen
       ------------------------------------------------------------------ */
    private async Apply(interaction: ChatInputCommandInteraction<"cached">): Promise<void> {
        // Prime kann eine Sekunde brauchen - ohne Aufschub läuft die Interaktion aus.
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const result = await this.client.rankRoleService.Apply(interaction.member);
            const lines = result.changes.map((change) => {
                const head = `**${PLAYLIST_LABELS[change.playlist]}** · ${change.tierName}${change.mmr ? ` (${change.mmr})` : ""}`;

                if (change.problem) return `${head}\n-# ${change.problem}`;

                return `${head}\n-# <@&${change.roleId}>`;
            });

            const foot = result.added.length
                ? `Neu dazu: ${result.added.map((id) => `<@&${id}>`).join(", ")}`
                : result.removed.length
                  ? "Deine Rang-Rollen sind nachgezogen."
                  : "Alles war schon richtig – nichts geändert.";

            await interaction.editReply({
                ...InfoCard(`## 🎖️ Deine Rang-Rollen\nGeholt für **${result.epicName}**.\n\n${lines.join("\n\n")}\n\n${foot}`, RANK_ROLES_ACCENT),
                flags: MessageFlags.IsComponentsV2,
            });
        } catch (error) {
            if (!(error instanceof RankRoleError)) throw error;

            await interaction.editReply({ ...InfoCard(error.message, RANK_ROLES_ACCENT), flags: MessageFlags.IsComponentsV2 });
        }
    }

    /* ------------------------------------------------------------------
       /rangrollen ablegen
       ------------------------------------------------------------------ */
    private async Strip(interaction: ChatInputCommandInteraction<"cached">): Promise<void> {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const removed = await this.client.rankRoleService.Strip(interaction.member).catch(() => null);

        if (removed === null) {
            await interaction.editReply({ ...InfoCard("Das hat nicht geklappt – darf der Bot deine Rollen verwalten?", RANK_ROLES_ACCENT), flags: MessageFlags.IsComponentsV2 });

            return;
        }

        await interaction.editReply({
            ...InfoCard(
                removed.length ? `Abgelegt: ${removed.map((id) => `<@&${id}>`).join(", ")}` : "Du hattest keine Rang-Rollen.",
                RANK_ROLES_ACCENT
            ),
            flags: MessageFlags.IsComponentsV2,
        });
    }
}
