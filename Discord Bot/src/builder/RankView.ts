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

/**
 * W-0150: Die Zeile über einer Karte mit altem Stand (Entwurf B). Die Karte sagt
 * es unten in Orange (drawFreshness), hier steht dazu, von wann der Stand ist -
 * als Discord-Zeitstempel, jeder sieht ihn in seiner Zeitzone. self: die eigene
 * Karte (/rank me) oder die eines anderen (/rank search). null bei frischem Stand.
 */
export function StaleNotice(profile: IPrimeProfile, self: boolean): string | null {
    if (!profile.stale) return null;

    const at = Math.floor(Date.parse(profile.fetchedAt) / 1000);
    const cause = profile.stale === "access" ? "Die Rang-Abfrage ist gerade nicht freigeschaltet." : "Rocket League antwortet gerade nicht.";
    const whose = self ? "dein letzter Stand" : `der letzte Stand von **${profile.name}**`;

    return `⚠️ **${cause}** Das ist ${whose} vom <t:${at}:f> (<t:${at}:R>).\n-# Für aktuelle Zahlen /rank ${self ? "me" : "search"} später noch einmal ausführen.`;
}

/** Karte zeichnen und mit Knöpfen als Nachricht verpacken. */
export async function RankMessage(
    data: IRankCardData & { page: RankCardPage; self: boolean },
    ownerId: string
): Promise<{ content: string; files: AttachmentBuilder[]; components: ActionRowBuilder<ButtonBuilder>[]; allowedMentions: { parse: [] } }> {
    const png = await RenderRankCard(data);

    return {
        // W-0150: leer bei frischem Stand - so verschwindet die Zeile auch beim Seitenwechsel.
        content: StaleNotice(data.profile, data.self) ?? "",
        files: [new AttachmentBuilder(png, { name: `rank-${data.profile.accountId}-${data.page}.png` })],
        components: [RankRow(data.profile, data.page, ownerId)],
        // Der Name in der Zeile kommt von Prime - pingen soll er niemanden.
        allowedMentions: { parse: [] },
    };
}
