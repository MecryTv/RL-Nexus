import { Fragment, useState, type JSX } from "react";
import type { IGuildRow } from "../../shared/api";
import { formatDate, formatMonth, formatNumber } from "../format";
import { Badge } from "./Badge";
import { CopyText } from "./CopyText";
import { Icon } from "./Icon";
import styles from "./GuildTable.module.scss";

export interface IGuildTableProps {
    readonly guilds: readonly IGuildRow[];
    /** Was dasteht, wenn die Liste leer ist. */
    readonly empty: string;
    /** Zeilen lassen sich aufklappen: IDs, Erstelldatum, Module. */
    readonly expandable?: boolean;
}

function GuildIcon({ guild }: { readonly guild: IGuildRow }): JSX.Element {
    if (guild.icon) return <img src={guild.icon} alt="" width={28} height={28} className={styles.icon} loading="lazy" />;

    return (
        <span className={styles.icon} aria-hidden="true">
            {guild.name.slice(0, 1).toUpperCase()}
        </span>
    );
}

/** Server des Bots als Tabelle. Ist sie zu breit, scrollt sie in ihrem eigenen Rahmen, nicht die Seite. */
export function GuildTable({ guilds, empty, expandable = false }: IGuildTableProps): JSX.Element {
    const [open, setOpen] = useState<string | null>(null);

    if (guilds.length === 0) return <p className={styles.empty}>{empty}</p>;

    return (
        <div className={styles.frame}>
            <table className={styles.table}>
                <thead>
                    <tr>
                        <th scope="col">Server</th>
                        <th scope="col" className={styles.num}>
                            Mitglieder
                        </th>
                        <th scope="col">Dabei seit</th>
                        <th scope="col" className={styles.num}>
                            Module
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {guilds.map((guild) => {
                        const isOpen = open === guild.id;
                        const detailId = `server-${guild.id}`;

                        return (
                            <Fragment key={guild.id}>
                                <tr className={isOpen ? styles.openRow : undefined}>
                                    <td>
                                        <span className={styles.name}>
                                            <GuildIcon guild={guild} />
                                            {expandable ? (
                                                <button
                                                    type="button"
                                                    className={styles.toggle}
                                                    aria-expanded={isOpen}
                                                    aria-controls={detailId}
                                                    onClick={() => setOpen(isOpen ? null : guild.id)}
                                                >
                                                    <span>{guild.name}</span>
                                                    <Icon name="chevron-down" size={16} className={styles.chevron} />
                                                </button>
                                            ) : (
                                                <span>{guild.name}</span>
                                            )}
                                        </span>
                                    </td>
                                    <td className={styles.num}>{formatNumber(guild.members)}</td>
                                    <td>{formatMonth(guild.joinedAt)}</td>
                                    <td className={styles.num}>{guild.modules.length}</td>
                                </tr>
                                {expandable && (
                                    <tr id={detailId} className={styles.detail} hidden={!isOpen}>
                                        <td colSpan={4}>
                                            <dl className={styles.facts}>
                                                <div>
                                                    <dt>Server-ID</dt>
                                                    <dd>
                                                        <CopyText value={guild.id} />
                                                    </dd>
                                                </div>
                                                <div>
                                                    <dt>Owner-ID</dt>
                                                    <dd>
                                                        <CopyText value={guild.ownerId} />
                                                    </dd>
                                                </div>
                                                <div>
                                                    <dt>Erstellt</dt>
                                                    <dd>{formatDate(guild.createdAt)}</dd>
                                                </div>
                                                <div className={styles.wide}>
                                                    <dt>Module</dt>
                                                    <dd>
                                                        {guild.modules.length > 0 ? (
                                                            <ul className={styles.modules}>
                                                                {guild.modules.map((module) => (
                                                                    <li key={module}>
                                                                        <Badge>{module}</Badge>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        ) : (
                                                            "Keine eingeschaltet"
                                                        )}
                                                    </dd>
                                                </div>
                                            </dl>
                                        </td>
                                    </tr>
                                )}
                            </Fragment>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
