import { Guild } from "discord.js";
import BotClient from "../client/BotClient";
import { CustomMessageView, ICustomView } from "./CustomView";
import { AnyPlaceholderValues } from "../constants/Placeholders";
import { MODE_LABELS } from "../constants/Matchups";
import { IMatchup, IMatchupBody } from "../interfaces/services/matchups/IMatchups";
import { ITeam } from "../interfaces/services/teams/ITeams";

/**
 * Die Nachrichten der Matchups: Ankündigung, Erinnerung und Ergebnis. Wie sie
 * aussehen, steht im Dashboard - hier stehen nur die Werte der Platzhalter.
 */

/** Ein Zeitpunkt, den Discord in der Zeitzone des Lesers anzeigt. */
function When(at: number, style: "F" | "f" | "R"): string {
    return `<t:${Math.floor(at / 1000)}:${style}>`;
}

export function MatchupValues(guild: Guild, matchup: IMatchup, team: ITeam | null): AnyPlaceholderValues {
    const stream = matchup.stream ?? "";
    const score = matchup.score;
    const outcome = !score ? "" : score.us > score.them ? "✅ Sieg" : score.us < score.them ? "❌ Niederlage" : "🤝 Unentschieden";

    return {
        guild: guild.name,
        "guild.icon": guild.iconURL({ size: 256 }) ?? "",
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
        ausgang: outcome,
    };
}

/** Eine Nachricht aus dem Dashboard, fertig für den Kanal. */
export function MatchupView(client: BotClient, body: IMatchupBody, values: AnyPlaceholderValues): Promise<ICustomView> {
    return CustomMessageView(client, { id: 0, kind: body.kind, content: body.content, embed: body.embed, doc: body.doc, buttons: [] }, values);
}

/** Eine Zeile je Partie - für die Liste auf der öffentlichen Seite und im Log. */
export function MatchupLine(matchup: IMatchup): string {
    const score = matchup.score ? ` · **${matchup.score.us}:${matchup.score.them}**` : "";

    return `**${matchup.teamName}** vs. ${matchup.opponent} · ${When(matchup.at, "f")}${score}`;
}
