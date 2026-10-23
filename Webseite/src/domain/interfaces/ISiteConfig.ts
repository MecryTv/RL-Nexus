/** Ein Ziel außerhalb der Seite. */
export interface IExternalLink {
    readonly label: string;
    readonly href: string;
    /** Symbolname aus der Icon-Sammlung. */
    readonly icon: string;
}

/** Ein Punkt in der Navigation. */
export interface INavItem {
    readonly label: string;
    readonly to: string;
    /** Verweise nach außen bekommen ein Symbol und öffnen einen neuen Tab. */
    readonly external?: boolean;
}

/** Eine Zahl, die für sich steht - Hero und Footer zeigen solche. */
export interface IStat {
    readonly value: string;
    readonly label: string;
    readonly hint?: string;
}

/** Alles, was die Seite über sich selbst weiß. */
export interface ISiteConfig {
    readonly name: string;
    readonly claim: string;
    readonly description: string;
    readonly dashboardURL: string;
    readonly inviteURL: string;
    readonly supportURL: string;
    readonly contactMail: string;
    /** Das N-Logo in klein, dieselbe Datei wie das Favicon. */
    readonly markURL: string;
}
