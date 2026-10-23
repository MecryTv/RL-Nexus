import type { JSX } from "react";
import styles from "./PageLoader.module.scss";

/**
 * Was zu sehen ist, während eine nachgeladene Seite ankommt.
 *
 * Ein Balken in der Markenfarbe statt eines Kreisels: er füllt keine leere
 * Fläche mit Bewegung, sondern hält nur die Stelle - bei einem Bündel dieser
 * Größe ist er in der Regel schon wieder weg, bevor man ihn gesehen hat.
 */
export function PageLoader(): JSX.Element {
    return (
        <div className={styles.loader} role="status" aria-live="polite">
            <span className={styles.bar} />
            <span className="u-sr">Seite wird geladen</span>
        </div>
    );
}
