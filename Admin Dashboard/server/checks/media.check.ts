import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { buildApp } from "../app.ts";
import { loadConfig } from "../config.ts";
import { imageSize } from "../image-size.ts";
import { listImages } from "../media.ts";
import { SESSION_COOKIE, seal } from "../session.ts";
import { USERS } from "./fakes.ts";
import { ENV, SECRET, check, section } from "./harness.ts";

/* W-0118: nur Dateiköpfe, keine echten Bilder; so groß wie nötig, damit die Maße drinstehen. */
function pngHead(width: number, height: number): Buffer {
    const head = Buffer.alloc(33);

    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]).copy(head);
    head.write("IHDR", 12, "ascii");
    head.writeUInt32BE(width, 16);
    head.writeUInt32BE(height, 20);
    head[24] = 8;
    head[25] = 6;

    return head;
}

/** SOI, APP0 (JFIF) und ein SOF-Segment; marker 0xc0 = SOF0 (baseline), 0xc2 = SOF2 (progressiv). */
function jpegHead(marker: number, width: number, height: number): Buffer {
    const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
    const sof = Buffer.alloc(19);

    sof[0] = 0xff;
    sof[1] = marker;
    sof.writeUInt16BE(17, 2);
    sof[4] = 8;
    sof.writeUInt16BE(height, 5);
    sof.writeUInt16BE(width, 7);
    sof[9] = 3;

    return Buffer.concat([Buffer.from([0xff, 0xd8, ...app0]), sof]);
}

