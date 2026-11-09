import { GROUP_LABELS } from "./limits.ts";

/**
 * Wo RL Nexus Daten zu einer Person hat (W-0051). Die einzige Stelle, die das
 * weiß: Liste, Profil, Auskunft und später die Löschung lesen nur hier.
 * check:db gleicht sie mit der Datenbank ab, damit keine neue Tabelle
 * durchrutscht. `time`, `label` und `name` sind SQL-Ausdrücke über die Spalten
 * der Tabelle - Code, nie Eingabe.
 */

export const USERDATA_AREA_IDS = ["konto", "spieler", "level", "tickets", "bewerbungen", "moderation", "community", "teams", "shop", "beta", "kontakt", "sicherheit", "nachrichten", "protokoll", "team"] as const;
export type UserdataArea = (typeof USERDATA_AREA_IDS)[number];

export interface IUserdataSource {
    readonly table: string;
    readonly column: string;
    /**
     * person: die Zeile gehört der Person. team: sie hat etwas für andere getan.
     * json: ihre ID steht als String in einer JSON-Spalte. list: in einer Liste mit Kommas.
     */
    readonly role: "person" | "team" | "json" | "list";
    readonly guild?: string;
    readonly time?: string;
    readonly label: string;
    /** Der dort gespeicherte Name der Person, wenn es einen gibt. */
    readonly name?: string;
    /** Spalten, die nie in die Auskunft kommen. */
    readonly hidden?: readonly string[];
    /** zlib-gepacktes JSON, in der Auskunft entpackt. */
    readonly packed?: readonly string[];
    /** In der Anzeige stehen Werte aus einer ENUM-Spalte: auf Deutsch übersetzen (`germanLabel`). */
    readonly words?: true;
}

export interface IUserdataAreaDef {
    readonly id: UserdataArea;
    readonly label: string;
    /** Was drin ist, für „Was bleibt“: wenige Wörter je Teil. */
    readonly inside: readonly string[];
    /** Name im Icon-Satz des Admin Dashboards. */
    readonly icon: string;
    readonly sources: readonly IUserdataSource[];
}

/** Millisekunden seit 1970 als Zeitpunkt. */
const ms = (column: string): string => `FROM_UNIXTIME(${column} / 1000)`;
/** Eine ASCII-Spalte in CONCAT mit deutschem Text: Ohne Umwandlung lehnt MariaDB die Mischung ab. */
const text = (column: string): string => `CONVERT(${column} USING utf8mb4)`;
/** Tage seit 1970 (UTC) als Zeitpunkt. */
const days = (column: string): string => `FROM_UNIXTIME(${column} * 86400)`;

const G = "guild_id";

