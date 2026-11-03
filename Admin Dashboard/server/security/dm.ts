import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import { dmLists, type Block } from "../../shared/security.ts";
import type { IConfig } from "../config.ts";
import { postDirectMessage } from "../discord.ts";
import { fit, registerFonts } from "../status/image.ts";
import { avatar, stamp, wrap } from "../userdata/dm.ts";

/**
 * Die DM bei einer Sperre (W-0057, C2, Entwurf S-B): Bild im Stil der
 * Lösch-DM mit schrägem Stempel, Listen „Gesperrt“ und „Weiter nutzbar“
 * untereinander, bei Vollsperre ohne „Weiter nutzbar“. Kein Grund, kein
 * Ansprechpartner, keine Knöpfe.
 */

const W = 800;
const PAD = 36;
const TILE = "#232428";
const TEXT = "#f2f3f5";
const DIM = "#a9afb8";

export type BanDmKind = "ban" | "partial" | "loosened" | "tightened" | "lifted";

const LOOK: Readonly<Record<BanDmKind, { readonly strip: string; readonly stamp: string; readonly title: string }>> = {
    ban: { strip: "#f23f43", stamp: "GESPERRT", title: "Du bist bei RL Nexus gesperrt" },
    partial: { strip: "#f0b232", stamp: "TEILWEISE", title: "Du bist bei RL Nexus teilweise gesperrt" },
    loosened: { strip: "#f0b232", stamp: "GEÄNDERT", title: "Deine Sperre wurde geändert" },
    tightened: { strip: "#f23f43", stamp: "GEÄNDERT", title: "Deine Sperre wurde verschärft" },
    lifted: { strip: "#23a55a", stamp: "AUFGEHOBEN", title: "Deine Sperre ist aufgehoben" },
};

const day = (date: Date): string => new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Berlin" }).format(date);

export interface IBanDmInput {
    readonly kind: BanDmKind;
    readonly person: { readonly name: string; readonly avatar: Buffer | null };
    readonly scope: readonly Block[];
    readonly at: Date;
}

/** Welche DM: Sperre (voll oder teilweise), gelockert, verschärft, aufgehoben. */
export function banDmKind(before: readonly Block[] | null, after: readonly Block[] | null): BanDmKind {
    if (after === null) return "lifted";
    if (before === null) return after.length === 5 ? "ban" : "partial";

    return after.length < before.length || after.some((block) => !before.includes(block)) ? (after.every((block) => before.includes(block)) ? "loosened" : "tightened") : "tightened";
}

function sub(input: IBanDmInput): string {
    if (input.kind === "lifted") return `Seit ${day(input.at)} kannst du RL Nexus wieder nutzen, überall.`;
    if (input.kind === "loosened") return `Gelockert am ${day(input.at)} · dauerhaft`;
    if (input.kind === "tightened") return `Verschärft am ${day(input.at)} · dauerhaft`;

    return `Seit ${day(input.at)} · dauerhaft`;
}

function list(ctx: SKRSContext2D, label: string, items: readonly string[], mark: "no" | "yes", y: number): number {
    const height = 40 + items.length * 30;

    ctx.fillStyle = TILE;
    ctx.beginPath();
    ctx.roundRect(PAD, y, W - 2 * PAD, height, 8);
    ctx.fill();
    ctx.font = "700 15px Rajdhani";
    ctx.fillStyle = DIM;
    ctx.fillText(label.toUpperCase(), PAD + 16, y + 26);

    items.forEach((item, index) => {
        const top = y + 40 + index * 30;

        ctx.fillStyle = mark === "no" ? "#a12d2f" : "#1f7a45";
        ctx.beginPath();
        ctx.roundRect(PAD + 16, top, 20, 20, 4);
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        if (mark === "no") {
            ctx.moveTo(PAD + 22, top + 6);
            ctx.lineTo(PAD + 30, top + 14);
            ctx.moveTo(PAD + 30, top + 6);
            ctx.lineTo(PAD + 22, top + 14);
        } else {
            ctx.moveTo(PAD + 21, top + 10);
            ctx.lineTo(PAD + 25, top + 15);
            ctx.lineTo(PAD + 31, top + 6);
        }
        ctx.stroke();
        ctx.font = "600 19px Rajdhani";
        ctx.fillStyle = TEXT;
        ctx.fillText(fit(ctx, item, W - 2 * PAD - 70), PAD + 48, top + 16);
    });

    return y + height + 12;
}

export async function renderBanDm(input: IBanDmInput): Promise<{ readonly name: string; readonly data: Buffer; readonly alt: string }> {
    registerFonts();

    const look = LOOK[input.kind];
    const lists = input.kind === "lifted" ? { blocked: [], usable: [] } : dmLists(input.scope);
    const canvas = createCanvas(W, 700);
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#2b2d31";
    ctx.fillRect(0, 0, W, 700);
    ctx.fillStyle = look.strip;
    ctx.fillRect(0, 0, W, 6);
    await avatar(ctx, input.person, PAD, 34, 72);
    ctx.textAlign = "left";
    ctx.font = "800 28px Oxanium";
    ctx.fillStyle = TEXT;

    // Neben dem Stempel ist wenig Platz: lieber zwei Zeilen als gekürzt.
    const lines = wrap(ctx, look.title, W - 2 * PAD - 92 - 190, 2);
    lines.forEach((line, index) => ctx.fillText(line, PAD + 92, 62 + index * 32));
    const below = 62 + (lines.length - 1) * 32;

    ctx.font = "600 20px Rajdhani";
    ctx.fillStyle = DIM;
    ctx.fillText(sub(input), PAD + 92, below + 30);
    stamp(ctx, look.stamp, look.strip);

    let y = Math.max(140, below + 66);

    if (lists.blocked.length) y = list(ctx, "Gesperrt", lists.blocked, "no", y);
    if (lists.usable.length) y = list(ctx, "Weiter nutzbar", lists.usable, "yes", y);

    ctx.font = "600 17px Rajdhani";
    ctx.fillStyle = DIM;
    ctx.fillText(input.kind === "lifted" ? "Du kannst RL Nexus wieder wie gewohnt nutzen." : input.kind === "ban" ? "RL Nexus antwortet dir ab jetzt nicht mehr." : "Auf gesperrten Teilen antwortet RL Nexus dir nicht mehr.", PAD, y + 14);
    y += 40;

    const trimmed = createCanvas(W, y);
    trimmed.getContext("2d").drawImage(canvas, 0, 0);

    const alt = [look.title, sub(input), lists.blocked.length ? `Gesperrt: ${lists.blocked.join("; ")}` : null, lists.usable.length ? `Weiter nutzbar: ${lists.usable.join("; ")}` : null].filter(Boolean).join(". ");

    return { name: "rl-nexus-sperre.png", data: trimmed.toBuffer("image/png"), alt: alt.slice(0, 1024) };
}

/** Schicken. null: angekommen, sonst der Grund. Wirft nie: Die Sperre gilt auch ohne DM. */
export async function sendBanDm(config: IConfig, userId: string, input: IBanDmInput): Promise<string | null> {
    try {
        const image = await renderBanDm(input);
        const message = { flags: 1 << 15, components: [{ type: 12, items: [{ media: { url: `attachment://${image.name}` }, description: image.alt }] }] };
        const sent = await postDirectMessage(config, userId, message, [{ name: image.name, data: image.data, type: "image/png" }]);

        return "error" in sent ? sent.error : null;
    } catch (error) {
        return error instanceof Error ? error.message : String(error);
    }
}
