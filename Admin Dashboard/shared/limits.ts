/**
 * Grenzen und feste Werte, die Server und Oberfläche gleich kennen müssen. Der
 * Server prüft damit jede Eingabe, die Formulare zeigen damit, was geht. Wie
 * shared/api.ts nur wegstreichbare Syntax: Node führt die Datei direkt aus.
 */

/** Eine Discord-ID: 17 bis 20 Ziffern. */
export const SNOWFLAKE = /^\d{17,20}$/;

/** Locker wie im ContactService der Webseite: sieht es wie eine Adresse aus? */
export const MAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Wartung mit Zeitstrahl (Plan 23): Überschrift, Zusatz, Schritte, wie weit das Ende voraus liegen darf. */
export const MAINTENANCE_LIMITS = { title: 80, text: 200, steps: 8, step: 40, aheadDays: 7 } as const;

/** Listen kommen in Seiten zu so vielen Einträgen. */
export const PAGE_SIZE = 50;

/** Die Gruppen aus dashboard_groups (ENUM der Migration 002 im Bot). Developer kommen aus DEV_USER_IDs. */
export const GROUPS = ["administrator", "partner", "premium"] as const;
export type Group = (typeof GROUPS)[number];

export const GROUP_LABELS: Readonly<Record<Group, string>> = {
    administrator: "Administrator",
    partner: "Partner",
    premium: "Premium",
};

/**
 * Was eine Gruppe im Bot-Dashboard bewirkt. Wortgleich mit
 * src/dashboard/client/constants/Groups.ts im Bot: Ändert sich dort etwas,
 * gehört es hier mit geändert. Developer, Guardian, Free und Testphase stehen
 * nicht in dashboard_groups, sie ergeben sich (DashboardService.DisplayGroup im Bot).
 */
export const GROUP_GRANTS = {
    administrator: "Sieht jeden Server, auf dem RL Nexus läuft.",
    developer: "Sieht jeden Server, auf dem RL Nexus läuft, und darf Entwickler-Befehle ausführen.",
    partner: "Kennzeichnung für Partner-Organisationen.",
    premium: "Kennzeichnung für Premium-Zugang. Freigeschaltet ist daran heute noch nichts.",
    guardian: "Moderiert mindestens einen Server mit RL Nexus, ohne eigenes Abo. Dort stehen Live Tickets, Transcriptions und Moderation offen.",
    free: "RL Nexus ist gerade kostenlos. Sieht die Server, auf denen die Person Owner oder Admin ist, und kann alles nutzen.",
    testphase: "Der Testzeitraum läuft. Sieht die Server, auf denen die Person selbst Owner oder Admin ist.",
    beta: "Hat einen Beta-Code eingelöst und kommt im Beta-Modus ins Bot-Dashboard. Sieht die Server, auf denen die Person Owner oder Admin ist.",
} as const;

/** Länge der Notiz, Spalte note in dashboard_groups. */
export const NOTE_MAX = 190;

/** Was das Admin Dashboard verschickt. Das ENUM in notifications kennt dazu noch group und account. */
export const NOTIFICATION_KINDS = ["info", "success", "warn"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const NOTIFICATION_KIND_LABELS: Readonly<Record<NotificationKind, string>> = {
    info: "Info",
    success: "Erfolg",
    warn: "Warnung",
};

/** Die Spalten von notifications, dazu höchstens so viele IDs auf einmal. */
export const NOTIFICATION_LIMITS = { title: 120, body: 500, link: 190, ids: 50 } as const;

/** Die Themen des Kontaktformulars, wie ContactTopic auf der Webseite. */
export const CONTACT_TOPICS = ["frage", "bug", "modulwunsch", "partnerschaft", "datenschutz", "sonstiges"] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];

export const CONTACT_TOPIC_LABELS: Readonly<Record<ContactTopic, string>> = {
    frage: "Frage",
    bug: "Fehler melden",
    modulwunsch: "Modulwunsch",
    partnerschaft: "Partnerschaft",
    datenschutz: "Datenschutz",
    sonstiges: "Sonstiges",
};

/** Dieselben Grenzen wie im ContactService der Webseite, dazu die der Spalten. */
export const CONTACT_LIMITS = {
    name: { min: 2, max: 80 },
    email: 190,
    discord: 64,
    subject: { min: 4, max: 120 },
    message: { min: 20, max: 4000 },
    context: 1000,
    /** Bei „Fehler melden“ müssen so viele Zeichen Angaben zur Lage da sein. */
    bugContext: 10,
} as const;