export const USERDATA_AREAS: readonly IUserdataAreaDef[] = [
    {
        id: "konto",
        label: "Konto im Bot-Dashboard",
        inside: ["Anmeldung", "Benachrichtigungen", "Ticket-IDs", "Voice-Vorlagen", "Gruppen", "Eingeladene Server"],
        icon: "dashboard",
        sources: [
            { table: "dashboard_credentials", column: "user_id", role: "person", time: "created_at", label: "'Anmeldung im Bot-Dashboard'", name: "username", hidden: ["password", "totp_secret"] },
            { table: "notifications", column: "user_id", role: "person", time: "created_at", label: "title" },
            { table: "user_codes", column: "user_id", role: "person", time: "created_at", label: "CONCAT('Feste Ticket-ID ', code)" },
            { table: "voice_presets", column: "user_id", role: "person", time: ms("created_at"), label: "CONCAT('Voice-Vorlage ', name)" },
            { table: "dashboard_groups", column: "user_id", role: "person", time: "granted_at", label: "CONCAT('Gruppe ', group_name)", words: true },
            // W-0064: ein Server pro Person.
            { table: "server_invites", column: "user_id", role: "person", guild: G, time: "invited_at", label: "CONCAT('Bot eingeladen auf ', guild_name)" },
            { table: "server_invites", column: "owner_id", role: "person", guild: G, time: "invited_at", label: "CONCAT('Owner von ', guild_name)" },
            { table: "server_requests", column: "user_id", role: "person", guild: G, time: "created_at", label: "CONCAT('Server-Anfrage · ', guild_name, ' · ', status)", words: true },
            { table: "server_choices", column: "user_id", role: "person", time: "created_at", label: "CONCAT('Wahl ein Server pro Person · ', state)", words: true },
            { table: "invite_passes", column: "user_id", role: "person", guild: G, time: ms("created_at"), label: "'Freigabe zum Einladen des Bots'" },
            // W-0057: Anmeldespuren (nur Hashes), nach 90 Tagen weg. Bei einer Sperre bleiben die Hashes in security_ban_hashes.
            { table: "security_logins", column: "user_id", role: "person", time: "created_at", label: "CONCAT('Anmeldung · ', service, ' · ', result)", words: true },
        ],
    },
    {
        id: "spieler",
        label: "Rocket-League-Konten",
        inside: ["Verknüpfte Konten", "Ränge", "Spielerprofil", "Epic-Namen"],
        icon: "link",
        sources: [
            { table: "player_accounts", column: "user_id", role: "person", time: "linked_at", label: "CONCAT(platform, ' · ', COALESCE(display_name, account_id))" },
            { table: "player_profiles", column: "user_id", role: "person", time: "updated_at", label: "'Spielerprofil'" },
            { table: "player_ranks", column: "user_id", role: "person", time: "updated_at", label: "CONCAT(playlist, ' · ', COALESCE(tier, '–'))" },
            { table: "user_connections", column: "user_id", role: "person", time: ms("updated_at"), label: "CONCAT(platform, ' · ', COALESCE(name, account_id))" },
            { table: "epic_name_cases", column: "user_id", role: "person", time: ms("detected_at"), label: "CONCAT('Epic-Name geändert: ', old_name)" },
        ],
    },
    {
        id: "level",
        label: "Level und Aktivität",
        inside: ["Level", "XP je Tag", "Nachrichten je Tag", "Bestenliste"],
        icon: "trophy",
        sources: [
            { table: "levels", column: "user_id", role: "person", guild: G, time: ms("updated_at"), label: "CONCAT('Level ', level, ' · ', xp, ' XP')" },
            { table: "level_days", column: "user_id", role: "person", guild: G, time: days("day"), label: "CONCAT(xp, ' XP an einem Tag')" },
            { table: "member_activity", column: "user_id", role: "person", guild: G, time: days("day"), label: "CONCAT(messages, ' Nachrichten an einem Tag')" },
            { table: "level_log", column: "user_id", role: "person", guild: G, time: ms("created_at"), label: "CONCAT('XP ', mode, ' ', amount)", words: true },
            { table: "level_top", column: "holders", role: "list", guild: G, time: ms("posted_at"), label: "'In der Bestenliste'" },
        ],
    },
    {
        id: "tickets",
        label: "Tickets",
        inside: ["Tickets", "Verläufe", "Sperren", "Wartezeit im Support"],
        icon: "inbox",
        sources: [
            { table: "tickets", column: "opener_id", role: "person", guild: G, time: "created_at", label: "CONCAT('Ticket ', number, ' · ', status)", words: true },
            { table: "tickets", column: "members", role: "json", guild: G, time: "created_at", label: "CONCAT('Im Ticket ', number)" },
            { table: "ticket_transcripts", column: "opener_id", role: "person", guild: G, time: "created_at", label: "CONCAT('Verlauf von Ticket ', number)", name: "opener_name", packed: ["data"] },
            { table: "ticket_blacklist", column: "user_id", role: "person", guild: G, time: "created_at", label: "'Für Tickets gesperrt'" },
            { table: "support_waits", column: "user_id", role: "person", guild: G, label: "'Wartet im Support'" },
        ],
    },
    {
        id: "bewerbungen",
        label: "Bewerbungen und Teamsuche",
        inside: ["Bewerbungen", "Teamsuche", "Staff-Freigaben"],
        icon: "file-text",
        sources: [
            { table: "apply_submissions", column: "user_id", role: "person", guild: G, time: ms("created_at"), label: "CONCAT('Bewerbung · ', status)", name: "user_name", words: true },
            { table: "lft_requests", column: "user_id", role: "person", guild: G, time: ms("created_at"), label: "title", name: "user_name" },
            { table: "staff_grants", column: "staff_id", role: "person", guild: G, time: ms("created_at"), label: `CONCAT('Staff-Freigabe · ', ${text("status")})`, words: true },
        ],
    },
    {
        id: "moderation",
        label: "Moderation",
        inside: ["Fälle", "Anti-Villain", "Meldungen", "Vertrauen"],
        icon: "shield-check",
        sources: [
            { table: "mod_cases", column: "target_id", role: "person", guild: G, time: ms("created_at"), label: "CONCAT('Fall ', number, ' · ', action)", name: "target_name", words: true },
            { table: "av_cases", column: "user_id", role: "person", guild: G, time: ms("created_at"), label: "CONCAT('Anti-Villain · ', status)", words: true },
            { table: "av_reports", column: "target_id", role: "person", guild: G, time: ms("at"), label: "'Gemeldet'" },
            // Eigene Meldungen gehören der Person (nicht „Als Team aktiv“): Als team kollidierte die '0' mit dem Schlüssel (guild_id, target_id, reporter_id).
            { table: "av_reports", column: "reporter_id", role: "person", guild: G, time: ms("at"), label: "'Jemanden gemeldet'" },
            { table: "av_trust", column: "user_id", role: "person", guild: G, label: "'Vertrauen gesetzt'" },
            { table: "av_debris", column: "members", role: "json", guild: G, label: "'Von Anti-Nuke gesichert'" },
        ],
    },
    {
        id: "community",
        label: "Community",
        inside: ["Gewinnspiele", "Umfragen", "Clips", "Eigene Sprachkanäle"],
        icon: "megaphone",
        sources: [
            { table: "giveaway_entries", column: "user_id", role: "person", time: ms("created_at"), label: "'Teilnahme an einem Gewinnspiel'" },
            { table: "poll_votes", column: "user_id", role: "person", time: ms("created_at"), label: "'Stimme in einer Umfrage'" },
            { table: "clip_entries", column: "user_id", role: "person", guild: G, time: ms("created_at"), label: "'Clip eingereicht'", name: "user_name" },
            { table: "clip_votes", column: "user_id", role: "person", time: ms("voted_at"), label: "'Stimme für einen Clip'" },
            { table: "temp_voices", column: "owner_id", role: "person", guild: G, time: ms("created_at"), label: "'Eigener Sprachkanal'" },
            { table: "giveaways", column: "results", role: "json", guild: G, time: ms("created_at"), label: "CONCAT('Gewinn bei Gewinnspiel ', number)" },
            { table: "clip_rounds", column: "winners", role: "json", guild: G, time: ms("opened_at"), label: "'Gewinner einer Clip-Runde'" },
        ],
    },
    {
        id: "teams",
        label: "Teams und Clubs",
        inside: ["Teams", "Clubs", "6mans"],
        icon: "users",
        sources: [
            { table: "team_members", column: "user_id", role: "person", time: "joined_at", label: "CONCAT('Mitglied in Team ', team_id)" },
            { table: "club_members", column: "user_id", role: "person", time: "joined_at", label: "CONCAT('Mitglied in Club ', club_id)" },
            // team, nicht person: Ein gelöschter Club nähme per ON DELETE CASCADE alle Mitglieder mit.
            { table: "clubs", column: "leader_id", role: "team", time: "created_at", label: "CONCAT('Leitet Club ', name)" },
            { table: "sixmans_players", column: "user_id", role: "person", guild: G, time: ms("updated_at"), label: "CONCAT('6mans · ', wins, ' Siege')", name: "name" },
            { table: "teams", column: "players", role: "json", guild: G, time: "created_at", label: "CONCAT('Spieler in ', name)" },
            { table: "sixmans_rounds", column: "blue", role: "json", guild: G, label: "'6mans-Runde, Team Blau'" },
            { table: "sixmans_rounds", column: "orange", role: "json", guild: G, label: "'6mans-Runde, Team Orange'" },
        ],
    },
    {
        id: "shop",
        label: "Shop",
        inside: ["Kundenkonto", "Bestellungen", "Zugänge", "Verlauf"],
        icon: "cart",
        sources: [
            { table: "shop_customers", column: "user_id", role: "person", time: "created_at", label: "'Kundenkonto im Shop'", name: "name", hidden: ["oauth_sealed"] },
            { table: "shop_orders", column: "user_id", role: "person", time: "created_at", label: "CONCAT('Bestellung ', order_no, ' · ', status)", words: true },
            { table: "shop_grants", column: "user_id", role: "person", time: "created_at", label: "CONCAT('Zugang · ', source)", words: true },
            { table: "shop_events", column: "user_id", role: "person", time: "created_at", label: `CONCAT('Shop · ', ${text("kind")})` },
        ],
    },
    {
        id: "beta",
        label: "Beta Access",
        inside: ["Beta Access"],
        icon: "sparkle",
        sources: [
            { table: "beta_members", column: "user_id", role: "person", time: "redeemed_at", label: "'Beta Access'" },
            { table: "beta_removals", column: "user_id", role: "person", time: "removed_at", label: "'Beta Access entzogen'" },
        ],
    },
    {
        id: "kontakt",
        label: "Kontakt",
        inside: ["Kontaktanfragen"],
        icon: "mail",
        // Im Formular tippt die Person ihren Discord selbst ein: gefunden wird nur, wer dort die ID angab.
        sources: [{ table: "contact_messages", column: "discord", role: "person", time: "created_at", label: "subject", name: "name" }],
    },
    {
        // W-0057: Sperren und Verdacht bleiben bei einer Löschung (Vorgabe), Anmeldespuren gehören zum Konto.
        id: "sicherheit",
        label: "Sicherheit",
        inside: ["Sperren", "Verdacht"],
        icon: "lock",
        sources: [
            { table: "security_bans", column: "user_id", role: "person", time: "created_at", label: "CONCAT('Sperre · ', state)", name: "user_name", words: true },
            { table: "security_suspects", column: "user_id", role: "person", time: "created_at", label: "CONCAT('Verdacht · ', kind, ' · ', state)", words: true },
        ],
    },
    {
        // W-0058: DMs vom Team über den Bot. Eine Nachricht nur an diese Person geht bei einer Löschung samt Text mit.
        id: "nachrichten",
        label: "Nachrichten vom Team",
        inside: ["DMs über den Bot"],
        icon: "send",
        sources: [
            { table: "bot_message_recipients", column: "user_id", role: "person", time: "done_at", label: "state", words: true },
            { table: "bot_messages", column: "target_user_id", role: "person", time: "created_at", label: "template_name" },
        ],
    },
    {
        id: "protokoll",
        label: "Im Protokoll des Teams",
        inside: ["Was das Team zur Person getan hat"],
        icon: "history",
        // Was das Team mit der Person getan hat (Gruppe vergeben, gesperrt, Auskunft geladen).
        sources: [{ table: "admin_audit", column: "target", role: "person", time: "created_at", label: "action" }],
    },
    {
        id: "team",
        label: "Als Team aktiv",
        inside: ["Was die Person als Team getan hat"],
        icon: "wrench",
        sources: [
            { table: "admin_audit", column: "user_id", role: "team", time: "created_at", label: "action", name: "user_name" },
            { table: "apply_forms", column: "created_by", role: "team", guild: G, label: "CONCAT('Formular angelegt: ', name)" },
            { table: "apply_submissions", column: "decided_by", role: "team", guild: G, time: ms("decided_at"), label: "'Über eine Bewerbung entschieden'" },
            { table: "auto_responses", column: "created_by", role: "team", guild: G, label: "'Auto-Antwort angelegt'" },
            { table: "av_cases", column: "closed_by", role: "team", guild: G, time: ms("closed_at"), label: "'Anti-Villain-Fall geschlossen'" },
            { table: "beta_codes", column: "created_by", role: "team", time: "created_at", label: "'Beta-Code angelegt'" },
            { table: "bot_messages", column: "created_by", role: "team", time: "created_at", label: "'Nachricht über den Bot verschickt'", name: "created_name" },
            { table: "bot_message_templates", column: "updated_by", role: "team", time: "updated_at", label: "'Vorlage für Nachrichten geändert'", name: "updated_name" },
            { table: "server_requests", column: "decided_by", role: "team", guild: G, time: "decided_at", label: "CONCAT('Über eine Server-Anfrage entschieden: ', guild_name)", name: "decided_name" },
            { table: "server_blocks", column: "blocked_by", role: "team", guild: G, time: "created_at", label: "'Server für RL Nexus gesperrt'", name: "by_name" },
            { table: "security_bans", column: "created_by", role: "team", time: "created_at", label: "'Person gesperrt'", name: "created_name" },
            { table: "security_suspects", column: "closed_by", role: "team", time: "closed_at", label: "'Verdacht entschieden'" },
            { table: "contact_messages", column: "handled_by", role: "team", time: "handled_at", label: "CONCAT('Kontakt bearbeitet: ', subject)" },
            { table: "contact_replies", column: "user_id", role: "team", time: "created_at", label: "'Auf eine Kontaktanfrage geantwortet'", name: "user_name" },
            { table: "custom_messages", column: "created_by", role: "team", guild: G, label: "CONCAT('Nachricht angelegt: ', name)" },
            { table: "dashboard_groups", column: "granted_by", role: "team", time: "granted_at", label: "CONCAT('Gruppe vergeben: ', group_name)", words: true },
            { table: "giveaways", column: "host_id", role: "team", guild: G, time: ms("created_at"), label: "CONCAT('Gewinnspiel ', number)" },
            { table: "guild_settings", column: "moderators", role: "json", guild: G, label: "'Als Moderator eingetragen'" },
            { table: "level_log", column: "actor_id", role: "team", guild: G, time: ms("created_at"), label: "CONCAT('XP geändert: ', mode, ' ', amount)", words: true },
            { table: "lft_requests", column: "closed_by", role: "team", guild: G, time: ms("closed_at"), label: "CONCAT('Teamsuche geschlossen: ', title)" },
            { table: "mail_accounts", column: "created_by", role: "team", time: "created_at", label: "CONCAT('Postfach angelegt: ', address)" },
            { table: "matchups", column: "created_by", role: "team", guild: G, label: "CONCAT('Matchup angelegt: ', opponent)" },
            { table: "mod_cases", column: "moderator_id", role: "team", guild: G, time: ms("created_at"), label: "CONCAT('Fall ', number, ' bearbeitet · ', action)", name: "moderator_name", words: true },
            { table: "polls", column: "created_by", role: "team", guild: G, time: ms("created_at"), label: "CONCAT('Umfrage ', number)" },
            { table: "self_role_panels", column: "created_by", role: "team", guild: G, label: "CONCAT('Rollen-Panel angelegt: ', name)" },
            { table: "server_restores", column: "actor_id", role: "team", guild: G, time: ms("started_at"), label: "'Backup zurückgeladen'", name: "actor_name" },
            { table: "shop_customers", column: "banned_by", role: "team", time: "banned_at", label: "'Shop-Kunden gesperrt'" },
            { table: "shop_events", column: "actor", role: "team", time: "created_at", label: `CONCAT('Shop · ', ${text("kind")})` },
            { table: "shop_grants", column: "granted_by", role: "team", time: "created_at", label: "'Shop-Zugang vergeben'" },
            { table: "shop_settings", column: "updated_by", role: "team", time: "updated_at", label: "'Shop-Einstellungen geändert'" },
            { table: "status_incidents", column: "created_by", role: "team", time: "created_at", label: "CONCAT('Statusmeldung angelegt: ', title)" },
            { table: "stream_notifiers", column: "created_by", role: "team", guild: G, label: "CONCAT('Stream-Meldung angelegt: ', account_name)" },
            { table: "support_waits", column: "claimed_by", role: "team", guild: G, label: "'Support übernommen'" },
            { table: "ticket_blacklist", column: "created_by", role: "team", guild: G, time: "created_at", label: "'Jemanden für Tickets gesperrt'" },
            { table: "tickets", column: "claimed_by", role: "team", guild: G, time: "created_at", label: "CONCAT('Ticket ', number, ' übernommen')" },
            { table: "tickets", column: "closed_by", role: "team", guild: G, time: "closed_at", label: "CONCAT('Ticket ', number, ' geschlossen')" },
            { table: "voice_hubs", column: "created_by", role: "team", guild: G, label: "'Voice-Hub angelegt'" },
            { table: "tickets", column: "notes", role: "json", guild: G, time: "created_at", label: "CONCAT('Notiz in Ticket ', number)" },
            { table: "tickets", column: "anonymous", role: "json", guild: G, time: "created_at", label: "CONCAT('Ticket ', number, ' anonym beantwortet')" },
            { table: "ticket_transcripts", column: "meta", role: "json", guild: G, time: "created_at", label: "CONCAT('Im Verlauf von Ticket ', number)" },
            { table: "mod_cases", column: "notes", role: "json", guild: G, time: ms("created_at"), label: "CONCAT('Notiz zu Fall ', number)" },
            { table: "staff_grants", column: "data", role: "json", guild: G, time: ms("created_at"), label: "'Bei einer Staff-Freigabe gefragt'" },
        ],
    },
];

