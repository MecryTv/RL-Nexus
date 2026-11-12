import { createCanvas, Image, loadImage, SKRSContext2D } from "@napi-rs/canvas";
import { RegisterFonts } from "./RankCard";
import { EveningStatus, IAvatar, IRouletteEvening, IRouletteLobby, IRouletteRound, RouletteTeamSize } from "../interfaces/services/roulette/IRoulette";

/**
 * Rocket Roulette (W-0087): alle Karten als Bild, nach den gewählten Entwürfen
 * (A1·2 Ankündigung, A2·2 Rundenkarte, A3·2 Lobby-Karte, P2 Banner, B5·2
 * Steuerkarte, A8·2 Übersicht). Stil wie W-0051/W-0052: dunkles Feld,
 * farbiger Streifen oben, Oxanium und Rajdhani, Kacheln. Keine Emojis im Bild,
 * Zeichen werden gezeichnet. Zu jedem Bild ein Alt-Text mit allem, was draufsteht.
 */

const W = 1000;
const PAD = 40;
const BG = "#2b2d31";
const TILE = "#232428";
const DEEP = "#1e1f22";
const TEXT = "#f2f3f5";
const TEXT2 = "#dbdee1";
const MUTED = "#a9afb8";
const GOLD = "#f0b232";
const RED = "#ff1e2d";
const GREEN = "#35e07f";
const BLUE = "#3d8bff";
const ORANGE = "#ff8a1f";
const GREY = "#9aa3ae";
const ALT_MAX = 1024;
const LOBBIES_PER_IMAGE = 6;
const ROUNDS_PER_IMAGE = 3;

export type AvatarMap = Record<string, string | null>;

export interface IAnnounceView {
    status: EveningStatus;
    startsAt: number;
    waiting: { count: number; avatars: IAvatar[] };
    moderators: IAvatar[];
    waitingRoom: string;
    mainVoice: string;
    teamSize: RouletteTeamSize;
    lobbiesAbout: number;
    round: number;
}

export interface IControlView {
    status: EveningStatus;
    startsAt: number;
    round: number;
    inLobbies: number;
    waiting: number;
    sitOut: number;
    lobbies: { name: string; host: IAvatar; hostIsModerator: boolean; filler: boolean; openedAt: number | null }[];
    wishes: { a: IAvatar; b: IAvatar; once: boolean }[];
    warnings: string[];
}

/* ----------------------------------------------------------
   Texte, auch für die Alt-Texte
   ---------------------------------------------------------- */
const timeFormat = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });
const dateFormat = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "long", day: "numeric", month: "long" });

export function Clock(at: number): string {
    return timeFormat.format(new Date(at));
}

export function Day(at: number): string {
    return dateFormat.format(new Date(at));
}

function Mode(size: number): string {
    return `${size}v${size}`;
}

function NameOf(lobby: IRouletteLobby, id: string): string {
    return lobby.names[id] ?? id;
}

function Team(lobby: IRouletteLobby, team: 0 | 1): string {
    return lobby.teams[team].map((id) => NameOf(lobby, id)).join(", ");
}

function Cut(text: string): string {
    return text.length <= ALT_MAX ? text : `${text.slice(0, ALT_MAX - 1)}…`;
}

function Duration(from: number, to: number): string {
    const minutes = Math.max(0, Math.round((to - from) / 60_000));

    return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

export function RoundPages(round: IRouletteRound): number {
    return Math.max(1, Math.ceil(round.lobbies.length / LOBBIES_PER_IMAGE));
}

export function SummaryPages(rounds: IRouletteRound[]): number {
    return Math.max(1, Math.ceil(rounds.length / ROUNDS_PER_IMAGE));
}

/* ----------------------------------------------------------
   Zeichnen
   ---------------------------------------------------------- */
function Rounded(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function Box(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, color = TILE, r = 10): void {
    ctx.fillStyle = color;
    Rounded(ctx, x, y, w, h, r);
    ctx.fill();
}

function Fit(ctx: SKRSContext2D, text: string, width: number): string {
    if (ctx.measureText(text).width <= width) return text;

    let out = text;

    while (out.length > 1 && ctx.measureText(`${out}…`).width > width) out = out.slice(0, -1);

    return `${out}…`;
}

function Write(ctx: SKRSContext2D, text: string, x: number, y: number, font: string, color: string, width = 900, align: CanvasTextAlign = "left"): void {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(Fit(ctx, text, width), x, y);
    ctx.textAlign = "left";
}

function Label(ctx: SKRSContext2D, text: string, x: number, y: number, color = MUTED, align: CanvasTextAlign = "left"): void {
    Write(ctx, text.toUpperCase().split("").join(" ").replace(/ {3}/g, "  "), x, y, "700 13px Rajdhani", color, 900, align);
}

function Stripe(ctx: SKRSContext2D, status: EveningStatus | "open"): void {
    const gradient = ctx.createLinearGradient(0, 0, W, 0);

    if (status === "planned") {
        gradient.addColorStop(0, RED);
        gradient.addColorStop(1, GOLD);
    } else if (status === "running" || status === "open") {
        gradient.addColorStop(0, GREEN);
        gradient.addColorStop(1, "#13a8b8");
    } else {
        gradient.addColorStop(0, GREY);
        gradient.addColorStop(1, "#5c636c");
    }

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, 6);
}

function Stamp(ctx: SKRSContext2D, text: string, x: number, y: number, color: string): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.12);
    ctx.font = "800 22px Oxanium";

    const width = ctx.measureText(text).width + 28;

    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    Rounded(ctx, -width, -20, width, 40, 8);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.textAlign = "right";
    ctx.fillText(text, -14, 8);
    ctx.restore();
}

