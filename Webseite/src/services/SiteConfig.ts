import type { IExternalLink, INavItem, ISiteConfig } from "../domain/interfaces/ISiteConfig";

/**
 * Adressen und Namen der Seite.
 *
 * Eine Stelle für alles, was sich beim Umzug auf die echte Domain ändert. Die
 * Dashboard-Adresse hängt an der Umgebung: im Entwicklungsmodus läuft der Bot
 * lokal, gebaut zeigt sie auf die öffentliche Subdomain. Wer das an jeder
 * Schaltfläche einzeln pflegen müsste, vergisst genau eine davon.
 */
class SiteConfigService implements ISiteConfig {
    public readonly name = "RL Nexus";
    public readonly claim = "Esports Management Bot";
    public readonly description =
        "Der Discord-Bot für deine Rocket-League-Organisation: Ränge, Teams, Bewerbungen, " +
        "Tickets und Logging, modular zuschaltbar, ohne dass du dafür fünf Bots brauchst.";

    public readonly supportURL = "https://discord.gg/CjG2HFGw95";
    public readonly contactMail = "support@nexus-emb.de";

    /**
     * Das N-Logo für Kopfzeile, Rang-Karte und Team-Seite.
     *
     * Dieselbe Datei wie das Favicon, 128 Pixel und 21 kB: die lädt der Browser
     * für den Tab ohnehin, also kostet sie hier nichts extra. Das 512er-Original
     * in `assets/brand` hat 78 kB und wird nirgends größer als 54 Pixel gezeigt.
     */
    public readonly markURL = "/favicon.png";

    /**
     * Das Dashboard - dort wird der Bot auch eingeladen.
     *
     * `import.meta.env.DEV` ist zur Bauzeit bekannt, der jeweils andere Zweig
     * fliegt also aus dem Bündel.
     */
    public readonly dashboardURL = import.meta.env.DEV
        ? "http://localhost:3000/dashboard"
        : "https://dashboard.nexus-emb.de";

    /** Der Bot wird über das Dashboard eingeladen, nicht über einen OAuth-Link. */
    public get inviteURL(): string {
        return this.dashboardURL;
    }

    /** Die Verweise nach außen - Fußzeile und mobiles Menü. */
    public get externals(): readonly IExternalLink[] {
        return [
            { label: "Dashboard", href: this.dashboardURL, icon: "dashboard" },
            { label: "Support-Server", href: this.supportURL, icon: "discord" },
        ];
    }

    /** Die rechtlichen Seiten, die eine deutsche Seite braucht. */
    public readonly legal: readonly INavItem[] = [
        { label: "Impressum", to: "/impressum" },
        { label: "Datenschutz", to: "/datenschutz" },
        { label: "AGB", to: "/agb" },
        { label: "Widerruf", to: "/widerruf" },
        // § 312k BGB: Der Weg zum Kündigen steht auf jeder Seite.
        { label: "Verträge hier kündigen", to: "/kuendigen" },
    ];
}

/** Eine Instanz für die ganze Anwendung - die Konfiguration ändert sich zur Laufzeit nicht. */
export const siteConfig = new SiteConfigService();