/**
 * Spalten, die nach Person aussehen und keine sind, mit Grund. Die Prüfung in
 * check:db verlangt für jede Spalte mit Personen-Namen einen Eintrag oben
 * oder hier.
 */
export const USERDATA_IGNORED: Readonly<Record<string, string>> = {
    "level_backfill.last_user": "Arbeitsstand der Nachberechnung, keine Daten über die Person",
    // W-0057: Teile der Sperre, die mit ihr im Bereich Sicherheit bleiben.
    "security_bans.open_user": "Hilfsspalte für höchstens eine aktive Sperre je Person, derselbe Wert wie user_id",
    "security_bans.note": "Begründung des Teams zur Sperre, bleibt mit der Sperre",
    "security_evidence.data": "Beleg zur Sperre (Bild), bleibt mit der Sperre",
    "security_evidence.message": "Beleg zur Sperre (gespeicherte Discord-Nachricht), bleibt mit der Sperre",
    "mail_accounts.imap_host": "Adresse des Mailservers",
    "mail_accounts.smtp_host": "Adresse des Mailservers",
    "userdata_deletions.user_id": "Nachweis der Löschung selbst, bleibt immer",
    "userdata_deletions.open_user": "Nachweis der Löschung selbst, bleibt immer",
    "userdata_deletions.planned_by": "Nachweis, wer die Löschung geplant hat",
    "userdata_deletions.cancelled_by": "Nachweis, wer die Löschung abgebrochen hat",
    // JSON-, Text- und Blob-Spalten. `tabelle.*` gilt nur für diese, nie für Spalten mit Personen-Namen.
    "mail_accounts.secret": "Zugangsdaten eines Postfachs, nie in der Auskunft",
    "shop_customers.oauth_sealed": "Geheimnis, nie in der Auskunft",
    "mod_cases.details": "Inhalt des Falls, gehört zur Person aus target_id",
    "mod_cases.evidence": "Belege des Falls, gehören zur Person aus target_id",
    "av_debris.data": "gelöschte Kanäle und Rollen",
    "apply_forms.*": "Formular und Einstellungen",
    "auto_responses.*": "Inhalt und Einstellungen einer Auto-Antwort",
    "custom_messages.*": "Inhalt und Einstellungen einer Nachricht",
    "self_role_panels.*": "Text und Rollen eines Panels",
    "role_lists.*": "Einstellungen einer Rollenliste",
    "stream_notifiers.*": "Einstellungen einer Stream-Meldung",
    "voice_hubs.*": "Einstellungen eines Voice-Hubs",
    "module_settings.*": "Einstellungen eines Moduls",
    "mod_settings.*": "Einstellungen der Moderation",
    "ticket_settings.*": "Einstellungen der Tickets",
    "guild_settings.*": "Einstellungen des Servers; Moderatoren stehen als Quelle moderators",
    "polls.*": "Fragen, Einstellungen und Ergebnis als Zahlen; Stimmen stehen in poll_votes",
    "giveaways.*": "Bedingungen und Einstellungen; Gewinner stehen als Quelle results",
    "clip_rounds.*": "Preise der Runde; Gewinner stehen als Quelle winners",
    "sixmans_rounds.*": "names, before_mmr und reports nennen dieselben Personen wie blue und orange; channels sind Kanäle",
    "teams.*": "Einstellungen des Teams; Spieler stehen als Quelle players",
    "matchups.*": "Notiz und Ergebnis eines Matchups",
    "shop_products.*": "Produkt im Shop",
    "server_restores.*": "Zustand eines Zurückladens",
    "av_incidents.*": "Zustand eines Anti-Nuke-Vorfalls",
    "av_cases.*": "Inhalt des Falls, gehört zur Person aus user_id",
    "apply_submissions.*": "Antworten, gehören zur Person aus user_id",
    "lft_requests.*": "Antworten, gehören zur Person aus user_id",
    "epic_name_cases.*": "gehört zur Person aus user_id",
    "player_profiles.*": "gehört zur Person aus user_id",
    "voice_presets.*": "gehört zur Person aus user_id",
    "temp_voices.*": "Einstellungen des Kanals, gehört zur Person aus owner_id",
    "contact_messages.*": "Inhalt der Nachricht, gehört zur Zeile",
    "contact_replies.*": "Inhalt der Antwort, gehört zur Zeile",
    "status_incident_updates.*": "Text einer Statusmeldung",
    "userdata_deletions.*": "Zahlen der Löschung als Nachweis",
    // W-0058: Bei einer Nachricht nur an eine Person geht die ganze Zeile über target_user_id.
    "bot_messages.content": "Text einer Nachricht über den Bot, ohne eingesetzten Namen",
    "bot_message_templates.*": "Vorlage für Nachrichten, ohne Bezug zu einer Person",
};

