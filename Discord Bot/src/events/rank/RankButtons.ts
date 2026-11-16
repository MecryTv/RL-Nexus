import { ButtonInteraction, Events, Interaction, MessageFlags } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import { RANK_PREFIX, RankMessage } from "../../builder/RankView";
import { RankCardPage } from "../../builder/RankCard";

/**
 * W-0129: Der Knopf „Extra-Modi“ / „Ranked“ unter der Rang-Karte (rk:…).
 *
 * Wer /rank aufgerufen hat, schaltet die Nachricht selbst um. Klickt jemand
 * anderes, bekommt er die gewünschte Seite als eigene Antwort, die nur er
 * sieht - sonst könnte jeder dem Fragenden die Karte wegschalten.
 */
export default class RankButtons extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.InteractionCreate,
            description: "Seitenwechsel unter der Rang-Karte von /rank",
            once: false,
        });
    }

    async Execute(interaction: Interaction): Promise<void> {
        if (!interaction.isButton() || !interaction.customId.startsWith(`${RANK_PREFIX}:`)) return;

        try {
            await this.Switch(interaction);
        } catch (error) {
            const normalized = error instanceof Error ? error : new Error(String(error));

            await this.client.guardian.ReportError(normalized, interaction, `Rang-Karten-Knopf: ${interaction.customId}`);
        }
    }

    private async Switch(interaction: ButtonInteraction): Promise<void> {
        const [, target, accountId, ownerId] = interaction.customId.split(":");

        if ((target !== "ranked" && target !== "extra") || !accountId) return;

        const page: RankCardPage = target;
        const mine = interaction.user.id === ownerId;

        if (mine) await interaction.deferUpdate();
        else await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // Prime hält die Antwort zehn Minuten vor - der Wechsel kostet also
        // meist keine neue Anfrage, nur das Zeichnen.
        const profile = await this.client.primeService.Profile(accountId).catch(() => null);

        if (!profile) {
            const content = "Rocket League antwortet gerade nicht. Versuch es gleich noch einmal.";

            if (mine) await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
            else await interaction.editReply({ content });

            return;
        }

        // Wie bei /rank search: steht ein verknüpfter Discord-Nutzer hinter dem
        // Konto, zeigt die Karte seinen Namen und sein Bild.
        const owner = this.client.databaseService.Ready ? await this.client.accounts.Owner("epic", profile.accountId) : null;
        const member = owner ? await this.client.users.fetch(owner).catch(() => null) : null;

        const message = await RankMessage(
            {
                profile,
                discordName: member?.username ?? null,
                avatarURL: member?.displayAvatarURL({ extension: "png", size: 256 }) ?? null,
                page,
            },
            interaction.user.id
        );

        await interaction.editReply({ ...message, attachments: [] });
    }
}
