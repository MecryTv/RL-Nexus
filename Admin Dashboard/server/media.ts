import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { MEDIA_EDGE, MEDIA_MAX, MEDIA_TYPES, type IMedia, type IMediaFile } from "../shared/media.ts";
import type { IConfig } from "./config.ts";
import { InvalidInput } from "./errors.ts";

/**
 * Bilder für Partner und News (W-0062): einmal gelesen, auf MEDIA_EDGE verkleinert
 * und als WebP neu geschrieben. Das Neu-Kodieren wirft Metadaten weg und lässt nur
 * echte Bilder durch; SVG geht gar nicht erst.
 */

function mediaDir(config: IConfig): string {
    return path.join(config.siteDir, "media");
}

export async function saveImage(config: IConfig, input: { readonly mime: unknown; readonly data: unknown }): Promise<IMedia> {
    if (!MEDIA_TYPES.some((type) => type === input.mime)) throw new InvalidInput("Erlaubt sind PNG, JPEG und WebP.");
    if (typeof input.data !== "string" || input.data.length < 8) throw new InvalidInput("Das Bild fehlt.");
    if (input.data.length > Math.ceil((MEDIA_MAX * 4) / 3) + 8) throw new InvalidInput("Ein Bild darf höchstens 8 MB groß sein.");

    const raw = Buffer.from(input.data, "base64");

    if (raw.length > MEDIA_MAX) throw new InvalidInput("Ein Bild darf höchstens 8 MB groß sein.");

    let image: Awaited<ReturnType<typeof loadImage>>;

    try {
        image = await loadImage(raw);
    } catch {
        throw new InvalidInput("Das Bild lässt sich nicht lesen.");
    }

    if (!image.width || !image.height) throw new InvalidInput("Das Bild lässt sich nicht lesen.");

    const scale = Math.min(1, MEDIA_EDGE / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = createCanvas(width, height);

    canvas.getContext("2d").drawImage(image, 0, 0, width, height);

    const data = canvas.toBuffer("image/webp", 85);
    const name = `${createHash("sha256").update(data).digest("hex").slice(0, 16)}.webp`;
    const target = path.join(mediaDir(config), name);

    if (!existsSync(target)) {
        const temporary = `${target}.${process.pid}-${Date.now()}.tmp`;

        await mkdir(mediaDir(config), { recursive: true });
        await writeFile(temporary, data);
        await rename(temporary, target);
    }

    return { url: `/content/media/${name}`, width, height, bytes: data.length };
}

/** Hochgeladene Bilder für die Galerie im Studio, neueste zuerst. Bilder des Changelogs gehören nicht dazu. */
export async function listImages(config: IConfig): Promise<IMediaFile[]> {
    let names: string[];

    try {
        names = await readdir(mediaDir(config));
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw error;
    }

    const files = await Promise.all(
        names
            .filter((name) => /^[0-9a-f]{16}\.webp$/.test(name))
            .map(async (name) => {
                const info = await stat(path.join(mediaDir(config), name));

                return { url: `/content/media/${name}`, bytes: info.size, at: info.mtime.toISOString() };
            })
    );

    return files.sort((a, b) => b.at.localeCompare(a.at));
}

/** Ein Bild aus dem Medienordner für die Vorschau im Admin. Nur Namen, wie sie hier entstehen; sonst null. */
export async function readMediaFile(config: IConfig, name: string): Promise<{ readonly data: Buffer; readonly type: string } | null> {
    if (!/^[a-z0-9-]+\.(?:webp|png)$/.test(name)) return null;

    try {
        return { data: await readFile(path.join(mediaDir(config), name)), type: name.endsWith(".png") ? "image/png" : "image/webp" };
    } catch {
        return null;
    }
}

const DISCORD_CDN = "https://cdn.discordapp.com/";

/**
 * W-0062 Teil 2: Logo „Von Discord“ – das Icon eines Servers holen und wie ein
 * Upload speichern. Nur von Discords CDN, damit der Server keine beliebigen
 * Adressen abruft.
 */
export async function saveRemoteImage(config: IConfig, url: unknown): Promise<IMedia> {
    if (typeof url !== "string" || !url.startsWith(DISCORD_CDN) || url.length > 300) throw new InvalidInput("Nur Bilder von Discord.");

    let response: Response;

    try {
        response = await fetch(url, { signal: AbortSignal.timeout(10_000), redirect: "error" });
    } catch {
        throw new InvalidInput("Discord liefert das Bild gerade nicht.");
    }

    const mime = (response.headers.get("content-type") ?? "").split(";")[0]!.trim();

    if (!response.ok || !MEDIA_TYPES.some((type) => type === mime)) throw new InvalidInput("Discord liefert das Bild gerade nicht.");

    const data = Buffer.from(await response.arrayBuffer());

    if (data.length > MEDIA_MAX) throw new InvalidInput("Ein Bild darf höchstens 8 MB groß sein.");

    return saveImage(config, { mime, data: data.toString("base64") });
}
