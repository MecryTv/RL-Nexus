import type { JSX } from "react";
import { COMMAND_DETAILS } from "../../data/commands.data";
import { commandDescription } from "../../services/registry";
import styles from "./CommandList.module.scss";

export interface ICommandListProps {
    /** Ohne führenden Schrägstrich, so wie am Modul. */
    readonly commands: readonly string[];
}

/**
 * Commands samt Angaben und dem Satz, den Discord dazu zeigt.
 *
 * Die Angaben stehen hinter dem Command, so wie man sie tippt, freiwillige in
 * eckigen Klammern. Fehlt zu einem Command der Eintrag in den Daten, steht er
 * trotzdem da, nur ohne Satz dahinter.
 */
export function CommandList({ commands }: ICommandListProps): JSX.Element {
    return (
        <ul className={styles.list}>
            {commands.map((command) => {
                const detail = COMMAND_DETAILS[command];
                const description = commandDescription(command) ?? detail?.description;

                return (
                    <li key={command} className={styles.item}>
                        <code className={styles.usage}>
                            <span className={styles.slash}>/</span>
                            {command}
                            {detail?.usage !== undefined && <span className={styles.args}> {detail.usage}</span>}
                        </code>
                        {description !== undefined && <p className={styles.text}>{description}</p>}
                    </li>
                );
            })}
        </ul>
    );
}
