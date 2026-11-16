import { readdir } from "node:fs/promises";
import path from "path";
import { Canvas, GlobalFonts, Image, Path2D, SKRSContext2D, createCanvas, loadImage } from "@napi-rs/canvas";
import { IPrimeProfile, IPrimeRank } from "../interfaces/services/prime/IPrimeService";
import {
    CARD_HEIGHT,
    CARD_WIDTH,
    CAREER_CARD_HEIGHT,
    CAREER_COLORS,
    CAREER_LABELS,
    CAREER_ORDER,
    COLORS,
    EXTRA_CARD_HEIGHT,
    EXTRA_MODE_COLORS,
    FONT_ROOT,
    GAP,
    HEADER_HEIGHT,
    MAIN_CARD_HEIGHT,
    PAD,
    PLATFORM_ICON_ROOT,
    PLAYLIST_SUBTITLES,
    RankIconFile,
    RewardIconFile,
    RewardTier,
    SECTION_BODY,
    SECTION_GAP,
    STAT_ICON_ROOT,
    TierColor,
} from "../constants/RankCard";
import { EXTRA_PLAYLISTS, PLACEMENT_MATCHES, REWARD_WINS_PER_LEVEL, RewardName } from "../constants/Prime";
import logger from "../utils/logger";

/**
 * Die Rang-Karte als PNG.
 *
 * Gezeichnet mit @napi-rs/canvas. Der Vorlage aus der Typografie-Datei folgend:
 * Oxanium für Namen, Ränge und Zahlen, Rajdhani für Labels, Orbitron als Akzent
 * beim Season-Reward.
 *
 * Ein Hinweis zur Schriftregistrierung: die Vorlage nennt registerFont() aus dem
 * Paket "canvas". @napi-rs/canvas heißt das GlobalFonts.registerFromPath() -
 * dieselbe Sache, anderer Name. Das Gewicht wählt danach wie gewohnt der
 * font-Shorthand ("800 64px Oxanium").
 */

/** Was auf der Karte steht. Alles Nutzerbezogene kommt von außen, nichts geraten. */
export interface IRankCardData {
    profile: IPrimeProfile;
    /** Der Discord-Name, falls das Konto verknüpft ist. null bei einer Suche. */
    discordName: string | null;
    /** URL des Discord-Avatars. null heißt: Plattform-Symbol statt Bild. */
    avatarURL: string | null;
}

/* ----------------------------------------------------------
   Schriften und Bilder
   ---------------------------------------------------------- */
let fonts: Promise<void> | null = null;

/**
 * Registriert die Schriften einmal je Prozess.
 *
 * Der Familienname kommt aus dem Dateinamen vor dem Bindestrich, das Gewicht
 * liest Skia aus der Datei selbst. Deshalb reicht es, alle Schnitte unter
 * demselben Namen anzumelden - "800 64px Oxanium" findet dann den ExtraBold.
 *
 * Gibt ein Promise zurueck und kein void: die Dateien werden gelesen, und wer
 * vorher zeichnet, bekommt eine Systemschrift. Genau einmal ausgefuehrt wird es
 * trotzdem - das gemerkte Promise ist die Sperre.
 */
export function RegisterFonts(): Promise<void> {
    fonts ??= readdir(FONT_ROOT)
        .then((files) => {
            for (const file of files.filter((name) => name.toLowerCase().endsWith(".ttf"))) {
                const family = file.split("-")[0] as string;

                if (!GlobalFonts.registerFromPath(path.join(FONT_ROOT, file), family)) {
                    logger.warn(`🖋️  Schrift nicht ladbar: ${file}`);
                }
            }
        })
        .catch((error) => {
            // Ohne die Dateien fällt Skia auf eine Systemschrift zurück. Die
            // Karte sieht dann anders aus, entsteht aber - das ist besser als
            // ein Command, der mit einem Fehler abbricht.
            logger.warn(`🖋️  Schriften nicht gefunden (${FONT_ROOT}): ${String(error)}`);
        });

    return fonts;
}

// Bilder ändern sich nicht - einmal laden reicht für die Laufzeit des Prozesses.
const images = new Map<string, Image | null>();

async function image(file: string): Promise<Image | null> {
    const cached = images.get(file);

    if (cached !== undefined) return cached;

    try {
        const loaded = await loadImage(file);

        images.set(file, loaded);

        return loaded;
    } catch (error) {
        // Ein fehlendes Bild kostet sein Symbol, nicht die ganze Karte.
        logger.warn(`🖼️  Bild nicht ladbar: ${file} (${String(error)})`);
        images.set(file, null);

        return null;
    }
}

/**
 * Der sichtbare Bereich eines Bildes.
 *
 * Manche Symbole liegen als kleines Motiv auf einer viel groesseren, leeren
 * Leinwand - epicgames.png etwa fuellt nur 16 % der Breite. Wer so ein Bild
 * einfach in ein Feld zeichnet, skaliert die Leere mit und bekommt einen Fleck.
 * Deshalb wird einmal gemessen, wo ueberhaupt etwas steht, und danach nur
 * dieser Ausschnitt gezeichnet.
 */
const boxes = new Map<string, { x: number; y: number; w: number; h: number }>();

/** Kantenlaenge des Rasters, auf dem gemessen wird. */
const PROBE_SIZE = 256;

function contentBox(key: string, source: Image): { x: number; y: number; w: number; h: number } {
    const known = boxes.get(key);

    if (known) return known;

    // Gemessen wird auf einer verkleinerten Kopie, nicht auf dem Original. Ein
    // Rang-Abzeichen ist 1381x1381 - das sind 1,9 Millionen Bildpunkte, und die
    // einzeln durchzugehen kostete gemessene 1,4 Sekunden je Bild. Fuer einen
    // Rahmen, der danach ohnehin skaliert wird, reicht ein Raster von 256.
    const scale = Math.min(1, PROBE_SIZE / Math.max(source.width, source.height));
    const pw = Math.max(1, Math.round(source.width * scale));
    const ph = Math.max(1, Math.round(source.height * scale));

    const probe = createCanvas(pw, ph);
    const ctx = probe.getContext("2d");

    ctx.drawImage(source, 0, 0, pw, ph);

    const data = ctx.getImageData(0, 0, pw, ph).data;

    let x0 = pw;
    let y0 = ph;
    let x1 = -1;
    let y1 = -1;

    // Flach ueber den Puffer statt verschachtelt: dieselbe Rechnung, aber ohne
    // die Multiplikation je Bildpunkt - das allein macht den Faktor 50 aus.
    for (let i = 3, p = 0; i < data.length; i += 4, p += 1) {
        // Beim Verkleinern verwischen harte Kanten; der Schwellwert liegt
        // deshalb niedrig, damit keine duenne Aussenkante verloren geht.
        if ((data[i] as number) <= 2) continue;

        const x = p % pw;
        const y = (p - x) / pw;

        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
    }

    // Eine Rasterzelle Sicherheitsabstand, dann zurueck in die Originalmasse.
    const box =
        x1 < 0
            ? { x: 0, y: 0, w: source.width, h: source.height }
            : {
                  x: Math.max(0, Math.floor((x0 - 1) / scale)),
                  y: Math.max(0, Math.floor((y0 - 1) / scale)),
                  w: 0,
                  h: 0,
              };

    if (x1 >= 0) {
        box.w = Math.min(source.width - box.x, Math.ceil((x1 + 2) / scale) - box.x);
        box.h = Math.min(source.height - box.y, Math.ceil((y1 + 2) / scale) - box.y);
    }

    boxes.set(key, box);

    return box;
}

