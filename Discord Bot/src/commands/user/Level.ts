import {
    ChatInputCommandInteraction,
    GuildMember,
    InteractionContextType,
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder,
} from "discord.js";
import BotClient from "../../client/BotClient";
import Command from "../../structures/Command";
import Category from "../../enums/Category";
import { InfoCard } from "../../builder/CommunityView";
import { LEVEL_PERIODS, LEVELS_ACCENT, MAX_REASON, MAX_XP_MANUAL, PERIOD_LABEL } from "../../constants/Levels";
import { LevelAdjustMode } from "../../interfaces/services/levels/ILevels";
import { BoardMessage, IsPeriod, RankPayload } from "../../services/levels/BoardMessage";
import { LEVELS_MODULE } from "../../services/LevelService";


/**
 * Der eigene Stand als Karte und die Rangliste des Servers. /rank ist schon
 * vergeben - das sind die Rocket-League-Ränge, hier geht es um die Punkte des
 * Servers. Siehe docs/Levels.md.
 */
export default class Level extends Command {
    constructor(client: BotClient) {
        super(client, { name: "level", description: "Dein Level auf diesem Server und die Rangliste", category: Category.User, cooldown: 5, developerOnly: false, module: "levels" });

        this.data = new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .setContexts(InteractionContextType.Guild)
            .addSubcommand((sub) =>
                sub
                    .setName("rang")
                    .setDescription("Zeigt deinen Stand als Karte")
                    .addUserOption((option) => option.setName("user").setDescription("Wessen Stand? Ohne Angabe deiner"))
            )
            .addSubcommand((sub) =>
                sub
                    .setName("rangliste")
                    .setDescription("Die Besten des Servers")
                    .addStringOption((option) =>
                        option
                            .setName("zeitraum")
                            .setDescription("Lifetime, die letzten 7 oder 30 Tage")
                            .addChoices(...LEVEL_PERIODS.map((period) => ({ name: PERIOD_LABEL[period], value: period })))
                    )
                    .addIntegerOption((option) => option.setName("seite").setDescription("Welche Seite?").setMinValue(1))
            )
            // Plan 37: nur mit „Server verwalten“ - geprüft in Points, weil /level allen offensteht.
            .addSubcommand((sub) =>
                sub
                    .setName("punkte")
                    .setDescription("Punkte von Hand geben, abziehen, setzen oder zurücksetzen (Server verwalten)")
                    .addStringOption((option) =>
                        option
                            .setName("aktion")
                            .setDescription("Was soll passieren?")
                            .setRequired(true)
                            .addChoices(
                                { name: "Geben", value: "geben" },
                                { name: "Abziehen", value: "abziehen" },
                                { name: "Setzen", value: "setzen" },
                                { name: "Zurücksetzen", value: "zuruecksetzen" }
                            )
                    )
                    .addUserOption((option) => option.setName("user").setDescription("Bei wem?").setRequired(true))
                    .addIntegerOption((option) => option.setName("punkte").setDescription("Wie viele Punkte? Beim Zurücksetzen egal").setMinValue(0).setMaxValue(MAX_XP_MANUAL))
                    .addStringOption((option) => option.setName("grund").setDescription("Steht im Protokoll").setMaxLength(MAX_REASON))
            );
    }

    async Execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.inCachedGuild()) return;

        const say = (text: string) => interaction.reply({ ...InfoCard(text, LEVELS_ACCENT), flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });

        if (!(await this.client.settings.Of(interaction.guildId)).modules.includes(LEVELS_MODULE)) {
            await say("Das Level System ist auf diesem Server aus.");

            return;
        }

        if (!this.client.databaseService.Ready) {
            await say("Ohne Datenbank gibt es keine Punkte.");

            return;
        }

        const sub = interaction.options.getSubcommand();

        if (sub === "rangliste") return this.Board(interaction);
        if (sub === "punkte") return this.Points(interaction, say);

        return this.Rank(interaction);
    }

    /** Plan 37: Punkte von Hand mit Grund - steht im Protokoll wie im Dashboard. Antwort nur für den Fragenden. */
    private async Points(interaction: ChatInputCommandInteraction<"cached">, say: (text: string) => Promise<unknown>): Promise<void> {
        if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
            await say("Dafür brauchst du das Recht „Server verwalten“.");

            return;
        }

        const action = interaction.options.getString("aktion", true);
        const target = interaction.options.getUser("user", true);
        const points = interaction.options.getInteger("punkte");
        const reason = interaction.options.getString("grund") ?? "";
        const mode: LevelAdjustMode = action === "setzen" ? "set" : action === "zuruecksetzen" ? "reset" : "add";

        if (target.bot) {
            await say("Bots sammeln keine Punkte.");

            return;
        }

        if (mode !== "reset" && points === null) {
            await say("Gib an, wie viele Punkte.");

            return;
        }

        // Review: erst bestätigen - Schreiben und Rollen dauern, nach 3 s zeigte Discord „reagiert nicht“, und ein zweiter Versuch gäbe doppelt.
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const amount = action === "abziehen" ? -(points ?? 0) : (points ?? 0);
        const entry = await this.client.levelService.Adjust(interaction.guild, target.id, mode, amount, interaction.user.id, reason);
        const name = `<@${target.id}>`;
        const text = entry ? `${name} hat jetzt **${entry.xp.toLocaleString("de-DE")} Punkte** (Level ${entry.level}). Steht im Protokoll.` : `${name} fängt wieder bei 0 an. Steht im Protokoll.`;

        await interaction.editReply({ ...InfoCard(text, LEVELS_ACCENT), flags: MessageFlags.IsComponentsV2 });
    }

    /** Die Karte als reines Bild (Plan 34) - sie zu zeichnen dauert, deshalb vorher aufschieben. */
    private async Rank(interaction: ChatInputCommandInteraction<"cached">): Promise<void> {
        const target = (interaction.options.getMember("user") as GuildMember | null) ?? interaction.member;

        await interaction.deferReply();

        if (target.user.bot) {
            await interaction.editReply({ ...InfoCard("Bots sammeln keine Punkte.", LEVELS_ACCENT), flags: MessageFlags.IsComponentsV2 });

            return;
        }

        await interaction.editReply(RankPayload(await this.client.levelService.CardImage(target)));
    }

    /** Die Rangliste als Bild mit Knöpfen (Plan 34). Niemand im Zeitraum: kurzer Text nur für den Fragenden. */
    private async Board(interaction: ChatInputCommandInteraction<"cached">): Promise<void> {
        const raw = interaction.options.getString("zeitraum");
        const period = IsPeriod(raw) ? raw : "all";
        const page = interaction.options.getInteger("seite") ?? 1;

        await interaction.deferReply();

        const payload = await BoardMessage(this.client, interaction.guild, period, page, interaction.user.id, interaction.user.id);

        if ("content" in payload) {
            await interaction.deleteReply().catch(() => undefined);
            await interaction.followUp({ content: payload.content, flags: MessageFlags.Ephemeral });

            return;
        }

        await interaction.editReply(payload);
    }
}
