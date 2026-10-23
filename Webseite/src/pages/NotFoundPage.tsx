import type { JSX } from "react";
import { usePageMeta } from "../hooks/usePageMeta";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import styles from "./NotFoundPage.module.scss";

/**
 * Die Seite, die es nicht gibt.
 *
 * Mit Weg zurück statt nur mit einer Zahl - wer hier landet, hat sich vertippt
 * oder einem alten Link gefolgt und sucht immer noch dasselbe wie vorher.
 */
export function NotFoundPage(): JSX.Element {
    usePageMeta("Seite nicht gefunden");

    return (
        <div className={["u-shell", styles.page].join(" ")}>
            <p className={styles.code} aria-hidden="true">
                404
            </p>
            <h1 className={styles.title}>Hier ist nichts</h1>
            <p className={styles.text}>
                Die Seite gibt es nicht, oder nicht mehr. Von der Modulübersicht aus kommst du überall hin.
            </p>
            <div className={styles.actions}>
                <Button to="/module" trailingIcon="arrow-right">
                    Zu den Modulen
                </Button>
                <Button to="/" variant="outline">
                    Zur Startseite
                </Button>
            </div>
            <p className={styles.hint}>
                <Icon name="discord" size={15} />
                Etwas kaputt? Sag im Support-Server Bescheid.
            </p>
        </div>
    );
}
