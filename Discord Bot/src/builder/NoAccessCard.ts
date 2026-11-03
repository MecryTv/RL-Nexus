import { createCanvas, SKRSContext2D } from "@napi-rs/canvas";
import { RegisterFonts } from "./RankCard";

/**
 * W-0064, Punkt 5 (Entwurf C-B, Text überarbeitet): kleines Bild als Antwort
 * auf Commands, wenn kein Admin des Servers Zugang hat. Stil wie die DMs:
 * dunkel, roter Streifen oben, Titel in Oxanium. Je Servername einmal
 * gezeichnet, danach aus dem Speicher.
 */

const W = 720;
const PAD = 28;

export const NO_ACCESS_TITLE = "Kein Admin mit Zugang";

/** Admins (Recht „Server verwalten“) können selbst Zugang holen, alle anderen wenden sich an sie. */
export function NoAccessText(guildName: string, manager: boolean): string {
    return manager
        ? `Auf ${guildName} hat gerade kein Admin Zugang zu RL Nexus. Mindestens einer braucht ihn, du oder ein anderer Admin mit „Server verwalten“. Dann gehen die Commands wieder.`
        : `Auf ${guildName} hat gerade kein Admin Zugang zu RL Nexus, deshalb gehen die Commands nicht. Wende dich an den Owner oder einen Admin des Servers.`;
}

function wrap(ctx: SKRSContext2D, text: string, width: number): string[] {
    const lines: string[] = [];
    let line = "";

    for (const word of text.split(" ")) {
        const next = line ? `${line} ${word}` : word;

        if (ctx.measureText(next).width <= width || !line) line = next;
        else {
            lines.push(line);
            line = word;
        }
    }

    if (line) lines.push(line);

    return lines.slice(0, 4);
}

const cache = new Map<string, Buffer>();

export async function RenderNoAccess(guildName: string, manager: boolean): Promise<Buffer> {
    const key = `${manager ? "admin" : "mitglied"}:${guildName}`;
    const hit = cache.get(key);
    if (hit) return hit;

    await RegisterFonts();

    const probe = createCanvas(W, 10).getContext("2d");
    probe.font = "600 20px Rajdhani";
    const lines = wrap(probe, NoAccessText(guildName, manager), W - 2 * PAD);
    const height = 96 + lines.length * 26 + PAD;
    const canvas = createCanvas(W, height);
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#2b2d31";
    ctx.fillRect(0, 0, W, height);
    ctx.fillStyle = "#f23f43";
    ctx.fillRect(0, 0, W, 6);
    ctx.fillStyle = "#f2f3f5";
    ctx.font = "800 28px Oxanium";
    ctx.fillText(NO_ACCESS_TITLE, PAD, 54);
    ctx.fillStyle = "#c9ced6";
    ctx.font = "600 20px Rajdhani";
    lines.forEach((line, index) => ctx.fillText(line, PAD, 90 + index * 26));

    const png = canvas.toBuffer("image/png");

    // ponytail: Speicher je Servername ohne Obergrenze; bei sehr vielen Servern ein LRU daraus machen.
    cache.set(key, png);

    return png;
}
