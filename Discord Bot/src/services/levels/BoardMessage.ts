/**
 * Level System, Plan 34: `/level rang` als reines Bild und `/level rangliste`
 * als Bild mit Knöpfen (Zeitraum, Blättern, Meine Seite). Drückt jemand
 * anderes als der Fragende, bekommt er die Seite als eigene Antwort - die
 * Nachricht im Kanal bleibt. Siehe docs/Levels.md.
 */
import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, Guild, MessageFlags } from "discord.js";
import BotClient from "../../client/BotClient";
import { LEVEL_PERIODS, PERIOD_LABEL } from "../../constants/Levels";
import { IBoardPage, LevelPeriod } from "../../interfaces/services/levels/ILevels";

export type BoardPayload = { files: AttachmentBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } | { content: string };

const EMPTY = "Im Zeitraum hat noch niemand Punkte.";
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

/** Zeitraum oben, Blättern unten. Blättern hat ein eigenes Präfix (lv:n), sonst gäbe es auf Seite 1 dieselbe ID zweimal. */
function Rows(board: IBoardPage, ownerId: string): ActionRowBuilder<ButtonBuilder>[] {
    const periods = LEVEL_PERIODS.map((period) => Button(`lv:p:${period}:1:${ownerId}`, PERIOD_LABEL[period], period === board.period ? ButtonStyle.Primary : ButtonStyle.Secondary));
    const pages = [
        Button(`lv:n:${board.period}:${board.page - 1}:${ownerId}`, "◀ Zurück", ButtonStyle.Secondary, board.page <= 1),
        Button("lv:x", `Seite ${board.page} von ${board.pages}`, ButtonStyle.Secondary, true),
        Button(`lv:n:${board.period}:${board.page + 1}:${ownerId}`, "Weiter ▶", ButtonStyle.Secondary, board.page >= board.pages),
        Button(`lv:me:${board.period}:${ownerId}`, "Meine Seite", ButtonStyle.Secondary),
    ];

    return [new ActionRowBuilder<ButtonBuilder>().addComponents(periods), new ActionRowBuilder<ButtonBuilder>().addComponents(pages)];
}

/** Eine Seite der Rangliste als Nachricht. ownerId: wessen Knöpfe die Nachricht ändern. */
export async function BoardMessage(client: BotClient, guild: Guild, period: LevelPeriod, page: number, viewerId: string | null, ownerId: string): Promise<BoardPayload> {
    // Plan 38: so viele Plätze je Seite, wie das Design zeigt (Kompakt 20).
    const board = await client.levelService.Board(guild, period, page, viewerId, await client.levelService.PerPage(guild.id));

    if (!board.total) return { content: EMPTY };

    const png = await client.levelService.BoardImage(guild, board, viewerId);

    return { files: [new AttachmentBuilder(png, { name: "rangliste.png" })], components: Rows(board, ownerId) };
}

/** Die Knöpfe lv:p, lv:n und lv:me. lv:x ist nur Anzeige. */
export async function HandleBoardButton(client: BotClient, interaction: ButtonInteraction): Promise<void> {
    const parts = interaction.customId.split(":");
    const kind = parts[1];
    const period = parts[2];
    const guild = interaction.guild;

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
