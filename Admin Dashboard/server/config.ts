/**
 * Die Einstellungen des Admin-Servers aus den Umgebungsvariablen.
 *
 * Im Betrieb setzt sie docker-compose.prod.yml im Ordner RL Nexus Bot, lokal kommt
 * eine eigene .env dazu (siehe .env.example). Fehlt etwas Wichtiges, startet
 * der Server nicht und nennt, was fehlt, wie der Bot.
 */

import { SNOWFLAKE } from "../shared/limits.ts";

/** Name der Backup-Datenbank. Er landet in SQL, deshalb nur Buchstaben, Ziffern und Unterstrich. */
function backupDatabaseName(value: string): string {
    const name = value || "rlnexus_backups";
    if (!/^[A-Za-z0-9_]{1,64}$/.test(name)) throw new Error(`BACKUP_DATABASE_NAME darf nur Buchstaben, Ziffern und _ enthalten: ${value}`);

    return name;
}

export interface IDatabaseConfig {
    readonly host: string;
    readonly port: number;
    readonly name: string;
    readonly user: string;
    readonly password: string;
    /** Zweite Datenbank auf demselben Server für die Backups (BACKUP_DATABASE_NAME), gleiche Zugangsdaten. */
    readonly backupName: string;
}

/** Der eigene Mailserver. null heißt: Es geht keine Mail raus. */
export interface ISmtpConfig {
    readonly host: string;
    readonly port: number;
    readonly user: string;
    readonly password: string;
    /** Absender. Leer heißt: derselbe wie `user`. */
    readonly from: string;
}

/** Ein Mailserver, wie er bei IMAP oder SMTP angesprochen wird. */
export interface IMailServer {
    readonly host: string;
    readonly port: number;
}

/**
 * Das Postfach. Die Server stehen je Postfach in der Datenbank, hier stehen
 * nur die Vorschläge fürs Formular. Ein Host null heißt: mail.<Domain der Adresse>.
 */
export interface IMailConfig {
    /** Verschlüsselt die Passwörter in mail_accounts. */
    readonly key: string;
    readonly imap: { readonly host: string | null; readonly port: number };
    readonly smtp: { readonly host: string | null; readonly port: number };
}

export interface IStripeConfig {
    readonly secretKey: string;
    readonly publishableKey: string;
    readonly webhookSecret: string;
    /** Aus dem Präfix des geheimen Schlüssels. */
    readonly mode: "test" | "live";
}

