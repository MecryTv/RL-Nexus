import type { FastifyInstance } from "fastify";
import { MEDIA_MAX } from "../../shared/media.ts";
import { accessOf } from "../access.ts";
import { audit } from "../audit.ts";
import type { IConfig } from "../config.ts";
import { listImages, saveImage } from "../media.ts";
import { body } from "../validate.ts";

/** W-0062: Bilder für Partner und News hochladen (Admins und Developer). */
export async function mediaRoutes(app: FastifyInstance, { config }: { config: IConfig }): Promise<void> {
    // Base64 macht aus 8 MB knapp 11 MB.
    app.post("/api/media", { bodyLimit: Math.ceil((MEDIA_MAX * 4) / 3) + 64 * 1024 }, async (request) => {
        const input = body(request.body);
        const media = await saveImage(config, { mime: input.mime, data: input.data });
        const me = accessOf(request);

        await audit({ id: me.id, name: me.name }, "media.upload", media.url);

        return media;
    });

    app.get("/api/media", async () => ({ images: await listImages(config) }));
}
