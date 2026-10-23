/**
 * Links nur als https-Adresse oder als Pfad mit / vorn. Alles andere, vor
 * allem javascript:, liefe als Code im href: im Admin Dashboard, auf der
 * Webseite und im Postfach des Bot-Dashboards, das den Link einer Meldung
 * direkt als href setzt.
 */
export function isSafeLink(href: string): boolean {
    if (href.startsWith("/")) return !href.startsWith("//") && !href.includes("\\");

    return URL.canParse(href) && new URL(href).protocol === "https:";
}