/** Name einer Spalte, die eine Discord-ID einer Person hält (für VARCHAR, CHAR, BIGINT). */
export const PERSON_COLUMN = /(^|_)(user|target|moderator|owner|actor|opener|leader|author|creator|staff|reporter|host|captain|player|member)(_id)?$|_by$|^actor$|^discord$/;

/* --- Was bleibt (Runde 3): Rechtsgrundlage und Dauer ------------------- */

export const USERDATA_BASES = ["pflicht", "ansprueche", "interesse"] as const;
export type UserdataBasis = (typeof USERDATA_BASES)[number];

/** Warum etwas trotz Löschung bleiben darf (Art. 17 Abs. 3 DSGVO). */
export const USERDATA_BASIS: Readonly<Record<UserdataBasis, { readonly label: string; readonly article: string }>> = {
    pflicht: { label: "Gesetzliche Pflicht", article: "Art. 17 Abs. 3 lit. b DSGVO" },
    ansprueche: { label: "Rechtsansprüche", article: "Art. 17 Abs. 3 lit. e DSGVO" },
    // W-0057: für Sperren (Entscheidung des Nutzers, 03.11.), geprüft in W-0009.
    interesse: { label: "Berechtigtes Interesse", article: "Art. 17 Abs. 1 lit. c, Art. 21 Abs. 1 DSGVO" },
};
export const USERDATA_LAW_MAX = 60;
export const USERDATA_YEARS_MAX = 30;
/** So lange bleibt der Nachweis einer Löschung (Entscheidung des Nutzers, 02.11.). */
export const USERDATA_PROOF_YEARS = 3;
/** Nach so vielen Tagen sind Sicherungen der Datenbank überschrieben (Angabe des Nutzers, 02.11.). */
export const USERDATA_BACKUP_DAYS = 30;
/** Steht noch in einem Satz, sieht die Person ihn so in der DM. */
export const USERDATA_OPEN_NOTE = "zu klären";

