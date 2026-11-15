import { createCanvas, loadImage } from "@napi-rs/canvas";

/**
 * Bringt ein Bild auf eine Groesse, mit der Discord und die Platte gut leben.
 *
 * Alles laeuft hier durch, was im Bildverzeichnis landet - der Upload aus dem
 * Dashboard genauso wie der Download aus dem Galerie-Panel. Eine Stelle, eine
 * Regel.
 *
 * Animierte GIFs gehen unveraendert durch: ein Canvas-Durchlauf behielte nur
 * das erste Bild, und eine stehende Animation waere schlechter als ein paar
 * Kilobyte mehr. Ob das zutrifft, entscheiden die Bytes selbst und nicht das
 * mitgelieferte Label: "image/gif" kommt vom content-type eines fremden
 * Servers oder direkt vom Browser und laesst sich frei behaupten. Nur ein
 * Puffer, der wirklich mit "GIF8" beginnt, kommt unveraendert durch - alles
 * andere unter diesem Label landet ganz normal im Canvas.
 */

const MAX_EDGE = 1920;
const QUALITY = 80;

/** W-0118: Größer wird kein Bild entpackt - wie im Admin Dashboard (server/image-size.ts). */
export const IMAGE_MAX_SIDE = 8000;
export const IMAGE_MAX_PIXELS = 40_000_000;
export const IMAGE_TOO_LARGE = "Das Bild ist zu groß: höchstens 8000 Pixel pro Kante und 40 Megapixel.";

// "GIF87a" und "GIF89a" sind die einzigen beiden Varianten, und beide beginnen
// mit diesen vier ASCII-Zeichen - das reicht als Nachweis.
function IsGif(buffer: Buffer): boolean {
    return buffer.length >= 4 && buffer.toString("ascii", 0, 4) === "GIF8";
}

/**
 * Breite und Höhe aus dem Dateikopf, ohne das Bild zu entpacken (W-0118). Ein kleines
 * PNG mit riesigen Maßen belegt beim Entpacken Gigabytes; deshalb erst die Maße, dann
 * loadImage. Logik wie im Admin Dashboard (server/image-size.ts), dazu GIF.
 *
 * Kennt PNG, JPEG, WebP und GIF. Alles andere und abgeschnittene Köpfe ergeben null.
 */
export function ImageSize(data: Uint8Array): { width: number; height: number } | null {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const ascii = (start: number, end: number) => String.fromCharCode(...data.subarray(start, end));
    const size = (width: number, height: number) => (width > 0 && height > 0 ? { width, height } : null);

    // PNG: Signatur, dann IHDR mit Breite und Höhe (je 32 Bit, Big Endian).
    if (data.length >= 24 && view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a && ascii(12, 16) === "IHDR") {
        return size(view.getUint32(16), view.getUint32(20));
    }

    // GIF: logische Bildschirmgröße (je 16 Bit, Little Endian). Einzelbilder liegen darin.
    if (data.length >= 10 && (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a")) {
        return size(view.getUint16(6, true), view.getUint16(8, true));
    }

    // WebP: RIFF-Container, der erste Chunk sagt die Art.
    if (data.length >= 16 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") {
        const kind = ascii(12, 16);

        // Verlustbehaftet: Startcode 9D 01 2A, dann je 14 Bit Breite und Höhe.
        if (kind === "VP8 " && data.length >= 30 && data[23] === 0x9d && data[24] === 0x01 && data[25] === 0x2a) {
            return size(view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff);
        }

        // Verlustfrei: Signatur 0x2F, dann je 14 Bit Breite-1 und Höhe-1.
        if (kind === "VP8L" && data.length >= 25 && data[20] === 0x2f) {
            const bits = view.getUint32(21, true);

            return size((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
        }

        // Erweitert: Leinwand je 24 Bit Breite-1 und Höhe-1; Einzelbilder müssen hineinpassen.
        if (kind === "VP8X" && data.length >= 30) {
            return size((data[24]! | (data[25]! << 8) | (data[26]! << 16)) + 1, (data[27]! | (data[28]! << 8) | (data[29]! << 16)) + 1);
        }

        return null;
    }

    // JPEG: Segmente der Reihe nach bis zum ersten SOF-Marker (C0 bis CF ohne C4, C8, CC).
    if (data.length >= 4 && data[0] === 0xff && data[1] === 0xd8) {
        let offset = 2;

        while (offset + 4 <= data.length) {
            if (data[offset] !== 0xff) return null;

            const marker = data[offset + 1]!;

            if (marker === 0xff) {
                offset++;
                continue;
            }

            if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
                offset += 2;
                continue;
            }

            // Bilddaten oder Ende vor jedem SOF: kein Kopf, den wir kennen.
            if (marker === 0xd9 || marker === 0xda) return null;

            const length = view.getUint16(offset + 2);

            if (length < 2) return null;

            if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
                return offset + 9 <= data.length ? size(view.getUint16(offset + 7), view.getUint16(offset + 5)) : null;
            }

            offset += 2 + length;
        }
    }

    return null;
}

/** Zu groß zum Entpacken? */
export function TooLarge(size: { width: number; height: number }): boolean {
    return size.width > IMAGE_MAX_SIDE || size.height > IMAGE_MAX_SIDE || size.width * size.height > IMAGE_MAX_PIXELS;
}

export async function Shrink(buffer: Buffer, mime: string): Promise<{ buffer: Buffer; extension: string }> {
    // W-0118: erst die Maße aus dem Kopf, dann entpacken. Auch ein GIF, das unverändert
    // durchgeht, wird später als Hintergrund oder Logo entpackt.
    const size = ImageSize(buffer);

    if (!size) throw new Error("Das Bild ließ sich nicht lesen.");
    if (TooLarge(size)) throw new Error(IMAGE_TOO_LARGE);

    if (mime === "image/gif" && IsGif(buffer)) return { buffer, extension: ".gif" };

    const image = await loadImage(buffer).catch(() => null);

    if (!image) throw new Error("Das Bild ließ sich nicht lesen.");

    // Nur verkleinern, nie vergroessern: ein 200px-Logo auf 1920px gezogen
    // waere groesser und unschaerfer zugleich.
    const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));

    const canvas = createCanvas(width, height);

    canvas.getContext("2d").drawImage(image, 0, 0, width, height);

    return { buffer: await canvas.encode("webp", QUALITY), extension: ".webp" };
}
