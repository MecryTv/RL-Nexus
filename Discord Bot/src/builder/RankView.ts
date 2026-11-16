import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { IRankCardData, RankCardPage, RenderRankCard } from "./RankCard";
import { TrackerURL } from "../constants/Prime";
import { IPrimeProfile } from "../interfaces/services/prime/IPrimeService";

/** Knöpfe unter der Rang-Karte: rk:<Zielseite>:<Epic-Konto-ID>:<Discord-ID dessen, der gefragt hat>. */
export const RANK_PREFIX = "rk";

/**
 * W-0129: Die Knopfreihe unter der Karte. Links wechselt die Seite (Entwurf A:
 * der Knopf heißt so, wie die andere Seite heißt), rechts der Link zum Tracker.
 *
 * Die Konto-ID steht im Knopf, damit der Bot die Karte nach einem Neustart
 * noch zeichnen kann; die Discord-ID, damit nur der Fragende die Nachricht
 * umschaltet und alle anderen eine eigene Antwort bekommen.
 */
export function RankRow(profile: IPrimeProfile, page: RankCardPage, ownerId: string): ActionRowBuilder<ButtonBuilder> {
    const target: RankCardPage = page === "extra" ? "ranked" : "extra";

    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`${RANK_PREFIX}:${target}:${profile.accountId}:${ownerId}`)
            .setStyle(ButtonStyle.Secondary)
            .setLabel(target === "extra" ? "Extra-Modi" : "Ranked")
            .setEmoji(target === "extra" ? "🎮" : "🏆"),
        // Ein Link-Knopf, kein Klick-Ereignis: Discord öffnet die Adresse selbst
        // und er bleibt gültig, solange die Nachricht steht.
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Beim Tracker ansehen").setEmoji("🔗").setURL(TrackerURL(profile.name))
    );
}

/** Karte zeichnen und mit Knöpfen als Nachricht verpacken. */
export async function RankMessage(data: IRankCardData & { page: RankCardPage }, ownerId: string): Promise<{ files: AttachmentBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] }> {
    const png = await RenderRankCard(data);

    return {
        files: [new AttachmentBuilder(png, { name: `rank-${data.profile.accountId}-${data.page}.png` })],
        components: [RankRow(data.profile, data.page, ownerId)],
    };
}