function Chip(ctx: SKRSContext2D, text: string, right: number, y: number, color: string): void {
    ctx.font = "800 13px Oxanium";

    const width = ctx.measureText(text).width + 18;

    ctx.fillStyle = `${color}2e`;
    Rounded(ctx, right - width, y - 16, width, 24, 6);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillText(text, right - width + 9, y + 1);
}

function Crown(ctx: SKRSContext2D, x: number, y: number, size: number): void {
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.moveTo(x, y + size);
    ctx.lineTo(x, y + size * 0.3);
    ctx.lineTo(x + size * 0.3, y + size * 0.6);
    ctx.lineTo(x + size * 0.5, y);
    ctx.lineTo(x + size * 0.7, y + size * 0.6);
    ctx.lineTo(x + size, y + size * 0.3);
    ctx.lineTo(x + size, y + size);
    ctx.closePath();
    ctx.fill();
}

function Wheel(ctx: SKRSContext2D, cx: number, cy: number, r: number): void {
    for (let index = 0; index < 10; index++) {
        ctx.fillStyle = index % 2 ? "#14171c" : RED;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, (index / 10) * Math.PI * 2, ((index + 1) / 10) * Math.PI * 2);
        ctx.closePath();
        ctx.fill();
    }

    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.32, 0, Math.PI * 2);
    ctx.fill();
}

const COLORS = ["#e25a9b", "#3d8bff", "#35b37e", "#f0b232", "#8a4dff", "#ff8a1f", "#13a8b8", "#d6453d"];
const images = new Map<string, Image | null>();

async function Picture(url: string | null): Promise<Image | null> {
    if (!url) return null;
    if (images.has(url)) return images.get(url)!;

    let image: Image | null = null;

    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(3_000) });

        if (response.ok) image = await loadImage(Buffer.from(await response.arrayBuffer()));
    } catch {
        image = null;
    }

    if (images.size > 500) images.clear();
    images.set(url, image);

    return image;
}

async function Avatar(ctx: SKRSContext2D, avatar: IAvatar, x: number, y: number, size: number, ring = BG): Promise<void> {
    const image = await Picture(avatar.url);
    const r = size / 2;

    ctx.save();
    ctx.beginPath();
    ctx.arc(x + r, y + r, r, 0, Math.PI * 2);
    ctx.closePath();

    if (image) {
        ctx.clip();
        ctx.drawImage(image, x, y, size, size);
    } else {
        let hash = 0;

        for (const char of avatar.id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
        ctx.fillStyle = COLORS[hash % COLORS.length];
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = `800 ${Math.round(size * 0.38)}px Oxanium`;
        ctx.textAlign = "center";
        ctx.fillText(avatar.name.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2).toUpperCase() || "?", x + r, y + r + size * 0.14);
        ctx.textAlign = "left";
    }

    ctx.restore();
    ctx.strokeStyle = ring;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x + r, y + r, r, 0, Math.PI * 2);
    ctx.stroke();
}

async function Stack(ctx: SKRSContext2D, avatars: IAvatar[], x: number, y: number, size: number, max: number, rest = 0, ring = TILE): Promise<number> {
    const shown = avatars.slice(0, max);
    const step = size * 0.72;

    for (const [index, avatar] of shown.entries()) await Avatar(ctx, avatar, x + index * step, y, size, ring);

    let end = x + shown.length * step + size * 0.28;
    const more = rest + Math.max(0, avatars.length - max);

    if (more > 0) {
        Box(ctx, end + 4, y + size * 0.15, 46, size * 0.7, "#3f4147", size * 0.35);
        Write(ctx, `+${more}`, end + 27, y + size * 0.62, "800 14px Oxanium", TEXT2, 46, "center");
        end += 54;
    }

    return end;
}

function Members(lobby: IRouletteLobby, team: 0 | 1, avatars: AvatarMap): IAvatar[] {
    return lobby.teams[team].map((id) => ({ id, name: NameOf(lobby, id), url: avatars[id] ?? null }));
}

