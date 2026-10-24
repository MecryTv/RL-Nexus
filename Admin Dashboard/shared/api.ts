/**
 * Die Formen, die zwischen Admin-Server und Oberfläche hin- und hergehen.
 *
 * Der Server liest diese Datei zur Laufzeit, die Oberfläche nur ihre Typen.
 * Deshalb steht hier nur Syntax, die Node beim Ausführen wegstreichen kann:
 * keine enum, keine Parameter-Properties.
 */

import type { BannerState } from "./content.ts";
import type { Group, LogLevelFilter, MailFolderRole, NotificationKind } from "./limits.ts";
import type { IMaintenanceState } from "./maintenance.ts";
import type { CheckState, ILatency, IncidentKind, StatusService } from "./status.ts";

/** Die Rolle im Admin Dashboard. Kommt bei jeder Anfrage frisch aus Discord. */
export type Role = "admin" | "developer";

/** Wer angemeldet ist: die Antwort von GET /api/me. */
export interface IMe {
    readonly id: string;
    readonly name: string;
    /** Volle Adresse des Avatars bei Discord, null ohne eigenes Bild. */
    readonly avatar: string | null;
    readonly role: Role;
}

/** Warum eine Anmeldung abgelehnt wurde. Steht als ?grund= in der Adresse. */
export type DenyReason = "mfa" | "server" | "rolle" | "abgebrochen" | "fehler";

/** Jede Fehlerantwort der API: ein ganzer Satz auf Deutsch. */
export interface IApiError {
    readonly error: string;
}

/** Ein Server des Bots, wie /dcapi/admin/overview ihn liefert. */
export interface IGuildRow {
    readonly id: string;
    readonly name: string;
    /** Volle Bildadresse bei Discord, null ohne Server-Icon. */
    readonly icon: string | null;
    readonly members: number;
    readonly joinedAt: string | null;
    readonly createdAt: string;
    readonly ownerId: string;
    readonly modules: readonly string[];
}

/** Die Antwort des Bots auf /dcapi/admin/overview. Geht so nie an die Oberfläche. */
export interface IBotOverview {
    readonly ready: boolean;
    readonly ping: number | null;
    readonly uptime: number;
    readonly startedAt: string;
    readonly memory: { readonly rss: number; readonly heapUsed: number };
    readonly versions: { readonly node: string; readonly discordjs: string; readonly app: string };
    readonly guilds: readonly IGuildRow[];
    /** Welche .env-Schlüssel gesetzt sind. Nur für die Technik-Ansicht der Developer. */
    readonly env: Readonly<Record<string, boolean>>;
}

/** Was die Übersicht vom Bot zeigt. */
export interface IBotSummary {
    readonly ready: boolean;
    readonly ping: number | null;
    readonly uptime: number;
    readonly startedAt: string;
    readonly guildCount: number;
    readonly memberCount: number;
    readonly memory: IBotOverview["memory"];
    readonly versions: IBotOverview["versions"];
}

/** Ein Dienst aus der letzten Statusprüfung. */
export interface IOverviewService {
    readonly id: StatusService;
    readonly state: CheckState;
    /** Prozent in 30 Tagen, null ohne Messung. */
    readonly uptimeMonth: number | null;
    readonly latency: ILatency;
}

/** Offene Störung oder Wartung, nur Titel und Zeit. */
export interface IOverviewIncident {
    readonly id: number;
    readonly kind: IncidentKind;
    readonly title: string;
    readonly startsAt: string | null;
}

export interface IOverviewStatus {
    readonly checkedAt: string;
    readonly uptimeMonth: number | null;
    readonly services: readonly IOverviewService[];
    readonly incidents: readonly IOverviewIncident[];
}

/** Ein Eintrag aus dem Protokoll, ohne Details. Die sieht nur, wer das Protokoll öffnen darf. */
export interface IRecentAction {
    readonly id: number;
    readonly userName: string;
    readonly action: string;
    readonly target: string | null;
    readonly createdAt: string;
}