/**
 * Vorgaben, solange niemand auf „Was bleibt“ speichert. Aus der
 * Datenschutzerklärung der Webseite (Abschnitt Shop); das Protokoll des Teams
 * ist Entscheidung 44 der Spec. Moderation hat dort keine Frist: gelöscht.
 */
export const USERDATA_DEFAULTS: Readonly<Partial<Record<UserdataArea, { readonly note: string; readonly basis: UserdataBasis; readonly law: string | null; readonly years: number | null }>>> = {
    shop: {
        note: "Bezahlte Bestellungen, Zustimmungen und Kündigungen bewahren wir drei Jahre nach Vertragsende auf, um Ansprüche belegen zu können. Rechnungen und Zahlungsdaten liegen bei Stripe.",
        basis: "ansprueche",
        law: null,
        years: 3,
    },
    protokoll: { note: "Was das Team zu dir getan hat, bleibt drei Jahre als Nachweis im Protokoll.", basis: "pflicht", law: "Art. 5 Abs. 2 DSGVO", years: 3 },
    // W-0057: ohne feste Dauer, die Sperre ist dauerhaft.
    sicherheit: { note: "Eine Sperre bleibt, damit sie wirkt.", basis: "interesse", law: null, years: null },
};

/** „Art. 17 Abs. 3 lit. e DSGVO · 3 Jahre“: für Vorschau und Beleg. */
export function basisText(rule: { readonly basis: UserdataBasis | null; readonly law: string | null; readonly years: number | null }): string {
    if (rule.basis === null) return "Rechtsgrundlage zu klären";

    const years = rule.years === null ? null : `${rule.years} ${rule.years === 1 ? "Jahr" : "Jahre"}`;

    return [USERDATA_BASIS[rule.basis].article, rule.law, years].filter(Boolean).join(" · ");
}