function webpHead(kind: "VP8 " | "VP8L" | "VP8X", width: number, height: number): Buffer {
    const body = Buffer.alloc(10);

    if (kind === "VP8 ") {
        body.set([0x9d, 0x01, 0x2a], 3);
        body.writeUInt16LE(width, 6);
        body.writeUInt16LE(height, 8);
    } else if (kind === "VP8L") {
        body[0] = 0x2f;
        body.writeUInt32LE(((width - 1) | ((height - 1) << 14)) >>> 0, 1);
    } else {
        body.writeUIntLE(width - 1, 4, 3);
        body.writeUIntLE(height - 1, 7, 3);
    }

    const head = Buffer.alloc(20);

    head.write("RIFF", 0, "ascii");
    head.writeUInt32LE(12 + body.length, 4);
    head.write(`WEBP${kind}`, 8, "ascii");
    head.writeUInt32LE(body.length, 16);

    return Buffer.concat([head, body]);
}

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

        /* --- W-0062 Teil 2: Bilder im Admin anzeigen und von Discord holen --- */
        const remote = (url: unknown) =>
            app.inject({
                method: "POST",
                url: "/api/media/remote",
                headers: { cookie, origin: config.publicUrl, "content-type": "application/json" },
                payload: JSON.stringify({ url }),
            });

        await check("Bild: der Admin liefert hochgeladene Bilder unter /content/media aus", async () => {
            const [image] = await listImages(config);
            const response = await app.inject({ method: "GET", url: image!.url });

            assert.equal(response.statusCode, 200);
            assert.equal(response.headers["content-type"], "image/webp");
            assert.match(String(response.headers["cache-control"]), /max-age=3600/);
            assert.equal((await app.inject({ method: "GET", url: "/content/media/..%2F..%2F.env" })).statusCode, 404);
            assert.equal((await app.inject({ method: "GET", url: "/content/media/gibtsnicht.webp" })).statusCode, 404);
        });

        await check("Bild: von Discord nur von cdn.discordapp.com", async () => {
            assert.equal((await remote("https://example.com/a.png")).statusCode, 400);
            assert.equal((await remote("https://cdn.discordapp.com.example.com/a.png")).statusCode, 400);
            assert.equal((await remote(42)).statusCode, 400);

            const real = globalThis.fetch;
            const icon = createCanvas(4, 4).toBuffer("image/png");

            globalThis.fetch = (async (input: string | URL | Request) => {
                assert.match(String(input), /^https:\/\/cdn\.discordapp\.com\/icons\//);

                return new Response(new Uint8Array(icon), { status: 200, headers: { "content-type": "image/png" } });
            }) as typeof fetch;

            try {
                const response = await remote("https://cdn.discordapp.com/icons/123/abc.png?size=512");

                assert.equal(response.statusCode, 200, response.body);
                assert.match((response.json() as { url: string }).url, /^\/content\/media\/[0-9a-f]{16}\.webp$/);
            } finally {
                globalThis.fetch = real;
            }
        });

        /* --- W-0118: Maße aus dem Dateikopf, bevor loadImage entpackt --- */
        await check("Bildmaße: PNG-, JPEG- und WebP-Köpfe werden ohne Entpacken gelesen", () => {
            assert.deepEqual(imageSize(pngHead(1000, 1000)), { width: 1000, height: 1000 });
            assert.deepEqual(imageSize(pngHead(30000, 30000)), { width: 30000, height: 30000 });
            assert.deepEqual(imageSize(jpegHead(0xc0, 1000, 800)), { width: 1000, height: 800 });
            assert.deepEqual(imageSize(jpegHead(0xc2, 30000, 30000)), { width: 30000, height: 30000 });
            assert.deepEqual(imageSize(webpHead("VP8 ", 1000, 800)), { width: 1000, height: 800 });
            assert.deepEqual(imageSize(webpHead("VP8L", 16384, 16384)), { width: 16384, height: 16384 });
            assert.deepEqual(imageSize(webpHead("VP8X", 20000, 20000)), { width: 20000, height: 20000 });

            for (const type of ["image/png", "image/jpeg", "image/webp"] as const) {
                assert.deepEqual(imageSize(createCanvas(321, 123).toBuffer(type as "image/png")), { width: 321, height: 123 }, type);
            }
        });

        await check("Bildmaße: abgeschnittene und unbekannte Köpfe ergeben null", () => {
            const jpeg = jpegHead(0xc0, 1000, 1000);
            const noFrame = Buffer.concat([jpeg.subarray(0, 20), Buffer.from([0xff, 0xda, 0x00, 0x02])]);

            assert.equal(imageSize(pngHead(1000, 1000).subarray(0, 20)), null);
            assert.equal(imageSize(jpeg.subarray(0, jpeg.length - 12)), null);
            assert.equal(imageSize(noFrame), null);
            assert.equal(imageSize(webpHead("VP8X", 1000, 1000).subarray(0, 26)), null);
            assert.equal(imageSize(webpHead("VP8 ", 1000, 1000).subarray(0, 28)), null);
            assert.equal(imageSize(Buffer.from("GIF89a  ", "latin1")), null);
            assert.equal(imageSize(pngHead(0, 1000)), null);
            assert.equal(imageSize(Buffer.alloc(0)), null);
        });

        await check("Bild: über 8000 px pro Kante oder 40 MP wird vor dem Entpacken abgelehnt", async () => {
            const bombs: [string, Buffer][] = [
                ["image/png", pngHead(30000, 30000)],
                ["image/png", pngHead(8001, 10)],
                ["image/png", pngHead(7000, 7000)],
                ["image/jpeg", jpegHead(0xc2, 30000, 30000)],
                ["image/webp", webpHead("VP8X", 20000, 20000)],
                ["image/webp", webpHead("VP8L", 16384, 16384)],
            ];

            for (const [mime, head] of bombs) {
                const response = await upload({ mime, data: head.toString("base64") });

                assert.equal(response.statusCode, 400, `${mime} ${head.length}`);
                assert.match(response.body, /zu groß/, response.body);
            }

            // Der Kopf allein ist kein Bild: 1000x1000 kommt durch die Maßprüfung und scheitert erst beim Lesen.
            const small = await upload({ mime: "image/png", data: pngHead(1000, 1000).toString("base64") });

            assert.equal(small.statusCode, 400);
            assert.match(small.body, /lässt sich nicht lesen/);
        });

        await check("Bild: 1000x1000 als PNG, JPEG und WebP wird angenommen", async () => {
            for (const mime of ["image/png", "image/jpeg", "image/webp"] as const) {
                const response = await upload({ mime, data: createCanvas(1000, 1000).toBuffer(mime as "image/png").toString("base64") });

                assert.equal(response.statusCode, 200, response.body);
                assert.deepEqual([(response.json() as { width: number }).width, (response.json() as { height: number }).height], [1000, 1000]);
            }
        });
    } finally {
        await app.close();
        await rm(siteDir, { recursive: true, force: true });
    }
}