const cache = new Map<string, Buffer>();

async function Cached(key: string, draw: () => Promise<Buffer>): Promise<Buffer> {
    const hit = cache.get(key);

    if (hit) return hit;

    await RegisterFonts();

    const buffer = await draw();

    if (cache.size > 200) cache.clear();
    cache.set(key, buffer);

    return buffer;
}

/* ----------------------------------------------------------
   A1·2 Ankündigung
   ---------------------------------------------------------- */
export function AnnouncementAlt(view: IAnnounceView): string {
    const state = view.status === "planned" ? "geplant" : view.status === "running" ? `läuft, Runde ${view.round}` : "beendet";

    return Cut(
        `Rocket Roulette am ${Day(view.startsAt)} um ${Clock(view.startsAt)} (${state}). Private Matches, Teams jede Runde neu gemischt. ` +
            `${view.waiting.count} im Warteraum${view.waiting.avatars.length ? ` (${view.waiting.avatars.map((avatar) => avatar.name).join(", ")})` : ""}. ` +
            `Moderation: ${view.moderators.map((avatar) => avatar.name).join(", ") || "noch niemand"}. Warteraum: ${view.waitingRoom}. Treffpunkt: ${view.mainVoice}. Modus ${Mode(view.teamSize)}, etwa ${view.lobbiesAbout} Lobbys.`
    );
}

export async function RenderAnnouncement(view: IAnnounceView): Promise<Buffer> {
    return Cached(`announce:${JSON.stringify(view)}`, async () => {
        const H = 470;
        const canvas = createCanvas(W, H);
        const ctx = canvas.getContext("2d");

        Box(ctx, 0, 0, W, H, BG, 0);
        Stripe(ctx, view.status);
        Wheel(ctx, PAD + 38, 76, 36);
        Label(ctx, Day(view.startsAt), PAD + 92, 52);
        Write(ctx, "ROCKET ROULETTE", PAD + 92, 92, "800 40px Oxanium", TEXT, 520);
        Write(ctx, "Private Matches · Teams jede Runde neu gemischt", PAD + 92, 120, "600 20px Rajdhani", MUTED, 520);
        Label(ctx, "Start", W - PAD, 52, MUTED, "right");
        Write(ctx, Clock(view.startsAt), W - PAD, 114, "800 64px Oxanium", GOLD, 300, "right");

        if (view.status === "running") Stamp(ctx, `RUNDE ${view.round}`, W - PAD - 190, 70, GREEN);
        if (view.status === "ended") Stamp(ctx, "BEENDET", W - PAD - 190, 70, GREY);

        const half = (W - PAD * 2 - 16) / 2;

        Box(ctx, PAD, 156, half, 110);
        Label(ctx, "Schon im Warteraum", PAD + 16, 182);
        Write(ctx, String(view.waiting.count), PAD + 16, 246, "800 52px Oxanium", TEXT, 120);
        await Stack(ctx, view.waiting.avatars, PAD + 110, 208, 38, 6, Math.max(0, view.waiting.count - view.waiting.avatars.length));

        Box(ctx, PAD + half + 16, 156, half, 110);
        Label(ctx, "Moderation", PAD + half + 32, 182);

        const after = await Stack(ctx, view.moderators, PAD + half + 32, 204, 38, 4);

        Write(ctx, view.moderators.map((avatar) => avatar.name).join(", ") || "noch niemand", after + 8, 230, "600 20px Rajdhani", TEXT, PAD + half * 2 + 16 - after - 16);

        const quarter = (W - PAD * 2 - 24) / 4;
        const tiles: [string, string, boolean][] = [
            ["Warteraum", view.waitingRoom, false],
            ["Treffpunkt", view.mainVoice, false],
            ["Modus", Mode(view.teamSize), true],
            ["Lobbys etwa", String(view.lobbiesAbout), true],
        ];

        for (const [index, [label, value, big]] of tiles.entries()) {
            const x = PAD + index * (quarter + 8);

            Box(ctx, x, 282, quarter, 84);
            Label(ctx, label, x + 14, 306);
            Write(ctx, value, x + 14, big ? 350 : 344, big ? "800 30px Oxanium" : "700 20px Rajdhani", TEXT, quarter - 28);
        }

        const steps: [string, boolean][] = [
            ["Geplant", view.status === "planned"],
            [view.status === "running" ? `Läuft · Runde ${view.round}` : "Läuft", view.status === "running"],
            ["Beendet", view.status === "ended"],
        ];
        const third = (W - PAD * 2 - 16) / 3;

        for (const [index, [label, on]] of steps.entries()) {
            const x = PAD + index * (third + 8);
            const color = on ? (view.status === "planned" ? GOLD : view.status === "running" ? GREEN : GREY) : MUTED;

            Box(ctx, x, 384, third, 44, on ? `${color}2e` : TILE, 8);
            Label(ctx, label, x + third / 2, 412, color, "center");
        }

        return canvas.toBuffer("image/png");
    });
}

