import type { JSX } from "react";
import type { IUserRef } from "../../shared/api";
import styles from "./UserChip.module.scss";

/**
 * Avatar und Name einer Person, darunter die ID.
 *
 * Ohne Namen (Discord nicht erreichbar) steht nur die ID da. Mit `plain` bleibt
 * die ID weg: In einer Gruppenliste ist sie das, was zählt, neben einer
 * Antwort wäre sie nur Rauschen.
 */
export function UserChip({ user, plain = false }: { readonly user: IUserRef; readonly plain?: boolean }): JSX.Element {
    const size = plain ? 20 : 28;

    return (
        <span className={[styles.chip, plain && styles.plain].filter(Boolean).join(" ")}>
            {user.avatar ? (
                <img src={user.avatar} alt="" width={size} height={size} className={styles.avatar} />
            ) : (
                <span className={styles.avatar} aria-hidden="true">
                    {(user.name ?? "?").slice(0, 1).toUpperCase()}
                </span>
            )}
            <span className={styles.text}>
                <span className={styles.name}>{user.name ?? "Name unbekannt"}</span>
                {!plain && <span className={styles.detail}>{user.id}</span>}
            </span>
        </span>
    );
}
