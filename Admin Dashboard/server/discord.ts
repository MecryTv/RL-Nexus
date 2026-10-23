import type { IConfig } from "./config.ts";

/**
 * Alles, was der Admin-Server bei Discord abfragt.
 *
 * Das Token des Nutzers braucht es nur beim Login, für /users/@me. Danach
 * läuft alles mit dem Bot-Token über die REST-API. Eine Gateway-Sitzung
 * öffnet das nicht, der Bot selbst merkt davon nichts.
 */

export const DISCORD_API = "https://discord.com/api/v10";

/** Discord hat nicht oder nicht wie erwartet geantwortet. */
export class DiscordUnavailable extends Error {}

export interface IDiscordUser {
    readonly id: string;
    readonly username: string;
    readonly global_name?: string | null;
    readonly avatar: string | null;
    readonly mfa_enabled?: boolean;
    /** Nur mit Scope email. */
    readonly email?: string | null;
    readonly verified?: boolean;
}

export interface IDiscordMember {
    readonly nick?: string | null;
    readonly roles: readonly string[];
    readonly user?: IDiscordUser;
}

/** Discords Fehlercodes für „kein Mitglied“ und „Person gibt es nicht“. Jeder andere 404 ist ein Ausfall. */
const UNKNOWN_MEMBER = 10007;
const UNKNOWN_USER = 10013;
const TIMEOUT = 5000;
const MAX_RETRY_WAIT = 5000;

export function callbackUrl(config: IConfig): string {
    return `${config.publicUrl}/api/auth/callback`;
}

/**
 * Der Link zu Discord. Nur identify: die Rollen prüft der Bot-Token, mehr muss
 * der Nutzer nicht freigeben. prompt=none überspringt die Rückfrage, wenn er
 * der Application schon zugestimmt hat.
 */
export function authorizeUrl(config: IConfig, state: string): string {
    const query = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: callbackUrl(config),
        response_type: "code",
        scope: "identify",
        state,
        prompt: "none",
    });

    return `https://discord.com/oauth2/authorize?${query}`;
}