/** Zeichnet nur das Motiv, mittig und seitenverhaeltnistreu in ein Quadrat. */
function drawIcon(ctx: SKRSContext2D, key: string, source: Image, x: number, y: number, size: number): void {
    const box = contentBox(key, source);
    const scale = size / Math.max(box.w, box.h);
    const w = box.w * scale;
    const h = box.h * scale;

    ctx.drawImage(source, box.x, box.y, box.w, box.h, x + (size - w) / 2, y + (size - h) / 2, w, h);
}

/**
 * Dasselbe, aber mit einem Schein in der Rangfarbe dahinter.
 *
 * Die Abzeichen sind dunkles Metall auf dunklem Grund und gingen darin unter.
 * Der Schein hebt sie ab, ohne sie einzufaerben - zweimal gezeichnet, damit er
 * dicht genug wird, um wirklich zu tragen.
 */
function drawGlowingIcon(
    ctx: SKRSContext2D,
    key: string,
    source: Image,
    x: number,
    y: number,
    size: number,
    color: string
): void {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = size * 0.34;

    drawIcon(ctx, key, source, x, y, size);
    drawIcon(ctx, key, source, x, y, size);

    ctx.restore();

    // Ohne Schatten noch einmal obendrauf: sonst wirkt das Motiv selbst weich.
    drawIcon(ctx, key, source, x, y, size);
}

/**
 * Ein Symbol in einer Farbe.
 *
 * Die Karriere-Symbole liegen als schwarze PNGs vor - auf dunklem Grund wären
 * sie unsichtbar. source-in ersetzt jede Farbe durch die gewünschte und behält
 * nur die Deckkraft, also die Form.
 */
function tinted(key: string, source: Image, size: number, color: string): Canvas {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext("2d");

    drawIcon(ctx, key, source, 0, 0, size);
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, size, size);

    return canvas;
}

/* ----------------------------------------------------------
   Zeichen-Handgriffe
   ---------------------------------------------------------- */

/** Ein Rechteck mit abgeschrägten Ecken - die Grundform des ganzen HUD. */
function bevelPath(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, cut: number): void {
    ctx.beginPath();
    ctx.moveTo(x + cut, y);
    ctx.lineTo(x + w - cut, y);
    ctx.lineTo(x + w, y + cut);
    ctx.lineTo(x + w, y + h - cut);
    ctx.lineTo(x + w - cut, y + h);
    ctx.lineTo(x + cut, y + h);
    ctx.lineTo(x, y + h - cut);
    ctx.lineTo(x, y + cut);
    ctx.closePath();
}

/** Strich mit Schein. Der Schatten ist hier das Leuchten, nicht der Schatten. */
function glow(ctx: SKRSContext2D, color: string, blur: number, draw: () => void): void {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    draw();
    ctx.restore();
}

/**
 * Ein dunkles Panel mit leuchtender Kante - der Baustein, aus dem die Karte
 * besteht.
 */
function panel(
    ctx: SKRSContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    options: { cut?: number; border?: string; fill?: string; glow?: number; width?: number } = {}
): void {
    const cut = options.cut ?? 18;

    ctx.save();
    bevelPath(ctx, x, y, w, h, cut);
    ctx.fillStyle = options.fill ?? "rgba(6, 9, 13, 0.78)";
    ctx.fill();
    ctx.restore();

    const border = options.border ?? COLORS.red;

    glow(ctx, border, options.glow ?? 14, () => {
        bevelPath(ctx, x, y, w, h, cut);
        ctx.strokeStyle = border;
        ctx.lineWidth = options.width ?? 2;
        ctx.stroke();
    });
}

/**
 * Text in Oxanium, der notfalls kleiner wird, statt aus seinem Feld zu laufen.
 *
 * Die Familie gehoert in den String: "700 26px" nimmt Skia ohne Murren an und
 * misst dann mit der Standardschrift - Oxanium ist breiter, und der Text lief
 * trotz Pruefung ueber den Rand.
 */
function fitText(ctx: SKRSContext2D, text: string, max: number, size: number, weight: string): number {
    let current = size;

    ctx.font = `${weight} ${current}px Oxanium`;

    while (ctx.measureText(text).width > max && current > 12) {
        current -= 2;
        ctx.font = `${weight} ${current}px Oxanium`;
    }

    return current;
}

/**
 * Grossbuchstaben mit Sperrung - die HUD-Labels der Vorlage.
 *
 * Canvas kann das selbst. Hier stand vorher eine Schleife, die jeden Buchstaben
 * einzeln setzte und einzeln mass; ohne Kerning kamen dabei sichtbare Luecken
 * mitten in Woertern heraus ("ASS ISTS"). letterSpacing macht dasselbe richtig
 * und misst auch richtig.
 */
function tracked(ctx: SKRSContext2D, text: string, x: number, y: number, spacing: number): void {
    ctx.letterSpacing = `${spacing}px`;
    ctx.fillText(text, x, y);
    ctx.letterSpacing = "0px";
}

function trackedWidth(ctx: SKRSContext2D, text: string, spacing: number): number {
    ctx.letterSpacing = `${spacing}px`;

    const width = ctx.measureText(text).width;

    ctx.letterSpacing = "0px";

    return width;
}

