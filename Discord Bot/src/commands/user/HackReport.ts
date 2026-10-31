import { ApplicationCommandType, ChatInputCommandInteraction, ContextMenuCommandBuilder, InteractionContextType, MessageFlags, UserContextMenuCommandInteraction } from "discord.js";
import BotClient from "../../client/BotClient";
import Command from "../../structures/Command";
import Category from "../../enums/Category";
import { MODULE_OFF } from "../../constants/AntiVillain";

/**
 * „Hack melden“ (Plan 31): Rechtsklick auf ein Mitglied → Apps. Jede Meldung gibt
 * dem Wächter „Meldungen“ von Anti Villain Punkte. Die gemeldete Person erfährt
 * nicht, wer gemeldet hat.
 */
export default class HackReport extends Command {
    constructor(client: BotClient) {
        super(client, { name: "Hack melden", description: "Einen wohl gekaperten Account an das Team melden", category: Category.User, cooldown: 10, developerOnly: false, module: "anti-villain" });

        this.data = new ContextMenuCommandBuilder().setName(this.name).setType(ApplicationCommandType.User).setContexts(InteractionContextType.Guild);
    }

    async Execute(_interaction: ChatInputCommandInteraction): Promise<void> {}

    async ExecuteUser(interaction: UserContextMenuCommandInteraction): Promise<void> {
        const say = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

        if (!interaction.inCachedGuild() || !interaction.targetMember) return void (await say("Das geht nur auf einem Server."));

        const result = await this.client.antiVillainService.Report(interaction.guild, interaction.member, interaction.targetMember);

        if (result === "off") return void (await say(MODULE_OFF));
        if (result === "again") return void (await say("Du hast diese Person in den letzten 24 Stunden schon gemeldet."));

        await say("Danke, das Team schaut es sich an.");
    }
}
