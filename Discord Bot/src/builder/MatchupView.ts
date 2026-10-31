import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, Guild } from "discord.js";
import BotClient from "../client/BotClient";
import { CustomMessageView, ICustomView } from "./CustomView";
import { AnyPlaceholderValues } from "../constants/Placeholders";
import { FormText, LIVE_HOURS, MATCHUPS_ACCENT, MATCHUPS_PREFIX, MatchupStateName, MODE_LABELS, OUTCOME_COLORS, OutcomeOf, RecordText, StreakText } from "../constants/Matchups";
import { IMatchup, IMatchupBody, IMatchupRecord, IMatchupSettings, Outcome } from "../interfaces/services/matchups/IMatchups";
import { ITeam } from "../interfaces/services/teams/ITeams";

/**
 * Die Nachrichten der Matchups: Ankündigung, Erinnerung und Ergebnis. Wie sie
 * aussehen, steht im Dashboard - hier stehen nur die Werte der Platzhalter.
 */

/** Ein Zeitpunkt, den Discord in der Zeitzone des Lesers anzeigt. */
function When(at: number, style: "F" | "f" | "R"): string {
    return `<t:${Math.floor(at / 1000)}:${style}>`;
}

const OUTCOME_TEXT: Record<Outcome, string> = { w: "✅ Sieg", l: "❌ Niederlage", d: "🤝 Unentschieden" };

const OUTCOME_ACCENT: Record<Outcome, string> = { w: OUTCOME_COLORS.win, l: OUTCOME_COLORS.loss, d: OUTCOME_COLORS.draw };

/** Was die Werte über die Partie hinaus brauchen: die Bilanz des Teams und die Adresse seines Logos. */
export interface IMatchupExtra {
    record: IMatchupRecord | null;
    logoUrl: string | null;
}

export function MatchupValues(guild: Guild, matchup: IMatchup, team: ITeam | null, extra: IMatchupExtra = { record: null, logoUrl: null }): AnyPlaceholderValues {
    const stream = matchup.stream ?? "";
    const score = matchup.score;
    const icon = guild.iconURL({ size: 256 }) ?? "";

    return {
        guild: guild.name,
        "guild.icon": icon,
        "team.logo": extra.logoUrl ?? icon,
        team: matchup.teamName,
        "team.tag": team?.tag ?? "",
        "team.role": team?.roleId ? `<@&${team.roleId}>` : "",
        gegner: matchup.opponent,
        liga: matchup.league || "Freundschaftsspiel",
        modus: MODE_LABELS[matchup.mode] ?? matchup.mode,
        // Der Punkt gehört zum Wert: ohne Best-of soll keine leere Stelle stehen.
        bestof: matchup.bestOf ? ` · Bo${matchup.bestOf}` : "",
        zeit: When(matchup.at, "F"),
        "zeit.kurz": When(matchup.at, "f"),
        countdown: When(matchup.at, "R"),
        stream: stream ? `📺 [Stream ansehen](${stream})` : "",
        "stream.link": stream,
        notiz: matchup.note,
        eingetragen: matchup.createdName,
        ergebnis: score ? `${score.us}:${score.them}` : "",
        ausgang: score ? OUTCOME_TEXT[OutcomeOf(score)] : "",
        bilanz: extra.record ? RecordText(extra.record) : "",
        serie: extra.record ? StreakText(extra.record) : "",
        form: extra.record ? FormText(extra.record) : "",
    };
}

/** Die Zeile oben in der Ankündigung: Ergebnis, Absage oder „läuft“ - höchstens LIVE_HOURS lang. */
export function MatchupHead(matchup: IMatchup, settings: IMatchupSettings, now: number): string | null {
    if (matchup.status === "cancelled") return "❌ Abgesagt";
    if (matchup.status === "played" && matchup.score) return `${OUTCOME_TEXT[OutcomeOf(matchup.score)]} ${matchup.score.us} : ${matchup.score.them}`;
    if (settings.results && matchup.status === "planned" && matchup.at <= now && now - matchup.at < LIVE_HOURS * 3_600_000) return "🔴 Läuft gerade";

    return null;
}

/** Die Farbe nach Stand, null: die aus dem Editor. */
export function MatchupAccent(matchup: IMatchup, settings: IMatchupSettings): string | null {
    if (!settings.colorByStatus) return null;
    if (matchup.status === "cancelled") return OUTCOME_COLORS.cancel;
    if (matchup.status === "played" && matchup.score) return OUTCOME_ACCENT[OutcomeOf(matchup.score)];

    return MATCHUPS_ACCENT;
}

function link(label: string, url: string): ButtonBuilder {
    return new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(label).setURL(url);
}

/** „Ergebnis eintragen“ bzw. „Ergebnis ändern“ - unter der Ankündigung und im Verwalten. */
export function ReportButton(id: number, done: boolean): ButtonBuilder {
    return new ButtonBuilder()
        .setCustomId(`${MATCHUPS_PREFIX}:report:${id}`)
        .setStyle(done ? ButtonStyle.Secondary : ButtonStyle.Success)
        .setLabel(done ? "Ergebnis ändern" : "Ergebnis eintragen");
}