/** Eine kleine Flamme für die Serie. Gezeichnet, weil Emoji hier nicht rendern. */
function flame(ctx: SKRSContext2D, x: number, y: number, size: number, color: string): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size / 24, size / 24);
    ctx.fillStyle = color;

    // Aussenflamme: eine Spitze oben, eine ausholende Zunge links, breite Basis.
    ctx.beginPath();
    ctx.moveTo(13, 0);
    ctx.bezierCurveTo(13, 5, 17, 7, 18.5, 11);
    ctx.bezierCurveTo(20.5, 16, 17.5, 24, 12, 24);
    ctx.bezierCurveTo(6.5, 24, 3.5, 19.5, 4.5, 14.5);
    ctx.bezierCurveTo(5.2, 11, 7.5, 9.5, 8, 6.5);
    ctx.bezierCurveTo(9.5, 9, 10.5, 9.5, 11, 8);
    ctx.bezierCurveTo(11.6, 6, 12.2, 3, 13, 0);
    ctx.closePath();
    ctx.fill();

    // Der helle Kern - macht aus der Silhouette erst eine Flamme.
    ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
    ctx.beginPath();
    ctx.moveTo(12.5, 11);
    ctx.bezierCurveTo(14.5, 14, 15.5, 16, 15.5, 18.5);
    ctx.bezierCurveTo(15.5, 21.5, 14, 22.5, 12, 22.5);
    ctx.bezierCurveTo(10, 22.5, 8.5, 21, 8.5, 18.5);
    ctx.bezierCurveTo(8.5, 16, 11, 14.5, 12.5, 11);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
}

/* ----------------------------------------------------------
   Die einzelnen Blöcke
   ---------------------------------------------------------- */

/**
 * Der Hintergrund, komplett gezeichnet.
 *
 * Vorher lag hier ein fertiges Bild. Es sah nach KI aus - weiche, beliebige
 * Formen ohne Bezug zum Raster, auf das die Panels danach gelegt wurden. Ein
 * gezeichneter Grund hat den umgekehrten Vorteil: er kennt die Maße der Karte
 * und kann sich daran ausrichten.
 *
 * Aufbau von unten nach oben, nach der Vorgabe "clean > maximal viele Effekte":
 *
 *   1. Grundton mit leichtem Verlauf     - kein flaches Schwarz
 *   2. zwei weiche Lichter               - rot unten rechts, blau oben links
 *   3. schräge Bänder                    - Tiefe, ohne etwas darzustellen
 *   4. Raster                            - kaum sichtbar, gibt der Fläche Halt
 *   5. Neonlinien in den Ecken           - die einzigen scharfen Kanten
 *   6. Vignette                          - zieht den Blick nach innen
 */
function drawBackground(ctx: SKRSContext2D): void {
    // --- 1. Grundton ----------------------------------------------------
    const base = ctx.createLinearGradient(0, 0, CARD_WIDTH * 0.6, CARD_HEIGHT);
    base.addColorStop(0, "#0a0e14");
    base.addColorStop(0.55, COLORS.base);
    base.addColorStop(1, "#07090d");

    ctx.fillStyle = base;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    // --- 2. Zwei Lichter -------------------------------------------------
    // Rot unten rechts, wo in der Vorlage das Auto stand: die Ecke bleibt warm,
    // ohne dass dort etwas Erkennbares liegt.
    const warm = ctx.createRadialGradient(
        CARD_WIDTH * 0.86,
        CARD_HEIGHT * 0.78,
        0,
        CARD_WIDTH * 0.86,
        CARD_HEIGHT * 0.78,
        CARD_WIDTH * 0.62
    );
    warm.addColorStop(0, "rgba(255, 30, 45, 0.22)");
    warm.addColorStop(0.45, "rgba(190, 20, 35, 0.09)");
    warm.addColorStop(1, "rgba(255, 30, 45, 0)");

    ctx.fillStyle = warm;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    const cool = ctx.createRadialGradient(
        CARD_WIDTH * 0.08,
        -CARD_HEIGHT * 0.1,
        0,
        CARD_WIDTH * 0.08,
        -CARD_HEIGHT * 0.1,
        CARD_WIDTH * 0.5
    );
    cool.addColorStop(0, "rgba(0, 130, 200, 0.14)");
    cool.addColorStop(1, "rgba(0, 130, 200, 0)");

    ctx.fillStyle = cool;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    // --- 3. Schraege Baender ---------------------------------------------
    // Immer derselbe Winkel wie die abgeschraegten Panel-Ecken. Dadurch wirkt
    // der Grund wie derselbe Bauplan, nur eine Ebene tiefer.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    const bands: [number, number, number, string][] = [
        // x am oberen Rand, Breite, Neigung, Farbe
        [-260, 300, 0.55, "rgba(255, 255, 255, 0.016)"],
        [220, 170, 0.55, "rgba(255, 60, 70, 0.028)"],
        [980, 420, 0.55, "rgba(255, 255, 255, 0.014)"],
        [1420, 190, 0.55, "rgba(0, 175, 255, 0.020)"],
    ];

    for (const [x, width, slant, color] of bands) {
        const shift = CARD_HEIGHT * slant;

        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + width, 0);
        ctx.lineTo(x + width + shift, CARD_HEIGHT);
        ctx.lineTo(x + shift, CARD_HEIGHT);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
    }

    ctx.restore();

    // --- 4. Raster --------------------------------------------------------
    // So schwach, dass man es nicht sieht, sondern nur merkt: die Flaeche wirkt
    // nicht mehr leer, ohne dass etwas darauf steht.
    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.022)";
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let x = 0; x <= CARD_WIDTH; x += 64) {
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, CARD_HEIGHT);
    }

    for (let y = 0; y <= CARD_HEIGHT; y += 64) {
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(CARD_WIDTH, y + 0.5);
    }

    ctx.stroke();
    ctx.restore();

    // --- 5. Neonlinien ----------------------------------------------------
    // Nur in den Ecken, und nur wenige: sie sollen den Rahmen andeuten, nicht
    // mit den Panels darueber konkurrieren.
    const corner = (points: [number, number][], color: string, width: number, alpha: number): void => {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.shadowColor = color;
        ctx.shadowBlur = 18;
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(...(points[0] as [number, number]));

        for (const point of points.slice(1)) ctx.lineTo(...point);

        ctx.stroke();
        ctx.restore();
    };

    corner(
        [
            [0, 150],
            [0, 34],
            [16, 14],
            [300, 14],
            [326, 0],
        ],
        COLORS.red,
        2.5,
        0.55
    );

    corner(
        [
            [CARD_WIDTH, CARD_HEIGHT - 150],
            [CARD_WIDTH, CARD_HEIGHT - 34],
            [CARD_WIDTH - 16, CARD_HEIGHT - 14],
            [CARD_WIDTH - 300, CARD_HEIGHT - 14],
            [CARD_WIDTH - 326, CARD_HEIGHT],
        ],
        COLORS.red,
        2.5,
        0.55
    );

    // Zwei kurze Striche als Akzent, wie Markierungen auf einem Messgeraet.
    corner(
        [
            [CARD_WIDTH - 120, 16],
            [CARD_WIDTH - 40, 16],
        ],
        COLORS.blue,
        2,
        0.4
    );
    corner(
        [
            [40, CARD_HEIGHT - 16],
            [120, CARD_HEIGHT - 16],
        ],
        COLORS.blue,
        2,
        0.4
    );

    // --- 6. Vignette ------------------------------------------------------
    const vignette = ctx.createRadialGradient(
        CARD_WIDTH / 2,
        CARD_HEIGHT / 2,
        CARD_HEIGHT * 0.3,
        CARD_WIDTH / 2,
        CARD_HEIGHT / 2,
        CARD_WIDTH * 0.72
    );
    vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
    vignette.addColorStop(1, "rgba(0, 0, 0, 0.55)");

    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
}