/** Werte aus ENUM-Spalten, die in Anzeigen stehen. Unbekanntes bleibt, wie es ist. */
const WORDS: Readonly<Record<string, string>> = {
    open: "offen",
    // W-0058: Empfänger einer Nachricht über den Bot. failed bleibt „fehlgeschlagen“ wie im Shop.
    sending: "wird gesendet",
    sent: "zugestellt",
    skipped: "ausgelassen",
    closed: "geschlossen",
    pending: "wartet",
    paid: "bezahlt",
    refunded: "erstattet",
    failed: "fehlgeschlagen",
    accepted: "angenommen",
    declined: "abgelehnt",
    approved: "freigegeben",
    revoked: "zurückgenommen",
    chosen: "gewählt",
    done: "erledigt",
    released: "freigegeben",
    trusted: "vertraut",
    banned: "gebannt",
    kicked: "gekickt",
    frozen: "eingefroren",
    ban: "Bann",
    unban: "Entbannung",
    kick: "Kick",
    timeout: "Timeout",
    untimeout: "Timeout aufgehoben",
    warn: "Verwarnung",
    unwarn: "Verwarnung zurückgenommen",
    purge: "Nachrichten gelöscht",
    add: "dazu",
    set: "gesetzt",
    reset: "zurückgesetzt",
    trial: "Test",
    one_time: "Einmalkauf",
    subscription: "Abo",
    gift: "Geschenk",
    ...GROUP_LABELS,
};

