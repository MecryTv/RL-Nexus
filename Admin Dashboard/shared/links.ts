/**
 * Links nur als https-Adresse oder als Pfad mit / vorn. Alles andere, vor
 * allem javascript:, liefe als Code im href: im Admin Dashboard, auf der
 * Webseite und im Postfach des Bot-Dashboards, das den Link einer Meldung
 * direkt als href setzt.
 */
export function isSafeLink(href: string): boolean {
    // Steuerzeichen streicht der Browser aus der Adresse: Aus "/\t/evil" würde "//evil" (wie safeReturn in server/access.ts).
    // oxlint-disable-next-line no-control-regex -- genau diese Zeichen sollen abgelehnt werden.
    if (/[\u0000-\u001f\u007f]/.test(href)) return false;
    if (href.startsWith("/")) return !href.startsWith("//") && !href.includes("\\");

    return URL.canParse(href) && new URL(href).protocol === "https:";
}
