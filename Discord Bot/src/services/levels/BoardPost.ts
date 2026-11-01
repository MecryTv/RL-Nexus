/**
 * Level System, Plan 43: die Rangliste als feste Nachricht in einem Kanal,
 * Seite 1 des gewählten Zeitraums. Alle 10 Minuten ein Blick
 * (runnables/LevelBoards.ts): neu gezeichnet und bearbeitet wird nur, wenn
 * sich der Fingerabdruck geändert hat; fehlt die Nachricht, kommt sie neu.
 * Was schiefgeht, steht in level_board_posts.error fürs Dashboard.
 * Siehe docs/Levels.md.
 */
import { createHash } from "node:crypto";
import { ChannelType, Guild, Message, SendableChannels } from "discord.js";
import BotClient from "../../client/BotClient";
import { IBoardPage, ILevelBoardPost, ILevelSettings } from "../../interfaces/services/levels/ILevels";
import { LEVELS_MODULE } from "../LevelService";
import { BoardChannelPayload } from "./BoardMessage";
import logger from "../../utils/logger";

export type BoardPostResult = "unchanged" | "edited" | "sent" | "off" | "failed";

/** Was das Bild zeigt, kurz. designKey: alles außerhalb der Seite, das man im Bild sieht. */
export function BoardFingerprint(board: IBoardPage, designKey: string): string {
    const { period, page, pages, total, range, entries } = board;

    return createHash("sha1").update(JSON.stringify([designKey, period, page, pages, total, range, entries])).digest("hex");
}

/** Gestaltung, Name und Icon des Servers - ändert sich eins davon, wird neu gezeichnet. */
function DesignKey(client: BotClient, guild: Guild, settings: ILevelSettings): string {
    return JSON.stringify([client.levelService.BoardDesign(settings), guild.name, guild.icon ?? null]);
}

/** Wirklich weg (Nachricht oder Kanal) - kein Aussetzer bei Discord. */
function Gone(error: unknown): boolean {
    const code = (error as { code?: unknown }).code;

    return code === 10003 || code === 10008;
}

async function Channel(guild: Guild, id: string): Promise<SendableChannels | null> {
    const found = guild.channels.cache.get(id) ?? (await guild.channels.fetch(id).catch(() => null));

    return found?.isTextBased() && found.type !== ChannelType.GuildStageVoice ? (found as SendableChannels) : null;
}

/** Die alte Nachricht des Bots löschen, soweit sie noch da ist. */
async function Remove(guild: Guild, post: ILevelBoardPost): Promise<void> {
    if (!post.messageId) return;

    const channel = await Channel(guild, post.channelId);
    const message = await channel?.messages.fetch(post.messageId).catch(() => null);

    await message?.delete().catch(() => undefined);
}

/**
 * Ein Blick auf die Rangliste im Kanal. Aus, Modul aus oder anderer Kanal:
 * die alte Nachricht verschwindet. force: neu zeichnen, auch wenn sich nichts
 * geändert hat („Jetzt neu zeichnen“ im Dashboard).
 */
export async function PostBoard(client: BotClient, guild: Guild, settings: ILevelSettings, force: boolean): Promise<BoardPostResult> {
    const active = (await client.settings.Of(guild.id)).modules.includes(LEVELS_MODULE);
    const want = active ? settings.boardPost : null;
    const before = await client.levelBoardPosts.Of(guild.id);

    if (before && (!want?.on || before.channelId !== want.channelId)) {
        await Remove(guild, before);
        await client.levelBoardPosts.Remove(guild.id);
    }

    if (!want?.on || !want.channelId) return "off";

    const channelId = want.channelId;
    const current = before?.channelId === channelId ? before : null;
    // updatedAt heißt „zuletzt gezeichnet“ - ein Fehler ändert es nicht.
    const fail = async (error: string): Promise<"failed"> => {
        logger.warn(`📈 Rangliste im Kanal auf ${guild.id}: ${error}`);
        await client.levelBoardPosts.Set({ guildId: guild.id, channelId, messageId: current?.messageId ?? null, fingerprint: current?.fingerprint ?? "", error, updatedAt: current?.updatedAt ?? Date.now() });

        return "failed";
    };
    const channel = await Channel(guild, channelId);

    if (!channel) return fail("Den Kanal gibt es nicht mehr.");

    let message: Message | null = null;

    if (current?.messageId) {
        try {
            message = await channel.messages.fetch(current.messageId);
        } catch (error) {
            // Nur wenn sie wirklich weg ist, kommt eine neue - bei einem Aussetzer stünde sie sonst doppelt da.
            if (!Gone(error)) {
                const code = (error as { code?: unknown }).code;

                return fail(code === 50001 || code === 50013 ? "Ich darf den Kanal nicht sehen oder den Verlauf nicht lesen." : "Discord hat nicht geantwortet. Beim nächsten Blick versuche ich es wieder.");
            }
        }
    }

    try {
        const board = await client.levelService.Board(guild, want.period, 1, null, await client.levelService.PerPage(guild.id));
        const fingerprint = BoardFingerprint(board, DesignKey(client, guild, settings));

        if (message && current && !force && current.fingerprint === fingerprint) {
            if (current.error) await client.levelBoardPosts.Set({ ...current, error: null });

            return "unchanged";
        }

        const payload = await BoardChannelPayload(client, guild, board);
        const saved = (messageId: string) => client.levelBoardPosts.Set({ guildId: guild.id, channelId, messageId, fingerprint, error: null, updatedAt: Date.now() });

        if (message) {
            // Von Bild zu Text und zurück: was nicht dazugehört, kommt weg.
            const edited = await message
                .edit("content" in payload ? { content: payload.content, files: [], attachments: [], components: [] } : { content: null, ...payload, attachments: [] })
                .then(() => true)
                .catch(() => false);

            if (!edited) return fail("Ich darf die Nachricht nicht bearbeiten (Kanal sehen, Dateien anhängen).");

            await saved(message.id);

            return "edited";
        }

        const sent = await channel.send(payload).catch(() => null);

        if (!sent) return fail("Ich darf im Kanal nicht posten (Nachrichten senden, Dateien anhängen).");

        await saved(sent.id);

        return "sent";
    } catch (error) {
        logger.warn(`📈 Rangliste im Kanal auf ${guild.id} abgebrochen - ${String(error)}`);

        return fail("Beim Zeichnen ist etwas schiefgegangen. Beim nächsten Blick versuche ich es wieder.");
    }
}
