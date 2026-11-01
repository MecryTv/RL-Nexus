/**
 * Level System, Plan 37: „Aktivste der Woche“ (Montag 18:00, die Vorwoche) und
 * „Aktivste des Monats“ (am 1. um 18:00, der Vormonat) als Ranglisten-Bild,
 * dazu eine Rolle für Platz 1 bis 3, die beim nächsten Post wandert. Und die
 * Ankündigung der Zeitfenster mit mehr Punkten. Siehe docs/Levels.md.
 */
import { AttachmentBuilder, ChannelType, Guild, GuildMember, MessageFlags, SendableChannels } from "discord.js";
import { LRUCache } from "lru-cache";
import BotClient from "../../client/BotClient";
import { ZoneParts } from "../../constants/Matchups";
import { PER_PAGE } from "../../constants/Levels";
import { DefaultBoardStyle } from "../../constants/LevelDesign";
import { IBoardHooks } from "../../builder/BoardRenderer";
import { ILevelSettings, ITopPost, LevelTopKind } from "../../interfaces/services/levels/ILevels";
import { ActiveBoost, BoostText, FactorText, Occurrence } from "./Boost";
import { RenderDoc } from "../../builder/MessageDoc";
import logger from "../../utils/logger";

/** Ab dieser Stunde (Berlin) wird gepostet - bis Mitternacht holt der Minutenlauf nach. */
export const TOP_HOUR = 18;

export const TOP_TITLE: Record<LevelTopKind, string> = { week: "Aktivste der Woche", month: "Aktivste des Monats" };

/**
 * Beginn und Ende eines Fensters werden nur so kurz danach angekündigt - nach
 * einem Neustart nicht verspätet. Fünf Minuten, weil der Minutenlauf bei
 * vielen Servern später drankommt (Review).
 */
const ANNOUNCE_WINDOW = 5 * 60_000;
const DAY = 86_400_000;

function DayOf(year: number, month: number, day: number): number {
    return Date.UTC(year, month - 1, day) / DAY;
}

function DateText(day: number): string {
    const date = new Date(day * DAY);

    return `${String(date.getUTCDate()).padStart(2, "0")}.${String(date.getUTCMonth() + 1).padStart(2, "0")}.`;
}

/**
 * Ist jetzt ein Post fällig? Woche: montags ab 18:00 (Berlin), die Tage
 * Montag bis Sonntag davor. Monat: am 1. ab 18:00, der Vormonat. Tage sind
 * UTC-Tage mit dem Datum der Berliner Kalendertage. key ist der Beginn.
 */