/** Kopf: Avatar, Club-Tag, Name, Discord-Name und der Season-Reward. */
async function drawHeader(ctx: SKRSContext2D, data: IRankCardData): Promise<void> {
    const { profile } = data;
    const top = PAD;
    const height = HEADER_HEIGHT;

    panel(ctx, PAD, top, CARD_WIDTH - PAD * 2, height, { cut: 26, glow: 22 });

    // --- Avatar ---------------------------------------------------------
    const cx = PAD + 108;
    const cy = top + height / 2;
    const radius = 74;

    const avatar = data.avatarURL ? await image(data.avatarURL) : null;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = "rgba(8, 13, 18, 0.9)";
    ctx.fill();
    ctx.clip();

    if (avatar) {
        ctx.drawImage(avatar, cx - radius, cy - radius, radius * 2, radius * 2);
    } else {
        const file = path.join(PLATFORM_ICON_ROOT, "epicgames.png");
        const platform = await image(file);

        if (platform) ctx.drawImage(tinted(file, platform, 92, COLORS.text), cx - 46, cy - 46);
    }

    ctx.restore();

    glow(ctx, COLORS.red, 24, () => {
        ctx.beginPath();
        ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
        ctx.strokeStyle = COLORS.red;
        ctx.lineWidth = 3;
        ctx.stroke();
    });

    // --- Rechts nebeneinander: Season Reward, dann Turnier-Rang (W-0129) --
    const boxH = 172;
    const boxY = top + (height - boxH) / 2;
    const tourW = 404;
    const tourX = CARD_WIDTH - PAD - 22 - tourW;
    const boxW = 360;
    const boxX = tourX - 22 - boxW;

    // --- Name und Club --------------------------------------------------
    const textX = cx + radius + 44;
    let nameY = cy + 14;

    if (profile.club) {
        ctx.fillStyle = COLORS.red;
        ctx.font = "700 34px Oxanium";
        ctx.textBaseline = "alphabetic";
        glow(ctx, COLORS.red, 16, () => ctx.fillText(`[${profile.club?.tag}]`, textX, cy - 52));
    } else {
        nameY = cy - 4;
    }

    const nameSize = fitText(ctx, profile.name, boxX - textX - 30, 76, "800");
    ctx.font = `800 ${nameSize}px Oxanium`;
    ctx.fillStyle = COLORS.text;
    glow(ctx, "rgba(255, 60, 70, 0.55)", 18, () => ctx.fillText(profile.name, textX, nameY));

    if (data.discordName) {
        ctx.font = "500 34px Rajdhani";
        ctx.fillStyle = COLORS.textDim;
        ctx.fillText(`@${data.discordName}`, textX, nameY + 44);
    }

    // --- Season Reward --------------------------------------------------
    panel(ctx, boxX, boxY, boxW, boxH, { cut: 18, border: COLORS.red, glow: 16, fill: "rgba(5, 8, 12, 0.82)" });

    ctx.font = "600 21px Rajdhani";
    ctx.fillStyle = COLORS.text;
    tracked(ctx, "SEASON REWARD LEVEL", boxX + 26, boxY + 38, 2.4);

    const level = profile.seasonLevel;
    const rewardIcon = await image(RewardIconFile(level));

    // Die Stufe traegt die Farbe ihres hoechsten Rangs - derselbe, den das
    // Abzeichen zeigt.
    const rewardColor = TierColor(RewardTier(level));

    if (rewardIcon) drawGlowingIcon(ctx, RewardIconFile(level), rewardIcon, boxX + 22, boxY + 52, 76, rewardColor);
    const rewardText = RewardName(level).toUpperCase();
    const rewardSize = fitText(ctx, rewardText, boxW - 130, 40, "700");

    ctx.font = `700 ${rewardSize}px Oxanium`;
    ctx.fillStyle = rewardColor;
    glow(ctx, rewardColor, 14, () => ctx.fillText(rewardText, boxX + 108, boxY + 96));

    // --- Fortschritt zur nächsten Stufe ---------------------------------
    const wins = Math.min(profile.seasonWins, REWARD_WINS_PER_LEVEL);
    const ratio = level > 0 ? wins / REWARD_WINS_PER_LEVEL : 0;
    const barX = boxX + 108;
    const barY = boxY + 116;
    const barW = boxW - 108 - 92;

    ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
    bevelPath(ctx, barX, barY, barW, 16, 5);
    ctx.fill();

    if (ratio > 0) {
        const fill = ctx.createLinearGradient(barX, 0, barX + barW, 0);
        fill.addColorStop(0, COLORS.rankBlue);
        fill.addColorStop(1, COLORS.blue);

        ctx.fillStyle = fill;
        glow(ctx, COLORS.blue, 14, () => {
            bevelPath(ctx, barX, barY, Math.max(16, barW * ratio), 16, 5);
            ctx.fill();
        });
    }

    ctx.font = "700 26px Orbitron";
    ctx.fillStyle = COLORS.text;
    ctx.fillText(`${Math.round(ratio * 100)}%`, barX + barW + 16, barY + 15);

    await drawTournament(ctx, tourX, boxY, tourW, boxH, profile.tournament ?? null);
}

