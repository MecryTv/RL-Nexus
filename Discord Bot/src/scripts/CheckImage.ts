/**
 * Prueft das Verkleinern von Bildern: Kantenlaenge, Format, GIF-Durchlass und
 * das Verhalten bei Muell.
 *
 *   npm run check:image
 *
 * Absichtlich ohne Test-Framework - der Bot hat keins, und ein Durchlauf reicht,
 * um die Regeln aus dem Spec abzusichern.
 */

import { createCanvas, loadImage } from "@napi-rs/canvas";
import { IMAGE_TOO_LARGE, ImageSize, Shrink, TooLarge } from "../utils/image";

let failures = 0;

function check(name: string, passed: boolean, detail = ""): void {
    if (!passed) failures++;

    console.log(`  ${passed ? "ok  " : "FAIL"} ${name}${passed || !detail ? "" : `  → ${detail}`}`);
}

// Ein breites Bild mit Farbverlauf: einfarbige Flaechen komprimiert WebP so
// stark, dass ein Groessenvergleich nichts mehr aussagt.
function Sample(width: number, height: number): Buffer {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d");
    const gradient = context.createLinearGradient(0, 0, width, height);

    gradient.addColorStop(0, "#ff1e2d");
    gradient.addColorStop(1, "#101418");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    return canvas.toBuffer("image/png");
}

// Das kleinstmoegliche gueltige GIF (1x1, transparent).
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

// Muss zur (nicht exportierten) QUALITY in image.ts passen.
const QUALITY = 80;

async function main(): Promise<void> {
    console.log("\n🖼️  Bild-Verkleinerung\n");

    const big = Sample(3000, 1000);
    const shrunk = await Shrink(big, "image/png");
    const back = await loadImage(shrunk.buffer);

    check("Lange Kante landet auf 1920px", back.width === 1920, `${back.width}px`);
    check("Seitenverhaeltnis bleibt", back.height === 640, `${back.height}px`);
    check("Ergebnis ist WebP", shrunk.extension === ".webp", shrunk.extension);

    const bigImage = await loadImage(big);
    const bigCanvas = createCanvas(bigImage.width, bigImage.height);

    bigCanvas.getContext("2d").drawImage(bigImage, 0, 0, bigImage.width, bigImage.height);

    const bigWebp = await bigCanvas.encode("webp", QUALITY);

    // Vergleich bewusst nicht gegen das PNG: WebP komprimiert schon ganz ohne
    // Verkleinerung so viel staerker als PNG (102389 → 14490 Bytes bei diesem
    // Sample), dass die Pruefung selbst bei kaputter Verkleinerung bestehen
    // wuerde. Erst der Vergleich mit WebP in Originalgroesse und gleicher
    // Qualitaet zeigt, ob das Verkleinern selbst etwas bringt.
    check(
        "Verkleinerung spart Bytes gegenueber WebP in Originalgroesse",
        shrunk.buffer.length < bigWebp.length * 0.9,
        `${bigWebp.length} → ${shrunk.buffer.length}`
    );

    const small = Sample(200, 100);
    const kept = await Shrink(small, "image/png");
    const keptBack = await loadImage(kept.buffer);

    check("Kleines Bild wird nicht hochskaliert", keptBack.width === 200, `${keptBack.width}px`);
    check("Kleines Bild wird trotzdem zu WebP", kept.extension === ".webp", kept.extension);

    const gif = await Shrink(GIF, "image/gif");

    check("GIF bleibt unveraendert", gif.buffer.equals(GIF) && gif.extension === ".gif", gif.extension);

    const broken = await Shrink(Buffer.from("kein bild"), "image/png").then(
        () => "kein Fehler",
        (error: Error) => error.message
    );

    check("Muell wird mit lesbarem Text abgelehnt", broken === "Das Bild ließ sich nicht lesen.", broken);

    // Das Label "image/gif" kommt von aussen (content-type oder Browser) und darf
    // allein nicht entscheiden, ob verkleinert wird - das entscheiden die Bytes.
    const falseLabel = await Shrink(Sample(300, 200), "image/gif");

    check(
        "PNG mit falschem Label 'image/gif' wird trotzdem verkleinert",
        falseLabel.extension === ".webp",
        falseLabel.extension
    );

    const fakeGif = await Shrink(Buffer.from("kein bild"), "image/gif").then(
        () => "kein Fehler",
        (error: Error) => error.message
    );

    check("Muell mit falschem Label 'image/gif' wird abgelehnt", fakeGif === "Das Bild ließ sich nicht lesen.", fakeGif);

    await checkHeaders();

    console.log(failures === 0 ? "\n✅ Alle Prüfungen bestanden.\n" : `\n❌ ${failures} Prüfung(en) fehlgeschlagen.\n`);
    process.exit(failures === 0 ? 0 : 1);
}

