import type { CSSProperties, JSX } from "react";
import type { RLTeam } from "../../domain/models/RLTeam";
import { ROSTER_ROLE_META } from "../../domain/enums/RosterRole";
import { RANK_META } from "../../domain/enums/RLRank";
import { rankBadge } from "../../services/RankAssets";
import { Panel } from "./Panel";
import { Icon } from "./Icon";
import styles from "./TeamRoster.module.scss";

export interface ITeamRosterProps {
    readonly team: RLTeam;
}

/**
 * Ein Kader als Karte.
 *
 * Zeigt, was das Team-Modul in Discord ausgibt: wer im Kader steht, mit welcher
 * Aufgabe und welchem Rang, und darüber der Schnitt aller, die spielen. Wie
 * viele das sind, steht daneben - der Staff steht im Kader, zählt aber nicht.
 */
export function TeamRoster({ team }: ITeamRosterProps): JSX.Element {
    return (
        <Panel
            as="article"
            className={styles.team}
            accent={team.accent}
            style={{ ["--accent" as string]: team.accent } as CSSProperties}
        >
            <header className={styles.head}>
                <div className={styles.identity}>
                    <span className={styles.tag}>{team.tag}</span>
                    <h3 className={styles.name}>{team.name}</h3>
                </div>
                <span className={styles.mode}>{team.mode}</span>
            </header>

            <dl className={styles.summary}>
                <div>
                    <dt>Ø MMR</dt>
                    <dd className={styles.big}>{team.averageMMR.toLocaleString("de-DE")}</dd>
                </div>
                <div>
                    <dt>Spielen mit</dt>
                    <dd>
                        <Icon name="users" size={14} />
                        {team.lineup.length} von {team.players.length}
                    </dd>
                </div>
            </dl>

            <ul className={styles.roster}>
                {team.players.map((player) => {
                    const meta = ROSTER_ROLE_META[player.role];
                    const rank = RANK_META[player.rank];

                    return (
                        <li key={player.name} className={styles.player}>
                            <span className={styles.role} style={{ color: meta.color }}>
                                {meta.label}
                            </span>
                            <span className={styles.playerName}>
                                <em>{team.tag}</em>
                                {player.name}
                            </span>
                            <span className={styles.rank} style={{ color: rank.color }}>
                                <img
                                    className={styles.rankBadge}
                                    src={rankBadge(player.rank)}
                                    alt=""
                                    width={22}
                                    height={22}
                                    loading="lazy"
                                />
                                {rank.label}
                            </span>
                            <span className={styles.mmr}>{player.mmr.toLocaleString("de-DE")}</span>
                        </li>
                    );
                })}
            </ul>
        </Panel>
    );
}