/** Beschriftung und Wert nebeneinander, als Paar mittig um cx - „MMR 1452“. */
function labelValue(ctx: SKRSContext2D, cx: number, baseline: number, label: string, value: string): void {
    ctx.font = "600 19px Rajdhani";

    const labelW = trackedWidth(ctx, label, 2);

    ctx.font = "800 26px Oxanium";

    const valueW = ctx.measureText(value).width;
    const start = cx - (labelW + 10 + valueW) / 2;

    ctx.font = "600 19px Rajdhani";
    ctx.fillStyle = COLORS.textDim;
    tracked(ctx, label, start, baseline, 2);

    ctx.font = "800 26px Oxanium";
    ctx.fillStyle = COLORS.text;
    ctx.fillText(value, start + labelW + 10, baseline);
}

/**
 * W-0129: Der Turnier-Rang neben dem Season Reward. Goldener Rahmen statt rot,
 * damit er sich wie ein Pokal abhebt; MMR und Spiele mittig darunter, mit Linie
 * und Trenner - dasselbe Muster wie unten in den Modus-Kacheln.
 */
async function drawTournament(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, rank: IPrimeRank | null): Promise<void> {
    panel(ctx, x, y, w, h, { cut: 18, border: COLORS.gold, glow: 16, fill: "rgba(12, 10, 6, 0.86)" });

    // Ein Hauch Gold von oben links.
    const sheen = ctx.createLinearGradient(x, y, x + w * 0.65, y + h);
    sheen.addColorStop(0, "rgba(255, 197, 61, 0.12)");
    sheen.addColorStop(1, "rgba(255, 197, 61, 0)");

    ctx.save();
    bevelPath(ctx, x, y, w, h, 18);
    ctx.fillStyle = sheen;
    ctx.fill();
    ctx.restore();

    const trophyFile = path.join(STAT_ICON_ROOT, "wins.png");
    const trophy = await image(trophyFile);

    if (trophy) ctx.drawImage(tinted(trophyFile, trophy, 22, COLORS.gold), x + 24, y + 20);

    ctx.font = "600 21px Rajdhani";
    ctx.fillStyle = COLORS.gold;
    tracked(ctx, "TURNIER-RANG", x + 54, y + 38, 2.4);

    const ranked = !!rank && rank.tier > 0;
    const tier = ranked ? rank.tier : 0;
    const file = RankIconFile(tier);
    const icon = await image(file);
    const color = TierColor(tier);

    if (icon) drawGlowingIcon(ctx, file, icon, x + 22, y + 50, 68, color);

    const text = ranked ? rank.tierName.toUpperCase() : "UNRANKED";
    const size = fitText(ctx, text, w - 128, 32, "700");

    ctx.font = `700 ${size}px Oxanium`;
    ctx.fillStyle = color;
    glow(ctx, color, 12, () => ctx.fillText(text, x + 104, y + 84));

    ctx.font = "500 21px Rajdhani";
    ctx.fillStyle = COLORS.textDim;
    ctx.fillText(ranked && rank.divisionName ? `DIVISION ${rank.divisionName}` : "NOCH KEIN TURNIER-RANG", x + 104, y + 112);

    const lineY = y + 128;
    const mid = x + w / 2;

    ctx.save();
    ctx.strokeStyle = "rgba(255, 197, 61, 0.28)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + 24, lineY);
    ctx.lineTo(x + w - 24, lineY);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 197, 61, 0.42)";
    ctx.beginPath();
    ctx.moveTo(mid, lineY + 10);
    ctx.lineTo(mid, lineY + 34);
    ctx.stroke();
    ctx.restore();

    labelValue(ctx, x + w * 0.25 + 6, lineY + 31, "MMR", ranked && rank.mmr > 0 ? String(rank.mmr) : "—");
    labelValue(ctx, x + w * 0.75 - 6, lineY + 31, "SPIELE", String(rank?.matches ?? 0));
}

/**
 * W-0129: Die Symbole der Extra-Modi, im 24er-Raster wie SVG-Pfade, als Linie
 * gezeichnet. Eigene Bilder gibt es dafür nicht, und Emoji rendern hier nicht.
 */
const MODE_PATHS: Record<string, string> = {
    heatseeker: "M12 4a8 8 0 1 0 0.01 0zM12 9a3 3 0 1 0 0.01 0zM12 1v4M12 19v4M1 12h4M19 12h4",
    rumble: "M13 2 4 14h7l-1 8 9-12h-7z",
    hoops: "M4 7a8 2.5 0 1 0 16 0a8 2.5 0 1 0-16 0M4 7l3 12h10l3-12M8 7l2 12M16 7l-2 12",
    snowday: "M12 2v20M3.3 7l17.4 10M3.3 17l17.4-10",
    dropshot: "M12 2 21 7v10l-9 5-9-5V7zM12 8l4 2.5v4L12 17l-4-2.5v-4z",
    grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
};

function lineIcon(ctx: SKRSContext2D, key: string, x: number, y: number, size: number, color: string, blur = 10): void {
    const path = MODE_PATHS[key];

    if (!path) return;

    glow(ctx, color, blur, () => {
        ctx.translate(x, y);
        ctx.scale(size / 24, size / 24);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.stroke(new Path2D(path));
    });
}

/** Die Überschrift eines Punkts: Symbol, Titel, Untertitel und eine Linie bis zum Rand. */
async function drawSectionHeading(ctx: SKRSContext2D, y: number, title: string, subtitle: string, icon: "trophy" | "grid" | "target"): Promise<void> {
    if (icon === "grid") {
        lineIcon(ctx, "grid", PAD + 10, y - 34, 42, COLORS.text, 0);
    } else {
        const file = path.join(STAT_ICON_ROOT, icon === "trophy" ? "wins.png" : "shots.png");
        const picture = await image(file);

        if (picture) ctx.drawImage(tinted(file, picture, 46, COLORS.text), PAD + 8, y - 36);
    }

    ctx.font = "800 50px Oxanium";
    ctx.fillStyle = COLORS.text;

    const titleWidth = ctx.measureText(title).width;

    glow(ctx, "rgba(255,60,70,0.5)", 16, () => ctx.fillText(title, PAD + 68, y));

    ctx.font = "500 24px Rajdhani";
    ctx.fillStyle = COLORS.textDim;
    const width = trackedWidth(ctx, subtitle, 5.5);
    tracked(ctx, subtitle, PAD + 70, y + 30, 5.5);

    // Eine dünne Linie, die vom Titel bis zum rechten Rand läuft.
    const lineX = PAD + 80 + Math.max(width, titleWidth, 220);

    glow(ctx, COLORS.red, 10, () => {
        ctx.beginPath();
        ctx.moveTo(lineX, y - 12);
        ctx.lineTo(CARD_WIDTH - PAD - 10, y - 12);
        ctx.strokeStyle = "rgba(255, 30, 45, 0.55)";
        ctx.lineWidth = 2;
        ctx.stroke();
    });
}