/** Link-Knöpfe in einer Reihe - ohne Knöpfe keine Reihe. */
export function LinkRows(...links: [string, string | null][]): ActionRowBuilder<ButtonBuilder>[] {
    const buttons = links.filter(([, url]) => url).map(([label, url]) => link(label, url!));

    return buttons.length ? [new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)] : [];
}

/** Die Knöpfe unter der Ankündigung je Stand. Abgesagt: keine. */
export function MatchupRows(matchup: IMatchup, settings: IMatchupSettings, state: MatchupStateName, links: { page: string | null }): ActionRowBuilder<ButtonBuilder>[] {
    if (state === "cancel") return [];

    const buttons: ButtonBuilder[] = [];

    if (settings.results && settings.discordResults && state !== "soon") buttons.push(ReportButton(matchup.id, state === "done"));

    // Nach dem Ergebnis gibt es nichts mehr zu verschieben oder abzusagen.
    if (state !== "done") buttons.push(new ButtonBuilder().setCustomId(`${MATCHUPS_PREFIX}:manage:${matchup.id}`).setStyle(ButtonStyle.Secondary).setLabel("⋯ Verwalten"));
    if (matchup.stream) buttons.push(link("📺 Stream", matchup.stream));
    if (links.page) buttons.push(link("Alle Matchups", links.page));

    // Eine leere Reihe lehnt Discord ab - und mit ihr die ganze Bearbeitung.
    return buttons.length ? [new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)] : [];
}

export interface IMatchupViewExtra {
    /** Zeile ganz oben, etwa „🔴 Läuft gerade“. */
    head?: string | null;
    rows?: ActionRowBuilder<ButtonBuilder>[];
    /** Ersetzt die Farbe der Vorlage (nur Karte). */
    accent?: string | null;
    /** Diese Rollen werden erwähnt - nur beim ersten Senden. */
    ping?: string[];
}

/**
 * Eine Nachricht aus dem Dashboard, fertig für den Kanal. Bei einer Karte stehen
 * Kopfzeile und Ping oben im Container und die Knöpfe darin: Text über einer
 * Karte lehnt Discord ab.
 */
export async function MatchupView(client: BotClient, source: IMatchupBody, values: AnyPlaceholderValues, extra: IMatchupViewExtra = {}): Promise<ICustomView> {
    // Ohne Team-Rolle fiele „{team.role} · “ zu „ · “ am Zeilenanfang zusammen - dann fällt das Stück ganz weg (W-0027).
    const body: IMatchupBody = values["team.role"] === "" ? JSON.parse(JSON.stringify(source).replace(/\{team\.role\}\s*·\s*/g, "")) : source;
    const ping = extra.ping ?? [];
    const rows = extra.rows ?? [];
    // Eine Reihe kostet sich selbst und jeden Knopf darin - so zählt Discord die 40 (W-0027).
    const reserve = rows.reduce((sum, row) => sum + 1 + row.components.length, 0);
    const top = [extra.head ? `**${extra.head}**` : "", ping.map((role) => `<@&${role}>`).join(" ")].filter(Boolean).join("\n");
    const allowedMentions = { parse: [], ...(ping.length ? { roles: ping } : {}) };

    if (body.kind === "v2") {
        const doc = {
            accent: extra.accent ?? body.doc.accent,
            blocks: [...(top ? [{ type: "text" as const, body: top }] : []), ...body.doc.blocks],
        };
        const view = await CustomMessageView(client, { id: 0, kind: "v2", content: "", embed: null, doc, buttons: [], reserve }, values);

        if (rows.length) (view.components[0] as ContainerBuilder).addActionRowComponents(rows);

        return { ...view, allowedMentions };
    }

    // „Farbe nach Stand“ gilt auch für ein Embed (W-0027).
    const embed = extra.accent && body.embed ? { ...body.embed, color: extra.accent } : body.embed;
    const view = await CustomMessageView(client, { id: 0, kind: body.kind, content: body.content, embed, doc: body.doc, buttons: [] }, values);
    const content = [top, view.content ?? ""].filter(Boolean).join("\n").slice(0, 2000);

    return { ...view, content: content || undefined, components: [...view.components, ...rows], allowedMentions };
}

/**
 * Die Nachfrage, wenn das Ergebnis fehlt (W-0027): „über den Knopf oben“ nur,
 * wenn es den Knopf an einer Ankündigung gibt, sonst die Seite oder das Dashboard.
 */
export function ResultAsk(button: boolean, page: string | null): string {
    if (button) return "Wie ist es ausgegangen? Tragt das Ergebnis über den Knopf oben ein.";
    if (page) return `Wie ist es ausgegangen? Tragt das Ergebnis hier ein: ${page}`;

    return "Wie ist es ausgegangen? Tragt das Ergebnis im Dashboard ein.";
}

/** Eine Zeile je Partie - für die Liste auf der öffentlichen Seite und im Log. */
export function MatchupLine(matchup: IMatchup): string {
    const score = matchup.score ? ` · **${matchup.score.us}:${matchup.score.them}**` : "";

    return `**${matchup.teamName}** vs. ${matchup.opponent} · ${When(matchup.at, "f")}${score}`;
}
