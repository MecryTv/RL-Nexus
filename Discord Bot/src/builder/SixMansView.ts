import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, Guild, MessageActionRowComponentBuilder, MessageFlags } from "discord.js";
import BotClient from "../client/BotClient";
import { CustomMessageView, ICustomView } from "./CustomView";
import { AnyPlaceholderValues } from "../constants/Placeholders";
import { DEFAULT_RANKS, MODES, MODE_HINTS, MODE_LABELS, RankName, RankOf, SIXMANS_PREFIX, TEAM_EMOJI, TEAM_LABELS } from "../constants/SixMans";
import { IManRank, ISixBody, ISixRound, ISixWaiting, ManMode, SixTeam } from "../interfaces/services/sixmans/ISixMans";

/**
 * Die Nachrichten von 2, 4 & 6 Mans: das Panel mit den Warteschlangen, die
 * Runde und das Ergebnis. Wie sie aussehen, steht im Dashboard - hier stehen
 * die Werte der Platzhalter und die Knöpfe, die der Bot anhängt.
 */

function row(...buttons: ButtonBuilder[]): ActionRowBuilder<MessageActionRowComponentBuilder> {
    return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(...buttons);
}

/**
 * Je Modus ein Knopf zum Beitreten, dazu einer zum Verlassen. Ein voller Modus
 * ist gesperrt - dann läuft gerade die Aufteilung.
 */
export function PanelRow(modes: ManMode[], full: (mode: ManMode) => boolean): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
    const open = modes.length ? modes : MODES;
    const buttons = open.map((mode) =>
        new ButtonBuilder()
            .setCustomId(`${SIXMANS_PREFIX}:join:${mode}`)
            .setLabel(MODE_LABELS[mode])
            .setEmoji("🎮")
            .setStyle(ButtonStyle.Success)
            .setDisabled(full(mode))
    );

    return [row(...buttons, new ButtonBuilder().setCustomId(`${SIXMANS_PREFIX}:leave`).setLabel("Verlassen").setEmoji("🚪").setStyle(ButtonStyle.Secondary))];
}

/** Wer gewonnen hat - unter der Runde. */
export function RoundRow(roundId: number): ActionRowBuilder<MessageActionRowComponentBuilder> {
    return row(
        new ButtonBuilder().setCustomId(`${SIXMANS_PREFIX}:win:${roundId}:1`).setLabel("Blau gewinnt").setEmoji(TEAM_EMOJI[1]).setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`${SIXMANS_PREFIX}:win:${roundId}:2`).setLabel("Orange gewinnt").setEmoji(TEAM_EMOJI[2]).setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`${SIXMANS_PREFIX}:cancel:${roundId}`).setLabel("Abbrechen").setEmoji("✖️").setStyle(ButtonStyle.Secondary)
    );
}

/** Eine Warteschlange als Liste - je Zeile einer, mit Stufe und Wartezeit. */
export function QueueText(queue: ISixWaiting[], ranks: IManRank[] = DEFAULT_RANKS): string {
    if (!queue.length) return "_Noch niemand._";

    return queue
        .map((entry, index) => `${index + 1}. <@${entry.userId}> · ${RankName(entry.mmr, ranks)} \`${entry.mmr}\` · <t:${Math.floor(entry.since / 1000)}:R>`)
        .join("\n");
}

/** Alle Warteschlangen untereinander - je Modus ein Block mit Überschrift. */
export function QueuesText(queues: Record<ManMode, ISixWaiting[]>, modes: ManMode[], ranks: IManRank[] = DEFAULT_RANKS): string {
    if (!modes.length) return "_Gerade läuft kein Modus._";

    return modes
        .map((mode) => `**${MODE_LABELS[mode]}** · ${MODE_HINTS[mode]} · ${queues[mode]?.length ?? 0}/${mode}\n${QueueText(queues[mode] ?? [], ranks)}`)
        .join("\n\n");
}

/** Ein Team als Liste - mit Stufe und MMR, damit die Aufteilung nachvollziehbar ist. */
export function TeamText(round: ISixRound, team: 1 | 2, ranks: IManRank[] = DEFAULT_RANKS): string {
    const ids = team === 1 ? round.blue : round.orange;

    return ids.map((id) => `• <@${id}> · ${RankName(round.before[id] ?? 0, ranks)} \`${round.before[id] ?? 0}\``).join("\n") || "_leer_";
}