/** Eine der drei Playlist-Karten. */
async function drawRankCard(
    ctx: SKRSContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    rank: IPrimeProfile["ranks"][number]
): Promise<void> {
    panel(ctx, x, y, w, h, { cut: 22, glow: 18, fill: "rgba(7, 11, 16, 0.82)" });

    const inner = x + 30;

    // --- Modus ----------------------------------------------------------
    ctx.font = "800 48px Oxanium";
    ctx.fillStyle = COLORS.text;
    ctx.fillText(rank.key, inner, y + 62);

    ctx.font = "500 25px Rajdhani";
    ctx.fillStyle = COLORS.textDim;
    tracked(ctx, PLAYLIST_SUBTITLES[rank.key] ?? "", inner + 2, y + 92, 4);

    // --- Rang -----------------------------------------------------------
    const rowY = y + 118;
    const rowH = 116;

    panel(ctx, inner - 12, rowY, w - 36, rowH, {
        cut: 14,
        border: "rgba(0, 175, 255, 0.32)",
        glow: 8,
        fill: "rgba(10, 16, 24, 0.72)",
        width: 1.5,
    });

    const icon = await image(RankIconFile(rank.tier, rank.placement));

    const tierColor = TierColor(rank.placement ? 0 : rank.tier);

    if (icon) drawGlowingIcon(ctx, RankIconFile(rank.tier, rank.placement), icon, inner - 2, rowY + 12, 92, tierColor);
    const tierText = rank.placement ? `PLATZIERUNG ${rank.placementMatches}/${PLACEMENT_MATCHES}` : rank.tierName.toUpperCase();
    const tierSize = fitText(ctx, tierText, w - 160, 34, "700");

    ctx.font = `700 ${tierSize}px Oxanium`;
    ctx.fillStyle = tierColor;
    glow(ctx, tierColor, 12, () => ctx.fillText(tierText, inner + 100, rowY + 58));

    // Solange die Platzierungsspiele laufen, steht noch keine Division fest -
    // Prime liefert zwar eine, aber das Spiel zeigt sie selbst nicht.
    const division = rank.placement
        ? `NOCH ${PLACEMENT_MATCHES - rank.placementMatches} SPIELE`
        : rank.divisionName
          ? `DIVISION ${rank.divisionName}`
          : "OHNE DIVISION";

    ctx.font = "500 24px Rajdhani";
    ctx.fillStyle = COLORS.textDim;
    ctx.fillText(division, inner + 100, rowY + 90);

    // --- MMR mittig, darunter Streak | Spiele (W-0129) ------------------
    const mmrLabelY = rowY + rowH + 38;

    drawCenteredMMR(ctx, x + w / 2, mmrLabelY, rank.mmr > 0 ? String(rank.mmr) : "—", 1);
    await drawStatsRow(ctx, x + 24, w - 48, mmrLabelY + 82, rank, ["AKTUELLE STREAK", "GESPIELTE SPIELE"], 1);
}

/**
 * Zentrierter Text mit Sperrung. letterSpacing haengt auch hinter den letzten
 * Buchstaben noch einen Abstand - das halbe Spatium gleicht es wieder aus.
 */
function centered(ctx: SKRSContext2D, text: string, cx: number, y: number, spacing: number): void {
    ctx.save();
    ctx.textAlign = "center";
    ctx.letterSpacing = `${spacing}px`;
    ctx.fillText(text, cx + spacing / 2, y);
    ctx.restore();
}

/** „MMR“ und darunter die Zahl, beides mittig. scale 1 für die Hauptmodi, kleiner für die Extra-Modi. */
function drawCenteredMMR(ctx: SKRSContext2D, cx: number, labelY: number, value: string, scale: number): void {
    ctx.font = `700 ${Math.round(22 * scale)}px Rajdhani`;
    ctx.fillStyle = COLORS.textDim;
    centered(ctx, "MMR", cx, labelY, 3);

    ctx.save();
    ctx.textAlign = "center";
    ctx.font = `800 ${Math.round(64 * scale)}px Oxanium`;
    ctx.fillStyle = COLORS.text;
    glow(ctx, "rgba(255, 255, 255, 0.25)", 12, () => ctx.fillText(value, cx, labelY + Math.round(60 * scale)));
    ctx.restore();
}

/**
 * W-0129, „Test mit Trennern“: eine Linie über die Breite, darunter Streak und
 * Spiele nebeneinander, getrennt durch einen senkrechten Strich - dasselbe
 * Muster wie beim Turnier-Rang. Symbol und Wert stehen als Paar mittig in ihrer
 * Hälfte, die Beschriftung mittig darunter.
 *
 * Jedes Symbol sitzt mit der Unterkante auf der Grundlinie seines Wertes, wie
 * ein Buchstabe ohne Unterlänge. Ohne Serie keine Flamme, nur der Strich.
 */
async function drawStatsRow(ctx: SKRSContext2D, left: number, width: number, top: number, rank: IPrimeRank | null, labels: readonly [string, string], scale: number): Promise<void> {
    const mid = left + width / 2;

    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left + width, top);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
    ctx.beginPath();
    ctx.moveTo(mid, top + 12 * scale);
    ctx.lineTo(mid, top + 76 * scale);
    ctx.stroke();
    ctx.restore();

    const valueY = top + 42 * scale;
    const labelY = top + 68 * scale;
    const halves = [left + width / 4, left + (width * 3) / 4] as const;
    const iconSize = Math.round(26 * scale);
    const space = 8 * scale;
    // Prime liefert die Serie aus der letzten Season mit. Ohne ein Spiel in
    // dieser Season stünde sonst „2x“ neben „0 Spiele“.
    const raw = rank && rank.matches > 0 ? rank.streak : 0;
    const streak = Math.abs(raw);
    const streakColor = streak === 0 ? COLORS.textDim : raw > 0 ? COLORS.win : COLORS.loss;

    ctx.textAlign = "left";
    ctx.font = `700 ${Math.round(28 * scale)}px Oxanium`;

    // Streak
    const streakText = streak === 0 ? "—" : `${streak}x`;
    const streakWidth = ctx.measureText(streakText).width;
    let sx = halves[0] - ((streak > 0 ? iconSize + space : 0) + streakWidth) / 2;

    if (streak > 0) {
        flame(ctx, sx, valueY - iconSize, iconSize, streakColor);
        sx += iconSize + space;
    }

    ctx.fillStyle = streakColor;
    ctx.fillText(streakText, sx, valueY);

    // Spiele
    const gamesText = String(rank?.matches ?? 0);
    const gamesWidth = ctx.measureText(gamesText).width;
    const trophyFile = path.join(STAT_ICON_ROOT, "wins.png");
    const trophy = await image(trophyFile);
    let gx = halves[1] - ((trophy ? iconSize + space : 0) + gamesWidth) / 2;

    if (trophy) {
        ctx.drawImage(tinted(trophyFile, trophy, iconSize, COLORS.textDim), gx, valueY - iconSize);
        gx += iconSize + space;
    }

    ctx.font = `700 ${Math.round(28 * scale)}px Oxanium`;
    ctx.fillStyle = COLORS.text;
    ctx.fillText(gamesText, gx, valueY);

    // Beschriftungen
    ctx.font = `600 ${Math.round(18 * scale)}px Rajdhani`;
    ctx.fillStyle = COLORS.textDim;
    centered(ctx, labels[0], halves[0], labelY, 2 * scale);
    centered(ctx, labels[1], halves[1], labelY, 2 * scale);
}

