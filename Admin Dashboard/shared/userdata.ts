/**
 * Wo RL Nexus Daten zu einer Person hat (W-0051). Die einzige Stelle, die das
 * weiß: Liste, Profil, Auskunft und später die Löschung lesen nur hier.
 * check:db gleicht sie mit der Datenbank ab, damit keine neue Tabelle
 * durchrutscht. `time`, `label` und `name` sind SQL-Ausdrücke über die Spalten
 * der Tabelle - Code, nie Eingabe.
 */

export const USERDATA_AREA_IDS = ["konto", "spieler", "level", "tickets", "bewerbungen", "moderation", "community", "teams", "shop", "beta", "kontakt", "protokoll", "team"] as const;
export type UserdataArea = (typeof USERDATA_AREA_IDS)[number];

export interface IUserdataSource {
    readonly table: string;
    readonly column: string;
    /** person: die Zeile gehört der Person. team: sie hat etwas für andere getan. json: ihre ID steht in einer JSON-Spalte. */
    readonly role: "person" | "team" | "json";
    readonly guild?: string;
    readonly time?: string;
    readonly label: string;
    /** Der dort gespeicherte Name der Person, wenn es einen gibt. */
    readonly name?: string;
    /** Spalten, die nie in die Auskunft kommen. */
    readonly hidden?: readonly string[];
    /** zlib-gepacktes JSON, in der Auskunft entpackt. */
    readonly packed?: readonly string[];
}