/** GET /api/overview */
export interface IOverview {
    /** null: der Bot antwortet nicht. */
    readonly bot: IBotSummary | null;
    /** Die fünf Server mit den meisten Mitgliedern. */
    readonly topGuilds: readonly IGuildRow[];
    readonly website: IWebsiteSummary;
    readonly maintenance: IMaintenance;
    /** null: noch keine Prüfung seit dem Start. */
    readonly status: IOverviewStatus | null;
    /** Commands aus commands.json. null: noch nie vom Bot geholt. */
    readonly commands: { readonly count: number; readonly modules: number } | null;
    /** Die Discord-Statusmeldung: wie viele Kanäle, wann zuletzt geändert (null: seit dem Start noch nicht). */
    readonly statusPost: { readonly channels: number; readonly at: string | null };
    /** Die letzten fünf Einträge im Protokoll. Leer ohne Datenbank. */
    readonly recent: readonly IRecentAction[];
}

/** Ein eingeschalteter Wartungsmodus. Beides null, wenn die Datei da, aber unlesbar ist: an ist er trotzdem. */
/** null heißt: läuft nicht (aus, oder mit Haken über die Endzeit hinaus). Regel und Felder in shared/maintenance.ts. */
export interface IMaintenance {
    readonly website: IMaintenanceState | null;
    readonly dashboard: IMaintenanceState | null;
}

/** GET /api/bot/status: ohne Zwischenspeicher, für die Rückmeldung nach dem Neustart. */
export interface IBotStatus {
    readonly online: boolean;
    readonly startedAt: string | null;
}

export interface IAuditEntry {
    readonly id: number;
    readonly userId: string;
    readonly userName: string;
    readonly action: string;
    readonly target: string | null;
    readonly detail: string | null;
    readonly createdAt: string;
}

/** GET /api/audit */
export interface IAuditPage {
    readonly entries: readonly IAuditEntry[];
    readonly total: number;
    readonly page: number;
    readonly pageSize: number;
    /** Für die Filter: welche Aktionen und Personen im Protokoll vorkommen. */
    readonly actions: readonly string[];
    readonly users: readonly { readonly id: string; readonly name: string }[];
}

export type LogLevel = "error" | "warn" | "info" | "debug";

/** Ein Eintrag im Log: eine Zeile mit Zeitstempel, samt der Folgezeilen ohne (meist ein Stacktrace). */
export interface ILogEntry {
    /** Nummer der ersten Zeile in der Datei, ab 1. */
    readonly line: number;
    /** Wie im Log, etwa „9.10.2026“ und „08:56:32“. Ortszeit des Bots. */
    readonly date: string;
    readonly time: string;
    /** TASKS, HTTP, INFO, GUARDIAN ERROR … wie der Bot sie schreibt. */
    readonly category: string;
    readonly level: LogLevel;
    readonly text: string;
    /** Nur bei HTTP: zerlegt, damit der Status Farbe bekommen kann. */
    readonly http: { readonly method: string; readonly path: string; readonly status: number } | null;
    readonly more: readonly string[];
}

/** Der Kopf einer Session: Titel und Felder wie PID, Node, Git-Commit. */
export interface ILogHeader {
    readonly title: string | null;
    readonly fields: readonly { readonly label: string; readonly value: string }[];
}

export interface ILogPart {
    readonly index: number;
    readonly name: string;
    /** null: schon gelöscht (der Server löscht Logs 30 Tage nach dem letzten Eintrag). */
    readonly size: number | null;
}

/** Was in einer Session los war, über alle Teile gezählt. */
export interface ILogCounts {
    readonly errors: number;
    readonly warnings: number;
    readonly entries: number;
}

export interface ILogSession {
    readonly number: number;
    readonly startedAt: string;
    readonly endedAt: string | null;
    readonly crashed: boolean;
    readonly exitReason: string | null;
    /** Die neueste Session ohne Ende: der Bot läuft gerade damit. */
    readonly running: boolean;
    readonly parts: readonly ILogPart[];
    /** null: keine lesbare Datei mehr da. */
    readonly counts: ILogCounts | null;
}

/** GET /api/logs/sessions */
export interface ILogSessionPage {
    readonly sessions: readonly ILogSession[];
    /** Wie viele Sessions der Filter durchlässt. */
    readonly total: number;
    /** Wie viele es überhaupt gibt. */
    readonly all: number;
    readonly page: number;
    readonly pageSize: number;
}