/* ----------------------------------------------------------
   A2·2 Rundenkarte
   ---------------------------------------------------------- */
export function RoundAlt(round: IRouletteRound, page: number, extra?: { waiting: string[]; sitOut: string[] }): string {
    const lobbies = round.lobbies.slice(page * LOBBIES_PER_IMAGE, (page + 1) * LOBBIES_PER_IMAGE);
    const parts = lobbies.map(
        (lobby) =>
            `${lobby.name} (${Mode(lobby.size)}, ${lobby.openedAt ? "offen" : "wartet"}), Passwort ${lobby.password}, Host ${NameOf(lobby, lobby.host)}${lobby.hostIsModerator ? " (Moderator)" : ""}; ` +
            `Team ${lobby.teamNumbers[0]}: ${Team(lobby, 0)}; Team ${lobby.teamNumbers[1]}: ${Team(lobby, 1)}`
    );
    const tail = extra ? ` Wartet auf Runde ${round.number + 1}: ${extra.waiting.join(", ") || "niemand"}. Setzt aus: ${extra.sitOut.join(", ") || "niemand"}.` : "";

    return Cut(`Rocket Roulette, Runde ${round.number}, ${round.lobbies.length} Lobbys. ${parts.join(". ")}.${tail}`);
}

export async function RenderRound(round: IRouletteRound, page: number, avatars: AvatarMap = {}, extra?: { waiting: string[]; sitOut: string[] }): Promise<Buffer> {
    return Cached(`round:${JSON.stringify([round, page, avatars, extra])}`, async () => {
        const lobbies = round.lobbies.slice(page * LOBBIES_PER_IMAGE, (page + 1) * LOBBIES_PER_IMAGE);
        const rows = Math.max(1, Math.ceil(lobbies.length / 3));
        const last = page === RoundPages(round) - 1;
        const H = 122 + rows * 226 + (last && extra ? 64 : 10);
        const canvas = createCanvas(W, H);
        const ctx = canvas.getContext("2d");
        const players = round.lobbies.reduce((sum, lobby) => sum + lobby.teams[0].length + lobby.teams[1].length, 0);

        Box(ctx, 0, 0, W, H, BG, 0);
        Stripe(ctx, "running");
        Label(ctx, RoundPages(round) > 1 ? `Rocket Roulette · Bild ${page + 1} von ${RoundPages(round)}` : "Rocket Roulette", PAD, 46);
        Write(ctx, `${round.lobbies.length} Lobbys · ${players} Spieler`, PAD, 90, "800 34px Oxanium", TEXT, 640);
        Stamp(ctx, `RUNDE ${round.number}`, W - PAD, 68, GREEN);

        const width = (W - PAD * 2 - 32) / 3;

        for (const [index, lobby] of lobbies.entries()) {
            const x = PAD + (index % 3) * (width + 16);
            const y = 122 + Math.floor(index / 3) * 226;
            const open = lobby.openedAt !== null;

            Box(ctx, x, y, width, 210);
            ctx.fillStyle = open ? GREEN : GOLD;
            ctx.fillRect(x + 6, y, width - 12, 4);
            Write(ctx, lobby.name, x + 14, y + 38, "800 24px Oxanium", TEXT, width - 110);
            Chip(ctx, open ? "OFFEN" : "WARTET", x + width - 14, y + 30, open ? GREEN : GOLD);
            Write(ctx, lobby.password, x + 14, y + 66, "800 19px Oxanium", GOLD, width - 90);
            Write(ctx, Mode(lobby.size), x + width - 14, y + 66, "700 15px Rajdhani", TEXT2, 70, "right");
            Crown(ctx, x + 14, y + 86, 16);
            await Avatar(ctx, { id: lobby.host, name: NameOf(lobby, lobby.host), url: avatars[lobby.host] ?? null }, x + 38, y + 80, 26, TILE);
            Write(ctx, `${NameOf(lobby, lobby.host)}${lobby.hostIsModerator ? (lobby.filler ? " · Mod, spielt mit" : " · Mod") : ""}`, x + 72, y + 99, "700 16px Rajdhani", TEXT, width - 86);

            for (const team of [0, 1] as const) {
                const ty = y + 126 + team * 40;

                Label(ctx, `Team ${lobby.teamNumbers[team]}`, x + 14, ty + 20, team === 0 ? "#8fb8ff" : "#ffb67a");
                await Stack(ctx, Members(lobby, team, avatars), x + 92, ty, 30, 3);
            }
        }

        if (last && extra) {
            const y = 122 + rows * 226;

            Box(ctx, PAD, y, W - PAD * 2, 48, TILE, 8);
            Label(ctx, `Wartet auf Runde ${round.number + 1}`, PAD + 14, y + 30);
            Write(ctx, extra.waiting.join(", ") || "niemand", PAD + 200, y + 31, "600 17px Rajdhani", TEXT, 300);
            Label(ctx, "Setzt aus", PAD + 520, y + 30);
            Write(ctx, extra.sitOut.join(", ") || "niemand", PAD + 610, y + 31, "600 17px Rajdhani", TEXT, 300);
        }

        return canvas.toBuffer("image/png");
    });
}

