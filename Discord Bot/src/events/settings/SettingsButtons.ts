import { Events, Interaction, LabelBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import { IPanelView, OverviewView, PanelView } from "../../builder/SettingsView";
import { IsPanelModule, PANEL_MODULES } from "../../services/settings/registers";
import { IChange } from "../../services/settings/SettingsService";
import { PanelError, PanelId, ReadPanelId, StagesText } from "../../services/settings/SettingsModel";
import { IModStage } from "../../interfaces/services/moderation/IModeration";
import logger from "../../utils/logger";

/**
 * Menüs, Knöpfe und Fenster von /einstellungen (set:…). Jeder Klick tauscht den
 * Inhalt derselben Nachricht. Modul und Einstellung stecken in der ID, deshalb
 * gehen auch Knöpfe von vor einem Neustart - nur Rückgängig nicht.
 */
export default class SettingsButtons extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.InteractionCreate,
            description: "Menüs, Knöpfe und Fenster von /einstellungen",
            once: false,
        });
    }

    async Execute(interaction: Interaction): Promise<void> {
        if (!(interaction.isMessageComponent() || interaction.isModalSubmit()) || !interaction.inCachedGuild()) return;

        const target = ReadPanelId(interaction.customId);

        if (!target) return;

        const service = this.client.settingsPanel;
        const { guild, member } = interaction;
        const id = target.module;
        const done = (key: string, change: IChange): IPanelView => ({ done: { key, before: change.before, after: change.after }, warning: change.warning });

        try {
            if (!service.Can(member)) throw new PanelError("Einstellungen ändert nur, wer den Server verwaltet.");

            // Das Fenster muss die erste Antwort sein - alles andere bestätigt erst und zeichnet dann.
            if (target.step === "f" && interaction.isButton() && IsPanelModule(id) && target.key) {
                const field = PANEL_MODULES[id].sections.flatMap((section) => section.fields).find((candidate) => candidate.key === target.key);

                if (!field) throw new PanelError("Diese Einstellung gibt es nicht mehr.");

                const current = field.get(await PANEL_MODULES[id].load(this.client, guild));
                const value = field.kind === "stages" ? StagesText(current as IModStage[]) : String(current ?? "");
                const long = field.kind === "stages" || (field.max ?? 0) > 100;

                await interaction.showModal(
                    new ModalBuilder()
                        .setCustomId(PanelId("f", id, field.key))
                        .setTitle(field.label.slice(0, 45))
                        .addLabelComponents(
                            new LabelBuilder()
                                .setLabel(field.label.slice(0, 45))
                                .setDescription(field.hint.slice(0, 100))
                                .setTextInputComponent(
                                    new TextInputBuilder()
                                        .setCustomId("wert")
                                        .setStyle(long ? TextInputStyle.Paragraph : TextInputStyle.Short)
                                        .setRequired(field.kind !== "stages" && field.kind !== "text")
                                        .setMaxLength(field.kind === "number" ? 10 : Math.min(field.max ?? 4000, 4000))
                                        .setValue(value.slice(0, 4000))
                                )
                        )
                );

                return;
            }

            await interaction.deferUpdate();

            const show = async (view: Awaited<ReturnType<typeof PanelView>>) =>
                interaction.editReply({ ...view, attachments: [], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });

            if (target.step === "s" || !IsPanelModule(id ?? (interaction.isStringSelectMenu() ? interaction.values[0] : null))) {
                return void (await show(await OverviewView(guild, await service.Overview(guild), service.Link(guild, null))));
            }

            const module = IsPanelModule(id) ? id : (interaction.isStringSelectMenu() ? interaction.values[0] : "") as never;
            const key = target.key ?? "";
            let view: IPanelView = {};

            try {
                switch (target.step) {
                    case "w":
                        view = { selected: interaction.isStringSelectMenu() ? interaction.values[0] : undefined };
                        break;
                    case "c":
                    case "r":
                    case "o": {
                        const values = interaction.isAnySelectMenu() ? interaction.values : [];
                        const field = PANEL_MODULES[module].sections.flatMap((section) => section.fields).find((candidate) => candidate.key === key);
                        const many = field?.kind === "channels" || field?.kind === "roles";

                        view = done(key, await service.Change(guild, member, module, key, many ? values : (values[0] ?? null)));
                        break;
                    }
                    case "n":
                        view = done(key, await service.Change(guild, member, module, key, null));
                        break;
                    case "t":
                        view = done(key, await service.Change(guild, member, module, key, target.extra === "on"));
                        break;
                    case "f":
                        if (interaction.isModalSubmit()) view = done(key, await service.Change(guild, member, module, key, interaction.fields.getTextInputValue("wert")));
                        break;
                    case "u":
                        view = done(key, await service.Undo(guild, member, module, key));
                        break;
                    case "x":
                        await service.SetModule(guild, member, module, target.extra === "on");
                        view = { note: `⏻ ${PANEL_MODULES[module].name} ist jetzt ${target.extra === "on" ? "an" : "aus"}.` };
                        break;
                    case "p":
                        view = { note: `📨 Panel gesendet: ${await service.SendPanel(guild, member)}` };
                        break;
                }
            } catch (error) {
                if (!(error instanceof PanelError)) throw error;

                // Bei einer Ablehnung bleibt das Feld offen - man kann gleich nochmal.
                view = { error: error.message, selected: target.step === "u" || target.step === "x" || target.step === "p" ? undefined : key || undefined };
            }

            await show(await PanelView(await service.State(guild, module), view));
        } catch (error) {
            if (!(error instanceof PanelError)) logger.error(`⚙️ /einstellungen (${interaction.customId}) fehlgeschlagen`, error);

            const content = `❌ ${error instanceof PanelError ? error.message : "Da ging etwas schief – versuch es gleich nochmal."}`;

            if (interaction.deferred || interaction.replied) await interaction.followUp({ content, flags: MessageFlags.Ephemeral }).catch(() => undefined);
            else await interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => undefined);
        }
    }
}
