import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import type { IServerOptionView } from "../../shared/servers.ts";
import type { IConfig } from "../config.ts";
import { postDirectMessage } from "../discord.ts";
import { fit, registerFonts } from "../status/image.ts";
import { avatar, wrap } from "../userdata/dm.ts";

/**
 * Die DMs zu „ein Server pro Person“ (W-0064, Entwürfe 3a-A+ und 3b+) als
 * Bild im Stil der Lösch-DM: dunkel, farbiger Streifen, Profilbild, Server als
 * Kacheln. Was live zählen soll, steht als Discord-Zeitstempel unter dem Bild.
 */

const W = 800;
const PAD = 36;
const BG = "#2b2d31";
const TILE = "#232428";
const TEXT = "#f2f3f5";
const DIM = "#a9afb8";
const CREST = ["#2f7fa8", "#d81424", "#7c4dff", "#23a55a", "#c27c0e", "#c2378f"];

export const STRIPS = { limit: "#f0b232", choice: "#f0b232", ok: "#23a55a", grey: "#80848e", switch: "#5865f2" } as const;

const berlin = (date: Date, options: Intl.DateTimeFormatOptions): string => new Intl.DateTimeFormat("de-DE", { ...options, timeZone: "Europe/Berlin" }).format(date);
const number = (value: number): string => value.toLocaleString("de-DE");
const unix = (date: Date): number => Math.floor(date.getTime() / 1000);

/** „Mittwoch, 4. November · 21:57 Uhr“ */
export function deadlineText(date: Date): string {
    return `${berlin(date, { weekday: "long", day: "numeric", month: "long" })} · ${berlin(date, { hour: "2-digit", minute: "2-digit" })} Uhr`;
}

export type TileTag = "main" | "gone" | "approved" | null;

export interface IServerTile {
    readonly id: string;
    readonly name: string;
    readonly members: number;
    readonly since: Date | null;
    readonly tag: TileTag;
}

export interface IServerImage {
    readonly strip: string;
    readonly person: { readonly name: string; readonly avatar: Buffer | null };
    readonly title: string;
    readonly sub: string;
    /** Große Zeile mit Label darüber, etwa die Frist. progress: Anteil der Leiste darunter. */
    readonly big?: { readonly label: string; readonly value: string; readonly progress: number };
    readonly tiles?: readonly IServerTile[];
    readonly note?: string;
}

const TAGS: Readonly<Record<Exclude<TileTag, null>, { readonly text: string; readonly color: string }>> = {
    main: { text: "HAUPTSERVER", color: "#23a55a" },
    gone: { text: "BOT IST GEGANGEN", color: "#f23f43" },
    approved: { text: "FREIGABE", color: "#a78bfa" },
};

function initials(name: string): string {
    const words = name.replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/).filter(Boolean);

    return ((words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2)) || "?").toUpperCase();
}

function crest(id: string): string {
    let sum = 0;

    for (const char of id) sum = (sum + char.charCodeAt(0)) % 997;

    return CREST[sum % CREST.length];
}

function tile(ctx: SKRSContext2D, server: IServerTile, x: number, y: number, width: number): void {
    ctx.fillStyle = TILE;
    ctx.beginPath();
    ctx.roundRect(x, y, width, 118, 8);
    ctx.fill();

    ctx.fillStyle = crest(server.id);
    ctx.beginPath();
    ctx.roundRect(x + 12, y + 12, 36, 36, 8);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 15px Oxanium";
    ctx.textAlign = "center";
    ctx.fillText(initials(server.name), x + 30, y + 36);
    ctx.textAlign = "left";

    if (server.tag) {
        const tag = TAGS[server.tag];

        ctx.font = "700 13px Rajdhani";
        const tagWidth = Math.min(ctx.measureText(tag.text).width + 14, width - 70);
        ctx.strokeStyle = tag.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(x + width - 12 - tagWidth, y + 14, tagWidth, 22, 4);
        ctx.stroke();
        ctx.fillStyle = tag.color;
        ctx.fillText(fit(ctx, tag.text, tagWidth - 14), x + width - 5 - tagWidth, y + 30);
    }

    ctx.font = "800 19px Oxanium";
    ctx.fillStyle = TEXT;
    ctx.fillText(fit(ctx, server.name, width - 24), x + 12, y + 76);
    ctx.font = "600 16px Rajdhani";
    ctx.fillStyle = DIM;
    ctx.fillText(fit(ctx, `${number(server.members)} Mitglieder${server.since ? ` · seit ${berlin(server.since, { day: "2-digit", month: "2-digit", year: "numeric" })}` : ""}`, width - 24), x + 12, y + 100);
}