export async function exchangeCode(config: IConfig, code: string): Promise<string> {
    const response = await call(`${DISCORD_API}/oauth2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: config.clientId,
            client_secret: config.clientSecret,
            grant_type: "authorization_code",
            code,
            redirect_uri: callbackUrl(config),
        }),
    });

    if (!response.ok) throw new DiscordUnavailable(`Discord hat den Code abgelehnt (${response.status}).`);

    const token = (await response.json()) as { access_token?: unknown };
    if (typeof token.access_token !== "string") throw new DiscordUnavailable("Discord hat kein Token geschickt.");

    return token.access_token;
}

export async function fetchMe(accessToken: string): Promise<IDiscordUser> {
    const response = await call(`${DISCORD_API}/users/@me`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) throw new DiscordUnavailable(`/users/@me antwortet mit ${response.status}.`);

    return (await response.json()) as IDiscordUser;
}

/** Ein Aufruf mit dem Bot-Token. Zu viele Anfragen: Discord sagt, wie lange. Einmal warten und nachfassen. */
async function botCall(config: IConfig, path: string, init: RequestInit = {}): Promise<Response> {
    const url = `${DISCORD_API}${path}`;
    const request: RequestInit = { ...init, headers: { Authorization: `Bot ${config.botToken}`, ...((init.headers as Record<string, string> | undefined) ?? {}) } };
    const response = await call(url, request);

    if (response.status !== 429) return response;

    await new Promise((resolve) => setTimeout(resolve, retryAfter(response)));

    return call(url, request);
}

function botGet(config: IConfig, path: string): Promise<Response> {
    return botCall(config, path);
}

/** Der Fehlercode im Body einer 404-Antwort. */
async function errorCode(response: Response): Promise<number | undefined> {
    const body = (await response.json().catch(() => ({}))) as { code?: number };

    return body.code;
}

/** null heißt: kein Mitglied des Servers. */
export async function fetchMember(config: IConfig, userId: string): Promise<IDiscordMember | null> {
    const response = await botGet(config, `/guilds/${config.guildId}/members/${userId}`);

    if (response.status === 404) {
        const code = await errorCode(response);
        if (code === UNKNOWN_MEMBER) return null;

        // Etwa 10004 „Unknown Guild“: der Bot sitzt nicht auf dem Server. Das
        // ist ein Ausfall, sonst stünde jeder vor „kein Mitglied“. Im Dev-Modus
        // ist es der häufigste Fehler, deshalb sagt die Meldung dort, welcher
        // Bot gemeint ist.
        throw new DiscordUnavailable(
            config.developerMode
                ? `Discord kennt den Server ${config.guildId} nicht (Code ${code ?? "?"}). Der Dev-Bot muss auf dem Dev Server sein, sonst kann er die Rollen nicht lesen. Server-ID steht in DEV_ADMIN_GUILD_ID.`
                : `Discord kennt den Server nicht (Code ${code ?? "?"}). Ist der Bot noch drauf?`
        );
    }

    if (!response.ok) throw new DiscordUnavailable(`Die Mitgliedsabfrage antwortet mit ${response.status}.`);

    return (await response.json()) as IDiscordMember;
}

/** Ein Discord-Konto per Bot-Token. null heißt: die ID gibt es nicht. */
export async function fetchUser(config: IConfig, userId: string): Promise<IDiscordUser | null> {
    const response = await botGet(config, `/users/${userId}`);

    if (response.status === 404) {
        const code = await errorCode(response);
        if (code === UNKNOWN_USER) return null;

        throw new DiscordUnavailable(`/users antwortet mit 404 (Code ${code ?? "?"}).`);
    }

    if (!response.ok) throw new DiscordUnavailable(`/users antwortet mit ${response.status}.`);

    return (await response.json()) as IDiscordUser;
}

export interface IDiscordRole {
    readonly id: string;
    readonly name: string;
    /** Farbe als Zahl, 0 heißt keine. */
    readonly color: number;
    readonly position: number;
    /** Gehört einem Bot oder einer Integration, lässt sich nicht vergeben. */
    readonly managed: boolean;
    /** Die Rechte als Zahl in Textform, Discord schickt sie so. */
    readonly permissions: string;
}

/** Alle Rollen des Servers aus der Konfiguration (mit --dev der Dev Server). */
export async function fetchRoles(config: IConfig): Promise<IDiscordRole[]> {
    const response = await botGet(config, `/guilds/${config.guildId}/roles`);
    if (!response.ok) throw new DiscordUnavailable(`Die Rollen des Servers antworten mit ${response.status}.`);

    return (await response.json()) as IDiscordRole[];
}

export interface IShopTokens {
    readonly accessToken: string;
    readonly refreshToken: string;
    /** Millisekunden seit 1970. */
    readonly expiresAt: number;
}

/** Discord leitet nach der Anmeldung im Shop hierher, auf die Webseite (nginx reicht es an /public/shop/callback). */
export function shopCallbackUrl(config: IConfig): string {
    return `${config.shopSiteUrl}/api/shop/callback`;
}

/**
 * Der Link zur Anmeldung im Shop. Vier Scopes: wer (identify), die Mail für
 * die Bestätigung (email), ob die Person schon auf dem Server ist (guilds)
 * und das Recht, sie hinzuzufügen (guilds.join). Ohne prompt=none: Beim
 * ersten Mal muss Discord fragen.
 */
export function shopAuthorizeUrl(config: IConfig, state: string): string {
    const query = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: shopCallbackUrl(config),
        response_type: "code",
        scope: "identify email guilds guilds.join",
        state,
    });

    return `https://discord.com/oauth2/authorize?${query}`;
}

async function tokenRequest(config: IConfig, params: Readonly<Record<string, string>>): Promise<IShopTokens> {
    const response = await call(`${DISCORD_API}/oauth2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...params }),
    });

    if (!response.ok) throw new DiscordUnavailable(`Discord hat den Code abgelehnt (${response.status}).`);

    const token = (await response.json()) as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown };
    if (typeof token.access_token !== "string" || typeof token.refresh_token !== "string") throw new DiscordUnavailable("Discord hat kein Token geschickt.");

    const seconds = typeof token.expires_in === "number" ? token.expires_in : 604_800;

    return { accessToken: token.access_token, refreshToken: token.refresh_token, expiresAt: Date.now() + seconds * 1000 };
}

export function exchangeShopCode(config: IConfig, code: string): Promise<IShopTokens> {
    return tokenRequest(config, { grant_type: "authorization_code", code, redirect_uri: shopCallbackUrl(config) });
}

export function refreshShopTokens(config: IConfig, refreshToken: string): Promise<IShopTokens> {
    return tokenRequest(config, { grant_type: "refresh_token", refresh_token: refreshToken });
}

/** Die Server der Person, mit ihrem eigenen Token (Scope guilds). */
export async function userGuildIds(accessToken: string): Promise<string[]> {
    const response = await call(`${DISCORD_API}/users/@me/guilds`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) throw new DiscordUnavailable(`/users/@me/guilds antwortet mit ${response.status}.`);

    return ((await response.json()) as { id: string }[]).map((guild) => guild.id);
}

/** Steht im Audit-Log des Servers bei jeder Änderung durch den Shop. */
const SHOP_REASON = encodeURIComponent("RL Nexus Shop");
const TOO_MANY_GUILDS = 30001;

/** Holt die Person mit ihrem Token auf den Server. "added": neu dabei, "already": war schon Mitglied. */
export async function addGuildMember(config: IConfig, userId: string, accessToken: string): Promise<"added" | "already"> {
    const response = await botCall(config, `/guilds/${config.guildId}/members/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Audit-Log-Reason": SHOP_REASON },
        body: JSON.stringify({ access_token: accessToken }),
    });

    if (response.status === 201) return "added";
    if (response.status === 204) return "already";

    const code = await errorCode(response);

    throw new DiscordUnavailable(
        code === TOO_MANY_GUILDS
            ? "Die Person ist schon auf 100 Servern, Discord lässt keinen weiteren zu."
            : `Der Beitritt zum Server antwortet mit ${response.status} (Code ${code ?? "?"}). Darf der Bot „Einladung erstellen“?`
    );
}