export interface IUserdataAreaDef {
    readonly id: UserdataArea;
    readonly label: string;
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
        sources: [
            { table: "dashboard_credentials", column: "user_id", role: "person", time: "created_at", label: "'Anmeldung im Bot-Dashboard'", name: "username", hidden: ["password", "totp_secret"] },
            { table: "notifications", column: "user_id", role: "person", time: "created_at", label: "title" },
            { table: "user_codes", column: "user_id", role: "person", time: "created_at", label: "'Code zum Verknüpfen'", hidden: ["code"] },
            { table: "voice_presets", column: "user_id", role: "person", time: ms("created_at"), label: "CONCAT('Voice-Vorlage ', name)" },
            { table: "dashboard_groups", column: "user_id", role: "person", time: "granted_at", label: "CONCAT('Gruppe ', group_name)" },
        ],
    },
    {
        id: "spieler",
        label: "Rocket-League-Konten",
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
        sources: [
            { table: "levels", column: "user_id", role: "person", guild: G, time: ms("updated_at"), label: "CONCAT('Level ', level, ' · ', xp, ' XP')" },
            { table: "level_days", column: "user_id", role: "person", guild: G, time: days("day"), label: "CONCAT(xp, ' XP an einem Tag')" },
            { table: "member_activity", column: "user_id", role: "person", guild: G, time: days("day"), label: "CONCAT(messages, ' Nachrichten an einem Tag')" },
            { table: "level_log", column: "user_id", role: "person", guild: G, time: ms("created_at"), label: "CONCAT('XP ', mode, ' ', amount)" },
        ],
    },
    {
        id: "tickets",
        label: "Tickets",
        sources: [
            { table: "tickets", column: "opener_id", role: "person", guild: G, time: "created_at", label: "CONCAT('Ticket ', number, ' · ', status)" },
            { table: "tickets", column: "members", role: "json", guild: G, time: "created_at", label: "CONCAT('Im Ticket ', number)" },
            { table: "ticket_transcripts", column: "opener_id", role: "person", guild: G, time: "created_at", label: "CONCAT('Verlauf von Ticket ', number)", name: "opener_name", packed: ["data"] },
            { table: "ticket_blacklist", column: "user_id", role: "person", guild: G, time: "created_at", label: "'Für Tickets gesperrt'" },
            { table: "support_waits", column: "user_id", role: "person", guild: G, label: "'Wartet im Support'" },
        ],
    },
    {
        id: "bewerbungen",
        label: "Bewerbungen und Teamsuche",
        sources: [
            { table: "apply_submissions", column: "user_id", role: "person", guild: G, time: ms("created_at"), label: "CONCAT('Bewerbung · ', status)", name: "user_name" },
            { table: "lft_requests", column: "user_id", role: "person", guild: G, time: ms("created_at"), label: "title", name: "user_name" },
            { table: "staff_grants", column: "staff_id", role: "person", guild: G, time: ms("created_at"), label: `CONCAT('Staff-Freigabe · ', ${text("status")})` },
        ],
    },
    {
        id: "moderation",
        label: "Moderation",
        sources: [
            { table: "mod_cases", column: "target_id", role: "person", guild: G, time: ms("created_at"), label: "CONCAT('Fall ', number, ' · ', action)", name: "target_name" },
            { table: "av_cases", column: "user_id", role: "person", guild: G, time: ms("created_at"), label: "CONCAT('Anti-Villain · ', status)" },
            { table: "av_reports", column: "target_id", role: "person", guild: G, time: ms("at"), label: "'Gemeldet'" },
            { table: "av_trust", column: "user_id", role: "person", guild: G, label: "'Vertrauen gesetzt'" },
        ],
    },
    {
        id: "community",
        label: "Community",
        sources: [
            { table: "giveaway_entries", column: "user_id", role: "person", time: ms("created_at"), label: "'Teilnahme an einem Gewinnspiel'" },
            { table: "poll_votes", column: "user_id", role: "person", time: ms("created_at"), label: "'Stimme in einer Umfrage'" },
            { table: "clip_entries", column: "user_id", role: "person", guild: G, time: ms("created_at"), label: "'Clip eingereicht'", name: "user_name" },
            { table: "clip_votes", column: "user_id", role: "person", time: ms("voted_at"), label: "'Stimme für einen Clip'" },
            { table: "temp_voices", column: "owner_id", role: "person", guild: G, time: ms("created_at"), label: "'Eigener Sprachkanal'" },
        ],
    },
    {
        id: "teams",
        label: "Teams und Clubs",
        sources: [
            { table: "team_members", column: "user_id", role: "person", time: "joined_at", label: "CONCAT('Mitglied in Team ', team_id)" },
            { table: "club_members", column: "user_id", role: "person", time: "joined_at", label: "CONCAT('Mitglied in Club ', club_id)" },
            { table: "clubs", column: "leader_id", role: "person", time: "created_at", label: "CONCAT('Leitet Club ', name)" },
            { table: "sixmans_players", column: "user_id", role: "person", guild: G, time: ms("updated_at"), label: "CONCAT('6mans · ', wins, ' Siege')", name: "name" },
            { table: "teams", column: "players", role: "json", guild: G, time: "created_at", label: "CONCAT('Spieler in ', name)" },
        ],
    },
    {
        id: "shop",
        label: "Shop",
        sources: [
            { table: "shop_customers", column: "user_id", role: "person", time: "created_at", label: "'Kundenkonto im Shop'", name: "name", hidden: ["oauth_sealed"] },
            { table: "shop_orders", column: "user_id", role: "person", time: "created_at", label: "CONCAT('Bestellung ', order_no, ' · ', status)" },
            { table: "shop_grants", column: "user_id", role: "person", time: "created_at", label: "CONCAT('Zugang · ', source)" },
            { table: "shop_events", column: "user_id", role: "person", time: "created_at", label: `CONCAT('Shop · ', ${text("kind")})` },
        ],
    },
    {
        id: "beta",
        label: "Beta Access",
        sources: [
            { table: "beta_members", column: "user_id", role: "person", time: "redeemed_at", label: "'Beta Access'" },
            { table: "beta_removals", column: "user_id", role: "person", time: "removed_at", label: "'Beta Access entzogen'" },
        ],
    },
    {
        id: "kontakt",
        label: "Kontakt",
        // Im Formular tippt die Person ihren Discord selbst ein: gefunden wird nur, wer dort die ID angab.
        sources: [{ table: "contact_messages", column: "discord", role: "person", time: "created_at", label: "subject", name: "name" }],
    },
    {
        id: "protokoll",
        label: "Im Protokoll des Teams",
        // Was das Team mit der Person getan hat (Gruppe vergeben, gesperrt, Auskunft geladen).
        sources: [{ table: "admin_audit", column: "target", role: "person", time: "created_at", label: "action" }],
    },
    {
        id: "team",
        label: "Als Team aktiv",
        sources: [
            { table: "admin_audit", column: "user_id", role: "team", time: "created_at", label: "action", name: "user_name" },
            { table: "apply_forms", column: "created_by", role: "team", guild: G, label: "CONCAT('Formular angelegt: ', name)" },
            { table: "apply_submissions", column: "decided_by", role: "team", guild: G, time: ms("decided_at"), label: "'Über eine Bewerbung entschieden'" },
            { table: "auto_responses", column: "created_by", role: "team", guild: G, label: "'Auto-Antwort angelegt'" },
            { table: "av_cases", column: "closed_by", role: "team", guild: G, time: ms("closed_at"), label: "'Anti-Villain-Fall geschlossen'" },
            { table: "av_reports", column: "reporter_id", role: "team", guild: G, time: ms("at"), label: "'Jemanden gemeldet'" },
            { table: "beta_codes", column: "created_by", role: "team", time: "created_at", label: "'Beta-Code angelegt'" },
            { table: "contact_messages", column: "handled_by", role: "team", time: "handled_at", label: "CONCAT('Kontakt bearbeitet: ', subject)" },
            { table: "contact_replies", column: "user_id", role: "team", time: "created_at", label: "'Auf eine Kontaktanfrage geantwortet'", name: "user_name" },
            { table: "custom_messages", column: "created_by", role: "team", guild: G, label: "CONCAT('Nachricht angelegt: ', name)" },
            { table: "dashboard_groups", column: "granted_by", role: "team", time: "granted_at", label: "CONCAT('Gruppe vergeben: ', group_name)" },
            { table: "giveaways", column: "host_id", role: "team", guild: G, time: ms("created_at"), label: "CONCAT('Gewinnspiel ', number)" },
            { table: "guild_settings", column: "moderators", role: "json", guild: G, label: "'Als Moderator eingetragen'" },
            { table: "level_log", column: "actor_id", role: "team", guild: G, time: ms("created_at"), label: "CONCAT('XP geändert: ', mode, ' ', amount)" },
            { table: "lft_requests", column: "closed_by", role: "team", guild: G, time: ms("closed_at"), label: "CONCAT('Teamsuche geschlossen: ', title)" },
            { table: "mail_accounts", column: "created_by", role: "team", time: "created_at", label: "CONCAT('Postfach angelegt: ', address)" },
            { table: "matchups", column: "created_by", role: "team", guild: G, label: "CONCAT('Matchup angelegt: ', opponent)" },
            { table: "mod_cases", column: "moderator_id", role: "team", guild: G, time: ms("created_at"), label: "CONCAT('Fall ', number, ' bearbeitet · ', action)", name: "moderator_name" },
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
    "mail_accounts.imap_host": "Adresse des Mailservers",
    "mail_accounts.smtp_host": "Adresse des Mailservers",
};

/** Name einer Spalte, die eine Discord-ID einer Person hält (für VARCHAR, CHAR, BIGINT). */
export const PERSON_COLUMN = /(^|_)(user|target|moderator|owner|actor|opener|leader|author|creator|staff|reporter|host|captain|player|member)(_id)?$|_by$|^actor$|^discord$/;

/** Bis W-0009 klärt, was rechtlich bleiben muss (Spec Teil 3, „Was bleibt“). */
export const USERDATA_DEFAULT_KEEP: Readonly<Partial<Record<UserdataArea, string>>> = { shop: "zu klären", moderation: "zu klären", protokoll: "zu klären" };

export function sourcesOf(area?: UserdataArea): IUserdataSource[] {
    return USERDATA_AREAS.filter((entry) => area === undefined || entry.id === area).flatMap((entry) => entry.sources);
}

/* --- Was die Seiten bekommen ------------------------------------------- */

export interface IUserdataPerson {
    readonly id: string;
    /** Aus Discord, sonst der zuletzt gespeicherte. */
    readonly name: string | null;
    readonly rows: number;
    /** Server mit Daten der Person. */
    readonly servers: number;
    readonly lastAt: string | null;
    readonly shop: boolean;
}

export const USERDATA_FILTERS = ["alle", "shop"] as const;
export type UserdataFilter = (typeof USERDATA_FILTERS)[number];

export interface IUserdataList {
    readonly people: readonly IUserdataPerson[];
    readonly total: number;
    readonly counts: Readonly<Record<UserdataFilter, number>>;
    readonly page: number;
    readonly pageSize: number;
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
    readonly firstAt: string | null;
    readonly lastAt: string | null;
    readonly servers: readonly { readonly id: string; readonly name: string | null; readonly rows: number }[];
    /** Je Bereich die Zahl, die ersten drei Einträge und der Satz, wenn er bleibt. */
    readonly areas: readonly { readonly id: UserdataArea; readonly label: string; readonly rows: number; readonly first: readonly string[]; readonly keep: string | null }[];
    /** Die neuesten 100. */
    readonly timeline: readonly IUserdataRow[];
    readonly audit: readonly { readonly action: string; readonly by: string; readonly at: string; readonly detail: string | null }[];
}

export interface IUserdataRule {
    readonly area: UserdataArea;
    readonly label: string;
    readonly keep: boolean;
    readonly note: string | null;
}

export const USERDATA_NOTE_MAX = 200;