/**
 * W-0129: Eine Kachel der Extra-Modi. Wie die Hauptmodi, nur kleiner: Farbleiste
 * und Symbol des Modus oben, Rang mit Division, MMR mittig, Streak | Spiele.
 * Liefert Prime den Modus nicht oder ist noch nichts gespielt, steht die
 * Platzierung da und statt der MMR ein Strich.
 */
async function drawExtraCard(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, mode: { key: string; label: string }, rank: IPrimeRank | null): Promise<void> {
    panel(ctx, x, y, w, h, { cut: 18, glow: 14, fill: "rgba(7, 11, 16, 0.82)" });

    const accent = EXTRA_MODE_COLORS[mode.key] ?? COLORS.red;

    glow(ctx, accent, 12, () => {
        ctx.fillStyle = accent;
        ctx.fillRect(x + 22, y + 1, w - 44, 4);
    });

    lineIcon(ctx, mode.key, x + 22, y + 24, 26, accent);

    ctx.font = "700 24px Rajdhani";
    ctx.fillStyle = COLORS.text;
    tracked(ctx, mode.label.toUpperCase(), x + 58, y + 46, 2);

    // --- Rang -----------------------------------------------------------
    const rowY = y + 64;
    const rowH = 92;

    panel(ctx, x + 14, rowY, w - 28, rowH, {
        cut: 12,
        border: "rgba(0, 175, 255, 0.32)",
        glow: 6,
        fill: "rgba(10, 16, 24, 0.72)",
        width: 1.5,
    });

    const placement = !rank || rank.placement;
    const tier = placement ? 0 : rank.tier;
    const file = RankIconFile(tier, placement);
    const icon = await image(file);
    const color = TierColor(tier);

    if (icon) drawGlowingIcon(ctx, file, icon, x + 22, rowY + 16, 60, color);

    // Fünf Kacheln nebeneinander sind schmal. Passt der lange Name nicht mehr in
    // lesbarer Größe, kommt die Kurzform - wie im Entwurf („GRAND CHAMP I“).
    const textX = x + 92;
    const textMax = x + w - 24 - textX;
    const full = !rank ? "UNRANKED" : rank.placement ? `PLATZIERUNG ${rank.placementMatches}/${PLACEMENT_MATCHES}` : rank.tierName.toUpperCase();
    const short = full.replace("GRAND CHAMPION", "GRAND CHAMP").replace("SUPERSONIC LEGEND", "SSL").replace("PLATZIERUNG", "PLATZ.");
    const text = fitText(ctx, full, textMax, 24, "700") >= 20 ? full : short;
    const size = fitText(ctx, text, textMax, 24, "700");

    ctx.font = `700 ${size}px Oxanium`;
    ctx.fillStyle = color;
    glow(ctx, color, 10, () => ctx.fillText(text, textX, rowY + 44));

    const sub = !rank
        ? "NOCH KEIN SPIEL"
        : rank.placement
          ? `NOCH ${PLACEMENT_MATCHES - rank.placementMatches} SPIELE`
          : rank.divisionName
            ? `DIVISION ${rank.divisionName}`
            : "OHNE DIVISION";

    ctx.font = "500 19px Rajdhani";
    ctx.fillStyle = COLORS.textDim;
    ctx.fillText(sub, textX, rowY + 72);

    // --- MMR und Streak | Spiele ------------------------------------------
    // Nie gespielt: Prime liefert trotzdem einen Startwert. Der ist keine MMR des
    // Spielers, deshalb ein Strich.
    const played = !!rank && (rank.matches > 0 || rank.placementMatches > 0);
    const mmrLabelY = rowY + rowH + 36;

    drawCenteredMMR(ctx, x + w / 2, mmrLabelY, played && rank.mmr > 0 ? String(rank.mmr) : "—", 0.72);
    await drawStatsRow(ctx, x + 18, w - 36, mmrLabelY + 66, rank, ["STREAK", "SPIELE"], 0.8);
}

/**
 * W-0129: Die Karriere als eigener Punkt - sechs Kacheln, je Wert eine. Das
 * Symbol in der Farbe des Werts mit Schein, darunter Beschriftung und Zahl.
 */
async function drawCareer(ctx: SKRSContext2D, y: number, height: number, profile: IPrimeProfile): Promise<void> {
    // Die Werte liegen bei Prime unter ihrem Schlüssel - fehlt einer, steht dort
    // eine Null statt einer Lücke.
    const values = new Map(profile.stats.map((stat) => [stat.key, stat.value]));
    const gap = 18;
    const tileW = (CARD_WIDTH - PAD * 2 - gap * (CAREER_ORDER.length - 1)) / CAREER_ORDER.length;

    for (const [index, key] of CAREER_ORDER.entries()) {
        const x = PAD + (tileW + gap) * index;
        const cx = x + tileW / 2;
        const file = path.join(STAT_ICON_ROOT, `${key}.png`);
        const icon = await image(file);
        const color = CAREER_COLORS[key] ?? COLORS.text;

        panel(ctx, x, y, tileW, height, { cut: 16, glow: 12, fill: "rgba(6, 10, 15, 0.84)" });

        if (icon) {
            const stamp = tinted(file, icon, 52, color);

            glow(ctx, color, 16, () => ctx.drawImage(stamp, cx - 26, y + 22));
            ctx.drawImage(stamp, cx - 26, y + 22);
        }

        ctx.font = "600 20px Rajdhani";
        ctx.fillStyle = COLORS.textDim;
        centered(ctx, CAREER_LABELS[key] ?? key.toUpperCase(), cx, y + 110, 3);

        ctx.save();
        ctx.textAlign = "center";
        ctx.font = "800 40px Oxanium";
        ctx.fillStyle = COLORS.text;
        glow(ctx, "rgba(255,255,255,0.18)", 10, () => ctx.fillText(new Intl.NumberFormat("de-DE").format(values.get(key) ?? 0), cx, y + 154));
        ctx.restore();
    }
}