export function TopDue(kind: LevelTopKind, now: number): { key: string; from: number; to: number } | null {
    const today = ZoneParts(now);

    if (today.hour < TOP_HOUR) return null;

    if (kind === "week") {
        if (today.weekday !== 1) return null;

        const to = DayOf(today.year, today.month, today.day) - 1;
        const from = to - 6;

        return { key: new Date(from * DAY).toISOString().slice(0, 10), from, to };
    }

    if (today.day !== 1) return null;

    const from = DayOf(today.year, today.month - 1, 1);
    const start = new Date(from * DAY);

    return { key: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`, from, to: DayOf(today.year, today.month, 1) - 1 };
}

/** Oben rechts im Bild: „26.10.–01.11.“ bzw. „Oktober“. */
function Chip(kind: LevelTopKind, due: { from: number; to: number }): string {
    return kind === "week" ? `${DateText(due.from)}–${DateText(due.to)}` : new Intl.DateTimeFormat("de-DE", { month: "long", timeZone: "UTC" }).format(new Date(due.from * DAY));
}

async function Member(guild: Guild, id: string): Promise<GuildMember | null> {
    return guild.members.cache.get(id) ?? (await guild.members.fetch(id).catch(() => null));
}

/**
 * Den fälligen Post schicken - höchstens einmal je Zeitraum, auch nach einem
 * Neustart (LevelTop.Claim). Was schiefgeht, sammelt sich im Status fürs
 * Dashboard; Post und Rolle hängen nicht voneinander ab. true: beansprucht.
 */
export async function PostTop(client: BotClient, guild: Guild, kind: LevelTopKind, now: number, hooks: IBoardHooks = {}): Promise<boolean> {
    const due = TopDue(kind, now);

    if (!due) return false;

    const settings = await client.levelService.Settings(guild.id);
    const post = settings.top?.[kind];

    if (!post?.on || !post.channelId) return false;

    const previous = (await client.levelTop.Of(guild.id, kind))?.holders ?? [];

    if (!(await client.levelTop.Claim(guild.id, kind, due.key, now))) return false;

    // Review: bricht danach etwas ab, steht das im Status - sonst sähe es wie ein Erfolg aus.
    try {
        await Post(client, guild, kind, settings, { ...post, channelId: post.channelId }, due, previous, hooks);
    } catch (error) {
        logger.warn(`📈 ${TOP_TITLE[kind]} auf ${guild.id} abgebrochen - ${String(error)}`);
        await client.levelTop.Finish(guild.id, kind, previous, "Der Post ist abgebrochen, ein Fehler beim Zeichnen oder in der Datenbank. Der nächste Zeitraum kommt wieder.").catch(() => undefined);
    }

    return true;
}

async function Post(
    client: BotClient,
    guild: Guild,
    kind: LevelTopKind,
    settings: ILevelSettings,
    post: ITopPost & { channelId: string },
    due: { from: number; to: number },
    previous: string[],
    hooks: IBoardHooks
): Promise<void> {
    const page = await client.levelService.Board(guild, kind === "week" ? "7d" : "30d", 1, null, PER_PAGE, { from: due.from, to: due.to });

    if (!page.entries.length) {
        await client.levelTop.Finish(guild.id, kind, previous, "Niemand hatte in dem Zeitraum Punkte, deshalb kam kein Post.");

        return;
    }

    const errors: string[] = [];
    const winners = page.entries.slice(0, 3).map((entry) => entry.userId);
    const found = guild.channels.cache.get(post.channelId) ?? (await guild.channels.fetch(post.channelId).catch(() => null));
    const channel = found?.isTextBased() && found.type !== ChannelType.GuildStageVoice ? (found as SendableChannels) : null;

    if (!channel) errors.push("Den Kanal gibt es nicht mehr.");
    else {
        // Plan 38: das Bild aus dem Baukasten; {title} und {period} zeigen, was gepostet wird.
        const png = await client.levelService.BoardImage(guild, page, null, { title: TOP_TITLE[kind], period: Chip(kind, due) }, hooks);
        const sent = await channel.send({ files: [new AttachmentBuilder(png, { name: kind === "week" ? "aktivste-woche.png" : "aktivste-monat.png" })] }).catch(() => null);

        if (!sent) errors.push("Ich darf im Kanal nicht posten (Nachrichten senden, Dateien anhängen).");
    }

    let holders = previous;

    if (post.roleId) {
        const role = guild.roles.cache.get(post.roleId);

        if (!role) {
            errors.push("Die Rolle gibt es nicht mehr.");
            holders = [];
        } else if (!role.editable) errors.push(`Die Rolle „${role.name}“ steht über meiner höchsten Rolle, ich kann sie nicht vergeben.`);
        else {
            let failed = false;

            for (const id of previous.filter((holder) => !winners.includes(holder))) {
                const member = await Member(guild, id);

                if (member?.roles.cache.has(role.id)) await member.roles.remove(role.id, TOP_TITLE[kind]).catch(() => void (failed = true));
            }

            for (const id of winners) {
                const member = await Member(guild, id);

                if (member && !member.roles.cache.has(role.id)) await member.roles.add(role.id, TOP_TITLE[kind]).catch(() => void (failed = true));
            }

            if (failed) errors.push(`Die Rolle „${role.name}“ ließ sich nicht bei allen ändern.`);

            holders = winners;
        }
    }

    await client.levelTop.Finish(guild.id, kind, holders, errors.length ? errors.join(" ") : null);

    if (errors.length) logger.warn(`📈 ${TOP_TITLE[kind]} auf ${guild.id}: ${errors.join(" ")}`);
}

/** Discord-Zeit, die jeder in seiner Zeitzone sieht. */
function Stamp(ms: number, style: "F" | "R"): string {
    return `<t:${Math.floor(ms / 1000)}:${style}>`;
}

/**
 * Beginn und Ende der Fenster mit „ankündigen“ in boostChannelId - je Fenster
 * einmal, höchstens fünf Minuten danach. seen merkt sich, was schon raus ist.
 * Plan 43: Mit eigener Gestaltung (boostMessages) als Karte mit Platzhaltern,
 * Rollen darin pingen, @everyone und @here nicht; ohne sie der bisherige Satz.
 * ponytail: nur im Speicher; ein Neustart innerhalb der fünf Minuten kündigt
 * ein zweites Mal an.
 */
export async function AnnounceBoosts(client: BotClient, guild: Guild, settings: ILevelSettings, now: number, seen: LRUCache<string, true>): Promise<void> {
    if (!settings.boostChannelId || !settings.boosts?.some((boost) => boost.announce)) return;

    const channel = guild.channels.cache.get(settings.boostChannelId);

    if (!channel?.isTextBased()) return;

    for (const boost of settings.boosts) {
        const occurrence = boost.announce ? Occurrence(boost, now) : null;

        if (!occurrence) continue;

        const edges = [
            { at: occurrence.start, live: now < occurrence.end, doc: settings.boostMessages?.start ?? null, text: () => `Ab jetzt: **${BoostText(ActiveBoost([boost], now), now)}**.` },
            { at: occurrence.end, live: true, doc: settings.boostMessages?.end ?? null, text: () => `Die ${FactorText(boost.factor)}× XP sind vorbei.` },
        ];
        // {boost} ist der Text vom Beginn - am Ende läuft das Fenster nicht mehr.
        const values = (): Record<string, string> => ({
            boost: BoostText(ActiveBoost([boost], occurrence.start), occurrence.start),
            "boost.factor": FactorText(boost.factor),
            "boost.start": Stamp(occurrence.start, "F"),
            "boost.end": Stamp(occurrence.end, "F"),
            "boost.end.relative": Stamp(occurrence.end, "R"),
            guild: guild.name,
        });

        for (const [index, edge] of edges.entries()) {
            const key = `${guild.id}:${boost.id}:${occurrence.start}:${index}`;

            if (!edge.live || now < edge.at || now - edge.at >= ANNOUNCE_WINDOW || seen.has(key)) continue;

            seen.set(key, true);

            if (!edge.doc) {
                await (channel as SendableChannels).send({ content: edge.text(), allowedMentions: { parse: [] } }).catch(() => undefined);
                continue;
            }

            const { builder, files } = await RenderDoc(client, edge.doc, values(), { fallback: edge.text() });

            await (channel as SendableChannels).send({ components: [builder.build()], files, flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: ["roles"] } }).catch(() => undefined);
        }
    }
}
