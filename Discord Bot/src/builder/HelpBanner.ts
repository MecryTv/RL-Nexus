import { SKRSContext2D, createCanvas, loadImage } from "@napi-rs/canvas";
import { RegisterFonts } from "./RankCard";
import { DrawText, Fit, LoadEmojis } from "./HelpImage";

/**
 * Das Banner oben auf der Startseite von /hilfe (W-0014, Entwurf B): dunkler
 * Verlauf, rot oben rechts, blau unten links, Logo, „RL NEXUS“ und
 * „Willkommen, <Name>“. 1100 × 280, Discord zeigt es in voller Breite.
 */

const WIDTH = 1100;
const HEIGHT = 280;
const LOGO = 150;
const TEXT_LEFT = 64 + LOGO + 40;
const TEXT_MAX = WIDTH - TEXT_LEFT - 200;

function Glow(ctx: SKRSContext2D, x: number, y: number, radius: number, color: string): void {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);

    glow.addColorStop(0, color);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function RoundRect(ctx: SKRSContext2D, x: number, y: number, size: number, radius: number): void {
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, radius);
}

export async function RenderHelpBanner(input: { name: string; avatar: Buffer | null }): Promise<Buffer> {
    await RegisterFonts();
    await LoadEmojis([input.name]);

    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext("2d");
    const base = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);

    base.addColorStop(0, "#0b0f15");
    base.addColorStop(1, "#141a24");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    Glow(ctx, WIDTH * 0.85, HEIGHT * 0.1, 520, "rgba(255,30,45,0.45)");
    Glow(ctx, 0, HEIGHT, 480, "rgba(0,175,255,0.30)");

    // Streifen rechts, schräg wie im Entwurf.
    ctx.save();
    ctx.beginPath();
    ctx.rect(WIDTH - 240, 0, 240, HEIGHT);
    ctx.clip();
    ctx.fillStyle = "rgba(255,30,45,0.18)";

    for (let x = WIDTH - 420; x < WIDTH + 120; x += 34) {
        ctx.beginPath();
        ctx.moveTo(x, HEIGHT);
        ctx.lineTo(x + 14, HEIGHT);
        ctx.lineTo(x + 14 + HEIGHT * 0.47, 0);
        ctx.lineTo(x + HEIGHT * 0.47, 0);
        ctx.closePath();
        ctx.fill();
    }

    ctx.restore();

    // Logo-Kachel.
    const logoX = 64;
    const logoY = (HEIGHT - LOGO) / 2;

    RoundRect(ctx, logoX, logoY, LOGO, 28);
    ctx.fillStyle = "#0b0d10";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 2;
    ctx.stroke();

    const logo = input.avatar ? await loadImage(input.avatar).catch(() => null) : null;

    if (logo) {
        ctx.save();
        RoundRect(ctx, logoX + 14, logoY + 14, LOGO - 28, 20);
        ctx.clip();
        ctx.drawImage(logo, logoX + 14, logoY + 14, LOGO - 28, LOGO - 28);
        ctx.restore();
    } else {
        ctx.fillStyle = "#ff1e2d";
        ctx.font = "800 84px Orbitron";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("N", logoX + LOGO / 2, logoY + LOGO / 2 + 4);
        ctx.textAlign = "left";
    }

    // RL NEXUS
    ctx.textBaseline = "alphabetic";
    ctx.font = "700 64px Orbitron";
    ctx.fillStyle = "#ffffff";
    ctx.fillText("RL ", TEXT_LEFT, HEIGHT / 2 + 6);

    const rl = ctx.measureText("RL ").width;

    ctx.fillStyle = "#ff1e2d";
    ctx.fillText("NEXUS", TEXT_LEFT + rl, HEIGHT / 2 + 6);

    // Willkommen, <Name> - Emojis im Namen als Twemoji wie in den Seiten darunter.
    ctx.font = "700 30px Rajdhani";
    ctx.fillStyle = "#e4e8ee";
    DrawText(ctx, Fit(ctx, `WILLKOMMEN, ${input.name.toUpperCase()}`, TEXT_MAX), TEXT_LEFT + 4, HEIGHT / 2 + 52);

    return canvas.toBuffer("image/png");
}
