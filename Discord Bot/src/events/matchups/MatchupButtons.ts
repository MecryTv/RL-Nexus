import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    Events,
    Interaction,
    InteractionReplyOptions,
    LabelBuilder,
    MessageFlags,
    ModalBuilder,
    ModalSubmitInteraction,
    StringSelectMenuInteraction,
    TextInputBuilder,
    TextInputStyle,
} from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import { KICKOFF_HELP, MATCHUP_NO_RIGHT, MATCHUPS_MODULE, MATCHUPS_PREFIX, MatchupState, ParseKickoff } from "../../constants/Matchups";
import { MatchupError } from "../../services/MatchupService";

type MatchupInteraction = ButtonInteraction<"cached"> | StringSelectMenuInteraction<"cached"> | ModalSubmitInteraction<"cached">;

/** Ein Zahlenfeld im Ergebnis-Fenster, beschriftet mit dem Team. */
function ScoreField(id: string, label: string, value: number | undefined): LabelBuilder {
    const input = new TextInputBuilder().setCustomId(id).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(2);

    if (value !== undefined) input.setValue(String(value));

    return new LabelBuilder().setLabel(label.slice(0, 45)).setTextInputComponent(input);
}

/**
 * Die Knöpfe unter den Matchup-Nachrichten, das Menü aus /matchup liste und
 * die Fenster dazu (Plan 28): Ergebnis eintragen, Zeit ändern, Absagen. Die
 * Nachricht im Kanal sieht jeder - deshalb prüft jeder Klick das Recht neu.
 */
export default class MatchupButtons extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.InteractionCreate,
            description: "Ergebnis, Zeit und Absage für Matchups in Discord",
            once: false,
        });
    }

    async Execute(interaction: Interaction): Promise<void> {
        if (!interaction.isButton() && !interaction.isStringSelectMenu() && !interaction.isModalSubmit()) return;
        if (!interaction.customId.startsWith(`${MATCHUPS_PREFIX}:`) || !interaction.inCachedGuild()) return;

        try {
            await this.Handle(interaction);
        } catch (error) {
            if (error instanceof MatchupError) {
                await this.Answer(interaction, error.message).catch(() => undefined);

                return;
            }

            const normalized = error instanceof Error ? error : new Error(String(error));

            await this.client.guardian.ReportError(normalized, interaction, `Matchup-Knopf: ${interaction.customId}`);
        }
    }

    /** Eine Antwort nur für den, der geklickt hat - auch nach dem Aufschieben. */
    private async Answer(interaction: MatchupInteraction, content: string, components: InteractionReplyOptions["components"] = []): Promise<void> {
        if (interaction.deferred && !interaction.replied) {
            await interaction.editReply({ content, components, allowedMentions: { parse: [] } });

            return;
        }

        const options = { content, components, flags: MessageFlags.Ephemeral as const, allowedMentions: { parse: [] } };

        if (interaction.replied) await interaction.followUp(options);
        else await interaction.reply(options);
    }

    private async Handle(interaction: MatchupInteraction): Promise<void> {
        const [, action, raw] = interaction.customId.split(":");
        const { guild, member } = interaction;
        const service = this.client.matchupService;

        if (!(await this.client.settings.Of(guild.id)).modules.includes(MATCHUPS_MODULE)) return this.Answer(interaction, "Matchups sind auf diesem Server ausgeschaltet.");

        const id = interaction.isStringSelectMenu() ? Number(interaction.values[0]) : Number(raw);
        const matchup = await service.Get(guild.id, id);

        if (!(await service.CanEdit(guild, member, matchup))) return this.Answer(interaction, MATCHUP_NO_RIGHT);

        const state = MatchupState(matchup, Date.now());

        switch (action) {
            case "pick":
            case "manage":
                await interaction.reply(await service.ManageView(guild, matchup));

                return;

            case "report": {
                const settings = await service.Settings(guild.id);

                if (!settings.results || !settings.discordResults) return this.Answer(interaction, "Ergebnisse werden auf diesem Server nicht in Discord eingetragen.");
                if (state === "cancel") return this.Answer(interaction, "Diese Partie ist abgesagt.");
                if (state === "soon") return this.Answer(interaction, "Ergebnisse gibt es nach dem Anpfiff.");
                if (!interaction.isButton()) return;

                await interaction.showModal(
                    new ModalBuilder()
                        .setCustomId(`${MATCHUPS_PREFIX}:reportform:${matchup.id}`)
                        .setTitle(state === "done" ? "Ergebnis ändern" : "Ergebnis eintragen")
                        .addLabelComponents(ScoreField("us", matchup.teamName, matchup.score?.us), ScoreField("them", matchup.opponent, matchup.score?.them))
                );

                return;
            }

            case "reportform": {
                if (!interaction.isModalSubmit()) return;

                // Eintragen zieht Ankündigung und Ergebnis nach - das kann länger als die 3 Sekunden dauern, die Discord wartet.
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                await service.Report(guild, member, matchup.id, interaction.fields.getTextInputValue("us"), interaction.fields.getTextInputValue("them"));

                const { channelId } = await service.Settings(guild.id);

                return this.Answer(interaction, channelId ? `✅ Eingetragen. Die Ankündigung steht in <#${channelId}>.` : "✅ Eingetragen.");
            }

            case "time": {
                if (!interaction.isButton()) return;

                await interaction.showModal(
                    new ModalBuilder()
                        .setCustomId(`${MATCHUPS_PREFIX}:timeform:${matchup.id}`)
                        .setTitle("Zeit ändern")
                        .addLabelComponents(
                            new LabelBuilder()
                                .setLabel("Neuer Anpfiff")
                                .setDescription("Deutsche Zeit, etwa „morgen 20:00“ oder „31.10. 19:30“")
                                .setTextInputComponent(new TextInputBuilder().setCustomId("wann").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(40).setPlaceholder("morgen 20:00"))
                        )
                );

                return;
            }

            case "timeform": {
                if (!interaction.isModalSubmit()) return;

                await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                const at = ParseKickoff(interaction.fields.getTextInputValue("wann"), Date.now());

                if (at === null) return this.Answer(interaction, KICKOFF_HELP);

                const saved = await service.Save(guild, member, matchup.id, { at });

                return this.Answer(interaction, `✅ Neuer Anpfiff: <t:${Math.floor(saved.at / 1000)}:F>. Die Ankündigung ist nachgezogen.`);
            }

            case "cancel":
                if (state === "cancel") return this.Answer(interaction, "Diese Partie ist schon abgesagt.");

                return this.Answer(interaction, `**${matchup.teamName} vs. ${matchup.opponent}** absagen? Die Ankündigung bleibt stehen und zeigt „Abgesagt“.`, [
                    new ActionRowBuilder<ButtonBuilder>().addComponents(
                        new ButtonBuilder().setCustomId(`${MATCHUPS_PREFIX}:cancelyes:${matchup.id}`).setStyle(ButtonStyle.Danger).setLabel("Wirklich absagen?")
                    ),
                ]);

            case "cancelyes":
                if (!interaction.isButton()) return;

                await interaction.deferUpdate();
                await service.Cancel(guild, member, matchup.id);
                await interaction.editReply({ content: "❌ Abgesagt. Die Ankündigung im Kanal zeigt es jetzt.", components: [] });

                return;
        }
    }
}
