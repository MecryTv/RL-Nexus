// Steckt vollständig in der .env - siehe utils/config.ts und docs/Environment.md.
// Wer im Dashboard welche Gruppe hat, steht dagegen in der Datenbank
// (dashboard_groups), nicht in dieser Datei.
export interface IConfig {
    CLIENT_TOKEN: string;
    CLIENT_ID: string;
    CLIENT_SECRET: string;

    DEV_CLIENT_TOKEN: string;
    DEV_CLIENT_ID: string;
    DEV_CLIENT_SECRET: string;
    DEV_GUILD_ID: string;
    /** Entwickler-Befehle und der Einstieg ins Admin-Dashboard. */
    DEV_USER_IDs: string[];

    DATABASE_HOST: string;
    DATABASE_PORT: number;
    DATABASE_NAME: string;
    DATABASE_USER: string;
    DATABASE_PASSWORD: string;
    DATABASE_POOL_LIMIT: number;

    SERVER_PORT: number;
    /**
     * Die oeffentliche Adresse des Dashboards - im Betrieb
     * https://dashboard.nexus-emb.de, im "--dev" Modus ungenutzt. Aus ihr baut
     * der Bot die Redirect-URI fuer Discord und die Bild-URLs.
     */
    SERVER_PUBLIC_URL: string;
    /** Die Hauptseite (https://nexus-emb.de). Das Dashboard verlinkt zurueck. */
    SITE_PUBLIC_URL: string;
    SERVER_JWT_SECRET: string;
    SERVER_JWT_EXPIRES_IN: string;
    /**
     * Das Admin Dashboard, wie der Bot es erreicht: im Betrieb im Docker-Netz
     * http://admin:3001, lokal http://localhost:3001. Das Modul Backups reicht
     * dorthin weiter (/internal/backups/…), von außen ist der Pfad gesperrt.
     */
    ADMIN_INTERNAL_URL: string;
    SERVER_RATE_LIMIT_MAX: number;
    SERVER_RATE_LIMIT_WINDOW: string;

    // Schaltet das privilegierte "Server Members Intent" ein. Nur einschalten,
    // wenn es im Developer Portal ebenfalls an ist - sonst weist Discord den
    // Login rundweg ab. Ohne das Intent kennt der Bot keine Mitgliederliste und
    // das Dashboard zeigt nur die Gesamtzahl statt Mitglieder und Bots getrennt.
    GUILD_MEMBER_INTENT: boolean;
    // Das privilegierte "Presence Intent" - nur für die Live-Rolle des Twitch
    // Notifiers. Wie oben: nur an, wenn es im Developer Portal ebenfalls an ist.
    GUILD_PRESENCE_INTENT: boolean;

    /** Token fuer prime.rocketplanet.gg - ohne ihn holen /rank, Teams und Rank Roles keine Raenge. */
    PRIME_API_TOKEN: string;

    // Twitch-App (dev.twitch.tv) für den Twitch Notifier. Ohne beide Werte
    // meldet er nichts, und das Dashboard sagt das.
    TWITCH_CLIENT_ID: string;
    TWITCH_CLIENT_SECRET: string;

    // Nur für YouTube-Livestreams. Videos und Shorts kommen ohne Schlüssel aus dem Kanal-Feed.
    YOUTUBE_API_KEY: string;

    // Postfach für Fehlermeldungen. Port 465 spricht gleich TLS, 587 per STARTTLS.
    // SMTP_FROM leer: Absender ist SMTP_USER.
    SMTP_HOST: string;
    SMTP_PORT: number;
    SMTP_USER: string;
    SMTP_PASSWORD: string;
    SMTP_FROM: string;
}
