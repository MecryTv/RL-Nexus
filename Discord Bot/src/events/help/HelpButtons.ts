import { Events, Interaction } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import { HelpAreaView, HelpCommandView } from "../../builder/HelpView";
import { HELP_AREAS, HELP_PREFIX, HelpAreaId } from "../../constants/Help";

/**
 * Menüs und Knöpfe von /hilfe (hilfe:…). Jeder Klick tauscht den Inhalt
 * derselben Nachricht. Das Ziel steckt in der ID, deshalb gehen auch Knöpfe
 * von vor einem Neustart; was es nicht mehr gibt, führt zur Startseite.
 */
export default class HelpButtons extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.InteractionCreate,
            description: "Menüs und Knöpfe von /hilfe",
            once: false,
        });
    }

    async Execute(interaction: Interaction): Promise<void> {
        if (!(interaction.isButton() || interaction.isStringSelectMenu()) || !interaction.customId.startsWith(HELP_PREFIX) || !interaction.inCachedGuild()) return;

        try {
            const help = this.client.helpService;
            const developer = help.IsDeveloper(interaction.user.id);
            const entries = help.Entries(developer);
            const [kind, ...rest] = interaction.customId.slice(HELP_PREFIX.length).split(":");
            const value = interaction.isStringSelectMenu() ? (interaction.values[0] ?? "") : "";
            const isArea = (id: string): id is HelpAreaId => HELP_AREAS.some((area) => area.id === id);
            // Unterseiten zeigen kein Banner: die Datei der Startseite geht mit attachments: [] weg.
            const show = (payload: object) => interaction.update({ ...payload, attachments: [] });

            if (kind === "bereich" && isArea(value)) return void (await show(HelpAreaView(value, entries, await help.Context(interaction.guild))));
            if (kind === "a" && isArea(rest[0])) return void (await show(HelpAreaView(rest[0], entries, await help.Context(interaction.guild), Number(rest[1]) || 0)));

            if (kind === "befehl") {
                const found = help.Find(value, developer);

                if (found) return void (await show(HelpCommandView(found.entry, found.key, 0, await help.Context(interaction.guild))));
            }

            if (kind === "seite") {
                const [name, sub, page] = rest;
                const entry = entries.find((candidate) => candidate.name === name);
                const key = sub && sub !== "-" ? `${name} ${sub}` : null;

                if (entry && (key === null || entry.commands.some((command) => command.key === key))) {
                    return void (await show(HelpCommandView(entry, key, Number(page) || 0, await help.Context(interaction.guild))));
                }
            }

            // hilfe:start, oder ein Ziel, das es nicht mehr gibt.
            const name = (interaction.member as { displayName?: string } | null)?.displayName ?? interaction.user.username;

            await interaction.update({ ...(await help.Start(interaction.guild, name, developer)), attachments: [] });
        } catch (error) {
            const normalized = error instanceof Error ? error : new Error(String(error));

            await this.client.guardian.ReportError(normalized, interaction, `Hilfe: ${interaction.customId}`);
        }
    }
}
