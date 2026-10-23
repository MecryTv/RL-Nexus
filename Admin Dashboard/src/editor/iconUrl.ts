import type { IContentMeta } from "../../shared/content";

/**
 * Ein Symbol der Webseite als Bildadresse. Als <img> kann ein SVG keinen Code
 * ausführen, auch wenn es aus einer fremden Quelle käme. `currentColor` hätte
 * im Bild keine Farbe, deshalb wird sie hier eingesetzt.
 */
export function iconUrl(svg: string, color = "#f2f4f7"): string {
    return `data:image/svg+xml,${encodeURIComponent(svg.replaceAll("currentColor", color))}`;
}

/** Eine Farbe der Webseite (`var(--c-…)` oder eine Mischung daraus) mit den Werten der Webseite, für Vorschauen. */
export function colorValue(color: string, meta: IContentMeta): string {
    return color.replace(/var\((--c-[a-z0-9-]+)\)/g, (match, token: string) => meta.colors.find((entry) => entry.token === token)?.value ?? match);
}
