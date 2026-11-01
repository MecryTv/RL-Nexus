/**
 * Level System, Plan 34: `/level rang` als reines Bild und `/level rangliste`
 * als Bild mit Knöpfen (Zeitraum, Blättern, Meine Seite). Drückt jemand
 * anderes als der Fragende, bekommt er die Seite als eigene Antwort - die
 * Nachricht im Kanal bleibt. Plan 43: Die feste Rangliste im Kanal gehört
 * niemandem (Besitzer „kanal“) und hat dazu „Meine Karte“. Siehe docs/Levels.md.
 */
import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, Guild, MessageFlags } from "discord.js";
import BotClient from "../../client/BotClient";
import { LEVEL_PERIODS, PERIOD_LABEL } from "../../constants/Levels";
import { IBoardPage, LevelPeriod } from "../../interfaces/services/levels/ILevels";

export type BoardPayload = { files: AttachmentBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } | { content: string };

const EMPTY = "Im Zeitraum hat noch niemand Punkte.";
/** Plan 43: Besitzer der Knöpfe an der festen Rangliste - keine Discord-ID, also antwortet jeder Klick nur dem Drücker. */
export const CHANNEL_OWNER = "kanal";
const NO_POINTS = "Du hast im Zeitraum noch keine Punkte.";

export function IsPeriod(value: unknown): value is LevelPeriod {
    return (LEVEL_PERIODS as readonly unknown[]).includes(value);
}

/** `/level rang`: nur das Bild, ohne Rahmen und ohne Text. */
export function RankPayload(png: Buffer): { files: AttachmentBuilder[] } {
    return { files: [new AttachmentBuilder(png, { name: "level.png" })] };
}

function Button(customId: string, label: string, style: ButtonStyle, disabled = false): ButtonBuilder {
    return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style).setDisabled(disabled);
}

/** Zeitraum oben, Blättern unten. Blättern hat ein eigenes Präfix (lv:n), sonst gäbe es auf Seite 1 dieselbe ID zweimal. card: dazu „Meine Karte“. */
function Rows(board: IBoardPage, ownerId: string, card = false): ActionRowBuilder<ButtonBuilder>[] {
    const periods = LEVEL_PERIODS.map((period) => Button(`lv:p:${period}:1:${ownerId}`, PERIOD_LABEL[period], period === board.period ? ButtonStyle.Primary : ButtonStyle.Secondary));
    const pages = [
        Button(`lv:n:${board.period}:${board.page - 1}:${ownerId}`, "◀ Zurück", ButtonStyle.Secondary, board.page <= 1),
        Button("lv:x", `Seite ${board.page} von ${board.pages}`, ButtonStyle.Secondary, true),
        Button(`lv:n:${board.period}:${board.page + 1}:${ownerId}`, "Weiter ▶", ButtonStyle.Secondary, board.page >= board.pages),
        Button(`lv:me:${board.period}:${ownerId}`, "Meine Seite", ButtonStyle.Secondary),
        ...(card ? [Button("lv:card", "Meine Karte", ButtonStyle.Secondary)] : []),
    ];

    return [new ActionRowBuilder<ButtonBuilder>().addComponents(periods), new ActionRowBuilder<ButtonBuilder>().addComponents(pages)];
}

async function Payload(client: BotClient, guild: Guild, board: IBoardPage, viewerId: string | null, ownerId: string, card = false): Promise<BoardPayload> {
    if (!board.total) return { content: EMPTY };

    const png = await client.levelService.BoardImage(guild, board, viewerId);

    return { files: [new AttachmentBuilder(png, { name: "rangliste.png" })], components: Rows(board, ownerId, card) };
}

/** Eine Seite der Rangliste als Nachricht. ownerId: wessen Knöpfe die Nachricht ändern. */
export async function BoardMessage(client: BotClient, guild: Guild, period: LevelPeriod, page: number, viewerId: string | null, ownerId: string): Promise<BoardPayload> {
    // Plan 38: so viele Plätze je Seite, wie das Design zeigt (Kompakt 20).
    const board = await client.levelService.Board(guild, period, page, viewerId, await client.levelService.PerPage(guild.id));

    return Payload(client, guild, board, viewerId, ownerId);
}

/** Plan 43: die feste Rangliste im Kanal - ohne Betrachter, alle Knöpfe samt „Meine Karte“. */
export function BoardChannelPayload(client: BotClient, guild: Guild, board: IBoardPage): Promise<BoardPayload> {
    return Payload(client, guild, board, null, CHANNEL_OWNER, true);
}

/** Die Knöpfe lv:p, lv:n, lv:me und lv:card. lv:x ist nur Anzeige. */
export async function HandleBoardButton(client: BotClient, interaction: ButtonInteraction): Promise<void> {
    const parts = interaction.customId.split(":");
    const kind = parts[1];
    const period = parts[2];
    const guild = interaction.guild;

    // Plan 43: die eigene Karte wie /level rang, nur für den Drücker.
    if (kind === "card" && guild) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const member = guild.members.cache.get(interaction.user.id) ?? (await guild.members.fetch(interaction.user.id));

        await interaction.editReply(RankPayload(await client.levelService.CardImage(member)));

        return;
    }

    if (kind === "x" || !guild || !IsPeriod(period)) return;

    const owner = kind === "me" ? parts[3] : parts[4];
    const mine = interaction.user.id === owner;
    const page = kind === "me" ? await client.levelService.PageOf(guild, period, interaction.user.id, await client.levelService.PerPage(guild.id)) : Number(parts[3]);

    if (mine) await interaction.deferUpdate();
    else await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (page === null) {
        if (mine) await interaction.followUp({ content: NO_POINTS, flags: MessageFlags.Ephemeral });
        else await interaction.editReply({ content: NO_POINTS });

        return;
    }

    const payload = await BoardMessage(client, guild, period, page, interaction.user.id, interaction.user.id);

    if ("content" in payload) {
        if (mine) await interaction.followUp({ content: payload.content, flags: MessageFlags.Ephemeral });
        else await interaction.editReply({ content: payload.content });

        return;
    }

    await interaction.editReply({ ...payload, attachments: [] });
}