export interface IConfig {
    /**
     * Mit `--dev` gestartet. Dann gelten `DEV_CLIENT_ID`, `DEV_CLIENT_SECRET`
     * und `DEV_CLIENT_TOKEN`, wie beim Bot. Die Rollen prüft das Dashboard
     * dann auf dem Dev Server, auf dem auch der Dev-Bot sitzt
     * (`DEV_ADMIN_GUILD_ID`, `DEV_ADMIN_ROLE_ID`, `DEV_DEVELOPER_ROLE_ID`).
     */
    readonly developerMode: boolean;
    readonly clientId: string;
    readonly clientSecret: string;
    /** Prüft die Rollen und holt Namen, öffnet aber keine Gateway-Sitzung. */
    readonly botToken: string;
    /** SERVER_JWT_SECRET des Bots. Daraus kommen Sitzungsschlüssel und Tokens für /dcapi. */
    readonly jwtSecret: string;
    /** null heißt: ohne Datenbank. Was sie braucht, sagt dann, dass sie fehlt. */
    readonly database: IDatabaseConfig | null;
    readonly devUserIds: readonly string[];
    readonly guildId: string;
    readonly adminRoleId: string;
    readonly developerRoleId: string;
    /** Ohne Schrägstrich am Ende, etwa https://admin.nexus-emb.de. */
    readonly publicUrl: string;
    readonly secureCookies: boolean;
    readonly botApiUrl: string;
    /** Über diese Adresse prüft der Server, ob die Webseite antwortet. Im Betrieb die öffentliche. */
    readonly websiteUrl: string;
    /** Der gebaute dist-Ordner der Webseite, eingehängt. Gesetzt: Standardinhalt kommt von dort statt per HTTP. */
    readonly websiteDist: string | null;
    readonly logsDir: string;
    readonly siteDir: string;
    readonly flagsDir: string;
    readonly port: number;
    /**
     * Wohin das Kontaktformular geht, Standard support@nexus-emb.de. Verschickt
     * wird über das Postfach mit dieser Adresse aus „Postfächer verwalten“,
     * mit dessen Server und Passwort.
     */
    readonly contactMail: string;
    /** SMTP_* aus der .env: Ersatz für das Kontaktformular, wenn es das Postfach nicht gibt. */
    readonly smtp: ISmtpConfig | null;
    /** Mit --dev aus DEV_CONTACT_WEBHOOK_URL, damit Tests nicht im echten Kanal landen. */
    readonly contactWebhook: string | null;
    /**
     * Wohin die Statusmeldung geht. Sonst der eine Kanal aus STATUS_CHANNEL_ID,
     * mit --dev die Test-Kanäle aus DEV_STATUS_CHANNEL_IDS (Standard: die
     * beiden Kanäle auf dem Entwicklungs-Server). Leer: keine Meldung.
     */
    readonly statusChannelIds: readonly string[];
    /** Die öffentliche Adresse des Bot-Dashboards, nur für die Statusmeldung. */
    readonly dashboardUrl: string | null;
    /** Die Statusseite, etwa https://status.nexus-emb.de. Knopf in Discord, Link im Admin Dashboard. */
    readonly statusUrl: string;
    /** Die Webseite, wie Besucher sie aufrufen. websiteUrl ist die Adresse im Docker-Netz. */
    readonly websitePublicUrl: string;
    /**
     * Die Seite /vorschau der Webseite für den Modul-Editor. Sonst unter
     * WEBSITE_PUBLIC_URL, mit --dev die lokale Webseite (DEV_WEBSITE_PUBLIC_URL,
     * Standard http://localhost:5173).
     */
    readonly previewUrl: string;
    /**
     * Die Webseite, auf der der Shop läuft: Rücksprung von Discord und Stripe,
     * Herkunft der schreibenden Anfragen. Mit --dev DEV_WEBSITE_PUBLIC_URL
     * (Standard http://localhost:5173), sonst WEBSITE_PUBLIC_URL.
     */
    readonly shopSiteUrl: string;
    /** Einladung zum Discord-Server für die Statusseite. null heißt: kein Link. */
    readonly discordInviteUrl: string | null;
    readonly mail: IMailConfig;
    /**
     * Stripe für den Shop. Mit --dev die DEV_-Schlüssel, und dann nur
     * Testschlüssel. null: nicht eingerichtet, der Shop verkauft nichts.
     */
    readonly stripe: IStripeConfig | null;
    /** Absender der Shop-Mails, Standard noreply@nexus-emb.de. */
    readonly shopMailFrom: string;
}

type Env = Readonly<Record<string, string | undefined>>;

/**
 * Der Dev Server: Dort sitzt der Dev-Bot, dort zählen im Dev-Modus die Rollen,
 * und dorthin geht die Statusmeldung (#moderator-only). Jede ID lässt sich mit
 * der passenden DEV_-Variable überschreiben.
 */
const DEV_SERVER = {
    ADMIN_GUILD_ID: "1162553851187040326",
    ADMIN_ROLE_ID: "1162556186462261248",
    DEVELOPER_ROLE_ID: "1286386691925344390",
} as const;
const DEV_STATUS_CHANNELS = "1211378072549326860";

/** Dieselbe Untergrenze wie MIN_SECRET_LENGTH im Bot. */
const MIN_SECRET_LENGTH = 32;