/** So viele Einträge zeigt eine Seite der Log-Ansicht, nach dem Filtern gezählt. */
export const LOG_PAGE_ENTRIES = 400;

/** Die Filter einer Log-Ansicht: alle Stufen, Warnungen und Fehler, nur Fehler. */
export const LOG_LEVEL_FILTERS = ["alle", "warn", "error"] as const;
export type LogLevelFilter = (typeof LOG_LEVEL_FILTERS)[number];

export const LOG_LEVEL_LABELS: Readonly<Record<LogLevelFilter, string>> = {
    alle: "Alle",
    warn: "Warnungen und Fehler",
    error: "Nur Fehler",
};

/** Was die Liste der Sessions zeigen kann. */
export const LOG_SESSION_FILTERS = ["alle", "fehler", "absturz", "laeuft"] as const;
export type LogSessionFilter = (typeof LOG_SESSION_FILTERS)[number];

/** Die Suche über alle Sessions: Länge des Begriffs, höchstens so viele Treffer insgesamt. */
export const LOG_SEARCH = { min: 2, max: 100, hits: 300 } as const;

/** Wie die Aktionen im Protokoll heißen. Unbekannte stehen mit ihrem Schlüssel da. */
export const AUDIT_LABELS: Readonly<Record<string, string>> = {
    "auth.login": "Anmeldung",
    "group.grant": "Gruppe vergeben",
    "group.revoke": "Gruppe entzogen",
    "notification.send": "Meldung verschickt",
    "contact.status": "Kontakt: Status geändert",
    "contact.reply": "Kontakt beantwortet",
    "contact.delete": "Kontakt gelöscht",
    "content.save": "Inhalt gespeichert",
    "content.reset": "Inhalt zurückgesetzt",
    "maintenance.set": "Wartung geschaltet",
    "bot.restart": "Bot neu gestartet",
    "db.download": "Tabelle heruntergeladen",
    "status.create": "Statusmeldung angelegt",
    "status.update": "Statusmeldung ergänzt",
    "status.delete": "Statusmeldung gelöscht",
    "mail.send": "Mail verschickt",
    "mail.delete": "Mail gelöscht",
    "mail.account.add": "Postfach hinzugefügt",
    "mail.account.update": "Postfach geändert",
    "mail.account.remove": "Postfach entfernt",
    "backups.run": "Backup-Runde gestartet",
    "backups.catchup": "Backup nachgeholt",
    "backups.create": "Backup von Hand",
    "backups.delete": "Backup gelöscht",
    "backups.restore": "Backup zurückgeladen",
    "backups.panels": "Panels geprüft",
    "backups.plan": "Automatische Backups eingestellt",
    "shop.access": "Zugang zum Bot umgestellt",
    "beta.codes": "Beta-Codes erzeugt",
    "beta.revoke": "Beta-Code gesperrt",
    "beta.remove": "Beta-Zugang entzogen",
    "beta.redeem": "Beta-Code eingelöst",
};

/* --- Postfach --- */

/** Die Rollen der Ordner, in dieser Reihenfolge angezeigt. */
export const MAIL_FOLDER_ROLES = ["inbox", "sent", "drafts", "archive", "junk", "trash", "other"] as const;
export type MailFolderRole = (typeof MAIL_FOLDER_ROLES)[number];

/** Die Filter der Liste. "anhang" sucht nach multipart/mixed, eine eigene Suche nach Anhängen kennt IMAP nicht. */
export const MAIL_LIST_FILTERS = ["alle", "ungelesen", "anhang"] as const;
export type MailListFilter = (typeof MAIL_LIST_FILTERS)[number];

/** Wohin eine Mail verschoben werden kann. */
export const MAIL_MOVE_TARGETS = ["inbox", "archive", "junk", "trash"] as const;
export type MailMoveTarget = (typeof MAIL_MOVE_TARGETS)[number];

/** Grenzen beim Schreiben. */
export const MAIL_LIMITS = {
    subject: 200,
    recipients: 50,
    html: 200_000,
    files: 10,
    bytes: 20 * 1024 * 1024,
    label: 40,
    password: 200,
} as const;
