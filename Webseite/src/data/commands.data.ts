/**
 * Was die Slash-Commands tun und was sie erwarten.
 *
 * Welche Commands es gibt, steht am Modul (`modules.data.ts`, Feld
 * `commands`). Hier steht, was Discord beim Eintippen dazu anzeigt: der Satz
 * dahinter und die Angaben, freiwillige in eckigen Klammern. Die Texte stammen
 * aus den Commands im Bot-Projekt (`src/commands/`), nur die Gedankenstriche
 * sind nach dem Leitfaden dieser Seite umgestellt.
 *
 * Eigene Datei, damit die Startseite sie nicht mitlädt: sie braucht von den
 * Commands nur die Anzahl.
 */

/** Ein Command im Detail. */
export interface ICommandDetail {
    /** Der Satz, den Discord beim Eintippen zeigt. */
    readonly description: string;
    /** Die Angaben hinter dem Command, freiwillige in eckigen Klammern. */
    readonly usage?: string;
}

/** Wer die Commands eines Moduls benutzen darf. */
export interface ICommandAccess {
    readonly label: string;
    readonly hint: string;
    /** Sortierung: wer weniger Rechte braucht, steht vorn. */
    readonly rank: number;
}

const EVERYONE: ICommandAccess = { label: "Jeder", hint: "Alle Mitglieder des Servers.", rank: 0 };
const MODERATORS: ICommandAccess = {
    label: "Moderatoren",
    hint: "Wer auf der Moderatoren-Liste des Servers steht oder das passende Discord-Recht hat, etwa „Mitglieder bannen“.",
    rank: 1,
};
const MANAGE: ICommandAccess = {
    label: "Server verwalten",
    hint: "Wer in Discord das Recht „Server verwalten“ hat.",
    rank: 2,
};
const ADMIN: ICommandAccess = { label: "Administrator", hint: "Nur mit dem Discord-Recht „Administrator“.", rank: 3 };

/**
 * Die Rechte je Modul.
 *
 * Je Modul und nicht je Command, weil im Bot alle Commands eines Moduls
 * dasselbe verlangen. Fehlt ein Modul hier, zeigt die Seite keine Angabe statt
 * einer falschen.
 */
export const COMMAND_ACCESS: Readonly<Record<string, ICommandAccess>> = {
    "rl-tracking": EVERYONE,
    "rank-roles": EVERYONE,
    lft: EVERYONE,
    levels: EVERYONE,
    moderation: MODERATORS,
    tickets: MANAGE,
    giveaways: MANAGE,
    polls: MANAGE,
    dashboard: MANAGE,
    backups: MANAGE,
    gallery: ADMIN,
};

export const COMMAND_DETAILS: Readonly<Record<string, ICommandDetail>> = {
    /* --- RL Tracking ----------------------------------------------------- */
    "rank me": { description: "Zeigt deine eigenen Ränge und setzt mit Rank Roles deine Rang-Rollen" },
    "rank search": { description: "Zeigt die Ränge zu einem Epic-Namen", usage: "epicname" },
    "rank link": { description: "Verbindet dein Epic-Konto mit deinem Discord-Konto", usage: "epicname" },
    "rank unlink": { description: "Trennt dein Epic-Konto wieder, frühestens drei Tage nach dem Verbinden" },

    /* --- Rank Roles ------------------------------------------------------ */

    /* --- Looking for ----------------------------------------------------- */
    "lookingfor spieler": { description: "Du suchst ein Team" },
    "lookingfor team": { description: "Ihr seid ein Team und sucht Spieler" },
    "lookingfor beenden": { description: "Beendet deine Suche und schließt den Beitrag", usage: "[art]" },

    /* --- Moderation ------------------------------------------------------ */
    warn: { description: "Verwarnt einen User", usage: "user grund" },
    unwarn: { description: "Nimmt eine Verwarnung zurück", usage: "[user] [fall] [grund]" },
    timeout: { description: "Schaltet einen User stumm", usage: "user dauer [grund]" },
    untimeout: { description: "Hebt einen Timeout auf", usage: "user [grund]" },
    kick: { description: "Wirft einen User vom Server", usage: "user [grund]" },
    ban: { description: "Bannt einen User vom Server", usage: "user [grund] [dauer] [loeschen]" },
    unban: { description: "Hebt einen Bann auf", usage: "user [grund]" },
    purge: { description: "Löscht Nachrichten in diesem Kanal", usage: "anzahl [user] [grund]" },
    "fall zeigen": { description: "Zeigt einen Fall mit Notizen und Beweisen", usage: "nummer" },
    "fall notiz": { description: "Schreibt eine Notiz an einen Fall, die nur das Team sieht", usage: "nummer text" },
    "fall beweis": {
        description: "Hängt ein Bild oder einen Link als Beweis an einen Fall",
        usage: "nummer [bild] [link]",
    },
    verlauf: { description: "Zeigt die Moderations-Fälle eines Users", usage: "user" },

    /* --- Ticket System --------------------------------------------------- */
    "ticket setup": { description: "Öffnet den Einrichtungs-Assistenten" },
    "ticket panel": { description: "Schickt das Ticket-Panel in einen Kanal", usage: "[kanal]" },
    "ticket entsperren": { description: "Hebt die Ticket-Sperre eines Users auf", usage: "user" },

    /* --- Level System ---------------------------------------------------- */
    "level rang": { description: "Zeigt deinen Stand als Karte", usage: "[user]" },
    "level rangliste": { description: "Die Besten des Servers", usage: "[seite]" },

    /* --- Giveaways ------------------------------------------------------- */
    "giveaway start": {
        description: "Startet ein Giveaway",
        usage: "preis dauer [gewinner] [kanal] [beschreibung] [rolle] [ping]",
    },
    "giveaway beenden": { description: "Lost jetzt aus, statt zu warten", usage: "nummer" },
    "giveaway neu": { description: "Lost einen Gewinner neu aus", usage: "nummer [user]" },
    "giveaway abbrechen": { description: "Bricht ein Giveaway ohne Gewinner ab", usage: "nummer" },

    /* --- Umfragen -------------------------------------------------------- */
    "umfrage erstellen": {
        description: "Startet eine Umfrage",
        usage: "frage antworten [art] [dauer] [mehrfach] [anonym] [kanal]",
    },
    "umfrage beenden": { description: "Beendet eine laufende Umfrage", usage: "nummer" },

    /* --- Gallery System -------------------------------------------------- */
    gallery: { description: "Öffnet die Bild-Verwaltung: ansehen, hochladen, verschieben, löschen" },

    /* --- Backups -------------------------------------------------------- */
    "backup neu": { description: "Legt ein Backup an", usage: "[notiz] [was]" },
    "backup liste": { description: "Zeigt deine Backups, die letzten 14 Tage auf einen Blick" },
    "backup ansehen": { description: "Was drin ist: Kanäle, Rollen, Bereiche im Bot", usage: "backup" },
    "backup vergleichen": { description: "Was sich seitdem geändert hat, ohne etwas zu ändern", usage: "backup" },
    "backup laden": { description: "Reparieren oder genau wie im Backup, mit Rückfrage", usage: "backup [modus]" },
    "backup automatisch": { description: "Wann der Bot von selbst sichert, an oder aus" },

    /* --- Web-Dashboard --------------------------------------------------- */
    "module an": { description: "Schaltet ein Modul ein", usage: "modul" },
    "module aus": { description: "Schaltet ein Modul aus", usage: "modul" },
    "module liste": { description: "Zeigt alle Module mit ihrem Stand" },
};
