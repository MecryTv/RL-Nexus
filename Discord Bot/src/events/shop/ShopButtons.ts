import { ButtonInteraction, Events, Interaction, MessageFlags } from "discord.js";
import ComponentV2Builder from "../../builder/ComponentV2Builder";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import logger from "../../utils/logger";

/**
 * Die zwei Knöpfe in den Shop-DMs. Die DMs schickt der Admin-Server mit dem
 * Bot-Token, die Klicks kommen aber hier an. Die IDs stehen dort in
 * server/shop/dm.ts (DM_ACCESS, DM_CANCEL) und müssen gleich bleiben.
 * Geantwortet wird nur für die Person sichtbar.
 */
const ACCESS = "shop:access";
const CANCEL = "shop:cancel";
const GREEN = 0x248046;
const RED = 0xda373c;

export default class ShopButtons extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.InteractionCreate,
            description: "Beantwortet „Zugang anzeigen“ und „Kündigen“ in den Shop-DMs",
            once: false,
        });
    }

    async Execute(interaction: Interaction): Promise<void> {
        if (!interaction.isButton() || (interaction.customId !== ACCESS && interaction.customId !== CANCEL)) return;

        try {
            await (interaction.customId === ACCESS ? this.Access(interaction) : this.Cancel(interaction));
        } catch (error) {
            logger.warn(`🛒 ${interaction.customId} fehlgeschlagen - ${String(error)}`);

            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: "Da ging etwas schief - versuch es gleich nochmal.", flags: MessageFlags.Ephemeral }).catch(() => undefined);
            }
        }
    }

    private async Access(interaction: ButtonInteraction): Promise<void> {
        const lines = await this.client.dashboardService.ShopStatus(interaction.user.id);

        if (lines === null) {
            await interaction.reply({ content: "Der Bot erreicht gerade seine Datenbank nicht - versuch es gleich nochmal.", flags: MessageFlags.Ephemeral });

            return;
        }

        const site = this.Site();
        const view = new ComponentV2Builder({ accentColor: GREEN }).heading("Dein Zugang", 3);

        if (lines.length > 0) view.text(lines.join("\n"));
        else view.text("Gerade läuft bei dir kein Zugang.");

        view.subtext("Rechnungen, Zahlungsart und Kündigung findest du unter Mein Zugang.");
        view.buttons(
            ...(lines.length === 0 ? [{ url: `${site}/preise`, label: "Preise", emoji: "🛒" }] : []),
            { url: `${site}/zugang`, label: "Mein Zugang", emoji: "👤" }
        );

        await interaction.reply(view.toMessage({ ephemeral: true }));
    }

    private async Cancel(interaction: ButtonInteraction): Promise<void> {
        const view = new ComponentV2Builder({ accentColor: RED })
            .heading("Kündigen", 3)
            .text("Kündigen geht auf nexus-emb.de. Dein Abo läuft bis zum Ende des bezahlten Monats, danach wird nichts mehr abgebucht.")
            .buttons({ url: `${this.Site()}/kuendigen`, label: "Zur Kündigung" });

        await interaction.reply(view.toMessage({ ephemeral: true }));
    }

    private Site(): string {
        return this.client.config.SITE_PUBLIC_URL.replace(/\/+$/, "");
    }
}
