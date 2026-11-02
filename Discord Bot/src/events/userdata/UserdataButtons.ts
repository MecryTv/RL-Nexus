import { Events, Interaction, MessageFlags } from "discord.js";
import BotClient from "../../client/BotClient";
import Event from "../../structures/Event";
import { CreateToken } from "../../utils/jwt";

/**
 * Die Knöpfe der Lösch-DM (W-0051, Teil 3b): „Kopie meiner Daten“ (ud:copy:<id>)
 * und „Das war ich nicht“ (ud:stop:<id>). Entschieden wird im Admin Dashboard
 * (POST ADMIN_INTERNAL_URL/internal/userdata/<id>/<action>, Token mit Scope
 * "userdata" und der klickenden Person als Subjekt). Dort steht, wem die
 * Löschung gehört und ob sie noch läuft; der Bot zeigt nur den Satz.
 */

const TOKEN_LIFETIME = 60_000;
export const UNREACHABLE = "Gerade nicht erreichbar, versuch es in ein paar Minuten noch einmal.";

/** Fragt das Admin Dashboard und gibt den Satz für die Person zurück. */
export async function AskAdmin(baseUrl: string, secret: string, userId: string, deletion: number, action: "copy" | "stop"): Promise<string> {
    try {
        const response = await fetch(`${baseUrl}/internal/userdata/${deletion}/${action}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${CreateToken(secret, `discord:${userId}`, TOKEN_LIFETIME, ["userdata"])}` },
            // Die Kopie zeichnet ein Bild und packt alle Daten: großzügig warten.
            signal: AbortSignal.timeout(30_000),
        });
        const body = (await response.json().catch(() => ({}))) as { message?: unknown; error?: unknown };

        if (typeof body.message === "string") return body.message;
        if (typeof body.error === "string") return body.error;

        return UNREACHABLE;
    } catch {
        return UNREACHABLE;
    }
}

export default class UserdataButtons extends Event {
    constructor(client: BotClient) {
        super(client, {
            name: Events.InteractionCreate,
            description: "Knöpfe der DM zur Löschung von Nutzerdaten",
            once: false,
        });
    }

    async Execute(interaction: Interaction): Promise<void> {
        if (!interaction.isButton() || !interaction.customId.startsWith("ud:")) return;

        const [, action, id] = interaction.customId.split(":");
        if ((action !== "copy" && action !== "stop") || !/^\d{1,10}$/.test(id ?? "")) return;

        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const base = this.client.config.ADMIN_INTERNAL_URL;
            const message = base ? await AskAdmin(base, this.client.config.SERVER_JWT_SECRET, interaction.user.id, Number(id), action) : UNREACHABLE;

            await interaction.editReply({ content: message });
        } catch (error) {
            const normalized = error instanceof Error ? error : new Error(String(error));

            await this.client.guardian.ReportError(normalized, interaction, `Lösch-DM: ${interaction.customId}`);
        }
    }
}