/** Gibt oder nimmt eine Rolle. Nehmen bei jemandem, der nicht mehr da ist, ist kein Fehler. */
export async function setMemberRole(config: IConfig, userId: string, roleId: string, on: boolean): Promise<void> {
    const response = await botCall(config, `/guilds/${config.guildId}/members/${userId}/roles/${roleId}`, {
        method: on ? "PUT" : "DELETE",
        headers: { "X-Audit-Log-Reason": SHOP_REASON },
    });

    if (response.status === 204) return;
    if (!on && response.status === 404) return;

    const code = await errorCode(response);

    throw new DiscordUnavailable(
        `Die Rolle ${roleId} ließ sich nicht ${on ? "vergeben" : "entfernen"} (${response.status}, Code ${code ?? "?"}). Steht die Rolle des Bots über der Shop-Rolle, und darf er „Rollen verwalten“?`
    );
}

export function avatarUrl(userId: string, hash: string | null | undefined): string | null {
    return hash ? `https://cdn.discordapp.com/avatars/${userId}/${hash}.png?size=64` : null;
}

/** Nickname auf dem Server vor globalem Anzeigenamen vor Benutzername. */
export function displayName(user: IDiscordUser, nick?: string | null): string {
    return nick?.trim() || user.global_name?.trim() || user.username;
}

export interface IDiscordFile {
    readonly name: string;
    readonly data: Buffer;
    readonly type: string;
}

/** Discords Fehlercode für „nimmt keine DMs an“ (DMs zu oder kein gemeinsamer Server). */
const CANNOT_DM = 50007;

/**
 * Eine Direktnachricht vom Bot, Dateien als Anhang (im Inhalt als
 * attachment://name). null heißt angekommen, sonst der Grund. Wirft nie:
 * Die DM ist eine Zugabe und darf nichts davor aufhalten.
 */
export async function sendDirectMessage(
    config: IConfig,
    userId: string,
    message: Readonly<Record<string, unknown>>,
    files: readonly IDiscordFile[] = []
): Promise<string | null> {
    try {
        const channel = await botCall(config, "/users/@me/channels", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ recipient_id: userId }),
        });
        if (!channel.ok) return await refusal(channel);

        const { id } = (await channel.json()) as { id: string };
        const form = new FormData();
        form.set("payload_json", JSON.stringify({ ...message, attachments: files.map((file, index) => ({ id: index, filename: file.name })) }));
        files.forEach((file, index) => form.set(`files[${index}]`, new Blob([Uint8Array.from(file.data)], { type: file.type }), file.name));

        // Kein Content-Type: fetch setzt ihn samt Grenze selbst. Das FormData lässt sich für den zweiten Versuch nach 429 wiederverwenden.
        const sent = await botCall(config, `/channels/${id}/messages`, { method: "POST", body: form });

        return sent.ok ? null : await refusal(sent);
    } catch (error) {
        return error instanceof Error ? error.message : String(error);
    }
}

async function refusal(response: Response): Promise<string> {
    const code = (await response.json().catch(() => ({})) as { code?: number }).code;

    return code === CANNOT_DM ? "Die Person nimmt keine Direktnachrichten vom Bot an." : `Discord antwortet mit ${response.status} (Code ${code ?? "?"}).`;
}

async function call(url: string, init: RequestInit): Promise<Response> {
    try {
        return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT) });
    } catch (error) {
        throw new DiscordUnavailable(`Discord ist nicht erreichbar: ${error instanceof Error ? error.message : String(error)}`);
    }
}

function retryAfter(response: Response): number {
    const seconds = Number(response.headers.get("retry-after") ?? 1);

    return Number.isFinite(seconds) ? Math.min(Math.max(0, Math.ceil(seconds * 1000)), MAX_RETRY_WAIT) : 1000;
}
