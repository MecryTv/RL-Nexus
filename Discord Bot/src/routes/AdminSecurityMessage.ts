import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import { HasAdminScope } from "../constants/Admin";
import { SNOWFLAKE } from "../constants/Discord";
import Route from "../structures/Route";
import logger from "../utils/logger";

/** Bilder einer Nachricht, die als Beleg mitgesichert werden. */
const IMAGES = 3;
const IMAGE_MAX = 2 * 1024 * 1024;

/**
 * W-0057, Belege: Das Admin Dashboard schickt einen Link zu einer
 * Discord-Nachricht, der Bot liest Text, Verfasser, Kanal, Zeit und Bilder.
 * Die Bilder kommen als data-URL mit, weil Discords Links nach einiger Zeit
 * ablaufen.
 */
export default class AdminSecurityMessage extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "GET",
            path: "/admin/security/message",
            description: "Eine Discord-Nachricht als Beleg",
            rateLimit: { max: 30, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        if (!HasAdminScope(request)) return reply.code(403).send({ error: "Forbidden" });
        if (!this.client.isReady()) return reply.code(503).send({ error: "Der Bot startet noch." });

        const { channel: channelId = "", message: messageId = "" } = request.query as { channel?: string; message?: string };
        if (!SNOWFLAKE.test(channelId) || !SNOWFLAKE.test(messageId)) return reply.code(400).send({ error: "Ungültiger Link." });

        const channel = await this.client.channels.fetch(channelId).catch(() => null);
        const message = channel?.isTextBased() ? await channel.messages.fetch(messageId).catch(() => null) : null;

        if (!message) return reply.code(404).send({ error: "Nachricht nicht gefunden." });

        const images: { name: string; url: string }[] = [];

        for (const file of message.attachments.values()) {
            if (images.length >= IMAGES || !file.contentType?.startsWith("image/") || file.size > IMAGE_MAX) continue;

            try {
                const response = await fetch(file.url, { signal: AbortSignal.timeout(5_000) });
                if (!response.ok) continue;

                images.push({ name: file.name, url: `data:${file.contentType};base64,${Buffer.from(await response.arrayBuffer()).toString("base64")}` });
            } catch (error) {
                logger.warn(`🚫 Bild ${file.name} aus einem Beleg nicht geladen: ${String(error)}`);
            }
        }

        return {
            author: { id: message.author.id, name: message.author.globalName ?? message.author.username, handle: message.author.username },
            guild: message.guild ? { id: message.guild.id, name: message.guild.name } : null,
            channel: { id: channelId, name: "name" in message.channel && message.channel.name ? message.channel.name : null },
            content: message.content,
            at: message.createdAt.toISOString(),
            images,
        };
    }
}
