import { ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from "discord.js";
import BotClient from "../../client/BotClient";
import Command from "../../structures/Command";
import Category from "../../enums/Category";
import { ROULETTE_MODULE, StartTime } from "../../constants/RocketRoulette";
import { IRouletteActor, RouletteError } from "../../services/RouletteService";

/**
 * /roulette (W-0087): einen Abend planen, sofort starten, beenden, nachsehen.
 * Die Runden laufen über die Steuerkarte im Moderator-Kanal, nicht über Befehle.
 */
export default class Roulette extends Command {
    constructor(client: BotClient) {
        super(client, {
            name: "roulette",
            description: "Rocket Roulette: Abend planen, starten, beenden oder nachsehen",
            category: Category.User,
            cooldown: 3,
            developerOnly: false,
            module: ROULETTE_MODULE,
        });

        this.data = new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .addSubcommand((sub) =>
                sub
                    .setName("planen")
                    .setDescription("Legt einen Abend mit Startzeit an")
                    .addStringOption((option) => option.setName("zeit").setDescription("Deutsche Zeit, etwa 20:00").setRequired(true).setMaxLength(5))
                    .addStringOption((option) => option.setName("datum").setDescription("Etwa 14.11.2026. Leer heißt heute, ist die Zeit vorbei, morgen").setMaxLength(10))
            )
            .addSubcommand((sub) => sub.setName("start").setDescription("Startet den Abend sofort"))
            .addSubcommand((sub) => sub.setName("beenden").setDescription("Beendet den Abend, die Übersicht kommt in den Moderator-Kanal"))
            .addSubcommand((sub) => sub.setName("status").setDescription("Wo der Abend gerade steht"));
    }

    async Execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.inCachedGuild()) return;
        if (!(await this.client.settings.Of(interaction.guildId)).modules.includes(ROULETTE_MODULE)) return this.Say(interaction, "Rocket Roulette ist auf diesem Server aus.");

        const service = this.client.rouletteService;
        const what = interaction.options.getSubcommand();
        const actor: IRouletteActor = { id: interaction.user.id, name: interaction.member.displayName, member: interaction.member };

        try {
            if (what === "status") return await this.Say(interaction, await this.Status(interaction.guildId));

            if (what === "planen") {
                const at = StartTime(interaction.options.getString("zeit", true), interaction.options.getString("datum"), Date.now());

                if (at === null) return await this.Say(interaction, "Die Zeit verstehe ich nicht. Schreib sie wie 20:00 und das Datum wie 14.11.2026, nicht in der Vergangenheit.");

                // Ankündigung und Steuerkarte sind Bilder, das dauert länger als Discord wartet.
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                const evening = await service.Plan(interaction.guild, actor, at);

                return await this.Say(interaction, `🎰 Geplant für <t:${Math.floor(evening.startsAt / 1000)}:F> (<t:${Math.floor(evening.startsAt / 1000)}:R>). Die Ankündigung steht im Info-Kanal, die Steuerkarte im Moderator-Kanal.`);
            }

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            if (what === "start") {
                const planned = await this.client.rouletteEvenings.ActiveOf(interaction.guildId);

                if (planned?.status === "running") return await this.Say(interaction, "Der Abend läuft schon. Die Runden startest du über die Steuerkarte.");
                if (planned) {
                    if (!(await service.CanControl(interaction.member))) throw new RouletteError("Das dürfen nur die Moderatoren von Rocket Roulette.");
                    await service.Start(interaction.guild, planned.id);
                } else {
                    await service.Plan(interaction.guild, actor, Date.now());
                }

                return await this.Say(interaction, "▶️ Der Abend läuft. Wer im Warteraum saß, sitzt jetzt im Treffpunkt. Runde 1 lost du über die Steuerkarte aus.");
            }

            await service.End(interaction.guild, actor);
            await this.Say(interaction, "Der Abend ist beendet. Die Übersicht steht im Moderator-Kanal.");
        } catch (error) {
            if (!(error instanceof RouletteError)) throw error;

            await this.Say(interaction, error.message);
        }
    }

    private async Status(guildId: string): Promise<string> {
        const evening = await this.client.rouletteEvenings.ActiveOf(guildId);

        if (!evening) return "Gerade ist kein Rocket Roulette geplant.";

        const start = Math.floor(evening.startsAt / 1000);

        if (evening.status === "planned") return `🎰 Geplant für <t:${start}:F> (<t:${start}:R>).`;

        const round = await this.client.rouletteRounds.Current(evening.id);

        if (!round || round.status === "ended" || round.status === "aborted" || !evening.round) return `🎰 Läuft seit <t:${start}:R>. Gerade läuft keine Runde.`;

        const open = round.lobbies.filter((lobby) => lobby.openedAt).length;

        return `🎰 Läuft seit <t:${start}:R>. Runde ${round.number}: ${round.lobbies.length} Lobbys, ${open} davon offen${round.status === "drawing" ? ", ein Platz ist noch frei" : ""}.`;
    }

    private async Say(interaction: ChatInputCommandInteraction, content: string): Promise<void> {
        if (interaction.deferred || interaction.replied) await interaction.editReply({ content, allowedMentions: { parse: [] } });
        else await interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    }
}
