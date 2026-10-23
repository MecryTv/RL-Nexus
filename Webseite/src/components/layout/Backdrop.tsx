import type { JSX } from "react";
import styles from "./Backdrop.module.scss";

/**
 * Der Hintergrund der ganzen Seite.
 *
 * Dieselben sechs Ebenen wie `drawBackground()` im Karten-Renderer des Bots:
 * Grundton, zwei weiche Lichter, schräge Bänder, Raster, Vignette. Nur die
 * Neonlinien in den Ecken fehlen - auf einer Karte umreißen sie den Rand, auf
 * einer Seite, die scrollt, gibt es keinen.
 *
 * Liegt fest hinter allem und nimmt keine Klicks an. Alles darin ist statisch
 * bis auf die beiden Lichter, die sehr langsam wandern - das kostet nichts,
 * weil `transform` allein auf der Grafikkarte läuft.
 */
export function Backdrop(): JSX.Element {
    return (
        <div className={styles.backdrop} aria-hidden="true">
            <div className={styles.warm} />
            <div className={styles.cool} />
            <div className={styles.bands} />
            <div className={styles.grid} />
            <div className={styles.vignette} />
        </div>
    );
}