export function loadConfig(env: Env = process.env, argv: readonly string[] = process.argv): IConfig {
    const developerMode = argv.includes("--dev");

    /** Im Dev-Modus dieselbe Variable mit DEV_ davor, genau wie beim Bot. */
    const app = (name: string): string => (developerMode ? `DEV_${name}` : name);

    const raw = (name: string): string => env[name]?.trim() ?? "";

    const need = (name: string): string => {
        const value = raw(name);
        if (!value) throw new Error(`${name} fehlt in der Umgebung, siehe .env.example.`);

        return value;
    };

    const id = (name: string): string => {
        const value = need(name);
        if (!SNOWFLAKE.test(value)) throw new Error(`${name} ist keine Discord-ID (17 bis 20 Ziffern).`);

        return value;
    };

    /** Server und Rollen: sonst aus der Umgebung, im Dev-Modus vom Dev Server. */
    const serverId = (name: keyof typeof DEV_SERVER): string => {
        if (!developerMode) return id(name);

        const value = raw(`DEV_${name}`) || DEV_SERVER[name];
        if (!SNOWFLAKE.test(value)) throw new Error(`DEV_${name} ist keine Discord-ID (17 bis 20 Ziffern).`);

        return value;
    };

    const address = (name: string, fallback?: string): string => {
        const value = (raw(name) || fallback || need(name)).replace(/\/+$/, "");
        if (!URL.canParse(value)) throw new Error(`${name} ist keine gültige Adresse: ${value}`);

        return value;
    };

    const jwtSecret = need("SERVER_JWT_SECRET");
    if (jwtSecret.length < MIN_SECRET_LENGTH) {
        throw new Error(`SERVER_JWT_SECRET ist kürzer als ${MIN_SECRET_LENGTH} Zeichen.`);
    }

    const publicUrl = address("ADMIN_PUBLIC_URL");

    const port = Number(raw("PORT") || 3001);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`PORT ist ungültig: ${raw("PORT")}`);

    const database =
        raw("DATABASE_HOST") && raw("DATABASE_NAME") && raw("DATABASE_USER")
            ? {
                  host: raw("DATABASE_HOST"),
                  port: Number(raw("DATABASE_PORT")) || 3306,
                  name: raw("DATABASE_NAME"),
                  user: raw("DATABASE_USER"),
                  password: raw("DATABASE_PASSWORD"),
                  backupName: backupDatabaseName(raw("BACKUP_DATABASE_NAME")),
              }
            : null;

    const siteUrl = developerMode
        ? publicAddress(raw("DEV_WEBSITE_PUBLIC_URL"), "http://localhost:5173")
        : publicAddress(raw("WEBSITE_PUBLIC_URL"), "https://nexus-emb.de");

    return {
        developerMode,
        clientId: id(app("CLIENT_ID")),
        clientSecret: need(app("CLIENT_SECRET")),
        botToken: need(app("CLIENT_TOKEN")),
        jwtSecret,
        database,
        devUserIds: raw("DEV_USER_IDs")
            .split(",")
            .map((value) => value.trim())
            .filter((value) => SNOWFLAKE.test(value)),
        guildId: serverId("ADMIN_GUILD_ID"),
        adminRoleId: serverId("ADMIN_ROLE_ID"),
        developerRoleId: serverId("DEVELOPER_ROLE_ID"),
        publicUrl,
        secureCookies: publicUrl.startsWith("https://"),
        botApiUrl: address("BOT_API_URL", "http://localhost:3000"),
        websiteUrl: address("WEBSITE_URL", "http://localhost:5173"),
        websiteDist: raw("WEBSITE_DIST") || null,
        logsDir: raw("LOGS_DIR") || "../Discord Bot/logs",
        siteDir: raw("SITE_DIR") || "./data/site",
        flagsDir: raw("FLAGS_DIR") || "./data/flags",
        port,
        contactMail: (raw("CONTACT_MAIL") || "support@nexus-emb.de").toLowerCase(),
        smtp: smtpOf(raw),
        // Ein Discord-Webhook ist eine Vollmacht für den Kanal: nur https.
        contactWebhook: raw(app("CONTACT_WEBHOOK_URL")).startsWith("https://") ? raw(app("CONTACT_WEBHOOK_URL")) : null,
        statusChannelIds: developerMode
            ? (raw("DEV_STATUS_CHANNEL_IDS") || DEV_STATUS_CHANNELS)
                  .split(",")
                  .map((entry) => entry.trim())
                  .filter((entry) => SNOWFLAKE.test(entry))
            : SNOWFLAKE.test(raw("STATUS_CHANNEL_ID"))
              ? [raw("STATUS_CHANNEL_ID")]
              : [],
        dashboardUrl: URL.canParse(raw("DASHBOARD_URL")) ? raw("DASHBOARD_URL").replace(/\/+$/, "") : null,
        statusUrl: publicAddress(raw("STATUS_URL"), "https://status.nexus-emb.de"),
        websitePublicUrl: publicAddress(raw("WEBSITE_PUBLIC_URL"), "https://nexus-emb.de"),
        previewUrl: `${siteUrl}/vorschau`,
        shopSiteUrl: siteUrl,
        discordInviteUrl: raw("DISCORD_INVITE_URL").startsWith("https://") ? raw("DISCORD_INVITE_URL").replace(/\/+$/, "") : null,
        mail: mailOf(raw, jwtSecret),
        stripe: stripeOf(raw, app, developerMode),
        shopMailFrom: (raw("SHOP_MAIL_FROM") || "noreply@nexus-emb.de").toLowerCase(),
    };
}