/* ----------------------------------------------------------
   A3·2 Lobby-Karte im Voice-Chat
   ---------------------------------------------------------- */
export function LobbyCardAlt(lobby: IRouletteLobby, team: 0 | 1, open: boolean): string {
    const other = team === 0 ? 1 : 0;
    const state = open && lobby.openedAt ? `Offen seit ${Clock(lobby.openedAt)}` : open ? "Offen" : `Wartet auf ${NameOf(lobby, lobby.host)}`;

    return Cut(
        `Deine Lobby ${lobby.name}, Passwort ${lobby.password}, ${Mode(lobby.size)}. ${state}. ${NameOf(lobby, lobby.host)} ${open ? "hat die Lobby aufgemacht" : "macht die Lobby auf"}. ` +
            `Team ${lobby.teamNumbers[team]} (dein Team): ${Team(lobby, team)}. Team ${lobby.teamNumbers[other]}: ${Team(lobby, other)}.`
    );
}

export async function RenderLobbyCard(lobby: IRouletteLobby, team: 0 | 1, open: boolean, avatars: AvatarMap = {}): Promise<Buffer> {
    return Cached(`card:${JSON.stringify([lobby, team, open, avatars])}`, async () => {
        const H = 560;
        const canvas = createCanvas(W, H);
        const ctx = canvas.getContext("2d");
        const host = NameOf(lobby, lobby.host);

        Box(ctx, 0, 0, W, H, BG, 0);
        Stripe(ctx, open ? "open" : "planned");
        Label(ctx, "Deine Lobby", PAD, 46);
        Chip(ctx, open ? `OFFEN${lobby.openedAt ? ` SEIT ${Clock(lobby.openedAt)}` : ""}` : `WARTET AUF ${host.toUpperCase()}`, W - PAD, 42, open ? GREEN : GOLD);
        Label(ctx, "Name", PAD, 96);
        Write(ctx, lobby.name, PAD, 168, "800 72px Oxanium", TEXT, 520);
        Label(ctx, "Passwort", W - PAD - (open ? 120 : 0), 96, MUTED, "right");
        ctx.save();
        ctx.font = "800 62px Oxanium";
        ctx.letterSpacing = "6px";
        ctx.fillStyle = GOLD;
        ctx.textAlign = "right";
        ctx.fillText(Fit(ctx, lobby.password, 380), W - PAD - (open ? 120 : 0), 166);
        ctx.restore();

        if (open) Stamp(ctx, "OFFEN", W - PAD, 140, GREEN);

        Box(ctx, PAD, 200, W - PAD * 2, 74);
        Crown(ctx, PAD + 18, 226, 22);
        await Avatar(ctx, { id: lobby.host, name: host, url: avatars[lobby.host] ?? null }, PAD + 52, 214, 46, TILE);
        Write(ctx, open ? `${host} hat die Lobby aufgemacht` : `${host} macht die Lobby auf`, PAD + 112, 236, "700 22px Rajdhani", TEXT, 600);
        Label(ctx, lobby.hostIsModerator && !lobby.filler ? "Moderator · sitzt im Treffpunkt" : open ? "rein mit euch" : "Spieler in dieser Lobby", PAD + 112, 260);
        Write(ctx, Mode(lobby.size), W - PAD - 18, 246, "800 22px Oxanium", TEXT2, 80, "right");

        const half = (W - PAD * 2 - 60) / 2;

        for (const side of [0, 1] as const) {
            const x = side === 0 ? PAD : PAD + half + 60;
            const color = side === 0 ? BLUE : ORANGE;

            Box(ctx, x, 292, half, 236);
            ctx.fillStyle = color;
            ctx.fillRect(x + 6, 292, half - 12, 4);

            if (side === team) {
                ctx.strokeStyle = `${color}99`;
                ctx.lineWidth = 3;
                Rounded(ctx, x, 292, half, 236, 10);
                ctx.stroke();
            }

            Label(ctx, `Team ${lobby.teamNumbers[side]}${side === team ? " · dein Team" : ""}`, x + 18, 324, side === 0 ? "#8fb8ff" : "#ffb67a");

            for (const [index, member] of Members(lobby, side, avatars).entries()) {
                await Avatar(ctx, member, x + 18, 344 + index * 58, 42, TILE);
                Write(ctx, member.name, x + 72, 372 + index * 58, "700 22px Rajdhani", TEXT, half - 90);
            }
        }

        Write(ctx, "VS", W / 2, 420, "800 22px Oxanium", MUTED, 60, "center");

        return canvas.toBuffer("image/png");
    });
}