/* ----------------------------------------------------------
   W-0118: Maße aus dem Dateikopf, bevor entpackt wird
   ---------------------------------------------------------- */
function Png(width: number, height: number): Buffer {
    const head = Buffer.alloc(33);

    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]).copy(head);
    head.writeUInt32BE(width, 16);
    head.writeUInt32BE(height, 20);

    return head;
}

function Gif(width: number, height: number): Buffer {
    const head = Buffer.alloc(13);

    head.write("GIF89a", 0, "ascii");
    head.writeUInt16LE(width, 6);
    head.writeUInt16LE(height, 8);

    return head;
}

// SOI, ein APP0-Segment zum Überspringen, dann SOF0 mit Höhe und Breite.
function Jpeg(width: number, height: number): Buffer {
    const head = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0, 0, 0, 0, 1, 1, 0x11, 0]);

    head.writeUInt16BE(height, 13);
    head.writeUInt16BE(width, 15);

    return head;
}

function WebpX(width: number, height: number): Buffer {
    const head = Buffer.alloc(30);

    head.write("RIFF", 0, "ascii");
    head.write("WEBPVP8X", 8, "ascii");
    head.writeUIntLE(width - 1, 24, 3);
    head.writeUIntLE(height - 1, 27, 3);

    return head;
}

async function Refused(buffer: Buffer, mime: string): Promise<string> {
    return Shrink(buffer, mime).then(
        () => "kein Fehler",
        (error: Error) => error.message
    );
}

async function checkHeaders(): Promise<void> {
    console.log("\n  — Maße aus dem Dateikopf —");

    const same = (size: { width: number; height: number } | null, width: number, height: number) => size?.width === width && size.height === height;

    check("PNG-Kopf 1000×1000 wird gelesen", same(ImageSize(Png(1000, 1000)), 1000, 1000));
    check("1000×1000 ist nicht zu groß", !TooLarge({ width: 1000, height: 1000 }));
    check("GIF-Kopf wird gelesen", same(ImageSize(Gif(640, 480)), 640, 480));
    check("JPEG-Kopf wird gelesen", same(ImageSize(Jpeg(1200, 900)), 1200, 900));
    check("WebP-Kopf (VP8X) wird gelesen", same(ImageSize(WebpX(1500, 700)), 1500, 700));
    check("Abgeschnittener PNG-Kopf ergibt nichts", ImageSize(Png(1000, 1000).subarray(0, 20)) === null);
    check("Abgeschnittener JPEG-Kopf ergibt nichts", ImageSize(Jpeg(1000, 1000).subarray(0, 14)) === null);
    check("Ein GIF ohne Maße ergibt nichts", ImageSize(Gif(0, 10)) === null);

    // Echte Dateien aus dem Canvas: der Kopf passt zu dem, was loadImage sieht.
    const canvas = createCanvas(321, 123);

    canvas.getContext("2d").fillRect(0, 0, 10, 10);
    check("Echtes PNG", same(ImageSize(canvas.toBuffer("image/png")), 321, 123));
    check("Echtes JPEG", same(ImageSize(canvas.toBuffer("image/jpeg")), 321, 123));
    check("Echtes WebP", same(ImageSize(await canvas.encode("webp", 80)), 321, 123));
    check("Echtes GIF (1×1)", same(ImageSize(GIF), 1, 1));

    check("PNG 30000×30000 wird vor dem Entpacken abgelehnt", (await Refused(Png(30_000, 30_000), "image/png")) === IMAGE_TOO_LARGE);
    check("GIF 30000×30000 geht nicht mehr unverändert durch", (await Refused(Gif(30_000, 30_000), "image/gif")) === IMAGE_TOO_LARGE);
    check("JPEG 9000×100 (zu lange Kante) wird abgelehnt", (await Refused(Jpeg(9000, 100), "image/jpeg")) === IMAGE_TOO_LARGE);
    check("WebP 7000×7000 (49 MP) wird abgelehnt", (await Refused(WebpX(7000, 7000), "image/webp")) === IMAGE_TOO_LARGE);
    check("Abgeschnittener Kopf wird als unlesbar abgelehnt", (await Refused(Png(1000, 1000).subarray(0, 20), "image/png")) === "Das Bild ließ sich nicht lesen.");
}

main().catch((error: Error) => {
    console.log(`\n❌ Unerwarteter Fehler: ${error.message}\n`);
    process.exit(1);
});
