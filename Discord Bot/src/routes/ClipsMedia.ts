import path from "path";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { FastifyReply, FastifyRequest } from "fastify";
import BotClient from "../client/BotClient";
import Route from "../structures/Route";
import { DASHBOARD_PATH } from "../constants/Dashboard";
import { SNOWFLAKE } from "../constants/Discord";
import { CLIP_TYPES, CLIPS_MODULE } from "../constants/Clips";
import { SessionOf } from "../utils/dashboard";

/**
 * Ein gesicherter Clip: /clips/<server>/video/<runde>/<datei>. Offen, wenn der
 * Server die öffentliche Seite freigibt; sonst nur für wer den Server verwaltet
 * (das Archiv im Dashboard). Mit Range-Anfragen - ohne die spielt Safari gar
 * nicht ab, und Vorspulen geht nirgends.
 */
export default class ClipsMedia extends Route {
    constructor(client: BotClient) {
        super(client, {
            method: "GET",
            path: `${DASHBOARD_PATH}/clips/:id/video/:round/:file`,
            description: "Liefert gesicherte Clips von Clips der Woche",
            prefixed: false,
            requiresAuth: false,
            rateLimit: { max: 600, timeWindow: "1 minute" },
        });
    }

    async Handle(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
        const { id, round, file } = request.params as { id?: string; round?: string; file?: string };
        const missing = (): unknown => reply.code(404).send({ error: "Not Found" });

        if (!id || !SNOWFLAKE.test(id) || !round || !file || !this.client.databaseService.Ready) return missing();

        const settings = await this.client.clipService.Settings(id);
        // Wie die öffentliche Seite: nur mit eingeschaltetem Modul und freigegebener Seite für alle.
        const open = settings.publicBoard && (await this.client.settings.Of(id)).modules.includes(CLIPS_MODULE);

        if (!open) {
            const session = SessionOf(this.client, request);
            const allowed = session ? await this.client.dashboardService.CanManage(session, id).catch(() => false) : false;

            if (!allowed) return missing();
        }

        const target = await this.client.clipService.MediaFile(id, Number(round), file);
        const info = target ? await stat(target).catch(() => null) : null;

        if (!target || !info?.isFile()) return missing();

        reply
            .header("Content-Type", CLIP_TYPES[path.extname(file)] ?? "application/octet-stream")
            .header("Accept-Ranges", "bytes")
            .header("X-Content-Type-Options", "nosniff")
            .header("Cache-Control", open ? "public, max-age=86400" : "private, max-age=3600");

        const range = /^bytes=(\d*)-(\d*)$/.exec(String(request.headers.range ?? ""));

        if (!range || (!range[1] && !range[2])) return reply.header("Content-Length", info.size).send(createReadStream(target));

        // "bytes=-500" sind die letzten 500 Bytes, "bytes=500-" alles ab 500.
        const start = range[1] ? Number(range[1]) : Math.max(0, info.size - Number(range[2]));
        const end = range[1] && range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;

        if (start > end || start >= info.size) return reply.code(416).header("Content-Range", `bytes */${info.size}`).send();

        return reply
            .code(206)
            .header("Content-Range", `bytes ${start}-${end}/${info.size}`)
            .header("Content-Length", end - start + 1)
            .send(createReadStream(target, { start, end }));
    }
}
