/** Ein Verweis auf ein Profil außerhalb der Seite. */
export interface IMemberLink {
    readonly label: string;
    readonly href: string;
    readonly icon: string;
}

/** Jemand, der an RL Nexus mitarbeitet. */
export interface IMember {
    readonly name: string;
    /** Der Discord-Name, so wie er im Support-Server steht. */
    readonly handle: string;
    /** Rolle im Projekt - "Gründer & Entwickler", "Design", "Support". */
    readonly role: string;
    /** Woran diese Person tatsächlich arbeitet. Zwei bis drei Sätze. */
    readonly text: string;
    /** Die Bereiche, für die sie zuständig ist. */
    readonly focus: readonly string[];
    /** Farbe der Karte - unterscheidet die Rollen auf einen Blick. */
    readonly accent: string;
    readonly links?: readonly IMemberLink[];
}
