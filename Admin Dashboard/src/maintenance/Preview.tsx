import type { JSX } from "react";
import type { IMaintenancePlan } from "../../shared/api";
import styles from "./maintenance.module.scss";

/**
 * Die echte Wartungsseite mit diesem Plan. Die Daten stehen im Fragment
 * (#vorschau=…): Ein neuer Stand ändert nur das Fragment, die Seite lädt nicht
 * neu. allow-scripts ohne allow-same-origin: Das Skript läuft, kommt aber an
 * nichts vom Admin Dashboard heran. null zeigt den Rückfall.
 */
export function Preview({ plan, label }: { readonly plan: IMaintenancePlan | null; readonly label: string }): JSX.Element {
    return (
        <section className={styles.previewArea} aria-label={label}>
            <p className={styles.previewLabel}>{label}</p>
            <iframe
                className={styles.previewFrame}
                src={`/wartung.html#vorschau=${encodeURIComponent(JSON.stringify(plan))}`}
                title="Vorschau der Wartungsseite"
                sandbox="allow-scripts"
                referrerPolicy="no-referrer"
            />
        </section>
    );
}
