/**
 * Breite und Höhe eines Bildes aus dem Dateikopf, ohne es zu entpacken (W-0118).
 * Ein kleines PNG mit riesigen Maßen belegt beim Entpacken Gigabytes; deshalb
 * erst die Maße prüfen, dann loadImage. Bewusst ohne Abhängigkeiten, damit der
 * Bot dieselbe Logik übernehmen kann.
 *
 * Kennt PNG, JPEG und WebP. Alles andere und abgeschnittene Köpfe ergeben null.
 */

export const IMAGE_MAX_SIDE = 8000;
export const IMAGE_MAX_PIXELS = 40_000_000;

export interface IImageSize {
    readonly width: number;
    readonly height: number;
}

export function imageSize(data: Uint8Array): IImageSize | null {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const ascii = (start: number, end: number) => String.fromCharCode(...data.subarray(start, end));
    const size = (width: number, height: number) => (width > 0 && height > 0 ? { width, height } : null);

    // PNG: Signatur, dann IHDR mit Breite und Höhe (je 32 Bit, Big Endian).
    if (data.length >= 24 && view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a && ascii(12, 16) === "IHDR") {
        return size(view.getUint32(16), view.getUint32(20));
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