/** Eine Kategorie mit ihrer Anzahl im ganzen Teil, für die Schalter in der Ansicht. */
export interface ILogCategory {
    readonly name: string;
    readonly count: number;
}

/** GET /api/logs/sessions/:n */
export interface ILogView {
    readonly session: ILogSession;
    readonly part: number;
    readonly header: ILogHeader | null;
    /** null: kein Endrahmen, die Session läuft noch oder ist abgestürzt. */
    readonly ended: { readonly reason: string; readonly duration: string } | null;
    /** Alle Kategorien im Teil, ungefiltert. */
    readonly categories: readonly ILogCategory[];
    readonly errors: number;
    readonly warnings: number;
    /** Einträge nach dem Filtern. */
    readonly total: number;
    /** Ab 1. */
    readonly page: number;
    readonly pages: number;
    readonly pageSize: number;
    readonly entries: readonly ILogEntry[];
    /** Wo nach dem Filtern Fehler und Warnungen stehen, als Stelle in der Liste. Für „zum nächsten Fehler“. */
    readonly marks: readonly { readonly index: number; readonly level: "error" | "warn" }[];
    /** Nur mit ?zeile: Stelle des Eintrags, der die Zeile enthält. index null heißt: vom Filter ausgeblendet. */
    readonly target: { readonly line: number; readonly index: number | null } | null;
}

/** GET /api/logs/sessions/:n/neu?nach=: was seit einer Zeile dazukam. Für das Mitlesen. */
export interface ILogFeed {
    readonly entries: readonly ILogEntry[];
    /** Die letzte Zeile, die jetzt in der Datei steht. Beim nächsten Abruf als nach= mitschicken. */
    readonly last: number;
    readonly running: boolean;
    /** Ein neuer Teil hat begonnen: Die Ansicht soll auf ihn wechseln. */
    readonly partChanged: boolean;
}

/** GET /api/logs/search */
export interface ILogSearch {
    readonly query: string;
    readonly level: LogLevelFilter;
    readonly hidden: readonly string[];
    /** Gefundene Treffer, höchstens LOG_SEARCH.hits. */
    readonly total: number;
    /** Es gäbe mehr, als die Antwort zeigt. */
    readonly limited: boolean;
    /** Wie viele Sessions durchsucht wurden. */
    readonly scanned: number;
    readonly sessions: readonly {
        readonly session: ILogSession;
        readonly hits: readonly { readonly part: number; readonly entry: ILogEntry }[];
    }[];
}

export interface IMigration {
    readonly name: string;
    readonly appliedAt: string;
}

/** GET /api/tech */
export interface ITech {
    /** null: der Bot antwortet nicht. */
    readonly bot: {
        readonly ready: boolean;
        readonly ping: number | null;
        readonly uptime: number;
        readonly startedAt: string;
        readonly memory: { readonly rss: number; readonly heapUsed: number };
        readonly versions: { readonly node: string; readonly discordjs: string; readonly app: string };
        readonly guildCount: number;
        readonly env: Readonly<Record<string, boolean>>;
    } | null;
    readonly database: {
        readonly online: boolean;
        readonly version: string | null;
        readonly migrations: { readonly bot: readonly IMigration[]; readonly admin: readonly IMigration[] };
        /** rows ist bei InnoDB eine Schätzung. */
        readonly tables: readonly { readonly name: string; readonly rows: number | null; readonly bytes: number | null }[];
    };
    readonly admin: {
        readonly node: string;
        readonly uptime: number;
        readonly memory: { readonly rss: number; readonly heapUsed: number };
        /** Mit --dev gestartet: Anmeldung und Rollenabfrage laufen über die Dev-Application. */
        readonly developerMode: boolean;
        /** Die Application, mit der angemeldet wird. Kein Geheimnis, steht in jeder Login-Adresse. */
        readonly clientId: string;
        /** Welcher Weg bei einer neuen Kontaktnachricht eingerichtet ist. */
        readonly notify: { readonly mail: boolean; readonly discord: boolean };
    };
    readonly website: { readonly online: boolean; readonly builtAt: string | null };
}