/* ----------------------------------------------------------
   P2 Banner „Lobby ist offen“
   ---------------------------------------------------------- */
export function OpenBannerAlt(lobby: IRouletteLobby): string {
    return `Lobby ist offen: ${lobby.name}, Passwort ${lobby.password}.`;
}

export async function RenderOpenBanner(lobby: IRouletteLobby): Promise<Buffer> {
    return Cached(`banner:${lobby.name}:${lobby.password}`, async () => {
        const H = 200;
        const canvas = createCanvas(W, H);
        const ctx = canvas.getContext("2d");
        const gradient = ctx.createLinearGradient(0, 0, W, 0);

        gradient.addColorStop(0, "#123d2a");
        gradient.addColorStop(1, "#1b5a3c");
        ctx.fillStyle = gradient;
        Rounded(ctx, 0, 0, W, H, 18);
        ctx.fill();
        Label(ctx, "Lobby ist offen", PAD, 62, "#9fe7c0");
        Write(ctx, lobby.name, PAD, 140, "800 68px Oxanium", "#eafff3", 560);
        Label(ctx, "Passwort", W - PAD, 62, "#9fe7c0", "right");
        Write(ctx, lobby.password, W - PAD, 136, "800 52px Oxanium", "#ffe08a", 360, "right");

        return canvas.toBuffer("image/png");
    });
}

/* ----------------------------------------------------------
   B5·2 Steuerkarte
   ---------------------------------------------------------- */
export function ControlAlt(view: IControlView): string {
    const state = view.status === "planned" ? `geplant für ${Clock(view.startsAt)}` : view.status === "running" ? `Runde ${view.round}` : "beendet";
    const lobbies = view.lobbies.map((lobby) => `${lobby.name} ${lobby.openedAt ? "offen" : "wartet"}, Host ${lobby.host.name}${lobby.filler ? " (spielt mit)" : ""}`).join("; ");
    const wishes = view.wishes.map((wish) => `${wish.a.name} + ${wish.b.name}${wish.once ? " (nur nächste Runde)" : ""}`).join(", ");

    return Cut(
        `Steuerung Rocket Roulette: ${state}. In Lobbys ${view.inLobbies}, im Warteraum ${view.waiting}, offen ${view.lobbies.filter((lobby) => lobby.openedAt).length} von ${view.lobbies.length}, setzen aus ${view.sitOut}. ` +
            `${lobbies ? `Lobbys: ${lobbies}. ` : ""}Wünsche: ${wishes || "keine"}.${view.warnings.length ? ` Warnung: ${view.warnings.join(" ")}` : ""}`
    );
}

