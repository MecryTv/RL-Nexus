import { createCanvas, loadImage } from "@napi-rs/canvas";
import { ApplicationEmoji } from "discord.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import BotClient from "../client/BotClient";
import { TIER_SHORT } from "../constants/Prime";
import { ROLE_ORDER } from "../constants/Teams";
import { TeamRole } from "../interfaces/services/teams/ITeams";
import logger from "../utils/logger";

/** Die Rang-Abzeichen, je Stufe eine Datei - der Index ist die Stufe wie in TIERS. */
export const RANK_ICON_ROOT = path.join(process.cwd(), "src", "images", "default", "rocketleague", "rlranks");

export const RANK_ICON_FILES = [
    "Unranked",
    "Bronze 1",
    "Bronze 2",
    "Bronze 3",
    "Silver 1",
    "Silver 2",
    "Silver 3",
    "Gold 1",
    "Gold 2",
    "Gold 3",
    "Platin 1",
    "Platin 2",
    "Platin 3",
    "Diamond 1",
    "Diamond 2",
    "Diamond 3",
    "Champion 1",
    "Champion 2",
    "Champion 3",
    "Grand Champion 1",
    "Grand Champion 2",
    "Grand Champion 3",
    "Super Sonic Legend",
];

/** So heißt das Emoji einer Stufe: rl_gc1, rl_c3, rl_ssl, rl_unranked. */
export function RankIconName(tier: number): string {
    return tier === 0 ? "rl_unranked" : `rl_${(TIER_SHORT[tier] ?? "x").toLowerCase()}`;
}

/**
 * Ein Bild auf Emoji-Größe: Discord zeigt Emojis höchstens 128 Pixel groß und
 * nimmt nicht mehr als 256 KB. Ein Bild, das nicht quadratisch ist, steht
 * mittig, statt verzerrt zu werden.
 */