export function germanLabel(label: string): string {
    return label.replace(/\b[a-z_]+\b/g, (word) => WORDS[word] ?? word);
}

export function sourcesOf(area?: UserdataArea): IUserdataSource[] {
    return USERDATA_AREAS.filter((entry) => area === undefined || entry.id === area).flatMap((entry) => entry.sources);
}

/* --- Was die Seiten bekommen ------------------------------------------- */

/** Wann das Discord-Konto angelegt wurde: steckt in der ID (Snowflake). */
export function discordSince(id: string): string {
    return new Date(Number((BigInt(id) >> 22n) + 1420070400000n)).toISOString();
}

/** Einträge je Woche der letzten 13 Wochen (90 Tage), die neueste zuletzt. */
export function activityWeeks(times: readonly string[], now: number): number[] {
    const weeks = Array.from({ length: 13 }, () => 0);

    for (const time of times) {
        const age = Math.floor((now - Date.parse(time)) / (7 * 86_400_000));
        if (age >= 0 && age < weeks.length) weeks[weeks.length - 1 - age]++;
    }

    return weeks;
}

export const USERDATA_SORTS = ["eintraege", "zuletzt", "name"] as const;
export type UserdataSort = (typeof USERDATA_SORTS)[number];

export interface IUserdataPerson {
    readonly id: string;
    /** Aus Discord, sonst der zuletzt gespeicherte. */
    readonly name: string | null;
    readonly rows: number;
    /** Server mit Daten der Person. */
    readonly servers: number;
    readonly lastAt: string | null;
    readonly shop: boolean;
    /** Einträge je Bereich (ohne Listen und JSON). */
    readonly areas: Partial<Record<UserdataArea, number>>;
    /** Profilbild aus Discord, nur auf der sichtbaren Seite der Liste. */
    readonly avatar?: string | null;
    /** Offene Löschung (Teil 3b): Stand und Frist, sonst null. */
    readonly deletion?: { readonly state: DeletionState; readonly dueAt: string } | null;
}

export const USERDATA_FILTERS = ["alle", "laeuft", "shop"] as const;
export type UserdataFilter = (typeof USERDATA_FILTERS)[number];

export interface IUserdataList {
    readonly people: readonly IUserdataPerson[];
    readonly total: number;
    readonly counts: Readonly<Record<UserdataFilter, number>>;
    readonly page: number;
    readonly pageSize: number;
    /** Für die Zahlen oben: alle Einträge und angehaltene Löschungen. */
    readonly totals: { readonly rows: number; readonly halted: number };
    /** W-0065: So viele Namen der Seite holt der Server gerade im Hintergrund bei Discord. Größer 0: gleich noch einmal fragen. */
    readonly namesPending: number;
}

