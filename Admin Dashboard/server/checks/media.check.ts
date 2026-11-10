import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { buildApp } from "../app.ts";
import { loadConfig } from "../config.ts";
import { listImages } from "../media.ts";
import { SESSION_COOKIE, seal } from "../session.ts";
import { USERS } from "./fakes.ts";
import { ENV, SECRET, check, section } from "./harness.ts";

/** W-0062: Bilder für Partner und News. Eigener leerer SITE_DIR, nichts Echtes wird angefasst. */
export async function checkMedia(): Promise<void> {
    section("Bilder hochladen (W-0062)");

    const siteDir = await mkdtemp(path.join(tmpdir(), "rlnexus-media-"));
    const config = loadConfig({ ...ENV, SITE_DIR: siteDir }, []);
    const app = await buildApp(config);
    const cookie = `${SESSION_COOKIE}=${seal({ id: USERS.admin, name: "nutzer1", avatar: null, exp: Math.floor(Date.now() / 1000) + 600 }, SECRET)}`;
    const upload = (payload: unknown, withCookie = true) =>
        app.inject({
            method: "POST",
            url: "/api/media",
            headers: { ...(withCookie ? { cookie } : {}), origin: config.publicUrl, "content-type": "application/json" },
            payload: JSON.stringify(payload),
        });
    const png = createCanvas(3, 2).toBuffer("image/png").toString("base64");

    try {
        await check("Bild: PNG wird zu WebP unter /content/media/", async () => {
            const response = await upload({ mime: "image/png", data: png });

            assert.equal(response.statusCode, 200, response.body);

            const media = response.json() as { url: string; width: number; height: number };

            assert.match(media.url, /^\/content\/media\/[a-z0-9]+\.webp$/);
            assert.deepEqual([media.width, media.height], [3, 2]);
            assert.ok(existsSync(path.join(siteDir, media.url.replace("/content/", ""))));
        });

        await check("Bild: SVG wird abgelehnt", async () => {
            assert.equal((await upload({ mime: "image/svg+xml", data: Buffer.from("<svg/>").toString("base64") })).statusCode, 400);
        });

        await check("Bild: kaputte Daten schreiben keine Datei", async () => {
            const before = (await listImages(config)).length;
            const response = await upload({ mime: "image/png", data: Buffer.from("kein bild").toString("base64") });

            assert.equal(response.statusCode, 400);
            assert.equal((await listImages(config)).length, before);
        });

        await check("Bild: über 8 MB wird abgelehnt", async () => {
            assert.equal((await upload({ mime: "image/png", data: Buffer.alloc(8 * 1024 * 1024 + 10, 1).toString("base64") })).statusCode, 400);
        });

        await check("Bild: ohne Sitzung kein Hochladen", async () => {
            assert.equal((await upload({ mime: "image/png", data: png }, false)).statusCode, 401);
        });

        await check("Bild: Liste zeigt das hochgeladene Bild", async () => {
            const response = await app.inject({ method: "GET", url: "/api/media", headers: { cookie } });

            assert.equal(response.statusCode, 200);
            assert.equal((response.json() as { images: unknown[] }).images.length, 1);
        });
    } finally {
        await app.close();
        await rm(siteDir, { recursive: true, force: true });
    }
}
