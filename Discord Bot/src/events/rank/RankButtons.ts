import { ButtonInteraction, Collection, Events, Interaction, MessageFlags } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import { RANK_PREFIX, RankMessage } from "../../builder/RankView";
import { RankCardPage } from "../../builder/RankCard";
import { IPrimeProfile } from "../../interfaces/services/prime/IPrimeService";
import { ClosedText, ModuleOpen } from "../../utils/moduleFlags";

/** Jeder Klick zeichnet die Karte neu (knapp eine Sekunde) - nicht öfter als alle drei Sekunden je Nutzer. */
const COOLDOWN_MS = 3000;
const COOLDOWN_KEY = "rank:button";

/** rk:<ranked|extra>:<Konto-ID>:<Discord-ID>. Konto-IDs sind bei Epic 32 Hex-Zeichen, bei anderen Plattformen anders. */
const CUSTOM_ID = /^rk:(ranked|extra):([\w-]{1,64}):(\d{1,20})$/;

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

        // Merkt sich, ob die eigene, nur sichtbare Antwort eines fremden Klicks
        // aussteht. Nach deferUpdate (der Fragende selbst) wäre deleteReply die
        // ganze Karte - das darf der Fehlerweg nie treffen.
        const state = { ownReply: false };

        try {
            await this.Switch(interaction, state);
        } catch (error) {
            const normalized = error instanceof Error ? error : new Error(String(error));

            // Die verzögerte Antwort bliebe sonst bei „denkt nach…“ stehen -
            // Guardian schickt seine Meldung als neue Nachricht hinterher.
            if (state.ownReply) await interaction.deleteReply().catch(() => undefined);

            await this.client.guardian.ReportError(normalized, interaction, `Rang-Karten-Knopf: ${interaction.customId}`);
        }
    }

    private async Switch(interaction: ButtonInteraction, state: { ownReply: boolean }): Promise<void> {
        const match = CUSTOM_ID.exec(interaction.customId);

        if (!match) {
            await interaction.reply({ content: "Dieser Knopf ist veraltet. Ruf `/rank` einfach neu auf.", flags: MessageFlags.Ephemeral });

            return;
        }

        // W-0131: RL Tracking im Admin Dashboard abgeschaltet - auch alte Karten blättern nicht mehr.
        if (!ModuleOpen("rl-tracking", interaction.guildId, interaction.user.id)) {
            await interaction.reply({ content: ClosedText("rl-tracking"), flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });

            return;
        }

        const page = match[1] as RankCardPage;
        const accountId = match[2] as string;
        const mine = interaction.user.id === match[3];

        if (!this.Allowed(interaction.user.id)) {
            await interaction.reply({ content: "Kurz warten, die Karte wird gerade neu gezeichnet.", flags: MessageFlags.Ephemeral });

            return;
        }

        if (mine) {
            await interaction.deferUpdate();
        } else {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            state.ownReply = true;
        }

        // Prime hält die Antwort zehn Minuten vor, auch unter der Konto-ID - der
        // Wechsel kostet also meist keine neue Anfrage, nur das Zeichnen.
        let profile: IPrimeProfile | null;
        let content: string | null = null;

        try {
            profile = await this.client.primeService.Profile(accountId);

            if (!profile) content = "Dieses Epic-Konto gibt es nicht mehr.";
        } catch {
            profile = null;
            content = "Rocket League antwortet gerade nicht. Versuch es gleich noch einmal.";
        }

        if (!profile) {
            if (mine) await interaction.followUp({ content: content ?? "", flags: MessageFlags.Ephemeral });
            else await interaction.editReply({ content });

            return;
        }

        // Wie bei /rank search: steht ein verknüpfter Discord-Nutzer hinter dem
        // Konto, zeigt die Karte seinen Namen und sein Bild. Fällt die Datenbank
        // aus, bleibt die Karte eben ohne Namen.
        const owner = this.client.databaseService.Ready ? await this.client.accounts.TrustedOwner("epic", profile.accountId).catch(() => null) : null;
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

    /** Abklingzeit je Nutzer, im selben Speicher wie die der Befehle. */
    private Allowed(userId: string): boolean {
        const { cooldowns } = this.client;

        if (!cooldowns.has(COOLDOWN_KEY)) cooldowns.set(COOLDOWN_KEY, new Collection());

        const timestamps = cooldowns.get(COOLDOWN_KEY)!;
        const now = Date.now();

        if (now < (timestamps.get(userId) ?? 0) + COOLDOWN_MS) return false;

        timestamps.set(userId, now);
        setTimeout(() => timestamps.delete(userId), COOLDOWN_MS);

        return true;
    }
}