/**
 * Das Postfach, ohne dass etwas in der Umgebung stehen muss.
 *
 * Ohne MAIL_KEY kommt der Schlüssel aus SERVER_JWT_SECRET, mit eigenem
 * Präfix: ein anderer Schlüssel als für die Sitzungen, und wer nur die
 * Datenbank hat, kommt trotzdem nicht an die Passwörter. Wer MAIL_KEY später
 * setzt oder das Secret wechselt, trägt die Passwörter neu ein.
 */
function mailOf(raw: (name: string) => string, jwtSecret: string): IMailConfig {
    const own = raw("MAIL_KEY");
    if (own && own.length < MIN_SECRET_LENGTH) throw new Error(`MAIL_KEY ist kürzer als ${MIN_SECRET_LENGTH} Zeichen.`);

    return {
        key: own || `mail:${jwtSecret}`,
        imap: { host: raw("MAIL_IMAP_HOST") || null, port: Number(raw("MAIL_IMAP_PORT")) || 993 },
        smtp: { host: raw("MAIL_SMTP_HOST") || null, port: Number(raw("MAIL_SMTP_PORT")) || 465 },
    };
}

/**
 * Die Stripe-Schlüssel. Fehlen alle drei, ist der Shop aus. Fehlt nur einer
 * oder passen sie nicht zusammen, startet der Server trotzdem (das Admin
 * Dashboard soll nicht wegen des Shops ausfallen) und sagt im Log, was nicht
 * stimmt. Ein Live-Schlüssel mit --dev ist dagegen ein Startfehler: Im
 * Dev-Modus darf kein echtes Geld fließen.
 */
function stripeOf(raw: (name: string) => string, app: (name: string) => string, developerMode: boolean): IStripeConfig | null {
    const names = [app("STRIPE_SECRET_KEY"), app("STRIPE_PUBLISHABLE_KEY"), app("STRIPE_WEBHOOK_SECRET")] as const;
    const [secretKey, publishableKey, webhookSecret] = names.map((name) => raw(name));

    if (!secretKey && !publishableKey && !webhookSecret) return null;

    const live = /^(sk|rk)_live_/.test(secretKey);

    if (developerMode && live) {
        throw new Error(`${names[0]} ist ein Live-Schlüssel von Stripe. Mit --dev gehen nur Testschlüssel (sk_test_…), damit kein echtes Geld fließt.`);
    }

    const problem =
        !secretKey || !publishableKey || !webhookSecret
            ? `${names.join(", ")} gehören zusammen. Trag alle drei ein oder keinen.`
            : !live && !/^(sk|rk)_test_/.test(secretKey)
              ? `${names[0]} beginnt nicht mit sk_test_, sk_live_, rk_test_ oder rk_live_.`
              : !publishableKey.startsWith(live ? "pk_live_" : "pk_test_")
                ? `${names[1]} passt nicht zum Modus von ${names[0]} (${live ? "live" : "test"}).`
                : !webhookSecret.startsWith("whsec_")
                  ? `${names[2]} beginnt nicht mit whsec_.`
                  : null;

    if (problem) {
        console.warn(`⚠️  Stripe bleibt aus: ${problem}`);
        return null;
    }

    return { secretKey, publishableKey, webhookSecret, mode: live ? "live" : "test" };
}

/** Eine Adresse für Besucher: https, lokal auch http://localhost. Sonst der Standard. */
function publicAddress(value: string, fallback: string): string {
    const usable = value.startsWith("https://") || value.startsWith("http://localhost") || value.startsWith("http://127.0.0.1");

    return usable && URL.canParse(value) ? value.replace(/\/+$/, "") : fallback;
}

/**
 * Der Mailversand. Fehlt einer der drei Zugangswerte, bleibt er aus: eine
 * halb eingerichtete Verbindung würde bei jeder Nachricht scheitern.
 */
function smtpOf(raw: (name: string) => string): ISmtpConfig | null {
    const host = raw("SMTP_HOST");
    const user = raw("SMTP_USER");
    const password = raw("SMTP_PASSWORD");

    if (!host || !user || !password) return null;

    return {
        host,
        port: Number(raw("SMTP_PORT")) || 465,
        user,
        password,
        from: raw("SMTP_FROM") || user,
    };
}