export async function RenderControl(view: IControlView): Promise<Buffer> {
    return Cached(`control:${JSON.stringify(view)}`, async () => {
        const lobbies = view.lobbies.slice(0, 6);
        const rows = lobbies.length ? Math.ceil(lobbies.length / 3) : 0;
        const H = 270 + rows * 92 + 96 + view.warnings.slice(0, 2).length * 48 + 16;
        const canvas = createCanvas(W, H);
        const ctx = canvas.getContext("2d");

        Box(ctx, 0, 0, W, H, BG, 0);
        Stripe(ctx, view.status);
        Label(ctx, `Steuerung · ${view.status === "planned" ? "Start" : "seit"} ${Clock(view.startsAt)}`, PAD, 46);
        Write(ctx, "ROCKET ROULETTE", PAD, 88, "800 34px Oxanium", TEXT, 600);
        Stamp(ctx, view.status === "running" ? `RUNDE ${view.round}` : view.status === "planned" ? "GEPLANT" : "BEENDET", W - PAD, 66, view.status === "running" ? GREEN : view.status === "planned" ? GOLD : GREY);

        const steps: [string, boolean, boolean][] = [
            ["Geplant", view.status === "planned", view.status !== "planned"],
            ["Gestartet", view.status === "running" && view.round === 0, view.round > 0 || view.status === "ended"],
            [view.round > 0 ? `Runde ${view.round}` : "Runde", view.status === "running" && view.round > 0, view.status === "ended"],
            ["Beendet", view.status === "ended", false],
        ];
        const quarter = (W - PAD * 2 - 24) / 4;

        for (const [index, [label, on, done]] of steps.entries()) {
            const x = PAD + index * (quarter + 8);

            Box(ctx, x, 108, quarter, 36, on ? `${GREEN}29` : TILE, 8);
            Label(ctx, label, x + quarter / 2, 132, on ? GREEN : done ? "#b9c0c9" : MUTED, "center");
        }

        const kpis: [string, string, string][] = [
            ["In Lobbys", String(view.inLobbies), TEXT],
            ["Warteraum", String(view.waiting), TEXT],
            ["Offen", `${view.lobbies.filter((lobby) => lobby.openedAt).length} / ${view.lobbies.length}`, GREEN],
            ["Setzen aus", String(view.sitOut), TEXT],
        ];

        for (const [index, [label, value, color]] of kpis.entries()) {
            const x = PAD + index * (quarter + 8);

            Box(ctx, x, 156, quarter, 92);
            Label(ctx, label, x + 14, 182);
            Write(ctx, value, x + 14, 230, "800 32px Oxanium", color, quarter - 28);
        }

        const third = (W - PAD * 2 - 16) / 3;

        for (const [index, lobby] of lobbies.entries()) {
            const x = PAD + (index % 3) * (third + 8);
            const y = 262 + Math.floor(index / 3) * 92;
            const open = lobby.openedAt !== null;

            Box(ctx, x, y, third, 82);
            Write(ctx, lobby.name, x + 14, y + 32, "800 20px Oxanium", TEXT, third - 110);
            Chip(ctx, open ? "OFFEN" : "WARTET", x + third - 14, y + 26, open ? GREEN : GOLD);
            await Avatar(ctx, lobby.host, x + 14, y + 44, 26, TILE);
            Write(ctx, `${lobby.host.name}${lobby.filler ? " · spielt mit" : ""}`, x + 48, y + 63, "700 17px Rajdhani", TEXT, third - 62);
        }

        if (view.lobbies.length > 6) Write(ctx, `+${view.lobbies.length - 6} weitere Lobbys`, W - PAD, 262 + rows * 92 - 6, "700 15px Rajdhani", MUTED, 300, "right");

        let y = 262 + rows * 92;

        Box(ctx, PAD, y, W - PAD * 2, 84);
        Label(ctx, "Wünsche · gelten bis gelöscht", PAD + 14, y + 26);

        let x = PAD + 14;

        if (!view.wishes.length) Write(ctx, "noch keine", x, y + 62, "600 18px Rajdhani", MUTED, 300);

        for (const wish of view.wishes.slice(0, 4)) {
            Box(ctx, x, y + 38, 210, 36, DEEP, 18);
            await Avatar(ctx, wish.a, x + 4, y + 42, 28, DEEP);
            await Avatar(ctx, wish.b, x + 24, y + 42, 28, DEEP);
            Write(ctx, `${wish.a.name} + ${wish.b.name}${wish.once ? " (1×)" : ""}`, x + 60, y + 62, "700 16px Rajdhani", TEXT, 144);
            x += 220;
        }

        y += 96;

        for (const warning of view.warnings.slice(0, 2)) {
            ctx.fillStyle = "rgba(240,178,50,0.12)";
            Rounded(ctx, PAD, y, W - PAD * 2, 40, 8);
            ctx.fill();
            ctx.strokeStyle = "rgba(240,178,50,0.45)";
            ctx.lineWidth = 1.5;
            ctx.stroke();
            Write(ctx, `! ${warning}`, PAD + 14, y + 26, "700 17px Rajdhani", "#f6d27a", W - PAD * 2 - 28);
            y += 48;
        }

        return canvas.toBuffer("image/png");
    });
}

/* ----------------------------------------------------------
   A8·2 Übersicht am Ende
   ---------------------------------------------------------- */
function Totals(evening: IRouletteEvening, rounds: IRouletteRound[]): { players: number; lobbies: number; end: number } {
    return {
        players: Object.keys(evening.participants).length,
        lobbies: rounds.reduce((sum, round) => sum + round.lobbies.length, 0),
        end: evening.endedAt ?? Date.now(),
    };
}

function Participation(evening: IRouletteEvening): { id: string; name: string; rounds: number }[] {
    return Object.entries(evening.participants)
        .map(([id, entry]) => ({ id, ...entry }))
        .sort((a, b) => b.rounds - a.rounds || a.name.localeCompare(b.name, "de"));
}

export function SummaryAlt(evening: IRouletteEvening, rounds: IRouletteRound[], page: number): string {
    const { players, lobbies, end } = Totals(evening, rounds);
    const shown = rounds.slice(page * ROUNDS_PER_IMAGE, (page + 1) * ROUNDS_PER_IMAGE);
    const lines = shown.map(
        (round) => `Runde ${round.number} um ${Clock(round.createdAt)}: ${round.lobbies.map((lobby) => `${lobby.name}: ${Team(lobby, 0)} gegen ${Team(lobby, 1)}, Host ${NameOf(lobby, lobby.host)}`).join("; ")}`
    );
    const who = page === 0 ? ` Wer war wie oft dabei: ${Participation(evening).map((entry) => `${entry.name} ${entry.rounds}`).join(", ")}.` : "";

    return Cut(
        `Übersicht Rocket Roulette, ${Day(evening.startsAt)}, ${Clock(evening.startsAt)} bis ${Clock(end)}: ${rounds.length} Runden, ${players} Spieler, ${lobbies} Lobbys, Dauer ${Duration(evening.startsAt, end)}. ` +
            `Bild ${page + 1} von ${SummaryPages(rounds)}. ${lines.join(". ")}.${who}`
    );
}