async function paint(ctx: SKRSContext2D, input: IServerImage): Promise<number> {
    await avatar(ctx, input.person, PAD, 34, 72);
    ctx.textAlign = "left";
    ctx.font = "800 30px Oxanium";
    ctx.fillStyle = TEXT;
    ctx.fillText(fit(ctx, input.title, W - 2 * PAD - 92), PAD + 92, 70);
    ctx.font = "600 20px Rajdhani";
    ctx.fillStyle = DIM;

    let y = 100;

    for (const line of wrap(ctx, input.sub, W - 2 * PAD - 92, 2)) {
        ctx.fillText(line, PAD + 92, y);
        y += 24;
    }

    y = Math.max(y + 16, 132);

    if (input.big) {
        ctx.font = "700 16px Rajdhani";
        ctx.fillStyle = DIM;
        ctx.fillText(input.big.label.toUpperCase(), PAD, y + 18);
        ctx.font = "800 40px Oxanium";
        ctx.fillStyle = TEXT;
        ctx.fillText(fit(ctx, input.big.value, W - 2 * PAD), PAD, y + 64);
        ctx.fillStyle = "#1e1f22";
        ctx.beginPath();
        ctx.roundRect(PAD, y + 82, W - 2 * PAD, 10, 5);
        ctx.fill();
        ctx.fillStyle = input.strip;
        ctx.beginPath();
        ctx.roundRect(PAD, y + 82, Math.max(18, (W - 2 * PAD) * Math.min(1, Math.max(0, input.big.progress))), 10, 5);
        ctx.fill();
        y += 120;
    }

    const tiles = input.tiles ?? [];

    if (tiles.length > 0) {
        ctx.font = "700 16px Rajdhani";
        ctx.fillStyle = DIM;
        ctx.fillText("DEINE SERVER", PAD, y + 4);
        y += 18;

        const perRow = Math.min(3, tiles.length);
        const width = (W - 2 * PAD - (perRow - 1) * 12) / perRow;

        tiles.forEach((server, index) => tile(ctx, server, PAD + (index % perRow) * (width + 12), y + Math.floor(index / perRow) * 130, width));
        y += Math.ceil(tiles.length / perRow) * 130 + 6;
    }

    if (input.note) {
        ctx.font = "600 19px Rajdhani";
        const lines = wrap(ctx, input.note, W - 2 * PAD - 32, 3);
        const height = 24 + lines.length * 24;

        ctx.fillStyle = TILE;
        ctx.beginPath();
        ctx.roundRect(PAD, y, W - 2 * PAD, height, 8);
        ctx.fill();
        ctx.fillStyle = TEXT;
        lines.forEach((line, index) => ctx.fillText(line, PAD + 16, y + 30 + index * 24));
        y += height + 24;
    } else {
        y += 18;
    }

    return y;
}

/** Was im Bild steht, als Text für Screenreader. */
export function altText(input: IServerImage): string {
    const tiles = (input.tiles ?? []).map((server) => `${server.name} (${number(server.members)} Mitglieder${server.tag ? `, ${TAGS[server.tag].text.toLowerCase()}` : ""})`);

    return [input.title, input.sub, input.big ? `${input.big.label}: ${input.big.value}` : null, tiles.length ? `Deine Server: ${tiles.join(", ")}` : null, input.note ?? null]
        .filter(Boolean)
        .join(". ")
        .slice(0, 1024);
}

