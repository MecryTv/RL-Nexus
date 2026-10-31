import type { INavItem } from "../domain/interfaces/ISiteConfig";

/** Free Access: RL Nexus ist kostenlos. Paid Access: nur mit Kauf oder Test. Beta Access: nur mit Beta-Code, ohne Kauf (Plan 22). Steht im Shop-Zustand des Admin-Servers. */
export type ShopMode = "free" | "paid" | "beta";

/** Gibt es gerade Preise? Bei Free und Beta nicht. Ohne Antwort vom Shop (null) wie bei Paid. */
export function sellsNow(mode: ShopMode | null | undefined): boolean {
    return mode !== "free" && mode !== "beta";
}

/** Führt /preise auf die Startseite? Bei Free und Beta ja, außer eine Bestellung kommt gerade von Stripe zurück (?bestellung=, W-0024). */
export function leavesPricing(mode: ShopMode | null | undefined, unlocking: boolean): boolean {
    return !sellsNow(mode) && !unlocking;
}

/** Die Hauptnavigation. Reihenfolge ist die im Kopf der Seite. */
const NAVIGATION: readonly INavItem[] = [
    { label: "Home", to: "/" },
    { label: "Module", to: "/module" },
    { label: "Preise", to: "/preise" },
    { label: "Team", to: "/team" },
    { label: "Kontakt", to: "/kontakt" },
];

/**
 * Bei Free und Beta Access ohne „Preise“. "loading": Der Shop hat noch nicht
 * geantwortet - dann auch ohne, sonst blitzte der Tab im Beta-Modus bei jedem
 * Aufruf kurz auf. Ohne Antwort vom Shop (null) wie bei Paid Access.
 */
export function navigationFor(mode: ShopMode | null | "loading"): readonly INavItem[] {
    return mode !== "loading" && sellsNow(mode) ? NAVIGATION : NAVIGATION.filter((item) => item.to !== "/preise");
}
