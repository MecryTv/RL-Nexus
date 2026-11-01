import { ActionRowBuilder, Interaction, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import BotClient from "../../client/BotClient";
import { StaffGrantCard } from "../../builder/StaffGrantView";
import { DASHBOARD_PATH } from "../../constants/Dashboard";
import { DM_EDIT_MS } from "../../constants/StaffGrant";
import { IStaffGrant } from "../../interfaces/services/staffgrant/IStaffGrant";
import { IStaffDm } from "../StaffGrantService";
import { StaffGrantError } from "./Machine";
import { ParseDuration } from "./Rules";
import logger from "../../utils/logger";

/**
 * Die DM an die Gefragten (W-0011): senden, bei jedem Zustand bearbeiten,
 * Knöpfe und Menüs auswerten. Die Wahl im Menü (Dauer, private Bereiche)
 * merkt sich die Klasse je Anfrage und Person, bis „Erlauben“ sie abholt.
 */
export default class StaffGrantDm implements IStaffDm {
    private readonly client: BotClient;
    private readonly choices = new Map<string, { minutes: number; private: boolean }>();
    private readonly lastEdit = new Map<number, number>();
    private readonly timers = new Map<number, NodeJS.Timeout>();

    constructor(client: BotClient) {
        this.client = client;
    }

    async Send(grant: IStaffGrant, userId: string): Promise<{ channelId: string; messageId: string }> {
        const user = await this.client.users.fetch(userId);
        const message = await user.send(await this.Card(grant, userId));

        return { channelId: message.channelId, messageId: message.id };
    }

    /** Ein neuer Zustand: alle DMs sofort. */
    Changed(grant: IStaffGrant): void {
        const timer = this.timers.get(grant.id);

        if (timer) clearTimeout(timer);

        this.timers.delete(grant.id);

        if (grant.status !== "open" && grant.status !== "active") {
            for (const key of [...this.choices.keys()]) if (key.startsWith(`${grant.id}:`)) this.choices.delete(key);

            this.lastEdit.delete(grant.id);
        }

        void this.EditAll(grant);
    }

    /** Staff hat etwas geändert: „Bisher geändert“ beim Erlaubenden, höchstens alle 30 Sekunden. */
    Logged(grant: IStaffGrant): void {
        if (grant.status !== "active" || !grant.answeredBy || this.timers.has(grant.id)) return;

        const wait = Math.max(0, (this.lastEdit.get(grant.id) ?? 0) + DM_EDIT_MS - Date.now());

        this.timers.set(
            grant.id,
            setTimeout(() => {
                this.timers.delete(grant.id);

                const current = this.client.staffGrantService.Get(grant.id);

                if (current?.answeredBy) void this.Edit(current, current.answeredBy);
            }, wait)
        );
    }

    async OnInteraction(interaction: Interaction): Promise<void> {
        if (!(interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) || !interaction.customId.startsWith("sg:")) return;

        const [, what, raw] = interaction.customId.split(":");
        const id = Number(raw);
        const service = this.client.staffGrantService;
        const grant = service.Get(id);
        const userId = interaction.user.id;

        if (!grant) {
            await interaction.reply({ content: "Diese Anfrage ist schon vorbei.", flags: MessageFlags.Ephemeral });

            return;
        }

        if (!grant.asked.includes(userId)) {
            await interaction.reply({ content: "Diese Anfrage ist nicht an dich.", flags: MessageFlags.Ephemeral });

            return;
        }

        const key = `${id}:${userId}`;
        const choice = this.Choice(grant, userId);

        if (interaction.isStringSelectMenu()) {
            const value = interaction.values[0];

            if (what === "dur" && value === "custom") {
                await interaction.showModal(TimeModal(id));

                return;
            }

            if (what === "dur") this.choices.set(key, { ...choice, minutes: Number(value) });
            else this.choices.set(key, { ...choice, private: value === "yes" });

            await interaction.update(await this.Card(grant, userId));

            return;
        }

        if (interaction.isModalSubmit()) {
            const minutes = ParseDuration(interaction.fields.getTextInputValue("minutes"));

            if (minutes === null) {
                await interaction.reply({ content: "Bitte 10 Minuten bis 24 Stunden.", flags: MessageFlags.Ephemeral });

                return;
            }

            this.choices.set(key, { ...choice, minutes });

            if (interaction.isFromMessage()) await interaction.update(await this.Card(grant, userId));
            else await interaction.reply({ content: "Gemerkt.", flags: MessageFlags.Ephemeral });

            return;
        }

        // Knöpfe: Die Karte bearbeitet danach Changed(), hier nur bestätigen.
        await interaction.deferUpdate();

        try {
            if (what === "yes") await service.Answer(id, userId, true, choice.minutes, choice.private);
            else if (what === "no") await service.Answer(id, userId, false, choice.minutes, false);
            else if (what === "end") await service.End(id, userId);
            else if (what === "more") await service.Extend(id, userId);
            else if (what === "pyes") await service.AnswerPrivate(id, userId, true);
            else if (what === "pno") await service.AnswerPrivate(id, userId, false);
        } catch (error) {
            if (!(error instanceof StaffGrantError)) throw error;

            await interaction.followUp({ content: error.message, flags: MessageFlags.Ephemeral });
        }
    }

    private Choice(grant: IStaffGrant, userId: string): { minutes: number; private: boolean } {
        return this.choices.get(`${grant.id}:${userId}`) ?? { minutes: grant.minutes, private: false };
    }

    private async Card(grant: IStaffGrant, userId: string) {
        const service = this.client.staffGrantService;

        return StaffGrantCard({
            grant,
            forUser: userId,
            guildName: this.client.guilds.cache.get(grant.guildId)?.name ?? grant.guildId,
            staffAvatar: this.client.users.cache.get(grant.staffId)?.displayAvatarURL({ extension: "png", size: 128 }) ?? null,
            log: grant.status === "open" ? [] : await service.LogOf(grant.id, 20).catch(() => []),
            choice: this.Choice(grant, userId),
            dashboardUrl: `${this.client.server.BaseURL}${DASHBOARD_PATH}/guild/${grant.guildId}`,
            names: Object.fromEntries(grant.asked.map((id) => [id, service.NameOf(grant.guildId, id)])),
        });
    }

    private async EditAll(grant: IStaffGrant): Promise<void> {
        for (const userId of Object.keys(grant.dms)) await this.Edit(grant, userId);
    }

    private async Edit(grant: IStaffGrant, userId: string): Promise<void> {
        const ref = grant.dms[userId];

        if (!ref) return;

        try {
            const channel = await this.client.channels.fetch(ref.channelId);

            if (!channel?.isTextBased()) return;

            const message = await channel.messages.fetch(ref.messageId);

            await message.edit(await this.Card(grant, userId));

            if (userId === grant.answeredBy) this.lastEdit.set(grant.id, Date.now());
        } catch (error) {
            logger.warn(`🔐 DM der Staff-Freigabe ${grant.id} an ${userId} nicht bearbeitet - ${String(error)}`);
        }
    }
}

function TimeModal(id: number): ModalBuilder {
    return new ModalBuilder()
        .setCustomId(`sg:time:${id}`)
        .setTitle("Wie lange darf der Staff bearbeiten?")
        .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder().setCustomId("minutes").setLabel("Dauer").setStyle(TextInputStyle.Short).setPlaceholder("z. B. 45 Min., 2 Std. oder 1:30").setRequired(true).setMaxLength(20)
            )
        );
}