/** Die Hauptseite in der Übersicht. */
export interface IWebsiteSummary {
    readonly online: boolean;
    /** Zeitpunkt des Builds aus version.json, null wenn unbekannt. */
    readonly builtAt: string | null;
    /** Was das Banner gerade zeigt. null: unbekannt, etwa weil die Webseite nicht antwortet. */
    readonly banner: BannerState | null;
}

/** GET /api/guilds */
export interface IGuildList {
    readonly guilds: readonly IGuildRow[];
}

/** Eine Person mit dem, was Discord über sie weiß. name ist null, wenn die Abfrage nicht ging. */
export interface IUserRef {
    readonly id: string;
    readonly name: string | null;
    readonly avatar: string | null;
}

export interface IGroupEntry {
    readonly user: IUserRef;
    readonly group: Group;
    readonly note: string | null;
    /** null: direkt in der Datenbank vergeben, ohne Admin Dashboard. */
    readonly grantedBy: IUserRef | null;
    readonly grantedAt: string;
}

/** Eine Änderung an den Gruppen, aus dem Protokoll. */
export interface IGroupEvent {
    readonly id: number;
    readonly kind: "grant" | "revoke";
    /** Wer geändert hat, Name zum Zeitpunkt der Änderung. */
    readonly by: string;
    readonly user: IUserRef;
    /** Bei grant „partner“ oder „partner: Notiz“, so wie im Protokoll. */
    readonly detail: string | null;
    readonly createdAt: string;
}

/** GET /api/groups */
export interface IGroupList {
    readonly entries: readonly IGroupEntry[];
    /** Developer aus DEV_USER_IDs. Stehen nicht in der Tabelle und lassen sich hier nicht ändern. */
    readonly developers: readonly IUserRef[];
    /** Die letzten Änderungen, neueste zuerst. Leer, wenn das Protokoll nicht lesbar ist. */
    readonly history: readonly IGroupEvent[];
}

/** POST /api/notifications */
export interface INotificationInput {
    readonly recipients: { readonly ids: readonly string[] } | { readonly group: Group };
    readonly kind: NotificationKind;
    readonly title: string;
    readonly body: string;
    readonly link?: string;
}

/** Eine verschickte Meldung, wie sie im Protokoll steht. */
export interface ISentNotification {
    readonly by: string;
    readonly to: string;
    readonly title: string;
    readonly kind: NotificationKind | null;
    readonly count: number | null;
    readonly sentAt: string;
}

/** GET /api/notifications/recent */
export interface ISentList {
    readonly sent: readonly ISentNotification[];
}

/* --- Postfach (Mailcow über IMAP und SMTP) ------------------------------- */

export interface IMailServerInfo {
    readonly host: string;
    readonly port: number;
}

/** Ein Postfach, ohne Passwort: das bleibt auf dem Server. */
export interface IMailAccount {
    readonly id: number;
    readonly address: string;
    /** Steht im Kopf der Vorlage, etwa „Support“. */
    readonly label: string;
    readonly position: number;
    readonly imap: IMailServerInfo;
    readonly smtp: IMailServerInfo;
}

/** GET /api/mail/accounts */
export interface IMailAccountList {
    readonly accounts: readonly IMailAccount[];
    /** Vorschläge fürs Formular. Ein Host null heißt: mail.<Domain der Adresse>. */
    readonly defaults: {
        readonly imap: { readonly host: string | null; readonly port: number };
        readonly smtp: { readonly host: string | null; readonly port: number };
    };
}

export interface IMailFolder {
    /** Der Pfad bei IMAP, etwa `INBOX` oder `Sent`. */
    readonly path: string;
    /** Für Menschen: „Posteingang“ statt `INBOX`. */
    readonly name: string;
    readonly role: MailFolderRole;
    readonly unread: number;
    readonly total: number;
}

export interface IMailBox extends IMailAccount {
    /** null, wenn die Verbindung gerade nicht steht. Der Grund steht dann in `error`. */
    readonly folders: readonly IMailFolder[] | null;
    readonly error: string | null;
}

/** GET /api/mail */
export interface IMailOverview {
    readonly boxes: readonly IMailBox[];
}