function Average(round: ISixRound, team: 1 | 2): number {
    const ids = team === 1 ? round.blue : round.orange;
    const sum = ids.reduce((total, id) => total + (round.before[id] ?? 0), 0);

    return ids.length ? Math.round(sum / ids.length) : 0;
}

export interface IPanelInput {
    guild: Guild;
    queues: Record<ManMode, ISixWaiting[]>;
    /** Welche Modi gerade laufen. */
    modes: ManMode[];
    /** Die Stufen dieses Servers. */
    ranks?: IManRank[];
    rounds: number;
    players: number;
    best: { name: string; mmr: number; mode: ManMode } | null;
}

export function PanelValues(input: IPanelInput): AnyPlaceholderValues {
    const ranks = input.ranks?.length ? input.ranks : DEFAULT_RANKS;
    const values: Record<string, string> = {
        guild: input.guild.name,
        "guild.icon": input.guild.iconURL({ size: 256 }) ?? "",
        warteschlange: QueuesText(input.queues, input.modes, ranks),
        anzahl: String(input.modes.reduce((sum, mode) => sum + (input.queues[mode]?.length ?? 0), 0)),
        modi: input.modes.map((mode) => MODE_LABELS[mode]).join(", ") || "keiner",
        runden: String(input.rounds),
        spieler: String(input.players),
        bester: input.best ? `${input.best.name} · ${RankName(input.best.mmr, ranks)} ${input.best.mmr} (${MODE_LABELS[input.best.mode]})` : "noch niemand",
    };

    for (const mode of MODES) {
        const queue = input.queues[mode] ?? [];

        values[`anzahl.${mode}`] = String(queue.length);
        values[`frei.${mode}`] = String(Math.max(0, mode - queue.length));
        values[`warteschlange.${mode}`] = QueueText(queue, ranks);
    }

    return values;
}

export function RoundValues(guild: Guild, round: ISixRound, ranks: IManRank[] = DEFAULT_RANKS): AnyPlaceholderValues {
    const blue = Average(round, 1);
    const orange = Average(round, 2);
    const winner = round.winner as SixTeam;
    const loser: SixTeam = winner === 1 ? 2 : winner === 2 ? 1 : 0;

    return {
        guild: guild.name,
        "guild.icon": guild.iconURL({ size: 256 }) ?? "",
        runde: String(round.id),
        modus: MODE_LABELS[round.mode] ?? `${round.mode} Mans`,
        "modus.spiel": MODE_HINTS[round.mode] ?? "",
        blau: TeamText(round, 1, ranks),
        orange: TeamText(round, 2, ranks),
        "blau.mmr": String(blue),
        "orange.mmr": String(orange),
        "blau.rang": RankName(blue, ranks),
        "orange.rang": RankName(orange, ranks),
        lobby: round.lobbyName,
        passwort: round.lobbyPass,
        "kanal.blau": round.channels.blue ? `🔵 <#${round.channels.blue}>` : "",
        "kanal.orange": round.channels.orange ? `🟠 <#${round.channels.orange}>` : "",
        spieler: String(round.blue.length + round.orange.length),
        "mmr.schnitt": String(Math.round((blue + orange) / 2)),
        sieger: winner ? TeamText(round, winner as 1 | 2, ranks) : "",
        "sieger.team": winner ? `${TEAM_EMOJI[winner as 1 | 2]} ${TEAM_LABELS[winner as 1 | 2]}` : "",
        verlierer: loser ? TeamText(round, loser as 1 | 2, ranks) : "",
        veraenderung: round.change ? `±${round.change}` : "±0",
    };
}

/** Eine Nachricht aus dem Dashboard, dazu die Knöpfe des Bots. */
export async function SixRender(
    client: BotClient,
    body: ISixBody,
    values: AnyPlaceholderValues,
    rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = []
): Promise<ICustomView> {
    const view = await CustomMessageView(
        client,
        { id: 0, kind: body.kind, content: body.content, embed: body.embed, doc: body.doc, buttons: [], reserve: rows.length },
        values
    );

    if (!rows.length) return view;

    if (view.flags === MessageFlags.IsComponentsV2) {
        const container = view.components[0] as ContainerBuilder;

        for (const entry of rows) container.addActionRowComponents(entry);

        return view;
    }

    return { ...view, components: [...view.components, ...rows] };
}