export async function renderServerImage(input: IServerImage): Promise<{ readonly name: string; readonly data: Buffer; readonly alt: string }> {
    registerFonts();

    const scratch = createCanvas(W, 900);
    const ctx = scratch.getContext("2d");

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, 900);
    ctx.fillStyle = input.strip;
    ctx.fillRect(0, 0, W, 6);

    const used = Math.min(900, await paint(ctx, input));
    const trimmed = createCanvas(W, used);
    trimmed.getContext("2d").drawImage(scratch, 0, 0);

    return { name: "rl-nexus-server.png", data: trimmed.toBuffer("image/png"), alt: altText(input) };
}

/** Link zum Einladen des Bots, mit Server vorausgewählt. */
export function inviteUrl(config: IConfig, guildId?: string): string {
    const query = new URLSearchParams({ client_id: config.clientId, permissions: "8", scope: "bot applications.commands" });

    if (guildId) {
        query.set("guild_id", guildId);
        query.set("disable_guild_select", "true");
    }

    return `https://discord.com/oauth2/authorize?${query}`;
}

export type IServerOption = IServerOptionView;

/** Bausteine unter dem Bild. */
export type ServerExtra =
    | { readonly kind: "limit"; readonly guildId: string }
    | { readonly kind: "choice"; readonly deadline: Date; readonly options: readonly IServerOption[] }
    | { readonly kind: "remind" }
    | { readonly kind: "link"; readonly label: string; readonly url: string }
    | { readonly kind: "none" };

export function pickMenu(options: readonly IServerOption[]): unknown {
    return {
        type: 1,
        components: [
            {
                type: 3,
                custom_id: "sv:pick",
                placeholder: "Welcher Server soll bleiben?",
                options: options.slice(0, 25).map((option) => ({ label: option.name.slice(0, 100), value: option.id, description: `${number(option.members)} Mitglieder · du bist ${option.role}`.slice(0, 100) })),
            },
        ],
    };
}

/** Nachricht in Components V2: Bild, dann je nach Art Zeile, Menü und Knöpfe. */
export function serverMessage(image: { readonly name: string; readonly alt: string }, extra: ServerExtra): { readonly flags: number; readonly components: readonly unknown[] } {
    const parts: unknown[] = [{ type: 12, items: [{ media: { url: `attachment://${image.name}` }, description: image.alt }] }];

    if (extra.kind === "limit") {
        parts.push(
            { type: 10, content: "Frag eine Freigabe an oder lass das Team den Hauptserver wechseln." },
            {
                type: 1,
                components: [
                    { type: 2, style: 3, label: "Freigabe anfragen", custom_id: `sv:ask:extra:${extra.guildId}` },
                    { type: 2, style: 2, label: "Wechsel anfragen", custom_id: `sv:ask:switch:${extra.guildId}` },
                ],
            }
        );
    } else if (extra.kind === "choice") {
        parts.push(
            { type: 10, content: `⏳ Noch <t:${unix(extra.deadline)}:R> · bis <t:${unix(extra.deadline)}:f>` },
            pickMenu(extra.options),
            { type: 1, components: [{ type: 2, style: 2, label: "Zweiten Server anfragen", custom_id: "sv:more" }] }
        );
    } else if (extra.kind === "remind") {
        parts.push({ type: 1, components: [{ type: 2, style: 3, label: "Jetzt wählen", custom_id: "sv:remind" }] });
    } else if (extra.kind === "link") {
        parts.push({ type: 1, components: [{ type: 2, style: 5, label: extra.label, url: extra.url }] });
    }

    return { flags: 1 << 15, components: parts };
}

/** Bild zeichnen und schicken. null: angekommen, sonst der Grund. Wirft nie. */
export async function sendServerDm(config: IConfig, userId: string, input: IServerImage, extra: ServerExtra): Promise<string | null> {
    try {
        const image = await renderServerImage(input);
        const sent = await postDirectMessage(config, userId, serverMessage(image, extra), [{ name: image.name, data: image.data, type: "image/png" }]);

        return "error" in sent ? sent.error : null;
    } catch (error) {
        return error instanceof Error ? error.message : String(error);
    }
}