export interface IUserdataRow {
    readonly area: UserdataArea;
    readonly table: string;
    readonly role: IUserdataSource["role"];
    readonly label: string;
    readonly guildId: string | null;
    readonly guildName: string | null;
    readonly at: string | null;
}

export interface IUserdataProfile {
    readonly id: string;
    readonly name: string | null;
    readonly avatar: string | null;
    /** @-Name bei Discord. */
    readonly username: string | null;
    /** Profilbanner bei Discord, sonst null. */
    readonly banner: string | null;
    /** Profilfarbe bei Discord als #rrggbb, sonst null. */
    readonly accentColor: string | null;
    /** Wann das Discord-Konto angelegt wurde. */
    readonly discordSince: string;
    readonly shop: boolean;
    /** So viele Einträge blieben bei einer Löschung (Was bleibt). */
    readonly keptRows: number;
    /** Einträge je Woche der letzten 13 Wochen, die neueste zuletzt. */
    readonly activity: readonly number[];
    readonly firstAt: string | null;
    readonly lastAt: string | null;
    readonly servers: readonly { readonly id: string; readonly name: string | null; readonly icon: string | null; readonly rows: number }[];
    /** Je Bereich die Zahl, die ersten drei Einträge und der Satz, wenn er bleibt. */
    readonly areas: readonly { readonly id: UserdataArea; readonly label: string; readonly rows: number; readonly first: readonly string[]; readonly keep: string | null }[];
    /** Die neuesten 100. */
    readonly timeline: readonly IUserdataRow[];
    readonly audit: readonly { readonly action: string; readonly by: string; readonly at: string; readonly detail: string | null }[];
    /** Die offene Löschung, sonst die zuletzt angelegte (Teil 3b). */
    readonly deletion: IDeletion | null;
}

export interface IUserdataRule {
    readonly area: UserdataArea;
    readonly label: string;
    readonly keep: boolean;
    readonly note: string | null;
    readonly basis: UserdataBasis | null;
    readonly law: string | null;
    readonly years: number | null;
}

/** Für die Seite: dazu wie viele Personen und Einträge der Bereich gerade hat (ohne Listen und JSON). */
export interface IUserdataRuleView extends IUserdataRule {
    readonly people: number;
    readonly rows: number;
}

export const USERDATA_NOTE_MAX = 200;

/* --- Löschungen (Teil 3b) ----------------------------------------------- */

export const DELETION_STATES = ["geplant", "angehalten", "abgebrochen", "geloescht"] as const;
export type DeletionState = (typeof DELETION_STATES)[number];
export const DM_STATES = ["offen", "zugestellt", "nicht_zustellbar"] as const;
export type DmState = (typeof DM_STATES)[number];
export const DELETION_FILTERS = ["offen", "erledigt", "abgebrochen", "alle"] as const;
export type DeletionFilter = (typeof DELETION_FILTERS)[number];

/** Frist: lang genug, dass die Person die DM sehen kann, kurz genug für die Monatsfrist der DSGVO. */
export const DELETION_MIN_MS = 5 * 60_000;
export const DELETION_MAX_MS = 30 * 24 * 3_600_000;
/** Höchstens so oft eine Kopie per Knopf. */
export const COPY_GAP_MS = 5 * 60_000;

export interface IDeletionResult {
    readonly deleted: Partial<Record<UserdataArea, number>>;
    /** Zeilen anderer, aus denen nur die Person entfernt wurde. */
    readonly anonymized: Partial<Record<UserdataArea, number>>;
    /** basis, law und years seit Runde 3; ältere Löschungen haben sie nicht. */
    readonly kept: readonly { readonly area: UserdataArea; readonly label: string; readonly rows: number; readonly note: string; readonly basis?: UserdataBasis | null; readonly law?: string | null; readonly years?: number | null }[];
    readonly servers: number;
}

export interface IDeletion {
    readonly id: number;
    readonly userId: string;
    /** Bis zum Ausführen; danach leer, die ID bleibt als Nachweis. */
    readonly userName: string | null;
    readonly state: DeletionState;
    readonly dueAt: string;
    readonly reason: string;
    readonly plannedBy: string;
    readonly plannedName: string;
    readonly dmState: DmState;
    readonly dmError: string | null;
    readonly copyAt: string | null;
    readonly stoppedAt: string | null;
    readonly cancelledAt: string | null;
    readonly doneAt: string | null;
    readonly result: IDeletionResult | null;
    readonly createdAt: string;
    /** Prüfcode des Belegs, nur bei gelöschten in der Liste. */
    readonly code?: string | null;
}

export interface IDeletionCounts {
    readonly running: number;
    readonly halted: number;
    /** In den letzten 30 Tagen. */
    readonly deleted: number;
    readonly cancelled: number;
    readonly nextDueAt: string | null;
}