export async function IconImage(source: Buffer): Promise<Buffer> {
    const image = await loadImage(source);
    const scale = Math.min(128 / image.width, 128 / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    const canvas = createCanvas(128, 128);

    canvas.getContext("2d").drawImage(image, (128 - width) / 2, (128 - height) / 2, width, height);

    return canvas.toBuffer("image/png");
}

export async function RankIconImage(tier: number): Promise<Buffer> {
    return IconImage(await readFile(path.join(RANK_ICON_ROOT, `${RANK_ICON_FILES[tier]}.png`)));
}

/**
 * Die Abzeichen der Aufgaben. Je Aufgabe liegt dort ein PNG - das zeigt die
 * Galerie unter Vorlagen › rocketleague › teamicons, und daraus macht der Bot
 * seine Emojis - und die SVG von Lucide, aus der es gemalt ist (ISC,
 * LICENSE.txt liegt daneben). Neu malen: npm run icons:teams.
 */
export const ROLE_ICON_ROOT = path.join(process.cwd(), "src", "images", "default", "rocketleague", "teamicons");

/** So heißen die PNGs - so stehen sie auch in der Galerie. */
export const ROLE_ICON_FILES: Record<TeamRole, string> = {
    captain: "Captain",
    cocaptain: "Co-Captain",
    player: "Stamm",
    sub: "Ersatz",
    trial: "Trial",
    coach: "Coach",
    manager: "Manager",
};

/** Die Farbe je Aufgabe - dunkel genug, dass das weiße Icon darauf noch 3:1 Kontrast hat. */
export const ROLE_ICON_COLORS: Record<TeamRole, string> = {
    captain: "#b8860b",
    cocaptain: "#ea580c",
    player: "#2563eb",
    sub: "#0d9488",
    trial: "#9333ea",
    coach: "#16a34a",
    manager: "#dc2626",
};

/** So heißt das Emoji einer Aufgabe: rl_role_captain, rl_role_sub … */
export function RoleIconName(role: TeamRole): string {
    return `rl_role_${role}`;
}

/** Das Abzeichen einer Aufgabe aus der Galerie, auf Emoji-Größe. */
export async function RoleIconImage(role: TeamRole): Promise<Buffer> {
    return IconImage(await readFile(path.join(ROLE_ICON_ROOT, `${ROLE_ICON_FILES[role]}.png`)));
}

/** Malt ein Abzeichen aus der SVG: rund, in der Farbe der Aufgabe, darauf das Icon in Weiß. Für npm run icons:teams. */
export async function RoleBadge(role: TeamRole): Promise<Buffer> {
    // Lucide zeichnet in currentColor - ohne Seite drumherum wäre das schwarz. Etwas
    // kräftiger als ab Werk, damit es auch in Emoji-Größe noch zu erkennen ist.
    const svg = (await readFile(path.join(ROLE_ICON_ROOT, `${role}.svg`), "utf8"))
        .replace(/currentColor/g, "#ffffff")
        .replace(/stroke-width="[\d.]+"/, 'stroke-width="2.5"')
        .replace(/(?<![\w-])(width|height)="24"/g, '$1="76"');
    const icon = await loadImage(Buffer.from(svg));
    const canvas = createCanvas(128, 128);
    const context = canvas.getContext("2d");

    context.fillStyle = ROLE_ICON_COLORS[role];
    context.beginPath();
    context.arc(64, 64, 64, 0, Math.PI * 2);
    context.fill();
    context.drawImage(icon, 26, 26, 76, 76);

    return canvas.toBuffer("image/png");
}

/** "<:rl_gc1:123…>" */
function Mention(emoji: ApplicationEmoji | undefined): string | null {
    return emoji ? `<:${emoji.name}:${emoji.id}>` : null;
}

/**
 * Die Abzeichen der Ränge und der Aufgaben als Emojis. Sie gehören dem Bot
 * selbst (App-Emojis): sie gehen auf jedem Server, und kein Server muss dafür
 * Emoji-Plätze hergeben. Beim Start sieht der Bot nach, welche fehlen, und lädt
 * nur die hoch - danach kostet es nichts mehr. Fehlt eins, steht der Text da.
 */
export default class RankIconService {
    private readonly client: BotClient;
    private readonly icons = new Map<number, ApplicationEmoji>();
    private readonly roles = new Map<TeamRole, ApplicationEmoji>();

    constructor(client: BotClient) {
        this.client = client;
    }

    async Initialize(): Promise<void> {
        const application = this.client.application;

        if (!application) return;

        const existing = await application.emojis.fetch();
        let made = 0;
        // Was es schon gibt, bleibt; was fehlt, wird einmal angelegt.
        const ensure = async (name: string, image: () => Promise<Buffer>): Promise<ApplicationEmoji | null> => {
            const found = existing.find((entry) => entry.name === name);

            if (found) return found;

            const emoji = await image()
                .then((attachment) => application.emojis.create({ attachment, name }))
                .catch((error) => {
                    logger.warn(`🎖️  Icon ${name} ließ sich nicht anlegen: ${String(error)}`);

                    return null;
                });

            if (emoji) made++;

            return emoji;
        };

        for (let tier = 0; tier < RANK_ICON_FILES.length; tier++) {
            const emoji = await ensure(RankIconName(tier), () => RankIconImage(tier));

            if (emoji) this.icons.set(tier, emoji);
        }

        for (const role of ROLE_ORDER) {
            const emoji = await ensure(RoleIconName(role), () => RoleIconImage(role));

            if (emoji) this.roles.set(role, emoji);
        }

        if (made) logger.info(`🎖️  ${made} Icons als App-Emojis angelegt`);
    }

    /** "<:rl_gc1:123…>" - null, solange es das Icon nicht gibt. */
    Of(tier: number): string | null {
        return Mention(this.icons.get(tier));
    }

    /** "<:rl_role_captain:123…>" - null, solange es das Abzeichen nicht gibt. */
    OfRole(role: TeamRole): string | null {
        return Mention(this.roles.get(role));
    }

    /** Ob ein Emoji eins von seinen ist - die darf jeder Server auch als eigenes Abzeichen nehmen. */
    Owns(id: string): boolean {
        return [...this.icons.values(), ...this.roles.values()].some((emoji) => emoji.id === id);
    }

    /**
     * Ein eigenes Abzeichen als App-Emoji, aus einem Bild der Galerie. Gibt es den
     * Namen schon, nimmt er das vorhandene. null: es ließ sich nicht anlegen.
     * ponytail: ein App-Emoji je Server und Bild-Abzeichen - Discord erlaubt 2000 je
     * App; bei sehr vielen Servern mit eigenen Bildern auf Server-Emojis umstellen.
     */
    async Upload(name: string, image: Buffer): Promise<string | null> {
        const application = this.client.application;

        if (!application) return null;

        const existing = (await application.emojis.fetch().catch(() => null))?.find((entry) => entry.name === name);
        const emoji =
            existing ??
            (await IconImage(image)
                .then((attachment) => application.emojis.create({ attachment, name }))
                .catch((error) => {
                    logger.warn(`🎖️  Abzeichen ${name} ließ sich nicht anlegen: ${String(error)}`);

                    return null;
                }));

        return Mention(emoji ?? undefined);
    }

    /** Ein eigenes Abzeichen wieder weg - nur, was der Bot dafür angelegt hat (rlb_…), nie die Standard-Icons. */
    async Remove(mention: string): Promise<void> {
        const match = /^<a?:(rlb_\w+):(\d{17,20})>$/.exec(mention);

        if (!match || !this.client.application) return;

        await this.client.application.emojis.delete(match[2]).catch(() => undefined);
    }

    /** Für die Vorschau im Dashboard: Name und Bild je Icon, Ränge und Aufgaben. */
    get List(): { id: string; name: string; animated: boolean; url: string }[] {
        return [...this.icons.values(), ...this.roles.values()].map((emoji) => ({ id: emoji.id, name: emoji.name ?? "", animated: false, url: emoji.imageURL({ size: 64 }) }));
    }
}
