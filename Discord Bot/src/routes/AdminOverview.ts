import { readFileSync } from "node:fs";
import path from "path";
import { version as discordVersion } from "discord.js";
import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import { ADMIN_ENV_KEYS, HasAdminScope } from "../constants/Admin";
import Route from "../structures/Route";
import logger from "../utils/logger";

/** Einmal beim Laden: die Version ändert sich nur mit einem neuen Abbild. */
const APP_VERSION = ReadVersion();

function ReadVersion(): string {
    try {
        return JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8")).version ?? "?";
    } catch {
        return "?";
    }
}

export default class AdminOverview extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "GET",
            path: "/admin/overview",
            description: "Status, Server und Technik für das Admin Dashboard",
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        if (!HasAdminScope(request)) return reply.code(403).send({ error: "Forbidden" });

        const guilds = [...this.client.guilds.cache.values()];
        let modules = new Map<string, string[]>();

        try {
            modules = await this.client.settings.ModulesOf(guilds.map((guild) => guild.id));
        } catch (error) {
            // Ohne Datenbank fehlen nur die Module, der Rest der Antwort stimmt trotzdem.
            logger.warn(`[AdminOverview] Module nicht lesbar: ${String(error)}`);
        }

        const ping = this.client.ws.ping;
        const memory = process.memoryUsage();

        return {
            ready: this.client.isReady(),
            ping: ping >= 0 ? Math.round(ping) : null,
            uptime: Math.round(process.uptime()),
            startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
            memory: { rss: memory.rss, heapUsed: memory.heapUsed },
            versions: { node: process.version, discordjs: discordVersion, app: APP_VERSION },
            guilds: guilds.map((guild) => ({
                id: guild.id,
                name: guild.name,
                icon: guild.iconURL({ size: 64 }),
                members: guild.memberCount,
                joinedAt: guild.joinedAt?.toISOString() ?? null,
                createdAt: guild.createdAt.toISOString(),
                ownerId: guild.ownerId,
                modules: modules.get(guild.id) ?? [],
            })),
            env: Object.fromEntries(ADMIN_ENV_KEYS.map((key) => [key, Boolean(process.env[key]?.trim())])),
        };
    }
}