export interface IMailAddress {
    readonly name: string;
    readonly address: string;
}

export interface IMailSummary {
    readonly uid: number;
    readonly from: IMailAddress | null;
    readonly to: readonly IMailAddress[];
    readonly subject: string;
    readonly date: string;
    /** Der Anfang des Textes, ohne HTML, höchstens 140 Zeichen. */
    readonly preview: string;
    readonly seen: boolean;
    readonly flagged: boolean;
    readonly answered: boolean;
    readonly attachments: boolean;
}

/** Eine Zeile in „Alle Posteingänge“: dazu, aus welchem Postfach sie stammt. */
export interface IMailAllSummary extends IMailSummary {
    readonly account: number;
}

/** GET /api/mail/all */
export interface IMailAllPage {
    readonly messages: readonly IMailAllSummary[];
    readonly total: number;
    readonly page: number;
    readonly pageSize: number;
    /** Postfächer, die gerade nicht antworten. Ihre Mails fehlen in der Liste. */
    readonly errors: readonly { readonly account: number; readonly message: string }[];
}

/** GET /api/mail/:account/messages */
export interface IMailPage {
    readonly folder: string;
    readonly messages: readonly IMailSummary[];
    readonly total: number;
    readonly page: number;
    readonly pageSize: number;
}

export interface IMailAttachment {
    /** Stelle in der Mail, zum Herunterladen. */
    readonly index: number;
    readonly filename: string;
    readonly contentType: string;
    readonly size: number;
}

/** GET /api/mail/:account/message */
export interface IMailMessage {
    readonly uid: number;
    readonly folder: string;
    readonly from: IMailAddress | null;
    readonly to: readonly IMailAddress[];
    readonly cc: readonly IMailAddress[];
    readonly replyTo: readonly IMailAddress[];
    readonly subject: string;
    readonly date: string;
    readonly messageId: string | null;
    readonly references: readonly string[];
    /** Bereinigt auf dem Server, für ein iframe mit sandbox. Nur-Text-Mails kommen als HTML mit erkannten Links. */
    readonly html: string;
    /** Der Text, zum Zitieren beim Antworten. */
    readonly text: string;
    /** Wie viele externe Bilder blockiert sind. 0 heißt: nichts zu laden. */
    readonly blockedImages: number;
    readonly attachments: readonly IMailAttachment[];
    readonly flagged: boolean;
}

/* --- Datenbank ansehen (nur Developer) ---------------------------------- */

/** Eine Tabelle in der Übersicht. rows ist bei InnoDB eine Schätzung. */
export interface IDbTable {
    readonly name: string;
    readonly rows: number | null;
    readonly bytes: number | null;
    readonly comment: string;
}

export interface IDbColumn {
    readonly name: string;
    /** Wie MariaDB ihn nennt, etwa `varchar(190)` oder `bigint(20) unsigned`. */
    readonly type: string;
    readonly nullable: boolean;
    /** `PRI`, `UNI`, `MUL` oder leer. */
    readonly key: string;
    readonly comment: string;
    /**
     * Der Inhalt wird nicht ausgeliefert: Der Spaltenname sieht nach einem
     * Geheimnis aus (Token, Secret, Passwort). Steht in der Zeile als `null`.
     */
    readonly masked: boolean;
}

/** GET /api/db/:table. Jeder Wert als Text, damit Zahlen, Daten und Binäres denselben Weg nehmen. */
export interface IDbRows {
    readonly table: string;
    readonly columns: readonly IDbColumn[];
    readonly rows: readonly Readonly<Record<string, string | null>>[];
    readonly total: number;
    readonly page: number;
    readonly pages: number;
    readonly pageSize: number;
    readonly sort: string | null;
    readonly dir: "asc" | "desc";
    readonly search: string;
}

/* --- Commands vom Bot ------------------------------------------------------ */

/** Ein Command, wie der Bot ihn unter /dcapi/admin/commands meldet. */
export interface IBotCommand {
    readonly name: string;
    readonly description: string;
    /** Das Modul auf der Webseite. null bei Dev-Commands. */
    readonly module: string | null;
    readonly paths: readonly { readonly path: string; readonly description: string }[];
}
