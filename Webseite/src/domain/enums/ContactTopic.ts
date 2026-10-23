/** Worum es in einer Nachricht geht. Bestimmt, wo sie landet. */
export enum ContactTopic {
    Question = "frage",
    Bug = "bug",
    Feature = "modulwunsch",
    Partnership = "partnerschaft",
    Privacy = "datenschutz",
    Other = "sonstiges",
}

/** Label und Symbol je Thema - für die Auswahl im Formular. */
export const CONTACT_TOPIC_META: Readonly<
    Record<ContactTopic, { label: string; hint: string; icon: string; accent: string }>
> = {
    [ContactTopic.Question]: {
        label: "Frage",
        hint: "Zur Einrichtung, zu einem Modul oder dazu, ob etwas geht.",
        icon: "message-square",
        accent: "var(--c-mod-community)",
    },
    [ContactTopic.Bug]: {
        label: "Fehler melden",
        hint: "Etwas funktioniert nicht so, wie es soll.",
        icon: "shield-check",
        accent: "var(--c-red)",
    },
    [ContactTopic.Feature]: {
        label: "Modulwunsch",
        hint: "Dir fehlt etwas, das der Bot können sollte.",
        icon: "puzzle",
        accent: "var(--c-mod-engagement)",
    },
    [ContactTopic.Partnership]: {
        label: "Partnerschaft",
        hint: "Zusammenarbeit, Turniere, gemeinsame Aktionen.",
        icon: "users",
        accent: "var(--c-blue)",
    },
    [ContactTopic.Privacy]: {
        label: "Datenschutz",
        hint: "Auskunft, Löschung oder etwas, das rechtlich klingt.",
        icon: "lock",
        accent: "var(--c-mod-moderation)",
    },
    [ContactTopic.Other]: {
        label: "Sonstiges",
        hint: "Passt in keine der anderen Schubladen.",
        icon: "mail",
        accent: "var(--c-mod-utility)",
    },
};

/** Die Reihenfolge im Formular - das Häufigste zuerst. */
export const CONTACT_TOPIC_ORDER: readonly ContactTopic[] = [
    ContactTopic.Question,
    ContactTopic.Bug,
    ContactTopic.Feature,
    ContactTopic.Partnership,
    ContactTopic.Privacy,
    ContactTopic.Other,
];
