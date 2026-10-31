import { createCanvas, loadImage } from "@napi-rs/canvas";
import jsQR from "jsqr";

/**
 * Die Wächter von Anti Villain mit Bildern (Plan 31): QR-Codes in Bildern und
 * der Vergleich von Avataren. Wie groß ein Bild sein darf, prüft der Aufrufer
 * vor dem Laden (QR_MAX_BYTES, QR_MAX_SIDE).
 */

/** Höchstens so viele Bits Abstand gelten als „sehr ähnliches Bild“. */
export const AVATAR_SAME = 5;

/** Größer wird zum Lesen nicht gezeichnet - QR-Codes bleiben dabei lesbar, und es geht schnell. */
const QR_SIDE = 1000;

/** Steht ein QR-Code im Bild? Unlesbare Bilder: nein. */
export async function HasQr(image: Buffer): Promise<boolean> {
    try {
        const picture = await loadImage(image);
        const scale = Math.min(1, QR_SIDE / Math.max(picture.width, picture.height));
        const width = Math.max(1, Math.round(picture.width * scale));
        const height = Math.max(1, Math.round(picture.height * scale));
        const canvas = createCanvas(width, height);
        const context = canvas.getContext("2d");

        // Ein transparenter Hintergrund wäre schwarz - dann sähe jsQR keinen Kontrast.
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        context.drawImage(picture, 0, 0, width, height);

        const pixels = context.getImageData(0, 0, width, height);

        return jsQR(new Uint8ClampedArray(pixels.data), width, height) !== null;
    } catch {
        return false;
    }
}

/**
 * 8×8-Durchschnitts-Hash: jedes Feld heller als der Schnitt ist eine 1. 16 Hex-Zeichen.
 * Erst auf 32×32, dann auf 8×8: in einem Schritt verkleinert, verrauschen feine
 * Kanten, und dasselbe Bild in anderer Größe läge zu weit auseinander.
 */
export async function AvatarHash(image: Buffer): Promise<string> {
    const middle = createCanvas(32, 32);
    const step = middle.getContext("2d");

    step.fillStyle = "#ffffff";
    step.fillRect(0, 0, 32, 32);
    step.drawImage(await loadImage(image), 0, 0, 32, 32);

    const canvas = createCanvas(8, 8);
    const context = canvas.getContext("2d");

    context.drawImage(middle, 0, 0, 8, 8);

    const data = context.getImageData(0, 0, 8, 8).data;
    const gray: number[] = [];

    for (let index = 0; index < data.length; index += 4) gray.push(0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2]);

    const mean = gray.reduce((sum, value) => sum + value, 0) / gray.length;
    let bits = 0n;

    for (const value of gray) bits = (bits << 1n) | (value > mean ? 1n : 0n);

    return bits.toString(16).padStart(16, "0");
}

/** Wie viele Bits sich zwei Hashes unterscheiden. */
export function HashDistance(a: string, b: string): number {
    let rest = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
    let count = 0;

    while (rest > 0n) {
        count += Number(rest & 1n);
        rest >>= 1n;
    }

    return count;
}
