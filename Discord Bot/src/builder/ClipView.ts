import { Guild } from "discord.js";
import BotClient from "../client/BotClient";
import { CustomMessageView, ICustomView } from "./CustomView";
import { AnyPlaceholderValues } from "../constants/Placeholders";
import { IClipBody, IClipRound, IClipSettings } from "../interfaces/services/clips/IClips";

/**
 * Wie Clips der Woche in Discord spricht: die drei Ansagen (Kanal offen,
 * Abstimmung läuft, Gewinner) baut das Team im Dashboard selbst. Hier stehen
 * nur die Werte der Platzhalter. Die Logik steckt im ClipService.
 */

const MEDALS = ["🥇", "🥈", "🥉"];

function Stamp(ms: number, style = "f"): string {
    return `<t:${Math.floor(ms / 1000)}:${style}>`;
}

/** Die Preise je Platz - leere Plätze fallen weg. */
export function PrizeText(prizes: string[]): string {
    return prizes
        .map((prize, index) => (prize.trim() ? `${MEDALS[index] ?? `${index + 1}.`} ${prize.trim()}` : ""))
        .filter(Boolean)
        .join("\n");
}

/** Die Gewinner als Liste - oder ein Satz, wenn es keine gibt. */
export function WinnerText(round: IClipRound): string {
    if (!round.winners.length) return "Diesmal gibt es keine Gewinner – es kam keine Stimme zusammen.";

    return round.winners
        .map((winner) => {
            const votes = winner.votes === 1 ? "1 Stimme" : `${winner.votes} Stimmen`;

            return `${MEDALS[winner.place - 1] ?? `${winner.place}.`} <@${winner.userId}> – ${votes}${winner.prize ? ` · ${winner.prize}` : ""}`;
        })
        .join("\n");
}

/**
 * Die Werte für die Platzhalter der Ansagen. Dieselben Schlüssel wie
 * CLIP_KEYS und WINNER_KEYS (constants/Clips.ts).
 */
export function ClipValues(guild: Guild, settings: IClipSettings, round: IClipRound | null, count: number, publicUrl: string | null): AnyPlaceholderValues {
    const prizes = PrizeText(round?.prizes ?? settings.prizes);
    const winners = round?.winners ?? [];
    const place = (index: number): string => (winners[index] ? `<@${winners[index]!.userId}>` : "");

    return {
        guild: guild.name,
        "guild.icon": guild.iconURL({ size: 256 }) ?? "",
        kanal: settings.channelId ? `<#${settings.channelId}>` : "Clip-Kanal",
        max: settings.maxPerUser === 1 ? "einen Clip" : `bis zu ${settings.maxPerUser} Clips`,
        // Bringt die Überschrift mit: ohne Preise bleibt keine halbe Zeile stehen.
        preise: prizes ? `**Zu gewinnen**\n${prizes}` : "",
        emoji: settings.emoji,
        link: publicUrl ? `[Alle Clips ansehen](${publicUrl})` : "",
        runde: round ? Stamp(round.openedAt, "D") : "",
        schluss: round ? Stamp(round.closesAt) : "",
        "schluss.countdown": round ? Stamp(round.closesAt, "R") : "",
        ende: round ? Stamp(round.endsAt) : "",
        "ende.countdown": round ? Stamp(round.endsAt, "R") : "",
        anzahl: count === 1 ? "ein Clip" : `${count} Clips`,
        gewinner: round ? WinnerText(round) : "",
        platz1: place(0),
        platz2: place(1),
        platz3: place(2),
    };
}

/** Eine Ansage aus dem Dashboard, fertig für den Kanal. */
export function ClipNoticeView(client: BotClient, body: IClipBody, values: AnyPlaceholderValues): Promise<ICustomView> {
    return CustomMessageView(client, { id: 0, kind: body.kind, content: body.content, embed: body.embed, doc: body.doc, buttons: [] }, values);
}