/** "vor 3 Minuten", "vor 2 Stunden" - grob reicht, es geht um die Groessenordnung. */
function ago(iso: string): string {
    const at = Date.parse(iso);

    if (Number.isNaN(at)) return "unbekannt";

    const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));

    if (seconds < 90) return "gerade eben";

    const minutes = Math.round(seconds / 60);

    if (minutes < 60) return `vor ${minutes} Minuten`;

    const hours = Math.round(minutes / 60);

    if (hours < 24) return `vor ${hours} Stunde${hours === 1 ? "" : "n"}`;

    const days = Math.round(hours / 24);

    return `vor ${days} Tag${days === 1 ? "" : "en"}`;
}

/**
 * Der Stand am unteren Rand, links.
 *
 * Ohne diese Zeile ist einer Karte nicht anzusehen, ob die Zahlen von jetzt oder
 * von gestern sind - und genau das ist der Fall, wenn Prime gerade nicht
 * antwortet und der gespeicherte Stand einspringt. Dann wird die Zeile orange
 * und sagt auch warum.
 */
function drawFreshness(ctx: SKRSContext2D, profile: IPrimeProfile): void {
    const stale = profile.stale === true;
    const text = stale
        ? `Rocket League antwortet gerade nicht, angezeigt wird der Stand von ${ago(profile.fetchedAt)}`
        : `Stand ${ago(profile.fetchedAt)} · wird alle 10 Minuten erneuert`;

    // Links unten, nicht rechts: rechts unten laeuft die rote Eckklammer des
    // Hintergrunds durch, und der Text lag genau darauf. Links steht dort nur
    // ein kurzer blauer Strich, und der bleibt unter der Grundlinie.
    //
    // Die Grundlinie sitzt mittig im freien Band zwischen Karriere-Leiste und
    // Kartenrand, statt am Rand zu kleben.
    const baseline = CARD_HEIGHT - 30;
    let x = PAD + 4;

    ctx.save();
    ctx.textAlign = "left";

    if (stale) {
        // Ein kleines Warndreieck davor - die Farbe allein traegt die Aussage
        // nicht, wenn jemand sie nicht unterscheiden kann.
        ctx.beginPath();
        ctx.moveTo(x + 9, baseline - 15);
        ctx.lineTo(x + 18, baseline);
        ctx.lineTo(x, baseline);
        ctx.closePath();
        ctx.fillStyle = "#ffa03d";
        ctx.fill();

        ctx.fillStyle = COLORS.base;
        ctx.font = "700 11px Rajdhani";
        ctx.textAlign = "center";
        ctx.fillText("!", x + 9, baseline - 2);

        ctx.textAlign = "left";
        x += 26;
    }

    ctx.font = `${stale ? "600" : "500"} 19px Rajdhani`;
    ctx.fillStyle = stale ? "#ffa03d" : "rgba(168, 176, 188, 0.65)";
    ctx.fillText(text, x, baseline);
    ctx.restore();
}

/* ----------------------------------------------------------
   Die ganze Karte
   ---------------------------------------------------------- */
export async function RenderRankCard(data: IRankCardData): Promise<Buffer> {
    // Erst die Schriften, dann zeichnen - sonst faellt die erste Karte nach dem
    // Start auf eine Systemschrift zurueck.
    await RegisterFonts();

    const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
    const ctx = canvas.getContext("2d");

    ctx.textBaseline = "alphabetic";

    drawBackground(ctx);
    await drawHeader(ctx, data);

    const width = CARD_WIDTH - PAD * 2;

    // --- Ranked: die drei Hauptmodi ---------------------------------------
    const rankedY = PAD + HEADER_HEIGHT + SECTION_GAP;

    await drawSectionHeading(ctx, rankedY, "RANKED", "HAUPTMODI", "trophy");

    const mainY = rankedY + SECTION_BODY;
    const mainW = (width - GAP * 2) / 3;

    // Fehlt eine Playlist, bleibt ihr Platz frei statt die anderen zu verschieben -
    // drei Spalten sind drei Spalten.
    for (const [index, key] of (["1v1", "2v2", "3v3"] as const).entries()) {
        const rank = data.profile.ranks.find((entry) => entry.key === key);

        if (!rank) continue;

        await drawRankCard(ctx, PAD + (mainW + GAP) * index, mainY, mainW, MAIN_CARD_HEIGHT, rank);
    }

    // --- Extra-Modi --------------------------------------------------------
    // Immer alle fünf, auch ohne Daten: die Reihe soll nicht je Spieler anders
    // aussehen. Ältere gespeicherte Stände haben noch keine extras.
    const extraHeadY = mainY + MAIN_CARD_HEIGHT + SECTION_GAP;

    await drawSectionHeading(ctx, extraHeadY, "EXTRA-MODI", "COMPETITIVE", "grid");

    const extraY = extraHeadY + SECTION_BODY;
    const extraW = (width - GAP * (EXTRA_PLAYLISTS.length - 1)) / EXTRA_PLAYLISTS.length;

    for (const [index, mode] of EXTRA_PLAYLISTS.entries()) {
        const rank = data.profile.extras?.find((entry) => entry.key === mode.key) ?? null;

        await drawExtraCard(ctx, PAD + (extraW + GAP) * index, extraY, extraW, EXTRA_CARD_HEIGHT, mode, rank);
    }

    // --- Karriere ------------------------------------------------------------
    const careerHeadY = extraY + EXTRA_CARD_HEIGHT + SECTION_GAP;

    await drawSectionHeading(ctx, careerHeadY, "KARRIERE", "STATISTIK", "target");
    await drawCareer(ctx, careerHeadY + SECTION_BODY, CAREER_CARD_HEIGHT, data.profile);

    drawFreshness(ctx, data.profile);

    return canvas.encode("png");
}