export async function RenderSummary(evening: IRouletteEvening, rounds: IRouletteRound[], page: number, avatars: AvatarMap = {}): Promise<Buffer> {
    return Cached(`summary:${JSON.stringify([evening, rounds, page, avatars])}`, async () => {
        const shown = rounds.slice(page * ROUNDS_PER_IMAGE, (page + 1) * ROUNDS_PER_IMAGE);
        const first = page === 0;
        const blocks = shown.reduce((sum, round) => sum + 46 + round.lobbies.length * 30 + 12, 0);
        const H = 228 + blocks + (first ? 118 : 0) + 28;
        const canvas = createCanvas(W, H);
        const ctx = canvas.getContext("2d");
        const { players, lobbies, end } = Totals(evening, rounds);

        Box(ctx, 0, 0, W, H, BG, 0);
        Stripe(ctx, "ended");
        Label(ctx, `${Day(evening.startsAt)} · ${Clock(evening.startsAt)} bis ${Clock(end)}${SummaryPages(rounds) > 1 ? ` · Bild ${page + 1} von ${SummaryPages(rounds)}` : ""}`, PAD, 46);
        Write(ctx, "Rocket Roulette · Übersicht", PAD, 90, "800 34px Oxanium", TEXT, 640);
        Stamp(ctx, "BEENDET", W - PAD, 68, GREY);

        const quarter = (W - PAD * 2 - 24) / 4;
        const kpis: [string, string][] = [
            ["Runden", String(rounds.length)],
            ["Spieler", String(players)],
            ["Lobbys", String(lobbies)],
            ["Dauer", Duration(evening.startsAt, end)],
        ];

        for (const [index, [label, value]] of kpis.entries()) {
            const x = PAD + index * (quarter + 8);

            Box(ctx, x, 120, quarter, 92);
            Label(ctx, label, x + 14, 146);
            Write(ctx, value, x + 14, 194, "800 32px Oxanium", TEXT, quarter - 28);
        }

        let y = 228;

        for (const round of shown) {
            const height = 46 + round.lobbies.length * 30;

            Box(ctx, PAD, y, W - PAD * 2, height);
            Label(ctx, `Runde ${round.number} · ${Clock(round.createdAt)}`, PAD + 14, y + 28);
            Label(ctx, `${round.lobbies.length} Lobbys`, W - PAD - 14, y + 28, MUTED, "right");

            for (const [index, lobby] of round.lobbies.entries()) {
                const ly = y + 60 + index * 30;

                Write(ctx, lobby.name, PAD + 14, ly, "800 16px Oxanium", TEXT, 110);
                Write(ctx, Team(lobby, 0), PAD + 132, ly, "600 16px Rajdhani", TEXT2, 300);
                Write(ctx, "vs", PAD + 444, ly, "700 15px Rajdhani", MUTED, 30);
                Write(ctx, Team(lobby, 1), PAD + 476, ly, "600 16px Rajdhani", TEXT2, 300);
                Crown(ctx, W - PAD - 150, ly - 13, 14);
                Write(ctx, NameOf(lobby, lobby.host), W - PAD - 130, ly, "700 16px Rajdhani", GOLD, 116);
            }

            y += height + 12;
        }

        if (first) {
            Box(ctx, PAD, y, W - PAD * 2, 118);
            Label(ctx, "Wer war wie oft dabei", PAD + 14, y + 28);

            let x = PAD + 14;
            let row = 0;
            const entries = Participation(evening);

            for (const [index, entry] of entries.entries()) {
                ctx.font = "700 16px Rajdhani";

                const width = ctx.measureText(`${entry.name}  ${entry.rounds}`).width + 48;

                if (x + width > W - PAD - 14) {
                    row++;
                    x = PAD + 14;
                }

                if (row > 1) {
                    Label(ctx, `+${entries.length - index} weitere`, W - PAD - 14, y + 28, MUTED, "right");
                    break;
                }

                Box(ctx, x, y + 40 + row * 38, width, 30, DEEP, 15);
                await Avatar(ctx, { id: entry.id, name: entry.name, url: avatars[entry.id] ?? null }, x + 3, y + 43 + row * 38, 24, DEEP);
                Write(ctx, entry.name, x + 34, y + 61 + row * 38, "700 16px Rajdhani", TEXT, width - 60);
                Write(ctx, String(entry.rounds), x + width - 12, y + 61 + row * 38, "800 14px Oxanium", MUTED, 30, "right");
                x += width + 8;
            }
        }

        return canvas.toBuffer("image/png");
    });
}
