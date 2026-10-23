import { FastifyRequest } from "fastify";

/** Der Scope, den das Admin Dashboard in seine Tokens schreibt. */
export const ADMIN_SCOPE = "admin";

/** So lange wartet der Neustart, damit die Antwort noch rausgeht. */
export const RESTART_DELAY = 500;

/**
 * Die Schlüssel aus der .env.example. Das Admin Dashboard erfährt nur, ob sie
 * gesetzt sind, nie den Wert. Kommt in der .env.example einer dazu, gehört er hierher.
 */
export const ADMIN_ENV_KEYS = [
    "CLIENT_TOKEN",
    "CLIENT_ID",
    "CLIENT_SECRET",
    "DEV_CLIENT_TOKEN",
    "DEV_CLIENT_ID",
    "DEV_CLIENT_SECRET",
    "DEV_GUILD_ID",
    "DEV_USER_IDs",
    "DATABASE_HOST",
    "DATABASE_PORT",
    "DATABASE_NAME",
    "DATABASE_POOL_LIMIT",
    "DATABASE_USER",
    "DATABASE_ROOT_PASSWORD",
    "DATABASE_PASSWORD",
    "SERVER_JWT_SECRET",
    "SERVER_PORT",
    "SERVER_PUBLIC_URL",
    "SITE_PUBLIC_URL",
    "ADMIN_INTERNAL_URL",
    "SERVER_JWT_EXPIRES_IN",
    "SERVER_RATE_LIMIT_MAX",
    "SERVER_RATE_LIMIT_WINDOW",
    "GUILD_MEMBER_INTENT",
    "GUILD_PRESENCE_INTENT",
    "PRIME_API_TOKEN",
    "TWITCH_CLIENT_ID",
    "TWITCH_CLIENT_SECRET",
    "YOUTUBE_API_KEY",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "SMTP_FROM",
    "ADMIN_GUILD_ID",
    "ADMIN_ROLE_ID",
    "DEVELOPER_ROLE_ID",
    "SITE_DOMAIN",
    "DASHBOARD_DOMAIN",
    "ADMIN_DOMAIN",
    "WEBSITE_DIR",
    "ADMIN_DIR",
] as const;

/** Ob das Token vom Admin Dashboard kommt. Die Signatur hat der RouteManager vorher geprüft. */
export function HasAdminScope(request: FastifyRequest): boolean {
    return request.token?.scope?.includes(ADMIN_SCOPE) === true;
}

/** Wer hinter dem Token steckt: aus "admin-dashboard:<id>" wird "<id>". */
export function AdminActor(request: FastifyRequest): string {
    const subject = request.token?.sub ?? "unbekannt";

    return subject.startsWith("admin-dashboard:") ? subject.slice("admin-dashboard:".length) : subject;
}
